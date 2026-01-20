import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// ✅ SPRINT 2: SEM FALLBACK HARDCODED
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY

// ✅ SPRINT 2: CONFIGURAÇÕES DE SEGURANÇA
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

// ✅ SPRINT 2: Validação de arquivo
function validateFile(file: File, mediaType: string): { valid: boolean; error?: string } {
  // Validar tamanho
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `Arquivo muito grande. Máximo: ${MAX_FILE_SIZE / (1024 * 1024)}MB` }
  }

  // Validar extensões perigosas
  if (DANGEROUS_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
    return { valid: false, error: 'Tipo de arquivo não permitido por segurança' }
  }

  // Validar tipo MIME (menos restritivo para documentos)
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

    console.log('[Send Media] Type:', mediaType, '| File:', file?.name, '| Size:', file?.size)

    // ✅ SPRINT 2: Validações
    if (!file) {
      return NextResponse.json({ error: 'File required', success: false }, { status: 400 })
    }

    const validation = validateFile(file, mediaType)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error, success: false }, { status: 400 })
    }

    // Buscar conversa
    const { data: conversation } = await supabase
      .from('whatsapp_conversations').select('*').eq('id', conversationId).single()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found', success: false }, { status: 404 })
    }

    // Buscar instância
    const { data: instances } = await supabase.from('whatsapp_instances').select('*')
      .eq('organization_id', conversation.organization_id).in('status', ['connected', 'ACTIVE']).limit(1)

    const instance = instances?.[0]
    if (!instance) {
      return NextResponse.json({ error: 'No connected WhatsApp instance', success: false }, { status: 400 })
    }

    // ✅ SPRINT 2: Verificar config sem fallback
    const config = getEvolutionConfig(instance)
    if (!config) {
      return NextResponse.json({ 
        error: 'Evolution API not configured. Set EVOLUTION_API_URL and EVOLUTION_API_KEY.',
        success: false 
      }, { status: 503 })
    }

    const instanceName = instance.unique_id || instance.instance_name || instance.instance_id
    const phoneNumber = conversation.contact_phone || conversation.phone_number

    // Converter arquivo
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')

    // ✅ SPRINT 2: Upload com Signed URL
    let mediaUrl = null
    let storagePath = null

    try {
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const ext = sanitizedName.split('.').pop() || file.type.split('/')[1] || 'bin'
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      
      // Path: org_id/conversation_id/timestamp-random.ext
      storagePath = `${conversation.organization_id}/${conversationId}/${uniqueId}.${ext}`
      
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(storagePath, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
          cacheControl: '3600',
        })

      if (!uploadError) {
        // ✅ SPRINT 2: Signed URL em vez de pública
        const { data: signedData, error: signedError } = await supabase.storage
          .from('whatsapp-media')
          .createSignedUrl(storagePath, SIGNED_URL_EXPIRY)

        if (!signedError && signedData?.signedUrl) {
          mediaUrl = signedData.signedUrl
        } else {
          // Fallback para URL pública se signed falhar
          const { data: publicData } = supabase.storage
            .from('whatsapp-media')
            .getPublicUrl(storagePath)
          mediaUrl = publicData?.publicUrl
        }
        
        console.log('[Send Media] ✅ Uploaded:', mediaUrl?.substring(0, 60))
      }
    } catch (storageError) {
      console.error('[Send Media] Storage error:', storageError)
    }

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
      payload.audio = `data:audio/ogg;base64,${base64}`
    } else {
      endpoint = `/message/sendMedia/${instanceName}`
      payload.mediatype = 'document'
      payload.media = `data:${file.type};base64,${base64}`
      payload.fileName = file.name
      if (caption) payload.caption = caption
    }

    console.log('[Send Media] Sending to Evolution:', endpoint)

    const sendResponse = await fetch(`${config.apiUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': config.apiKey },
      body: JSON.stringify(payload),
    })

    const sendData = await sendResponse.json()
    console.log('[Send Media] Evolution response:', sendResponse.status, sendResponse.ok)

    // Salvar no banco
    const { data: saved, error: saveError } = await supabase
      .from('whatsapp_messages')
      .insert({
        organization_id: conversation.organization_id,
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
        media_storage_path: storagePath, // Para refresh de signed URL
        timestamp: new Date().toISOString(),
      })
      .select()
      .single()

    if (saveError) {
      console.error('[Send Media] Save error:', saveError)
    } else {
      console.log('[Send Media] ✅ Saved:', saved.id)
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
    })

  } catch (error: any) {
    console.error('[Send Media] Error:', error)
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}

// ✅ SPRINT 2: GET para refresh de Signed URL
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(request.url)
    const messageId = searchParams.get('messageId')
    
    if (!messageId) {
      return NextResponse.json({ error: 'messageId required' }, { status: 400 })
    }

    const { data: message, error } = await supabase
      .from('whatsapp_messages')
      .select('media_storage_path, media_url')
      .eq('id', messageId)
      .eq('conversation_id', params.id)
      .single()

    if (error || !message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    // Se não tem storage path, retornar URL existente
    if (!message.media_storage_path) {
      return NextResponse.json({ url: message.media_url })
    }

    // Gerar nova Signed URL
    const { data: signedData, error: signedError } = await supabase.storage
      .from('whatsapp-media')
      .createSignedUrl(message.media_storage_path, SIGNED_URL_EXPIRY)

    if (signedError) {
      console.error('[Refresh URL] Error:', signedError)
      return NextResponse.json({ url: message.media_url }) // Fallback
    }

    return NextResponse.json({ 
      url: signedData?.signedUrl,
      expiresIn: SIGNED_URL_EXPIRY,
    })
  } catch (error: any) {
    console.error('[Refresh URL] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
