// =============================================
// Mappers: payload cru do Supabase Realtime (linha das tabelas
// whatsapp_cloud_*) -> shapes que o InboxContent ja consome.
//
// MANTER EM SINCRONIA com o `formatted` do
// GET /api/whatsapp/inbox/conversations/[id]/messages (mensagens) e o
// `formatConversation` do GET /api/whatsapp/inbox/conversations
// (conversas). Se aquelas rotas mudarem o shape, mudar aqui junto.
// =============================================

import type { InboxMessage } from '@/types/inbox'
import { extractMessageText } from '@/lib/whatsapp/message-content'

/** Linha crua de whatsapp_cloud_messages (payload.new do realtime). */
export type CloudMessageRow = Record<string, any>

/** Linha crua de whatsapp_cloud_conversations (payload.new do realtime). */
export type CloudConversationRow = Record<string, any>

/**
 * Shape minimo de conversa que os callbacks do InboxContent leem
 * (store_id para o filtro de loja, resto para exibicao/refresh).
 */
export interface RealtimeConversationEvent {
  id: string
  organization_id: string
  store_id: string | null
  contact_id?: string
  phone_number: string
  contact_name: string
  status: string
  unread_count: number
  last_message_at?: string
  last_message_preview?: string
  last_message_direction?: 'inbound' | 'outbound'
  window_expires_at?: string
  updated_at?: string
}

/**
 * `InboxMessage` nao declara `media_storage_path` (campo interno usado so
 * pra re-assinar a URL de midia sob demanda — ver GET /messages linha 87).
 * Estendemos o retorno com esse campo opcional sem quebrar compat com
 * `InboxMessage` (qualquer consumidor que espera `InboxMessage` continua
 * funcionando; o campo extra e so mais informacao pra quem quiser usar).
 */
export type MappedInboxMessage = InboxMessage & {
  media_storage_path?: string | null
}

export function mapCloudMessageRow(row: CloudMessageRow): MappedInboxMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    meta_message_id: row.message_id,
    direction: row.direction,
    message_type: row.message_type || 'text',
    content: extractMessageText(row.content, row.text_body),
    // Midia: melhor esforco, mesmo shape/derivacao do GET /messages (linhas
    // 87-92) — sem re-assinar URL aqui (mapper e puro, sem IO); uma
    // mensagem inbound recem-inserida ja chega com signed URL fresca.
    media_url: row.media_url ?? null,
    media_filename: row.media_filename ?? null,
    media_mime_type: row.media_mime_type ?? null,
    media_storage_path: row.media_storage_path ?? null,
    status: row.status || 'sent',
    sent_by_bot: row.sent_by_bot || false,
    is_deleted: false,
    created_at: row.created_at || row.timestamp,
    delivered_at: row.delivered_at ?? null,
    read_at: row.read_at ?? null,
    error_code: row.error_code ?? undefined,
    error_message: row.error_message ?? undefined,
  }
}

export function mapCloudConversationRow(
  row: CloudConversationRow,
): RealtimeConversationEvent {
  const phoneNumber = row.contact_phone || row.wa_id || ''
  return {
    id: row.id,
    organization_id: row.organization_id,
    store_id: row.store_id ?? null,
    contact_id: row.contact_id,
    phone_number: phoneNumber,
    contact_name: row.contact_name || phoneNumber,
    status: row.status || 'open',
    unread_count: row.unread_count ?? 0,
    last_message_at: row.last_message_at,
    last_message_preview: row.last_message_preview,
    last_message_direction: row.last_message_direction,
    window_expires_at: row.window_expires_at,
    updated_at: row.updated_at,
  }
}
