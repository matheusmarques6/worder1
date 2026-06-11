// =====================================================
// MOTOR PRINCIPAL DO AGENTE DE IA
// Orquestra todo o fluxo de processamento
// =====================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  AIAgent,
  AgentAction,
  EngineConfig,
  EngineContext,
  EngineMessage,
  EngineResponse,
  UsageLog,
} from './types'
import { RAGService, createRAGService } from './rag'
import { ActionsEngine } from './actions-engine'
import { PromptBuilder, formatRAGAsContext } from './prompt-builder'
import { callAI, AIProvider } from '@/lib/whatsapp/ai-providers'
import { getActiveTools } from './tools/registry'
import { runToolLoop } from './tools/loop'
import { trackAiUsage } from './cost-tracker'
import { checkAiBudget, AiBudgetExceededError } from './budget'

// =====================================================
// AI AGENT ENGINE CLASS
// =====================================================

export class AIAgentEngine {
  private agent: AIAgent
  private organizationId: string
  private supabase: SupabaseClient
  private ragService: RAGService
  private actionsEngine: ActionsEngine | null = null
  private promptBuilder: PromptBuilder
  private apiKey: string
  private baseUrl?: string

  constructor(config: EngineConfig) {
    this.agent = config.agent
    this.organizationId = config.organizationId
    this.apiKey = config.apiKey
    this.baseUrl = config.baseUrl

    // Usar cliente centralizado (lazy loaded)
    this.supabase = supabaseAdmin as unknown as SupabaseClient
    this.ragService = createRAGService()
    this.promptBuilder = new PromptBuilder(this.agent)
  }

  /**
   * Processa uma mensagem e retorna a resposta
   */
  async processMessage(context: EngineContext): Promise<EngineResponse> {
    const startTime = Date.now()
    const { conversationId, conversationHistory, contactInfo } = context
    const currentMessage = conversationHistory[conversationHistory.length - 1]?.content || ''

    try {
      // 1. Validar agente
      if (!this.agent.is_active) {
        throw new Error('Agente não está ativo')
      }

      // 2. Verificar horário de funcionamento
      if (!this.checkSchedule()) {
        throw new Error('Fora do horário de atendimento')
      }

      // 2b. Verificar budget mensal (lança AiBudgetExceededError se excedido)
      await checkAiBudget(this.organizationId, { throwOnExceeded: true })

      // 3. Carregar ações e criar engine
      const actions = await this.loadActions()
      if (actions.length > 0) {
        this.actionsEngine = new ActionsEngine(actions, this.apiKey)
      }

      // 4. Avaliar ações (When/Do)
      let actionInstructions: string[] = []
      let actionResult = null

      if (this.actionsEngine) {
        actionResult = await this.actionsEngine.evaluate({
          message: currentMessage,
          conversationHistory: conversationHistory as EngineMessage[],
          contactInfo,
        })

        if (actionResult) {
          // Verificar se deve parar (transfer ou exact_message)
          if (actionResult.should_stop) {
            // Transfer
            if (actionResult.result?.transfer) {
              return this.buildTransferResponse(actionResult, startTime)
            }

            // Exact message
            if (actionResult.result?.exact_message) {
              return this.buildExactMessageResponse(actionResult, startTime)
            }
          }

          // Coletar instruções para incluir no prompt
          if (actionResult.instructions) {
            actionInstructions = actionResult.instructions
          }
        }
      }

      // 4b. Resolver tools ativas (Fase 2b). Só roda o tool-loop quando há
      // toolContext (passado pelo runner) E o agente tem tools habilitadas.
      const toolContext = context.toolContext
      const activeTools = toolContext
        ? getActiveTools(this.agent as any, { storeId: toolContext.storeId })
        : []
      const useTools = activeTools.length > 0
      const hasSearchKnowledge = activeTools.some(t => t.name === 'search_knowledge')

      // 5. Busca RAG (knowledge base)
      // RAG CONDICIONAL: quando search_knowledge está ativa, NÃO pré-injetamos
      // o RAG (a IA busca sob demanda via tool). Caso contrário, mantemos a
      // pré-injeção (comportamento atual, não quebra agentes sem tools).
      let ragResults: Awaited<ReturnType<RAGService['search']>> = []
      if (!hasSearchKnowledge) {
        ragResults = await this.ragService.search({
          agentId: this.agent.id,
          query: currentMessage,
          topK: 5,
          threshold: 0.7,
        })
      }

      const ragContext = ragResults.length > 0
        ? formatRAGAsContext(ragResults)
        : undefined

      // 6. Construir prompt
      const { systemPrompt, messages } = this.promptBuilder.build({
        ragContext,
        conversationHistory: conversationHistory as EngineMessage[],
        currentMessage,
        contactInfo,
        actionInstructions,
      })

      const responseTimeMs0 = startTime
      const sourcesUsed = ragResults.map(r => r.source_id)
      const actionsTriggered = actionResult ? [actionResult.action_id] : []

      // 7. Chamar LLM — tool-loop (se há tools ativas) ou callAI simples.
      if (useTools && toolContext) {
        const loopResult = await runToolLoop({
          providerConfig: {
            provider: this.agent.provider as AIProvider,
            apiKey: this.apiKey,
            model: this.agent.model,
            systemPrompt,
            temperature: this.agent.temperature,
            maxTokens: this.agent.max_tokens,
            baseUrl: this.baseUrl,
          },
          messages: messages.map(m => ({
            role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
            content: m.content,
          })),
          tools: activeTools,
          context: toolContext,
        })

        const response = this.postProcessResponse(loopResult.text || '')
        const responseTimeMs = Date.now() - responseTimeMs0

        await this.logUsage({
          conversationId,
          inputTokens: 0,
          outputTokens: 0,
          responseTimeMs,
          sourcesUsed,
          actionsTriggered,
          success: true,
        })

        return {
          response,
          sources_used: sourcesUsed,
          actions_triggered: actionsTriggered,
          tokens_used: loopResult.tokens,
          response_time_ms: responseTimeMs,
          was_transferred: loopResult.transferred,
          action_result: actionResult || undefined,
          tool_calls: loopResult.toolCalls.map(c => ({
            name: c.name,
            args: c.args,
            result: c.result,
          })),
          stopped_by: loopResult.stoppedBy,
        }
      }

      const llmResponse = await callAI(
        {
          provider: this.agent.provider as AIProvider,
          apiKey: this.apiKey,
          model: this.agent.model,
          systemPrompt,
          temperature: this.agent.temperature,
          maxTokens: this.agent.max_tokens,
          baseUrl: this.baseUrl,
        },
        messages.map(m => ({ role: m.role as any, content: m.content }))
      )

      // 8. Pós-processamento
      const response = this.postProcessResponse(llmResponse.content)

      // 9. Registrar uso
      const responseTimeMs = Date.now() - responseTimeMs0

      await this.logUsage({
        conversationId,
        inputTokens: llmResponse.usage?.promptTokens || 0,
        outputTokens: llmResponse.usage?.completionTokens || 0,
        responseTimeMs,
        sourcesUsed,
        actionsTriggered,
        success: true,
      })

      return {
        response,
        sources_used: sourcesUsed,
        actions_triggered: actionsTriggered,
        tokens_used: llmResponse.usage?.totalTokens || 0,
        response_time_ms: responseTimeMs,
        was_transferred: false,
        action_result: actionResult || undefined,
      }

    } catch (error: any) {
      const responseTimeMs = Date.now() - startTime
      
      // Registrar erro
      await this.logUsage({
        conversationId,
        inputTokens: 0,
        outputTokens: 0,
        responseTimeMs,
        sourcesUsed: [],
        actionsTriggered: [],
        success: false,
        errorMessage: error.message,
      })

      throw error
    }
  }

