// =============================================
// API: /api/whatsapp/webhook - v10
// CORREÇÃO: Salvar mensagens com store_id para isolamento multi-loja
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    console.log('[Webhook] =====================================');
    console.log('[Webhook] Received event');
    
    // Detectar tipo de evento
    const eventType = body.event || body.type || 'messages.upsert';
    const instanceName = body.instance || body.data?.instance || body.sender?.split('@')[0];
    const data = body.data || body;
    
    console.log('[Webhook] Event type:', eventType);
    console.log('[Webhook] Instance name:', instanceName);

    // Processar diferentes tipos de eventos
    if (eventType === 'qrcode.updated' || eventType === 'qr') {
      await handleQRUpdate(instanceName, data);
      return NextResponse.json({ received: true });
    }
    
    if (eventType === 'connection.update' || eventType === 'status') {
      await handleConnectionUpdate(instanceName, data);
      return NextResponse.json({ received: true });
    }
    
    if (eventType === 'messages.update' || eventType === 'message.ack') {
      await handleMessageStatus(instanceName, data);
      return NextResponse.json({ received: true });
    }

    // Processar mensagem recebida
    await handleIncomingMessage(instanceName, data, body);
    
    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('[Webhook] Error:', error);
    return NextResponse.json({ received: true, error: error.message });
  }
}

// =============================================
// BUSCAR INSTÂNCIA COM STORE_ID
// =============================================

async function findInstance(instanceName: string) {
  if (!instanceName) {
    console.log('[Webhook] ❌ No instance name');
    return null;
  }

  // Buscar por nome exato
  const { data: instances } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .or(`instance_name.eq.${instanceName},instance_id.eq.${instanceName},unique_id.eq.${instanceName}`)
    .limit(1);

  let instance = instances?.[0];
  
  // Tentar busca parcial
  if (!instance) {
    console.log('[Webhook] Trying partial match for:', instanceName);
    
    const { data: instances2 } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .or(`instance_name.ilike.%${instanceName}%,unique_id.ilike.%${instanceName}%`)
      .limit(1);
      
    instance = instances2?.[0];
  }
  
  // ❌ REMOVIDO FALLBACK PERIGOSO
  if (!instance) {
    console.error('[Webhook] ❌ Instance not found:', instanceName);
    console.error('[Webhook] ❌ Event will be DROPPED to prevent data leakage');
    return null;
  }

  console.log('[Webhook] ✅ Instance found:', instance.unique_id, 'Org:', instance.organization_id, 'Store:', instance.store_id);
  return instance;
}

// =============================================
// HANDLERS
// =============================================

async function handleQRUpdate(instanceName: string, data: any) {
  const instance = await findInstance(instanceName);
  if (!instance) return;

  const qrcode = data.qrcode?.base64 || data.base64 || data.qrcode;
  
  if (qrcode) {
    await supabase
      .from('whatsapp_instances')
      .update({
        status: 'qr_pending',
        qr_code: qrcode,
        updated_at: new Date().toISOString()
      })
      .eq('id', instance.id);
      
    console.log('[Webhook] ✅ QR updated for store:', instance.store_id);
  }
}

async function handleConnectionUpdate(instanceName: string, data: any) {
  const instance = await findInstance(instanceName);
  if (!instance) return;

  const state = data.state || data.instance?.state;
  const phoneNumber = data.instance?.wuid?.split('@')[0] || 
                     data.instance?.phoneNumber ||
                     data.wuid?.split('@')[0];
  
  let newStatus = 'disconnected';
  if (state === 'open') newStatus = 'connected';
  else if (state === 'connecting') newStatus = 'connecting';
  
  await supabase
    .from('whatsapp_instances')
    .update({
      status: newStatus,
      phone_number: phoneNumber || instance.phone_number,
      qr_code: newStatus === 'connected' ? null : instance.qr_code,
      online_status: newStatus === 'connected' ? 'available' : 'unavailable',
      updated_at: new Date().toISOString()
    })
    .eq('id', instance.id);
    
  console.log('[Webhook] ✅ Connection status:', newStatus, 'for store:', instance.store_id);
}

async function handleMessageStatus(instanceName: string, data: any) {
  const instance = await findInstance(instanceName);
  if (!instance) return;

  const updates = Array.isArray(data) ? data : [data];
  
  for (const update of updates) {
    const messageId = update.key?.id || update.id;
    const status = update.status || update.update?.status;
    
    if (messageId && status) {
      // Mapear status
      let mappedStatus = status;
      if (typeof status === 'number') {
        const statusMap: Record<number, string> = {
          0: 'pending', 1: 'sent', 2: 'delivered', 3: 'read', 4: 'played'
        };
        mappedStatus = statusMap[status] || 'unknown';
      }
      
      await supabase
        .from('whatsapp_messages')
        .update({ 
          status: mappedStatus,
          updated_at: new Date().toISOString()
        })
        .or(`message_id.eq.${messageId},external_id.eq.${messageId}`);
        
      console.log('[Webhook] ✅ Message status updated:', messageId, '->', mappedStatus);
    }
  }
}

