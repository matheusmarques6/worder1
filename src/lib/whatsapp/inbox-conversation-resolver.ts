// src/lib/whatsapp/inbox-conversation-resolver.ts
// Resolve em qual tabela base uma conversa do inbox unificado vive.
//
// O inbox lista conversas pela view whatsapp_inbox_conversations (UNION ALL
// de whatsapp_cloud_conversations + whatsapp_conversations). A view nao e
// atualizavel, entao toda acao (status, resolve, assign, read) precisa
// descobrir a tabela base antes do UPDATE. Estrategia: cloud primeiro,
// fallback legacy — mesmo padrao do RPC resolve_inbox_conversation
// (worder-cloud-api-fixes/05A-inbox-unification.sql). Ids sao UUIDs
// (gen_random_uuid) unicos entre as tabelas, sem risco de colisao pratica.
import type { SupabaseClient } from '@supabase/supabase-js'

export type InboxConversationTable =
  | 'whatsapp_cloud_conversations'
  | 'whatsapp_conversations'

export interface ResolvedInboxConversation {
  table: InboxConversationTable
  provider: 'cloud' | 'evolution'
  row: {
    id: string
    organization_id: string
    status: string | null
    contact_id: string | null
    /** So presente quando table === 'whatsapp_conversations' */
    unified_contact_id?: string | null
  }
}

export async function resolveInboxConversation(
  supabase: SupabaseClient,
  conversationId: string,
  orgId: string
): Promise<ResolvedInboxConversation | null> {
  const { data: cloud, error: cloudError } = await supabase
    .from('whatsapp_cloud_conversations')
    .select('id, organization_id, status, contact_id')
    .eq('id', conversationId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (cloudError) throw cloudError
  if (cloud) {
    return { table: 'whatsapp_cloud_conversations', provider: 'cloud', row: cloud }
  }

  const { data: legacy, error: legacyError } = await supabase
    .from('whatsapp_conversations')
    .select('id, organization_id, status, contact_id, unified_contact_id')
    .eq('id', conversationId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (legacyError) throw legacyError
  if (legacy) {
    return { table: 'whatsapp_conversations', provider: 'evolution', row: legacy }
  }

  return null
}
