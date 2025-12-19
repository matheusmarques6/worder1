import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://n8n-evolution-api.1fpac5.easypanel.host'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (!mode && !token && !challenge) {
    return NextResponse.json({ 
      status: 'ok', 
      message: 'WhatsApp Webhook Endpoint Active',
      timestamp: new Date().toISOString()
    })
  }

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'worder-whatsapp-verify'

  if (mode === 'subscribe' && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // LOGAR TUDO QUE CHEGA
    await supabase.from('webhook_logs').insert({
      event_type: body.event || 'unknown',
      instance_name: body.instance || 'unknown',
      raw_data: body,
    })

    // Evolution API
    if (body.event || body.instance) {
      return handleEvolutionWebhook(body)
    }

    // Meta API
    if (body.entry || body.object === 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ok' })
    }

    return NextResponse.json({ status: 'ok' })
  } catch (error: any) {
    await supabase.from('webhook_logs').insert({
      event_type: 'ERROR',
      instance_name: 'error',
      raw_data: { error: error.message },
    })
    return NextResponse.json({ status: 'error' }, { status: 200 })
  }
}

async function handleEvolutionWebhook(body: any) {
  const event = body.event
  const instanceName = body.instance
  const data = body.data

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('unique_id', instanceName)
    .single()

  if (!instance) {
    await supabase.from('webhook_logs').insert({
      event_type: 'INSTANCE_NOT_FOUND',
      instance_name: instanceName,
      raw_data: body,
    })
    return NextResponse.json({ status: 'ok' })
  }

  const orgId = instance.organization_id

  if (event === 'messages.upsert' || event === 'MESSAGES_UPSERT') {
    await handleMessage(orgId, instance, data)
  }

  if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
    const state = data?.state || data?.connection
    await supabase
      .from('whatsapp_instances')
      .update({
        status: state === 'open' ? 'connected' : 'disconnected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', instance.id)
  }

  return NextResponse.json({ status: 'ok' })
}

async function handleMessage(orgId: string, instance: any, data: any) {
  const message = data.message || data
  const key = data.key || message.key

  if (key?.fromMe) return

  const remoteJid = key?.remoteJid
  if (!remoteJid || remoteJid.includes('@g.us')) return

  const phoneNumber = remoteJid.replace('@s.whatsapp.net', '')
  
  let content = ''
  let messageType = 'text'

  if (message.conversation) {
    content = message.conversation
  } else if (message.extendedTextMessage?.text) {
    content = message.extendedTextMessage.text
  } else if (message.imageMessage) {
    messageType = 'image'
    content = message.imageMessage.caption || '[Imagem]'
  } else if (message.audioMessage) {
    messageType = 'audio'
    content = '[Áudio]'
  } else if (message.videoMessage) {
    messageType = 'video'
    content = message.videoMessage.caption || '[Vídeo]'
  } else if (message.documentMessage) {
    messageType = 'document'
    content = message.documentMessage.fileName || '[Documento]'
  }

  const pushName = data.pushName || phoneNumber

  let { data: contact } = await supabase
    .from('whatsapp_contacts')
    .select('*')
    .eq('organization_id', orgId)
    .eq('phone_number', phoneNumber)
    .single()

  if (!contact) {
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
  }

  if (!contact) return

  let { data: conversation } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('contact_id', contact.id)
    .eq('status', 'open')
    .single()

  if (!conversation) {
    const { data: newConv } = await supabase
      .from('whatsapp_conversations')
      .insert({
        organization_id: orgId,
        contact_id: contact.id,
        phone_number: phoneNumber,
        status: 'open',
        is_bot_active: false,
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
        unread_count: 1,
      })
      .select()
      .single()
    conversation = newConv
  } else {
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
        unread_count: (conversation.unread_count || 0) + 1,
      })
      .eq('id', conversation.id)
  }

  if (!conversation) return

  await supabase
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
      metadata: { pushName, instanceId: instance.id },
    })
}
