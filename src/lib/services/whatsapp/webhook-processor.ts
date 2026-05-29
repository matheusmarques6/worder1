// =============================================
// WhatsApp Webhook Processor (Meta Cloud API)
// Unified handler for all Meta webhook events
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  verifyWebhookSignature,
  extractMessageText,
  getMessageType,
  normalizePhone,
} from '@/lib/whatsapp/cloud-api'
import { upsertConversation } from './conversation-service'
import { updateMessageStatus } from './message-service'
import { logger } from './logger'
import type {
  MetaWebhookEntry,
  MetaWebhookMessage,
  MetaWebhookStatus,
  WhatsAppInstance,
  MessageType,
} from './types'

const LOG_PREFIX = 'WebhookProcessor'

// =============================================
// VERIFY SIGNATURE
// =============================================

export async function verifySignature(
  rawBody: string,
  signature: string | null
): Promise<boolean> {
  if (!signature) return false
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) {
    // Fail closed em produção. Sem APP_SECRET configurado é erro fatal —
    // qualquer um pode POSTAR webhook forjado e a gente processa.
    if (process.env.NODE_ENV === 'production') {
      logger.error(LOG_PREFIX, 'META_APP_SECRET not configured in production — refusing webhook')
      return false
    }
    logger.warn(LOG_PREFIX, 'META_APP_SECRET not configured (non-prod), skipping verification')
    return false
  }
  return verifyWebhookSignature(rawBody, signature, appSecret)
}

// =============================================
// VERIFY TOKEN (GET request)
// =============================================

export async function verifyWebhookToken(
  mode: string | null,
  token: string | null,
  challenge: string | null
): Promise<{ valid: boolean; challenge?: string }> {
  if (mode !== 'subscribe') return { valid: false }
  if (!token) return { valid: false }

  // 1. Per-instance verify tokens (Cloud + Evolution)
  const { data: instance } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('id, organization_id')
    .eq('webhook_verify_token', token)
    .limit(1)
    .maybeSingle()

  if (instance) {
    await supabaseAdmin
      .from('whatsapp_instances')
      .update({ webhook_verified: true })
      .eq('id', instance.id)
    return { valid: true, challenge: challenge || '' }
  }

  // 2. Per-org verify tokens (legacy whatsapp_configs row created by /api/whatsapp/connect)
  const { data: config } = await supabaseAdmin
    .from('whatsapp_configs')
    .select('id, organization_id')
    .eq('webhook_verify_token', token)
    .limit(1)
    .maybeSingle()

  if (config) {
    await supabaseAdmin
      .from('whatsapp_configs')
      .update({ webhook_verified: true })
      .eq('id', config.id)
    return { valid: true, challenge: challenge || '' }
  }

  // 3. Global fallback (single tenant / dev).
  // Onda 3 D.4 — env var canonicalized to WHATSAPP_WEBHOOK_VERIFY_TOKEN.
  // (Was: META_WEBHOOK_VERIFY_TOKEN || WHATSAPP_VERIFY_TOKEN.)
  const globalToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  if (globalToken && token === globalToken) {
    return { valid: true, challenge: challenge || '' }
  }

  return { valid: false }
}

// =============================================
// PROCESS WEBHOOK PAYLOAD
// =============================================

export async function processWebhookPayload(
  body: { object?: string; entry?: MetaWebhookEntry[] }
): Promise<void> {
  if (body.object !== 'whatsapp_business_account') return

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue

      const value = change.value
      const phoneNumberId = value.metadata?.phone_number_id
      if (!phoneNumberId) continue

      // Find instance by phone_number_id
      const instance = await findInstanceByPhoneNumberId(phoneNumberId)
      if (!instance) {
        logger.warn(LOG_PREFIX, `Unknown phone_number_id: ${phoneNumberId}`)
        continue
      }

      // Process messages
      for (const message of value.messages || []) {
        await processIncomingMessage(instance, message, value.contacts)
      }

      // Process status updates
      for (const status of value.statuses || []) {
        await processStatusUpdate(instance, status)
      }
    }
  }
}

// =============================================
// PROCESS INCOMING MESSAGE
// =============================================

