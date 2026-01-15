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
  
  // Buscar e atualizar instância
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('id')
    .eq('unique_id', instanceName)
    .single()
    
  if (instance) {
    const newStatus = state === 'open' ? 'connected' : 
                     state === 'connecting' ? 'connecting' : 'disconnected'
    
    await supabase
      .from('whatsapp_instances')
      .update({
        status: newStatus,
        online_status: state === 'open' ? 'available' : 'unavailable',
        phone_number: data?.instance?.phoneNumber || data?.instance?.wuid?.split('@')[0],
        updated_at: new Date().toISOString()
      })
      .eq('id', instance.id)
      
    console.log('[Webhook] Instance status updated to:', newStatus)
  }
}

// Processar QR Code
async function processQRCode(body: any) {
  const instanceName = body.instance
  const data = body.data
  
  if (!instanceName) return
  
  const qrcode = data?.qrcode?.base64 || data?.base64
  
  if (qrcode) {
    await supabase
      .from('whatsapp_instances')
      .update({
        status: 'generating',
        qr_code: qrcode,
        updated_at: new Date().toISOString()
      })
      .eq('unique_id', instanceName)
      
    console.log('[Webhook] QR Code updated for:', instanceName)
  }
}

async function processMessage(body: any) {
  const instanceName = body.instance
  const data = body.data

  // 1. Buscar instância - tentar múltiplas formas
  let instance = null
  
  // Tentar por unique_id
  const { data: instances1 } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('unique_id', instanceName)
    .limit(1)

  instance = instances1?.[0]
  
  // Se não encontrou, tentar buscar qualquer instância conectada (para debug)
  if (!instance) {
    console.log('[Webhook] Instância não encontrada por unique_id:', instanceName)
    
    // Tentar por instance_name parcial
    const { data: instances2 } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .ilike('unique_id', `%${instanceName}%`)
      .limit(1)
      
    instance = instances2?.[0]
  }
  
  if (!instance) {
    console.log('[Webhook] ❌ Nenhuma instância encontrada para:', instanceName)
    console.log('[Webhook] Buscando todas as instâncias...')
    
    const { data: allInstances } = await supabase
      .from('whatsapp_instances')
      .select('unique_id, status')
      .limit(10)
    
    console.log('[Webhook] Instâncias no banco:', allInstances?.map(i => i.unique_id))
    return
  }

  console.log('[Webhook] ✅ Instância encontrada:', instance.unique_id, 'Org:', instance.organization_id)

  const orgId = instance.organization_id
  const key = data?.key
  const message = data?.message

  // Ignorar mensagens próprias
  if (key?.fromMe) {
    console.log('[Webhook] Ignorando mensagem própria')
    return
  }

  const remoteJid = key?.remoteJid
  if (!remoteJid || remoteJid.includes('@g.us')) {
    console.log('[Webhook] Ignorando grupo ou jid inválido:', remoteJid)
    return
  }

  const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '')
  const pushName = data?.pushName || phoneNumber

  // Extrair conteúdo
  let content = message?.conversation || 
                message?.extendedTextMessage?.text || 
                message?.imageMessage?.caption ||
                message?.videoMessage?.caption ||
                data?.text ||
                '[Mídia]'

  let messageType = 'text'
  if (message?.imageMessage) messageType = 'image'
  if (message?.audioMessage) messageType = 'audio'
  if (message?.videoMessage) messageType = 'video'
  if (message?.documentMessage) messageType = 'document'
  if (message?.stickerMessage) messageType = 'sticker'
  if (message?.locationMessage) messageType = 'location'
  if (message?.contactMessage) messageType = 'contact'

  console.log('[Webhook] 📩 Mensagem de:', phoneNumber, '-', content?.substring(0, 50))

  // 2. Buscar contato EXISTENTE por phone_number
  const { data: existingContacts } = await supabase
    .from('whatsapp_contacts')
    .select('*')
    .eq('organization_id', orgId)
    .eq('phone_number', phoneNumber)
    .limit(1)

  let contact = existingContacts?.[0]

  if (!contact) {
    // Criar novo contato APENAS se não existe
    const { data: newContact } = await supabase
      .from('whatsapp_contacts')
      .insert({
        organization_id: orgId,
        phone_number: phoneNumber,
        name: pushName,
        profile_name: pushName,
      })
      .select()
      .single()
    contact = newContact
    console.log('[Webhook] Novo contato criado:', contact?.id)
  } else {
    console.log('[Webhook] Contato existente:', contact.id)
    // Atualizar nome se mudou
    if (pushName && pushName !== contact.name) {
      await supabase
        .from('whatsapp_contacts')
        .update({ name: pushName, profile_name: pushName })
        .eq('id', contact.id)
    }
  }

  if (!contact) return

  // 3. Buscar conversa EXISTENTE por phone_number (NÃO por contact_id)
  const { data: existingConversations } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('phone_number', phoneNumber)
    .order('created_at', { ascending: false })
    .limit(1)

  let conversation = existingConversations?.[0]

  if (!conversation) {
    // Criar nova conversa APENAS se não existe
    const { data: newConv } = await supabase
      .from('whatsapp_conversations')
      .insert({
        organization_id: orgId,
        contact_id: contact.id,
        phone_number: phoneNumber,
        status: 'open',
        is_bot_active: false,
        ai_enabled: true, // Habilitar IA por padrão
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
        unread_count: 1,
      })
      .select()
      .single()
    conversation = newConv
    console.log('[Webhook] Nova conversa criada:', conversation?.id)
  } else {
    console.log('[Webhook] Conversa existente:', conversation.id)
    // Atualizar conversa existente
    await supabase
      .from('whatsapp_conversations')
      .update({
        status: 'open',
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
        unread_count: (conversation.unread_count || 0) + 1,
        contact_id: contact.id,
      })
      .eq('id', conversation.id)
  }

  if (!conversation) return

  // 4. Verificar se mensagem já existe (evitar duplicação)
  const messageId = key?.id
  if (messageId) {
    const { data: existingMsg } = await supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('wamid', messageId)
      .limit(1)

    if (existingMsg && existingMsg.length > 0) {
      console.log('[Webhook] Mensagem já existe, ignorando:', messageId)
      return
    }
  }

  // 5. Salvar mensagem
  const { error: msgError } = await supabase
    .from('whatsapp_messages')
    .insert({
      organization_id: orgId,
      conversation_id: conversation.id,
      contact_id: contact.id,
      wamid: key?.id,
      wa_message_id: key?.id,
      direction: 'inbound',
      message_type: messageType,
      content: content,
      status: 'received',
      metadata: { pushName },
    })

  if (msgError) {
    console.error('[Webhook] Erro ao salvar mensagem:', msgError)
  } else {
    console.log('[Webhook] Mensagem salva com sucesso')
  }

  // =====================================================
  // 6. PROCESSAR COM AGENTE DE IA (VIA FILA OU SYNC)
  // =====================================================
  
  // Só processar mensagens de texto
  if (messageType !== 'text') {
    console.log('[Webhook] 📷 Mensagem não é texto, pulando IA')
    return
  }

  const aiParams = {
    organizationId: orgId,
    conversationId: conversation.id,
    contactId: contact.id,
    instanceId: instance.id,
    instanceName: instance.unique_id,
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
  contactId: string
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
    version: '2.1',
    features: ['message_processing', 'ai_agent_response', 'typing_indicator', 'durable_queue'],
    timestamp: new Date().toISOString(),
  })
}
