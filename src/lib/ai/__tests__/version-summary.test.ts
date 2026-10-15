import { describe, expect, it } from 'vitest'
import { labelFromSummary, summarizeChanges } from '../version-summary'

describe('summarizeChanges', () => {
  it('descreve por área o que mudou, na linguagem do lojista', () => {
    const before = {
      system_prompt: 'Atenda.',
      persona: { tone: 'friendly', guidelines: ['Sem emoji'] },
      settings: {
        tools: { enabled: ['transfer_to_human'] },
        safety: { blocked_topics: ['política'], handoff_keywords: ['atendente'] },
        judges: { custom: [{ id: 'j1', name: 'Formal', active: true }] },
        delivery: { debounce_seconds: 8 },
      },
    }
    const after = {
      system_prompt: 'Atenda bem.',
      persona: { tone: 'luxury', guidelines: ['Sem emoji', 'Nunca prometer prazo'] },
      settings: {
        tools: { enabled: ['transfer_to_human', 'product_lookup'] },
        safety: { blocked_topics: [], handoff_keywords: ['atendente', 'humano'] },
        judges: { custom: [{ id: 'j1', name: 'Formal', active: false }, { id: 'j2', name: 'Sem gíria' }] },
        delivery: { debounce_seconds: 12 },
      },
    }
    expect(summarizeChanges(before, after)).toEqual([
      'Instruções: texto base alterado',
      'Identidade: voz Amigável → Luxo',
      'Ferramentas: ligou “Consultar produtos”',
      'Limites: liberou “política”',
      'Limites: nova regra “Nunca prometer prazo”',
      'Transferência: novas palavras “humano”',
      'Revisão: novo juiz “Sem gíria”',
      'Revisão: pausou “Formal”',
      'Entrega: espera 8s → 12s',
    ])
  })

  it('nada mudou, nada a dizer', () => {
    const cfg = { system_prompt: 'x', persona: { tone: 'casual' }, settings: { tools: { enabled: ['a'] } } }
    expect(summarizeChanges(cfg, cfg)).toEqual([])
  })
})

describe('labelFromSummary', () => {
  it('primeira linha e a contagem do resto', () => {
    expect(labelFromSummary([])).toBe('Sem mudanças de configuração')
    expect(labelFromSummary(['A'])).toBe('A')
    expect(labelFromSummary(['A', 'B', 'C'])).toBe('A (+2)')
  })
})
