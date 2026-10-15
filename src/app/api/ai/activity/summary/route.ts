import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import {
  buildSeries, byAgent, computeKpis, countBy, funnel, heatmap, incentives, periodWindow, quality, topics,
  type Metric,
} from '@/lib/ai/activity-summary'
import { STORE_TZ_OFFSET_MINUTES, loadOutcomes, parsePeriod } from '@/lib/ai/activity-data'
import { usdToBrlRate } from '@/lib/ai/brl'
import { checkAiBudget } from '@/lib/ai/budget'

export const dynamic = 'force-dynamic'

const METRICS: Metric[] = ['conversations', 'revenue', 'orders', 'transfers', 'cost_usd', 'resolved', 'first_response']

// Plano IA M5 passo 29 — o painel de negócio dos agentes:
// ?period=1|7|30|90&agent=<id>&compare=1&metric=conversations|revenue|orders|transfers|cost_usd|resolved|first_response
// UI F5 (protótipo): números por agente do período anterior, cotação US$→R$,
// motor por agente (modelo, tokens, latência de ai_usage_logs), orçamento
// do mês e infrações da revisão por critério (eventos `blocked`, alteração
// 2026-10-15-16 do runtime).
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
    const [rows, agents, calls, openGaps, usage, blocks, usdBrl, budget] = await Promise.all([
      loadOutcomes(supabase, organizationId, compare ? window.previousStart : window.start, agentId),
      supabase.from('ai_agents').select('id, name, role, status, model, monthly_cap_usd, settings').eq('organization_id', organizationId),
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
      supabase
        .from('ai_usage_logs')
        .select('agent_id, model, feature, prompt_tokens, completion_tokens, duration_ms')
        .eq('organization_id', organizationId)
        .gte('created_at', window.start.toISOString())
        .limit(20000),
      supabase
        .from('ai_activity_events')
        .select('agent_id, metadata')
        .eq('organization_id', organizationId)
        .eq('kind', 'blocked')
        .gte('created_at', window.start.toISOString())
        .limit(5000),
      usdToBrlRate(supabase),
      checkAiBudget(organizationId).catch(() => null),
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

    const engine = engineByAgent((usage.data ?? []) as any[], agentId)
    const judgeNames = new Map<string, string>()
    for (const a of (agents.data ?? []) as any[]) {
      for (const j of a.settings?.judges?.custom ?? []) if (j?.id) judgeNames.set(j.id, j.name || j.criterion || j.id)
    }
    const infractions = new Map<string, number>()
    for (const e of (blocks.data ?? []) as any[]) {
      if (agentId && e.agent_id !== agentId) continue
      for (const c of Array.isArray(e.metadata?.failed) ? e.metadata.failed : []) infractions.set(c, (infractions.get(c) ?? 0) + 1)
    }

    return NextResponse.json({
      period: { days, start: window.start.toISOString(), end: window.end.toISOString(), hourly: days <= 1 },
      usd_brl: usdBrl,
      agents: (agents.data ?? []).map((a: any) => ({
        id: a.id, name: a.name, role: a.role ?? null, status: a.status ?? null, model: a.model ?? null, monthly_cap_usd: a.monthly_cap_usd,
      })),
      engine,
      budget: budget ? { limit_usd: budget.budgetUsd, spent_month_usd: budget.spentUsd } : null,
      kpis: computeKpis(current),
      previous: compare ? computeKpis(previous) : null,
      series: { metric, points: buildSeries(current, metric, window, STORE_TZ_OFFSET_MINUTES) },
      by_agent: byAgent(current),
      by_agent_previous: compare ? byAgent(previous) : null,
      funnel: funnel(current),
      handoff_reasons: countBy(current.filter((r) => r.transferred), (r) => r.handoff_reason ?? 'sem motivo'),
      topics: topics(current),
      knowledge: {
        top: topIds.map(([id, count]) => ({ source_id: id, name: names.get(id) ?? 'fonte removida', count })),
        open_gaps: openGaps.count ?? 0,
      },
      incentives: incentives(current),
      quality: {
        ...quality(current),
        infractions: [...infractions.entries()]
          .map(([criterion, count]) => ({ criterion, name: judgeNames.get(criterion) ?? null, count }))
          .sort((a, b) => b.count - a.count),
      },
      heatmap: heatmap(current, STORE_TZ_OFFSET_MINUTES),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/** Motor por agente no período: modelo mais usado nas respostas, tokens de
 *  tudo o que o agente gastou e latência média das respostas. */
function engineByAgent(
  logs: Array<{ agent_id: string | null; model: string | null; feature: string | null; prompt_tokens: number | null; completion_tokens: number | null; duration_ms: number | null }>,
  agentId: string | null,
) {
  const by = new Map<string, { tokens: number; ms: number; n: number; models: Map<string, number> }>()
  for (const l of logs) {
    if (!l.agent_id || (agentId && l.agent_id !== agentId)) continue
    const a = by.get(l.agent_id) ?? { tokens: 0, ms: 0, n: 0, models: new Map<string, number>() }
    a.tokens += (l.prompt_tokens ?? 0) + (l.completion_tokens ?? 0)
    if (l.feature === 'runtime_agent_reply') {
      if (typeof l.duration_ms === 'number') { a.ms += l.duration_ms; a.n += 1 }
      if (l.model) a.models.set(l.model, (a.models.get(l.model) ?? 0) + 1)
    }
    by.set(l.agent_id, a)
  }
  return [...by.entries()].map(([agent_id, a]) => ({
    agent_id,
    model: [...a.models.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
    tokens: a.tokens,
    avg_latency_ms: a.n ? Math.round(a.ms / a.n) : null,
  }))
}
