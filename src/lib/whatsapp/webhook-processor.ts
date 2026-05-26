/**
 * WhatsApp webhook processor — pure, queue-driven.
 *
 * Extracted from src/app/api/whatsapp/cloud/webhook/route.ts (Sprint 1 / Fase 1).
 *
 * Responsibilities:
 *   - Resolve account by phone_number_id
 *   - Persist inbound messages (dedup by message_id)
 *   - Update conversation / contact / account counters
 *   - Update outbound message status from delivery receipts
 *   - Handle template status + category webhooks
 *   - Handle phone quality rating changes
 *   - Fire RuleEngine for conversation_started / message_received / contact_created
 *
 * Called from the QStash-triggered worker at /api/workers/whatsapp-webhook.
 * The webhook ingestor (route.ts) only validates HMAC, persists raw payload,
 * and publishes to QStash — no business logic runs in the public HTTP path.
 */

import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import {
  extractMessageText,
  getMessageType,
  normalizePhone,
  type WebhookMessage,
} from './cloud-api';
import { RuleEngine, type EventData } from '@/lib/services/automation/rule-engine';

export interface ProcessResult {
  processed: number;
  skipped: number;
  errors: number;
  details: Array<{ type: string; status: string; reason?: string }>;
}

export async function processWebhookPayload(payload: any): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, skipped: 0, errors: 0, details: [] };

  if (payload?.object !== 'whatsapp_business_account') {
    result.skipped++;
    result.details.push({ type: 'envelope', status: 'skipped', reason: 'not_whatsapp' });
    return result;
  }

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const field = change.field;
      const value = change.value;

      switch (field) {
        case 'messages': {
          const phoneNumberId = value?.metadata?.phone_number_id;
          if (!phoneNumberId) {
            result.skipped++;
            result.details.push({ type: 'change', status: 'skipped', reason: 'no_phone_number_id' });
            continue;
          }

          const { data: account } = await supabase
            .from('whatsapp_business_accounts')
            .select('*')
            .eq('phone_number_id', phoneNumberId)
            .single();

          if (!account) {
            result.skipped++;
            result.details.push({
              type: 'change',
              status: 'skipped',
              reason: `unknown_phone_number_id:${phoneNumberId}`,
            });
            continue;
          }

          for (const message of value.messages || []) {
            try {
              await processMessage(account, message, value.contacts);
              result.processed++;
              result.details.push({ type: 'message', status: 'ok' });
            } catch (err: any) {
              result.errors++;
              result.details.push({ type: 'message', status: 'error', reason: err?.message });
              console.error('[whatsapp-webhook-processor] processMessage error:', err);
            }
          }

          for (const status of value.statuses || []) {
            try {
              await processStatus(account, status);
              result.processed++;
              result.details.push({ type: 'status', status: 'ok' });
            } catch (err: any) {
              result.errors++;
              result.details.push({ type: 'status', status: 'error', reason: err?.message });
              console.error('[whatsapp-webhook-processor] processStatus error:', err);
            }
          }

          for (const errorEntry of value.errors || []) {
            result.details.push({
              type: 'error',
              status: 'logged',
              reason: `code:${errorEntry?.code}`,
            });
            console.error('[whatsapp-webhook-processor] Meta error:', errorEntry);
          }
          break;
        }

        case 'message_template_status_update': {
          try {
            await processTemplateStatusUpdate(value);
            result.processed++;
            result.details.push({ type: 'template_status', status: 'ok' });
          } catch (err: any) {
            result.errors++;
            result.details.push({ type: 'template_status', status: 'error', reason: err?.message });
            console.error('[whatsapp-webhook-processor] template status error:', err);
          }
          break;
        }

        case 'template_category_update': {
          try {
            await processTemplateCategoryUpdate(value);
            result.processed++;
            result.details.push({ type: 'template_category', status: 'ok' });
          } catch (err: any) {
            result.errors++;
            result.details.push({ type: 'template_category', status: 'error', reason: err?.message });
            console.error('[whatsapp-webhook-processor] template category error:', err);
          }
          break;
        }

        case 'phone_number_quality_update': {
          try {
            await processPhoneQualityUpdate(value);
            result.processed++;
            result.details.push({ type: 'phone_quality', status: 'ok' });
          } catch (err: any) {
            result.errors++;
            result.details.push({ type: 'phone_quality', status: 'error', reason: err?.message });
            console.error('[whatsapp-webhook-processor] phone quality error:', err);
          }
          break;
        }

        default:
          result.skipped++;
          result.details.push({ type: field || 'unknown', status: 'skipped', reason: 'unhandled_field' });
          break;
      }
    }
  }

  return result;
}

