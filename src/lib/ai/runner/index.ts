// =============================================
// AgentRunner monolítico (F1+F2). Carrega o agente publicado, monta o
// prompt (Identidade + Comportamento + Variáveis + Anti-Golpe + RAG +
// Summary), executa um tool-loop simples até o LLM finalizar (ou bater
// MAX_TOOL_ITER), persiste a execução em `ai_executions` e atualiza a
// memória da conversa.
//
// F6: pipeline_mode='multi_agent' com classifier + retriever em paralelo.
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { complete, type ChatMessage, type ChatTool } from '../llm/client'
import { buildSystemPrompt } from '../prompt/system-builder'
import { loadMemory, saveMemory } from '../memory/window'
import { retrieveRelevantChunks } from './retrieval'
import { getBuiltinTool } from '../tools/builtins'
import type { Agent, RunnerInput, RunnerOutput } from '../types'
import type { ToolCallExecution, ToolContext } from '../tools/types'

const MAX_TOOL_ITER = 4

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

  // 1.b) Carrega tools habilitadas pra esse agente
  const { data: agentTools } = await supabase
    .from('ai_agent_tools')
    .select('id, tool_type, name, description, config, enabled')
    .eq('agent_id', input.agentId)
    .eq('enabled', true)

  const enabledTools = (agentTools ?? [])
    .map((row) => {
      const def = getBuiltinTool(row.tool_type as string)
      if (!def) return null
      return { row, def }
    })
    .filter((t): t is { row: any; def: ReturnType<typeof getBuiltinTool> & object } => !!t)

  const llmTools: ChatTool[] = enabledTools.map(({ def }) => ({
    type: 'function' as const,
    function: {
      name: def!.name,
      description: def!.description,
      parameters: def!.parameters as Record<string, unknown>,
    },
  }))

  // 1.c) Resolve contactId pra ToolContext (necessário para save_lead_field)
  const { data: convRow } = await supabase
    .from('whatsapp_conversations')
    .select('id, contact_id, phone_number')
    .eq('id', input.conversationId)
    .maybeSingle()

  // 2. Carrega memória
  const memory = await loadMemory(input.conversationId, input.agentId)

  // 3. RAG retrieval — usa a última leva de mensagens do usuário como query
  const ragQuery = input.newMessages.map((m) => m.content).join(' ').trim()
  const retrieval = await retrieveRelevantChunks({
    agentId: input.agentId,
    query: ragQuery,
  })

  // 4. Monta prompt
  const systemPrompt = buildSystemPrompt(typedAgent)
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
  ]
  if (memory.summary && memory.summary.trim()) {
    messages.push({
      role: 'system',
      content: `Resumo de conversas anteriores:\n${memory.summary}`,
    })
  }
  if (retrieval.contextBlock) {
    messages.push({ role: 'system', content: retrieval.contextBlock })
  }
  memory.window_messages.forEach((m) => {
    messages.push({ role: m.role, content: m.content })
  })
  input.newMessages.forEach((m) => {
    messages.push({ role: 'user', content: m.content })
  })

  // 5. Tool-loop
  const llmConfig = typedAgent.llm_config
  const llmCalls: Array<{
    agent_role: string
    model: string
    tokens_in: number
    tokens_out: number
    latency_ms: number
    cost_usd: number
  }> = []
  const executedTools: ToolCallExecution[] = []
  let totalTokensIn = 0
  let totalTokensOut = 0
  let totalCostUsd = 0
  let finalContent = ''
  let stoppedByTool: 'transferred' | 'converted' | 'escalated' | undefined

  for (let iter = 0; iter < MAX_TOOL_ITER; iter++) {
    const result = await complete({
      model: llmConfig.model,
      messages,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.max_tokens,
      tools: llmTools.length > 0 ? llmTools : undefined,
    })
    totalTokensIn += result.tokensIn
    totalTokensOut += result.tokensOut
    totalCostUsd += result.costUsd
    llmCalls.push({
      agent_role: iter === 0 ? 'writer' : 'tool_followup',
      model: result.model,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      latency_ms: result.durationMs,
      cost_usd: result.costUsd,
    })

    const toolCalls = result.toolCalls ?? []
    if (toolCalls.length === 0) {
      // resposta final
      finalContent = result.content
      break
    }

    // Anexa a mensagem assistant com tool_calls
    messages.push({
      role: 'assistant',
      content: result.content,
      tool_calls: toolCalls,
    })

    // Executa cada tool e anexa resultado
    let aborted = false
    for (const tc of toolCalls) {
      const enabled = enabledTools.find(({ def }) => def!.name === tc.function.name)
      if (!enabled) {
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.function.name,
          content: JSON.stringify({ ok: false, error: 'tool_not_enabled' }),
        })
        continue
      }
      const ctx: ToolContext = {
        organizationId: typedAgent.organization_id,
        conversationId: input.conversationId,
        agentId: input.agentId,
        contactId: (convRow?.contact_id as string | null) ?? null,
        phoneNumber: (convRow?.phone_number as string | null) ?? null,
        config: (enabled.row.config as Record<string, unknown>) ?? {},
      }
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(tc.function.arguments || '{}')
      } catch {
        args = {}
      }
      const tStart = Date.now()
      let handlerResult: import('../tools/types').ToolHandlerResult
      try {
        handlerResult = await enabled.def!.handler(args, ctx)
      } catch (err) {
        handlerResult = { ok: false, error: err instanceof Error ? err.message : 'unknown' }
      }
      executedTools.push({
        toolCallId: tc.id,
        toolType: enabled.row.tool_type,
        args,
        result: handlerResult,
        durationMs: Date.now() - tStart,
      })
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.function.name,
        content: JSON.stringify(handlerResult.data ?? handlerResult),
      })
      if (handlerResult.shouldStop) {
        finalContent = result.content || (handlerResult.outcome === 'transferred'
          ? 'Já estou transferindo você para um atendente. Um momento!'
          : '')
        stoppedByTool = handlerResult.outcome
        aborted = true
        break
      }
    }
    if (aborted) break
  }

  // 6. Persiste execução para tracing
  const finishedAt = new Date()
  const outcome = stoppedByTool ?? null
  const { data: execution } = await supabase
    .from('ai_executions')
    .insert({
      organization_id: typedAgent.organization_id,
      agent_id: typedAgent.id,
      agent_version_id: typedAgent.current_version_id,
      conversation_id: input.conversationId,
      started_at: new Date(start).toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - start,
      input: { messages: input.newMessages },
      llm_calls: llmCalls,
      tool_calls: executedTools.map((t) => ({
        tool_type: t.toolType,
        args: t.args,
        ok: t.result.ok,
        error: t.result.error ?? null,
        outcome: t.result.outcome ?? null,
        duration_ms: t.durationMs,
      })),
      retrieval_calls: retrieval.results.map((r) => ({
        chunk_id: r.chunk_id,
        source_id: r.source_id,
        layer: r.layer,
        similarity: r.similarity,
      })),
      final_output: finalContent,
      final_messages_sent: 1,
      outcome,
      tokens_total_in: totalTokensIn,
      tokens_total_out: totalTokensOut,
      cost_total_usd: totalCostUsd,
    })
    .select('id')
    .single()

  // 7. Atualiza usage_stats das tools chamadas
  for (const exec of executedTools) {
    const tool = enabledTools.find(({ def }) => def!.type === exec.toolType)
    if (!tool) continue
    const stats = (tool.row.usage_stats as Record<string, any>) ?? {}
    const totalCalls = (stats.total_calls ?? 0) + 1
    const totalFailures = (stats.total_failures ?? 0) + (exec.result.ok ? 0 : 1)
    const prevAvg = stats.avg_latency_ms ?? 0
    const avgLatency = Math.round((prevAvg * (totalCalls - 1) + exec.durationMs) / totalCalls)
    await supabase
      .from('ai_agent_tools')
      .update({
        usage_stats: {
          total_calls: totalCalls,
          total_failures: totalFailures,
          avg_latency_ms: avgLatency,
          last_used_at: new Date().toISOString(),
        },
      })
      .eq('id', tool.row.id)
  }

  // 8. Atualiza memória
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
        content: finalContent,
        tokens: totalTokensOut,
        timestamp: new Date().toISOString(),
      },
    ],
  })

  return {
    replyText: finalContent,
    executionId: execution?.id ?? '',
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    costUsd: totalCostUsd,
    durationMs: Date.now() - start,
    splitMessages: !!typedAgent.persona?.split_messages,
    replyDelaySeconds: typedAgent.persona?.reply_delay_seconds ?? 2,
  }
}
