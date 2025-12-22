// =============================================
// API: WhatsApp Cloud - Webhook
// src/app/api/whatsapp/cloud/webhook/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { 
  verifyWebhookSignature, 
  extractMessageText, 
  getMessageType,
  normalizePhone,
  type WebhookMessage 
} from '@/lib/whatsapp/cloud-api';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// =============================================
// GET - Verificação do Webhook (Meta)
// =============================================
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('[WhatsApp Cloud Webhook] Verification request:', { mode, token, challenge });

  if (mode !== 'subscribe') {
    return new Response('Invalid mode', { status: 403 });
  }

  // Buscar conta pelo verify token
  const { data: account } = await supabase
    .from('whatsapp_business_accounts')
    .select('id, organization_id')
    .eq('webhook_verify_token', token)
    .single();

  if (!account) {
    // Fallback para token global
    const globalToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (token !== globalToken) {
      console.log('[WhatsApp Cloud Webhook] Invalid verify token');
      return new Response('Invalid verify token', { status: 403 });
    }
  } else {
    // Marcar webhook como configurado
    await supabase
      .from('whatsapp_business_accounts')
      .update({ webhook_configured: true })
      .eq('id', account.id);
  }

  console.log('[WhatsApp Cloud Webhook] Verification successful');
  return new Response(challenge, { status: 200 });
}

// =============================================
// POST - Receber eventos
// =============================================
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    
    // Verificar assinatura (opcional mas recomendado)
    const signature = request.headers.get('x-hub-signature-256');
    if (signature && process.env.META_APP_SECRET) {
      const isValid = verifyWebhookSignature(rawBody, signature, process.env.META_APP_SECRET);
      if (!isValid) {
        console.warn('[WhatsApp Cloud Webhook] Invalid signature');
        // Continuar mesmo assim para não perder mensagens
      }
    }

    const body = JSON.parse(rawBody);
    
    // Verificar se é webhook do WhatsApp
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ received: true });
    }

    // Processar cada entry
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;
        const displayPhone = value.metadata?.display_phone_number;

        if (!phoneNumberId) continue;

        // Buscar conta
        const { data: account } = await supabase
          .from('whatsapp_business_accounts')
          .select('*')
          .eq('phone_number_id', phoneNumberId)
          .single();

        if (!account) {
          console.warn('[WhatsApp Cloud Webhook] Unknown phone_number_id:', phoneNumberId);
          continue;
        }

        // Processar mensagens
        for (const message of value.messages || []) {
          await processMessage(account, message, value.contacts);
        }

        // Processar status updates
        for (const status of value.statuses || []) {
          await processStatus(account, status);
        }

        // Processar erros
        for (const error of value.errors || []) {
          console.error('[WhatsApp Cloud Webhook] Error:', error);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[WhatsApp Cloud Webhook] Error:', error);
    return NextResponse.json({ received: true });
  }
}

// =============================================
// PROCESSAR MENSAGEM RECEBIDA
// =============================================
async function processMessage(
  account: any, 
  message: WebhookMessage,
  contacts: Array<{ wa_id: string; profile: { name: string } }> | undefined
) {
  try {
    const phoneNumber = normalizePhone(message.from);
    const contactInfo = contacts?.find(c => c.wa_id === message.from);
    const contactName = contactInfo?.profile?.name || phoneNumber;

    console.log('[WhatsApp Cloud] Message from:', phoneNumber, '-', extractMessageText(message));

    // 1. Buscar ou criar contato
    let contact = await getOrCreateContact(account, phoneNumber, contactName);

    // 2. Buscar ou criar conversa
    let conversation = await getOrCreateConversation(account, contact, phoneNumber);

    // 3. Verificar duplicata
    const { data: existingMsg } = await supabase
      .from('whatsapp_cloud_messages')
      .select('id')
      .eq('message_id', message.id)
      .single();

    if (existingMsg) {
      console.log('[WhatsApp Cloud] Duplicate message, skipping:', message.id);
      return;
    }

    // 4. Extrair conteúdo
    const messageType = getMessageType(message);
    const textBody = extractMessageText(message);
    const content = buildMessageContent(message);

    // 5. Salvar mensagem
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
      caption: message.image?.caption || message.video?.caption || message.document?.caption,
      media_id: message.image?.id || message.video?.id || message.audio?.id || message.document?.id || message.sticker?.id,
      status: 'received',
      timestamp: new Date(parseInt(message.timestamp) * 1000).toISOString(),
    });

    // 6. Atualizar conversa
    await supabase
      .from('whatsapp_cloud_conversations')
      .update({
        status: 'open',
        is_window_open: true,
        window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
        last_customer_message_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        last_message_preview: textBody.substring(0, 100),
        last_message_direction: 'inbound',
        unread_count: (conversation.unread_count || 0) + 1,
      })
      .eq('id', conversation.id);

    // 7. Atualizar métricas da conta
    await supabase
      .from('whatsapp_business_accounts')
      .update({
        messages_received_today: account.messages_received_today + 1,
        total_messages_received: account.total_messages_received + 1,
        last_message_at: new Date().toISOString(),
        last_webhook_at: new Date().toISOString(),
      })
      .eq('id', account.id);

    console.log('[WhatsApp Cloud] Message saved successfully');
  } catch (error) {
    console.error('[WhatsApp Cloud] Error processing message:', error);
  }
}

// =============================================
// PROCESSAR STATUS UPDATE
// =============================================
async function processStatus(account: any, status: any) {
  try {
    const { id: messageId, status: newStatus, timestamp, errors } = status;

    // Atualizar status da mensagem
    const updateData: any = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (errors && errors.length > 0) {
      updateData.error_code = errors[0].code?.toString();
      updateData.error_message = errors[0].message || errors[0].title;
    }

    await supabase
      .from('whatsapp_cloud_messages')
      .update(updateData)
      .eq('message_id', messageId);

    console.log('[WhatsApp Cloud] Status updated:', messageId, '->', newStatus);
  } catch (error) {
    console.error('[WhatsApp Cloud] Error processing status:', error);
  }
}

// =============================================
// HELPERS
// =============================================

async function getOrCreateContact(account: any, phoneNumber: string, name: string) {
  // Buscar contato existente
  const { data: existingContacts } = await supabase
    .from('whatsapp_contacts')
    .select('*')
    .eq('organization_id', account.organization_id)
    .eq('phone_number', phoneNumber)
    .limit(1);

  if (existingContacts && existingContacts.length > 0) {
    const contact = existingContacts[0];
    
    // Atualizar nome se mudou
    if (name && name !== contact.name && name !== phoneNumber) {
      await supabase
        .from('whatsapp_contacts')
        .update({ name, profile_name: name })
        .eq('id', contact.id);
    }
    
    return contact;
  }

  // Criar novo contato
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

  return newContact;
}

async function getOrCreateConversation(account: any, contact: any, phoneNumber: string) {
  // Buscar conversa existente
  const { data: existingConvs } = await supabase
    .from('whatsapp_cloud_conversations')
    .select('*')
    .eq('organization_id', account.organization_id)
    .eq('waba_id', account.id)
    .eq('wa_id', phoneNumber)
    .limit(1);

  if (existingConvs && existingConvs.length > 0) {
    const conv = existingConvs[0];
    
    // Atualizar contact_id se necessário
    if (contact && conv.contact_id !== contact.id) {
      await supabase
        .from('whatsapp_cloud_conversations')
        .update({ contact_id: contact.id })
        .eq('id', conv.id);
    }
    
    return conv;
  }

  // Criar nova conversa
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

  return newConv;
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
