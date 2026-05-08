// =============================================
// Simulador de agente — roda um script de mensagens contra o agente sem
// criar conversation/messages reais. Útil pra testar mudanças no prompt
// antes de publicar e pra regression tests em CI.
//
// Fluxo:
//   1. Carrega o agente (qualquer status, sem exigir publicação).
//   2. Pra cada mensagem do script, monta [system, ...transcript, userMsg]
//      e chama o LLM. Acumula a resposta em transcript.
//   3. Se eval_criteria existir, faz segunda chamada com modelo cheap
//      avaliando a transcrição contra os critérios → eval_score 1-5 +
//      eval_feedback {criterion: "passed"|"failed", reason}.
//   4. Persiste em ai_simulations.
//
// Sem RAG/memory por padrão — torna simulações reproduzíveis. Caller pode
// passar `useRAG=true` se quiser o pipeline completo.
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { complete, type ChatMessage } from '../llm/client'
import { buildSystemPrompt } from '../prompt/system-builder'
import { retrieveRelevantChunks } from '../runner/retrieval'
import type { Agent } from '../types'

export interface ScriptMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface EvalCriterion {
  id: string
  description: string // "Mencionou prazo de entrega" ou "Não pediu dados de cartão"
}

export interface SimulationInput {
  simulationId: string
  useRAG?: boolean
}

export interface TranscriptEntry {
  role: 'user' | 'assistant'
  content: string
  tokens_in?: number
  tokens_out?: number
  cost_usd?: number
  duration_ms?: number
}

export interface EvalResult {
  score: number // 1-5
  per_criterion: Array<{ id: string; passed: boolean; reason: string }>
}

export async function runSimulation(input: SimulationInput): Promise<{
  transcript: TranscriptEntry[]
  evalResult: EvalResult | null
  durationMs: number
  totalCostUsd: number
}> {
  const supabase = getSupabaseAdmin()
  const start = Date.now()

  const { data: sim, error } = await supabase
    .from('ai_simulations')
    .select('*, agent:ai_agents(*)')
    .eq('id', input.simulationId)
    .single()
  if (error || !sim) throw new Error('Simulação não encontrada')

  await supabase
    .from('ai_simulations')
    .update({ status: 'running', ran_at: new Date().toISOString() })
    .eq('id', input.simulationId)

  const agent = sim.agent as Agent
  const script = (sim.script_messages as ScriptMessage[]) ?? []
  const criteria = (sim.eval_criteria as EvalCriterion[]) ?? []
  const persona = sim.persona_description as string

  const transcript: TranscriptEntry[] = []
  let totalCostUsd = 0

  // System prompt + nota sobre persona simulada
  const systemPrompt = `${buildSystemPrompt(agent)}\n\n# Cenário de teste\nVocê está conversando com a seguinte persona simulada: ${persona}`

  for (const scriptMsg of script) {
    if (scriptMsg.role === 'assistant') {
      // mensagem injetada do bot (raro, pra testar reações específicas)
      transcript.push({ role: 'assistant', content: scriptMsg.content })
      continue
    }

    // Construir histórico
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }]

    if (input.useRAG) {
      const retrieval = await retrieveRelevantChunks({
        agentId: agent.id,
        query: scriptMsg.content,
      })
      if (retrieval.contextBlock) {
        messages.push({ role: 'system', content: retrieval.contextBlock })
      }
    }

    transcript.forEach((t) => {
      messages.push({ role: t.role, content: t.content })
    })
    messages.push({ role: 'user', content: scriptMsg.content })

    const result = await complete({
      model: agent.llm_config.model,
      messages,
      temperature: agent.llm_config.temperature,
      maxTokens: agent.llm_config.max_tokens,
    })
    totalCostUsd += result.costUsd

    transcript.push({ role: 'user', content: scriptMsg.content })
    transcript.push({
      role: 'assistant',
      content: result.content,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: result.costUsd,
      duration_ms: result.durationMs,
    })
  }

  // Avalia se houver critérios
  let evalResult: EvalResult | null = null
  if (criteria.length > 0) {
    evalResult = await evaluateTranscript(transcript, criteria)
    if (evalResult) totalCostUsd += 0 // custo do avaliador já está somado abaixo
  }

  const finishedAt = Date.now()
  const durationMs = finishedAt - start

  await supabase
    .from('ai_simulations')
    .update({
      status: 'success',
      transcript,
      eval_score: evalResult?.score ?? null,
      eval_feedback: evalResult ? { per_criterion: evalResult.per_criterion } : null,
      duration_ms: durationMs,
    })
    .eq('id', input.simulationId)

  return { transcript, evalResult, durationMs, totalCostUsd }
}

async function evaluateTranscript(
  transcript: TranscriptEntry[],
  criteria: EvalCriterion[],
): Promise<EvalResult> {
  const transcriptText = transcript
    .map((t) => `${t.role === 'user' ? 'Cliente' : 'IA'}: ${t.content}`)
    .join('\n')

  const criteriaList = criteria
    .map((c, i) => `${i + 1}. (${c.id}) ${c.description}`)
    .join('\n')

  const evalModel = process.env.AI_EVALUATOR_MODEL || 'anthropic/claude-haiku-4-5'

  const result = await complete({
    model: evalModel,
    messages: [
      {
        role: 'system',
        content:
          'Você é um avaliador de conversas de IA. Para cada critério dado, decida se a IA cumpriu (passed) ou não (failed) baseado na transcrição. Responda APENAS em JSON válido no formato {"per_criterion":[{"id":"...","passed":true|false,"reason":"..."}]}',
      },
      {
        role: 'user',
        content: `Transcrição:\n${transcriptText}\n\nCritérios:\n${criteriaList}\n\nResponda em JSON puro.`,
      },
    ],
    temperature: 0.0,
    maxTokens: 1500,
  })

  let parsed: { per_criterion: Array<{ id: string; passed: boolean; reason: string }> } = {
    per_criterion: [],
  }
  try {
    const cleanContent = result.content.replace(/```json|```/g, '').trim()
    parsed = JSON.parse(cleanContent)
  } catch {
    // se o avaliador retornou texto livre, todos os critérios viram failed
    parsed = {
      per_criterion: criteria.map((c) => ({
        id: c.id,
        passed: false,
        reason: 'avaliador retornou JSON inválido',
      })),
    }
  }

  const total = parsed.per_criterion.length || 1
  const passedCount = parsed.per_criterion.filter((p) => p.passed).length
  // score 1-5 proporcional
  const score = Math.round((passedCount / total) * 4) + 1

  return { score, per_criterion: parsed.per_criterion }
}
