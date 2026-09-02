import { describe, it, expect } from 'vitest'
import {
  normalizeForMatch,
  matchHandoffKeyword,
  findBlockedTopic,
  isTransferCooldownActive,
  isWithinSchedule,
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

describe('isWithinSchedule (porte 1:1 de engine.ts:checkSchedule, item 37)', () => {
  // Quarta-feira 10:00 America/Sao_Paulo (UTC-3) = 13:00 UTC.
  const quartaDeManha = new Date('2026-07-29T13:00:00Z')

  it('sem bloco de schedule => sempre atende', () => {
    expect(isWithinSchedule(null, quartaDeManha)).toBe(true)
    expect(isWithinSchedule(undefined, quartaDeManha)).toBe(true)
  })

  it('always_active ignora hours/days', () => {
    expect(
      isWithinSchedule({ always_active: true, days: [] }, quartaDeManha),
    ).toBe(true)
  })

  it('dentro do horário e do dia configurados => true', () => {
    expect(
      isWithinSchedule(
        { hours: { start: '08:00', end: '18:00' }, days: ['wed'] },
        quartaDeManha,
      ),
    ).toBe(true)
  })

  it('fora do horário configurado => false', () => {
    expect(
      isWithinSchedule(
        { hours: { start: '19:00', end: '23:00' }, days: ['wed'] },
        quartaDeManha,
      ),
    ).toBe(false)
  })

  it('dia da semana fora da lista => false', () => {
    expect(
      isWithinSchedule(
        { hours: { start: '00:00', end: '23:59' }, days: ['mon', 'tue'] },
        quartaDeManha,
      ),
    ).toBe(false)
  })

  it('days: [] nunca bate com dia nenhum => sempre false (fora de always_active)', () => {
    expect(
      isWithinSchedule({ hours: { start: '00:00', end: '23:59' }, days: [] }, quartaDeManha),
    ).toBe(false)
  })

  it('sem hours/days explícitos usa default 08:00-18:00, seg-sex', () => {
    expect(isWithinSchedule({ timezone: 'America/Sao_Paulo' }, quartaDeManha)).toBe(true)
  })

  it('hours parcial (só start, sem fallback pra end) bloqueia em silêncio — igual ao engine.ts original (fix round 1, achado 2)', () => {
    // `end` fica undefined; a comparação `currentTime <= undefined` é sempre
    // false em JS. Isto reproduz o engine.ts original de propósito (sem
    // fallback de campo a campo) — não é o comportamento ideal, é paridade.
    expect(
      isWithinSchedule({ hours: { start: '00:00' }, days: ['wed'] } as any, quartaDeManha),
    ).toBe(false)
  })
})
