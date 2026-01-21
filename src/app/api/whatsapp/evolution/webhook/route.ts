import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// =============================================
// Evolution API Webhook - CORRIGIDO
// =============================================
// Mudanças principais:
// 1. Usa função upsert_whatsapp_conversation para evitar duplicatas
// 2. Sincroniza phone_number com contact_phone
// 3. Melhor tratamento de erros
// 4. Logs estruturados para debug
// =============================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    
    const eventType = body.event;
    const instanceName = body.instance || body.sender?.split('@')[0];
    
    console.log('[Webhook] ▶️ Event:', eventType, '| Instance:', instanceName);

    if (!instanceName) {
      console.error('[Webhook] ❌ No instance name in payload');
      return NextResponse.json({ received: true, error: 'No instance name' });
    }

    // =====================================================
    // BUSCAR INSTÂNCIA - Apenas por nome exato
    // =====================================================
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .or(`unique_id.eq.${instanceName},instance_name.eq.${instanceName}`)
      .single();

    if (instanceError || !instance) {
      console.error('[Webhook] ❌ Instance not found:', instanceName);
      return NextResponse.json({ 
        received: true, 
        error: 'Instance not found',
        searched_for: instanceName
      });
    }
    
    console.log('[Webhook] ✅ Instance found:', instance.id, 'Org:', instance.organization_id, 'Store:', instance.store_id);

    // Processar evento
    await processEvent(instance, body, eventType);

    const duration = Date.now() - startTime;
    console.log('[Webhook] ✅ Completed in', duration, 'ms');

    return NextResponse.json({ received: true, duration_ms: duration });
  } catch (error) {
    console.error('[Webhook] ❌ Error:', error);
    return NextResponse.json({ received: true, error: String(error) });
  }
}

// =============================================
// PROCESSAR EVENTO
// =============================================
async function processEvent(instance: any, body: any, eventType: string) {
  switch (eventType) {
    case 'qrcode.updated':
    case 'qr':
      await handleQRCode(instance, body);
      break;
      
    case 'connection.update':
    case 'status':
    case 'connection':
      await handleConnection(instance, body);
      break;
      
    case 'messages.upsert':
    case 'message':
    case 'messages':
      await handleMessage(instance, body);
      break;
      
    case 'messages.update':
    case 'message.ack':
      await handleMessageStatus(instance, body);
      break;
  }

  // Atualizar última atividade da instância
  await supabase
    .from('whatsapp_instances')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', instance.id);
}

// =============================================
// HANDLER: QR CODE
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
      
    console.log('[Webhook] ✅ QR Code updated');
  }
}

