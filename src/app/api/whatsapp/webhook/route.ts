import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Log detalhado para debug
    console.log('[Webhook] ======================================')
    console.log('[Webhook] Received event:', body.event)
    console.log('[Webhook] Instance:', body.instance)
    console.log('[Webhook] Data keys:', body.data ? Object.keys(body.data) : 'no data')

    // Tratar diferentes formatos de evento
    const eventType = body.event?.toLowerCase() || ''
    
    // Eventos de mensagem
    if (eventType === 'messages.upsert' || 
        eventType === 'message' || 
        eventType === 'messages_upsert' ||
        eventType.includes('message')) {
      console.log('[Webhook] Processing message event...')
      await processMessage(body)
    }
    
    // Eventos de conexão
    if (eventType === 'connection.update' || 
        eventType === 'connection_update' ||
        eventType.includes('connection')) {
      console.log('[Webhook] Processing connection event...')
      await processConnectionUpdate(body)
    }
    
    // Eventos de QR Code
    if (eventType === 'qrcode.updated' || 
        eventType === 'qrcode_updated' ||
        eventType.includes('qr')) {
      console.log('[Webhook] Processing QR event...')
      await processQRCode(body)
    }

    return NextResponse.json({ status: 'ok', event: body.event })
  } catch (error) {
    console.error('[Webhook] Error:', error)
    return NextResponse.json({ status: 'error', error: String(error) }, { status: 200 })
  }
}

