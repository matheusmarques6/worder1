// =============================================
// POST /api/shopify/bulk-sync
//
// Kicks off a Shopify Bulk Operation to export every order of a
// store. Returns immediately with a jobId — the actual ingest
// happens later when Shopify pings /api/webhooks/shopify/bulk-finish
// with the JSONL file URL.
//
// Use this instead of the live pager for first-time syncs or any
// time you need every order. No rate-limit budget consumed; no
// Vercel 300s timeout risk; works at 100k+ order scale.
//
// Body: { storeId: string }
// Returns: { jobId, bulkOperationId, status }
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { startOrdersBulkExport, getCurrentBulkOperation } from '@/lib/services/shopify/bulk-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();

  try {
    const body = await req.json().catch(() => ({}));
    const storeId: string | null = body?.storeId || null;
    if (!storeId) {
      return NextResponse.json({ error: 'storeId required' }, { status: 400 });
    }

    const { data: store } = await supabaseAdmin
      .from('shopify_stores')
      .select('id, organization_id, shop_domain, access_token')
      .eq('id', storeId)
      .eq('organization_id', auth.user.organization_id)
      .maybeSingle();

    if (!store || !store.access_token) {
      return NextResponse.json({ error: 'Store not found or missing token' }, { status: 404 });
    }

    const storeConfig = {
      id: store.id,
      organization_id: store.organization_id,
      shop_domain: store.shop_domain,
      access_token: store.access_token,
    };

    // Shopify only allows one bulk operation per shop at a time. If
    // there's already one running we surface it instead of failing —
    // the merchant clicked "Sincronizar tudo" again and our existing
    // job is fine, we just need to report back.
    const current = await getCurrentBulkOperation(storeConfig);
    if (current && (current.status === 'RUNNING' || current.status === 'CREATED')) {
      // Find or create our matching shopify_import_jobs row.
      const { data: existingJob } = await supabaseAdmin
        .from('shopify_import_jobs')
        .select('id')
        .eq('store_id', store.id)
        .contains('config', { sync_type: 'orders_bulk', bulk_operation_id: current.id })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return NextResponse.json({
        jobId: existingJob?.id || null,
        bulkOperationId: current.id,
        status: current.status,
        message: 'A bulk export is already running for this shop. Reusing it.',
      });
    }

    // Submit a fresh bulk operation. From here Shopify works async —
    // it'll ping the bulk_operations/finish webhook (registered by
    // install-extras) when the JSONL is ready.
    const result = await startOrdersBulkExport(storeConfig);
    if (!result.bulkOperation) {
      return NextResponse.json(
        { error: result.error || 'Failed to start bulk export' },
        { status: 502 }
      );
    }

    // Create our tracking row. processed_count goes up as the webhook
    // worker drains the JSONL; status flips to 'completed' on the last
    // batch.
    const { data: job } = await supabaseAdmin
      .from('shopify_import_jobs')
      .insert({
        store_id: store.id,
        organization_id: store.organization_id,
        status: 'pending',
        config: {
          sync_type: 'orders_bulk',
          bulk_operation_id: result.bulkOperation.id,
        },
        started_at: new Date().toISOString(),
        processed_count: 0,
      })
      .select('id')
      .single();

    return NextResponse.json({
      jobId: job?.id || null,
      bulkOperationId: result.bulkOperation.id,
      status: result.bulkOperation.status,
    });
  } catch (err: any) {
    console.error('[BulkSync] Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
