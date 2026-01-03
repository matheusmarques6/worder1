// =============================================
// API: Evolution - Webhook
// src/app/api/whatsapp/evolution/webhook/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { parseEvolutionWebhook, isMessageEvent, isConnectionEvent, isQRCodeEvent } from '@/lib/whatsapp/evolution-api';

// =============================================
// RATE LIMITING
// =============================================
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100;
const RATE_WINDOW = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimit.get(ip);
  
  if (!record || now > record.resetAt) {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

// =============================================
// WEBHOOK VERIFICATION
// =============================================
async function verifyWebhookToken(request: NextRequest): Promise<{ valid: boolean; instanceName?: string }> {
  // Option 1: Bearer token
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    
    const { data: instance } = await supabase
      .from('evolution_instances')
      .select('instance_name, organization_id')
      .eq('webhook_token', token)
      .single();
    
    if (instance) {
      return { valid: true, instanceName: instance.instance_name };
    }
  }
  
  // Option 2: Global webhook secret
  const globalSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
  const providedSecret = request.headers.get('x-webhook-secret') || 
                         request.headers.get('apikey') ||
                         request.nextUrl.searchParams.get('token');
  
  if (globalSecret && providedSecret === globalSecret) {
    return { valid: true };
  }
  
  // Option 3: Query string token
  const queryToken = request.nextUrl.searchParams.get('webhook_token');
  if (queryToken) {
    const { data: instance } = await supabase
      .from('evolution_instances')
      .select('instance_name')
      .eq('webhook_token', queryToken)
      .single();
    
    if (instance) {
      return { valid: true, instanceName: instance.instance_name };
    }
  }
  
  return { valid: false };
}

// =============================================
// POST - Receber eventos
// =============================================
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
             request.headers.get('x-real-ip') || 
             'unknown';

  // Rate limiting
  if (!checkRateLimit(ip)) {
    console.warn('[Evolution Webhook] Rate limit exceeded:', ip);
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    // Verificar autenticação
    const { valid, instanceName: tokenInstance } = await verifyWebhookToken(request);
    
    const body = await request.json();
    const event = parseEvolutionWebhook(body);

    // Log para auditoria
    console.log('[Evolution Webhook]', {
      event: event.event,
      instance: event.instance,
      ip,
      hasValidToken: valid,
      timestamp: new Date().toISOString()
    });

    // Buscar instância
    const { data: instance } = await supabase
      .from('evolution_instances')
      .select('*, webhook_token')
      .eq('instance_name', tokenInstance || event.instance)
      .single();

    if (!instance) {
      console.warn('[Evolution Webhook] Unknown instance:', event.instance);
      return NextResponse.json({ received: true });
    }

    // Se a instância tem webhook_token configurado, exigir autenticação
    if (instance.webhook_token && !valid) {
      console.warn('[Evolution Webhook] Unauthorized - instance requires token:', event.instance);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Processar evento
    if (isQRCodeEvent(event)) {
      await handleQRCode(instance, event.data);
    } else if (isConnectionEvent(event)) {
      await handleConnection(instance, event.data);
    } else if (isMessageEvent(event)) {
      await handleMessage(instance, event.data);
    }

    // Atualizar última atividade do webhook
    await supabase
      .from('evolution_instances')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', instance.id);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Evolution Webhook] Error:', error);
    return NextResponse.json({ received: true });
  }
}

// =============================================
// QR CODE
// =============================================
async function handleQRCode(instance: any, data: any) {
  const qrcode = data.qrcode?.base64 || data.base64;
  
  if (qrcode) {
    await supabase
      .from('evolution_instances')
      .update({
        qr_code: qrcode,
        qr_expires_at: new Date(Date.now() + 60000).toISOString(),
        status: 'qr_pending',
      })
      .eq('id', instance.id);
  }
}

// =============================================
// CONNECTION
// =============================================
async function handleConnection(instance: any, data: any) {
  const state = data.state || data.instance?.state;
  
  if (state === 'open') {
    const phoneNumber = data.instance?.phoneNumber || data.instance?.wuid?.split('@')[0];
    
    await supabase
      .from('evolution_instances')
      .update({
        status: 'connected',
        phone_number: phoneNumber,
        owner_jid: data.instance?.wuid,
        profile_name: data.instance?.profileName,
        qr_code: null,
        connected_at: new Date().toISOString(),
      })
      .eq('id', instance.id);
      
    console.log('[Evolution] Connected:', phoneNumber);
  } else if (state === 'close' || state === 'connecting') {
    await supabase
      .from('evolution_instances')
      .update({
        status: state === 'connecting' ? 'connecting' : 'disconnected',
      })
      .eq('id', instance.id);
  }
}

