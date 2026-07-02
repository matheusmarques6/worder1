// =============================================
// API: Instagram Messaging - Webhook
// src/app/api/instagram/webhook/route.ts
//
// Recebe eventos de mensagens do Instagram Direct
// Documentacao: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import {
  verifyInstagramWebhookSignature,
  type WebhookEntry,
} from '@/lib/instagram/instagram-api';

export const dynamic = 'force-dynamic';

// =============================================
// GET - Verificacao do Webhook (Meta)
// =============================================
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('[Instagram Webhook] Verification request:', { mode, token, challenge });

  if (mode !== 'subscribe') {
    return new Response('Invalid mode', { status: 403 });
  }

  // Buscar conta pelo verify token
  const { data: account } = await supabase
    .from('instagram_accounts')
    .select('id, organization_id')
    .eq('webhook_verify_token', token)
    .single();

  if (!account) {
    // Fallback para token global
    const globalToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;
    if (token !== globalToken) {
      console.log('[Instagram Webhook] Invalid verify token');
      return new Response('Invalid verify token', { status: 403 });
    }
  } else {
    // Marcar webhook como configurado
    await supabase
      .from('instagram_accounts')
      .update({ webhook_configured: true })
      .eq('id', account.id);
  }

  console.log('[Instagram Webhook] Verification successful');
  return new Response(challenge, { status: 200 });
}

// =============================================
// POST - Receber eventos
// =============================================
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Verificar assinatura — FAIL-CLOSED: rejeitar se header ausente,
    // secret nao configurado ou assinatura invalida, ANTES de qualquer
    // mutacao no banco.
    const signature = request.headers.get('x-hub-signature-256');
    const appSecret = process.env.META_APP_SECRET;
    if (!signature || !appSecret) {
      console.warn('[Instagram Webhook] Missing signature or app secret');
      return new NextResponse('unauthorized', { status: 401 });
    }
    const isValid = await verifyInstagramWebhookSignature(rawBody, signature, appSecret);
    if (!isValid) {
      console.warn('[Instagram Webhook] Invalid signature');
      return new NextResponse('unauthorized', { status: 401 });
    }

    const body = JSON.parse(rawBody);

    // Verificar se e webhook do Instagram
    if (body.object !== 'instagram') {
      return NextResponse.json({ received: true });
    }

    // Processar cada entry
    for (const entry of body.entry || []) {
      await processEntry(entry);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Instagram Webhook] Error:', error);
    return NextResponse.json({ received: true });
  }
}

// =============================================
// PROCESSAR ENTRY
// =============================================
async function processEntry(entry: WebhookEntry) {
  const igUserId = entry.id;

  // Buscar conta do Instagram
  const { data: account } = await supabase
    .from('instagram_accounts')
    .select('*')
    .eq('ig_user_id', igUserId)
    .single();

  if (!account) {
    console.warn('[Instagram Webhook] Unknown ig_user_id:', igUserId);
    return;
  }

  // Processar mensagens
  for (const messaging of entry.messaging || []) {
    if (messaging.message?.is_echo) {
      console.log('[Instagram Webhook] Skipping echo message');
      continue;
    }

    if (messaging.message) {
      await processMessage(account, messaging);
    }

    if (messaging.postback) {
      await processPostback(account, messaging);
    }

    if (messaging.reaction) {
      await processReaction(account, messaging);
    }

    if (messaging.read) {
      await processRead(account, messaging);
    }
  }

  for (const change of entry.changes || []) {
    await processChange(account, change);
  }
}

// =============================================
// PROCESSAR MENSAGEM RECEBIDA
// =============================================
async function processMessage(account: any, messaging: any) {
  try {
    const senderId = messaging.sender.id;
    const messageId = messaging.message.mid;
    const timestamp = messaging.timestamp;
    const text = messaging.message.text || '';
    const attachments = messaging.message.attachments || [];
    const quickReply = messaging.message.quick_reply;
    const isUnsupported = messaging.message.is_unsupported;
    const isDeleted = messaging.message.is_deleted;

    console.log('[Instagram] Message from:', senderId, '-', text || '[attachment]');

    if (isDeleted) {
      console.log('[Instagram] Message was deleted, skipping');
      return;
    }

    const contact = await getOrCreateContact(account, senderId);
    const conversation = await getOrCreateConversation(account, contact, senderId);

    const { data: existingMsg } = await supabase
      .from('instagram_messages')
      .select('id')
      .eq('message_id', messageId)
      .single();

    if (existingMsg) {
      console.log('[Instagram] Duplicate message, skipping:', messageId);
      return;
    }

    let messageType = 'text';
    let content: any = { text };
    let mediaUrl: string | null = null;

    if (attachments.length > 0) {
      const attachment = attachments[0];
      messageType = attachment.type;
      mediaUrl = attachment.payload?.url || null;
      content = {
        text,
        attachment: {
          type: attachment.type,
          url: mediaUrl,
          reel_video_id: attachment.payload?.reel_video_id,
          story_id: attachment.payload?.story_id,
        },
      };
    }

    if (quickReply) {
      content.quick_reply = quickReply;
    }

    if (isUnsupported) {
      messageType = 'unsupported';
      content = { is_unsupported: true };
    }

    await supabase.from('instagram_messages').insert({
      organization_id: account.organization_id,
      account_id: account.id,
      conversation_id: conversation.id,
      message_id: messageId,
      direction: 'inbound',
      sender_id: senderId,
      recipient_id: account.ig_user_id,
      message_type: messageType,
      content,
      text_body: text,
      media_url: mediaUrl,
      status: 'received',
      timestamp: new Date(timestamp).toISOString(),
    });

    await supabase
      .from('instagram_conversations')
      .update({
        status: 'open',
        is_window_open: true,
        window_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        last_customer_message_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        last_message_preview: text.substring(0, 100) || `[${messageType}]`,
        last_message_direction: 'inbound',
        unread_count: (conversation.unread_count || 0) + 1,
      })
      .eq('id', conversation.id);

    await supabase
      .from('instagram_accounts')
      .update({
        messages_received_today: (account.messages_received_today || 0) + 1,
        total_messages_received: (account.total_messages_received || 0) + 1,
        last_message_at: new Date().toISOString(),
        last_webhook_at: new Date().toISOString(),
      })
      .eq('id', account.id);

    console.log('[Instagram] Message saved successfully');
  } catch (error) {
    console.error('[Instagram] Error processing message:', error);
  }
}

