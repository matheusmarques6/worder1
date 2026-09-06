import { describe, expect, it } from 'vitest'
import { costLabel } from './usage-label'

describe('AI usage cost label', () => {
  it('identifica custo parcial quando a API sinaliza custo desconhecido', () => {
    expect(costLabel({ unknownCostCalls: 1 }, { hasUnknownCost: true })).toMatch(/conhecido|parcial/i)
  })
  it('mantém total para custo completamente conhecido', () => {
    expect(costLabel({ unknownCostCalls: 0 }, { hasUnknownCost: false })).toBe('Custo total')
  })
})