async function processIncomingMessage(
  instance: WhatsAppInstance,
  message: MetaWebhookMessage,
  contacts?: Array<{ wa_id: string; profile: { name: string } }>
): Promise<void> {
  try {
    const contactPhone = normalizePhone(message.from)
    const contactInfo = contacts?.find((c) => c.wa_id === message.from)
    const contactName = contactInfo?.profile?.name || contactPhone
    const messageText = extractMessageText(message as any)
    const messageType = getMessageType(message as any) as MessageType

    logger.info(LOG_PREFIX, `Incoming ${messageType} from ${contactPhone}`)

    // 1. Upsert contact in CRM
    const contactId = await upsertContact(
      instance.organization_id,
      instance.store_id,
      contactPhone,
      contactName
    )

    // 2. Upsert conversation (handles dedup via ON CONFLICT)
    const convResult = await upsertConversation({
      organizationId: instance.organization_id,
      storeId: instance.store_id,
      instanceId: instance.id,
      contactPhone,
      contactName,
      contactId,
      origin: message.referral ? 'ad' : 'organic',
      adReferral: message.referral as any,
    })

    if (!convResult.data) {
      logger.error(LOG_PREFIX, 'Failed to upsert conversation', convResult.error)
      return
    }

    const conversation = convResult.data

    // 3. Insert message (dedup via wamid UNIQUE)
    const mediaData = extractMediaData(message)
    const { error: msgError } = await supabaseAdmin
      .from('whatsapp_messages')
      .upsert(
        {
          organization_id: instance.organization_id,
          conversation_id: conversation.id,
          wamid: message.id,
          direction: 'inbound',
          message_type: messageType,
          content: messageText || null,
          media_url: null,
          media_mime_type: mediaData.mimeType,
          media_filename: mediaData.filename,
          media_id: mediaData.mediaId,
          sender_type: 'contact',
          status: 'delivered',
          is_from_me: false,
          is_internal_note: false,
          context_wamid: message.context?.id,
          metadata: {
            raw_type: message.type,
            ...(message.location ? { location: message.location } : {}),
            ...(message.contacts ? { contacts: message.contacts } : {}),
            ...(message.interactive ? { interactive: message.interactive } : {}),
            ...(message.order ? { order: message.order } : {}),
          },
        },
        { onConflict: 'wamid' }
      )

    if (msgError) {
      logger.error(LOG_PREFIX, 'Failed to save message', msgError)
      return
    }

    // 4. Update conversation metadata
    const windowExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: (messageText || `[${messageType}]`).substring(0, 100),
        last_message_direction: 'inbound',
        unread_count: (conversation.unread_count || 0) + 1,
        service_window_expires_at: windowExpires,
        status: conversation.status === 'resolved' ? 'open' : conversation.status,
        contact_name: contactName !== contactPhone ? contactName : conversation.contact_name,
      })
      .eq('id', conversation.id)

    // 5. Check business hours for auto-reply
    await checkBusinessHoursAutoReply(instance, conversation)

    // 6. Trigger AI chatbot if bot is active
    if (conversation.bot_active && conversation.ai_agent_id && messageText) {
      try {
        const { handleAIResponse } = await import('./ai-chatbot-service')
        await handleAIResponse(
          conversation.id,
          instance.organization_id,
          instance.id,
          contactPhone,
          messageText
        )
      } catch (aiErr) {
        logger.error(LOG_PREFIX, 'AI response failed', aiErr)
      }
    }

    // 7. Check opt-in status — auto opt-in on first message
    await supabaseAdmin
      .from('whatsapp_opt_status')
      .upsert(
        {
          organization_id: instance.organization_id,
          phone: contactPhone,
          contact_id: contactId,
          status: 'opted_in',
          opted_in_at: new Date().toISOString(),
          opt_in_source: 'organic',
        },
        { onConflict: 'organization_id,phone', ignoreDuplicates: true }
      )

    // 8. Emit automation events (event_logs) — fires flow triggers
    try {
      await emitAutomationEventsForInboundMessage({
        organizationId: instance.organization_id,
        contactId,
        contactPhone,
        messageText: messageText || '',
        messageType,
        conversationId: conversation.id,
        hasReferral: !!message.referral,
        referral: message.referral as any,
      })
    } catch (emitErr) {
      logger.error(LOG_PREFIX, 'Failed to emit automation events', emitErr)
    }

    logger.info(LOG_PREFIX, `Message processed: ${message.id}`)
  } catch (err) {
    logger.error(LOG_PREFIX, 'Error processing message', err)
  }
}

