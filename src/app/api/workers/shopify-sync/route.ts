// =============================================
// POST /api/workers/shopify-sync
//
// QStash worker for background Shopify syncs. The /api/shopify/sync-now
// endpoint pushes a message here so the merchant's browser doesn't sit
// on a 5-minute HTTP request. This worker has the full 300s Vercel
// cap and persists progress to shopify_import_jobs so the UI can poll.
//
// If a sync hits the wall clock without finishing every page, the
// resume cursor is persisted and a follow-up QStash message is sent
// — chaining lets us walk arbitrary connection sizes without ever
// exceeding the per-invocation limit.
//
// Body (from enqueueShopifySync):
//   { type, data: { jobId, storeId, syncType, historical, resumeCursor } }
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyQStashSignature, enqueueShopifySync } from '@/lib/queue';
import { runFullSyncGraphQL } from '@/lib/services/shopify/full-sync-graphql';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface SyncJobPayload {
  jobId?: string;
  storeId: string;
  syncType: 'orders' | 'customers' | 'products' | 'all' | 'orders_bulk_resume';
  historical?: boolean;
  resumeCursor?: string | null;
}

export async function POST(request: NextRequest) {
  // Same auth shape as /api/workers/automation — QStash signature or
  // internal request header. Lets us call the worker directly during
  // local dev without QStash configured.
  const hasQStashSig = request.headers.has('upstash-signature');
  const isInternal = request.headers.get('X-Internal-Request') === 'true';
  if (hasQStashSig) {
    const { isValid } = await verifyQStashSignature(request.clone());
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  } else if (!isInternal) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => ({} as any));
  const data: SyncJobPayload = body?.data || body;
  if (!data?.storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const { data: store } = await supabaseAdmin
    .from('shopify_stores')
    .select('*')
    .eq('id', data.storeId)
    .maybeSingle();

  if (!store || !store.access_token) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  // Update job to running so the UI shows progress immediately.
  if (data.jobId) {
    await supabaseAdmin
      .from('shopify_import_jobs')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        last_processed_at: new Date().toISOString(),
      })
      .eq('id', data.jobId);
  }

  try {
    // runFullSyncGraphQL handles its own internal checkpointing via
    // shopify_import_jobs.last_cursor. We just hand off the historical
    // flag and let it do the right thing.
    const result = await runFullSyncGraphQL(
      {
        id: store.id,
        organization_id: store.organization_id,
        shop_domain: store.shop_domain,
        access_token: store.access_token,
      } as any,
      {
        syncOrders: data.syncType === 'all' || data.syncType === 'orders',
        syncCustomers: data.syncType === 'all' || data.syncType === 'customers',
        syncProducts: data.syncType === 'all' || data.syncType === 'products',
        ordersHistorical: data.historical === true,
      }
    );

    // If syncOrdersGraphQL paused at the deadline it persisted the
    // resume cursor and left the job row in 'paused' state. Chain a
    // follow-up QStash message so the next slice of the connection
    // gets walked without merchant intervention.
    const ordersJob = data.jobId ? await supabaseAdmin
      .from('shopify_import_jobs')
      .select('id, status, last_cursor')
      .eq('id', data.jobId)
      .maybeSingle() : { data: null };

    if (ordersJob.data?.status === 'paused' && ordersJob.data.last_cursor) {
      console.log(`[ShopifyWorker] Job ${data.jobId} paused at cursor — enqueueing continuation`);
      await enqueueShopifySync(data.jobId!, data.storeId, data.syncType, {
        historical: data.historical,
        resumeCursor: ordersJob.data.last_cursor,
        delay: 5,
      });
    }

    return NextResponse.json({
      ok: true,
      jobId: data.jobId,
      ordersCount: result.ordersCount,
      customersCount: result.customersCount,
      productsCount: result.productsCount,
      chained: ordersJob.data?.status === 'paused',
    });
  } catch (err: any) {
    console.error('[ShopifyWorker] Error:', err);
    if (data.jobId) {
      await supabaseAdmin
        .from('shopify_import_jobs')
        .update({
          status: 'failed',
          last_error: err?.message?.slice(0, 500) || 'unknown',
          completed_at: new Date().toISOString(),
        })
        .eq('id', data.jobId);
    }
    return NextResponse.json({ error: err?.message || 'sync failed' }, { status: 500 });
  }
}
