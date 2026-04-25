import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

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

  // Calculate date filter
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
    // Get automation runs for this automation
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
      .select('id')
      .eq('automation_id', automationId);

    if (dateFilter) {
      runsQuery = runsQuery.gte('started_at', dateFilter);
    }

    const { data: runs, error: runsError } = await runsQuery;

    if (runsError) {
      return NextResponse.json({ nodeStats: {}, totalRuns: 0, error: runsError.message });
    }

    const runIds = (runs || []).map((r: any) => r.id);

    if (runIds.length === 0) {
      return NextResponse.json({ nodeStats: {}, totalRuns: 0 });
    }

    // Get step stats - select both 'result' and 'output' columns for compatibility
    const { data: steps, error: stepsError } = await supabase
      .from('automation_run_steps')
      .select('node_id, node_type, status, result, output')
      .in('run_id', runIds.slice(0, 500)); // Limit to prevent too-large IN clause

    if (stepsError) {
      // If 'result' column doesn't exist yet, try with just 'output'
      const { data: fallbackSteps } = await supabase
        .from('automation_run_steps')
        .select('node_id, node_type, status, output')
        .in('run_id', runIds.slice(0, 500));

      return aggregateStats(fallbackSteps || [], runIds.length, timeframe, true);
    }

    return aggregateStats(steps || [], runIds.length, timeframe, false);
  } catch (error) {
    return NextResponse.json({ nodeStats: {}, totalRuns: 0 });
  }
}

function aggregateStats(
  steps: Array<Record<string, any>>,
  totalRuns: number,
  timeframe: string,
  useOutput: boolean
) {
  const nodeStats: Record<string, { sent: number; opened: number; clicked: number; revenue: number }> = {};

  for (const step of steps) {
    if (!step.node_id) continue;

    if (!nodeStats[step.node_id]) {
      nodeStats[step.node_id] = { sent: 0, opened: 0, clicked: 0, revenue: 0 };
    }

    const stats = nodeStats[step.node_id];

    if (step.status === 'completed' || step.status === 'success') {
      stats.sent++;
    }

    // Use 'result' column if available, fallback to 'output'
    const resultData = useOutput ? step.output : (step.result || step.output);
    if (resultData) {
      const result = typeof resultData === 'string' ? JSON.parse(resultData) : resultData;
      if (result.opened) stats.opened++;
      if (result.clicked) stats.clicked++;
      if (result.revenue) stats.revenue += Number(result.revenue) || 0;
    }
  }

  return NextResponse.json({
    nodeStats,
    totalRuns,
    timeframe,
  });
}
