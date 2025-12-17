import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/whatsapp/inbox/conversations/[id]/messages
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const before = searchParams.get('before') // cursor para paginação
    const offset = (page - 1) * limit

    let query = supabase
      .from('whatsapp_messages')
      .select('*', { count: 'exact' })
      .eq('conversation_id', id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (before) {
      query = query.lt('created_at', before)
    }

    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) throw error

    // Inverter para ordem cronológica na resposta
    const messages = data?.reverse() || []

    return NextResponse.json({
      messages,
      pagination: {
        page,
        limit,
        total: count || 0,
        hasMore: (count || 0) > offset + limit
      }
    })

  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
}

// POST /api/whatsapp/inbox/conversations/[id]/messages
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    const { 
      content, 
      messageType = 'text', 
      mediaUrl, 
      mediaMimeType,
      mediaFilename,
      templateId,
      templateName,
      templateVariables,
      replyToMessageId,
      sentByUserId,
      sentByUserName,
      sentByBot = false
    } = body

    // Busca dados da conversa
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('*, contact:whatsapp_contacts(phone_number)')
      .eq('id', id)
      .single()

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Se tem reply, busca a mensagem citada
    let quotedMessage = null
    if (replyToMessageId) {
      const { data: replyMsg } = await supabase
        .from('whatsapp_messages')
        .select('id, content, message_type, direction')
        .eq('id', replyToMessageId)
        .single()
      
      if (replyMsg) {
        quotedMessage = replyMsg
      }
    }

    // Cria mensagem no banco
    const { data: message, error: msgError } = await supabase
      .from('whatsapp_messages')
      .insert({
        conversation_id: id,
        contact_id: conversation.contact_id,
        direction: 'outbound',
        message_type: messageType,
        content: content,
        media_url: mediaUrl,
        media_mime_type: mediaMimeType,
        media_filename: mediaFilename,
        template_id: templateId,
        template_name: templateName,
        template_variables: templateVariables,
        reply_to_message_id: replyToMessageId,
        quoted_message: quotedMessage,
        status: 'pending',
        sent_by_user_id: sentByUserId,
        sent_by_user_name: sentByUserName,
        sent_by_bot: sentByBot,
        created_at: new Date().toISOString()
      })
      .select('*')
      .single()

    if (msgError) throw msgError

    // TODO: Aqui deve chamar a API da Meta para enviar a mensagem
    // e atualizar o status para 'sent' com o meta_message_id

    // Por enquanto, simula o envio
    await supabase
      .from('whatsapp_messages')
      .update({ 
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('id', message.id)

    // Atualiza a conversa
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content?.substring(0, 100) || `[${messageType}]`,
        last_message_type: messageType,
        last_message_direction: 'outbound',
        total_messages: (conversation.total_messages || 0) + 1,
        // Reabre se estava fechada
        status: conversation.status === 'closed' ? 'open' : conversation.status
      })
      .eq('id', id)

    return NextResponse.json({ message: { ...message, status: 'sent' } })

  } catch (error) {
    console.error('Error sending message:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
