import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
    
    // Log inicial
    await logWebhook('RECEIVED', body.instance || 'unknown', { event: body.event })

    if (body.event === 'messages.upsert' || body.event === 'MESSAGES_UPSERT') {
      await processMessage(body)
    }

    return NextResponse.json({ status: 'ok' })
  } catch (error: any) {
    await logWebhook('ERROR_MAIN', 'error', { error: error.message })
    return NextResponse.json({ status: 'error' }, { status: 200 })
  }
}

async function logWebhook(eventType: string, instanceName: string, data: any) {
  try {
    await supabase.from('webhook_logs').insert({
      event_type: eventType,
      instance_name: instanceName,
      raw_data: data,
    })
  } catch (e) {
    console.error('Log error:', e)
  }
}

async function processMessage(body: any) {
  const instanceName = body.instance
  const data = body.data

  // 1. Buscar instância
  const { data: instance, error: instError } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('unique_id', instanceName)
    .single()

  if (instError || !instance) {
    await logWebhook('INSTANCE_NOT_FOUND', instanceName, { error: instError?.message })
    return
  }

  await logWebhook('INSTANCE_FOUND', instanceName, { instance_id: instance.id, org_id: instance.organization_id })

  const orgId = instance.organization_id
  const key = data.key
  const message = data.message

  // Ignorar mensagens próprias
  if (key?.fromMe) {
    await logWebhook('SKIP_OWN_MESSAGE', instanceName, {})
    return
  }

  const remoteJid = key?.remoteJid
  if (!remoteJid) {
    await logWebhook('NO_REMOTE_JID', instanceName, {})
    return
  }

  // Ignorar grupos
  if (remoteJid.includes('@g.us')) {
    await logWebhook('SKIP_GROUP', instanceName, {})
    return
  }

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

  await logWebhook('MESSAGE_PARSED', instanceName, { phoneNumber, pushName, content, messageType })

  // 2. Buscar ou criar contato
  let { data: contact, error: contactError } = await supabase
    .from('whatsapp_contacts')
    .select('*')
    .eq('organization_id', orgId)
    .eq('phone_number', phoneNumber)
    .single()

  if (contactError && contactError.code !== 'PGRST116') {
    await logWebhook('CONTACT_ERROR', instanceName, { error: contactError.message })
    return
  }

  if (!contact) {
    const { data: newContact, error: createContactError } = await supabase
      .from('whatsapp_contacts')
      .insert({
        organization_id: orgId,
        phone_number: phoneNumber,
        name: pushName,
        profile_name: pushName,
      })
      .select()
      .single()

    if (createContactError) {
      await logWebhook('CREATE_CONTACT_ERROR', instanceName, { error: createContactError.message })
      return
    }
    contact = newContact
    await logWebhook('CONTACT_CREATED', instanceName, { contact_id: contact.id })
  } else {
    await logWebhook('CONTACT_FOUND', instanceName, { contact_id: contact.id })
  }

  // 3. Buscar ou criar conversa
  let { data: conversation, error: convError } = await supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('contact_id', contact.id)
    .eq('status', 'open')
    .single()

  if (convError && convError.code !== 'PGRST116') {
    await logWebhook('CONV_ERROR', instanceName, { error: convError.message })
    return
  }

  if (!conversation) {
    const { data: newConv, error: createConvError } = await supabase
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

    if (createConvError) {
      await logWebhook('CREATE_CONV_ERROR', instanceName, { error: createConvError.message })
      return
    }
    conversation = newConv
    await logWebhook('CONV_CREATED', instanceName, { conversation_id: conversation.id })
  } else {
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
        unread_count: (conversation.unread_count || 0) + 1,
      })
      .eq('id', conversation.id)
    await logWebhook('CONV_UPDATED', instanceName, { conversation_id: conversation.id })
  }

  // 4. Salvar mensagem
  const { data: savedMsg, error: msgError } = await supabase
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
    .select()
    .single()

  if (msgError) {
    await logWebhook('MESSAGE_SAVE_ERROR', instanceName, { error: msgError.message })
    return
  }

  await logWebhook('MESSAGE_SAVED', instanceName, { message_id: savedMsg.id })
}
