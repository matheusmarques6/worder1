import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// ✅ FASE 3: Force dynamic para evitar cache
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Headers padrão sem cache
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
}

// ✅ FASE 2: SEM FALLBACK HARDCODED
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY

// ✅ FASE 2: CONFIGURAÇÕES DE SEGURANÇA
const MAX_FILE_SIZE = 16 * 1024 * 1024 // 16MB
const SIGNED_URL_EXPIRY = 3600 // 1 hora

const ALLOWED_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  video: ['video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp'],
  audio: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4', 'audio/aac'],
  document: [
    'application/pdf', 'application/msword', 'text/plain', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
}

const DANGEROUS_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.jar', '.msi']

function getEvolutionConfig(instance?: any) {
  const apiUrl = instance?.api_url || instance?.server_url || EVOLUTION_API_URL
  const apiKey = instance?.api_key || EVOLUTION_API_KEY
  if (!apiUrl || !apiKey) return null
  return { apiUrl, apiKey }
}

// Validação de arquivo
function validateFile(file: File, mediaType: string): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `Arquivo muito grande. Máximo: ${MAX_FILE_SIZE / (1024 * 1024)}MB` }
  }

  if (DANGEROUS_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
    return { valid: false, error: 'Tipo de arquivo não permitido por segurança' }
  }

  const allowedList = ALLOWED_TYPES[mediaType as keyof typeof ALLOWED_TYPES]
  if (allowedList && mediaType !== 'document') {
    const baseType = file.type.split('/')[0]
    if (!allowedList.includes(file.type) && !allowedList.some(t => t.startsWith(baseType))) {
      return { valid: false, error: `Tipo de arquivo não permitido para ${mediaType}: ${file.type}` }
    }
  }

  return { valid: true }
}

