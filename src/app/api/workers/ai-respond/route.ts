// =============================================
// Worker /api/workers/ai-respond — pipeline F1 (monolítico)
//
// Acionado via QStash (com delay de debounce do buffer Redis). Drena o
// buffer de mensagens da conversa, roda o AgentRunner, persiste a
// resposta como mensagem outbound e envia via Meta Cloud API quando
// houver token configurado em whatsapp_accounts. Sem token, a mensagem
// fica registrada como `pending` para inspeção/manual send.
//
// Headers esperados (em produção):
//   - upstash-signature  (verifica via verifyQstashSignature)
//
// Body: { conversationId: string; agentId: string }
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { drainBuffer } from '@/lib/inbox/buffer'
import { runAgent, AgentNotPublishedError } from '@/lib/ai/runner'
import { isLLMConfigured } from '@/lib/ai/llm/client'
import { verifyQstashSignature } from '@/lib/redis/qstash'
import { sendOutboundText } from '@/lib/whatsapp/send-outbound'
import { splitMessages } from '@/lib/ai/splitter'
import { processMedia } from '@/lib/ai/multimodal'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

interface ConversationRow {
  id: string
  organization_id: string
  ai_paused: boolean | null
  ai_agent_id: string | null
  whatsapp_account_id: string | null
  instance_id: string | null
  phone_number: string
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('upstash-signature') || ''
  const valid = await verifyQstashSignature(signature, rawBody, req.url)
  if (!valid) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let payload: { conversationId?: string; agentId?: string }
  try {
    payload = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const { conversationId, agentId } = payload
  if (!conversationId || !agentId) {
    return NextResponse.json({ error: 'conversationId + agentId required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // 1. Não responder se a IA está pausada na conversa
  const { data: convData } = await supabase
    .from('whatsapp_conversations')
    .select(
      'id, organization_id, ai_paused, ai_agent_id, whatsapp_account_id, instance_id, phone_number',
    )
    .eq('id', conversationId)
    .single()
  if (!convData) return NextResponse.json({ ok: true, skipped: 'conversation not found' })
  const conv = convData as ConversationRow
  if (conv.ai_paused) {
    return NextResponse.json({ ok: true, skipped: 'ai paused' })
  }

  // 2. Drena buffer de mensagens em rajada
  const messageIds = await drainBuffer(conversationId)
  if (messageIds.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'empty buffer' })
  }
  const { data: newMessages } = await supabase
    .from('whatsapp_messages')
    .select('id, content, created_at, message_type, type, media_url, media_mime_type, media_filename')
    .in('id', messageIds)
    .order('created_at', { ascending: true })
  if (!newMessages || newMessages.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no messages found' })
  }

  // 2.b) Multimodal: transcreve audio/imagem/documento antes da LLM
  const processed = await Promise.all(
    newMessages.map(async (m) => {
      const msgType = (m.message_type as string) || (m.type as string) || 'text'
      const isMedia =
        msgType !== 'text' && (m.media_url as string | null) && msgType !== 'reaction'
      let content = (m.content as string) ?? ''
      if (isMedia) {
        const out = await processMedia({
          mediaUrl: m.media_url as string,
          mimeType: (m.media_mime_type as string | null) ?? null,
          filename: (m.media_filename as string | null) ?? null,
        })
        const transcribed = out.content?.trim()
        if (transcribed) {
          content = content
            ? `${content}\n[${out.kind}] ${transcribed}`
            : `[${out.kind}] ${transcribed}`
        }
      }
      return {
        id: m.id as string,
        content,
        created_at: m.created_at as string,
      }
    }),
  )

  // 3. Roda o agente (LLM)
  if (!isLLMConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'OPENROUTER_API_KEY ausente' },
      { status: 503 },
    )
  }
  let result
  try {
    result = await runAgent({
      agentId,
      conversationId,
      newMessages: processed,
    })
  } catch (err) {
    if (err instanceof AgentNotPublishedError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 404 })
    }
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }

  // 4. Splitter: quando persona.split_messages=true, envia 2-3 partes curtas.
  const parts = result.splitMessages
    ? splitMessages(result.replyText)
    : [result.replyText]

  // 5. Delay base de "typing" (sempre antes da primeira parte)
  const minMs = parseInt(process.env.AI_TYPING_MIN_MS || '1500', 10)
  const maxMs = parseInt(process.env.AI_TYPING_MAX_MS || '4000', 10)
  const baseDelay = Math.floor(Math.random() * (maxMs - minMs) + minMs)
  await new Promise((r) => setTimeout(r, baseDelay))

  // 6. Envia cada parte em sequência com pequena pausa pra simular digitação
  const sendCtx = {
    organizationId: conv.organization_id,
    conversationId,
    whatsappAccountId: conv.whatsapp_account_id,
    instanceId: conv.instance_id,
    phoneNumber: conv.phone_number,
  }

  const sendResults: Array<{
    text: string
    ok: boolean
    waMessageId: string | null
    channel?: string | null
    reason?: string
    error?: string
  }> = []

  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      // delay entre partes proporcional ao tamanho da próxima
      const partDelay = Math.min(2500, 800 + parts[i].length * 25)
      await new Promise((r) => setTimeout(r, partDelay))
    }
    const sendResult = await sendOutboundText(sendCtx, parts[i])
    sendResults.push({
      text: parts[i],
      ok: sendResult.ok,
      waMessageId: sendResult.waMessageId ?? null,
      channel: sendResult.channel ?? null,
      reason: sendResult.reason,
      error: sendResult.error,
    })

    const messageStatus: 'sent' | 'pending' | 'failed' = sendResult.ok
      ? 'sent'
      : sendResult.reason === 'no_sender_configured'
      ? 'pending'
      : 'failed'

    await supabase.from('whatsapp_messages').insert({
      organization_id: conv.organization_id,
      conversation_id: conversationId,
      instance_id: conv.instance_id,
      wa_message_id: sendResult.waMessageId ?? null,
      message_id: sendResult.waMessageId ?? null,
      direction: 'outbound',
      type: 'text',
      message_type: 'text',
      content: parts[i],
      text_body: parts[i],
      status: messageStatus,
      sender_type: 'ai_agent',
      sender_name: 'IA',
      is_from_me: true,
      ai_execution_id: i === 0 ? result.executionId : null,
      sent_at: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      error_message: sendResult.error ?? sendResult.reason ?? null,
    })
  }

  const allOk = sendResults.every((r) => r.ok)
  const firstFail = sendResults.find((r) => !r.ok)

  return NextResponse.json({
    ok: true,
    executionId: result.executionId,
    tokens: result.tokensIn + result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    parts: sendResults.length,
    splitMessages: result.splitMessages,
    allDelivered: allOk,
    firstFailReason: firstFail?.reason ?? null,
    firstFailError: firstFail?.error ?? null,
  })
}

