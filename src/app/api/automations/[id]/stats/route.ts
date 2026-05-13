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

    const emailSendsByNode: Record<string, Set<string>> = {};
    const allEmailSendIds = new Set<string>();

    for (const run of runs || []) {
      const nodeResults = (run as any)?.metadata?.result?.nodeResults || {};
      if (!nodeResults || typeof nodeResults !== 'object') continue;

      for (const [nodeId, nodeResult] of Object.entries(nodeResults as Record<string, any>)) {
        const output = nodeResult?.output;
        const emailSendId = output?.emailSendId;
        if (!emailSendId || typeof emailSendId !== 'string') continue;

        if (!emailSendsByNode[nodeId]) emailSendsByNode[nodeId] = new Set();
        emailSendsByNode[nodeId].add(emailSendId);
        allEmailSendIds.add(emailSendId);
      }
    }

    let sendRows: Array<{
      id: string;
      status: string | null;
      sent_at: string | null;
      opened_at: string | null;
      clicked_at: string | null;
      conversion_value: number | null;
    }> = [];

    if (allEmailSendIds.size > 0) {
      const ids = Array.from(allEmailSendIds);
      // Supabase REST .in() handles up to ~1k values comfortably; chunk
      // to be safe when an automation has many historical sends.
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data: rows } = await supabase
          .from('email_sends')
          .select('id, status, sent_at, opened_at, clicked_at, conversion_value')
          .in('id', slice);
        if (rows) sendRows = sendRows.concat(rows as any);
      }
    }

    const sendById = new Map(sendRows.map(r => [r.id, r]));
    const nodeStats: Record<
      string,
      { sent: number; opened: number; clicked: number; revenue: number }
    > = {};

    for (const [nodeId, ids] of Object.entries(emailSendsByNode)) {
      const stats = { sent: 0, opened: 0, clicked: 0, revenue: 0 };
      for (const id of ids) {
        const row = sendById.get(id);
        if (!row) continue;
        if (row.sent_at) stats.sent++;
        if (row.opened_at) stats.opened++;
        if (row.clicked_at) stats.clicked++;
        if (row.conversion_value) stats.revenue += Number(row.conversion_value) || 0;
      }
      nodeStats[nodeId] = stats;
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
