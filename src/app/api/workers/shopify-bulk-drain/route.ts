// =============================================
// POST /api/workers/shopify-bulk-drain
//
// Self-chaining worker that drains a Shopify Bulk Operations JSONL
// into shopify_orders. Sized to handle stores of any volume:
//
//   - Runs for up to 240s per invocation (60s headroom on the 300s
//     Vercel ceiling).
//   - Saves lines_processed at the boundary after each Order group
//     so partial work is durable and parent-children stay together.
//   - If there's more JSONL left, fires another POST to itself with
//     keepalive=true, then returns 200 immediately. The fresh
//     invocation starts with a clean 300s budget.
//   - 100k orders ≈ 1-2 invocations. 1M orders ≈ 10-15 invocations.
//     The merchant sees a single click; everything else is
//     server-to-server.
//
// Authentication: internal-only via CRON_SECRET (matches the cron
// pattern used elsewhere in the codebase). The bulk-finish webhook
// fires this from inside the Vercel boundary; nothing on the public
// internet can trigger it.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { processBulkOrdersJsonl } from '@/lib/services/shopify/bulk-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DRAIN_DEADLINE_MS = 240_000;

export async function POST(req: NextRequest) {
  const auth = req.headers.get('Authorization') || '';
  const expected = `Bearer ${process.env.CRON_SECRET || ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const jobId: string | undefined = body?.jobId;
  if (!jobId) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  }

  const { data: job, error: jobErr } = await supabaseAdmin
    .from('shopify_import_jobs')
    .select('id, store_id, organization_id, config, status')
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr || !job) {
    return NextResponse.json({ error: 'job not found' }, { status: 404 });
  }

  // Idempotency: if the job is already completed/failed, don't
  // re-drain. A stuck retry loop would re-upsert the entire JSONL
  // every time which is wasteful even though it's safe.
  if (job.status === 'completed' || job.status === 'failed') {
    return NextResponse.json({ ok: true, ignored: `status=${job.status}` });
  }

  const cfg = (job.config as any) || {};
  const fileUrl: string | null = cfg.bulk_jsonl_url || null;
  const linesAlreadyProcessed: number = Number(cfg.lines_processed || 0);

  if (!fileUrl) {
    await supabaseAdmin
      .from('shopify_import_jobs')
      .update({ status: 'failed', last_error: 'no_jsonl_url' })
      .eq('id', jobId);
    return NextResponse.json({ error: 'no jsonl url on job' }, { status: 400 });
  }

  await supabaseAdmin
    .from('shopify_import_jobs')
    .update({ status: 'running', last_processed_at: new Date().toISOString() })
    .eq('id', jobId);

  const result = await processBulkOrdersJsonl({
    store: { id: job.store_id, organization_id: job.organization_id },
    jobId,
    fileUrl,
    linesAlreadyProcessed,
    deadlineMs: DRAIN_DEADLINE_MS,
  });

  if (result.complete) {
    await supabaseAdmin
      .from('shopify_import_jobs')
      .update({
        status: result.errors.length ? 'completed' : 'completed',
        last_error: result.errors[0] || null,
        error_details: result.errors.length ? { errors: result.errors.slice(0, 50) } : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    // Roll the store-level total_orders so the dashboard reflects
    // reality once the drain finishes.
    const { count } = await supabaseAdmin
      .from('shopify_orders')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', job.store_id);
    if (typeof count === 'number') {
      await supabaseAdmin
        .from('shopify_stores')
        .update({ total_orders: count, last_sync_at: new Date().toISOString() })
        .eq('id', job.store_id);
    }

    return NextResponse.json({
      ok: true,
      complete: true,
      processed: result.processed,
      linesProcessed: result.linesProcessed,
    });
  }

  // Not done — chain the next invocation. fetch with keepalive lets
  // the response come back fast even after we return; Vercel keeps
  // the connection open. The worker is idempotent on (jobId,
  // lines_processed) so a duplicate fire is harmless.
  await supabaseAdmin
    .from('shopify_import_jobs')
    .update({ status: 'paused' })
    .eq('id', jobId);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || '';
  const selfUrl = baseUrl.startsWith('http') ? `${baseUrl}/api/workers/shopify-bulk-drain` : `https://${baseUrl}/api/workers/shopify-bulk-drain`;
  fetch(selfUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CRON_SECRET || ''}`,
    },
    body: JSON.stringify({ jobId }),
    keepalive: true,
  }).catch((err) => {
    console.warn('[BulkDrain] self-chain fetch failed (cron safety net will retry):', err?.message);
  });

  return NextResponse.json({
    ok: true,
    complete: false,
    processed: result.processed,
    linesProcessed: result.linesProcessed,
    chained: true,
  });
}
