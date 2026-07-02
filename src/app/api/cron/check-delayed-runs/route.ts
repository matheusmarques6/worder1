/**
 * API: Check Delayed Runs
 * Cron job para verificar runs que estão esperando (delay) e devem ser retomados
 * 
 * GET /api/cron/check-delayed-runs (chamado pelo Vercel Cron)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { enqueueAutomationRun } from '@/lib/queue';
import { getAuthClient } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// ============================================
// CONFIG
// ============================================

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ============================================
// GET - Check delayed runs (Cron)
// ============================================

export async function GET(request: NextRequest) {
  const supabase = getSupabase();

  // Verificar autorização
  // X-Internal-Request removed from the authorize check: client-settable
  // and not stripped by Vercel, so it was spoofable. Only Vercel Cron,
  // Bearer CRON_SECRET, or dev. (The outbound fetch to the worker below
  // still sends X-Internal-Request — that's the worker's own auth.)
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isDev = process.env.NODE_ENV === 'development';

  // Also allow a real authenticated session: the "Forçar retomada" button in
  // the flow builder (Toolbar.tsx) does a same-origin POST → GET. Removing the
  // spoofable X-Internal-Request header closed the hole; an authenticated user
  // triggering their own delayed-run sweep is legitimate.
  const auth = await getAuthClient();

  const isAuthorized = isDev || isVercelCron || !!auth ||
    (cronSecret && authHeader === `Bearer ${cronSecret}`);

  if (!isAuthorized) {
    console.log('[Check Delayed] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[Check Delayed] Starting check (Vercel Cron:', isVercelCron, ')');

  try {
    const now = new Date().toISOString();

    // Buscar runs que estão em 'waiting' e já passaram do tempo
    // JUNTO com a automação para verificar status
    const supabase = getSupabase();
    // ORDER BY waiting_until ASC: sem ordenação, o LIMIT pegava um subconjunto
    // arbitrário e, sob backlog sustentado (> throughput), alguns runs eram
    // adiados indefinidamente (starvation) em vez de apenas atrasados. Ordenar
    // pelos mais vencidos garante FIFO. Limite elevado de 50→200 (o dispatch é
    // paralelo via Promise.allSettled) para dar vazão em volume alto.
    const { data: runs, error } = await supabase
      .from('automation_runs')
      .select('id, automation_id, current_node_id, waiting_until, automations!inner(id, status)')
      .eq('status', 'waiting')
      .lte('waiting_until', now)
      .order('waiting_until', { ascending: true })
      .limit(200);

    if (error) {
      console.error('[Check Delayed] Error fetching runs:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!runs || runs.length === 0) {
      return NextResponse.json({
        message: 'No delayed runs to process',
        checked: 0,
        enqueued: 0,
        cancelled: 0,
      });
    }

    console.log(`[Check Delayed] Found ${runs.length} runs to check`);

    let enqueued = 0;
    let cancelled = 0;
    const errors: string[] = [];

    // Parallelise the dispatch loop. QStash publishes used to be
    // awaited sequentially, so 50 delayed runs × ~1s QStash latency
    // alone added up to 50s of wallclock time even before the worker
    // started executing anything. Promise.allSettled keeps the cron
    // resilient — one bad run can't take down the rest — while still
    // letting QStash absorb 50 publishes in parallel.
    //
    // When QStash itself is misconfigured (expired token), the
    // sequential path used to throw and leave the run rotting in
    // 'pending' forever because the fallback only triggered on
    // messageId === null, never on thrown errors. We now treat any
    // QStash failure as "fall through to a direct fetch so the
    // worker still picks it up" — the run survives an Upstash
    // outage / rotation window without manual intervention.
    const { getAppBaseUrl } = await import('@/lib/app-url');
    const workerUrl = `${getAppBaseUrl()}/api/workers/automation`;
    const dispatchRun = async (run: any) => {
      try {
        const automation = (run as any).automations;
        if (automation?.status !== 'active') {
          console.log(`[Check Delayed] Automation ${run.automation_id} is not active, cancelling run ${run.id}`);
          await supabase
            .from('automation_runs')
            .update({
              status: 'cancelled',
              waiting_until: null,
              completed_at: new Date().toISOString(),
              last_error: `Automação desativada (status: ${automation?.status})`,
            })
            .eq('id', run.id);
          cancelled++;
          return;
        }

        await supabase
          .from('automation_runs')
          .update({ status: 'pending', waiting_until: null })
          .eq('id', run.id);

        let messageId: string | null = null;
        try {
          messageId = await enqueueAutomationRun(run.id);
        } catch (qErr: any) {
          console.warn(`[Check Delayed] QStash publish failed for ${run.id}, falling back to direct fetch:`, qErr?.message || qErr);
        }

        if (messageId) {
          enqueued++;
          console.log(`[Check Delayed] Enqueued run ${run.id}`);
          return;
        }

        // Direct-fetch fallback. Fire-and-forget so a slow worker
        // can't gum up the cron — process-runs / reclaim-stale-runs
        // pick up anything that doesn't complete on this trip.
        fetch(workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Internal-Request': 'true' },
          body: JSON.stringify({ action: 'execute_run', runId: run.id }),
        }).catch((fetchErr) => {
          console.warn(`[Check Delayed] direct fetch failed for ${run.id}:`, fetchErr?.message || fetchErr);
        });
        enqueued++;
      } catch (err: any) {
        console.error(`[Check Delayed] Error processing run ${run.id}:`, err);
        errors.push(`${run.id}: ${err.message}`);
      }
    };

    await Promise.allSettled(runs.map(dispatchRun));

    return NextResponse.json({
      message: 'Delayed runs checked',
      checked: runs.length,
      enqueued,
      cancelled,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: now,
    });

  } catch (error: any) {
    console.error('[Check Delayed] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================
// POST - Manual trigger
// ============================================

export async function POST(request: NextRequest) {
  // Mesma lógica do GET
  return GET(request);
}
