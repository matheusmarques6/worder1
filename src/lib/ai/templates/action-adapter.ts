// src/lib/ai/templates/action-adapter.ts
// =============================================
// Adaptador: TemplateAction (templates de nicho) → payload aceito por
// POST /api/ai/agents/[id]/actions (shape do actions-engine).
//
// DRIFT documentado: templates usam {type, value} genérico; o engine espera
// campos nomeados por tipo (intent/sentiment/keywords | transfer_to/message/
// ask_field/topic/source_id). Função PURA — testada em unidade.
//
// ADVISORY (revisão): condição 'time' é mapeada como {type:'time', time_range: c.value}
// (string). Isso é "unsupported até um template usar" — o engine espera objeto
// {start, end}; nenhum template atual usa 'time'. A condição cai no case padrão
// e o campo time_range conterá a string do value original até que um template real
// de 'time' seja criado e o engine seja ajustado.
// =============================================
import type { TemplateAction } from './types'

export interface AgentActionPayload {
  name: string
  description: string | null
  is_active: boolean
  priority: number
  conditions: { match_type: 'all' | 'any'; items: Record<string, unknown>[] }
  actions: Record<string, unknown>[]
}

export function templateActionToAgentActionPayload(t: TemplateAction): AgentActionPayload {
  const items = t.conditions.map((c) => {
    switch (c.type) {
      case 'intent': return { type: 'intent', intent: c.value }
      case 'sentiment': return { type: 'sentiment', sentiment: c.value }
      case 'contains':
        return { type: 'contains', keywords: c.value.split(',').map((k) => k.trim()).filter(Boolean) }
      case 'time': return { type: 'time', time_range: c.value }
      default: return { type: c.type, value: c.value }
    }
  })

  const actions = t.actions.map((a) => {
    switch (a.type) {
      case 'transfer': return { type: 'transfer', transfer_to: a.value }
      case 'exact_message': return { type: 'exact_message', message: a.value }
      case 'ask_for': return { type: 'ask_for', ask_field: a.value }
      case 'dont_mention': return { type: 'dont_mention', topic: a.value }
      case 'use_source': return { type: 'use_source', source_id: a.value }
      default: return { type: a.type, value: a.value }
    }
  })

  return {
    name: t.name,
    description: t.description || null,
    is_active: t.enabled,
    priority: 0,
    conditions: { match_type: t.matchType, items },
    actions,
  }
}
