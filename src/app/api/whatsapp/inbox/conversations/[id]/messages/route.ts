import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// ✅ CORREÇÃO: Sem fallback hardcoded
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY

// =============================================
// GET - Buscar mensagens (COM PAGINAÇÃO REAL)
// =============================================
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const conversationId = params.id
    const { searchParams } = new URL(request.url)
    
    // ✅ CORREÇÃO: Paginação real com cursores
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const before = searchParams.get('before') // ISO date - buscar mais antigas
    const after = searchParams.get('after')   // ISO date - buscar mais recentes

    let query = supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('conversation_id', conversationId)

    if (before) query = query.lt('created_at', before)
    if (after) query = query.gt('created_at', after)

    // Ordenar ASC (mais antigas primeiro)
    query = query.order('created_at', { ascending: true })
    
    // ✅ CORREÇÃO: limit + 1 para saber se tem mais
    query = query.limit(limit + 1)

    const { data, error } = await query
    if (error) throw error

    const hasMore = (data?.length || 0) > limit
    const messages = hasMore ? data?.slice(0, limit) : data

    // Marcar como lida apenas no fetch inicial
    if (!before && !after) {
      await supabase.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', conversationId)
    }

    const getContentString = (content: any, fallback?: string): string => {
      if (!content && !fallback) return ''
      if (typeof content === 'string') return content
      if (typeof content === 'object' && content.text) return content.text
      if (fallback) return fallback
      return typeof content === 'object' ? JSON.stringify(content) : String(content || '')
    }

    const formattedMessages = (messages || []).map(msg => ({
      id: msg.id,
      conversation_id: msg.conversation_id,
      direction: msg.direction,
      message_type: msg.message_type || 'text',
      content: getContentString(msg.content, msg.text_body),
      media_url: msg.media_url,
      media_filename: msg.media_filename,
      media_mime_type: msg.media_mime_type,
      status: msg.status || 'sent',
      sent_by_bot: msg.sent_by_bot || false,
      created_at: msg.created_at || msg.timestamp,
      delivered_at: msg.delivered_at,
      read_at: msg.read_at,
      meta_message_id: msg.message_id,
    }))

    return NextResponse.json({ messages: formattedMessages, hasMore })
  } catch (error: any) {
    console.error('[Messages GET] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =============================================
// POST - Enviar mensagem
// =============================================
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // ✅ CORREÇÃO: Verificar config antes
    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      console.error('[Send Message] Missing EVOLUTION_API_URL or EVOLUTION_API_KEY')
      return NextResponse.json({ 
        error: 'WhatsApp API not configured. Set EVOLUTION_API_URL and EVOLUTION_API_KEY.' 
      }, { status: 503 })
    }

    const conversationId = params.id
    const body = await request.json()
    const { content, message_type = 'text' } = body

    if (!content) {
      return NextResponse.json({ error: 'content required' }, { status: 400 })
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

    // Buscar instância
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

    // Enviar via Evolution
    const sendResponse = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
      body: JSON.stringify({
        number: conversation.contact_phone || conversation.phone_number,
        text: content,
      }),
    })
    const sendData = await sendResponse.json()

    // Salvar no banco
    const { data: savedMessage, error: saveError } = await supabase
      .from('whatsapp_messages')
      .insert({
        organization_id: conversation.organization_id,
        instance_id: conversation.instance_id,
        conversation_id: conversationId,
        message_id: sendData?.key?.id || `out-${Date.now()}`,
        direction: 'outbound',
        message_type,
        content: { text: content },
        text_body: content,
        to_number: conversation.contact_phone || conversation.phone_number,
        status: sendResponse.ok ? 'sent' : 'failed',
        timestamp: new Date().toISOString(),
      })
      .select()
      .single()

    if (saveError) console.error('[Send Message] Save error:', saveError)

    // Atualizar conversa
    await supabase.from('whatsapp_conversations').update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content.substring(0, 100),
      last_message_direction: 'outbound',
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId)

    const getContentString = (c: any): string => c?.text || (typeof c === 'string' ? c : JSON.stringify(c || ''))

    return NextResponse.json({
      message: {
        id: savedMessage?.id,
        conversation_id: savedMessage?.conversation_id,
        direction: savedMessage?.direction,
        message_type: savedMessage?.message_type,
        content: getContentString(savedMessage?.content) || content,
        status: savedMessage?.status,
        sent_by_bot: false,
        created_at: savedMessage?.created_at,
      },
      success: sendResponse.ok,
    })
  } catch (error: any) {
    console.error('[Send Message] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
