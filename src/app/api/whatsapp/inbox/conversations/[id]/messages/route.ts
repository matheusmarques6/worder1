import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://n8n-evolution-api.1fpac5.easypanel.host'
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11'

// GET - Buscar mensagens
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id

    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) throw error

    // Marcar conversa como lida
    await supabase
      .from('whatsapp_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId)

    const messages = (data || []).map(msg => ({
      id: msg.id,
      conversation_id: msg.conversation_id,
      direction: msg.direction,
      message_type: msg.message_type || 'text',
      content: msg.content,
      media_url: msg.media_url,
      media_filename: msg.metadata?.fileName,
      status: msg.status || 'sent',
      sent_by_bot: msg.metadata?.ai_generated || false,
      created_at: msg.created_at,
    }))

    return NextResponse.json({ messages })
  } catch (error: any) {
    console.error('Error fetching messages:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Enviar mensagem
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id
    const body = await request.json()
    const { content, message_type = 'text' } = body

    if (!content) {
      return NextResponse.json({ error: 'content required' }, { status: 400 })
    }

    // Buscar conversa e instância
    const { data: conversation } = await supabase
      .from('whatsapp_conversations')
      .select('*, contact:whatsapp_contacts(*)')
      .eq('id', conversationId)
      .single()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Buscar instância ativa
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', conversation.organization_id)
      .eq('status', 'connected')
      .single()

    if (!instance) {
      return NextResponse.json({ error: 'No connected WhatsApp instance' }, { status: 400 })
    }

    // Enviar via Evolution API
    const apiUrl = instance.api_url || EVOLUTION_API_URL
    const apiKey = instance.api_key || EVOLUTION_API_KEY

    const sendResponse = await fetch(`${apiUrl}/message/sendText/${instance.unique_id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify({
        number: conversation.phone_number,
        text: content,
      }),
    })

    const sendData = await sendResponse.json()

    // Salvar mensagem no banco
    const { data: savedMessage, error: saveError } = await supabase
      .from('whatsapp_messages')
      .insert({
        organization_id: conversation.organization_id,
        conversation_id: conversationId,
        contact_id: conversation.contact_id,
        direction: 'outbound',
        message_type,
        content,
        status: sendResponse.ok ? 'sent' : 'failed',
        wamid: sendData?.key?.id,
        wa_message_id: sendData?.key?.id,
        metadata: { evolution_response: sendData },
      })
      .select()
      .single()

    if (saveError) throw saveError

    // Atualizar conversa
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
      })
      .eq('id', conversationId)

    return NextResponse.json({ 
      message: {
        id: savedMessage.id,
        conversation_id: savedMessage.conversation_id,
        direction: savedMessage.direction,
        message_type: savedMessage.message_type,
        content: savedMessage.content,
        status: savedMessage.status,
        sent_by_bot: false,
        created_at: savedMessage.created_at,
      },
      success: sendResponse.ok,
    })
  } catch (error: any) {
    console.error('Error sending message:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
