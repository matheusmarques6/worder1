// =============================================
// Cost rollup: agrega ai_executions por (organization_id, agent_id, date)
// e upserta em ai_costs_daily. Idempotente (UNIQUE constraint).
//
// cost_breakdown.jsonb captura distribuição por modelo:
//   { "anthropic/claude-sonnet-4.6": { in: 1234, out: 5678, cost: 0.123 } }
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin'

interface RollupOptions {
  organizationId?: string
  fromDate?: string // ISO date 'YYYY-MM-DD'
  toDate?: string // ISO date 'YYYY-MM-DD'
}

export interface RollupResult {
  rolled: number
  range: { from: string; to: string }
}

interface ExecRow {
  organization_id: string
  agent_id: string
  started_at: string
  tokens_total_in: number
  tokens_total_out: number
  cost_total_usd: number
  llm_calls: Array<{ model: string; tokens_in: number; tokens_out: number; cost_usd: number }>
}

interface BucketAccumulator {
  total_executions: number
  total_tokens_in: number
  total_tokens_out: number
  total_cost_usd: number
  cost_breakdown: Record<string, { in: number; out: number; cost: number }>
}

export async function rollupCosts(opts: RollupOptions = {}): Promise<RollupResult> {
  const supabase = getSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const fromDate = opts.fromDate ?? yesterday
  const toDate = opts.toDate ?? today

  let query = supabase
    .from('ai_executions')
    .select('organization_id, agent_id, started_at, tokens_total_in, tokens_total_out, cost_total_usd, llm_calls')
    .gte('started_at', `${fromDate}T00:00:00.000Z`)
    .lte('started_at', `${toDate}T23:59:59.999Z`)
  if (opts.organizationId) {
    query = query.eq('organization_id', opts.organizationId)
  }

  const { data: execs, error } = await query
  if (error) throw new Error(`rollup query falhou: ${error.message}`)
  if (!execs || execs.length === 0) {
    return { rolled: 0, range: { from: fromDate, to: toDate } }
  }

  // Bucket: org_id::agent_id::date → acumulador
  const buckets = new Map<string, BucketAccumulator & { org_id: string; agent_id: string; date: string }>()
  for (const e of execs as ExecRow[]) {
    const date = e.started_at.slice(0, 10)
    const key = `${e.organization_id}::${e.agent_id}::${date}`
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        org_id: e.organization_id,
        agent_id: e.agent_id,
        date,
        total_executions: 0,
        total_tokens_in: 0,
        total_tokens_out: 0,
        total_cost_usd: 0,
        cost_breakdown: {},
      }
      buckets.set(key, bucket)
    }
    bucket.total_executions++
    bucket.total_tokens_in += Number(e.tokens_total_in) || 0
    bucket.total_tokens_out += Number(e.tokens_total_out) || 0
    bucket.total_cost_usd += Number(e.cost_total_usd) || 0
    for (const call of e.llm_calls ?? []) {
      const m = call.model || 'unknown'
      if (!bucket.cost_breakdown[m]) {
        bucket.cost_breakdown[m] = { in: 0, out: 0, cost: 0 }
      }
      bucket.cost_breakdown[m].in += Number(call.tokens_in) || 0
      bucket.cost_breakdown[m].out += Number(call.tokens_out) || 0
      bucket.cost_breakdown[m].cost += Number(call.cost_usd) || 0
    }
  }

  // Upsert por bucket (UNIQUE org+agent+date)
  let rolled = 0
  for (const b of buckets.values()) {
    const { error: upErr } = await supabase
      .from('ai_costs_daily')
      .upsert(
        {
          organization_id: b.org_id,
          agent_id: b.agent_id,
          date: b.date,
          total_executions: b.total_executions,
          total_tokens_in: b.total_tokens_in,
          total_tokens_out: b.total_tokens_out,
          total_cost_usd: Number(b.total_cost_usd.toFixed(6)),
          cost_breakdown: b.cost_breakdown,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,agent_id,date' },
      )
    if (upErr) {
      console.warn(`[rollup] upsert falhou para ${b.org_id}/${b.agent_id}/${b.date}:`, upErr.message)
      continue
    }
    rolled++
  }

  return { rolled, range: { from: fromDate, to: toDate } }
}
