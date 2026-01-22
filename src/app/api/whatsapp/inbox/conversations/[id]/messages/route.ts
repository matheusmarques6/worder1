import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// ✅ FASE 3: Force dynamic para evitar cache
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Headers padrão sem cache
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
}

// ✅ FASE 2: SEM FALLBACK HARDCODED
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

    return NextResponse.json(
      { messages: formatted, hasMore },
      { headers: NO_CACHE_HEADERS }
    )
  } catch (error: any) {
    console.error('[Messages GET] Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}

// POST - Enviar mensagem
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const conversationId = params.id
    const { content, message_type = 'text' } = await request.json()
    
    if (!content) {
      return NextResponse.json(
        { error: 'content required' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Buscar conversa COM instance_id e store_id
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('*, instance_id, store_id, contact_phone, phone_number, organization_id')
      .eq('id', conversationId)
      .single()
    
    if (convError || !conversation) {
      console.error('[Messages POST] Conversation not found:', conversationId)
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Verificar se conversa tem instance_id
    if (!conversation.instance_id) {
      console.error('[Messages POST] Conversa sem instance_id:', {
        conversation_id: conversationId,
        store_id: conversation.store_id
      })
      return NextResponse.json(
        { error: 'Conversa não tem instância associada. Reabra a conversa.' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Buscar instância ESPECÍFICA da conversa (não qualquer uma!)
    const { data: instance, error: instError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', conversation.instance_id)
      .single()
    
    if (instError || !instance) {
      console.error('[Messages POST] Instância não encontrada:', {
        instance_id: conversation.instance_id,
        conversation_id: conversationId
      })
      return NextResponse.json(
        { error: 'Instância WhatsApp não encontrada' },
        { status: 404, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Validar que store_id bate entre conversa e instância
    if (conversation.store_id && instance.store_id && conversation.store_id !== instance.store_id) {
      console.error('[Messages POST] Store mismatch:', {
        conversation_store: conversation.store_id,
        instance_store: instance.store_id,
        conversation_id: conversationId
      })
      return NextResponse.json(
        { error: 'Instância não pertence à mesma loja da conversa' },
        { status: 403, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Validar que instância está conectada
    const connectedStatuses = ['connected', 'ACTIVE', 'open']
    if (!connectedStatuses.includes(instance.status?.toLowerCase())) {
      console.error('[Messages POST] Instância desconectada:', {
        instance_id: instance.id,
        instance_name: instance.instance_name,
        status: instance.status
      })
      return NextResponse.json(
        { error: `Instância WhatsApp não está conectada (status: ${instance.status})` },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // ✅ FASE 3: Verificar config sem fallback hardcoded
    const config = getEvolutionConfig(instance)
    if (!config) {
      return NextResponse.json({ 
        error: 'Evolution API not configured. Set EVOLUTION_API_URL and EVOLUTION_API_KEY.' 
      }, { status: 503, headers: NO_CACHE_HEADERS })
    }

    const instanceName = instance.instance_name || instance.instance_id || instance.unique_id
    const phoneNumber = conversation.contact_phone || conversation.phone_number

    // ✅ FASE 3: Logar detalhes para debug
    console.log('[Messages POST] Enviando mensagem:', {
      conversation_id: conversationId,
      store_id: conversation.store_id,
      instance_id: instance.id,
      instance_name: instanceName,
      instance_status: instance.status,
      to: phoneNumber,
      content_length: content?.length
    })
    
    const sendResponse = await fetch(`${config.apiUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': config.apiKey },
      body: JSON.stringify({ 
        number: phoneNumber, 
        text: content 
      }),
    })
    
    const sendData = await sendResponse.json()

    // ✅ FASE 3: Logar resposta da Evolution
    if (!sendResponse.ok) {
      console.error('[Messages POST] Evolution API error:', {
        status: sendResponse.status,
        response: sendData,
        instance: instanceName
      })
    } else {
      console.log('[Messages POST] ✅ Enviado com sucesso:', sendData?.key?.id)
    }

    const payload = {
  organization_id: conversation.organization_id,
  store_id: conversation.store_id,
  instance_id: conversation.instance_id,
  conversation_id: conversationId,
  message_id: sendData?.key?.id || `out-${Date.now()}`,
  direction: 'outbound',
  message_type,
  content: { text: content },
  text_body: content,
  to_number: phoneNumber,
  status: sendResponse.ok ? 'sent' : 'failed',
  timestamp: new Date().toISOString(),
};

// ✅ Idempotente: se a Evolution fizer retry e vier o mesmo key.id, não quebra com 23505.
const { data: savedUpsert, error: msgError } = await supabase
  .from('whatsapp_messages')
  .upsert(payload, {
    onConflict: 'instance_id,message_id',
    ignoreDuplicates: true,
  })
  .select('*')
  .maybeSingle();

if (msgError) {
  console.error('[Messages POST] ❌ Error saving outbound message:', msgError);
}

const saved = savedUpsert || null;


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
    }, { headers: NO_CACHE_HEADERS })
  } catch (error: any) {
    console.error('[Messages POST] Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}
