import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const automationId = params.id;
  const { searchParams } = new URL(request.url);
  const timeframe = searchParams.get('timeframe') || '30d';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

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
  // 'all' = no date filter

  // Get automation runs for this automation
  let runsQuery = supabase
    .from('automation_runs')
    .select('id')
    .eq('automation_id', automationId);

  if (dateFilter) {
    runsQuery = runsQuery.gte('started_at', dateFilter);
  }

  const { data: runs } = await runsQuery;
  const runIds = (runs || []).map(r => r.id);

  if (runIds.length === 0) {
    return NextResponse.json({ nodeStats: {}, totalRuns: 0 });
  }

  // Get step stats grouped by node_id
  const { data: steps } = await supabase
    .from('automation_run_steps')
    .select('node_id, node_type, status, result')
    .in('run_id', runIds);

  // Aggregate by node_id
  const nodeStats: Record<string, { sent: number; opened: number; clicked: number; revenue: number }> = {};

  for (const step of steps || []) {
    if (!step.node_id) continue;

    if (!nodeStats[step.node_id]) {
      nodeStats[step.node_id] = { sent: 0, opened: 0, clicked: 0, revenue: 0 };
    }

    const stats = nodeStats[step.node_id];

    if (step.status === 'completed' || step.status === 'success') {
      stats.sent++;
    }

    if (step.result) {
      const result = typeof step.result === 'string' ? JSON.parse(step.result) : step.result;
      if (result.opened) stats.opened++;
      if (result.clicked) stats.clicked++;
      if (result.revenue) stats.revenue += Number(result.revenue) || 0;
    }
  }

  return NextResponse.json({
    nodeStats,
    totalRuns: runIds.length,
    timeframe,
  });
}
