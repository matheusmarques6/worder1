// =============================================
// Experiments (A/B testing) — variantes deterministicamente atribuídas
// por hash da conversation_id. Usado pelo runner pra escolher qual
// agent_version_id rodar e tagar a execution com experiment_id +
// experiment_variant pra análise posterior.
//
// Variant shape:
//   { id: 'A', name: 'control', agent_version_id?: uuid|null, traffic_pct: 50 }
//
// agent_version_id null = roda o agente como está (control). Para uma
// variante de teste, aponte pra uma version snapshotada antes.
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import crypto from 'crypto'

export interface ExperimentVariant {
  id: string
  name: string
  agent_version_id?: string | null
  traffic_pct: number
}

export interface ExperimentRow {
  id: string
  agent_id: string
  organization_id: string
  name: string
  status: 'draft' | 'running' | 'ended'
  variants: ExperimentVariant[]
  traffic_split_method: string
  started_at: string | null
  ended_at: string | null
  winning_variant: string | null
  metrics_by_variant: Record<string, unknown>
}

export interface VariantAssignment {
  experimentId: string
  variantId: string
  agentVersionId: string | null
}

/**
 * Determina qual variante uma conversa deve receber em um experimento
 * em execução. Usa hash determinístico da conversation_id (estável entre
 * requests). Retorna null se não há experimento ativo pro agente.
 */
export async function assignVariant(
  agentId: string,
  conversationId: string,
): Promise<VariantAssignment | null> {
  const supabase = getSupabaseAdmin()
  const { data: experiment } = await supabase
    .from('ai_experiments')
    .select('id, variants, traffic_split_method')
    .eq('agent_id', agentId)
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!experiment) return null
  const variants = (experiment.variants as ExperimentVariant[]) ?? []
  if (variants.length === 0) return null

  const total = variants.reduce((acc, v) => acc + (v.traffic_pct || 0), 0)
  if (total <= 0) return null

  // Hash da conversa pra um número [0, 100)
  const hash = crypto.createHash('sha256').update(conversationId).digest('hex')
  const hashInt = parseInt(hash.slice(0, 8), 16)
  const bucket = (hashInt % 10000) / 100 // 0.00 - 99.99

  let cumulative = 0
  for (const v of variants) {
    cumulative += v.traffic_pct
    if (bucket < (cumulative / total) * 100) {
      return {
        experimentId: experiment.id as string,
        variantId: v.id,
        agentVersionId: v.agent_version_id ?? null,
      }
    }
  }
  // fallback: última variante
  const last = variants[variants.length - 1]
  return {
    experimentId: experiment.id as string,
    variantId: last.id,
    agentVersionId: last.agent_version_id ?? null,
  }
}

/**
 * Calcula métricas por variante a partir de ai_executions e atualiza
 * metrics_by_variant. Para uso no /end ou em background.
 */
export async function computeVariantMetrics(experimentId: string): Promise<{
  metricsByVariant: Record<string, {
    executions: number
    converted: number
    escalated: number
    total_revenue_brl: number
    total_cost_usd: number
    conversion_rate: number
  }>
  winningVariant: string | null
}> {
  const supabase = getSupabaseAdmin()
  const { data: execs } = await supabase
    .from('ai_executions')
    .select('experiment_variant, outcome, revenue_attributed_brl, cost_total_usd')
    .eq('experiment_id', experimentId)

  const metrics: Record<string, {
    executions: number
    converted: number
    escalated: number
    total_revenue_brl: number
    total_cost_usd: number
    conversion_rate: number
  }> = {}

  for (const e of execs ?? []) {
    const v = (e.experiment_variant as string) || 'unknown'
    if (!metrics[v]) {
      metrics[v] = {
        executions: 0,
        converted: 0,
        escalated: 0,
        total_revenue_brl: 0,
        total_cost_usd: 0,
        conversion_rate: 0,
      }
    }
    metrics[v].executions++
    if (e.outcome === 'converted') metrics[v].converted++
    if (e.outcome === 'escalated') metrics[v].escalated++
    metrics[v].total_revenue_brl += Number(e.revenue_attributed_brl) || 0
    metrics[v].total_cost_usd += Number(e.cost_total_usd) || 0
  }

  // Conversion rates + winner
  let bestRate = -1
  let winner: string | null = null
  for (const k of Object.keys(metrics)) {
    const m = metrics[k]
    m.conversion_rate = m.executions > 0 ? +(m.converted / m.executions).toFixed(4) : 0
    if (m.executions >= 30 && m.conversion_rate > bestRate) {
      bestRate = m.conversion_rate
      winner = k
    }
  }
  return { metricsByVariant: metrics, winningVariant: winner }
}
