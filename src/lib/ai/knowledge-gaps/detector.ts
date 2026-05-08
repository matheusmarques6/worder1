// =============================================
// Detector de gaps de conhecimento.
//
// Estratégia simples (MVP):
//   1. Coleta execuções recentes com sinal de gap:
//      - outcome='escalated' OU retrieval_calls vazio com baixo eval_score
//      - apenas as últimas N por agente (evita custo)
//   2. Extrai a primeira mensagem do usuário em cada execução.
//   3. Pede pra um LLM cheap (Haiku) agrupar em até 5 tópicos com sugestão
//      de tipo de fonte que resolveria.
//   4. Upserta em ai_knowledge_gaps por topic — incrementa frequency e
//      anexa novas perguntas em sample_questions[].
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { complete, isLLMConfigured } from '../llm/client'

interface ScanOptions {
  agentId: string
  organizationId: string
  days?: number
  maxSamples?: number
}

interface DetectedTopic {
  topic: string
  sample_questions: string[]
  suggested_action: string
  suggested_source_type: 'url' | 'text' | 'faq' | 'integration'
  confidence_avg?: number
}

export interface ScanResult {
  scanned_executions: number
  topics_found: number
  topics_upserted: Array<{ topic: string; frequency: number; new: boolean }>
  skipped?: string
}

export async function scanKnowledgeGaps(opts: ScanOptions): Promise<ScanResult> {
  if (!isLLMConfigured()) {
    return { scanned_executions: 0, topics_found: 0, topics_upserted: [], skipped: 'no_llm_key' }
  }
  const supabase = getSupabaseAdmin()
  const days = opts.days ?? 7
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const maxSamples = opts.maxSamples ?? 50

  // 1. Coleta execuções com sinal de gap
  const { data: rows } = await supabase
    .from('ai_executions')
    .select('id, conversation_id, outcome, input, retrieval_calls, eval_score, started_at')
    .eq('organization_id', opts.organizationId)
    .eq('agent_id', opts.agentId)
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(maxSamples * 4)

  if (!rows || rows.length === 0) {
    return { scanned_executions: 0, topics_found: 0, topics_upserted: [] }
  }

  const candidates = rows
    .filter((r) => {
      const escalated = r.outcome === 'escalated'
      const noRetrieval = !Array.isArray(r.retrieval_calls) || (r.retrieval_calls as unknown[]).length === 0
      const lowEval = typeof r.eval_score === 'number' && r.eval_score <= 2
      return escalated || (noRetrieval && lowEval)
    })
    .slice(0, maxSamples)

  if (candidates.length === 0) {
    return { scanned_executions: rows.length, topics_found: 0, topics_upserted: [] }
  }

  const userQuestions: Array<{ executionId: string; conversationId: string; question: string }> = []
  for (const c of candidates) {
    const input = c.input as { messages?: Array<{ content: string }> } | null
    const firstMsg = input?.messages?.[0]?.content?.trim()
    if (firstMsg && firstMsg.length > 5) {
      userQuestions.push({
        executionId: c.id as string,
        conversationId: c.conversation_id as string,
        question: firstMsg,
      })
    }
  }

  if (userQuestions.length === 0) {
    return { scanned_executions: rows.length, topics_found: 0, topics_upserted: [] }
  }

  // 2. Pede pro Haiku clusterizar
  const evalModel = process.env.AI_EVALUATOR_MODEL || 'anthropic/claude-haiku-4-5'
  const llmRes = await complete({
    model: evalModel,
    messages: [
      {
        role: 'system',
        content:
          'Você analisa perguntas de clientes que a IA não conseguiu responder bem. Agrupe as perguntas em até 5 tópicos. Para cada tópico, sugira que tipo de fonte (url, text, faq, integration) seria adicionada à base de conhecimento. Responda APENAS em JSON: {"topics":[{"topic":"...","sample_questions":["...","..."],"suggested_action":"...","suggested_source_type":"text|url|faq|integration"}]}',
      },
      {
        role: 'user',
        content: `Perguntas dos clientes:\n${userQuestions
          .map((q, i) => `${i + 1}. ${q.question}`)
          .join('\n')}\n\nResponda em JSON puro.`,
      },
    ],
    temperature: 0.1,
    maxTokens: 1500,
  })

  let parsed: { topics: DetectedTopic[] } = { topics: [] }
  try {
    parsed = JSON.parse(llmRes.content.replace(/```json|```/g, '').trim())
  } catch {
    return {
      scanned_executions: rows.length,
      topics_found: 0,
      topics_upserted: [],
      skipped: 'json_parse_error',
    }
  }

  // 3. Upsert em ai_knowledge_gaps
  const upserted: Array<{ topic: string; frequency: number; new: boolean }> = []
  for (const t of parsed.topics) {
    if (!t.topic || !t.topic.trim()) continue
    const topicNorm = t.topic.trim().slice(0, 200)

    const { data: existing } = await supabase
      .from('ai_knowledge_gaps')
      .select('id, frequency, sample_questions')
      .eq('agent_id', opts.agentId)
      .eq('organization_id', opts.organizationId)
      .ilike('topic', topicNorm)
      .eq('status', 'open')
      .maybeSingle()

    if (existing) {
      const merged = mergeQuestions(
        (existing.sample_questions as string[]) ?? [],
        t.sample_questions ?? [],
      )
      const newFreq = (existing.frequency ?? 1) + (t.sample_questions?.length ?? 1)
      await supabase
        .from('ai_knowledge_gaps')
        .update({
          frequency: newFreq,
          sample_questions: merged,
          suggested_action: t.suggested_action ?? null,
          suggested_source_type: t.suggested_source_type ?? null,
        })
        .eq('id', existing.id)
      upserted.push({ topic: topicNorm, frequency: newFreq, new: false })
    } else {
      await supabase.from('ai_knowledge_gaps').insert({
        organization_id: opts.organizationId,
        agent_id: opts.agentId,
        topic: topicNorm,
        sample_questions: (t.sample_questions ?? []).slice(0, 10),
        frequency: t.sample_questions?.length ?? 1,
        suggested_action: t.suggested_action ?? null,
        suggested_source_type: t.suggested_source_type ?? null,
        status: 'open',
      })
      upserted.push({
        topic: topicNorm,
        frequency: t.sample_questions?.length ?? 1,
        new: true,
      })
    }
  }

  return {
    scanned_executions: rows.length,
    topics_found: parsed.topics.length,
    topics_upserted: upserted,
  }
}

function mergeQuestions(existing: string[], incoming: string[]): string[] {
  const combined = [...existing, ...incoming]
  const seen = new Set<string>()
  const uniq: string[] = []
  for (const q of combined) {
    const key = q.trim().toLowerCase().slice(0, 80)
    if (seen.has(key)) continue
    seen.add(key)
    uniq.push(q.trim())
    if (uniq.length >= 10) break
  }
  return uniq
}
