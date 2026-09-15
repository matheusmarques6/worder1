// =============================================
// WORDER: AI usage cost summary + budget status
// GET /api/ai/usage?period=30d&group_by=model|feature|day
// Task 17 (P1): inclui campo `budget` com limite/gasto/allowed.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { checkAiBudget } from '@/lib/ai/budget'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()
  const orgId = auth.user.organization_id

  const url = new URL(req.url)
  const period = url.searchParams.get('period') || '30d'
  const groupBy = (url.searchParams.get('group_by') || 'day') as 'day' | 'model' | 'feature'

  const days = period === '24h' ? 1 : period === '7d' ? 7 : period === '30d' ? 30 : 90
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('ai_usage_logs')
    .select('provider, model, feature, prompt_tokens, completion_tokens, total_tokens, cost_usd, duration_ms, success, created_at, metadata')
    .eq('organization_id', orgId)
    .gte('created_at', since)
    .limit(100000)

  // An empty result is valid; query errors must reach the UI.
  if (error) {
    console.warn('[ai/usage] query error (table may not exist):', error.message)
    return NextResponse.json({ error: 'Unable to load AI usage.' }, { status: 500 })
  }

  const rows = data || []
  const billableRows = rows.filter((r) => r.metadata?.billable !== false)
  const platformRows = rows.filter((r) => r.metadata?.billable === false)

  const totals = {
    calls: rows.length,
    successful: rows.filter((r) => r.success !== false).length,
    failed: rows.filter((r) => r.success === false).length,
    promptTokens: rows.reduce((s, r) => s + (r.prompt_tokens || 0), 0),
    completionTokens: rows.reduce((s, r) => s + (r.completion_tokens || 0), 0),
    totalTokens: rows.reduce((s, r) => s + (r.total_tokens || 0), 0),
    // Soma só o custo conhecido (cost_usd NULL = modelo fora da tabela de
    // preços, item 42) — nunca inventa 0 pra ele. billableUnknownCostCalls conta
    // quantas chamadas ficaram de fora dessa soma, pra billableCostUsd não passar
    // por "gasto total" quando é só "gasto do que sabemos precificar".
    billableCostUsd: billableRows.reduce((s, r) => s + (r.cost_usd == null ? 0 : Number(r.cost_usd)), 0),
    billableUnknownCostCalls: billableRows.filter((r) => r.cost_usd == null).length,
    platformCostUsd: platformRows.reduce((s, r) => s + (r.cost_usd == null ? 0 : Number(r.cost_usd)), 0),
    platformUnknownCostCalls: platformRows.filter((r) => r.cost_usd == null).length,
    avgDurationMs: rows.length ? Math.round(rows.reduce((s, r) => s + (r.duration_ms || 0), 0) / rows.length) : 0,
  }

  // Group
  const groupKey = (r: any) =>
    groupBy === 'model' ? `${r.provider}:${r.model}` :
    groupBy === 'feature' ? r.feature :
    r.created_at.slice(0, 10) // day

  const grouped = new Map<string, any>()
  for (const r of rows) {
    const key = groupKey(r)
    const g = grouped.get(key) || {
      key,
      calls: 0,
      tokens: 0,
      billableCostUsd: 0,
      platformCostUsd: 0,
    }
    g.calls++
    g.tokens += r.total_tokens || 0
    const costUsd = r.cost_usd == null ? 0 : Number(r.cost_usd)
    if (r.metadata?.billable === false) g.platformCostUsd += costUsd
    else g.billableCostUsd += costUsd
    grouped.set(key, g)
  }

  // Budget status (skipCache=true para refletir gasto atual)
  let budget: Awaited<ReturnType<typeof checkAiBudget>> | null = null
  try {
    budget = await checkAiBudget(orgId, { skipCache: true })
  } catch {
    // Não quebrar a resposta se o budget falhar
    budget = null
  }

  return NextResponse.json({
    period,
    totals: {
      ...totals,
      billableCostUsd: Math.round(totals.billableCostUsd * 10000) / 10000,
      platformCostUsd: Math.round(totals.platformCostUsd * 10000) / 10000,
    },
    grouped: Array.from(grouped.values())
      .map((g) => ({
        ...g,
        billableCostUsd: Math.round(g.billableCostUsd * 10000) / 10000,
        platformCostUsd: Math.round(g.platformCostUsd * 10000) / 10000,
      }))
      .sort(
        (a, b) =>
          b.billableCostUsd + b.platformCostUsd -
          (a.billableCostUsd + a.platformCostUsd),
      ),
    budget: budget
      ? {
          allowed: budget.allowed,
          budgetUsd: budget.budgetUsd,
          spentUsd: Math.round(budget.spentUsd * 10000) / 10000,
          usedPct: budget.budgetUsd
            ? Math.round((budget.spentUsd / budget.budgetUsd) * 10000) / 100
            : null,
          // Item 42: spentUsd acima é PARCIAL quando true — teve chamada de
          // modelo sem preço na tabela este mês, fora da soma.
          hasUnknownCost: budget.hasUnknownCost,
          unknownReason: budget.unknownReason,
        }
      : null,
  })
}
