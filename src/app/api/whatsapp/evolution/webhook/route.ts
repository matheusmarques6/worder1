import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// =============================================
// Evolution API Configuration
// =============================================
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;

function getEvolutionConfig() {
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return null;
  }
  return { apiUrl: EVOLUTION_API_URL, apiKey: EVOLUTION_API_KEY };
}

// =============================================
// WEBHOOK ENDPOINT
// =============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const eventType = body.event;
    const instanceName = body.instance || body.sender?.split('@')[0];
    
    console.log('[Evolution Webhook] Event:', eventType, '| Instance:', instanceName);

    if (!instanceName) {
      console.error('[Evolution Webhook] ❌ No instance name in payload');
      return NextResponse.json({ received: true, error: 'No instance name' });
    }

    // =====================================================
    // CORREÇÃO CRÍTICA: Buscar instância APENAS por nome exato
    // SEM fallbacks que vazam dados entre organizações!
    // =====================================================
    
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .or(`unique_id.eq.${instanceName},instance_name.eq.${instanceName}`)
      .single();
    
    console.log('[Evolution Webhook] Instance lookup:', { instanceName, found: !!instance, error: instanceError?.message });

    if (instanceError || !instance) {
      // =====================================================
      // REMOVIDO: Fallback perigoso que buscava QUALQUER instância conectada
      // Isso causava vazamento de dados entre organizações!
      // =====================================================
      
      console.error('[Evolution Webhook] ❌ Instance not found:', instanceName);
      console.error('[Evolution Webhook] ❌ This event will be DROPPED to prevent data leakage');
      return NextResponse.json({ 
        received: true, 
        error: 'Instance not found - event dropped for security',
        searched_for: instanceName,
        hint: 'Verifique se o unique_id no banco corresponde ao instance_name na Evolution API'
      });
    }
    
    console.log('[Evolution Webhook] ✅ Instance found:', instance.unique_id || instance.instance_name, 'Org:', instance.organization_id);
    await processEvent(instance, body, eventType);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Evolution Webhook] Error:', error);
    return NextResponse.json({ received: true, error: String(error) });
  }
}

// =============================================
// PROCESSAR EVENTO
// =============================================
async function processEvent(instance: any, body: any, eventType: string) {
  // QR Code
  if (eventType === 'qrcode.updated' || eventType === 'qr') {
    await handleQRCode(instance, body);
  }
  // Conexão
  else if (eventType === 'connection.update' || eventType === 'status' || eventType === 'connection') {
    await handleConnection(instance, body);
  }
  // Mensagem recebida
  else if (eventType === 'messages.upsert' || eventType === 'message' || eventType === 'messages') {
    await handleMessage(instance, body);
  }
  // Status de mensagem enviada
  else if (eventType === 'messages.update' || eventType === 'message.ack') {
    await handleMessageStatus(instance, body);
  }

  // Atualizar última atividade
  await supabase
    .from('whatsapp_instances')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', instance.id);
}

// =============================================
// HANDLERS
// =============================================

async function handleQRCode(instance: any, body: any) {
  const qrcode = body.data?.qrcode?.base64 || body.data?.base64 || body.qrcode?.base64 || body.qrcode;
  
  if (qrcode) {
    await supabase
      .from('whatsapp_instances')
      .update({
        status: 'qr_pending',
        qr_code: qrcode,
        updated_at: new Date().toISOString()
      })
      .eq('id', instance.id);
      
    console.log('[Evolution Webhook] ✅ QR Code updated for org:', instance.organization_id);
  }
}

async function handleConnection(instance: any, body: any) {
  const state = body.data?.state || body.state || body.data?.instance?.state;
  const phoneNumber = body.data?.instance?.wuid?.split('@')[0] || 
                     body.data?.instance?.phoneNumber ||
                     body.data?.wuid?.split('@')[0];
  
  let newStatus = 'disconnected';
  if (state === 'open') newStatus = 'connected';
  else if (state === 'connecting') newStatus = 'connecting';
  else if (state === 'close') newStatus = 'disconnected';
  
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
    
  console.log('[Evolution Webhook] ✅ Connection status:', newStatus, 'for org:', instance.organization_id);
}

