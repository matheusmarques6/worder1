// =====================================================
// TOOL LOOP — orquestração provider-agnóstica (Fase 2b / P2)
// =====================================================
// Itera entre o LLM e os handlers de tools até obter resposta final ou atingir
// um cap (iterações / tokens). Reusa o dispatcher callAIWithTools de
// ai-providers.ts (não duplica fetch). Trata 429 (rate-limit) e sinais de
// controle (transfer/stop) com abort gracioso.

import {
  callAIWithTools,
  AIProvider,
  ProviderTool,
  ToolLoopMessage,
  ProviderToolCall,
} from '@/lib/whatsapp/ai-providers'
import type { Tool, ToolContext, ToolResultPayload } from './types'

export interface ToolLoopProviderConfig {
  provider: AIProvider
  apiKey: string
  model: string
  systemPrompt: string
  temperature?: number
  maxTokens?: number
}

export interface ToolLoopCaps {
  /** nº máximo de rodadas LLM (default ~4). */
  maxIterations?: number
  /** teto de tokens acumulados no turno (default 12000). */
  maxTokens?: number
}

export interface ToolLoopCall {
  name: string
  args: any
  result: ToolResultPayload
}

export type StoppedBy =
  | 'final' // modelo respondeu sem pedir mais tools
  | 'max_iterations'
  | 'max_tokens'
  | 'rate_limited'
  | 'control_stop' // handler pediu stop/transfer
  | 'unknown_tool'

export interface ToolLoopResult {
  text: string
  toolCalls: ToolLoopCall[]
  tokens: number
  stoppedBy: StoppedBy
  transferred: boolean
  rateLimited: boolean
}

export interface RunToolLoopParams {
  providerConfig: ToolLoopProviderConfig
  /** histórico de chat (sem system; o system vai em providerConfig.systemPrompt). */
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  tools: Tool[]
  context: ToolContext
  caps?: ToolLoopCaps
}

const DEFAULT_MAX_ITERATIONS = 4
const DEFAULT_MAX_TOKENS = 12000

function toProviderTools(tools: Tool[]): ProviderTool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  }))
}

export async function runToolLoop(params: RunToolLoopParams): Promise<ToolLoopResult> {
  const { providerConfig, messages, tools, context, caps } = params
  const maxIterations = caps?.maxIterations ?? DEFAULT_MAX_ITERATIONS
  const maxTokens = caps?.maxTokens ?? DEFAULT_MAX_TOKENS

  const toolMap = new Map(tools.map((t) => [t.name, t]))
  const providerTools = toProviderTools(tools)

  // Histórico no formato neutro do loop. System vai como primeira msg 'system'.
  const loopMessages: ToolLoopMessage[] = [
    { role: 'system', content: providerConfig.systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  const aggregatedCalls: ToolLoopCall[] = []
  let totalTokens = 0
  let finalText = ''
  let transferred = false

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Cap de tokens ANTES de chamar de novo (abort gracioso).
    if (totalTokens >= maxTokens) {
      return {
        text: finalText,
        toolCalls: aggregatedCalls,
        tokens: totalTokens,
        stoppedBy: 'max_tokens',
        transferred,
        rateLimited: false,
      }
    }

    let step
    try {
      step = await callAIWithTools(
        {
          provider: providerConfig.provider,
          apiKey: providerConfig.apiKey,
          model: providerConfig.model,
          systemPrompt: providerConfig.systemPrompt,
          temperature: providerConfig.temperature,
          maxTokens: providerConfig.maxTokens,
        },
        loopMessages,
        providerTools,
      )
    } catch (err: any) {
      // Erro de transporte/parse: abortar gracioso com o que temos.
      console.error('[tool-loop] erro na chamada ao provedor:', err?.message)
      return {
        text: finalText,
        toolCalls: aggregatedCalls,
        tokens: totalTokens,
        stoppedBy: 'final',
        transferred,
        rateLimited: false,
      }
    }

    totalTokens += step.usage?.totalTokens || 0

    // 429 / rate-limit: abort gracioso, sinaliza no retorno (runner loga no trace).
    if (step.rateLimited) {
      return {
        text: finalText,
        toolCalls: aggregatedCalls,
        tokens: totalTokens,
        stoppedBy: 'rate_limited',
        transferred,
        rateLimited: true,
      }
    }

    if (step.content) finalText = step.content

    // Sem tool calls => resposta final.
    if (!step.toolCalls || step.toolCalls.length === 0) {
      return {
        text: finalText,
        toolCalls: aggregatedCalls,
        tokens: totalTokens,
        stoppedBy: 'final',
        transferred,
        rateLimited: false,
      }
    }

    // Registrar o turno do assistant (texto + tool_use) no histórico.
    loopMessages.push({
      role: 'assistant',
      content: step.content || undefined,
      toolCalls: step.toolCalls,
    })

    // Executar cada tool call.
    const toolResultsForProvider: Array<{ id: string; name: string; result: any }> = []
    let shouldStop = false
    let unknownTool = false

    for (const call of step.toolCalls as ProviderToolCall[]) {
      const tool = toolMap.get(call.name)
      let payload: ToolResultPayload

      if (!tool) {
        payload = { ok: false, error: `unknown_tool: ${call.name}` }
        unknownTool = true
      } else {
        try {
          payload = await tool.handler(context, call.args || {})
        } catch (err: any) {
          payload = { ok: false, error: err?.message || 'tool_handler_error' }
        }
      }

      aggregatedCalls.push({ name: call.name, args: call.args, result: payload })
      toolResultsForProvider.push({ id: call.id, name: call.name, result: payload })

      if (payload.control?.transfer) transferred = true
      if (payload.control?.stop || payload.control?.transfer) shouldStop = true
    }

    // Anexar os resultados das tools ao histórico.
    loopMessages.push({ role: 'tool', toolResults: toolResultsForProvider })

    // Sinal de controle (transfer/stop): encerrar imediatamente.
    if (shouldStop) {
      return {
        text: finalText,
        toolCalls: aggregatedCalls,
        tokens: totalTokens,
        stoppedBy: 'control_stop',
        transferred,
        rateLimited: false,
      }
    }

    if (unknownTool) {
      // Modelo pediu tool inexistente; deixamos o próximo turno corrigir, mas
      // se foi o único conteúdo, marcamos para diagnóstico no fim do loop.
    }
  }

  // Excedeu maxIterations sem resposta final limpa.
  return {
    text: finalText,
    toolCalls: aggregatedCalls,
    tokens: totalTokens,
    stoppedBy: 'max_iterations',
    transferred,
    rateLimited: false,
  }
}