// =============================================
// HANDLER: CONNECTION
// =============================================
async function handleConnection(instance: any, body: any) {
  const state = body.data?.state || body.state || body.data?.instance?.state;
  const phoneNumber = body.data?.instance?.wuid?.split('@')[0] || 
                     body.data?.instance?.phoneNumber ||
                     body.data?.wuid?.split('@')[0];
  
  const statusMap: Record<string, string> = {
    'open': 'connected',
    'connecting': 'connecting',
    'close': 'disconnected'
  };
  
  const newStatus = statusMap[state] || 'disconnected';
  
  await supabase
    .from('whatsapp_instances')
    .update({
      status: newStatus,
      phone_number: phoneNumber || instance.phone_number,
      qr_code: newStatus === 'connected' ? null : instance.qr_code,
      online_status: newStatus === 'connected' ? 'available' : 'unavailable',
      connected_at: newStatus === 'connected' ? new Date().toISOString() : instance.connected_at,
      disconnected_at: newStatus === 'disconnected' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq('id', instance.id);
    
  console.log('[Webhook] ✅ Connection status:', newStatus);
}

// =============================================
// HANDLER: MESSAGE - CORRIGIDO COM UPSERT
// =============================================
async function handleMessage(instance: any, body: any) {
  const data = body.data;
  const orgId = instance.organization_id;
  const storeId = instance.store_id;
  
  // Extrair dados da mensagem
  const key = data?.key;
  const message = data?.message;
  
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
  const { content, messageType, mediaUrl, mediaMimetype } = extractMessageContent(message);

  console.log('[Webhook] 📨 Message:', messageType, '|', content?.substring(0, 50), '| Phone:', phoneNumber);

  // =====================================================
  // BUSCAR/CRIAR CONTATO
  // =====================================================
  const contact = await findOrCreateContact(orgId, storeId, phoneNumber, pushName, remoteJid);
  const unifiedContact = await findOrCreateUnifiedContact(orgId, phoneNumber, pushName);

  // =====================================================
  // BUSCAR/CRIAR CONVERSA - USANDO FUNÇÃO UPSERT
  // =====================================================
  const conversation = await findOrCreateConversation(
    orgId,
    storeId,
    instance.id,
    phoneNumber,
    remoteJid,
    pushName,
    contact?.id,
    unifiedContact?.id
  );
  
  if (!conversation) {
    console.error('[Webhook] ❌ Could not create/find conversation');
    return;
  }

  // =====================================================
  // SALVAR MENSAGEM - COM VERIFICAÇÃO DE DUPLICATA
  // =====================================================
  const messageId = key.id || `msg_${Date.now()}`;
  
  // Verificar duplicata
  const { data: existing } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('message_id', messageId)
    .eq('organization_id', orgId)
    .eq('instance_id', instance.id)
    .limit(1)
    .single();
    
  if (existing) {
    console.log('[Webhook] ⏭️ Message already exists:', messageId);
    return;
  }
  
  // Inserir mensagem
  const { data: savedMessage, error: msgError } = await supabase
    .from('whatsapp_messages')
    .insert({
      organization_id: orgId,
      store_id: storeId,
      instance_id: instance.id,
      conversation_id: conversation.id,
      contact_id: contact?.id,
      message_id: messageId,
      direction: 'incoming',
      from_number: phoneNumber,
      message_type: messageType,
      content: typeof content === 'string' ? { text: content } : content,
      text_body: typeof content === 'string' ? content : null,
      media_url: mediaUrl,
      media_mime_type: mediaMimetype,
      status: 'received',
      timestamp: new Date().toISOString(),
    })
    .select()
    .single();
    
  if (msgError) {
    console.error('[Webhook] ❌ Error saving message:', msgError);
    return;
  }
  
  console.log('[Webhook] ✅ Message saved:', savedMessage.id);
  
  // Atualizar conversa
  await supabase
    .from('whatsapp_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: (typeof content === 'string' ? content : `[${messageType}]`).substring(0, 100),
      last_message_direction: 'incoming',
      last_customer_message_at: new Date().toISOString(),
      unread_count: (conversation.unread_count || 0) + 1,
      status: 'open',
      unified_contact_id: unifiedContact?.id || conversation.unified_contact_id,
      updated_at: new Date().toISOString()
    })
    .eq('id', conversation.id);

  // Processar IA se habilitada
  if (conversation.ai_enabled && messageType === 'text' && content) {
    await triggerAIProcessing(conversation, savedMessage, content, orgId, instance.id);
  }
}

// =============================================
// ENCONTRAR OU CRIAR CONVERSA - COM UPSERT
// =============================================
async function findOrCreateConversation(
  orgId: string,
  storeId: string | null,
  instanceId: string,
  phoneNumber: string,
  chatId: string,
  contactName: string | null,
  contactId: string | null,
  unifiedContactId: string | null
) {
  // Tentar usar a função RPC se existir
  try {
    const { data: conversation, error } = await supabase.rpc('upsert_whatsapp_conversation', {
      p_organization_id: orgId,
      p_store_id: storeId,
      p_instance_id: instanceId,
      p_contact_phone: phoneNumber,
      p_chat_id: chatId,
      p_contact_name: contactName,
      p_contact_id: contactId,
      p_unified_contact_id: unifiedContactId
    });
    
    if (!error && conversation) {
      console.log('[Webhook] ✅ Conversation via RPC:', conversation.id);
      return conversation;
    }
  } catch (e) {
    console.log('[Webhook] ⚠️ RPC not available, using fallback');
  }

  // Fallback: busca tradicional com lock
  // Primeiro tenta encontrar
  let { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('instance_id', instanceId)
    .eq('contact_phone', phoneNumber)
    .limit(1)
    .single();

  if (conversation) {
    console.log('[Webhook] ✅ Found existing conversation:', conversation.id);
    return conversation;
  }

  // Se não existe, criar com ON CONFLICT
  const { data: newConv, error: convError } = await supabase
    .from('whatsapp_conversations')
    .upsert({
      organization_id: orgId,
      store_id: storeId,
      instance_id: instanceId,
      contact_phone: phoneNumber,
      phone_number: phoneNumber, // Sincronizar!
      chat_id: chatId,
      contact_name: contactName || phoneNumber,
      contact_id: contactId,
      unified_contact_id: unifiedContactId,
      status: 'open',
      unread_count: 1,
      ai_enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'store_id,instance_id,contact_phone',
      ignoreDuplicates: false
    })
    .select()
    .single();
    
  if (convError) {
    // Se deu erro de duplicata, buscar novamente
    if (convError.code === '23505') {
      console.log('[Webhook] ⚠️ Duplicate detected, fetching existing');
      const { data: existing } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .eq('organization_id', orgId)
        .eq('instance_id', instanceId)
        .eq('contact_phone', phoneNumber)
        .limit(1)
        .single();
      return existing;
    }
    console.error('[Webhook] ❌ Error creating conversation:', convError);
    return null;
  }
  
  console.log('[Webhook] ✅ Created conversation:', newConv.id);
  return newConv;
}

// =============================================
// HELPERS
// =============================================

function extractMessageContent(message: any) {
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

  return { content, messageType, mediaUrl, mediaMimetype };
}

async function findOrCreateContact(
  orgId: string, 
  storeId: string | null, 
  phoneNumber: string, 
  pushName: string | null,
  jid: string
) {
  let { data: contact } = await supabase
    .from('whatsapp_contacts')
    .select('id, name')
    .eq('organization_id', orgId)
    .eq('phone_number', phoneNumber)
    .limit(1)
    .single();
    
  if (!contact) {
    const { data: newContact } = await supabase
      .from('whatsapp_contacts')
      .insert({
        organization_id: orgId,
        store_id: storeId,
        phone_number: phoneNumber,
        name: pushName || phoneNumber,
        profile_name: pushName,
        jid: jid,
      })
      .select()
      .single();
      
    contact = newContact;
    console.log('[Webhook] ✅ Created whatsapp_contact');
  }
  
  return contact;
}

async function findOrCreateUnifiedContact(
  orgId: string,
  phoneNumber: string,
  pushName: string | null
) {
  let { data: unifiedContact } = await supabase
    .from('contacts')
    .select('id')
    .eq('organization_id', orgId)
    .or(`whatsapp.eq.${phoneNumber},phone.eq.${phoneNumber}`)
    .limit(1)
    .single();
    
  if (!unifiedContact) {
    const { data: newUnified } = await supabase
      .from('contacts')
      .insert({
        organization_id: orgId,
        whatsapp: phoneNumber,
        phone: phoneNumber,
        first_name: pushName || phoneNumber,
        full_name: pushName || phoneNumber,
        source: 'whatsapp',
      })
      .select()
      .single();
      
    unifiedContact = newUnified;
    console.log('[Webhook] ✅ Created unified contact');
  }
  
  return unifiedContact;
}

async function triggerAIProcessing(
  conversation: any,
  message: any,
  content: string,
  orgId: string,
  instanceId: string
) {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app';
    
    // TODO: Migrar para QStash para retry automático
    // Por enquanto, fire-and-forget mas com log
    fetch(`${appUrl}/api/ai/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversation.id,
        message_id: message.id,
        message: content,
        contact_id: conversation.contact_id,
        unified_contact_id: conversation.unified_contact_id,
        organization_id: orgId,
        instance_id: instanceId,
      })
    }).catch(err => console.error('[Webhook] ⚠️ AI trigger error:', err));
    
    console.log('[Webhook] 🤖 AI processing triggered');
  } catch (e) {
    console.error('[Webhook] ❌ AI trigger failed:', e);
  }
}

// =============================================
// HANDLER: MESSAGE STATUS
// =============================================
async function handleMessageStatus(instance: any, body: any) {
  const data = body.data;
  const orgId = instance.organization_id;
  
  const messageId = data?.keyId || data?.key?.id;
  const status = data?.status?.toLowerCase();
  
  if (!messageId || !status) return;
  
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
  
  const updates: Record<string, any> = { 
    status: mappedStatus,
    updated_at: new Date().toISOString()
  };
  
  // Adicionar timestamps específicos
  if (mappedStatus === 'delivered') {
    updates.delivered_at = new Date().toISOString();
  } else if (mappedStatus === 'read') {
    updates.read_at = new Date().toISOString();
  }
  
  await supabase
    .from('whatsapp_messages')
    .update(updates)
    .eq('message_id', messageId)
    .eq('organization_id', orgId);
    
  console.log('[Webhook] ✅ Status updated:', mappedStatus);
}
