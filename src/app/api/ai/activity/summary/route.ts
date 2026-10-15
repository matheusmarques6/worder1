import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import {
  buildSeries, byAgent, computeKpis, countBy, funnel, heatmap, incentives, periodWindow, quality, topics,
  type Metric,
} from '@/lib/ai/activity-summary'
import { STORE_TZ_OFFSET_MINUTES, loadOutcomes, parsePeriod } from '@/lib/ai/activity-data'

export const dynamic = 'force-dynamic'

const METRICS: Metric[] = ['conversations', 'revenue', 'orders', 'transfers', 'cost_usd']

// Plano IA M5 passo 29 — o painel de negócio dos agentes:
// ?period=1|7|30|90&agent=<id>&compare=1&metric=conversations|revenue|orders|transfers|cost_usd
export async function GET(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const days = parsePeriod(params.get('period'))
  const agentId = params.get('agent') || null
  const compare = params.get('compare') === '1'
  const metric = (METRICS as string[]).includes(params.get('metric') ?? '') ? (params.get('metric') as Metric) : 'conversations'
  const organizationId = auth.user.organization_id
  const supabase = getSupabaseAdmin()
  const now = new Date()
  const window = periodWindow(days, now)

  try {
    const [rows, agents, calls, openGaps] = await Promise.all([
      loadOutcomes(supabase, organizationId, compare ? window.previousStart : window.start, agentId),
      supabase.from('ai_agents').select('id, name, monthly_cap_usd').eq('organization_id', organizationId),
      supabase
        .from('ai_runtime_activity_tools')
        .select('output, created_at')
        .eq('organization_id', organizationId)
        .eq('tool_name', 'search_knowledge')
        .gte('created_at', window.start.toISOString())
        .limit(3000),
      supabase
        .from('ai_knowledge_gaps')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'open'),
    ])
    const current = rows.filter((r) => new Date(r.started_at) >= window.start)
    const previous = compare ? rows.filter((r) => new Date(r.started_at) < window.start) : []

    // Conhecimento mais usado: fontes devolvidas pelas buscas do período.
    const sourceHits = new Map<string, number>()
    for (const call of (calls.data ?? []) as any[]) {
      const ids = new Set<string>((call.output?.chunks ?? []).map((c: any) => c?.source_id).filter(Boolean))
      for (const id of ids) sourceHits.set(id, (sourceHits.get(id) ?? 0) + 1)
    }
    const topIds = [...sourceHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    let names = new Map<string, string>()
    if (topIds.length) {
      const { data } = await supabase.from('ai_sources').select('id, name').eq('organization_id', organizationId).in('id', topIds.map(([id]) => id))
      names = new Map((data ?? []).map((s: any) => [s.id, s.name]))
    }

    return NextResponse.json({
      period: { days, start: window.start.toISOString(), end: window.end.toISOString(), hourly: days <= 1 },
      agents: (agents.data ?? []).map((a: any) => ({ id: a.id, name: a.name, monthly_cap_usd: a.monthly_cap_usd })),
      kpis: computeKpis(current),
      previous: compare ? computeKpis(previous) : null,
      series: { metric, points: buildSeries(current, metric, window, STORE_TZ_OFFSET_MINUTES) },
      by_agent: byAgent(current),
      funnel: funnel(current),
      handoff_reasons: countBy(current.filter((r) => r.transferred), (r) => r.handoff_reason ?? 'sem motivo'),
      topics: topics(current),
      knowledge: {
        top: topIds.map(([id, count]) => ({ source_id: id, name: names.get(id) ?? 'fonte removida', count })),
        open_gaps: openGaps.count ?? 0,
      },
      incentives: incentives(current),
      quality: quality(current),
      heatmap: heatmap(current, STORE_TZ_OFFSET_MINUTES),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
