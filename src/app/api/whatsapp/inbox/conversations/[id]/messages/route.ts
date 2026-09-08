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
import {
  checkBeforeSend,
  reportSendResult,
  buildRateLimitedResponseBody,
} from '@/lib/whatsapp/send-guard'
import { computeCanSendTemplateOnly } from '@/lib/whatsapp/service-window'

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

    // Re-assina URLs de mídia a partir do storage_path a CADA leitura.
    // A URL persistida em media_url expira em 1h; sem isso, mídia (inclusive
    // enviada) quebra no reload. 1 chamada batch por página de mensagens.
    const mediaPaths = (messages || [])
      .map(m => m.media_storage_path)
      .filter((p): p is string => !!p)
    const signedByPath: Record<string, string> = {}
    if (mediaPaths.length > 0) {
      const { data: signed, error: signError } = await supabase.storage
        .from('whatsapp-media')
        .createSignedUrls(mediaPaths, 3600)
      if (signError) {
        console.error('[Messages GET] createSignedUrls error:', signError)
      }
      for (const s of signed || []) {
        if (s.path && s.signedUrl) signedByPath[s.path] = s.signedUrl
      }
    }

    if (!before && !after) {
      const firstMsg = messages?.[0]
      const provider = firstMsg?.provider
      // A leitura acima já é cercada por organização; a escrita não era,
      // e zerava o não-lido de uma conversa de qualquer organização.
      if (provider === 'cloud') {
        await supabase.from('whatsapp_cloud_conversations')
          .update({ unread_count: 0 }).eq('id', conversationId).eq('organization_id', orgId)
      } else {
        await supabase.from('whatsapp_conversations')
          .update({ unread_count: 0 }).eq('id', conversationId).eq('organization_id', orgId)
      }
    }

    const formatted = (messages || []).map(m => ({
      id: m.id, conversation_id: m.conversation_id, direction: m.direction,
      message_type: m.message_type || 'text', content: extractMessageText(m.content, m.text_body),
      media_url: (m.media_storage_path && signedByPath[m.media_storage_path]) || m.media_url,
      media_filename: m.media_filename, media_mime_type: m.media_mime_type,
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

    // Conversas Cloud (WhatsApp Cloud API / Meta)
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

      // Janela de 24h (Meta): fora da janela so template aprovado. Sem este
      // guard a mensagem ia ate a Meta e falhava la (erro 131047).
      if (computeCanSendTemplateOnly(cloudConv.is_window_open, cloudConv.window_expires_at)) {
        return NextResponse.json(
          {
            error: 'Janela de 24h expirada. Envie um template aprovado para reabrir a conversa.',
            code: 'WINDOW_EXPIRED',
          },
          { status: 400, headers: NO_CACHE_HEADERS },
        )
      }

      // Send guard — tier da Meta + circuit breaker (paridade com campanhas)
      const guardCheck = await checkBeforeSend({
        accountId: cloudConv.account.id,
        phoneNumberId: cloudConv.account.phone_number_id,
        recipientPhone: phoneNumber,
        messagingLimit: cloudConv.account.messaging_limit,
      })
      if (!guardCheck.allowed) {
        const body429 = buildRateLimitedResponseBody(guardCheck)
        return NextResponse.json(body429, {
          status: 429,
          headers: { ...NO_CACHE_HEADERS, 'Retry-After': String(body429.retryAfter) },
        })
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
        await reportSendResult({
          accountId: cloudConv.account.id,
          phoneNumberId: cloudConv.account.phone_number_id,
          success: false,
          errorCode: apiError?.code,
          error: apiError,
          messagingLimit: cloudConv.account.messaging_limit,
        })
        return NextResponse.json(
          { error: apiError.message || 'Failed to send message', code: apiError.code },
          { status: 400, headers: NO_CACHE_HEADERS }
        )
      }
      await reportSendResult({
        accountId: cloudConv.account.id,
        phoneNumberId: cloudConv.account.phone_number_id,
        success: true,
      })

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
          sent_by_bot: false,
          sender: 'human',
          timestamp: new Date().toISOString(),
        }, { onConflict: 'message_id' })
        .select()
        .maybeSingle()

      await supabase.from('whatsapp_cloud_conversations').update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.substring(0, 100),
        last_message_direction: 'outbound',
      }).eq('id', conversationId)

      // Atendente entrou na conversa (pedido 17/08): em org no runtime, o
      // humano tem a palavra — cancela a resposta automática agendada e o
      // chip conta o porquê do silêncio do agente. Chip só quando havia algo
      // a cancelar; no legado a RPC é no-op. Nunca quebra o envio manual.
      try {
        const { getRuntimeMode } = await import('@/lib/ai/runtime-rollout')
        const mode = await getRuntimeMode(supabase, cloudConv.organization_id)
        if (mode === 'runtime') {
          const { data: cancelled } = await supabase.rpc('cancel_pending_ai_response', {
            p_organization_id: cloudConv.organization_id,
            p_phone: String(phoneNumber ?? ''),
          })
          if ((cancelled ?? 0) > 0) {
            const { recordAiStep, AI_RUN_STEPS } = await import('@/lib/ai/run-steps')
            const { randomUUID } = await import('crypto')
            await recordAiStep({
              organizationId: cloudConv.organization_id,
              conversationId,
              runId: randomUUID(),
              step: AI_RUN_STEPS.SKIPPED,
              detail: 'Atendente entrou na conversa — resposta automática cancelada',
            })
          }
        }
      } catch (takeoverError) {
        console.error('Error cancelling pending AI response:', takeoverError)
      }

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