async function handleMessage(instance: any, body: any) {
  const data = body.data;
  const orgId = instance.organization_id;  // ✅ SEMPRE usar org da instância
  
  // Extrair dados da mensagem
  const key = data?.key;
  const message = data?.message;
  
  if (!key || !message) {
    console.log('[Evolution Webhook] ⏭️ No key/message in payload');
    return;
  }
  
  // Ignorar mensagens próprias
  if (key.fromMe) {
    console.log('[Evolution Webhook] ⏭️ Ignoring own message');
    return;
  }
  
  const remoteJid = key.remoteJid;
  
  // Ignorar grupos
  if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@lid')) {
    console.log('[Evolution Webhook] ⏭️ Ignoring group:', remoteJid);
    return;
  }
  
  const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
  const pushName = data.pushName || null;
  
  // Extrair conteúdo
  let content = message.conversation || 
                message.extendedTextMessage?.text ||
                message.imageMessage?.caption ||
                message.videoMessage?.caption ||
                '';
                
  let messageType = 'text';
  let mediaUrl = null;
  let mediaMimetype = null;
  
  if (message.imageMessage) {
    messageType = 'image';
    mediaUrl = message.imageMessage.url;
    mediaMimetype = message.imageMessage.mimetype;
  } else if (message.videoMessage) {
    messageType = 'video';
    mediaUrl = message.videoMessage.url;
    mediaMimetype = message.videoMessage.mimetype;
  } else if (message.audioMessage) {
    messageType = message.audioMessage.ptt ? 'ptt' : 'audio';
    mediaUrl = message.audioMessage.url;
    mediaMimetype = message.audioMessage.mimetype;
  } else if (message.documentMessage) {
    messageType = 'document';
    mediaUrl = message.documentMessage.url;
    mediaMimetype = message.documentMessage.mimetype;
  } else if (message.stickerMessage) {
    messageType = 'sticker';
    mediaUrl = message.stickerMessage.url;
    mediaMimetype = message.stickerMessage.mimetype;
  }

  console.log('[Evolution Webhook] Message:', messageType, '|', content?.substring(0, 50), '| Org:', orgId);

  // =====================================================
  // BUSCAR/CRIAR CONTATO - SEMPRE na organização correta
  // =====================================================
  
  let { data: contact } = await supabase
    .from('whatsapp_contacts')
    .select('id, name')
    .eq('organization_id', orgId)  // ✅ SEMPRE filtrar por org!
    .eq('phone_number', phoneNumber)
    .limit(1)
    .single();
    
  if (!contact) {
    const { data: newContact, error: contactError } = await supabase
      .from('whatsapp_contacts')
      .insert({
        organization_id: orgId,  // ✅ SEMPRE com org!
        phone_number: phoneNumber,
        name: pushName || phoneNumber,
        profile_name: pushName,
        jid: remoteJid,
      })
      .select()
      .single();
      
    if (!contactError) {
      contact = newContact;
      console.log('[Evolution Webhook] ✅ Created contact for org:', orgId);
    }
  }
  
  // Buscar/criar contato unificado
  let { data: unifiedContact } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', orgId)  // ✅ SEMPRE filtrar por org!
    .or(`whatsapp.eq.${phoneNumber},phone.eq.${phoneNumber}`)
    .limit(1)
    .single();
    
  if (!unifiedContact) {
    const { data: newUnified } = await supabase
      .from('contacts')
      .insert({
        organization_id: orgId,  // ✅ SEMPRE com org!
        whatsapp: phoneNumber,
        phone: phoneNumber,
        first_name: pushName || phoneNumber,
        full_name: pushName || phoneNumber,
        source: 'whatsapp',
      })
      .select()
      .single();
      
    if (newUnified) {
      unifiedContact = newUnified;
    }
  }

  // =====================================================
  // BUSCAR/CRIAR CONVERSA - SEMPRE na organização correta
  // =====================================================
  
  let { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('organization_id', orgId)  // ✅ SEMPRE filtrar por org!
    .eq('phone_number', phoneNumber)
    .limit(1)
    .single();
    
  if (!conversation) {
    const { data: newConv, error: convError } = await supabase
      .from('whatsapp_conversations')
      .insert({
        organization_id: orgId,  // ✅ SEMPRE com org!
        instance_id: instance.id,
        phone_number: phoneNumber,
        chat_id: remoteJid,
        contact_id: contact?.id,
        unified_contact_id: unifiedContact?.id,
        contact_name: pushName || phoneNumber,
        status: 'open',
        unread_count: 1,
        last_message_at: new Date().toISOString(),
        last_message_preview: content?.substring(0, 100) || `[${messageType}]`,
        last_message_direction: 'incoming',
        ai_enabled: true,
      })
      .select()
      .single();
      
    if (!convError) {
      conversation = newConv;
      console.log('[Evolution Webhook] ✅ Created conversation for org:', orgId);
    }
  }
  
  if (!conversation) {
    console.error('[Evolution Webhook] ❌ Could not create/find conversation');
    return;
  }

  // =====================================================
  // SALVAR MENSAGEM - SEMPRE na organização correta
  // =====================================================
  
  const messageId = key.id || `msg_${Date.now()}`;
  
  // Verificar duplicata
  const { data: existing } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('message_id', messageId)
    .eq('organization_id', orgId)  // ✅ SEMPRE filtrar por org!
    .limit(1)
    .single();
    
  if (existing) {
    console.log('[Evolution Webhook] ⏭️ Message already exists');
    return;
  }
  
  const { error: msgError } = await supabase
    .from('whatsapp_messages')
    .insert({
      organization_id: orgId,  // ✅ SEMPRE com org!
      conversation_id: conversation.id,
      contact_id: contact?.id,
      instance_id: instance.id,
      message_id: messageId,
      direction: 'incoming',
      content: content,
      message_type: messageType,
      media_url: mediaUrl,
      media_mimetype: mediaMimetype,
      sender_name: pushName,
      sender_phone: phoneNumber,
      status: 'received',
      raw_payload: body,
      timestamp: new Date().toISOString(),
    });
    
  if (msgError) {
    console.error('[Evolution Webhook] ❌ Error saving message:', msgError);
    return;
  }
  
  console.log('[Evolution Webhook] ✅ Message saved for org:', orgId);
  
  // Atualizar conversa
  await supabase
    .from('whatsapp_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content?.substring(0, 100) || `[${messageType}]`,
      last_message_direction: 'incoming',
      unread_count: (conversation.unread_count || 0) + 1,
      status: 'open',
      unified_contact_id: unifiedContact?.id || conversation.unified_contact_id,
    })
    .eq('id', conversation.id);

  // Chamar IA se habilitada
  if (conversation.ai_enabled && messageType === 'text' && content) {
    try {
      fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app'}/api/ai/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversation.id,
          message: content,
          contact_id: contact?.id,
          unified_contact_id: unifiedContact?.id,
          organization_id: orgId,
          instance_id: instance.id,
        })
      }).catch(err => console.error('[Evolution Webhook] AI error:', err));
    } catch (e) {
      console.error('[Evolution Webhook] AI call failed:', e);
    }
  }
}

async function handleMessageStatus(instance: any, body: any) {
  const data = body.data;
  const orgId = instance.organization_id;
  
  const messageId = data?.keyId || data?.key?.id;
  const status = data?.status?.toLowerCase();
  
  if (!messageId || !status) return;
  
  // Mapear status
  const statusMap: Record<string, string> = {
    'pending': 'pending',
    'sent': 'sent',
    'delivered': 'delivered',
    'read': 'read',
    'played': 'read',
    'failed': 'failed',
    'error': 'failed',
  };
  
  const mappedStatus = statusMap[status] || status;
  
  await supabase
    .from('whatsapp_messages')
    .update({ 
      status: mappedStatus,
      updated_at: new Date().toISOString()
    })
    .eq('message_id', messageId)
    .eq('organization_id', orgId);  // ✅ SEMPRE filtrar por org!
    
  console.log('[Evolution Webhook] ✅ Status updated:', mappedStatus, 'for org:', orgId);
}
