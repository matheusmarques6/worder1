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

  constructor(config: EngineConfig) {
    this.agent = config.agent
    this.organizationId = config.organizationId
    this.apiKey = config.apiKey

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

      // 5. Busca RAG (knowledge base)
      const ragResults = await this.ragService.search({
        agentId: this.agent.id,
        query: currentMessage,
        topK: 5,
        threshold: 0.7,
      })

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

      // 7. Chamar LLM
      const llmResponse = await callAI(
        {
          provider: this.agent.provider as AIProvider,
          apiKey: this.apiKey,
          model: this.agent.model,
          systemPrompt,
          temperature: this.agent.temperature,
          maxTokens: this.agent.max_tokens,
        },
        messages.map(m => ({ role: m.role as any, content: m.content }))
      )

      // 8. Pós-processamento
      const response = this.postProcessResponse(llmResponse.content)

      // 9. Registrar uso
      const responseTimeMs = Date.now() - startTime
      const sourcesUsed = ragResults.map(r => r.source_id)
      const actionsTriggered = actionResult ? [actionResult.action_id] : []

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
   * Registra uso para métricas
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
    try {
      const totalTokens = params.inputTokens + params.outputTokens
      
      // Calcular custo estimado (simplificado)
      const costPer1kInput = 0.00015  // GPT-4o-mini input
      const costPer1kOutput = 0.0006  // GPT-4o-mini output
      const estimatedCost = (params.inputTokens / 1000) * costPer1kInput + 
                           (params.outputTokens / 1000) * costPer1kOutput

      const usageLog: Partial<UsageLog> = {
        organization_id: this.organizationId,
        agent_id: this.agent.id,
        conversation_id: params.conversationId,
        provider: this.agent.provider,
        model: this.agent.model,
        input_tokens: params.inputTokens,
        output_tokens: params.outputTokens,
        total_tokens: totalTokens,
        estimated_cost_cents: Math.ceil(estimatedCost * 100),
        response_time_ms: params.responseTimeMs,
        chunks_used: params.sourcesUsed.length,
        sources_used: params.sourcesUsed,
        actions_triggered: params.actionsTriggered,
        success: params.success,
        error_message: params.errorMessage,
      }

      await this.supabase.from('ai_usage_logs').insert(usageLog)

      // Atualizar estatísticas do agente
      if (params.success) {
        const { error: rpcError } = await this.supabase.rpc('update_agent_stats', {
          p_agent_id: this.agent.id,
          p_tokens: totalTokens,
          p_response_time: params.responseTimeMs,
        })
        
        // Se RPC não existe, fazer update manual
        if (rpcError) {
          await this.supabase
            .from('ai_agents')
            .update({
              total_messages: this.agent.total_messages + 1,
              total_tokens_used: this.agent.total_tokens_used + totalTokens,
            })
            .eq('id', this.agent.id)
        }
      }

    } catch (error) {
      console.error('Error logging usage:', error)
      // Não falhar por erro de log
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

  // Buscar API key do provider
  const { data: apiKeyData } = await supabase
    .from('api_keys')
    .select('api_key')
    .eq('organization_id', organizationId)
    .eq('provider', agent.provider)
    .single()

  const apiKey = apiKeyData?.api_key || process.env.OPENAI_API_KEY || ''

  if (!apiKey) {
    throw new Error(`API key não configurada para provider: ${agent.provider}`)
  }

  return new AIAgentEngine({
    agent,
    organizationId,
    apiKey,
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
