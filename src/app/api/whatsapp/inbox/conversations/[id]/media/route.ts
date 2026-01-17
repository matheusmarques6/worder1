import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://n8n-evolution-api.1fpac5.easypanel.host'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11'

// POST - Enviar mídia
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id
    const formData = await request.formData()
    const file = formData.get('file') as File
    const mediaType = formData.get('mediaType') as string || 'document'

    console.log('[Send Media] ============================')
    console.log('[Send Media] Conversation:', conversationId)
    console.log('[Send Media] Type:', mediaType, '| File:', file?.name, '| Size:', file?.size)

    if (!file) {
      return NextResponse.json({ error: 'file required' }, { status: 400 })
    }

    // Buscar conversa
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', conversationId)
      .single()

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Buscar instância conectada
    const { data: instances } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', conversation.organization_id)
      .in('status', ['connected', 'ACTIVE'])
      .limit(1)

    const instance = instances?.[0]

    if (!instance) {
      return NextResponse.json({ error: 'No connected WhatsApp instance' }, { status: 400 })
    }

    const apiUrl = instance.api_url || EVOLUTION_API_URL
    const apiKey = instance.api_key || EVOLUTION_API_KEY
    const instanceName = instance.unique_id || instance.instance_name || instance.instance_id
    const phoneNumber = conversation.contact_phone || conversation.phone_number

    // Converter arquivo para buffer e base64
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64 = buffer.toString('base64')

    // 1. Upload para Supabase Storage primeiro
    let permanentMediaUrl = null
    try {
      const ext = file.name.split('.').pop() || file.type.split('/')[1] || 'bin'
      const fileName = `${conversation.organization_id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(fileName, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })

      if (uploadError) {
        console.error('[Send Media] Storage upload error:', uploadError)
      } else {
        const { data: publicUrlData } = supabase.storage
          .from('whatsapp-media')
          .getPublicUrl(fileName)
        
        permanentMediaUrl = publicUrlData?.publicUrl
        console.log('[Send Media] ✅ Uploaded to storage:', permanentMediaUrl?.substring(0, 60))
      }
    } catch (storageError) {
      console.error('[Send Media] Storage error:', storageError)
    }

    // 2. Enviar via Evolution API
    let endpoint = ''
    let payload: any = {
      number: phoneNumber,
    }

    if (mediaType === 'image') {
      endpoint = `/message/sendMedia/${instanceName}`
      payload.mediatype = 'image'
      payload.media = `data:${file.type};base64,${base64}`
      payload.fileName = file.name
    } else if (mediaType === 'video') {
      endpoint = `/message/sendMedia/${instanceName}`
      payload.mediatype = 'video'
      payload.media = `data:${file.type};base64,${base64}`
      payload.fileName = file.name
    } else if (mediaType === 'audio') {
      endpoint = `/message/sendWhatsAppAudio/${instanceName}`
      payload.audio = `data:audio/ogg;base64,${base64}`
    } else {
      endpoint = `/message/sendMedia/${instanceName}`
      payload.mediatype = 'document'
      payload.media = `data:${file.type};base64,${base64}`
      payload.fileName = file.name
    }

    console.log('[Send Media] Sending to Evolution API:', endpoint)

    const sendResponse = await fetch(`${apiUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify(payload),
    })

    const sendData = await sendResponse.json()

    console.log('[Send Media] Evolution response:', sendResponse.status, sendResponse.ok)

    // 3. Salvar mensagem no banco com URL permanente
    const { data: savedMessage, error: saveError } = await supabase
      .from('whatsapp_messages')
      .insert({
        organization_id: conversation.organization_id,
        instance_id: instance.id,
        conversation_id: conversationId,
        message_id: sendData?.key?.id || `media-${Date.now()}`,
        direction: 'outbound',
        message_type: mediaType,
        content: '',
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

    if (saveError) {
      console.error('[Send Media] Error saving:', saveError)
    } else {
      console.log('[Send Media] ✅ Message saved:', savedMessage.id)
    }

    // 4. Atualizar conversa
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: mediaType === 'image' ? '📷 Imagem' : 
                             mediaType === 'video' ? '🎬 Vídeo' :
                             mediaType === 'audio' ? '🎵 Áudio' : 
                             `📎 ${file.name}`,
        last_message_direction: 'outbound',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    if (!sendResponse.ok) {
      return NextResponse.json({ 
        message: savedMessage,
        success: false,
        error: 'Failed to send via Evolution API',
        evolution_error: sendData,
      })
    }

    return NextResponse.json({ 
      message: savedMessage,
      success: true,
    })

  } catch (error: any) {
    console.error('[Send Media] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
