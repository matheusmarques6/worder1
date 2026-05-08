// =============================================
// Worker /api/workers/ai-respond — pipeline F1 (monolítico)
//
// Acionado via QStash (com delay de debounce do buffer Redis). Drena o
// buffer de mensagens da conversa, roda o AgentRunner e persiste a resposta
// em whatsapp_messages. NÃO envia ainda para a Cloud API — o sender
// efetivo (Cloud API send + retry) será adicionado quando as credenciais
// Meta estiverem configuradas; até lá, a resposta da IA fica registrada
// como mensagem outbound `pending` para inspeção.
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

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

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
  const { data: conv } = await supabase
    .from('whatsapp_conversations')
    .select('id, organization_id, ai_paused, ai_paused_until, ai_agent_id')
    .eq('id', conversationId)
    .single()
  if (!conv) return NextResponse.json({ ok: true, skipped: 'conversation not found' })
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
    .select('id, content, created_at')
    .in('id', messageIds)
    .order('created_at', { ascending: true })
  if (!newMessages || newMessages.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no messages found' })
  }

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
      newMessages: newMessages.map((m) => ({
        id: m.id as string,
        content: (m.content as string) ?? '',
        created_at: m.created_at as string,
      })),
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

  // 4. Delay de "typing" antes de persistir (sender efetivo virá depois)
  const minMs = parseInt(process.env.AI_TYPING_MIN_MS || '1500', 10)
  const maxMs = parseInt(process.env.AI_TYPING_MAX_MS || '4000', 10)
  const delayMs = Math.floor(Math.random() * (maxMs - minMs) + minMs)
  await new Promise((r) => setTimeout(r, delayMs))

  // 5. Registra a resposta da IA em whatsapp_messages como outbound pending
  await supabase.from('whatsapp_messages').insert({
    organization_id: conv.organization_id,
    conversation_id: conversationId,
    direction: 'outbound',
    type: 'text',
    content: result.replyText,
    status: 'pending',
    sender_type: 'ai_agent',
    sender_name: 'IA',
    is_from_me: true,
    ai_execution_id: result.executionId,
    sent_at: new Date().toISOString(),
  })

  return NextResponse.json({
    ok: true,
    executionId: result.executionId,
    tokens: result.tokensIn + result.tokensOut,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
  })
}