// =============================================
// EMIT AUTOMATION EVENTS
// =============================================
// Inserts event_logs so the EventProcessor (cron + queue) can pick them up
// and fire matching flow automations.
async function emitAutomationEventsForInboundMessage(args: {
  organizationId: string
  contactId: string | null | undefined
  contactPhone: string
  messageText: string
  messageType: string
  conversationId: string
  hasReferral: boolean
  referral?: { source_id?: string; source_type?: string; source_url?: string; headline?: string; body?: string; ctwa_clid?: string }
}): Promise<void> {
  const {
    organizationId,
    contactId,
    contactPhone,
    messageText,
    messageType,
    conversationId,
    hasReferral,
    referral,
  } = args

  const basePayload = {
    contact_phone: contactPhone,
    conversation_id: conversationId,
    message_text: messageText,
    message_type: messageType,
  }

  // 1. whatsapp_received (always)
  const events: Array<{ event_type: string; payload: Record<string, any> }> = [
    {
      event_type: 'whatsapp_received',
      payload: basePayload,
    },
  ]

  // 2. whatsapp_keyword (for keyword-matching automations; filter applied at match time)
  if (messageText && messageText.trim().length > 0) {
    events.push({
      event_type: 'whatsapp_keyword',
      payload: basePayload,
    })
  }

  // 3. whatsapp_first_message — only if this is the contact's first inbound message
  if (contactId) {
    const { count } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
    // We just inserted the current message, so count === 1 means first
    if (count === 1) {
      events.push({
        event_type: 'whatsapp_first_message',
        payload: basePayload,
      })
    }
  }

  // 4. ctwa_ad — only if message has referral (click-to-WhatsApp ad)
  if (hasReferral && referral) {
    events.push({
      event_type: 'ctwa_ad',
      payload: {
        ...basePayload,
        ad_id: referral.source_id,
        source_type: referral.source_type,
        source_url: referral.source_url,
        ctwa_clid: referral.ctwa_clid,
        headline: referral.headline,
        body: referral.body,
      },
    })
  }

  // Insert all events in a single call
  const rows = events.map((e) => ({
    organization_id: organizationId,
    event_type: e.event_type,
    contact_id: contactId ?? null,
    payload: e.payload,
    source: 'whatsapp_webhook',
    processed: false,
  }))

  if (rows.length > 0) {
    const { error } = await supabaseAdmin.from('event_logs').insert(rows)
    if (error) {
      logger.error(LOG_PREFIX, `Failed to insert event_logs: ${error.message}`)
    } else {
      logger.info(LOG_PREFIX, `Emitted ${rows.length} automation event(s) for msg from ${contactPhone}`)
    }
  }
}

// =============================================
// PROCESS STATUS UPDATE
// =============================================

async function processStatusUpdate(
  instance: WhatsAppInstance,
  status: MetaWebhookStatus
): Promise<void> {
  try {
    const errorCode = status.errors?.[0]?.code?.toString()
    const errorMessage = status.errors?.[0]?.message || status.errors?.[0]?.title

    await updateMessageStatus(
      status.id,
      status.status as any,
      errorCode,
      errorMessage
    )

    // Handle specific error codes
    if (errorCode) {
      await handleErrorCode(instance, parseInt(errorCode), status)
    }

    logger.debug(LOG_PREFIX, `Status update: ${status.id} -> ${status.status}`)
  } catch (err) {
    logger.error(LOG_PREFIX, 'Error processing status', err)
  }
}

// =============================================
// ERROR CODE HANDLING
// =============================================

async function handleErrorCode(
  instance: WhatsAppInstance,
  code: number,
  status: MetaWebhookStatus
): Promise<void> {
  switch (code) {
    case 130472: // Rate limit
      logger.warn(LOG_PREFIX, 'Rate limit hit, should pause sending')
      break
    case 131026: // Undeliverable
      logger.warn(LOG_PREFIX, `Message undeliverable to ${status.recipient_id}`)
      break
    case 131047: // Re-engagement required
      logger.info(LOG_PREFIX, `Re-engagement required for ${status.recipient_id}`)
      break
    case 368: // Account blocked
      logger.error(LOG_PREFIX, 'Account temporarily blocked! Pause all sends')
      await supabaseAdmin
        .from('whatsapp_instances')
        .update({ is_active: false, metadata: { blocked_at: new Date().toISOString() } })
        .eq('id', instance.id)
      break
  }
}

