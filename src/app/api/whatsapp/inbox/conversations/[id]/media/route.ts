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
    const instanceName = instance.instance_name || instance.instance_id || instance.unique_id
    const phoneNumber = conversation.contact_phone || conversation.phone_number

    // Converter arquivo para base64
    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Determinar endpoint e payload baseado no tipo de mídia
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
      // Documento
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

    console.log('[Send Media] Response:', sendResponse.status, sendResponse.ok)
    console.log('[Send Media] Data:', JSON.stringify(sendData).substring(0, 300))

    // Salvar mensagem no banco
    const { data: savedMessage, error: saveError } = await supabase
      .from('whatsapp_messages')
      .insert({
        organization_id: conversation.organization_id,
        instance_id: instance.id,
        conversation_id: conversationId,
        message_id: sendData?.key?.id || `media-${Date.now()}`,
        direction: 'outbound',
        message_type: mediaType,
        content: file.name || `[${mediaType}]`,
        text_body: '',
        to_number: phoneNumber,
        status: sendResponse.ok ? 'sent' : 'failed',
        media_filename: file.name,
        media_mime_type: file.type,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single()

    if (saveError) {
      console.error('[Send Media] Error saving:', saveError)
    } else {
      console.log('[Send Media] Message saved:', savedMessage.id)
    }

    // Atualizar conversa
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: `📎 ${file.name || mediaType}`,
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
