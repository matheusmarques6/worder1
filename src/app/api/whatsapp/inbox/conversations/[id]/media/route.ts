import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// ✅ CORREÇÃO: Sem fallback hardcoded
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY

const MAX_FILE_SIZE = 16 * 1024 * 1024 // 16MB
const ALLOWED_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4'],
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // ✅ CORREÇÃO: Verificar config antes de processar
    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      console.error('[Send Media] Missing EVOLUTION_API_URL or EVOLUTION_API_KEY')
      return NextResponse.json({ 
        error: 'WhatsApp API not configured. Set EVOLUTION_API_URL and EVOLUTION_API_KEY.',
        success: false,
      }, { status: 503 })
    }

    const conversationId = params.id
    const formData = await request.formData()
    const file = formData.get('file') as File
    const mediaType = formData.get('mediaType') as string || 'document'
    const caption = formData.get('caption') as string || ''

    console.log('[Send Media] Type:', mediaType, '| File:', file?.name, '| Size:', file?.size)

    // Validações
    if (!file) {
      return NextResponse.json({ error: 'File required', success: false }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File too large. Max: ${MAX_FILE_SIZE / (1024 * 1024)}MB`, success: false }, { status: 400 })
    }

    // Validar tipo
    const allowedList = ALLOWED_TYPES[mediaType as keyof typeof ALLOWED_TYPES]
    if (allowedList && !allowedList.includes(file.type)) {
      console.warn('[Send Media] Type not in allowed list:', file.type)
    }

    // Buscar conversa
    const { data: conversation } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', conversationId)
      .single()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found', success: false }, { status: 404 })
    }

    // Buscar instância
    const { data: instances } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', conversation.organization_id)
      .in('status', ['connected', 'ACTIVE'])
      .limit(1)

    const instance = instances?.[0]
    if (!instance) {
      return NextResponse.json({ error: 'No connected WhatsApp instance', success: false }, { status: 400 })
    }

    const apiUrl = instance.api_url || EVOLUTION_API_URL
    const apiKey = instance.api_key || EVOLUTION_API_KEY
    const instanceName = instance.unique_id || instance.instance_name || instance.instance_id
    const phoneNumber = conversation.contact_phone || conversation.phone_number

    // Converter para base64
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64 = buffer.toString('base64')

    // Upload para Storage
    let permanentMediaUrl = null
    try {
      const ext = file.name.split('.').pop() || 'bin'
      const fileName = `${conversation.organization_id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
      
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(fileName, buffer, { contentType: file.type })

      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage
          .from('whatsapp-media')
          .getPublicUrl(fileName)
        permanentMediaUrl = publicUrlData?.publicUrl
        console.log('[Send Media] ✅ Uploaded:', permanentMediaUrl?.substring(0, 60))
      }
    } catch (storageError) {
      console.error('[Send Media] Storage error:', storageError)
    }

    // Enviar via Evolution API
    let endpoint = '', payload: any = { number: phoneNumber }

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

    const sendResponse = await fetch(`${apiUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      body: JSON.stringify(payload),
    })
    const sendData = await sendResponse.json()

    console.log('[Send Media] Evolution response:', sendResponse.status, sendResponse.ok)

    // Salvar no banco
    const { data: savedMessage, error: saveError } = await supabase
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
        media_url: permanentMediaUrl,
        media_filename: file.name,
        media_mime_type: file.type,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single()

    if (saveError) console.error('[Send Media] Save error:', saveError)
    else console.log('[Send Media] ✅ Saved:', savedMessage.id)

    // Atualizar conversa
    let preview = caption?.substring(0, 50) || 
      (mediaType === 'image' ? '📷 Imagem' : mediaType === 'video' ? '🎬 Vídeo' : `📎 ${file.name}`)

    await supabase.from('whatsapp_conversations').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview,
      last_message_direction: 'outbound',
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId)

    return NextResponse.json({
      message: savedMessage ? {
        id: savedMessage.id,
        conversation_id: savedMessage.conversation_id,
        direction: savedMessage.direction,
        message_type: savedMessage.message_type,
        content: savedMessage.content || caption,
        media_url: savedMessage.media_url,
        media_filename: savedMessage.media_filename,
        media_mime_type: savedMessage.media_mime_type,
        status: savedMessage.status,
        sent_by_bot: false,
        created_at: savedMessage.created_at,
      } : null,
      success: sendResponse.ok,
    })

  } catch (error: any) {
    console.error('[Send Media] Error:', error)
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
}
