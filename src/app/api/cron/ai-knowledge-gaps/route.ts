import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { authorizeCronRequest } from '@/lib/cron-auth'
import { checkAiBudget } from '@/lib/ai/budget'
import { resolveEmbeddingKey } from '@/lib/ai/embedding-key'
import { generateEmbeddingsBatch } from '@/lib/ai/embeddings'
import { trackAiUsage } from '@/lib/ai/cost-tracker'
import {
  clusterGaps, isSensitive, mergeCluster, messageText, suggestionMessages, type GapRow,
} from '@/lib/ai/knowledge/gap-routine'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SUGGESTION_MODEL = 'gpt-4o-mini'
const MAX_GAPS_PER_ORG = 200
const MAX_SUGGESTIONS_PER_ORG = 20

// Plano IA M3 passo 23 — rotina diária das lacunas (vercel.json), por org:
//  1. agrupa lacunas abertas parecidas (embedding, cosseno ≥ 0,85) numa só;
//  2. procura o que a equipe humana respondeu nas mesmas conversas;
//  3. sugere uma resposta (uma chamada LLM com a chave OpenAI da org,
//     custo registrado como gap_suggestion, sob o orçamento da org);
//  4. marca tema sensível (safe = false) para a tela sugerir "limites".
// Org sem chave OpenAI ou sem orçamento é pulada inteira.
export async function GET(request: NextRequest) {
  if (!authorizeCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = getSupabaseAdmin()
  const { data: openRows, error } = await supabase
    .from('ai_knowledge_gaps')
    .select('organization_id')
    .eq('status', 'open')
    .limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const orgs = [...new Set((openRows ?? []).map((r: any) => r.organization_id as string))]

  const report: Array<Record<string, unknown>> = []
  for (const organizationId of orgs) {
    try {
      report.push({ organizationId, ...(await processOrg(supabase, organizationId)) })
    } catch (e: any) {
      report.push({ organizationId, error: e.message })
    }
  }
  return NextResponse.json({ orgs: orgs.length, report })
}

async function processOrg(supabase: any, organizationId: string) {
  const budget = await checkAiBudget(organizationId, { skipCache: true })
  if (!budget.allowed) return { skipped: 'budget' }
  const key = await resolveEmbeddingKey(supabase, organizationId)
  if (!key) return { skipped: 'no_openai_key' }

  const { data, error } = await supabase
    .from('ai_knowledge_gaps')
    .select('id, question, count, agent_ids, examples, first_seen, last_seen, outcome, suggested_answer, cluster_key')
    .eq('organization_id', organizationId)
    .eq('status', 'open')
    .order('count', { ascending: false })
    .limit(MAX_GAPS_PER_ORG)
  if (error) throw new Error(error.message)
  let gaps = (data ?? []) as GapRow[]
  if (gaps.length === 0) return { gaps: 0 }

  // 1. agrupar
  let merged = 0
  if (gaps.length > 1) {
    const vectors = await generateEmbeddingsBatch(gaps.map((g) => g.question), key, organizationId)
    const survivors: GapRow[] = []
    for (const group of clusterGaps(gaps, vectors)) {
      const head = gaps[group[0]]
      if (group.length === 1) { survivors.push(head); continue }
      const others = group.slice(1).map((i) => gaps[i])
      const fused = mergeCluster(head, others)
      const { error: upError } = await supabase
        .from('ai_knowledge_gaps').update(fused).eq('id', head.id).eq('organization_id', organizationId)
      if (upError) throw new Error(upError.message)
      // As absorvidas somem: a cabeça carrega contagem, exemplos e agentes.
      const { error: delError } = await supabase
        .from('ai_knowledge_gaps').delete().in('id', others.map((o) => o.id)).eq('organization_id', organizationId)
      if (delError) throw new Error(delError.message)
      merged += others.length
      survivors.push({ ...head, ...fused })
    }
    gaps = survivors
  }

  // 2–4. respostas humanas, sugestão, sensibilidade
  let suggested = 0
  for (const gap of gaps) {
    const examples = gap.examples ?? []
    const withReplies = await attachHumanReplies(supabase, organizationId, examples)
    const texts = [gap.question, ...withReplies.map((e) => e.text)]
    const patch: Record<string, unknown> = { safe: !isSensitive(texts) }
    if (withReplies.some((e, i) => e.human_reply !== examples[i]?.human_reply)) patch.examples = withReplies

    if (!gap.suggested_answer && suggested < MAX_SUGGESTIONS_PER_ORG) {
      const answer = await suggest(organizationId, key, gap.question, withReplies.map((e) => e.text),
        withReplies.map((e) => e.human_reply).filter(Boolean) as string[])
      if (answer) { patch.suggested_answer = answer; patch.suggested_kind = patch.safe ? 'note' : 'limit'; suggested++ }
    }
    const { error: upError } = await supabase
      .from('ai_knowledge_gaps').update(patch).eq('id', gap.id).eq('organization_id', organizationId)
    if (upError) throw new Error(upError.message)
  }
  return { gaps: gaps.length, merged, suggested }
}

async function attachHumanReplies(supabase: any, organizationId: string, examples: NonNullable<GapRow['examples']>) {
  const out = []
  for (const ex of examples) {
    if (ex.human_reply || !ex.conversation_id) { out.push(ex); continue }
    const { data } = await supabase
      .from('messages')
      .select('content, created_at')
      .eq('organization_id', organizationId)
      .eq('conversation_id', ex.conversation_id)
      .eq('author_type', 'human')
      .order('created_at', { ascending: true })
      .limit(1)
    const text = data?.[0] ? messageText(data[0].content) : null
    out.push(text ? { ...ex, human_reply: text.slice(0, 500) } : ex)
  }
  return out
}

async function suggest(organizationId: string, key: string, question: string, examples: string[], humanReplies: string[]): Promise<string | null> {
  const started = Date.now()
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: SUGGESTION_MODEL,
        temperature: 0.2,
        max_tokens: 220,
        messages: suggestionMessages(question, examples, humanReplies),
      }),
    })
    const body = await res.json().catch(() => null)
    const ok = res.ok && typeof body?.choices?.[0]?.message?.content === 'string'
    await trackAiUsage({
      organizationId,
      provider: 'openai',
      model: SUGGESTION_MODEL,
      feature: 'gap_suggestion',
      promptTokens: body?.usage?.prompt_tokens,
      completionTokens: body?.usage?.completion_tokens,
      durationMs: Date.now() - started,
      success: ok,
      error: ok ? undefined : body?.error?.message ?? `HTTP ${res.status}`,
    })
    return ok ? String(body.choices[0].message.content).trim() : null
  } catch (e) {
    console.error('gap suggestion failed:', e)
    return null
  }
}
