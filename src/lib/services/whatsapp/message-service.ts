// =============================================
// WhatsApp Message Service
// Handles: send, receive, media, status updates
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  WhatsAppCloudAPI,
  normalizePhone,
  type SendMessageResult,
} from '@/lib/whatsapp/cloud-api'
import { logger } from './logger'
import type {
  Message,
  MessageDirection,
  MessageType,
  MessageStatus,
  WhatsAppInstance,
  ServiceResult,
} from './types'

const LOG_PREFIX = 'MessageService'

// =============================================
// GET MESSAGES
// =============================================

export interface ListMessagesParams {
  conversationId: string
  organizationId: string
  limit?: number
  before?: string
  after?: string
}

export async function listMessages(
  params: ListMessagesParams
): Promise<ServiceResult<{ messages: Message[]; hasMore: boolean }>> {
  const { conversationId, organizationId, limit = 50, before, after } = params

  let query = supabaseAdmin
    .from('whatsapp_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (before) query = query.lt('created_at', before)
  if (after) query = query.gt('created_at', after)

  const { data, error } = await query

  if (error) {
    logger.error(LOG_PREFIX, 'Failed to list messages', error)
    return { error: error.message }
  }

  const messages = (data || []).reverse()
  const hasMore = messages.length > limit
  if (hasMore) messages.shift()

  return { data: { messages, hasMore } }
}

// =============================================
// SEND MESSAGE
// =============================================

export interface SendMessageParams {
  conversationId: string
  organizationId: string
  instanceId: string
  to: string
  messageType: MessageType
  content?: string
  mediaUrl?: string
  mediaMimeType?: string
  mediaFilename?: string
  mediaId?: string
  templateName?: string
  templateLanguage?: string
  templateComponents?: unknown[]
  interactiveData?: Record<string, unknown>
  quotedMessageWamid?: string
  senderId?: string
  senderName?: string
  senderType?: 'agent' | 'bot' | 'system'
}

export async function sendMessage(
  params: SendMessageParams
): Promise<ServiceResult<Message>> {
  const {
    conversationId,
    organizationId,
    instanceId,
    to,
    messageType,
    content,
    mediaUrl,
    mediaMimeType,
    mediaFilename,
    mediaId,
    templateName,
    templateLanguage,
    templateComponents,
    interactiveData,
    quotedMessageWamid,
    senderId,
    senderName,
    senderType = 'agent',
  } = params

  // 1. Check service window for non-template messages
  if (messageType !== 'template') {
    const { data: conv } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('service_window_expires_at')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .single()

    if (conv?.service_window_expires_at) {
      const windowExpires = new Date(conv.service_window_expires_at)
      if (windowExpires < new Date()) {
        return {
          error: 'Janela de servico expirada. Somente templates permitidos.',
          code: 131047,
        }
      }
    }
  }

  // 2. Get instance config
  const instance = await getInstance(instanceId, organizationId)
  if (!instance) {
    return { error: 'WhatsApp instance not found' }
  }

  const client = new WhatsAppCloudAPI({
    phoneNumberId: instance.phone_number_id,
    accessToken: instance.access_token,
    wabaId: instance.waba_id,
  })

  // 3. Insert message optimistically with pending status
  // message_id é NOT NULL no banco: usa id temporário até o wamid chegar
  const tempMessageId = `out-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const { data: pendingMsg, error: insertError } = await supabaseAdmin
    .from('whatsapp_messages')
    .insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      instance_id: instanceId,
      store_id: instance.store_id || null,
      message_id: tempMessageId,
      to_number: to,
      provider: 'meta_cloud',
      direction: 'outbound' as MessageDirection,
      message_type: messageType,
      content: content ?? '',
      text_body: content ?? null,
      media_url: mediaUrl,
      media_mime_type: mediaMimeType,
      media_filename: mediaFilename,
      media_id: mediaId,
      template_name: templateName,
      template_data: templateComponents ? { components: templateComponents, language: templateLanguage } : undefined,
      interactive_data: interactiveData,
      context_wamid: quotedMessageWamid,
      sender_id: senderId,
      sender_name: senderName,
      sender_type: senderType,
      status: 'pending' as MessageStatus,
      is_from_me: true,
      is_internal_note: false,
    })
    .select()
    .single()

  if (insertError) {
    logger.error(LOG_PREFIX, 'Failed to insert pending message', insertError)
    return { error: insertError.message }
  }

  // 4. Send via Meta Cloud API
  try {
    let result: SendMessageResult

    switch (messageType) {
      case 'text':
        result = await client.sendText(to, content || '')
        break
      case 'image':
        result = await client.sendImage(
          to,
          mediaId ? { id: mediaId } : { link: mediaUrl || '' },
          content
        )
        break
      case 'video':
        result = await client.sendVideo(
          to,
          mediaId ? { id: mediaId } : { link: mediaUrl || '' },
          content
        )
        break
      case 'audio':
        result = await client.sendAudio(
          to,
          mediaId ? { id: mediaId } : { link: mediaUrl || '' }
        )
        break
      case 'document':
        result = await client.sendDocument(
          to,
          {
            ...(mediaId ? { id: mediaId } : { link: mediaUrl || '' }),
            filename: mediaFilename,
          },
          content
        )
        break
      case 'sticker':
        result = await client.sendSticker(
          to,
          mediaId ? { id: mediaId } : { link: mediaUrl || '' }
        )
        break
      case 'template':
        result = await client.sendTemplate(
          to,
          templateName || '',
          templateLanguage || 'pt_BR',
          templateComponents as any[]
        )
        break
      case 'interactive':
        if (interactiveData?.type === 'button') {
          result = await client.sendButtons(
            to,
            (interactiveData.body as string) || '',
            (interactiveData.buttons as any[]) || []
          )
        } else {
          result = await client.sendList(
            to,
            (interactiveData?.body as string) || '',
            (interactiveData?.buttonText as string) || 'Menu',
            (interactiveData?.sections as any[]) || []
          )
        }
        break
      case 'location':
        const loc = typeof content === 'string' ? JSON.parse(content) : content
        result = await client.sendLocation(to, loc)
        break
      default:
        result = await client.sendText(to, content || '')
    }

    const wamid = result.messages?.[0]?.id

    // 5. Update message with wamid and sent status
    const { data: sentMsg } = await supabaseAdmin
      .from('whatsapp_messages')
      .update({
        wamid,
        message_id: wamid || tempMessageId,
        status: 'sent' as MessageStatus,
      })
      .eq('id', pendingMsg.id)
      .select()
      .single()

    // 6. Update conversation
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content?.substring(0, 100) || `[${messageType}]`,
        last_message_direction: 'outbound',
        status: 'open',
      })
      .eq('id', conversationId)

    // Track first response time
    const { data: conv } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('first_response_at, is_contact_initiated')
      .eq('id', conversationId)
      .single()

    if (conv && !conv.first_response_at && conv.is_contact_initiated && senderType === 'agent') {
      await supabaseAdmin
        .from('whatsapp_conversations')
        .update({ first_response_at: new Date().toISOString() })
        .eq('id', conversationId)
    }

    return { data: sentMsg || pendingMsg }
  } catch (err: unknown) {
    const errorObj = err as { code?: number; message?: string }
    const errorCode = errorObj.code?.toString() || 'unknown'
    const errorMessage = errorObj.message || 'Failed to send message'

    // Update message as failed
    const { data: failedMsg } = await supabaseAdmin
      .from('whatsapp_messages')
      .update({
        status: 'failed' as MessageStatus,
        error_code: errorCode,
        error_message: errorMessage,
      })
      .eq('id', pendingMsg.id)
      .select()
      .single()

    logger.error(LOG_PREFIX, `Send failed: ${errorCode} - ${errorMessage}`)
    return { data: failedMsg || pendingMsg, error: errorMessage, code: errorObj.code }
  }
}

// =============================================
// SEND NOTE (internal)
// =============================================

export async function sendInternalNote(
  conversationId: string,
  organizationId: string,
  agentId: string,
  agentName: string,
  content: string
): Promise<ServiceResult<Message>> {
  // Insert as message (for timeline display)
  const { data: msg, error: msgError } = await supabaseAdmin
    .from('whatsapp_messages')
    .insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      message_id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      provider: 'internal',
      direction: 'outbound' as MessageDirection,
      message_type: 'note' as MessageType,
      content,
      sender_id: agentId,
      sender_name: agentName,
      sender_type: 'agent',
      status: 'sent' as MessageStatus,
      is_from_me: true,
      is_internal_note: true,
    })
    .select()
    .single()

  if (msgError) {
    logger.error(LOG_PREFIX, 'Failed to save note', msgError)
    return { error: msgError.message }
  }

  // Also save in notes table for separate querying
  await supabaseAdmin.from('whatsapp_notes').insert({
    organization_id: organizationId,
    conversation_id: conversationId,
    agent_id: agentId,
    agent_name: agentName,
    content,
  })

  return { data: msg }
}

// =============================================
// RETRY FAILED MESSAGE
// =============================================

export async function retryMessage(
  messageId: string,
  organizationId: string
): Promise<ServiceResult<Message>> {
  const { data: msg } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('*')
    .eq('id', messageId)
    .eq('organization_id', organizationId)
    .eq('status', 'failed')
    .single()

  if (!msg) {
    return { error: 'Message not found or not in failed state' }
  }

  // Get conversation for phone
  const { data: conv } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('contact_phone, instance_id')
    .eq('id', msg.conversation_id)
    .single()

  if (!conv || !conv.instance_id) {
    return { error: 'Conversation or instance not found' }
  }

  return sendMessage({
    conversationId: msg.conversation_id,
    organizationId,
    instanceId: conv.instance_id,
    to: conv.contact_phone,
    messageType: msg.message_type,
    content: msg.content,
    mediaUrl: msg.media_url,
    mediaMimeType: msg.media_mime_type,
    mediaFilename: msg.media_filename,
    mediaId: msg.media_id,
    templateName: msg.template_name,
    templateComponents: msg.template_data?.components,
    senderId: msg.sender_id,
    senderName: msg.sender_name,
    senderType: msg.sender_type,
  })
}

// =============================================
// UPDATE STATUS (from webhook)
// =============================================

export async function updateMessageStatus(
  wamid: string,
  status: MessageStatus,
  errorCode?: string,
  errorMessage?: string
): Promise<ServiceResult<void>> {
  const updates: Record<string, unknown> = { status }
  if (errorCode) updates.error_code = errorCode
  if (errorMessage) updates.error_message = errorMessage

  const { error } = await supabaseAdmin
    .from('whatsapp_messages')
    .update(updates)
    .eq('wamid', wamid)

  if (error) {
    logger.error(LOG_PREFIX, 'Failed to update message status', error)
    return { error: error.message }
  }
  return { data: undefined }
}

// =============================================
// MARK AS READ (Meta API)
// =============================================

export async function markMessagesAsRead(
  conversationId: string,
  organizationId: string
): Promise<ServiceResult<void>> {
  // Get latest inbound message wamid
  const { data: messages } = await supabaseAdmin
    .from('whatsapp_messages')
    .select('wamid, conversation_id')
    .eq('conversation_id', conversationId)
    .eq('organization_id', organizationId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)

  if (!messages || messages.length === 0) return { data: undefined }

  const latestWamid = messages[0].wamid
  if (!latestWamid) return { data: undefined }

  // Get instance to call Meta API
  const { data: conv } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('instance_id')
    .eq('id', conversationId)
    .single()

  if (!conv?.instance_id) return { data: undefined }

  const instance = await getInstance(conv.instance_id, organizationId)
  if (!instance) return { data: undefined }

  try {
    const client = new WhatsAppCloudAPI({
      phoneNumberId: instance.phone_number_id,
      accessToken: instance.access_token,
    })
    await client.markAsRead(latestWamid)
  } catch {
    // Non-critical, don't fail
  }

  return { data: undefined }
}

// =============================================
// UPLOAD MEDIA
// =============================================

export async function uploadMedia(
  instanceId: string,
  organizationId: string,
  fileData: ArrayBuffer,
  mimeType: string,
  filename?: string
): Promise<ServiceResult<{ mediaId: string }>> {
  const instance = await getInstance(instanceId, organizationId)
  if (!instance) return { error: 'Instance not found' }

  const client = new WhatsAppCloudAPI({
    phoneNumberId: instance.phone_number_id,
    accessToken: instance.access_token,
  })

  try {
    const result = await client.uploadMedia(fileData, mimeType, filename)
    return { data: { mediaId: result.id } }
  } catch (err: unknown) {
    const errorObj = err as { message?: string }
    logger.error(LOG_PREFIX, 'Media upload failed', err)
    return { error: errorObj.message || 'Upload failed' }
  }
}

// =============================================
// HELPERS
// =============================================

async function getInstance(
  instanceId: string,
  organizationId: string
): Promise<WhatsAppInstance | null> {
  const { data } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('*')
    .eq('id', instanceId)
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .single()
  return data
}
