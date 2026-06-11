// src/lib/ai/__tests__/action-adapter.test.ts
import { describe, it, expect } from 'vitest'
import { templateActionToAgentActionPayload } from '../templates/action-adapter'
import type { TemplateAction } from '../templates/types'

const base: TemplateAction = {
  id: 'a1', name: 'Transferir', description: 'desc',
  conditions: [{ type: 'intent', value: 'human' }],
  actions: [{ type: 'transfer', value: 'queue' }],
  matchType: 'any', enabled: true,
}

describe('templateActionToAgentActionPayload', () => {
  it('intent → {type, intent}; transfer → {type, transfer_to}', () => {
    const p = templateActionToAgentActionPayload(base)
    expect(p.conditions).toEqual({ match_type: 'any', items: [{ type: 'intent', intent: 'human' }] })
    expect(p.actions).toEqual([{ type: 'transfer', transfer_to: 'queue' }])
    expect(p.name).toBe('Transferir')
    expect(p.is_active).toBe(true)
  })

  it('contains vira keywords[] (split por vírgula); sentiment, exact_message, ask_for, dont_mention, use_source', () => {
    const p = templateActionToAgentActionPayload({
      ...base,
      conditions: [
        { type: 'contains', value: 'tamanho,medida, veste' },
        { type: 'sentiment', value: 'frustrated' },
      ],
      actions: [
        { type: 'exact_message', value: 'Calma!' },
        { type: 'ask_for', value: 'height_weight' },
        { type: 'dont_mention', value: 'concorrente' },
        { type: 'use_source', value: 'src-1' },
      ],
      matchType: 'all',
    })
    expect(p.conditions).toEqual({
      match_type: 'all',
      items: [
        { type: 'contains', keywords: ['tamanho', 'medida', 'veste'] },
        { type: 'sentiment', sentiment: 'frustrated' },
      ],
    })
    expect(p.actions).toEqual([
      { type: 'exact_message', message: 'Calma!' },
      { type: 'ask_for', ask_field: 'height_weight' },
      { type: 'dont_mention', topic: 'concorrente' },
      { type: 'use_source', source_id: 'src-1' },
    ])
  })
})