// =============================================
// MESSAGE
// =============================================
async function handleMessage(instance: any, data: any) {
  try {
    const key = data.key;
    const message = data.message;
    const pushName = data.pushName;

    // Ignorar mensagens próprias
    if (key?.fromMe) return;

    // Ignorar grupos
    const remoteJid = key?.remoteJid;
    if (!remoteJid || remoteJid.includes('@g.us')) return;

    const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');
    const contactName = pushName || phoneNumber;

    // Extrair conteúdo
    let content = message?.conversation ||
                  message?.extendedTextMessage?.text ||
                  message?.imageMessage?.caption ||
                  message?.videoMessage?.caption ||
                  '[Mídia]';

    let messageType = 'text';
    if (message?.imageMessage) messageType = 'image';
    if (message?.audioMessage) messageType = 'audio';
    if (message?.videoMessage) messageType = 'video';
    if (message?.documentMessage) messageType = 'document';
    if (message?.stickerMessage) messageType = 'sticker';
    if (message?.locationMessage) messageType = 'location';
    if (message?.contactMessage) messageType = 'contact';

    console.log('[Evolution] Message from:', phoneNumber, '-', content?.substring(0, 50));

    // 1. Buscar ou criar contato
    let { data: contact } = await supabase
      .from('whatsapp_contacts')
      .select('*')
      .eq('organization_id', instance.organization_id)
      .eq('phone_number', phoneNumber)
      .single();

    if (!contact) {
      const { data: newContact } = await supabase
        .from('whatsapp_contacts')
        .insert({
          organization_id: instance.organization_id,
          phone_number: phoneNumber,
          name: contactName,
          profile_name: pushName,
          source: 'evolution',
        })
        .select()
        .single();
      contact = newContact;
    } else if (pushName && pushName !== contact.name) {
      await supabase
        .from('whatsapp_contacts')
        .update({ name: pushName, profile_name: pushName })
        .eq('id', contact.id);
    }

    // 2. Buscar ou criar conversa
    let { data: conversation } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('organization_id', instance.organization_id)
      .eq('phone_number', phoneNumber)
      .single();

    if (!conversation) {
      const { data: newConv } = await supabase
        .from('whatsapp_conversations')
        .insert({
          organization_id: instance.organization_id,
          contact_id: contact?.id,
          phone_number: phoneNumber,
          status: 'open',
          is_bot_active: false,
          last_message_at: new Date().toISOString(),
          last_message_preview: content?.substring(0, 100),
          unread_count: 1,
        })
        .select()
        .single();
      conversation = newConv;
    } else {
      await supabase
        .from('whatsapp_conversations')
        .update({
          status: 'open',
          last_message_at: new Date().toISOString(),
          last_message_preview: content?.substring(0, 100),
          unread_count: (conversation.unread_count || 0) + 1,
          contact_id: contact?.id,
        })
        .eq('id', conversation.id);
    }

    // 3. Verificar duplicata
    const messageId = key?.id;
    if (messageId) {
      const { data: existingMsg } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('wamid', messageId)
        .single();

      if (existingMsg) {
        console.log('[Evolution] Duplicate message, skipping');
        return;
      }
    }

    // 4. Salvar mensagem
    await supabase.from('whatsapp_messages').insert({
      organization_id: instance.organization_id,
      conversation_id: conversation?.id,
      contact_id: contact?.id,
      wamid: messageId,
      wa_message_id: messageId,
      direction: 'inbound',
      message_type: messageType,
      content,
      status: 'received',
      metadata: {
        pushName,
        remoteJid,
        participant: key?.participant,
      },
    });

    // 5. Atualizar contadores
    await supabase
      .from('evolution_instances')
      .update({
        messages_received_today: instance.messages_received_today + 1,
        total_messages_received: instance.total_messages_received + 1,
      })
      .eq('id', instance.id);

    console.log('[Evolution] Message saved');
  } catch (error) {
    console.error('[Evolution] Error processing message:', error);
  }
}

// =============================================
// GET - Status check
// =============================================
export async function GET() {
  return NextResponse.json({ status: 'Evolution Webhook active' });
}