// ============================================================
// PROCESS INBOUND MESSAGE
// ============================================================

async function processMessage(
  account: any,
  message: WebhookMessage,
  contacts: Array<{ wa_id: string; profile: { name: string } }> | undefined
) {
  const phoneNumber = normalizePhone(message.from);
  const contactInfo = contacts?.find((c) => c.wa_id === message.from);
  const contactName = contactInfo?.profile?.name || phoneNumber;

  const contact = await getOrCreateContact(account, phoneNumber, contactName);
  const isNewContact = contact?.isNew || false;

  const conversation = await getOrCreateConversation(account, contact, phoneNumber);
  const isNewConversation = conversation?.isNew || false;

  const { data: existingMsg } = await supabase
    .from('whatsapp_cloud_messages')
    .select('id')
    .eq('message_id', message.id)
    .maybeSingle();

  if (existingMsg) {
    return;
  }

  const messageType = getMessageType(message);
  const textBody = extractMessageText(message);
  const content = buildMessageContent(message);

  await supabase.from('whatsapp_cloud_messages').insert({
    organization_id: account.organization_id,
    waba_id: account.id,
    conversation_id: conversation.id,
    message_id: message.id,
    direction: 'inbound',
    from_number: phoneNumber,
    to_number: account.phone_number,
    message_type: messageType,
    content,
    text_body: textBody,
    caption:
      message.image?.caption || message.video?.caption || message.document?.caption,
    media_id:
      message.image?.id ||
      message.video?.id ||
      message.audio?.id ||
      message.document?.id ||
      message.sticker?.id,
    status: 'received',
    timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
  });

  const nowIso = new Date().toISOString();
  await supabase
    .from('whatsapp_cloud_conversations')
    .update({
      status: 'open',
      is_window_open: true,
      window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      last_customer_message_at: nowIso,
      last_message_at: nowIso,
      last_message_preview: textBody.substring(0, 100),
      last_message_direction: 'inbound',
      unread_count: (conversation.unread_count || 0) + 1,
    })
    .eq('id', conversation.id);

  await supabase
    .from('whatsapp_business_accounts')
    .update({
      messages_received_today: (account.messages_received_today || 0) + 1,
      total_messages_received: (account.total_messages_received || 0) + 1,
      last_message_at: nowIso,
      last_webhook_at: nowIso,
    })
    .eq('id', account.id);

  let crmContactId: string | undefined = contact?.crm_contact_id;
  if (!crmContactId) {
    const { data: crmContact } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', account.organization_id)
      .or(`whatsapp.eq.${phoneNumber},phone.eq.${phoneNumber}`)
      .limit(1)
      .maybeSingle();

    if (crmContact) {
      crmContactId = crmContact.id;
      await supabase
        .from('whatsapp_contacts')
        .update({ crm_contact_id: crmContact.id })
        .eq('id', contact.id);
    }
  }

  const eventData: EventData = {
    contact_id: crmContactId,
    contact_name: contactName,
    contact_phone: phoneNumber,
    conversation_id: conversation.id,
    message_text: textBody,
    message_timestamp: message.timestamp,
    source_id: `whatsapp_${conversation.id}`,
  };

  if (isNewConversation) {
    await RuleEngine.processCreationRules(
      account.organization_id,
      'whatsapp',
      'conversation_started',
      eventData
    );
  }

  await RuleEngine.processCreationRules(
    account.organization_id,
    'whatsapp',
    'message_received',
    eventData
  );

  if (isNewContact && crmContactId) {
    await RuleEngine.processCreationRules(
      account.organization_id,
      'whatsapp',
      'contact_created',
      eventData
    );
  }
}

