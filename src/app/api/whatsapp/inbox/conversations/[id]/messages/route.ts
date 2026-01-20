import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';

// ✅ SPRINT 2: SEM FALLBACK HARDCODED
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY

function getEvolutionConfig(instance?: any) {
  const apiUrl = instance?.api_url || instance?.server_url || EVOLUTION_API_URL
  const apiKey = instance?.api_key || EVOLUTION_API_KEY
  if (!apiUrl || !apiKey) return null
  return { apiUrl, apiKey }
}

// GET - Buscar mensagens (paginação real)
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const conversationId = params.id
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const before = searchParams.get('before')
    const after = searchParams.get('after')

    let query = supabase.from('whatsapp_messages').select('*').eq('conversation_id', conversationId)
    if (before) query = query.lt('created_at', before)
    if (after) query = query.gt('created_at', after)
    query = query.order('created_at', { ascending: true }).limit(limit + 1)

    const { data, error } = await query
    if (error) throw error

    const hasMore = (data?.length || 0) > limit
    const messages = hasMore ? data?.slice(0, limit) : data

    // Marcar como lida no fetch inicial
    if (!before && !after) {
      await supabase.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', conversationId)
    }

    const getContent = (c: any, fb?: string): string => {
      if (!c && !fb) return ''
      if (typeof c === 'string') return c
      if (c?.text) return c.text
      return fb || JSON.stringify(c || '')
    }

    const formatted = (messages || []).map(m => ({
      id: m.id, conversation_id: m.conversation_id, direction: m.direction,
      message_type: m.message_type || 'text', content: getContent(m.content, m.text_body),
      media_url: m.media_url, media_filename: m.media_filename, media_mime_type: m.media_mime_type,
      status: m.status || 'sent', sent_by_bot: m.sent_by_bot || false,
      created_at: m.created_at || m.timestamp, delivered_at: m.delivered_at, read_at: m.read_at,
      meta_message_id: m.message_id,
    }))

    return NextResponse.json({ messages: formatted, hasMore })
  } catch (error: any) {
    console.error('[Messages GET] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Enviar mensagem
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const conversationId = params.id
    const { content, message_type = 'text' } = await request.json()
    
    if (!content) {
      return NextResponse.json({ error: 'content required' }, { status: 400 })
    }

    const { data: conversation } = await supabase
      .from('whatsapp_conversations').select('*').eq('id', conversationId).single()
    
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const { data: instances } = await supabase.from('whatsapp_instances').select('*')
      .eq('organization_id', conversation.organization_id).in('status', ['connected', 'ACTIVE']).limit(1)
    
    const instance = instances?.[0]
    if (!instance) {
      return NextResponse.json({ error: 'No connected WhatsApp instance' }, { status: 400 })
    }

    // ✅ SPRINT 2: Verificar config sem fallback hardcoded
    const config = getEvolutionConfig(instance)
    if (!config) {
      return NextResponse.json({ 
        error: 'Evolution API not configured. Set EVOLUTION_API_URL and EVOLUTION_API_KEY.' 
      }, { status: 503 })
    }

    const instanceName = instance.instance_name || instance.instance_id || instance.unique_id
    
    const sendResponse = await fetch(`${config.apiUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': config.apiKey },
      body: JSON.stringify({ 
        number: conversation.contact_phone || conversation.phone_number, 
        text: content 
      }),
    })
    const sendData = await sendResponse.json()

    const { data: saved } = await supabase.from('whatsapp_messages').insert({
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
    }).select().single()

    await supabase.from('whatsapp_conversations').update({
      last_message_at: new Date().toISOString(), 
      last_message_preview: content.substring(0, 100),
      last_message_direction: 'outbound', 
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId)

    return NextResponse.json({
      message: {
        id: saved?.id,
        conversation_id: saved?.conversation_id,
        direction: saved?.direction,
        message_type: saved?.message_type,
        content: saved?.content?.text || content,
        status: saved?.status,
        sent_by_bot: false,
        created_at: saved?.created_at,
      },
      success: sendResponse.ok,
    })
  } catch (error: any) {
    console.error('[Send Message] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
