// =====================================================
// EMBEDDING KEY RESOLVER (Onda 13.6 — BYO total)
//
// Embeddings (knowledge base / RAG) usam OpenAI text-embedding-3-small.
// Antes: lia `process.env.OPENAI_API_KEY` (Worder pagava). Agora: leitura
// estrita de `organization_api_keys` provider='openai' (cliente paga).
//
// SEM fallback pra env. Sem chave -> retorna null e knowledge base degrada
// graciosamente (cobrindo pelo fallback nao-fatal da Onda 13 no engine).
// =====================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { decodeProviderKey } from './provider-key-codec'

export async function resolveEmbeddingKey(
  supabase: SupabaseClient,
  organizationId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('organization_api_keys')
    .select('api_key')
    .eq('organization_id', organizationId)
    .eq('provider', 'openai')
    .eq('is_active', true)
    .maybeSingle()
  return data?.api_key ? decodeProviderKey(data.api_key) : null
}
