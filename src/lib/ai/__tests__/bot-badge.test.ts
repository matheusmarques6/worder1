/**
 * Fix round 1 do item 37, achado 1: o badge do ChatPanel afirmava "Bot
 * Ativo" quando `aiStatus` era null (fetch em voo, falhou, ou sem espelho
 * cloud) — "nao sei" virava "sim" por default. Este arquivo prova a
 * variante 'unknown' e o texto que ela produz, e trava a matriz completa
 * pra nao regredir.
 */
import { describe, it, expect } from 'vitest'
import { botBadgeVariant, botBadgeText, type BotAiStatus } from '../bot-badge'

const BLOCKED: BotAiStatus = { willRespond: false, label: 'Bot pausado', detail: 'humano respondeu' }
const ACTIVE: BotAiStatus = { willRespond: true, label: 'Bot ativo' }

describe('botBadgeVariant', () => {
  it('bot desligado manualmente => off, mesmo com aiStatus presente', () => {
    expect(botBadgeVariant(false, ACTIVE)).toBe('off')
    expect(botBadgeVariant(false, null)).toBe('off')
  })

  it('bot ligado mas aiStatus null (fetch em voo/falhou/sem espelho) => unknown, NUNCA active', () => {
    expect(botBadgeVariant(true, null)).toBe('unknown')
  })

  it('bot ligado e guard bloqueando => blocked', () => {
    expect(botBadgeVariant(true, BLOCKED)).toBe('blocked')
  })

  it('bot ligado e nada bloqueando => active', () => {
    expect(botBadgeVariant(true, ACTIVE)).toBe('active')
  })
})

describe('botBadgeText', () => {
  it('unknown nunca contem "Ativo"', () => {
    const texto = botBadgeText('unknown', null, null)
    expect(texto).not.toMatch(/ativo/i)
    expect(texto).toBe('Bot')
  })

  it('unknown com nome canonico usa o nome sem qualificador', () => {
    expect(botBadgeText('unknown', null, 'Matheus')).toBe('Agente Matheus')
  })

  it('off usa "Off"', () => {
    expect(botBadgeText('off', null, null)).toBe('Bot Off')
    expect(botBadgeText('off', null, 'Matheus')).toBe('Agente Matheus Off')
  })

  it('blocked usa o label do aiStatus', () => {
    expect(botBadgeText('blocked', BLOCKED, null)).toBe('Bot pausado')
  })

  it('active usa "Ativo"', () => {
    expect(botBadgeText('active', ACTIVE, null)).toBe('Bot Ativo')
    expect(botBadgeText('active', ACTIVE, 'Matheus')).toBe('Agente Matheus Ativo')
  })
})