  /**
   * Verifica se está dentro do horário de funcionamento
   */
  private checkSchedule(): boolean {
    const schedule = this.agent.settings?.schedule
    
    if (!schedule || schedule.always_active) {
      return true
    }

    const now = new Date()
    const tz = schedule.timezone || 'America/Sao_Paulo'
    
    // Converter para timezone configurado
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    
    const timeString = formatter.format(now)
    const [hours, minutes] = timeString.split(':').map(Number)
    const currentTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`

    // Verificar horário
    const { start, end } = schedule.hours || { start: '08:00', end: '18:00' }
    const inTimeRange = currentTime >= start && currentTime <= end

    // Verificar dia da semana
    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
    })
    const dayName = dayFormatter.format(now).toLowerCase()
    const dayMap: Record<string, string> = {
      sun: 'sun', mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat',
    }
    const today = dayMap[dayName]

    const days = schedule.days || ['mon', 'tue', 'wed', 'thu', 'fri']
    const inDayRange = days.includes(today)

    return inTimeRange && inDayRange
  }

  /**
   * Carrega ações do agente
   */
  private async loadActions(): Promise<AgentAction[]> {
    const { data: actions, error } = await this.supabase
      .from('ai_agent_actions')
      .select('*')
      .eq('agent_id', this.agent.id)
      .eq('is_active', true)
      .order('priority', { ascending: true })

    if (error) {
      console.error('Error loading actions:', error)
      return []
    }

    return actions || []
  }

  /**
   * Constrói resposta de transferência
   */
  private buildTransferResponse(actionResult: any, startTime: number): EngineResponse {
    return {
      response: '',
      sources_used: [],
      actions_triggered: [actionResult.action_id],
      tokens_used: 0,
      response_time_ms: Date.now() - startTime,
      was_transferred: true,
      transfer_to: actionResult.result.transfer_to,
      action_result: actionResult,
    }
  }

  /**
   * Constrói resposta com mensagem exata
   */
  private buildExactMessageResponse(actionResult: any, startTime: number): EngineResponse {
    return {
      response: actionResult.result.exact_message,
      sources_used: [],
      actions_triggered: [actionResult.action_id],
      tokens_used: 0,
      response_time_ms: Date.now() - startTime,
      was_transferred: false,
      action_result: actionResult,
    }
  }

  /**
   * Pós-processa a resposta da LLM
   */
  private postProcessResponse(response: string): string {
    let processed = response

    // Remover markdown
    processed = processed
      .replace(/\*\*(.*?)\*\*/g, '$1')  // Bold
      .replace(/\*(.*?)\*/g, '$1')       // Italic
      .replace(/`(.*?)`/g, '$1')         // Code
      .replace(/#{1,6}\s/g, '')          // Headers
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links

    // Remover linhas em branco extras
    processed = processed.replace(/\n{3,}/g, '\n\n')

    // Trim
    processed = processed.trim()

    return processed
  }

  /**
   * Registra uso via trackAiUsage (colunas corretas de ai_usage_logs).
   * Colunas legadas (input_tokens, output_tokens, estimated_cost_cents) foram
   * substituídas por prompt_tokens, completion_tokens, cost_usd via cost-tracker.
   */
  private async logUsage(params: {
    conversationId?: string
    inputTokens: number
    outputTokens: number
    responseTimeMs: number
    sourcesUsed: string[]
    actionsTriggered: string[]
    success: boolean
    errorMessage?: string
  }): Promise<void> {
    await trackAiUsage({
      organizationId: this.organizationId,
      provider: this.agent.provider,
      model: this.agent.model,
      feature: 'whatsapp_agent',
      agentId: this.agent.id,
      conversationId: params.conversationId,
      promptTokens: params.inputTokens,
      completionTokens: params.outputTokens,
      durationMs: params.responseTimeMs,
      success: params.success,
      error: params.errorMessage,
      metadata: {
        chunks_used: params.sourcesUsed.length,
        sources_used: params.sourcesUsed,
        actions_triggered: params.actionsTriggered,
      },
    })

    // Atualizar estatísticas do agente (best-effort)
    if (params.success) {
      const totalTokens = params.inputTokens + params.outputTokens
      const { error: rpcError } = await this.supabase.rpc('update_agent_stats', {
        p_agent_id: this.agent.id,
        p_tokens: totalTokens,
        p_response_time: params.responseTimeMs,
      })

      // Se RPC não existe, fazer update manual (best-effort, sem .catch() inválido)
      if (rpcError) {
        this.supabase
          .from('ai_agents')
          .update({
            total_messages: this.agent.total_messages + 1,
            total_tokens_used: this.agent.total_tokens_used + totalTokens,
          })
          .eq('id', this.agent.id)
          .then(() => {/* best-effort, não falhar */}, () => {/* ignorar erro */})
      }
    }
  }
}

// =====================================================
// FUNÇÕES HELPER
// =====================================================

/**
 * Cria instância do engine para um agente
 */
export async function createAgentEngine(
  agentId: string,
  organizationId: string
): Promise<AIAgentEngine> {
  // Usar cliente centralizado
  const supabase = supabaseAdmin

  // Buscar agente
  const { data: agent, error } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('id', agentId)
    .eq('organization_id', organizationId)
    .single()

  if (error || !agent) {
    throw new Error('Agente não encontrado')
  }

  // Buscar API key do provider em organization_api_keys (tabela correta;
  // 'api_keys' legacy era pra API keys do Worder, schema diferente).
  const { data: apiKeyData } = await supabase
    .from('organization_api_keys')
    .select('api_key, base_url, is_active')
    .eq('organization_id', organizationId)
    .eq('provider', agent.provider)
    .eq('is_active', true)
    .maybeSingle()

  const apiKey = apiKeyData?.api_key || process.env.OPENAI_API_KEY || ''
  const baseUrl = apiKeyData?.base_url || undefined

  if (!apiKey) {
    throw new Error(`API key não configurada para provider: ${agent.provider}`)
  }

  return new AIAgentEngine({
    agent,
    organizationId,
    apiKey,
    baseUrl,
  })
}

/**
 * Processa mensagem com agente (função de conveniência)
 */
export async function processWithAgent(
  agentId: string,
  organizationId: string,
  message: string,
  conversationHistory: EngineMessage[] = [],
  conversationId?: string
): Promise<EngineResponse> {
  const engine = await createAgentEngine(agentId, organizationId)
  
  return engine.processMessage({
    conversationId: conversationId || 'test',
    conversationHistory: [
      ...conversationHistory,
      { role: 'user', content: message },
    ],
  })
}