async function handleIncomingMessage(instanceName: string, data: any, body: any) {
  const instance = await findInstance(instanceName);
  if (!instance) return;

  const orgId = instance.organization_id;
  const storeId = instance.store_id; // ✅ CRÍTICO: Pegar store_id da instância

  // Extrair key e message
  const key = data.key || body.key;
  const message = data.message || body.message;
  
  if (!key || !message) {
    console.log('[Webhook] ⏭️ No key/message in payload');
    return;
  }
  
  // Ignorar mensagens próprias
  if (key.fromMe) {
    console.log('[Webhook] ⏭️ Ignoring own message');
    return;
  }
  
  const remoteJid = key.remoteJid;
  
  // Ignorar grupos
  if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@lid')) {
    console.log('[Webhook] ⏭️ Ignoring group:', remoteJid);
    return;
  }
  
  const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
  const pushName = data.pushName || null;
  
  // Extrair conteúdo
  let content = message.conversation || 
                message.extendedTextMessage?.text ||
                message.imageMessage?.caption ||
                message.videoMessage?.caption ||
                message.documentMessage?.caption ||
                '';
  
  let messageType = 'text';
  if (message.imageMessage) messageType = 'image';
  else if (message.videoMessage) messageType = 'video';
  else if (message.audioMessage) messageType = 'audio';
  else if (message.documentMessage) messageType = 'document';
  else if (message.stickerMessage) messageType = 'sticker';
  else if (message.locationMessage) messageType = 'location';
  else if (message.contactMessage) messageType = 'contact';
  
  console.log('[Webhook] 📨 Message from:', phoneNumber, 'Type:', messageType);

  // =============================================
  // BUSCAR/CRIAR CONTATO COM STORE_ID
  // =============================================
  
  let contactId = null;
  
  // Primeiro tentar contato unificado
  const { data: unifiedContact } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', orgId)
    .eq('store_id', storeId) // ✅ CRÍTICO: Filtrar por store_id
    .or(`whatsapp.eq.${phoneNumber},phone.eq.${phoneNumber}`)
    .single();
  
  if (unifiedContact) {
    contactId = unifiedContact.id;
  } else {
    // Criar contato unificado com store_id
    const { data: newContact, error: contactError } = await supabase
      .from('contacts')
      .insert({
        organization_id: orgId,
        store_id: storeId, // ✅ CRÍTICO
        whatsapp: phoneNumber,
        phone: phoneNumber,
        full_name: pushName || phoneNumber,
        first_name: pushName?.split(' ')[0] || phoneNumber,
        source: 'whatsapp',
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    
    if (!contactError && newContact) {
      contactId = newContact.id;
      console.log('[Webhook] ✅ Created unified contact:', contactId, 'for store:', storeId);
    }
  }

  // =============================================
  // BUSCAR/CRIAR CONVERSA COM STORE_ID
  // =============================================
  
  const { data: existingConv } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('store_id', storeId) // ✅ CRÍTICO: Filtrar por store_id
    .eq('phone_number', phoneNumber)
    .single();

  let conversationId;

  if (existingConv) {
    conversationId = existingConv.id;
    
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content?.substring(0, 100) || `[${messageType}]`,
        last_message_direction: 'inbound',
        unread_count: (existingConv.unread_count || 0) + 1,
        status: 'open',
        is_window_open: true,
        last_customer_message_at: new Date().toISOString(),
        window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingConv.id);
      
    console.log('[Webhook] ✅ Updated conversation:', conversationId);
  } else {
    // Criar nova conversa COM STORE_ID
    const { data: newConv, error: convError } = await supabase
      .from('whatsapp_conversations')
      .insert({
        organization_id: orgId,
        store_id: storeId, // ✅ CRÍTICO
        instance_id: instance.id,
        unified_contact_id: contactId,
        phone_number: phoneNumber,
        chat_id: remoteJid,
        contact_name: pushName || phoneNumber,
        status: 'open',
        ai_enabled: true,
        last_message_at: new Date().toISOString(),
        last_message_preview: content?.substring(0, 100) || `[${messageType}]`,
        last_message_direction: 'inbound',
        unread_count: 1,
        is_window_open: true,
        last_customer_message_at: new Date().toISOString(),
        window_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (convError) {
      console.error('[Webhook] ❌ Error creating conversation:', convError);
      return;
    }

    conversationId = newConv.id;
    console.log('[Webhook] ✅ Created conversation:', conversationId, 'for store:', storeId);
  }

  // =============================================
  // CRIAR MENSAGEM COM STORE_ID
  // =============================================
  
  const messageTimestamp = data.messageTimestamp || Math.floor(Date.now() / 1000);
  const messageDate = new Date(messageTimestamp * 1000).toISOString();

  const messageId = key.id || `msg_${Date.now()}`;
const messagePayload = {
  organization_id: orgId,
  store_id: storeId, // ✅ CRÍTICO
  conversation_id: conversationId,
  instance_id: instance.id,
  // ✅ Normalização: message_id (padrão novo) + external_id (compat legado)
  message_id: messageId,
  external_id: messageId,
  direction: 'inbound',
  sender_phone: phoneNumber,
  sender_name: pushName,
  from_number: phoneNumber,
  content: content || null,
  text_body: typeof content === 'string' ? content : null,
  message_type: messageType,
  status: 'received',
  raw_payload: body,
  created_at: messageDate,
  timestamp: messageDate,
};

const { error: msgError } = await supabase
  .from('whatsapp_messages')
  .upsert(messagePayload, {
    onConflict: 'instance_id,message_id',
    ignoreDuplicates: true,
  });

if (msgError) {
    console.error('[Webhook] ❌ Error saving message:', msgError);
  } else {
    console.log('[Webhook] ✅ Message saved for store:', storeId);
  }
}

// GET para verificação do webhook
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'worder_webhook_token';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Webhook] ✅ Webhook verified');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ status: 'Webhook endpoint active' });
}
