// =============================================
// Onda 13 / P1-1 — preflight de ativacao do agente.
//
// Antes: agente podia ser ativado (is_active=true) apontando pra um
// provider SEM chave em organization_api_keys. A falha so aparecia na
// 1a mensagem real — cloud-runner desabilitava a conversa do cliente
// com 'no_valid_api_key', silenciosamente.
//
// Agora: PUT/PATCH/POST de agente validam ANTES quando a mudanca toca
// is_active ou provider e o estado final e ativo. Falha => 400
// provider_key_missing, e a UI aponta pra pagina de API Keys.
// =============================================

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProviderKeyCheckResult {
  ok: boolean
  provider?: string
}

/**
 * Valida que `provider` tem chave ativa na org. So chame quando o estado
 * final do agente for is_active=true.
 */
export async function hasActiveProviderKey(
  supabase: SupabaseClient,
  organizationId: string,
  provider: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('organization_api_keys')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('provider', provider)
    .eq('is_active', true)
    .maybeSingle()
  return Boolean(data)
}

/** Corpo padrao do 400 — a UI conhece o code e linka pra API Keys. */
export function providerKeyMissingResponse(provider: string) {
  return {
    error: 'provider_key_missing',
    provider,
    message: `O provedor "${provider}" não tem chave de API ativa. Cadastre em Agentes IA → API Keys antes de ativar o agente.`,
  }
}
