// =====================================================
// MOTOR DE AÇÕES (WHEN/DO RULES)
// Processa regras condicionais do agente
// =====================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  AgentAction,
  ActionCondition,
  ActionDo,
  ActionExecutionResult,
  EngineMessage,
  ContactInfo,
} from './types'
import { detectIntent, detectIntentSimple } from './intent-detector'
import { analyzeSentiment, analyzeSentimentSimple } from './sentiment-analyzer'

// =====================================================
// ACTIONS ENGINE CLASS
// =====================================================

export class ActionsEngine {
  private actions: AgentAction[]
  private openaiKey: string | null
  private supabase: SupabaseClient

  constructor(actions: AgentAction[], openaiKey?: string) {
    this.actions = actions.filter(a => a.is_active).sort((a, b) => a.priority - b.priority)
    this.openaiKey = openaiKey || process.env.OPENAI_API_KEY || null

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
      throw new Error('Supabase não configurado')
    }

    this.supabase = createClient(url, key)
  }

  /**
   * Avalia todas as ações e executa a primeira que corresponder
   */
  async evaluate(params: {
    message: string
    conversationHistory: EngineMessage[]
    contactInfo?: ContactInfo
  }): Promise<ActionExecutionResult | null> {
    const { message, conversationHistory, contactInfo } = params

    if (!this.actions || this.actions.length === 0) {
      return null
    }

    // Cache de detecções para evitar chamadas repetidas
    let detectedIntent: Awaited<ReturnType<typeof detectIntent>> | null = null
    let detectedSentiment: Awaited<ReturnType<typeof analyzeSentiment>> | null = null

    for (const action of this.actions) {
      try {
        const conditionsMet = await this.checkConditions(
          action.conditions,
          message,
          conversationHistory,
          contactInfo,
          // Passar referências para cache
          { getIntent: async () => {
            if (!detectedIntent) {
              detectedIntent = this.openaiKey 
                ? await detectIntent(message, this.openaiKey)
                : detectIntentSimple(message)
            }
            return detectedIntent
          }, getSentiment: async () => {
            if (!detectedSentiment) {
              detectedSentiment = this.openaiKey
                ? await analyzeSentiment(message, this.openaiKey)
                : analyzeSentimentSimple(message)
            }
            return detectedSentiment
          }}
        )

        if (conditionsMet) {
          // Executar as ações
          const result = await this.executeActions(action)
          
          // Incrementar contador de vezes disparada
          await this.incrementTriggerCount(action.id)

          return result
        }
      } catch (error) {
        console.error(`Error evaluating action ${action.id}:`, error)
        // Continuar para próxima ação
      }
    }

    return null
  }

  /**
   * Verifica se todas as condições de uma ação são satisfeitas
   */
  private async checkConditions(
    conditions: AgentAction['conditions'],
    message: string,
    conversationHistory: EngineMessage[],
    contactInfo: ContactInfo | undefined,
    cache: {
      getIntent: () => Promise<any>
      getSentiment: () => Promise<any>
    }
  ): Promise<boolean> {
    if (!conditions?.items || conditions.items.length === 0) {
      return false
    }

    const results: boolean[] = []

    for (const condition of conditions.items) {
      const met = await this.checkSingleCondition(
        condition,
        message,
        conversationHistory,
        contactInfo,
        cache
      )
      results.push(met)
    }

    // Match type: 'all' = AND, 'any' = OR
    if (conditions.match_type === 'all') {
      return results.every(r => r)
    } else {
      return results.some(r => r)
    }
  }

  /**
   * Verifica uma única condição
   */
  private async checkSingleCondition(
    condition: ActionCondition,
    message: string,
    conversationHistory: EngineMessage[],
    contactInfo: ContactInfo | undefined,
    cache: { getIntent: () => Promise<any>; getSentiment: () => Promise<any> }
  ): Promise<boolean> {
    switch (condition.type) {
      case 'intent': {
        const detected = await cache.getIntent()
        const requiredIntent = condition.intent || condition.custom_intent
        if (!requiredIntent) return false
        
        return detected.intent === requiredIntent && detected.confidence >= 0.6
      }

      case 'sentiment': {
        if (!condition.sentiment) return false
        
        const detected = await cache.getSentiment()
        return detected.sentiment === condition.sentiment && detected.confidence >= 0.5
      }

      case 'contains': {
        if (!condition.keywords || condition.keywords.length === 0) return false
        
        const msgLower = message.toLowerCase()
        return condition.keywords.some(kw => msgLower.includes(kw.toLowerCase()))
      }

      case 'time': {
        if (!condition.time_range) return false
        
        const now = new Date()
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
        
        const inTimeRange = currentTime >= condition.time_range.start && 
                          currentTime <= condition.time_range.end

        // Verificar dia da semana se especificado
        if (condition.days && condition.days.length > 0) {
          const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
          const today = dayNames[now.getDay()]
          return inTimeRange && condition.days.includes(today)
        }

        return inTimeRange
      }

      case 'custom': {
        // Condições customizadas podem ser implementadas aqui
        return false
      }

      default:
        return false
    }
  }

  /**
   * Executa as ações de uma regra
   */
  private async executeActions(action: AgentAction): Promise<ActionExecutionResult> {
    const instructions: string[] = []
    let shouldStop = false
    let result: any = null

    for (const actionDo of action.actions) {
      const executionResult = await this.executeSingleAction(actionDo)
      
      if (executionResult.instruction) {
        instructions.push(executionResult.instruction)
      }
      
      if (executionResult.shouldStop) {
        shouldStop = true
        result = executionResult.result
        break
      }
    }

    return {
      action_id: action.id,
      action_type: action.actions[0]?.type || 'unknown',
      executed: true,
      result,
      should_stop: shouldStop,
      instructions,
    }
  }

  /**
   * Executa uma única ação
   */
  private async executeSingleAction(actionDo: ActionDo): Promise<{
    instruction?: string
    shouldStop: boolean
    result?: any
  }> {
    switch (actionDo.type) {
      case 'transfer':
        return {
          shouldStop: true,
          result: {
            transfer: true,
            transfer_to: actionDo.transfer_to,
            agent_id: actionDo.agent_id,
          },
        }

      case 'exact_message':
        return {
          shouldStop: true,
          result: {
            exact_message: actionDo.message,
          },
        }

      case 'use_source':
        return {
          instruction: `Use APENAS as informações da fonte específica (ID: ${actionDo.source_id}) para responder.`,
          shouldStop: false,
        }

      case 'ask_for':
        const field = actionDo.ask_field || actionDo.custom_field
        return {
          instruction: `Peça educadamente ao cliente para fornecer: ${field}`,
          shouldStop: false,
        }

      case 'dont_mention':
        return {
          instruction: `NUNCA mencione ou fale sobre: ${actionDo.topic}`,
          shouldStop: false,
        }

      case 'bring_up':
        return {
          instruction: `Se possível, traga o assunto ou mencione: ${actionDo.topic}`,
          shouldStop: false,
        }

      default:
        return { shouldStop: false }
    }
  }

  /**
   * Incrementa contador de vezes disparada
   */
  private async incrementTriggerCount(actionId: string): Promise<void> {
    try {
      await this.supabase.rpc('increment_action_trigger', {
        action_id: actionId,
      })
    } catch (error) {
      // Se RPC não existe, fazer update manual
      const { data: current } = await this.supabase
        .from('ai_agent_actions')
        .select('times_triggered')
        .eq('id', actionId)
        .single()

      await this.supabase
        .from('ai_agent_actions')
        .update({
          times_triggered: (current?.times_triggered || 0) + 1,
          last_triggered_at: new Date().toISOString(),
        })
        .eq('id', actionId)
    }
  }
}

// =====================================================
// FUNÇÕES HELPER
// =====================================================

/**
 * Cria instância do Actions Engine
 */
export function createActionsEngine(actions: AgentAction[]): ActionsEngine {
  return new ActionsEngine(actions)
}