// POST - Enviar mídia
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const conversationId = params.id
    const formData = await request.formData()
    const file = formData.get('file') as File
    const mediaType = formData.get('mediaType') as string || 'document'
    const caption = formData.get('caption') as string || ''

    console.log('[Media POST] Starting upload:', {
      mediaType,
      fileName: file?.name,
      fileSize: file?.size,
      conversation_id: conversationId
    })

    // Validações
    if (!file) {
      return NextResponse.json(
        { error: 'File required', success: false },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    const validation = validateFile(file, mediaType)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error, success: false },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Buscar conversa COM instance_id e store_id
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('*, instance_id, store_id, contact_phone, phone_number, organization_id')
      .eq('id', conversationId)
      .single()

    if (convError || !conversation) {
      console.error('[Media POST] Conversation not found:', conversationId)
      return NextResponse.json(
        { error: 'Conversation not found', success: false },
        { status: 404, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Verificar se conversa tem instance_id
    if (!conversation.instance_id) {
      console.error('[Media POST] Conversa sem instance_id:', {
        conversation_id: conversationId,
        store_id: conversation.store_id
      })
      return NextResponse.json(
        { error: 'Conversa não tem instância associada. Reabra a conversa.', success: false },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Buscar instância ESPECÍFICA da conversa
    const { data: instance, error: instError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', conversation.instance_id)
      .single()

    if (instError || !instance) {
      console.error('[Media POST] Instância não encontrada:', {
        instance_id: conversation.instance_id,
        conversation_id: conversationId
      })
      return NextResponse.json(
        { error: 'Instância WhatsApp não encontrada', success: false },
        { status: 404, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Validar que store_id bate
    if (conversation.store_id && instance.store_id && conversation.store_id !== instance.store_id) {
      console.error('[Media POST] Store mismatch:', {
        conversation_store: conversation.store_id,
        instance_store: instance.store_id
      })
      return NextResponse.json(
        { error: 'Instância não pertence à mesma loja da conversa', success: false },
        { status: 403, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Validar que instância está conectada
    const connectedStatuses = ['connected', 'ACTIVE', 'open']
    if (!connectedStatuses.includes(instance.status?.toLowerCase())) {
      console.error('[Media POST] Instância desconectada:', {
        instance_id: instance.id,
        status: instance.status
      })
      return NextResponse.json(
        { error: `Instância WhatsApp não está conectada (status: ${instance.status})`, success: false },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Verificar config sem fallback
    const config = getEvolutionConfig(instance)
    if (!config) {
      return NextResponse.json({ 
        error: 'Evolution API not configured. Set EVOLUTION_API_URL and EVOLUTION_API_KEY.',
        success: false 
      }, { status: 503, headers: NO_CACHE_HEADERS })
    }

    const instanceName = instance.unique_id || instance.instance_name || instance.instance_id
    const phoneNumber = conversation.contact_phone || conversation.phone_number

    // ✅ FASE 3: Log detalhado
    console.log('[Media POST] Enviando mídia:', {
      conversation_id: conversationId,
      store_id: conversation.store_id,
      instance_id: instance.id,
      instance_name: instanceName,
      instance_status: instance.status,
      to: phoneNumber,
      media_type: mediaType,
      file_name: file.name,
      file_size: file.size
    })

    // Converter arquivo
    const fileBytes = await file.arrayBuffer()
    const buffer = Buffer.from(fileBytes)
    const base64 = buffer.toString('base64')

    // Upload para Storage
    let mediaUrl = null
    let storagePath = null

    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const ext = sanitizedName.split('.').pop() || file.type.split('/')[1] || 'bin'
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      
      storagePath = `${conversation.organization_id}/${conversationId}/${uniqueId}.${ext}`
      
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(storagePath, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
          cacheControl: '3600',
        })

      if (!uploadError) {
        // ✅ Usar Signed URL (mais seguro)
        const { data: signedData, error: signedError } = await supabase.storage
          .from('whatsapp-media')
          .createSignedUrl(storagePath, SIGNED_URL_EXPIRY)

        if (!signedError && signedData?.signedUrl) {
          mediaUrl = signedData.signedUrl
        } else {
          // Fallback para URL pública
          const { data: publicData } = supabase.storage
            .from('whatsapp-media')
            .getPublicUrl(storagePath)
          mediaUrl = publicData?.publicUrl
        }
        
        console.log('[Media POST] ✅ Uploaded to storage:', storagePath)
      }
    } catch (storageError) {
      console.error('[Media POST] Storage error:', storageError)
    }

    // ✅ META_CLOUD: upload na Meta + envio via message-service (NUNCA Evolution)
    if (instance.api_type === 'META_CLOUD') {
      const { uploadMedia, sendMessage: sendViaMeta } = await import('@/lib/services/whatsapp/message-service')

      const upload = await uploadMedia(
        instance.id,
        conversation.organization_id,
        fileBytes,
        file.type || 'application/octet-stream',
        file.name
      )

      if (upload.error || !upload.data?.mediaId) {
        return NextResponse.json(
          { error: upload.error || 'Falha no upload da mídia para a Meta', success: false },
          { status: 502, headers: NO_CACHE_HEADERS }
        )
      }

      const result = await sendViaMeta({
        conversationId,
        organizationId: conversation.organization_id,
        instanceId: instance.id,
        to: phoneNumber,
        messageType: mediaType as any,
        content: caption || undefined,
        mediaId: upload.data.mediaId,
        mediaUrl: mediaUrl || undefined,
        mediaMimeType: file.type,
        mediaFilename: file.name,
        senderType: 'agent',
      })

      if (result.error && !result.data) {
        const status = result.code === 131047 ? 400 : 500
        return NextResponse.json(
          { error: result.error, success: false },
          { status, headers: NO_CACHE_HEADERS }
        )
      }

      const savedMeta: any = result.data

      // Guardar o caminho do storage para refresh de signed URL (GET desta rota)
      if (savedMeta?.id && storagePath) {
        await supabase
          .from('whatsapp_messages')
          .update({ media_storage_path: storagePath })
          .eq('id', savedMeta.id)
      }

      return NextResponse.json({
        message: savedMeta ? {
          id: savedMeta.id,
          conversation_id: savedMeta.conversation_id || conversationId,
          direction: 'outbound',
          message_type: savedMeta.message_type || mediaType,
          content: typeof savedMeta.content === 'string' ? savedMeta.content : (caption || ''),
          media_url: savedMeta.media_url || mediaUrl,
          media_filename: savedMeta.media_filename || file.name,
          media_mime_type: savedMeta.media_mime_type || file.type,
          status: savedMeta.status || (result.error ? 'failed' : 'sent'),
          sent_by_bot: false,
          created_at: savedMeta.created_at,
        } : null,
        success: !result.error,
        ...(result.error ? { error: result.error } : {}),
      }, { headers: NO_CACHE_HEADERS })
    }

    // ✅ EVOLUTION: fluxo original inalterado
    // Enviar via Evolution API
    let endpoint = ''
    let payload: any = { number: phoneNumber }

    if (mediaType === 'image' || mediaType === 'video') {
      endpoint = `/message/sendMedia/${instanceName}`
      payload.mediatype = mediaType
      payload.media = `data:${file.type};base64,${base64}`
      payload.fileName = file.name
      if (caption) payload.caption = caption
    } else if (mediaType === 'audio') {
      endpoint = `/message/sendWhatsAppAudio/${instanceName}`
      // Usar o tipo real do arquivo (pode ser webm, ogg, mp3, etc)
      payload.audio = `data:${file.type || 'audio/ogg'};base64,${base64}`
    } else {
      endpoint = `/message/sendMedia/${instanceName}`
      payload.mediatype = 'document'
      payload.media = `data:${file.type};base64,${base64}`
      payload.fileName = file.name
      if (caption) payload.caption = caption
    }

    console.log('[Media POST] Sending to Evolution:', endpoint)

    const sendResponse = await fetch(`${config.apiUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': config.apiKey },
      body: JSON.stringify(payload),
    })

    const sendData = await sendResponse.json()
    
    // ✅ FASE 3: Log detalhado da resposta
    if (!sendResponse.ok) {
      console.error('[Media POST] Evolution API error:', {
        status: sendResponse.status,
        response: sendData,
        instance: instanceName,
        endpoint
      })
    } else {
      console.log('[Media POST] ✅ Enviado com sucesso:', sendData?.key?.id)
    }

    // Salvar no banco
    const { data: saved, error: saveError } = await supabase
      .from('whatsapp_messages')
      .insert({
        organization_id: conversation.organization_id,
        store_id: conversation.store_id,
        instance_id: instance.id,
        conversation_id: conversationId,
        message_id: sendData?.key?.id || `media-${Date.now()}`,
        direction: 'outbound',
        message_type: mediaType,
        content: caption || '',
        text_body: '',
        to_number: phoneNumber,
        status: sendResponse.ok ? 'sent' : 'failed',
        media_url: mediaUrl,
        media_filename: file.name,
        media_mime_type: file.type,
        media_storage_path: storagePath,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single()

    if (saveError) {
      console.error('[Media POST] Save error:', saveError)
    }

    // Atualizar conversa
    const preview = caption?.substring(0, 50) || 
      (mediaType === 'image' ? '📷 Imagem' : 
       mediaType === 'video' ? '🎬 Vídeo' : 
       mediaType === 'audio' ? '🎵 Áudio' : `📎 ${file.name}`)

    await supabase.from('whatsapp_conversations').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview,
      last_message_direction: 'outbound',
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId)

    // Resposta
    const responseMessage = saved ? {
      id: saved.id,
      conversation_id: saved.conversation_id,
      direction: saved.direction,
      message_type: saved.message_type,
      content: saved.content || caption,
      media_url: saved.media_url,
      media_filename: saved.media_filename,
      media_mime_type: saved.media_mime_type,
      status: saved.status,
      sent_by_bot: false,
      created_at: saved.created_at,
    } : null

    return NextResponse.json({ 
      message: responseMessage,
      success: sendResponse.ok,
      ...(sendResponse.ok ? {} : { error: 'Failed to send via Evolution API', evolution_error: sendData })
    }, { headers: NO_CACHE_HEADERS })

  } catch (error: any) {
    console.error('[Media POST] Error:', error)
    return NextResponse.json(
      { error: error.message, success: false },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}

// GET - Refresh de Signed URL
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(request.url)
    const messageId = searchParams.get('messageId')
    
    if (!messageId) {
      return NextResponse.json(
        { error: 'messageId required' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    const { data: message, error } = await supabase
      .from('whatsapp_messages')
      .select('media_storage_path, media_url')
      .eq('id', messageId)
      .eq('conversation_id', params.id)
      .single()

    if (error || !message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404, headers: NO_CACHE_HEADERS }
      )
    }

    if (!message.media_storage_path) {
      return NextResponse.json(
        { url: message.media_url },
        { headers: NO_CACHE_HEADERS }
      )
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from('whatsapp-media')
      .createSignedUrl(message.media_storage_path, SIGNED_URL_EXPIRY)

    if (signedError) {
      console.error('[Media GET] Refresh URL error:', signedError)
      return NextResponse.json(
        { url: message.media_url },
        { headers: NO_CACHE_HEADERS }
      )
    }

    return NextResponse.json({ 
      url: signedData?.signedUrl,
      expiresIn: SIGNED_URL_EXPIRY,
    }, { headers: NO_CACHE_HEADERS })
  } catch (error: any) {
    console.error('[Media GET] Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}
