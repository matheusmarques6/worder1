// =============================================
// GET /api/cron/resume-stalled-bulk-drains
//
// Two safety nets in one cron:
//
// 1. status='pending' bulk jobs that the bulk-finish webhook never
//    fired for. The merchant clicks Sincronizar Tudo → we submit the
//    bulk op to Shopify and create a `pending` shopify_import_jobs
//    row. Shopify is supposed to ping /api/webhooks/shopify/
//    bulk-finish when done, which saves the JSONL URL and starts the
//    drain. But: webhook subscription may not be installed, the ping
//    may have failed HMAC, the redeploy moved the URL, etc. Without
//    this safety net the bulk job sits 'pending' forever.
//    Fix: poll Shopify's currentBulkOperation directly when a pending
//    bulk job is older than 90s. If completed, save the URL and fire
//    the drain. Same effect as the webhook landing.
//
// 2. status='paused' or 'running' jobs whose self-chain keepalive
//    fetch was dropped. The drain worker self-schedules its own
//    continuation; if that fetch dies (cold start, DNS, redeploy mid-
//    chain), the cron picks it up after 5 min and re-fires.
//
// Drain is idempotent on (jobId, lines_processed) so duplicate fires
// from any of these paths are safe.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getCurrentBulkOperation } from '@/lib/services/shopify/bulk-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STALL_THRESHOLD_MS = 300_000; // 5 minutes for paused/running
const PENDING_THRESHOLD_MS = 90_000; // 1.5 min before we poll a pending bulk
const MAX_BATCH = 20;

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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || '';
  const drainUrl = baseUrl.startsWith('http')
    ? `${baseUrl}/api/workers/shopify-bulk-drain`
    : `https://${baseUrl}/api/workers/shopify-bulk-drain`;

  const fireDrain = (jobId: string) => {
    fetch(drainUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CRON_SECRET || ''}`,
      },
      body: JSON.stringify({ jobId }),
      keepalive: true,
    }).catch((err) => {
      console.warn(`[ResumeStalledBulk] dispatch ${jobId} failed:`, err?.message);
    });
  };

  // ====== PATH 1: pending jobs whose webhook never fired ======
  // For these we have to ASK Shopify for the JSONL URL ourselves.
  const pendingCutoff = new Date(Date.now() - PENDING_THRESHOLD_MS).toISOString();
  const { data: pending } = await supabaseAdmin
    .from('shopify_import_jobs')
    .select('id, store_id, organization_id, config, started_at')
    .eq('status', 'pending')
    .contains('config', { sync_type: 'orders_bulk' })
    .lt('started_at', pendingCutoff)
    .order('started_at', { ascending: true })
    .limit(MAX_BATCH);

  const polledOk: string[] = [];
  const polledStillRunning: string[] = [];
  const polledFailed: string[] = [];

  for (const job of pending || []) {
    const cfg = (job.config as any) || {};
    // If we already have a JSONL URL, the webhook DID land — just
    // refire the drain (covered by Path 2 below if it stalled).
    if (cfg.bulk_jsonl_url) {
      fireDrain(job.id);
      polledOk.push(job.id);
      continue;
    }

    // Otherwise hit Shopify for the operation status.
    const { data: store } = await supabaseAdmin
      .from('shopify_stores')
      .select('id, organization_id, shop_domain, access_token')
      .eq('id', job.store_id)
      .maybeSingle();
    if (!store?.access_token) continue;

    try {
      const op = await getCurrentBulkOperation(
        {
          id: store.id,
          organization_id: store.organization_id,
          shop_domain: store.shop_domain,
          access_token: store.access_token,
        },
        { throwOnAuthError: true }
      );

      if (!op) continue;

      if (op.status === 'COMPLETED' && op.url) {
        // Save the URL onto the job and fire the drain — same shape
        // the bulk-finish webhook produces.
        await supabaseAdmin
          .from('shopify_import_jobs')
          .update({
            status: 'pending',
            config: {
              ...cfg,
              bulk_jsonl_url: op.url,
              lines_processed: cfg.lines_processed || 0,
            },
            last_processed_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        fireDrain(job.id);
        polledOk.push(job.id);
      } else if (op.status === 'FAILED' || op.status === 'CANCELED' || op.status === 'EXPIRED') {
        await supabaseAdmin
          .from('shopify_import_jobs')
          .update({
            status: 'failed',
            last_error: `bulk op ${op.status.toLowerCase()}: ${op.errorCode || 'no error code'}`,
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        polledFailed.push(job.id);
      } else {
        // CREATED or RUNNING — Shopify still working on it. Leave
        // pending; we'll poll again next tick.
        polledStillRunning.push(job.id);
      }
    } catch (err: any) {
      // 401/403 from Shopify is permanent (token revoked / app
      // uninstalled) — the job can never complete, and leaving it
      // 'pending' means this cron re-polls the same dead store every
      // 2 minutes forever. Fail the job and flag the store with the
      // same status the health-checker writes, so the UI asks the
      // merchant to reconnect.
      const authStatus =
        err?.statusCode === 401 || err?.statusCode === 403 ? err.statusCode : null;
      if (authStatus) {
        await supabaseAdmin
          .from('shopify_import_jobs')
          .update({
            status: 'failed',
            last_error: `shopify auth ${authStatus}: access token inválido ou app desinstalado`,
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        await supabaseAdmin
          .from('shopify_stores')
          .update({
            connection_status: authStatus === 401 ? 'expired' : 'error',
            status_code: String(authStatus),
            status_message:
              authStatus === 401
                ? 'Token de acesso expirado ou inválido. Gere um novo token no painel do Shopify.'
                : 'Acesso negado. O app pode ter sido desinstalado ou as permissões foram revogadas.',
            health_checked_at: new Date().toISOString(),
          })
          .eq('id', store.id);
        polledFailed.push(job.id);
        console.warn(
          `[ResumeStalledBulk] job ${job.id} failed permanently: shopify auth ${authStatus} (${store.shop_domain})`
        );
      } else {
        console.warn(`[ResumeStalledBulk] poll ${job.id} failed:`, err?.message);
      }
    }
  }

  // ====== PATH 2: paused/running jobs whose self-chain dropped ======
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
  }

  const resumed: string[] = [];
  for (const job of stalled || []) {
    const cfg = (job.config as any) || {};
    if (!cfg.bulk_jsonl_url) continue;
    fireDrain(job.id);
    resumed.push(job.id);
  }

  return NextResponse.json({
    ok: true,
    pendingPolled: pending?.length || 0,
    polledOk: polledOk.length,
    polledStillRunning: polledStillRunning.length,
    polledFailed: polledFailed.length,
    stalledResumed: resumed.length,
    resumedJobs: resumed,
  });
}
