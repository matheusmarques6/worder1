// =============================================
// Mappers entre o payload legado das rotas /api/ai/agents (system_prompt,
// provider, model, temperature, max_tokens, is_active) e o schema canônico
// `ai_agents` (identity.context, llm_config.*, status, etc).
//
// As rotas continuam aceitando AMBOS os formatos no body, sempre escrevem
// o canônico no banco e retornam um shape "híbrido" (canônico + campos
// legados derivados) para que UI/stores antigas sigam funcionando até
// migrarem.
// =============================================

import type {
  Agent,
  AgentBehavior,
  AgentEscalationRules,
  AgentIdentity,
  AgentLLMConfig,
  AgentPersonaV1,
  AgentRole,
  AgentSafety,
  AgentSettingsV1,
  AgentStatus,
} from './types'

const ROLE_FROM_LEGACY: Record<string, AgentRole> = {
  sales: 'sales',
  support: 'support',
  recovery: 'recovery',
  pre_sales: 'pre_sales',
  post_sales: 'post_sales',
  custom: 'custom',
}

const STATUS_FROM_LEGACY = (isActive: unknown): AgentStatus =>
  isActive === true ? 'published' : 'draft'

export interface AgentWriteInput {
  organization_id?: string
  name?: string
  description?: string | null
  store_id?: string | null
  role?: string
  status?: AgentStatus
  is_active?: boolean
  system_prompt?: string
  identity?: Partial<AgentIdentity>
  behavior?: Partial<AgentBehavior>
  persona?: Partial<AgentPersonaV1> & {
    role_description?: string
    reply_delay?: number
    guidelines?: string[]
  }
  settings?: Partial<AgentSettingsV1>
  store_variables?: Record<string, string>
  escalation_rules?: Partial<AgentEscalationRules>
  llm_config?: Partial<AgentLLMConfig>
  safety?: Partial<AgentSafety>
  provider?: string
  model?: string
  temperature?: number
  max_tokens?: number
  agent_type?: string
  handoff_keywords?: string[]
  max_interactions?: number
}

/**
 * Converte payload (que pode vir em formato legado, novo ou híbrido) em um
 * objeto pronto pra `INSERT`/`UPDATE` na tabela `ai_agents`.
 *
 * Campos não fornecidos são omitidos (não sobrescrevem com null em UPDATE).
 */
export function toCanonicalAgentRow(input: AgentWriteInput): Record<string, unknown> {
  const row: Record<string, unknown> = {}

  if (input.organization_id !== undefined) row.organization_id = input.organization_id
  if (input.store_id !== undefined) row.store_id = input.store_id
  if (input.name !== undefined) row.name = input.name?.trim()
  if (input.description !== undefined) row.description = input.description ?? null

  // role: aceita `role` direto ou `agent_type` legado
  const roleSource = input.role ?? input.agent_type
  if (roleSource !== undefined) {
    row.role = ROLE_FROM_LEGACY[roleSource] ?? 'sales'
  }

  // status: aceita `status` direto ou `is_active` legado
  if (input.status !== undefined) {
    row.status = input.status
  } else if (input.is_active !== undefined) {
    row.status = STATUS_FROM_LEGACY(input.is_active)
  }

  // identity: aceita `identity.context` direto ou `system_prompt` legado
  if (input.identity || input.system_prompt !== undefined) {
    row.identity = {
      context: input.identity?.context ?? input.system_prompt ?? '',
      personality: input.identity?.personality ?? '',
      style: input.identity?.style ?? '',
    }
  }

  // behavior: pass-through com defaults
  if (input.behavior) {
    row.behavior = {
      persistence: input.behavior.persistence ?? '',
      primary_goal: input.behavior.primary_goal ?? '',
      secondary_goals: input.behavior.secondary_goals ?? [],
      limitations: input.behavior.limitations ?? '',
      communication_rules: input.behavior.communication_rules ?? '',
    }
  }

  // persona: aceita campos novos + campos legados (role_description/reply_delay/guidelines)
  if (input.persona) {
    const p = input.persona
    row.persona = {
      tone: p.tone ?? 'friendly',
      response_length: p.response_length ?? 'medium',
      language: p.language ?? 'pt-BR',
      reply_delay_seconds: p.reply_delay_seconds ?? p.reply_delay ?? 3,
      split_messages: p.split_messages ?? false,
    }
  }

  if (input.store_variables !== undefined) row.store_variables = input.store_variables
  if (input.settings !== undefined) row.settings = input.settings

  // escalation_rules + handoff_keywords legado
  if (input.escalation_rules || input.handoff_keywords !== undefined) {
    row.escalation_rules = {
      transfer_keywords:
        input.escalation_rules?.transfer_keywords ?? input.handoff_keywords ?? [],
      max_attempts_before_escalate: input.escalation_rules?.max_attempts_before_escalate ?? 3,
      escalate_on_low_confidence: input.escalation_rules?.escalate_on_low_confidence ?? true,
      escalate_on_negative_sentiment:
        input.escalation_rules?.escalate_on_negative_sentiment ?? true,
      escalate_to_user_id: input.escalation_rules?.escalate_to_user_id ?? null,
    }
  }

  // llm_config: aceita formato novo OU campos legados (provider/model/temperature/max_tokens)
  if (
    input.llm_config ||
    input.provider !== undefined ||
    input.model !== undefined ||
    input.temperature !== undefined ||
    input.max_tokens !== undefined
  ) {
    row.llm_config = {
      provider: input.llm_config?.provider ?? input.provider ?? 'openrouter',
      model:
        input.llm_config?.model ?? input.model ?? 'anthropic/claude-sonnet-4.6',
      fallback_model: input.llm_config?.fallback_model ?? 'anthropic/claude-haiku-4.5',
      classifier_model: input.llm_config?.classifier_model ?? 'anthropic/claude-haiku-4.5',
      temperature: input.llm_config?.temperature ?? input.temperature ?? 0.7,
      max_tokens: input.llm_config?.max_tokens ?? input.max_tokens ?? 1000,
      pipeline_mode: input.llm_config?.pipeline_mode ?? 'monolithic',
    }
  }

  if (input.safety) row.safety = input.safety

  return row
}

/**
 * Adiciona campos legados derivados (system_prompt, provider, model, etc)
 * ao row canônico vindo do banco. Permite que UI/stores antigos continuem
 * lendo `agent.system_prompt`, `agent.is_active` etc até migrarem.
 */
export function decorateLegacyFields<T extends Partial<Agent>>(
  row: T | null,
): (T & {
  system_prompt: string
  provider: string
  model: string
  temperature: number
  max_tokens: number
  is_active: boolean
}) | null {
  if (!row) return null
  return {
    ...row,
    system_prompt: row.identity?.context ?? '',
    provider: row.llm_config?.provider ?? 'openrouter',
    model: row.llm_config?.model ?? 'anthropic/claude-sonnet-4.6',
    temperature: row.llm_config?.temperature ?? 0.7,
    max_tokens: row.llm_config?.max_tokens ?? 1000,
    is_active: row.status === 'published',
  } as T & {
    system_prompt: string
    provider: string
    model: string
    temperature: number
    max_tokens: number
    is_active: boolean
  }
}
