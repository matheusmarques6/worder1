import { describe, expect, it } from 'vitest'
import { budgetNotice, costLabel, platformCostLabel } from './usage-label'

describe('AI usage cost label', () => {
  it('identifica custo parcial quando a API sinaliza custo desconhecido', () => {
    expect(costLabel({ billableUnknownCostCalls: 1 }, { hasUnknownCost: true }))
      .toBe('Custo faturável conhecido da organização')
  })
  it('mantém total para custo completamente conhecido', () => {
    expect(costLabel({ billableUnknownCostCalls: 0 }, { hasUnknownCost: false }))
      .toBe('Custo faturável da organização')
  })

  it('rotula separadamente o custo coberto pela plataforma', () => {
    expect(platformCostLabel()).toMatch(/plataforma/i)
  })

  it('explica lookup indisponivel sem recomendar renovar o orçamento', () => {
    const message = budgetNotice({
      allowed: false,
      budgetUsd: null,
      spentUsd: 0,
      unknownReason: 'lookup_error',
    })

    expect(message).toMatch(/indisponível|verificar/i)
    expect(message).not.toMatch(/próximo ciclo|limite.*aumentado/i)
  })

  it('explica custo faturavel desconhecido separadamente', () => {
    expect(budgetNotice({
      allowed: false,
      budgetUsd: 50,
      spentUsd: 10,
      unknownReason: 'unpriced_model',
    })).toMatch(/custo faturável.*desconhecido/i)
  })

  it('reserva esgotado para gasto conhecido no teto', () => {
    expect(budgetNotice({
      allowed: false,
      budgetUsd: 50,
      spentUsd: 50,
    })).toMatch(/esgotado/i)
  })
})