// ============================================================
// PROCESS STATUS UPDATE
// ============================================================

async function processStatus(account: any, status: any) {
  const { id: messageId, status: newStatus, errors, conversation, pricing } = status;

  const updateData: any = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (errors && errors.length > 0) {
    updateData.error_code = errors[0].code?.toString();
    updateData.error_message = errors[0].message || errors[0].title;
  }

  if (conversation) {
    updateData.conversation_id_meta = conversation.id;
    updateData.conversation_category = conversation.origin?.type;
  }

  if (pricing) {
    updateData.pricing_billable = pricing.billable;
    updateData.pricing_category = pricing.category;
    updateData.pricing_model = pricing.pricing_model;
  }

  await supabase
    .from('whatsapp_cloud_messages')
    .update(updateData)
    .eq('message_id', messageId);
}

// ============================================================
// PROCESS TEMPLATE STATUS UPDATE
// ============================================================

async function processTemplateStatusUpdate(value: any) {
  const templateName = value?.message_template_name;
  const templateId = value?.message_template_id;
  const newStatus = value?.event?.toUpperCase();
  const rejectionReason = value?.reason || value?.rejection_reason;

  if (!templateName || !newStatus) {
    console.warn('[webhook-processor] template status update missing name or event:', value);
    return;
  }

  const updateData: any = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (rejectionReason) {
    updateData.rejection_reason = rejectionReason;
  }

  if (templateId) {
    updateData.template_id = templateId.toString();
  }

  const { error } = await supabase
    .from('whatsapp_templates')
    .update(updateData)
    .eq('name', templateName);

  if (error) {
    console.error('[webhook-processor] failed to update template status:', error);
  } else {
    console.log(`[webhook-processor] template "${templateName}" status → ${newStatus}`);
  }
}

// ============================================================
// PROCESS TEMPLATE CATEGORY UPDATE
// ============================================================

