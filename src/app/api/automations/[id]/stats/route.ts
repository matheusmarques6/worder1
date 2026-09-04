import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// Per-node analytics for a flow's canvas card (Sent / Opened / Clicked /
// Sales) and for the metrics strip in the properties panel.
//
// Source of truth: the send tables themselves. Every automation send is
// stamped with the node that produced it — email_sends.metadata.node_id
// (written by action_email in node-executors), whatsapp_sends.node_id and
// sms_sends.node_id — plus automation_id / flow_id, so we can count sends,
// opens, clicks and attributed revenue per canvas node straight from the
// rows, inside the requested window.
//
// The previous implementation walked automation_runs.metadata.result
// .nodeResults instead. That snapshot only ever holds the LAST segment a
// run executed (trigger→Email 1→delay, then on resume Email 2→delay
// overwrites it), so Email 1 dropped to zero as soon as runs advanced and
// Email 2 showed just "runs currently parked after Email 2" — 23 instead
// of 235. The snapshot is kept only as a fallback for legacy rows that
// were never stamped with a node id.
//
// Response shape (unchanged so the canvas component keeps working):
//   { nodeStats: { [nodeId]: { sent, opened, clicked, revenue } }, totalRuns, timeframe }

type NodeStat = { sent: number; opened: number; clicked: number; revenue: number };

const PAGE = 1000;
const MAX_PAGES = 50;

function timeframeSince(timeframe: string, now: Date = new Date()): string | null {
  const days =
    timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : timeframe === '90d' ? 90 : null;
  if (!days) return null;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: automationId } = await params;
  const { searchParams } = new URL(request.url);
  const timeframe = searchParams.get('timeframe') || '30d';

  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  const since = timeframeSince(timeframe);

  try {
    const { data: automation } = await supabase
      .from('automations')
      .select('id')
      .eq('id', automationId)
      .eq('organization_id', organizationId)
      .single();

    if (!automation) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // PostgREST caps a single response at 1000 rows; a busy flow passes
    // that in a month, so page through explicitly instead of silently
    // truncating the count.
    async function loadAll<T>(build: () => any): Promise<T[]> {
      const out: T[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE;
        const { data, error } = await build().range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = (data || []) as T[];
        out.push(...rows);
        if (rows.length < PAGE) break;
      }
      return out;
    }

    const belongsToFlow = `automation_id.eq.${automationId},flow_id.eq.${automationId}`;

    function sendsQuery(table: 'email_sends' | 'whatsapp_sends' | 'sms_sends', columns: string) {
      return () => {
        let q = supabase
          .from(table)
          .select(columns)
          .eq('organization_id', organizationId)
          .or(belongsToFlow);
        if (since) q = q.gte('created_at', since);
        return q;
      };
    }

    // Runs are still loaded for totalRuns and for the legacy fallback:
    // a send row with no node stamp is attributed through the run
    // snapshot when that snapshot still carries its send id.
    let runsQuery = supabase
      .from('automation_runs')
      .select('id, metadata')
      .eq('automation_id', automationId);
    if (since) runsQuery = runsQuery.gte('started_at', since);

    const [emailRows, whatsappRows, smsRows, runsResult] = await Promise.all([
      loadAll<{
        id: string;
        sent_at: string | null;
        opened_at: string | null;
        clicked_at: string | null;
        conversion_value: number | string | null;
        metadata: any;
      }>(sendsQuery('email_sends', 'id, sent_at, opened_at, clicked_at, conversion_value, metadata')),
      loadAll<{
        id: string;
        node_id: string | null;
        sent_at: string | null;
        delivered_at: string | null;
        read_at: string | null;
        replied_at: string | null;
        conversion_value: number | string | null;
        metadata: any;
      }>(
        sendsQuery(
          'whatsapp_sends',
          'id, node_id, sent_at, delivered_at, read_at, replied_at, conversion_value, metadata'
        )
      ),
      loadAll<{
        id: string;
        node_id: string | null;
        sent_at: string | null;
        delivered_at: string | null;
        clicked_at: string | null;
        conversion_value: number | string | null;
        metadata: any;
      }>(
        sendsQuery('sms_sends', 'id, node_id, sent_at, delivered_at, clicked_at, conversion_value, metadata')
      ),
      runsQuery.limit(5000),
    ]);

    const runs = (runsResult?.data || []) as Array<{ id: string; metadata: any }>;

    // Legacy fallback map: send id → node id, harvested from run snapshots.
    const nodeBySendId = new Map<string, string>();
    for (const run of runs) {
      const nodeResults = run?.metadata?.result?.nodeResults;
      if (!nodeResults || typeof nodeResults !== 'object') continue;
      for (const [nodeId, nodeResult] of Object.entries(nodeResults as Record<string, any>)) {
        const output = nodeResult?.output;
        if (!output || typeof output !== 'object') continue;
        for (const key of ['emailSendId', 'whatsappSendId', 'smsSendId'] as const) {
          if (typeof output[key] === 'string') nodeBySendId.set(output[key], nodeId);
        }
      }
    }

    const nodeStats: Record<string, NodeStat> = {};
    const bump = (nodeId: string): NodeStat => {
      if (!nodeStats[nodeId]) nodeStats[nodeId] = { sent: 0, opened: 0, clicked: 0, revenue: 0 };
      return nodeStats[nodeId];
    };
    const nodeOf = (row: { id: string; node_id?: string | null; metadata?: any }): string | null => {
      const stamped =
        (typeof row.node_id === 'string' && row.node_id) ||
        (typeof row.metadata?.node_id === 'string' && row.metadata.node_id) ||
        null;
      return stamped || nodeBySendId.get(row.id) || null;
    };
    const money = (v: number | string | null | undefined) => {
      const n = typeof v === 'string' ? parseFloat(v) : v;
      return Number.isFinite(n as number) ? (n as number) : 0;
    };

    for (const row of emailRows) {
      const nodeId = nodeOf(row);
      if (!nodeId) continue;
      const s = bump(nodeId);
      if (row.sent_at) s.sent++;
      if (row.opened_at) s.opened++;
      if (row.clicked_at) s.clicked++;
      s.revenue += money(row.conversion_value);
    }

    for (const row of whatsappRows) {
      const nodeId = nodeOf(row);
      if (!nodeId) continue;
      const s = bump(nodeId);
      if (row.sent_at) s.sent++;
      // WhatsApp's "read" maps to what the merchant intuits as "opened"
      // on the canvas; "replied" is the strongest signal and counts as
      // the click-equivalent for tile parity.
      if (row.read_at || row.replied_at) s.opened++;
      if (row.replied_at) s.clicked++;
      s.revenue += money(row.conversion_value);
    }

    for (const row of smsRows) {
      const nodeId = nodeOf(row);
      if (!nodeId) continue;
      const s = bump(nodeId);
      if (row.sent_at) s.sent++;
      // SMS has no open signal; delivered → opened for tile consistency.
      if (row.delivered_at) s.opened++;
      if (row.clicked_at) s.clicked++;
      s.revenue += money(row.conversion_value);
    }

    return NextResponse.json({
      nodeStats,
      totalRuns: runs.length,
      timeframe,
    });
  } catch (error: any) {
    return NextResponse.json({
      nodeStats: {},
      totalRuns: 0,
      error: error?.message || 'Unknown error',
    });
  }
}
