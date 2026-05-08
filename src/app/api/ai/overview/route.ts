// =============================================
// GET /api/ai/overview
// Agrega métricas básicas do módulo IA pra /ai (Visão geral).
// Janela default: últimos 30 dias.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

interface ExecutionRow {
  agent_id: string
  duration_ms: number | null
  tokens_total_in: number
  tokens_total_out: number
  cost_total_usd: number | null
  outcome: string | null
  revenue_attributed_brl: number | null
  started_at: string
}

export async function GET(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const orgId = auth.user.organization_id
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') || '30', 10)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const previousSince = new Date(Date.now() - 2 * days * 24 * 60 * 60 * 1000).toISOString()

  // Total agentes publicados/total
  const [{ count: totalAgents }, { count: publishedAgents }] = await Promise.all([
    supabase
      .from('ai_agents')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    supabase
      .from('ai_agents')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'published'),
  ])

  // Conversas com IA atribuída + paused
  const [{ count: convsWithAI }, { count: convsAIPaused }] = await Promise.all([
    supabase
      .from('whatsapp_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .not('ai_agent_id', 'is', null),
    supabase
      .from('whatsapp_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('ai_paused', true),
  ])

  // Execuções da janela atual e anterior (pra delta)
  const [currentExecs, previousExecs] = await Promise.all([
    supabase
      .from('ai_executions')
      .select(
        'agent_id, duration_ms, tokens_total_in, tokens_total_out, cost_total_usd, outcome, revenue_attributed_brl, started_at',
      )
      .eq('organization_id', orgId)
      .gte('started_at', since)
      .limit(10000),
    supabase
      .from('ai_executions')
      .select(
        'agent_id, duration_ms, tokens_total_in, tokens_total_out, cost_total_usd, outcome, revenue_attributed_brl',
      )
      .eq('organization_id', orgId)
      .gte('started_at', previousSince)
      .lt('started_at', since)
      .limit(10000),
  ])

  const cur = (currentExecs.data || []) as ExecutionRow[]
  const prev = (previousExecs.data || []) as ExecutionRow[]

  const sum = (rows: ExecutionRow[], pick: (r: ExecutionRow) => number | null | undefined) =>
    rows.reduce<number>((acc, r) => acc + (Number(pick(r)) || 0), 0)

  const aggregateMetrics = (rows: ExecutionRow[]) => {
    const total = rows.length
    const totalDurationMs = sum(rows, (r) => r.duration_ms)
    const tokensIn = sum(rows, (r) => r.tokens_total_in)
    const tokensOut = sum(rows, (r) => r.tokens_total_out)
    const costUsd = sum(rows, (r) => r.cost_total_usd)
    const revenueBrl = sum(rows, (r) => r.revenue_attributed_brl)
    const escalated = rows.filter((r) => r.outcome === 'escalated').length
    const converted = rows.filter((r) => r.outcome === 'converted').length
    return {
      total,
      avgDurationMs: total > 0 ? Math.round(totalDurationMs / total) : 0,
      tokensIn,
      tokensOut,
      tokensTotal: tokensIn + tokensOut,
      costUsd: Number(costUsd.toFixed(4)),
      revenueBrl: Number(revenueBrl.toFixed(2)),
      escalated,
      converted,
      escalationRate: total > 0 ? +(escalated / total).toFixed(3) : 0,
      conversionRate: total > 0 ? +(converted / total).toFixed(3) : 0,
    }
  }

  const current = aggregateMetrics(cur)
  const previous = aggregateMetrics(prev)
  const delta = (a: number, b: number) =>
    b === 0 ? (a > 0 ? 1 : 0) : Number(((a - b) / b).toFixed(3))

  // Performance por agente
  const byAgent = new Map<string, ExecutionRow[]>()
  for (const r of cur) {
    if (!byAgent.has(r.agent_id)) byAgent.set(r.agent_id, [])
    byAgent.get(r.agent_id)!.push(r)
  }
  const perAgent = await Promise.all(
    Array.from(byAgent.entries()).map(async ([agentId, rows]) => {
      const { data: agent } = await supabase
        .from('ai_agents')
        .select('id, name, role, status')
        .eq('id', agentId)
        .maybeSingle()
      const m = aggregateMetrics(rows)
      return {
        agent: agent ?? { id: agentId, name: '(deletado)', role: 'custom', status: 'archived' },
        metrics: m,
      }
    }),
  )

  // Atividade recente: últimas execuções (compactas)
  const recent = cur
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
    .slice(0, 10)
    .map((r) => ({
      agent_id: r.agent_id,
      outcome: r.outcome,
      cost_usd: r.cost_total_usd,
      duration_ms: r.duration_ms,
      started_at: r.started_at,
    }))

  return NextResponse.json({
    window: { days, since },
    counts: {
      totalAgents: totalAgents ?? 0,
      publishedAgents: publishedAgents ?? 0,
      conversationsWithAI: convsWithAI ?? 0,
      conversationsAIPaused: convsAIPaused ?? 0,
    },
    current,
    previous,
    delta: {
      total: delta(current.total, previous.total),
      costUsd: delta(current.costUsd, previous.costUsd),
      revenueBrl: delta(current.revenueBrl, previous.revenueBrl),
      conversionRate: current.conversionRate - previous.conversionRate,
    },
    perAgent,
    recent,
  })
}
