// =============================================
// WORDER: AI usage cost summary
// GET /api/ai/usage?period=30d&group_by=model|feature|day
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

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
    .select('provider, model, feature, prompt_tokens, completion_tokens, total_tokens, cost_usd, duration_ms, success, created_at')
    .eq('organization_id', orgId)
    .gte('created_at', since)
    .limit(100000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data || []

  const totals = {
    calls: rows.length,
    successful: rows.filter((r) => r.success !== false).length,
    failed: rows.filter((r) => r.success === false).length,
    promptTokens: rows.reduce((s, r) => s + (r.prompt_tokens || 0), 0),
    completionTokens: rows.reduce((s, r) => s + (r.completion_tokens || 0), 0),
    totalTokens: rows.reduce((s, r) => s + (r.total_tokens || 0), 0),
    costUsd: rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0),
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
    const g = grouped.get(key) || { key, calls: 0, tokens: 0, costUsd: 0 }
    g.calls++
    g.tokens += r.total_tokens || 0
    g.costUsd += Number(r.cost_usd || 0)
    grouped.set(key, g)
  }

  return NextResponse.json({
    period,
    totals: {
      ...totals,
      costUsd: Math.round(totals.costUsd * 10000) / 10000,
    },
    grouped: Array.from(grouped.values())
      .map((g) => ({ ...g, costUsd: Math.round(g.costUsd * 10000) / 10000 }))
      .sort((a, b) => b.costUsd - a.costUsd),
  })
}