async function processPostback(account: any, messaging: any) {
  try {
    const senderId = messaging.sender.id;
    const postback = messaging.postback;

    console.log('[Instagram] Postback from:', senderId, '-', postback.title);

    const { data: conversation } = await supabase
      .from('instagram_conversations')
      .select('id')
      .eq('account_id', account.id)
      .eq('ig_user_id', senderId)
      .single();

    if (!conversation) return;

    await supabase.from('instagram_messages').insert({
      organization_id: account.organization_id,
      account_id: account.id,
      conversation_id: conversation.id,
      message_id: postback.mid,
      direction: 'inbound',
      sender_id: senderId,
      recipient_id: account.ig_user_id,
      message_type: 'postback',
      content: {
        postback: {
          title: postback.title,
          payload: postback.payload,
        },
      },
      text_body: postback.title,
      status: 'received',
      timestamp: new Date(messaging.timestamp).toISOString(),
    });

    console.log('[Instagram] Postback saved');
  } catch (error) {
    console.error('[Instagram] Error processing postback:', error);
  }
}

async function processReaction(account: any, messaging: any) {
  try {
    const reaction = messaging.reaction;
    const messageId = reaction.mid;
    const action = reaction.action;
    const emoji = reaction.emoji || reaction.reaction;

    console.log('[Instagram] Reaction:', action, emoji, 'on message:', messageId);

    if (action === 'react') {
      await supabase
        .from('instagram_messages')
        .update({
          reaction: emoji,
          reaction_at: new Date().toISOString(),
        })
        .eq('message_id', messageId);
    } else {
      await supabase
        .from('instagram_messages')
        .update({
          reaction: null,
          reaction_at: null,
        })
        .eq('message_id', messageId);
    }
  } catch (error) {
    console.error('[Instagram] Error processing reaction:', error);
  }
}

async function processRead(account: any, messaging: any) {
  try {
    const senderId = messaging.sender.id;
    const watermark = messaging.read.watermark;

    await supabase
      .from('instagram_messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('account_id', account.id)
      .eq('direction', 'outbound')
      .eq('recipient_id', senderId)
      .lte('timestamp', new Date(watermark).toISOString());

    console.log('[Instagram] Messages marked as read');
  } catch (error) {
    console.error('[Instagram] Error processing read:', error);
  }
}

async function processChange(account: any, change: any) {
  try {
    console.log('[Instagram] Change:', change.field, change.value);
  } catch (error) {
    console.error('[Instagram] Error processing change:', error);
  }
}

async function getOrCreateContact(account: any, igUserId: string) {
  const { data: existingContacts } = await supabase
    .from('instagram_contacts')
    .select('*')
    .eq('organization_id', account.organization_id)
    .eq('ig_user_id', igUserId)
    .limit(1);

  if (existingContacts && existingContacts.length > 0) {
    return { ...existingContacts[0], isNew: false };
  }

  const { data: newContact } = await supabase
    .from('instagram_contacts')
    .insert({
      organization_id: account.organization_id,
      ig_user_id: igUserId,
      username: null,
      name: null,
      source: 'instagram_dm',
    })
    .select()
    .single();

  let crmContactId: string | undefined;

  const { data: newCrmContact } = await supabase
    .from('contacts')
    .insert({
      organization_id: account.organization_id,
      name: `Instagram User ${igUserId}`,
      instagram_id: igUserId,
      source: 'instagram',
      type: 'lead',
      tags: ['instagram'],
    })
    .select('id')
    .single();

  crmContactId = newCrmContact?.id;

  if (crmContactId && newContact) {
    await supabase
      .from('instagram_contacts')
      .update({ crm_contact_id: crmContactId })
      .eq('id', newContact.id);
  }

  return { ...newContact, isNew: true, crm_contact_id: crmContactId };
}

async function getOrCreateConversation(account: any, contact: any, igUserId: string) {
  const { data: existingConvs } = await supabase
    .from('instagram_conversations')
    .select('*')
    .eq('organization_id', account.organization_id)
    .eq('account_id', account.id)
    .eq('ig_user_id', igUserId)
    .limit(1);

  if (existingConvs && existingConvs.length > 0) {
    const conv = existingConvs[0];

    if (contact && conv.contact_id !== contact.id) {
      await supabase
        .from('instagram_conversations')
        .update({ contact_id: contact.id })
        .eq('id', conv.id);
    }

    return { ...conv, isNew: false };
  }

  const { data: newConv } = await supabase
    .from('instagram_conversations')
    .insert({
      organization_id: account.organization_id,
      account_id: account.id,
      contact_id: contact?.id,
      ig_user_id: igUserId,
      contact_name: contact?.name || contact?.username || `User ${igUserId}`,
      status: 'open',
      is_window_open: true,
      window_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  return { ...newConv, isNew: true };
}