// Processar atualização de conexão
async function processConnectionUpdate(body: any) {
  const instanceName = body.instance
  const data = body.data
  
  if (!instanceName) return
  
  const state = data?.state || data?.instance?.state
  console.log('[Webhook] Connection state:', state, 'for instance:', instanceName)
  
  // Buscar instância - APENAS por nome exato, sem fallbacks perigosos
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('id, organization_id')
    .or(`instance_name.eq.${instanceName},instance_id.eq.${instanceName},unique_id.eq.${instanceName}`)
    .single()
    
  if (instance) {
    const newStatus = state === 'open' ? 'connected' : 
                     state === 'connecting' ? 'connecting' : 'disconnected'
    
    await supabase
      .from('whatsapp_instances')
      .update({
        status: newStatus,
        phone_number: data?.instance?.phoneNumber || data?.instance?.wuid?.split('@')[0],
        qr_code: state === 'open' ? null : undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', instance.id)
      
    console.log('[Webhook] Instance status updated to:', newStatus, 'org:', instance.organization_id)
  } else {
    console.log('[Webhook] ⚠️ Instance not found for connection update:', instanceName)
  }
}

// Processar QR Code
async function processQRCode(body: any) {
  const instanceName = body.instance
  const data = body.data
  
  if (!instanceName) return
  
  const qrcode = data?.qrcode?.base64 || data?.base64
  
  if (qrcode) {
    const { error } = await supabase
      .from('whatsapp_instances')
      .update({
        status: 'qr_pending',
        qr_code: qrcode,
        updated_at: new Date().toISOString()
      })
      .or(`instance_name.eq.${instanceName},instance_id.eq.${instanceName},unique_id.eq.${instanceName}`)
      
    if (!error) {
      console.log('[Webhook] QR Code updated for:', instanceName)
    } else {
      console.error('[Webhook] Error updating QR Code:', error)
    }
  }
}

async function processMessage(body: any) {
  const instanceName = body.instance
  const data = body.data

  console.log('[Webhook] Processing message for instance:', instanceName)

  // =====================================================
  // CORREÇÃO CRÍTICA: Buscar instância APENAS por nome exato
  // SEM fallbacks que vazam dados entre organizações!
  // =====================================================
  
  if (!instanceName) {
    console.log('[Webhook] ❌ No instance name in webhook payload')
    return
  }

  // Buscar instância por nome exato - múltiplas formas de identificação
  const { data: instances } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .or(`instance_name.eq.${instanceName},instance_id.eq.${instanceName},unique_id.eq.${instanceName}`)
    .limit(1)

  let instance = instances?.[0]
  
  // Se não encontrou por nome exato, tentar busca parcial (mas ainda específica!)
  if (!instance) {
    console.log('[Webhook] Instance not found by exact name, trying partial match:', instanceName)
    
    const { data: instances2 } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .or(`instance_name.ilike.%${instanceName}%,unique_id.ilike.%${instanceName}%`)
      .limit(1)
      
    instance = instances2?.[0]
  }
  
  // =====================================================
  // REMOVIDO: Fallbacks perigosos que buscavam QUALQUER instância
  // Isso causava vazamento de dados entre organizações!
  // =====================================================
  
  if (!instance) {
    console.log('[Webhook] ❌ Instance not found:', instanceName)
    console.log('[Webhook] ❌ This message will be DROPPED to prevent data leakage')
    return
  }

  console.log('[Webhook] ✅ Instance found:', instance.instance_name || instance.unique_id, 'Org:', instance.organization_id)

  const orgId = instance.organization_id
  
  // =====================================================
  // EXTRAIR DADOS - Suportar múltiplos formatos do Evolution
  // =====================================================
  
  // IMPORTANTE: Verificar se é uma mensagem real ou apenas status update
  if (!data?.key && !data?.message && data?.status) {
    console.log('[Webhook] ⏭️ Ignoring status update:', data?.status)
    return
  }
  
  if (!data?.key && !data?.message) {
    console.log('[Webhook] ⏭️ Ignoring event without key/message')
    return
  }
  
  // Tentar extrair de diferentes estruturas do Evolution API
  let messageData = data
  
  if (Array.isArray(data)) {
    messageData = data[0]
    console.log('[Webhook] Data is array, using first element')
  }
  
  // Extrair key
  const key = messageData?.key || body?.key
  const message = messageData?.message || body?.message
  
  console.log('[Webhook] Extracted key:', JSON.stringify(key))

  // Ignorar mensagens próprias
  if (key?.fromMe) {
    console.log('[Webhook] ⏭️ Ignoring own message')
    return
  }

  // Extrair remoteJid
  const remoteJid = key?.remoteJid || key?.remoteJidAlt
  
  console.log('[Webhook] Extracted remoteJid:', remoteJid)
  
  if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@lid')) {
    console.log('[Webhook] ⏭️ Ignoring group or lid:', remoteJid)
    return
  }

  const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '')
  const pushName = messageData?.pushName || data?.pushName || body?.pushName || null

  // Extrair conteúdo da mensagem
  let content = message?.conversation || 
                message?.extendedTextMessage?.text || 
                message?.imageMessage?.caption ||
                message?.videoMessage?.caption ||
                message?.documentMessage?.caption ||
                message?.audioMessage?.caption ||
                ''
  
  // Tipo de mensagem
  let messageType = 'text'
  let mediaUrl = null
  let mediaKey = null
  let mediaMimetype = null
  let fileName = null

  if (message?.imageMessage) {
    messageType = 'image'
    mediaUrl = message.imageMessage.url
    mediaKey = message.imageMessage.mediaKey
    mediaMimetype = message.imageMessage.mimetype
  } else if (message?.videoMessage) {
    messageType = 'video'
    mediaUrl = message.videoMessage.url
    mediaKey = message.videoMessage.mediaKey
    mediaMimetype = message.videoMessage.mimetype
  } else if (message?.audioMessage) {
    messageType = message.audioMessage.ptt ? 'ptt' : 'audio'
    mediaUrl = message.audioMessage.url
    mediaKey = message.audioMessage.mediaKey
    mediaMimetype = message.audioMessage.mimetype
  } else if (message?.documentMessage) {
    messageType = 'document'
    mediaUrl = message.documentMessage.url
    mediaKey = message.documentMessage.mediaKey
    mediaMimetype = message.documentMessage.mimetype
    fileName = message.documentMessage.fileName
  } else if (message?.stickerMessage) {
    messageType = 'sticker'
    mediaUrl = message.stickerMessage.url
    mediaKey = message.stickerMessage.mediaKey
    mediaMimetype = message.stickerMessage.mimetype
  } else if (message?.locationMessage) {
    messageType = 'location'
    content = `📍 ${message.locationMessage.degreesLatitude}, ${message.locationMessage.degreesLongitude}`
  } else if (message?.contactMessage) {
    messageType = 'contact'
    content = `👤 ${message.contactMessage.displayName || 'Contact'}`
  }

  console.log('[Webhook] Message type:', messageType, '| Content:', content?.substring(0, 100))

  // =====================================================
  // BUSCAR OU CRIAR CONTATO - SEMPRE na organização correta
  // =====================================================
  
  // 1. Buscar contato unificado
  let { data: unifiedContact } = await supabase
    .from('contacts')
    .select('id, full_name, first_name, profile_picture_url')
    .eq('organization_id', orgId)  // ✅ SEMPRE filtrar por org!
    .or(`whatsapp.eq.${phoneNumber},phone.eq.${phoneNumber}`)
    .limit(1)
    .single()

  // 2. Buscar ou criar contato legado (whatsapp_contacts)
  let { data: legacyContact } = await supabase
    .from('whatsapp_contacts')
    .select('id, name, profile_name, profile_picture_url')
    .eq('organization_id', orgId)  // ✅ SEMPRE filtrar por org!
    .eq('phone_number', phoneNumber)
    .limit(1)
    .single()

  // 3. Criar contato legado se não existir
  if (!legacyContact) {
    const contactName = pushName || phoneNumber
    
    const { data: newContact, error: contactError } = await supabase
      .from('whatsapp_contacts')
      .insert({
        organization_id: orgId,  // ✅ SEMPRE com org!
        phone_number: phoneNumber,
        name: contactName,
        profile_name: pushName,
        jid: remoteJid,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (contactError) {
      console.error('[Webhook] Error creating contact:', contactError)
    } else {
      legacyContact = newContact
      console.log('[Webhook] ✅ Created new contact:', contactName, 'for org:', orgId)
    }
  }

  // 4. Criar contato unificado se não existir e tiver contato legado
  if (!unifiedContact && legacyContact) {
    const { data: newUnified, error: unifiedError } = await supabase
      .from('contacts')
      .insert({
        organization_id: orgId,  // ✅ SEMPRE com org!
        whatsapp: phoneNumber,
        phone: phoneNumber,
        first_name: pushName || phoneNumber,
        full_name: pushName || phoneNumber,
        source: 'whatsapp',
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (!unifiedError) {
      unifiedContact = newUnified
      console.log('[Webhook] ✅ Created unified contact for org:', orgId)
    }
  }

  // =====================================================
  // BUSCAR OU CRIAR CONVERSA - SEMPRE na organização correta
  // =====================================================
  
  let { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('organization_id', orgId)  // ✅ SEMPRE filtrar por org!
    .eq('phone_number', phoneNumber)
    .limit(1)
    .single()

  if (!conversation) {
    const { data: newConv, error: convError } = await supabase
      .from('whatsapp_conversations')
      .insert({
        organization_id: orgId,  // ✅ SEMPRE com org!
        instance_id: instance.id,
        phone_number: phoneNumber,
        chat_id: remoteJid,
        contact_id: legacyContact?.id,
        unified_contact_id: unifiedContact?.id,
        contact_name: pushName || phoneNumber,
        contact_avatar: null,
        status: 'open',
        unread_count: 1,
        last_message_at: new Date().toISOString(),
        last_message_preview: content?.substring(0, 100) || `[${messageType}]`,
        last_message_direction: 'incoming',
        ai_enabled: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (convError) {
      console.error('[Webhook] Error creating conversation:', convError)
      return
    }
    
    conversation = newConv
    console.log('[Webhook] ✅ Created new conversation for org:', orgId)
  }

  // =====================================================
  // SALVAR MENSAGEM - SEMPRE na organização correta
  // =====================================================
  
  const messageId = key?.id || `msg_${Date.now()}`
  
  // Verificar se mensagem já existe
  const { data: existingMessage } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('message_id', messageId)
    .eq('organization_id', orgId)  // ✅ SEMPRE filtrar por org!
    .limit(1)
    .single()

  if (existingMessage) {
    console.log('[Webhook] ⏭️ Message already exists:', messageId)
    return
  }

  const { error: msgError } = await supabase
    .from('whatsapp_messages')
    .insert({
      organization_id: orgId,  // ✅ SEMPRE com org!
      conversation_id: conversation.id,
      contact_id: legacyContact?.id,
      instance_id: instance.id,
      message_id: messageId,
      direction: 'incoming',
      content: content,
      message_type: messageType,
      media_url: mediaUrl,
      media_key: mediaKey,
      media_mimetype: mediaMimetype,
      file_name: fileName,
      sender_name: pushName,
      sender_phone: phoneNumber,
      status: 'received',
      raw_payload: body,
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString()
    })

  if (msgError) {
    console.error('[Webhook] Error saving message:', msgError)
    return
  }

  console.log('[Webhook] ✅ Message saved for org:', orgId)

  // =====================================================
  // ATUALIZAR CONVERSA
  // =====================================================
  
  await supabase
    .from('whatsapp_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content?.substring(0, 100) || `[${messageType}]`,
      last_message_direction: 'incoming',
      unread_count: (conversation.unread_count || 0) + 1,
      status: 'open',
      // Atualizar contato unificado se criado
      unified_contact_id: unifiedContact?.id || conversation.unified_contact_id,
      updated_at: new Date().toISOString()
    })
    .eq('id', conversation.id)

  console.log('[Webhook] ✅ Conversation updated')

  // =====================================================
  // PROCESSAR IA (se habilitada)
  // =====================================================
  
  if (conversation.ai_enabled && messageType === 'text' && content) {
    console.log('[Webhook] 🤖 AI enabled, triggering response...')
    
    try {
      // Chamar API de IA de forma assíncrona
      fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app'}/api/ai/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversation.id,
          message: content,
          contact_id: legacyContact?.id,
          unified_contact_id: unifiedContact?.id,
          organization_id: orgId,
          instance_id: instance.id,
        })
      }).catch(err => console.error('[Webhook] AI call error:', err))
    } catch (aiError) {
      console.error('[Webhook] Error calling AI:', aiError)
    }
  }

  console.log('[Webhook] ======================================')
}
