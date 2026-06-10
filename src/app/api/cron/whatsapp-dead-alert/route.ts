import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { campaignQueue } from '@/lib/whatsapp/queue';
import { getWorkerHeartbeatAgeMs, evaluateWorkerHealth } from '@/lib/whatsapp/worker-heartbeat';
import { sendAlert } from '@/lib/whatsapp/alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function authorize(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  return process.env.NODE_ENV !== 'production';
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 1. Call RPC to get summary of dead/failed webhook events in last 15 minutes
  const { data: summary, error } = await supabaseAdmin.rpc(
    'dead_whatsapp_events_summary',
    { p_since: '15 minutes' }
  );

  if (error) {
    console.error('[dead-alert] RPC error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!summary || summary.length === 0) {
    // P0 — saúde do campaign worker (Railway): fila com pending antigo +
    // heartbeat ausente => worker morto/travado.
    let workerHealth: any = { healthy: true };
    try {
      const [stats, oldestPendingAgeMs, heartbeatAgeMs] = await Promise.all([
        campaignQueue.getStats(),
        campaignQueue.getOldestPendingAgeMs(),
        getWorkerHeartbeatAgeMs(),
      ]);
      workerHealth = {
        ...evaluateWorkerHealth({ pendingCount: stats.pending, oldestPendingAgeMs, heartbeatAgeMs }),
        pending: stats.pending,
        oldest_pending_age_ms: oldestPendingAgeMs,
        heartbeat_age_ms: heartbeatAgeMs,
      };

      if (!workerHealth.healthy) {
        console.error(`[dead-alert] Campaign worker unhealthy: ${workerHealth.reason}`);
        await sendAlert({
          severity: 'critical',
          type: 'campaign_worker_stalled',
          title: 'Campaign worker parado com fila acumulando',
          message: workerHealth.reason,
          metadata: {
            pending: stats.pending,
            oldest_pending_age_ms: oldestPendingAgeMs,
            heartbeat_age_ms: heartbeatAgeMs,
          },
        }).catch(() => {});
        try {
          await supabaseAdmin.from('notifications').insert({
            type: 'whatsapp_campaign_worker_stalled',
            title: 'Campaign worker parado',
            message: workerHealth.reason,
            severity: 'critical',
            metadata: workerHealth,
            created_at: new Date().toISOString(),
          });
        } catch { /* tabela pode não existir — best-effort, padrão do arquivo */ }
      }
    } catch (e: any) {
      // Redis indisponível não pode derrubar o cron de dead events
      console.log('[dead-alert] worker health check skipped:', e?.message);
    }
    return NextResponse.json({ ok: true, dead_groups: 0, worker: workerHealth });
  }

  // 2. Log each dead event group
  for (const group of summary) {
    console.warn(
      `[dead-alert] Phone ${group.phone_number_id}: ` +
        `${group.dead_count} dead, ${group.failed_count} failed ` +
        `(oldest: ${group.oldest_event}, newest: ${group.newest_event})`
    );
  }

  // 3. Try to insert notifications (graceful failure if table doesn't exist)
  let notificationsInserted = 0;
  try {
    const notifications = summary.map((group: any) => ({
      type: 'whatsapp_dead_events',
      title: `Dead webhook events detected`,
      message:
        `Phone ${group.phone_number_id}: ` +
        `${group.dead_count} dead, ${group.failed_count} failed events ` +
        `in the last 15 minutes`,
      severity: (group.dead_count ?? 0) > 10 ? 'critical' : 'warning',
      metadata: {
        phone_number_id: group.phone_number_id,
        dead_count: group.dead_count,
        failed_count: group.failed_count,
        oldest_event: group.oldest_event,
        newest_event: group.newest_event,
      },
      created_at: new Date().toISOString(),
    }));

    const { error: notifErr } = await supabaseAdmin
      .from('notifications')
      .insert(notifications);

    if (!notifErr) {
      notificationsInserted = notifications.length;
    } else {
      // Table may not exist yet - that's OK
      console.log('[dead-alert] Could not insert notifications:', notifErr.message);
    }
  } catch (e: any) {
    console.log('[dead-alert] Notification insert skipped:', e.message);
  }

  // P0 — saúde do campaign worker (Railway): fila com pending antigo +
  // heartbeat ausente => worker morto/travado.
  let workerHealth: any = { healthy: true };
  try {
    const [stats, oldestPendingAgeMs, heartbeatAgeMs] = await Promise.all([
      campaignQueue.getStats(),
      campaignQueue.getOldestPendingAgeMs(),
      getWorkerHeartbeatAgeMs(),
    ]);
    workerHealth = {
      ...evaluateWorkerHealth({ pendingCount: stats.pending, oldestPendingAgeMs, heartbeatAgeMs }),
      pending: stats.pending,
      oldest_pending_age_ms: oldestPendingAgeMs,
      heartbeat_age_ms: heartbeatAgeMs,
    };

    if (!workerHealth.healthy) {
      console.error(`[dead-alert] Campaign worker unhealthy: ${workerHealth.reason}`);
      await sendAlert({
        severity: 'critical',
        type: 'campaign_worker_stalled',
        title: 'Campaign worker parado com fila acumulando',
        message: workerHealth.reason,
        metadata: {
          pending: stats.pending,
          oldest_pending_age_ms: oldestPendingAgeMs,
          heartbeat_age_ms: heartbeatAgeMs,
        },
      }).catch(() => {});
      try {
        await supabaseAdmin.from('notifications').insert({
          type: 'whatsapp_campaign_worker_stalled',
          title: 'Campaign worker parado',
          message: workerHealth.reason,
          severity: 'critical',
          metadata: workerHealth,
          created_at: new Date().toISOString(),
        });
      } catch { /* tabela pode não existir — best-effort, padrão do arquivo */ }
    }
  } catch (e: any) {
    // Redis indisponível não pode derrubar o cron de dead events
    console.log('[dead-alert] worker health check skipped:', e?.message);
  }

  return NextResponse.json({
    ok: true,
    dead_groups: summary.length,
    total_dead: summary.reduce((sum: number, g: any) => sum + (g.dead_count ?? 0), 0),
    total_failed: summary.reduce((sum: number, g: any) => sum + (g.failed_count ?? 0), 0),
    notifications_inserted: notificationsInserted,
    worker: workerHealth,
  });
}
