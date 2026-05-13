import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

// Per-node analytics for a flow's canvas card (Sent / Opened / Clicked /
// Sales). The previous implementation queried automation_run_steps with
// a column ('result' / 'output') that no execution path ever wrote, and
// then tried to count opens/clicks from the step output blob — which
// never carries that data either, since opens/clicks land on email_sends
// minutes or hours after the step completes. The card therefore sat at
// zero forever.
//
// The new engine snapshots its per-node results into
// automation_runs.metadata.result.nodeResults, where action_email writes
// { sent: true, emailSendId }. We walk that map, gather every emailSendId
// per node, then join the live engagement counters from email_sends.
//
// Response shape (unchanged so the canvas component keeps working):
//   { nodeStats: { [nodeId]: { sent, opened, clicked, revenue } }, totalRuns, timeframe }
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const automationId = params.id;
  const { searchParams } = new URL(request.url);
  const timeframe = searchParams.get('timeframe') || '30d';

  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  const organizationId = user.organization_id;

  let dateFilter: string | null = null;
  const now = new Date();
  if (timeframe === '7d') {
    dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (timeframe === '30d') {
    dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  } else if (timeframe === '90d') {
    dateFilter = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  }

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

    let runsQuery = supabase
      .from('automation_runs')
      .select('id, metadata, started_at')
      .eq('automation_id', automationId);

    if (dateFilter) {
      runsQuery = runsQuery.gte('started_at', dateFilter);
    }

    const { data: runs, error: runsError } = await runsQuery.limit(5000);

    if (runsError) {
      return NextResponse.json({ nodeStats: {}, totalRuns: 0, error: runsError.message });
    }

    // Per-channel send-id maps. Each action_email / action_whatsapp /
    // action_sms node persists its provider-side send id into the
    // executor output, and the engine snapshots that into
    // metadata.result.nodeResults. We harvest all three so the same
    // Sent / Opened / Clicked / Sales tile on the canvas works
    // regardless of which channel the node is.
    const emailByNode: Record<string, Set<string>> = {};
    const whatsappByNode: Record<string, Set<string>> = {};
    const smsByNode: Record<string, Set<string>> = {};
    const allEmailIds = new Set<string>();
    const allWhatsappIds = new Set<string>();
    const allSmsIds = new Set<string>();

    for (const run of runs || []) {
      const nodeResults = (run as any)?.metadata?.result?.nodeResults || {};
      if (!nodeResults || typeof nodeResults !== 'object') continue;

      for (const [nodeId, nodeResult] of Object.entries(nodeResults as Record<string, any>)) {
        const output = nodeResult?.output;
        if (!output || typeof output !== 'object') continue;

        if (typeof output.emailSendId === 'string') {
          if (!emailByNode[nodeId]) emailByNode[nodeId] = new Set();
          emailByNode[nodeId].add(output.emailSendId);
          allEmailIds.add(output.emailSendId);
        }
        if (typeof output.whatsappSendId === 'string') {
          if (!whatsappByNode[nodeId]) whatsappByNode[nodeId] = new Set();
          whatsappByNode[nodeId].add(output.whatsappSendId);
          allWhatsappIds.add(output.whatsappSendId);
        }
        if (typeof output.smsSendId === 'string') {
          if (!smsByNode[nodeId]) smsByNode[nodeId] = new Set();
          smsByNode[nodeId].add(output.smsSendId);
          allSmsIds.add(output.smsSendId);
        }
      }
    }

    const CHUNK = 500;
    async function loadSends<T>(
      table: 'email_sends' | 'whatsapp_sends' | 'sms_sends',
      ids: string[],
      columns: string
    ): Promise<T[]> {
      const out: T[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data: rows } = await supabase.from(table).select(columns).in('id', slice);
        if (rows) out.push(...(rows as unknown as T[]));
      }
      return out;
    }

    const [emailRows, whatsappRows, smsRows] = await Promise.all([
      allEmailIds.size > 0
        ? loadSends<{
            id: string;
            sent_at: string | null;
            opened_at: string | null;
            clicked_at: string | null;
            conversion_value: number | null;
          }>('email_sends', Array.from(allEmailIds), 'id, sent_at, opened_at, clicked_at, conversion_value')
        : Promise.resolve([]),
      allWhatsappIds.size > 0
        ? loadSends<{
            id: string;
            sent_at: string | null;
            delivered_at: string | null;
            read_at: string | null;
            replied_at: string | null;
            conversion_value: number | null;
          }>(
            'whatsapp_sends',
            Array.from(allWhatsappIds),
            'id, sent_at, delivered_at, read_at, replied_at, conversion_value'
          )
        : Promise.resolve([]),
      allSmsIds.size > 0
        ? loadSends<{
            id: string;
            sent_at: string | null;
            delivered_at: string | null;
            clicked_at: string | null;
            conversion_value: number | null;
          }>('sms_sends', Array.from(allSmsIds), 'id, sent_at, delivered_at, clicked_at, conversion_value')
        : Promise.resolve([]),
    ]);

    const emailById = new Map(emailRows.map(r => [r.id, r]));
    const whatsappById = new Map(whatsappRows.map(r => [r.id, r]));
    const smsById = new Map(smsRows.map(r => [r.id, r]));

    const nodeStats: Record<
      string,
      { sent: number; opened: number; clicked: number; revenue: number }
    > = {};

    function bump(nodeId: string): { sent: number; opened: number; clicked: number; revenue: number } {
      if (!nodeStats[nodeId]) nodeStats[nodeId] = { sent: 0, opened: 0, clicked: 0, revenue: 0 };
      return nodeStats[nodeId];
    }

    for (const [nodeId, ids] of Object.entries(emailByNode)) {
      for (const id of ids) {
        const row = emailById.get(id);
        if (!row) continue;
        const s = bump(nodeId);
        if (row.sent_at) s.sent++;
        if (row.opened_at) s.opened++;
        if (row.clicked_at) s.clicked++;
        if (row.conversion_value) s.revenue += Number(row.conversion_value) || 0;
      }
    }

    for (const [nodeId, ids] of Object.entries(whatsappByNode)) {
      for (const id of ids) {
        const row = whatsappById.get(id);
        if (!row) continue;
        const s = bump(nodeId);
        if (row.sent_at) s.sent++;
        // WhatsApp's "read" maps to what the merchant intuits as
        // "opened" on the canvas; "replied" is the strongest signal
        // but still counts as a click-equivalent for tile parity.
        if (row.read_at || row.replied_at) s.opened++;
        if (row.replied_at) s.clicked++;
        if (row.conversion_value) s.revenue += Number(row.conversion_value) || 0;
      }
    }

    for (const [nodeId, ids] of Object.entries(smsByNode)) {
      for (const id of ids) {
        const row = smsById.get(id);
        if (!row) continue;
        const s = bump(nodeId);
        if (row.sent_at) s.sent++;
        // SMS has no open signal; we map delivered → opened for tile
        // consistency, and clicked stays clicked.
        if (row.delivered_at) s.opened++;
        if (row.clicked_at) s.clicked++;
        if (row.conversion_value) s.revenue += Number(row.conversion_value) || 0;
      }
    }

    return NextResponse.json({
      nodeStats,
      totalRuns: (runs || []).length,
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
