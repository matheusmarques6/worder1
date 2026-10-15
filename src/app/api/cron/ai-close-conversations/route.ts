import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { checkAiBudget } from '@/lib/ai/budget'
import { resolveEmbeddingKey } from '@/lib/ai/embedding-key'
import { trackAiUsage } from '@/lib/ai/cost-tracker'
import { messageText } from '@/lib/ai/knowledge/gap-routine'
import { parseTopic, topicMessages } from '@/lib/ai/topics'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const TOPIC_MODEL = 'gpt-4o-mini'
const MAX_TOPICS_PER_RUN = 200

// Plano IA M5 passo 28 — de hora em hora (vercel.json): fecha as conversas
// de agente ociosas há 24 h (RPC close_idle_ai_conversations: closed_at,
// resolved_without_human e o evento "solved") e classifica o assunto de
// cada fechada com a chave OpenAI da org (purpose topic, sob o orçamento).
// Org sem chave ou sem orçamento fica com o assunto em branco.
export async function GET(request: NextRequest) {
  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = getSupabaseAdmin()
  const { data: closed, error } = await supabase.rpc('close_idle_ai_conversations', { p_idle_hours: 24, p_limit: 500 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (closed ?? []) as Array<{ conversation_id: string; organization_id: string }>

  const keys = new Map<string, string | null>()
  let classified = 0
  for (const row of rows.slice(0, MAX_TOPICS_PER_RUN)) {
    try {
      if (!keys.has(row.organization_id)) {
        const budget = await checkAiBudget(row.organization_id, { skipCache: false })
        keys.set(row.organization_id, budget.allowed ? await resolveEmbeddingKey(supabase, row.organization_id) : null)
      }
      const key = keys.get(row.organization_id)
      if (!key) continue
      const { data: messages } = await supabase
        .from('messages')
        .select('author_type, content')
        .eq('organization_id', row.organization_id)
        .eq('conversation_id', row.conversation_id)
        .order('seq', { ascending: true })
        .limit(12)
      const lines = (messages ?? [])
        .map((m: any) => { const t = messageText(m.content); return t ? `${m.author_type === 'contact' ? 'cliente' : 'loja'}: ${t}` : null })
        .filter(Boolean) as string[]
      if (lines.length === 0) continue
      const topic = await classify(row.organization_id, key, lines)
      if (!topic) continue
      await supabase
        .from('ai_conversation_outcomes')
        .update({ topic })
        .eq('conversation_id', row.conversation_id)
        .eq('organization_id', row.organization_id)
      classified++
    } catch (e) {
      console.error('topic classification failed:', e)
    }
  }
  return NextResponse.json({ closed: rows.length, classified })
}

async function classify(organizationId: string, key: string, lines: string[]): Promise<string | null> {
  const started = Date.now()
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: TOPIC_MODEL, temperature: 0, max_tokens: 8, messages: topicMessages(lines) }),
  })
  const body = await res.json().catch(() => null)
  const ok = res.ok && typeof body?.choices?.[0]?.message?.content === 'string'
  await trackAiUsage({
    organizationId,
    provider: 'openai',
    model: TOPIC_MODEL,
    feature: 'topic',
    promptTokens: body?.usage?.prompt_tokens,
    completionTokens: body?.usage?.completion_tokens,
    durationMs: Date.now() - started,
    success: ok,
    error: ok ? undefined : body?.error?.message ?? `HTTP ${res.status}`,
  })
  return ok ? parseTopic(body.choices[0].message.content) : null
}
