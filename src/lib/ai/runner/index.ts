// =============================================
// AgentRunner monolítico (F1). Carrega o agente publicado, monta o prompt
// (Identidade + Comportamento + Variáveis + Anti-Golpe), chama a LLM,
// persiste a execução em `ai_executions` e atualiza a memória da conversa.
//
// F2+: tool-loop, multi-modal, RAG.
// F6: pipeline_mode='multi_agent' com classifier + retriever em paralelo.
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { complete } from '../llm/client'
import { buildSystemPrompt } from '../prompt/system-builder'
import { loadMemory, saveMemory } from '../memory/window'
import { retrieveRelevantChunks } from './retrieval'
import type { Agent, RunnerInput, RunnerOutput } from '../types'

export class AgentNotPublishedError extends Error {
  constructor(agentId: string) {
    super(`Agente ${agentId} não encontrado ou não está publicado`)
    this.name = 'AgentNotPublishedError'
  }
}

export async function runAgent(input: RunnerInput): Promise<RunnerOutput> {
  const supabase = getSupabaseAdmin()
  const start = Date.now()

  // 1. Carrega agente publicado
  const { data: agent, error } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('id', input.agentId)
    .eq('status', 'published')
    .maybeSingle()
  if (error || !agent) throw new AgentNotPublishedError(input.agentId)
  const typedAgent = agent as Agent

  // 2. Carrega memória
  const memory = await loadMemory(input.conversationId, input.agentId)

  // 3. RAG retrieval — usa a última leva de mensagens do usuário como query
  const ragQuery = input.newMessages.map((m) => m.content).join(' ').trim()
  const retrieval = await retrieveRelevantChunks({
    agentId: input.agentId,
    query: ragQuery,
  })

  // 4. Monta prompt: system + (rolling summary) + (RAG context) + memória + novas mensagens
  const systemPrompt = buildSystemPrompt(typedAgent)
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system' as const, content: systemPrompt },
  ]
  if (memory.summary && memory.summary.trim()) {
    messages.push({
      role: 'system' as const,
      content: `Resumo de conversas anteriores:\n${memory.summary}`,
    })
  }
  if (retrieval.contextBlock) {
    messages.push({ role: 'system' as const, content: retrieval.contextBlock })
  }
  memory.window_messages.forEach((m) => {
    messages.push({ role: m.role, content: m.content })
  })
  input.newMessages.forEach((m) => {
    messages.push({ role: 'user' as const, content: m.content })
  })

  // 4. Chama LLM
  const llmConfig = typedAgent.llm_config
  const result = await complete({
    model: llmConfig.model,
    messages,
    temperature: llmConfig.temperature,
    maxTokens: llmConfig.max_tokens,
  })

  // 5. Persiste execução para tracing
  const { data: execution } = await supabase
    .from('ai_executions')
    .insert({
      organization_id: typedAgent.organization_id,
      agent_id: typedAgent.id,
      agent_version_id: typedAgent.current_version_id,
      conversation_id: input.conversationId,
      started_at: new Date(start).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
      input: { messages: input.newMessages },
      llm_calls: [
        {
          agent_role: 'writer',
          model: result.model,
          tokens_in: result.tokensIn,
          tokens_out: result.tokensOut,
          latency_ms: result.durationMs,
          cost_usd: result.costUsd,
        },
      ],
      tool_calls: [],
      retrieval_calls: retrieval.results.map((r) => ({
        chunk_id: r.chunk_id,
        source_id: r.source_id,
        layer: r.layer,
        similarity: r.similarity,
      })),
      final_output: result.content,
      final_messages_sent: 1,
      tokens_total_in: result.tokensIn,
      tokens_total_out: result.tokensOut,
      cost_total_usd: result.costUsd,
    })
    .select('id')
    .single()

  // 6. Atualiza memória
  await saveMemory(input.conversationId, input.agentId, typedAgent.organization_id, {
    ...memory,
    window_messages: [
      ...memory.window_messages,
      ...input.newMessages.map((m) => ({
        role: 'user' as const,
        content: m.content,
        tokens: 0,
        timestamp: m.created_at,
      })),
      {
        role: 'assistant' as const,
        content: result.content,
        tokens: result.tokensOut,
        timestamp: new Date().toISOString(),
      },
    ],
  })

  return {
    replyText: result.content,
    executionId: execution?.id ?? '',
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costUsd: result.costUsd,
    durationMs: Date.now() - start,
    splitMessages: !!typedAgent.persona?.split_messages,
    replyDelaySeconds: typedAgent.persona?.reply_delay_seconds ?? 2,
  }
}
