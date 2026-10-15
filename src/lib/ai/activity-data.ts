// Leitura dos desfechos para a Atividade (plano IA M5 passo 29).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { OutcomeRow } from './activity-summary'

export const OUTCOME_COLUMNS =
  'conversation_id, agent_id, entry_id, started_at, first_response_ms, messages_sent, resolved_without_human, transferred, ' +
  'handoff_reason, order_id, revenue, topic, incentives_offered, incentives_used, discount_total, blocked_count, gap, cost_usd, tokens'

/** Fuso da loja para dias/horas: São Paulo (o protótipo e a base são BR). */
export const STORE_TZ_OFFSET_MINUTES = -180

export const PERIODS = [1, 7, 30, 90] as const

export function parsePeriod(raw: string | null): number {
  const n = Number(raw)
  return (PERIODS as readonly number[]).includes(n) ? n : 7
}

export async function loadOutcomes(
  supabase: SupabaseClient, organizationId: string, from: Date, agentId?: string | null, limit = 20000,
): Promise<OutcomeRow[]> {
  let query = supabase
    .from('ai_conversation_outcomes')
    .select(OUTCOME_COLUMNS)
    .eq('organization_id', organizationId)
    .gte('started_at', from.toISOString())
    .order('started_at', { ascending: false })
    .limit(limit)
  if (agentId) query = query.eq('agent_id', agentId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as OutcomeRow[]
}
