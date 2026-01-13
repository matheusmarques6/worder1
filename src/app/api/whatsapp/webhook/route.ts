import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('[Webhook] Received:', body.event)

    if (body.event === 'messages.upsert') {
      await processMessage(body)
    }

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('[Webhook] Error:', error)
    return NextResponse.json({ status: 'error' }, { status: 200 })
  }
}

async function processMessage(body: any) {
  const instanceName = body.instance
  const data = body.data

  // 1. Buscar instância
  const { data: instances } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('unique_id', instanceName)
    .limit(1)

  const instance = instances?.[0]
  if (!instance) {
    console.log('[Webhook] Instância não encontrada:', instanceName)
    return
  }

  const orgId = instance.organization_id
  const key = data.key
  const message = data.message

  // Ignorar mensagens próprias
  if (key?.fromMe) return

  const remoteJid = key?.remoteJid
  if (!remoteJid || remoteJid.includes('@g.us')) return

  const phoneNumber = remoteJid.replace('@s.whatsapp.net', '')
  const pushName = data.pushName || phoneNumber

  // Extrair conteúdo
  let content = message?.conversation || 
                message?.extendedTextMessage?.text || 
                message?.imageMessage?.caption ||
                '[Mídia]'

  let messageType = 'text'
  if (message?.imageMessage) messageType = 'image'
  if (message?.audioMessage) messageType = 'audio'
  if (message?.videoMessage) messageType = 'video'
  if (message?.documentMessage) messageType = 'document'

  console.log('[Webhook] Mensagem de:', phoneNumber, '-', content)

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
