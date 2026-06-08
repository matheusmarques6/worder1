import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { createWhatsAppCloudClient } from '@/lib/whatsapp/cloud-api'
import { getAccessToken } from '@/lib/whatsapp/account-loader'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
import { extractMessageText } from '@/lib/whatsapp/message-content'
import {
  requireOptIn,
  readOverrideFromRequest,
  buildOptOutBlockedResponse,
} from '@/lib/whatsapp/opt-out-guard'

// ✅ FASE 3: Force dynamic para evitar cache
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Headers padrão sem cache
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
}

// GET - Buscar mensagens (paginação real)
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const conversationId = params.id
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const before = searchParams.get('before')
    const after = searchParams.get('after')

    let query = supabase
      .from('whatsapp_inbox_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('organization_id', orgId)
    if (before) query = query.lt('created_at', before)
    if (after) query = query.gt('created_at', after)
    query = query.order('created_at', { ascending: true }).limit(limit + 1)

    const { data, error } = await query
    if (error) throw error

    const hasMore = (data?.length || 0) > limit
    const messages = hasMore ? data?.slice(0, limit) : data

    if (!before && !after) {
      const firstMsg = messages?.[0]
      const provider = firstMsg?.provider
      if (provider === 'cloud') {
        await supabase.from('whatsapp_cloud_conversations').update({ unread_count: 0 }).eq('id', conversationId)
      } else {
        await supabase.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', conversationId)
      }
    }

    const formatted = (messages || []).map(m => ({
      id: m.id, conversation_id: m.conversation_id, direction: m.direction,
      message_type: m.message_type || 'text', content: extractMessageText(m.content, m.text_body),
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
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const conversationId = params.id
    const { content, message_type = 'text' } = await request.json()

    if (!content) {
      return NextResponse.json(
        { error: 'content required' },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // Detect provider: try Cloud first, fall back to Evolution
    const { data: cloudConv } = await supabase
      .from('whatsapp_cloud_conversations')
      .select('*, account:whatsapp_business_accounts(*)')
      .eq('id', conversationId)
      .eq('organization_id', orgId)
      .maybeSingle()

    if (cloudConv && cloudConv.account) {
      const phoneNumber = cloudConv.contact_phone || cloudConv.wa_id

      // Onda 10 — guard opt-out (texto livre, atendente pode override)
      const optCheck = await requireOptIn(orgId, phoneNumber, undefined, {
        ...(readOverrideFromRequest(request, auth.userId) || {}),
        sender: 'inbox.messages',
      })
      if (!optCheck.allowed) {
        return NextResponse.json(
          buildOptOutBlockedResponse(optCheck, undefined),
          { status: 409, headers: NO_CACHE_HEADERS },
        )
      }

      const client = createWhatsAppCloudClient({
        phoneNumberId: cloudConv.account.phone_number_id,
        accessToken: getAccessToken(cloudConv.account),
      })

      let result
      try {
        result = await client.sendText(phoneNumber, content)
      } catch (apiError: any) {
        console.error('[Messages POST] Cloud API error:', apiError)
        return NextResponse.json(
          { error: apiError.message || 'Failed to send message', code: apiError.code },
          { status: 400, headers: NO_CACHE_HEADERS }
        )
      }

      const messageId = result.messages?.[0]?.id
      const { data: saved } = await supabase
        .from('whatsapp_cloud_messages')
        .upsert({
          organization_id: cloudConv.organization_id,
          store_id: cloudConv.store_id || cloudConv.account?.store_id || null,
          waba_id: cloudConv.account.id,
          conversation_id: conversationId,
          message_id: messageId,
          direction: 'outbound',
          from_number: cloudConv.account.phone_number,
          to_number: phoneNumber,
          message_type,
          content: { text: { body: content } },
          text_body: content,
          status: 'sent',
          timestamp: new Date().toISOString(),
        }, { onConflict: 'message_id' })
        .select()
        .maybeSingle()

      await supabase.from('whatsapp_cloud_conversations').update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
        last_message_direction: 'outbound',
      }).eq('id', conversationId)

      return NextResponse.json({
        message: {
          id: saved?.id,
          conversation_id: conversationId,
          direction: 'outbound',
          message_type,
          content,
          status: 'sent',
          sent_by_bot: false,
          created_at: saved?.created_at,
        },
        provider: 'cloud',
        success: true,
      }, { headers: NO_CACHE_HEADERS })
    }

    // Sem conversa Cloud correspondente: a única via de envio é a WhatsApp
    // Cloud API (Meta). Conversas legadas (Evolution) não enviam mais.
    return NextResponse.json(
      { error: 'Conversa Cloud não encontrada para este id' },
      { status: 404, headers: NO_CACHE_HEADERS }
    )
  } catch (error: any) {
    console.error('[Messages POST] Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}