// =============================================
// HELPERS
// =============================================

async function findInstanceByPhoneNumberId(
  phoneNumberId: string
): Promise<WhatsAppInstance | null> {
  const { data } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .eq('is_active', true)
    .single()
  return data
}

async function upsertContact(
  organizationId: string,
  storeId: string | undefined,
  phone: string,
  name: string
): Promise<string | undefined> {
  // Try to find existing contact
  let query = supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('organization_id', organizationId)
    .or(`whatsapp.eq.${phone},phone.eq.${phone}`)
    .limit(1)

  if (storeId) query = query.eq('store_id', storeId)

  const { data: existing } = await query.maybeSingle()
  if (existing) return existing.id

  // Create new contact
  const { data: created } = await supabaseAdmin
    .from('contacts')
    .insert({
      organization_id: organizationId,
      store_id: storeId,
      whatsapp: phone,
      phone,
      full_name: name !== phone ? name : undefined,
      first_name: name !== phone ? name.split(' ')[0] : undefined,
      source: 'whatsapp',
    })
    .select('id')
    .maybeSingle()

  return created?.id
}

function extractMediaData(message: MetaWebhookMessage): {
  mediaId?: string
  mimeType?: string
  filename?: string
} {
  if (message.image) {
    return { mediaId: message.image.id, mimeType: message.image.mime_type }
  }
  if (message.video) {
    return { mediaId: message.video.id, mimeType: message.video.mime_type }
  }
  if (message.audio) {
    return { mediaId: message.audio.id, mimeType: message.audio.mime_type }
  }
  if (message.document) {
    return {
      mediaId: message.document.id,
      mimeType: message.document.mime_type,
      filename: message.document.filename,
    }
  }
  if (message.sticker) {
    return { mediaId: message.sticker.id, mimeType: message.sticker.mime_type }
  }
  return {}
}

async function checkBusinessHoursAutoReply(
  instance: WhatsAppInstance,
  conversation: any
): Promise<void> {
  try {
    // Get business hours config
    const now = new Date()
    const { data: hours } = await supabaseAdmin
      .from('whatsapp_business_hours')
      .select('*')
      .eq('organization_id', instance.organization_id)
      .eq('day_of_week', now.getDay())
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (!hours) return // No business hours configured

    if (!hours.enable_auto_reply) return

    // Check if current time is within hours (simple check using UTC)
    const tz = hours.timezone || 'America/Sao_Paulo'
    const localTime = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    }).format(now)

    const [h, m] = localTime.split(':').map(Number)
    const currentMinutes = h * 60 + m

    const [startH, startM] = hours.start_time.split(':').map(Number)
    const startMinutes = startH * 60 + startM

    const [endH, endM] = hours.end_time.split(':').map(Number)
    const endMinutes = endH * 60 + endM

    const isWithinHours = currentMinutes >= startMinutes && currentMinutes <= endMinutes

    if (!isWithinHours && hours.out_of_hours_message) {
      // Send auto-reply
      const { WhatsAppCloudAPI } = await import('@/lib/whatsapp/cloud-api')
      const client = new WhatsAppCloudAPI({
        phoneNumberId: instance.phone_number_id,
        accessToken: instance.access_token,
      })

      const autoMessage = hours.out_of_hours_message
        .replace('{horario_abertura}', hours.start_time)

      await client.sendText(conversation.contact_phone, autoMessage)

      // Save the auto-reply message
      await supabaseAdmin.from('whatsapp_messages').insert({
        organization_id: instance.organization_id,
        conversation_id: conversation.id,
        direction: 'outbound',
        message_type: 'text',
        content: autoMessage,
        sender_type: 'system',
        status: 'sent',
        is_from_me: true,
        is_internal_note: false,
      })
    }
  } catch (err) {
    logger.error(LOG_PREFIX, 'Error checking business hours', err)
  }
}
