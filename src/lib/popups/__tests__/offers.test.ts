import { describe, it, expect } from 'vitest'
import { readSmartOffer, intentOf, offerFor, resolveOffer, allowedChoices } from '../offers'

describe('smart offers — configuração e faixas', () => {
  it('lê com limites sensatos e faixas que não se cruzam', () => {
    const c = readSmartOffer({ smartOffer: { enabled: true, lowMax: 80, highMin: 50, lowTier: 't1', midTier: 'base', highTier: 'none', controlPercent: 90 } })
    expect(c).toMatchObject({ enabled: true, lowMax: 80, highMin: 85, lowTier: 't1', midTier: 'base', highTier: 'none', controlPercent: 50 })
    expect(readSmartOffer({}).enabled).toBe(false)
    expect(readSmartOffer({ smartOffer: { enabled: true, lowTier: '<script>' } }).lowTier).toBe('base')
  })

  it('classifica a intenção pelas faixas e escolhe a oferta da faixa', () => {
    const c = readSmartOffer({ smartOffer: { enabled: true, lowMax: 35, highMin: 70, lowTier: 't-big', midTier: 'base', highTier: 'none' } })
    expect(intentOf(10, c)).toBe('low')
    expect(intentOf(35, c)).toBe('mid')
    expect(intentOf(69, c)).toBe('mid')
    expect(intentOf(70, c)).toBe('high')
    expect(offerFor(c, 'low')).toBe('t-big')
    expect(offerFor(c, 'high')).toBe('none')
    expect([...allowedChoices(c)].sort()).toEqual(['base', 'none', 't-big'])
  })
})

describe('smart offers — decisão do servidor', () => {
  const c = readSmartOffer({ smartOffer: { enabled: true, lowMax: 35, highMin: 70, lowTier: 't-big', midTier: 'base', highTier: 'none' } })

  it('desligado não decide nada', () => {
    expect(resolveOffer(readSmartOffer({}), { intent: 'low', bucket: 'smart', tier: 't-big' }, ['t-big'])).toEqual({ intent: null, bucket: null, tier: null })
  })

  it('controle sempre recebe a base, mesmo pedindo outra coisa', () => {
    expect(resolveOffer(c, { intent: 'low', bucket: 'control', tier: 't-big' }, ['t-big'])).toEqual({ intent: 'low', bucket: 'control', tier: 'base' })
  })

  it('smart recebe o que a regra dá para a intenção informada; pedido fora da regra volta para a regra', () => {
    expect(resolveOffer(c, { intent: 'low', bucket: 'smart', tier: 't-big' }, ['t-big'])).toEqual({ intent: 'low', bucket: 'smart', tier: 't-big' })
    expect(resolveOffer(c, { intent: 'high', bucket: 'smart', tier: 't-big' }, ['t-big'])).toEqual({ intent: 'high', bucket: 'smart', tier: 'none' })
    expect(resolveOffer(c, { intent: 'mid', bucket: 'smart', tier: 'none' }, ['t-big'])).toEqual({ intent: 'mid', bucket: 'smart', tier: 'base' })
    // Intenção inválida vira média.
    expect(resolveOffer(c, { intent: 'hack', bucket: 'smart' }, ['t-big']).intent).toBe('mid')
  })

  it('um nível que não existe mais no bloco cai na base, nunca em "nenhuma"', () => {
    expect(resolveOffer(c, { intent: 'low', bucket: 'smart', tier: 't-big' }, []).tier).toBe('base')
  })
})