async function processTemplateCategoryUpdate(value: any) {
  const templateName = value?.message_template_name;
  const templateId = value?.message_template_id;
  const previousCategory = value?.previous_category;
  const newCategory = value?.new_category;

  if (!templateName || !newCategory) {
    console.warn('[webhook-processor] template category update missing data:', value);
    return;
  }

  const { data: existing } = await supabase
    .from('whatsapp_templates')
    .select('category_change_history')
    .eq('name', templateName)
    .maybeSingle();

  const history = Array.isArray(existing?.category_change_history)
    ? existing.category_change_history
    : [];

  history.push({
    from: previousCategory,
    to: newCategory,
    at: new Date().toISOString(),
  });

  const updateData: any = {
    category: newCategory,
    category_change_history: history,
    last_category_change_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (templateId) {
    updateData.template_id = templateId.toString();
  }

  const { error } = await supabase
    .from('whatsapp_templates')
    .update(updateData)
    .eq('name', templateName);

  if (error) {
    console.error('[webhook-processor] failed to update template category:', error);
  } else {
    console.log(`[webhook-processor] template "${templateName}" category ${previousCategory} → ${newCategory}`);
  }
}

// ============================================================
// PROCESS PHONE QUALITY UPDATE
// ============================================================

async function processPhoneQualityUpdate(value: any) {
  const displayPhone = value?.display_phone_number;
  const currentLimit = value?.current_limit;
  const event = value?.event;

  if (!displayPhone) {
    console.warn('[webhook-processor] phone quality update missing display_phone_number:', value);
    return;
  }

  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (currentLimit) {
    updateData.messaging_limit = currentLimit;
  }

  if (event) {
    const qualityMap: Record<string, string> = {
      FLAGGED: 'YELLOW',
      RESTRICTED: 'RED',
      UNFLAGGED: 'GREEN',
    };
    if (qualityMap[event]) {
      updateData.quality_rating = qualityMap[event];
    }
  }

  const cleaned = displayPhone.replace(/\D/g, '');
  const { error } = await supabase
    .from('whatsapp_business_accounts')
    .update(updateData)
    .eq('phone_number', cleaned);

  if (error) {
    console.error('[webhook-processor] failed to update phone quality:', error);
  } else {
    console.log(`[webhook-processor] phone quality update: event=${event}, limit=${currentLimit}`);
  }
}

// ============================================================
// HELPERS
// ============================================================

async function getOrCreateContact(account: any, phoneNumber: string, name: string) {
  const { data: existing } = await supabase
    .from('whatsapp_contacts')
    .select('*')
    .eq('organization_id', account.organization_id)
    .eq('phone_number', phoneNumber)
    .limit(1);

  if (existing && existing.length > 0) {
    const contact = existing[0];
    if (name && name !== contact.name && name !== phoneNumber) {
      await supabase
        .from('whatsapp_contacts')
        .update({ name, profile_name: name })
        .eq('id', contact.id);
    }
    return { ...contact, isNew: false };
  }

  const { data: newContact } = await supabase
    .from('whatsapp_contacts')
    .insert({
      organization_id: account.organization_id,
      phone_number: phoneNumber,
      name,
      profile_name: name,
      source: 'whatsapp_cloud',
    })
    .select()
    .single();

  let crmContactId: string | undefined;
  const { data: existingCrmContact } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', account.organization_id)
    .or(`whatsapp.eq.${phoneNumber},phone.eq.${phoneNumber}`)
    .limit(1)
    .maybeSingle();

  if (existingCrmContact) {
    crmContactId = existingCrmContact.id;
  } else {
    const displayName = name !== phoneNumber ? name : 'Contato WhatsApp';
    const { data: newCrmContact } = await supabase
      .from('contacts')
      .insert({
        organization_id: account.organization_id,
        first_name: displayName,
        whatsapp: phoneNumber,
        phone: phoneNumber,
        source: 'whatsapp',
        tags: ['whatsapp'],
      })
      .select('id')
      .single();
    crmContactId = newCrmContact?.id;
  }

  if (crmContactId && newContact) {
    await supabase
      .from('whatsapp_contacts')
      .update({ crm_contact_id: crmContactId })
      .eq('id', newContact.id);
  }

  return { ...newContact, isNew: true, crm_contact_id: crmContactId };
}

async function getOrCreateConversation(account: any, contact: any, phoneNumber: string) {
  const { data: existing } = await supabase
    .from('whatsapp_cloud_conversations')
    .select('*')
    .eq('organization_id', account.organization_id)
    .eq('waba_id', account.id)
    .eq('wa_id', phoneNumber)
    .limit(1);

  if (existing && existing.length > 0) {
    const conv = existing[0];
    if (contact && conv.contact_id !== contact.id) {
      await supabase
        .from('whatsapp_cloud_conversations')
        .update({ contact_id: contact.id })
        .eq('id', conv.id);
    }
    return { ...conv, isNew: false };
  }

  const { data: newConv } = await supabase
    .from('whatsapp_cloud_conversations')
    .insert({
      organization_id: account.organization_id,
      waba_id: account.id,
      contact_id: contact?.id,
      wa_id: phoneNumber,
      chat_id: `${account.phone_number}-${phoneNumber}`,
      contact_name: contact?.name || phoneNumber,
      contact_phone: phoneNumber,
      status: 'open',
      is_window_open: true,
      window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  return { ...newConv, isNew: true };
}

function buildMessageContent(message: WebhookMessage): any {
  const type = getMessageType(message);
  switch (type) {
    case 'text':
      return { text: message.text };
    case 'image':
      return { image: message.image };
    case 'video':
      return { video: message.video };
    case 'audio':
      return { audio: message.audio };
    case 'document':
      return { document: message.document };
    case 'location':
      return { location: message.location };
    case 'contacts':
      return { contacts: message.contacts };
    case 'sticker':
      return { sticker: message.sticker };
    case 'interactive':
      return { interactive: message.interactive };
    case 'button':
      return { button: message.button };
    case 'reaction':
      return { reaction: message.reaction };
    default:
      return message;
  }
}
