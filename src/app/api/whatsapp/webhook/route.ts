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
  // NÃO usar phoneNumber como fallback - deixar null se não tiver nome
  const pushName = messageData?.pushName || data?.pushName || body?.pushName || null

  // Extrair conteúdo da mensagem
  let content = message?.conversation || 
                message?.extendedTextMessage?.text || 
                message?.imageMessage?.caption ||
                message?.videoMessage?.caption ||
                messageData?.body ||
                ''

  // ✅ CORREÇÃO: Variáveis para mídia
  let messageType = 'text'
  let mediaUrl = null
  let mediaMimeType = null

  // ✅ CORREÇÃO: Extrair URL e tipo de cada tipo de mídia
  if (message?.imageMessage) {
    messageType = 'image'
    content = content || '[Imagem]'
    mediaUrl = message.imageMessage.url
    mediaMimeType = message.imageMessage.mimetype
  }
  else if (message?.audioMessage) {
    messageType = 'audio'
    content = '[Áudio]'
    mediaUrl = message.audioMessage.url
    mediaMimeType = message.audioMessage.mimetype
  }
  else if (message?.videoMessage) {
    messageType = 'video'
    content = content || '[Vídeo]'
    mediaUrl = message.videoMessage.url
    mediaMimeType = message.videoMessage.mimetype
  }
  else if (message?.documentMessage) {
    messageType = 'document'
    content = message.documentMessage.fileName || '[Documento]'
    mediaUrl = message.documentMessage.url
    mediaMimeType = message.documentMessage.mimetype
  }
  else if (message?.stickerMessage) {
    messageType = 'sticker'
    content = '[Sticker]'
    mediaUrl = message.stickerMessage.url
  }
  else if (message?.locationMessage) {
    messageType = 'location'
    content = `[Localização: ${message.locationMessage.degreesLatitude}, ${message.locationMessage.degreesLongitude}]`
  }
  else if (message?.contactMessage) {
    messageType = 'contact'
    content = '[Contato]'
  }
  else if (!content) {
    content = '[Mídia]'
  }
  
  console.log('[Webhook] 📩 Mensagem de:', phoneNumber, '| Nome:', pushName, '| Conteúdo:', content?.substring(0, 50))
  console.log('[Webhook] 📩 Tipo:', messageType, '| Media URL inicial:', mediaUrl ? 'SIM' : 'NÃO')

  // =====================================================
  // DOWNLOAD DE MÍDIA E UPLOAD PARA SUPABASE STORAGE
  // =====================================================
  if (!mediaUrl && messageType !== 'text' && messageType !== 'location' && messageType !== 'contact' && key?.id) {
    console.log('[Webhook] 📥 Tentando baixar mídia via Evolution API...')
    
    try {
      const EVOLUTION_API_URL = instance.api_url || process.env.EVOLUTION_API_URL || 'https://n8n-evolution-api.1fpac5.easypanel.host'
      const EVOLUTION_API_KEY = instance.api_key || process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11'
      
      // 1. Baixar mídia da Evolution API
      const downloadResponse = await fetch(
        `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${instance.unique_id}`,
        {
          method: 'POST',
          headers: {
            'apikey': EVOLUTION_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: { key },
            convertToMp4: false
          })
        }
      )
      
      if (downloadResponse.ok) {
        const mediaData = await downloadResponse.json()
        
        if (mediaData.base64) {
          // Determinar tipo MIME e extensão
          const mimeType = mediaMimeType || mediaData.mimetype ||
            (messageType === 'image' ? 'image/jpeg' : 
             messageType === 'audio' ? 'audio/ogg' : 
             messageType === 'video' ? 'video/mp4' : 
             messageType === 'document' ? 'application/pdf' :
             'application/octet-stream')
          
          // Determinar extensão do arquivo
          const extensionMap: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'audio/ogg': 'ogg',
            'audio/mpeg': 'mp3',
            'audio/mp4': 'm4a',
            'audio/opus': 'opus',
            'video/mp4': 'mp4',
            'video/3gpp': '3gp',
            'application/pdf': 'pdf',
          }
          const extension = extensionMap[mimeType] || 'bin'
          
          // 2. Converter base64 para Buffer
          const buffer = Buffer.from(mediaData.base64, 'base64')
          
          // 3. Gerar nome único para o arquivo
          const timestamp = Date.now()
          const messageId = key?.id || `${timestamp}`
          const fileName = `${orgId}/${phoneNumber}/${timestamp}-${messageId.substring(0, 8)}.${extension}`
          
          console.log('[Webhook] 📤 Fazendo upload para Storage:', fileName, '| Tamanho:', buffer.length, 'bytes')
          
          // 4. Upload para Supabase Storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('whatsapp-media')
            .upload(fileName, buffer, {
              contentType: mimeType,
              cacheControl: '31536000', // 1 ano de cache
              upsert: false
            })
          
          if (uploadError) {
            console.error('[Webhook] ❌ Erro no upload:', uploadError)
            // Fallback para data URL se o upload falhar
            mediaUrl = `data:${mimeType};base64,${mediaData.base64}`
            console.log('[Webhook] ⚠️ Usando fallback base64')
          } else {
            // 5. Obter URL pública
            const { data: { publicUrl } } = supabase.storage
              .from('whatsapp-media')
              .getPublicUrl(fileName)
            
            mediaUrl = publicUrl
            console.log('[Webhook] ✅ Upload concluído! URL:', mediaUrl)
          }
        } else {
          console.log('[Webhook] ⚠️ Resposta sem base64:', JSON.stringify(mediaData).substring(0, 200))
        }
      } else {
        console.log('[Webhook] ⚠️ Erro ao baixar mídia:', downloadResponse.status, downloadResponse.statusText)
      }
    } catch (downloadError) {
      console.error('[Webhook] ❌ Erro no download/upload de mídia:', downloadError)
    }
  }

  console.log('[Webhook] 📩 Media URL final:', mediaUrl ? `SIM (${mediaUrl.substring(0, 80)}...)` : 'NÃO')

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
      content: { text: content }, // JSONB - deve ser objeto
      text_body: content, // Campo para texto simples
      from_number: phoneNumber,
      status: 'received',
      timestamp: new Date().toISOString(), // Obrigatório
      // ✅ CORREÇÃO: Adicionar mídia
      media_url: mediaUrl,
      media_mime_type: mediaMimeType,
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
    contactId: '', // Não temos contato separado, usar string vazia
    instanceId: instance.id,
    instanceName: instance.unique_id || instance.instance_name || '',
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
    version: '2.6-schema-fix',
    features: ['message_processing', 'ai_agent_response', 'typing_indicator', 'durable_queue'],
    timestamp: new Date().toISOString(),
  })
}
