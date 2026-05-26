import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function authorize(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  if (req.headers.get('x-internal-request') === 'true') return true;
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
    return NextResponse.json({ ok: true, dead_groups: 0 });
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

  return NextResponse.json({
    ok: true,
    dead_groups: summary.length,
    total_dead: summary.reduce((sum: number, g: any) => sum + (g.dead_count ?? 0), 0),
    total_failed: summary.reduce((sum: number, g: any) => sum + (g.failed_count ?? 0), 0),
    notifications_inserted: notificationsInserted,
  });
}
