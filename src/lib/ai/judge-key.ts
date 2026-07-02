// =====================================================
// JUDGE KEY RESOLVER (Onda 13.6 — BYO total)
//
// Usado por: proposals, test-runner, evals, store-analyzer, actions-engine.
// NUNCA cai pra process.env (BYO total). Worder nao paga IA.
//
// 1) tenta organization_api_keys do provider do agente
// 2) fallback openai da propria org (juiz universal/barato)
// 3) sem nenhuma -> retorna null (caller decide skip silencioso ou erro)
// =====================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { decodeProviderKey } from './provider-key-codec'

export interface JudgeKeyResolved {
  apiKey: string
  baseUrl?: string
  /** provider efetivamente resolvido (pode diferir do `agentProvider` se caiu pro fallback openai) */
  provider: string
}

async function tryOne(
  supabase: SupabaseClient,
  organizationId: string,
  provider: string
): Promise<JudgeKeyResolved | null> {
  const { data } = await supabase
    .from('organization_api_keys')
    .select('api_key, base_url')
    .eq('organization_id', organizationId)
    .eq('provider', provider)
    .eq('is_active', true)
    .maybeSingle()
  if (!data?.api_key) return null
  return { apiKey: decodeProviderKey(data.api_key), baseUrl: data.base_url ?? undefined, provider }
}

export async function resolveJudgeKey(
  supabase: SupabaseClient,
  organizationId: string,
  agentProvider: string | null | undefined
): Promise<JudgeKeyResolved | null> {
  if (agentProvider) {
    const r = await tryOne(supabase, organizationId, agentProvider)
    if (r) return r
  }
  if (agentProvider !== 'openai') {
    const r = await tryOne(supabase, organizationId, 'openai')
    if (r) return r
  }
  return null
}
