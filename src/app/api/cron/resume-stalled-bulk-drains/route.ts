// =============================================
// GET /api/cron/resume-stalled-bulk-drains
//
// Safety net for the self-chaining bulk-drain worker. The drain
// fires the next invocation via `fetch(... keepalive: true)` and
// 99% of the time that succeeds. But cold-start hiccups, DNS
// blips, or a redeploy mid-chain can drop the continuation —
// leaving a perfectly resumable shopify_import_jobs row sitting
// 'paused' forever with no one to wake it up.
//
// This cron looks for those orphans every 2 minutes and re-fires
// the drain worker. The drain itself is idempotent on
// (jobId, lines_processed) so a double-fire never corrupts data.
//
// Picks up:
//   - status='paused' OR 'running' AND last_processed_at older
//     than STALL_THRESHOLD_MS (= longer than one drain window)
//   - sync_type='orders_bulk' (don't touch cursor jobs — those
//     resume on next merchant click)
//   - has bulk_jsonl_url on config (otherwise nothing to drain)
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STALL_THRESHOLD_MS = 300_000; // 5 minutes
const MAX_BATCH = 20; // per cron tick, generous — stalled bulk drains should be rare

function verifyCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') || '';
  if (auth === `Bearer ${secret}`) return true;
  const param = new URL(req.url).searchParams.get('secret');
  return param === secret;
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const cutoffIso = new Date(Date.now() - STALL_THRESHOLD_MS).toISOString();

  const { data: stalled, error } = await supabaseAdmin
    .from('shopify_import_jobs')
    .select('id, status, config, last_processed_at, started_at')
    .in('status', ['paused', 'running'])
    .contains('config', { sync_type: 'orders_bulk' })
    .or(`last_processed_at.lt.${cutoffIso},last_processed_at.is.null`)
    .order('started_at', { ascending: true })
    .limit(MAX_BATCH);

  if (error) {
    console.error('[ResumeStalledBulk] query failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!stalled || stalled.length === 0) {
    return NextResponse.json({ ok: true, resumed: 0 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || '';
  const drainUrl = baseUrl.startsWith('http')
    ? `${baseUrl}/api/workers/shopify-bulk-drain`
    : `https://${baseUrl}/api/workers/shopify-bulk-drain`;

  const resumed: string[] = [];
  for (const job of stalled) {
    const cfg = (job.config as any) || {};
    if (!cfg.bulk_jsonl_url) continue;

    // Fire-and-forget. The worker validates secret + idempotency,
    // so a duplicate fire from cron + a slow recovered keepalive
    // is safe.
    fetch(drainUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CRON_SECRET || ''}`,
      },
      body: JSON.stringify({ jobId: job.id }),
      keepalive: true,
    }).catch((err) => {
      console.warn(`[ResumeStalledBulk] dispatch ${job.id} failed:`, err?.message);
    });
    resumed.push(job.id);
  }

  return NextResponse.json({ ok: true, resumed: resumed.length, jobs: resumed });
}
