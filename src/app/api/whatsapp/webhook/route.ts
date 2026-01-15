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
    console.log('[Webhook] Full body:', JSON.stringify(body, null, 2).substring(0, 1000))

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
  
  // Buscar e atualizar instância - tentar múltiplas formas
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('id')
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
      
    console.log('[Webhook] Instance status updated to:', newStatus)
  } else {
    console.log('[Webhook] Instance not found for connection update:', instanceName)
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

  // 1. Buscar instância - tentar múltiplas formas
  let instance = null
  
  // Primeiro: tentar por instance_name ou instance_id exato
  if (instanceName) {
    const { data: instances1 } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .or(`instance_name.eq.${instanceName},instance_id.eq.${instanceName},unique_id.eq.${instanceName}`)
      .limit(1)

    instance = instances1?.[0]
    
    // Se não encontrou, tentar busca parcial
    if (!instance) {
      console.log('[Webhook] Instância não encontrada por nome exato:', instanceName)
      
      const { data: instances2 } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .or(`instance_name.ilike.%${instanceName}%,unique_id.ilike.%${instanceName}%`)
        .limit(1)
        
      instance = instances2?.[0]
    }
  }
  
  // Se ainda não encontrou, usar a primeira instância conectada (fallback importante!)
  if (!instance) {
    console.log('[Webhook] Tentando buscar qualquer instância conectada...')
    
    const { data: instances3 } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('status', 'connected')
      .limit(1)
      
    instance = instances3?.[0]
  }
  
  // Último fallback: qualquer instância
  if (!instance) {
    console.log('[Webhook] Tentando buscar qualquer instância...')
    
    const { data: instances4 } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .limit(1)
      
    instance = instances4?.[0]
  }
  
  if (!instance) {
    console.log('[Webhook] ❌ Nenhuma instância encontrada')
    return
  }

  console.log('[Webhook] ✅ Instância encontrada:', instance.instance_name || instance.unique_id, 'Org:', instance.organization_id)

  const orgId = instance.organization_id
  
  // =====================================================
  // EXTRAIR DADOS - Suportar múltiplos formatos do Evolution
  // =====================================================
  
  // Log para debug da estrutura
  console.log('[Webhook] Data structure:', JSON.stringify({
    hasData: !!data,
    dataKeys: data ? Object.keys(data) : [],
    hasKey: !!data?.key,
    hasMessage: !!data?.message,
    isArray: Array.isArray(data),
  }))
  
  // IMPORTANTE: Verificar se é uma mensagem real ou apenas status update
  // Status updates têm: keyId, remoteJid, fromMe, status, instanceId, messageId (sem key e message)
  // Mensagens reais têm: key, pushName, status, message, messageType, messageTimestamp
  
  if (!data?.key && !data?.message && data?.status) {
    // É um status update (delivered, read, etc.), não uma mensagem nova
    console.log('[Webhook] ⏭️ Ignorando status update:', data?.status)
    return
  }
  
  // Verificar se tem os campos necessários para uma mensagem
  if (!data?.key && !data?.message) {
    console.log('[Webhook] ⏭️ Ignorando evento sem key/message')
    return
  }
  
  // Tentar extrair de diferentes estruturas do Evolution API
  let messageData = data
  
  // Se data é um array (messages.upsert pode enviar array)
  if (Array.isArray(data)) {
    messageData = data[0]
    console.log('[Webhook] Data is array, using first element')
  }
  
  // Extrair key
  const key = messageData?.key || body?.key
  
  // Extrair message
  const message = messageData?.message || body?.message
  
  console.log('[Webhook] Extracted key:', JSON.stringify(key))

  // Ignorar mensagens próprias
  if (key?.fromMe) {
    console.log('[Webhook] ⏭️ Ignorando mensagem própria')
    return
  }

  // Extrair remoteJid
  const remoteJid = key?.remoteJid || key?.remoteJidAlt
                    
  console.log('[Webhook] Extracted remoteJid:', remoteJid)
  
  if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('@lid')) {
    console.log('[Webhook] ⏭️ Ignorando grupo ou lid:', remoteJid)
    return
  }

  const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '')
  const pushName = messageData?.pushName || data?.pushName || body?.pushName || phoneNumber

  // Extrair conteúdo da mensagem
  let content = message?.conversation || 
                message?.extendedTextMessage?.text || 
                message?.imageMessage?.caption ||
                message?.videoMessage?.caption ||
                messageData?.body ||
                ''
                
  // Se não tem conteúdo, verificar tipo de mídia
  if (!content) {
    if (message?.imageMessage) content = '[Imagem]'
    else if (message?.audioMessage) content = '[Áudio]'
    else if (message?.videoMessage) content = '[Vídeo]'
    else if (message?.documentMessage) content = message?.documentMessage?.fileName || '[Documento]'
    else if (message?.stickerMessage) content = '[Sticker]'
    else if (message?.locationMessage) content = '[Localização]'
    else if (message?.contactMessage) content = '[Contato]'
    else content = '[Mídia]'
  }
  
  console.log('[Webhook] 📩 Mensagem de:', phoneNumber, '| Nome:', pushName, '| Conteúdo:', content?.substring(0, 50))

  // Determinar tipo de mensagem
  let messageType = messageData?.messageType || 'text'
  if (message?.imageMessage) messageType = 'image'
  if (message?.audioMessage) messageType = 'audio'
  if (message?.videoMessage) messageType = 'video'
  if (message?.documentMessage) messageType = 'document'
  if (message?.stickerMessage) messageType = 'sticker'
  if (message?.locationMessage) messageType = 'location'
  if (message?.contactMessage) messageType = 'contact'

  console.log('[Webhook] 📩 Tipo:', messageType)

  // 2. Buscar ou criar CONVERSA diretamente (sem depender de whatsapp_contacts)
  const chatId = remoteJid
  
  let { data: conversation, error: convFetchError } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('chat_id', chatId)
    .single()

  if (convFetchError && convFetchError.code !== 'PGRST116') {
    console.error('[Webhook] Erro ao buscar conversa:', convFetchError)
  }

  if (!conversation) {
    // Criar nova conversa
    console.log('[Webhook] Criando nova conversa para:', phoneNumber)
    
    const { data: newConv, error: convError } = await supabase
      .from('whatsapp_conversations')
      .insert({
        organization_id: orgId,
        instance_id: instance.id,
        chat_id: chatId,
        contact_phone: phoneNumber,
        contact_name: pushName,
        status: 'open',
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
        last_message_direction: 'inbound',
        unread_count: 1,
      })
      .select()
      .single()
    
    if (convError) {
      console.error('[Webhook] ❌ Erro ao criar conversa:', convError)
      return
    }
    conversation = newConv
    console.log('[Webhook] ✅ Nova conversa criada:', conversation?.id)
  } else {
    console.log('[Webhook] Conversa existente:', conversation.id)
    // Atualizar conversa existente
    const { error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update({
        status: 'open',
        contact_name: pushName,
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
        last_message_direction: 'inbound',
        last_customer_message_at: new Date().toISOString(),
        unread_count: (conversation.unread_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation.id)
      
    if (updateError) {
      console.error('[Webhook] Erro ao atualizar conversa:', updateError)
    }
  }

  if (!conversation) {
    console.error('[Webhook] ❌ Conversa não criada, abortando')
    return
  }

  // 3. Verificar se mensagem já existe (evitar duplicação)
  const messageId = key?.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  const { data: existingMsg } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('message_id', messageId)
    .maybeSingle()

  if (existingMsg) {
    console.log('[Webhook] Mensagem já existe, ignorando:', messageId)
    return
  }

  // 4. Salvar mensagem
  const { data: savedMsg, error: msgError } = await supabase
    .from('whatsapp_messages')
    .insert({
      organization_id: orgId,
      instance_id: instance.id,
      conversation_id: conversation.id,
      message_id: messageId,
      direction: 'inbound',
      message_type: messageType,
      content: content,
      status: 'received',
      metadata: { pushName, remoteJid },
    })
    .select()
    .single()

  if (msgError) {
    console.error('[Webhook] ❌ Erro ao salvar mensagem:', msgError)
    return
  }
  
  console.log('[Webhook] ✅ Mensagem salva:', savedMsg?.id, '| Conversa:', conversation.id)

  // =====================================================
  // 5. PROCESSAR COM AGENTE DE IA (VIA FILA OU SYNC)
  // =====================================================
  
  // Só processar mensagens de texto
  if (messageType !== 'text') {
    console.log('[Webhook] 📷 Mensagem não é texto, pulando IA')
    return
  }

  const aiParams = {
    organizationId: orgId,
    conversationId: conversation.id,
    contactId: null as string | null,
    instanceId: instance.id,
    instanceName: instance.unique_id || instance.instance_name,
    phoneNumber: phoneNumber,
    message: content,
    messageId: key?.id,
    contactName: pushName,
  }

  // Tentar enfileirar para processamento durável
  const { enqueueWhatsAppAI, isQStashConfigured } = await import('@/lib/queue')
  
  if (isQStashConfigured()) {
    // Produção: usar fila para garantir durabilidade
    const messageQueueId = await enqueueWhatsAppAI(aiParams)
    
    if (messageQueueId) {
      console.log(`[Webhook] 📤 Enfileirado para processamento: ${messageQueueId}`)
      return
    }
    
    // Fallback se falhar ao enfileirar
    console.warn('[Webhook] ⚠️ Falha ao enfileirar, processando sync')
  }

  // Dev/Fallback: processar síncrono
  processWithAI(aiParams).catch((aiError) => {
    console.error('[Webhook] ❌ Erro ao processar com IA:', aiError)
  })
}

// =====================================================
// PROCESSADOR DE IA (SYNC FALLBACK)
// =====================================================

async function processWithAI(params: {
  organizationId: string
  conversationId: string
  contactId: string | null
  instanceId: string
  instanceName: string
  phoneNumber: string
  message: string
  messageId?: string
  contactName?: string
}) {
  try {
    const { processWebhookWithAI } = await import('@/lib/ai/webhook-processor')
    
    const result = await processWebhookWithAI(params)

    console.log('[Webhook] 🤖 Resultado IA:', {
      processed: result.processed,
      replied: result.replied,
      transferred: result.transferred,
      agentName: result.agentName,
      error: result.error,
    })

  } catch (error) {
    console.error('[Webhook] ❌ Erro no processador de IA:', error)
  }
}

export async function GET() {
  const { isQStashConfigured } = await import('@/lib/queue')
  
  return NextResponse.json({ 
    status: 'Webhook WhatsApp ativo',
    ai_enabled: true,
    queue_enabled: isQStashConfigured(),
    version: '2.5-simplified',
    features: ['message_processing', 'ai_agent_response', 'typing_indicator', 'durable_queue'],
    timestamp: new Date().toISOString(),
  })
}
