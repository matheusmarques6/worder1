import { describe, it, expect } from 'vitest'
import {
  normalizeForMatch,
  matchHandoffKeyword,
  findBlockedTopic,
  isTransferCooldownActive,
} from '../guards'

describe('normalizeForMatch', () => {
  it('remove acentos, baixa caixa e trim', () => {
    expect(normalizeForMatch('  Atendênte HUMANO ')).toBe('atendente humano')
  })

  it('string vazia/nula vira vazia', () => {
    expect(normalizeForMatch('')).toBe('')
    expect(normalizeForMatch(undefined as any)).toBe('')
  })
})

describe('matchHandoffKeyword', () => {
  it('casa substring simples e retorna a keyword ORIGINAL', () => {
    expect(matchHandoffKeyword('quero falar com atendente', ['atendente'])).toBe('atendente')
  })

  it('case-insensitive', () => {
    expect(matchHandoffKeyword('FALAR COM HUMANO', ['humano'])).toBe('humano')
  })

  it('acento-insensitive nos DOIS lados', () => {
    // keyword com acento, texto sem
    expect(matchHandoffKeyword('quero transferencia agora', ['transferência'])).toBe('transferência')
    // texto com acento, keyword sem
    expect(matchHandoffKeyword('quero transferência agora', ['transferencia'])).toBe('transferencia')
  })

  it('retorna null sem match, sem keywords ou texto vazio', () => {
    expect(matchHandoffKeyword('oi, tudo bem?', ['atendente'])).toBeNull()
    expect(matchHandoffKeyword('oi', [])).toBeNull()
    expect(matchHandoffKeyword('oi', undefined)).toBeNull()
    expect(matchHandoffKeyword('', ['atendente'])).toBeNull()
  })

  it('ignora keywords vazias/whitespace na lista', () => {
    expect(matchHandoffKeyword('oi', ['', '  '])).toBeNull()
  })
})

describe('findBlockedTopic', () => {
  it('acha topico bloqueado na resposta (case/acento-insensitive)', () => {
    expect(findBlockedTopic('Sobre Política, eu acho que...', ['politica'])).toBe('politica')
  })

  it('null quando resposta limpa ou lista vazia', () => {
    expect(findBlockedTopic('Seu pedido foi enviado!', ['politica'])).toBeNull()
    expect(findBlockedTopic('qualquer coisa', undefined)).toBeNull()
  })
})

describe('isTransferCooldownActive', () => {
  const now = Date.parse('2026-07-27T12:00:00Z')

  it('true quando a transferencia foi ha menos de cooldownSeconds', () => {
    const transferredAt = new Date(now - 100_000).toISOString() // 100s atras
    expect(isTransferCooldownActive({ transferredAt, cooldownSeconds: 300, now })).toBe(true)
  })

  it('false quando o cooldown ja expirou', () => {
    const transferredAt = new Date(now - 400_000).toISOString() // 400s atras
    expect(isTransferCooldownActive({ transferredAt, cooldownSeconds: 300, now })).toBe(false)
  })

  it('false sem transferredAt (nunca transferiu)', () => {
    expect(isTransferCooldownActive({ transferredAt: null, cooldownSeconds: 300, now })).toBe(false)
    expect(isTransferCooldownActive({ transferredAt: undefined, cooldownSeconds: 300, now })).toBe(false)
  })

  it('cooldownSeconds null/undefined usa default 300', () => {
    const transferredAt = new Date(now - 100_000).toISOString()
    expect(isTransferCooldownActive({ transferredAt, cooldownSeconds: undefined, now })).toBe(true)
    expect(isTransferCooldownActive({ transferredAt, cooldownSeconds: null, now })).toBe(true)
  })

  it('cooldown 0 ou negativo desliga a trava', () => {
    const transferredAt = new Date(now - 1_000).toISOString()
    expect(isTransferCooldownActive({ transferredAt, cooldownSeconds: 0, now })).toBe(false)
    expect(isTransferCooldownActive({ transferredAt, cooldownSeconds: -10, now })).toBe(false)
  })

  it('data invalida => false (fail-open, nao trava a IA por lixo no banco)', () => {
    expect(isTransferCooldownActive({ transferredAt: 'not-a-date', cooldownSeconds: 300, now })).toBe(false)
  })
})
