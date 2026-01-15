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
      content: typeof msg.content === 'object' ? (msg.content?.text || msg.text_body || JSON.stringify(msg.content)) : msg.content,
      media_url: msg.media_url,
      media_filename: msg.media_filename,
      status: msg.status || 'sent',
      sent_by_bot: false,
      created_at: msg.created_at || msg.timestamp,
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

    console.log('[Send Message] ============================')
    console.log('[Send Message] Conversation:', conversationId)
    console.log('[Send Message] Content:', content?.substring(0, 50))

    if (!content) {
      return NextResponse.json({ error: 'content required' }, { status: 400 })
    }

    // Buscar conversa e instância
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('*, contact:whatsapp_contacts(*)')
      .eq('id', conversationId)
      .single()

    if (convError) {
      console.error('[Send Message] Erro ao buscar conversa:', convError)
      return NextResponse.json({ error: 'Conversation not found', details: convError }, { status: 404 })
    }

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    console.log('[Send Message] Conversa encontrada, org:', conversation.organization_id)
    console.log('[Send Message] Telefone destino:', conversation.contact_phone || conversation.phone_number)

    // Buscar instância ativa - QUALQUER instância conectada da organização
    const { data: instances, error: instError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', conversation.organization_id)
      .in('status', ['connected', 'ACTIVE'])
      .limit(1)

    const instance = instances?.[0]

    if (instError) {
      console.error('[Send Message] Erro ao buscar instância:', instError)
    }

    if (!instance) {
      console.error('[Send Message] Nenhuma instância conectada encontrada')
      
      // Listar todas as instâncias para debug
      const { data: allInst } = await supabase
        .from('whatsapp_instances')
        .select('id, unique_id, status, organization_id')
        .eq('organization_id', conversation.organization_id)
      
      console.log('[Send Message] Instâncias da org:', allInst)
      
      return NextResponse.json({ 
        error: 'No connected WhatsApp instance',
        debug: {
          organization_id: conversation.organization_id,
          instances_found: allInst?.length || 0,
          instances: allInst?.map(i => ({ id: i.id, status: i.status }))
        }
      }, { status: 400 })
    }

    console.log('[Send Message] Instância encontrada:', instance.instance_name || instance.unique_id, 'Status:', instance.status)

    // Enviar via Evolution API
    const apiUrl = instance.api_url || EVOLUTION_API_URL
    const apiKey = instance.api_key || EVOLUTION_API_KEY
    const instanceName = instance.instance_name || instance.instance_id || instance.unique_id

    console.log('[Send Message] Enviando para Evolution API...')
    console.log('[Send Message] URL:', `${apiUrl}/message/sendText/${instanceName}`)

    const sendResponse = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify({
        number: conversation.contact_phone || conversation.phone_number,
        text: content,
      }),
    })

    const sendData = await sendResponse.json()
    
    console.log('[Send Message] Resposta Evolution:', sendResponse.status, sendResponse.ok)
    console.log('[Send Message] Dados:', JSON.stringify(sendData, null, 2).substring(0, 500))

    // Salvar mensagem no banco (mesmo se falhou, para registro)
    const { data: savedMessage, error: saveError } = await supabase
      .from('whatsapp_messages')
      .insert({
        organization_id: conversation.organization_id,
        instance_id: conversation.instance_id,
        conversation_id: conversationId,
        message_id: sendData?.key?.id || `out-${Date.now()}`,
        direction: 'outbound',
        message_type,
        content: { text: content }, // JSONB
        text_body: content,
        to_number: conversation.contact_phone || conversation.phone_number,
        status: sendResponse.ok ? 'sent' : 'failed',
        timestamp: new Date().toISOString(),
      })
      .select()
      .single()

    if (saveError) {
      console.error('[Send Message] Erro ao salvar mensagem:', saveError)
    } else {
      console.log('[Send Message] Mensagem salva:', savedMessage.id)
    }

    // Atualizar conversa
    await supabase
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
        last_message_direction: 'outbound',
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)

    if (!sendResponse.ok) {
      return NextResponse.json({ 
        message: savedMessage ? {
          id: savedMessage.id,
          conversation_id: savedMessage.conversation_id,
          direction: savedMessage.direction,
          message_type: savedMessage.message_type,
          content: savedMessage.content,
          status: 'failed',
          sent_by_bot: false,
          created_at: savedMessage.created_at,
        } : null,
        success: false,
        error: 'Failed to send via Evolution API',
        evolution_error: sendData,
      })
    }

    return NextResponse.json({ 
      message: {
        id: savedMessage?.id,
        conversation_id: savedMessage?.conversation_id,
        direction: savedMessage?.direction,
        message_type: savedMessage?.message_type,
        content: savedMessage?.content,
        status: savedMessage?.status,
        sent_by_bot: false,
        created_at: savedMessage?.created_at,
      },
      success: sendResponse.ok,
    })
  } catch (error: any) {
    console.error('[Send Message] Erro geral:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
