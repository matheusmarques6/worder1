import { describe, it, expect } from 'vitest'
import {
  choiceAnswerKey,
  sanitizeStepPath,
  tagsFromAnswers,
  readRewardTiers,
  effectiveRewardTier,
  sanitizeBranches,
} from '../branching'

const steps = [{ id: 's1', name: 'Boas-vindas' }, { id: 's2', name: 'Quiz' }, { id: 's3', name: 'Lição' }]

describe('caminho de etapas', () => {
  it('só ids do design, sem repetição consecutiva, teto de 30', () => {
    expect(sanitizeStepPath(['s1', 's1', 's2', 'x', 's3', 's2'], steps)).toEqual(['s1', 's2', 's3', 's2'])
    expect(sanitizeStepPath('s1', steps)).toEqual([])
    expect(sanitizeStepPath([1, null, 's2'], steps)).toEqual(['s2'])
    expect(sanitizeStepPath(Array(100).fill('s1').flatMap((v, i) => [v, 's2']), steps)).toHaveLength(30)
  })

  it('ramificações só apontam para etapas que existem', () => {
    expect(sanitizeBranches({ Sim: 's2', Não: 'nope', X: 3 }, steps)).toEqual({ Sim: 's2' })
    expect(sanitizeBranches(null, steps)).toEqual({})
  })
})

describe('tags das opções', () => {
  const block = (type: string, props: Record<string, unknown>) => ({ id: 'b', type, props })

  it('a chave da resposta segue a regra do runtime', () => {
    expect(choiceAnswerKey(block('radio', { mapTo: 'custom', mapToCustom: 'pele' }))).toBe('custom:pele')
    expect(choiceAnswerKey(block('radio', { mapTo: 'custom', label: 'Tipo de pele' }))).toBe('custom:Tipo de pele')
    expect(choiceAnswerKey(block('dropdown', { mapTo: 'gender' }))).toBe('gender')
    expect(choiceAnswerKey(block('checkbox', {}))).toBe('check')
  })

  it('vêm do design cruzado com a resposta — nunca do cliente', () => {
    const blocks = [
      block('radio', { mapTo: 'custom', mapToCustom: 'pele', tagsByOption: { Oleosa: 'pele-oleosa, Quiz', Seca: ['pele-seca'] } }),
      block('checkbox', { mapTo: 'custom', mapToCustom: 'interesses', tagsByOption: { Skincare: 'skincare', Cabelo: 'cabelo' } }),
      block('text', { tagsByOption: { x: 'ignorado' } }),
    ]
    const tags = tagsFromAnswers(blocks, { 'custom:pele': 'Oleosa', 'custom:interesses': 'Skincare,Cabelo', tags: ['hack'] })
    expect(tags.sort()).toEqual(['cabelo', 'pele-oleosa', 'quiz', 'skincare'])
    expect(tagsFromAnswers(blocks, {})).toEqual([])
  })

  it('normaliza: minúsculas, espaço vira hífen, corta em 40', () => {
    const blocks = [block('radio', { mapTo: 'x', tagsByOption: { A: 'Cliente VIP , ' + 'a'.repeat(60) } })]
    expect(tagsFromAnswers(blocks, { x: 'A' })).toEqual(['cliente-vip', 'a'.repeat(40)])
  })
})

describe('recompensa progressiva', () => {
  const props = {
    tiers: [
      { id: 't1', label: '15% após o quiz', afterStepId: 's2', discountType: 'percentage', discountValue: 15, code: 'quiz15' },
      { id: 't2', label: 'Frete grátis após a lição', afterStepId: 's3', discountType: 'free_shipping', discountValue: 999 },
      { id: '', afterStepId: 's2' },
      // Sem etapa o nível existe (jogo e oferta por intenção o escolhem
      // pelo id), mas nunca vale pelo caminho.
      { id: 'game-only', label: 'Só pela roleta', discountType: 'percentage', discountValue: 20 },
      null,
    ],
  }

  it('lê só tiers válidos', () => {
    const tiers = readRewardTiers(props)
    expect(tiers).toHaveLength(3)
    expect(tiers[0]).toMatchObject({ id: 't1', kind: 'percent', value: 15, staticCode: 'QUIZ15' })
    expect(tiers[1]).toMatchObject({ id: 't2', kind: 'free_shipping', value: 0, staticCode: null })
    expect(tiers[2]).toMatchObject({ id: 'game-only', afterStepId: '', value: 20 })
    expect(readRewardTiers({})).toEqual([])
  })

  it('vale o último tier cuja etapa foi visitada; sem tier, a base', () => {
    const tiers = readRewardTiers(props)
    expect(effectiveRewardTier(tiers, ['s1'])).toBeNull()
    expect(effectiveRewardTier(tiers, ['s1', 's2'])?.id).toBe('t1')
    expect(effectiveRewardTier(tiers, ['s1', 's2', 's3'])?.id).toBe('t2')
    // Pulou o quiz e foi direto à lição: vale o da lição (ordem do lojista, não do caminho).
    expect(effectiveRewardTier(tiers, ['s1', 's3'])?.id).toBe('t2')
    // O nível sem etapa nunca vale pelo caminho — nem com um id vazio no path.
    expect(effectiveRewardTier(tiers, ['s1', ''])).toBeNull()
  })
})
