// =============================================
// POST /api/webhooks/shopify/bulk-finish
//
// Shopify pings this URL when a bulk_operations/finish event fires
// (registered against the topic 'bulk_operations/finish'). Body
// contains the admin_graphql_api_id of the completed operation. We
// look up the matching shopify_import_jobs row by that id, pull the
// status query to grab the JSONL file URL, and stream it into
// shopify_orders.
//
// HMAC verification mirrors the pattern in /api/webhooks/shopify
// (shared header X-Shopify-Hmac-Sha256, secret = SHOPIFY_API_SECRET).
//
// IMPORTANT: respond 200 within 5 seconds or Shopify retries 19
// times. We acknowledge immediately and kick off the JSONL drain
// inside an awaiting Promise that runs on a fresh tick — Vercel keeps
// the function warm for up to maxDuration seconds even after the
// response is sent.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCurrentBulkOperation } from '@/lib/services/shopify/bulk-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function verifyHmac(rawBody: string, hmacHeader: string | null): boolean {
  if (!hmacHeader) return false;
  const secret = process.env.SHOPIFY_API_SECRET || '';
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  // timingSafeEqual requires equal-length buffers
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(hmacHeader);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const hmac = req.headers.get('X-Shopify-Hmac-Sha256') || req.headers.get('x-shopify-hmac-sha256');
  const shopDomain = req.headers.get('X-Shopify-Shop-Domain') || req.headers.get('x-shopify-shop-domain');

  if (!verifyHmac(raw, hmac)) {
    return NextResponse.json({ error: 'invalid hmac' }, { status: 401 });
  }

  let body: any = {};
  try { body = JSON.parse(raw); } catch { /* empty */ }

  const adminId: string | undefined = body?.admin_graphql_api_id;
  const status: string | undefined = body?.status;

  if (!adminId) {
    return NextResponse.json({ received: true, ignored: 'no admin_graphql_api_id' });
  }

  // Look up the store by shop_domain. The webhook header is the
  // canonical identifier; the store row's access_token is what we use
  // to download the JSONL.
  const { data: store } = await supabaseAdmin
    .from('shopify_stores')
    .select('id, organization_id, shop_domain, access_token')
    .eq('shop_domain', shopDomain || '')
    .maybeSingle();

  if (!store || !store.access_token) {
    console.warn('[BulkFinish] no store match for', shopDomain);
    return NextResponse.json({ received: true, ignored: 'store not found' });
  }

  const { data: job } = await supabaseAdmin
    .from('shopify_import_jobs')
    .select('id, config, status')
    .eq('store_id', store.id)
    .contains('config', { sync_type: 'orders_bulk', bulk_operation_id: adminId })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job) {
    console.warn('[BulkFinish] no job row for bulk op', adminId);
    return NextResponse.json({ received: true, ignored: 'job not found' });
  }

  if (status && status !== 'completed') {
    await supabaseAdmin
      .from('shopify_import_jobs')
      .update({
        status: status === 'failed' ? 'failed' : 'paused',
        last_error: status,
        last_processed_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    return NextResponse.json({ received: true, status });
  }

  // Fetch the JSONL URL from Shopify (the webhook payload doesn't
  // include it — we have to re-query the currentBulkOperation).
  const storeConfig = {
    id: store.id,
    organization_id: store.organization_id,
    shop_domain: store.shop_domain,
    access_token: store.access_token,
  };
  const op = await getCurrentBulkOperation(storeConfig);
  if (!op?.url) {
    await supabaseAdmin
      .from('shopify_import_jobs')
      .update({ status: 'failed', last_error: 'no_jsonl_url' })
      .eq('id', job.id);
    return NextResponse.json({ received: true, ignored: 'no jsonl url' });
  }

  // Persist the URL + reset progress markers, then delegate the
  // actual drain to /api/workers/shopify-bulk-drain. The webhook
  // itself has to ack Shopify within 5s (or they retry 19 times) —
  // and the drain can take 5+ minutes on huge stores. Splitting
  // keeps us responsive AND makes the drain self-chainable: each
  // 240s invocation saves lines_processed, fires the next worker
  // POST via keepalive fetch, and the merchant's 100k / 1M-order
  // store finishes draining over multiple invocations without any
  // intervention.
  const existingCfg = (job.config as any) || {};
  await supabaseAdmin
    .from('shopify_import_jobs')
    .update({
      status: 'pending',
      config: {
        ...existingCfg,
        bulk_jsonl_url: op.url,
        lines_processed: existingCfg.lines_processed || 0,
      },
      last_processed_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || '';
  const drainUrl = baseUrl.startsWith('http')
    ? `${baseUrl}/api/workers/shopify-bulk-drain`
    : `https://${baseUrl}/api/workers/shopify-bulk-drain`;
  // Fire-and-forget. The drain endpoint validates CRON_SECRET, so
  // the same secret has to be set on both sides. keepalive=true
  // ensures the request survives this function returning.
  fetch(drainUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CRON_SECRET || ''}`,
    },
    body: JSON.stringify({ jobId: job.id }),
    keepalive: true,
  }).catch((err) => {
    console.warn('[BulkFinish] drain dispatch failed (cron will pick it up):', err?.message);
  });

  return NextResponse.json({
    received: true,
    jobId: job.id,
    mode: 'drain-dispatched',
  });
}
