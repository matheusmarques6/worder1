import { describe, it, expect } from 'vitest'
import { computeNextOccurrence, validateScheduledSend } from './scheduled-message-sender'

describe('computeNextOccurrence', () => {
  const base = '2026-06-10T14:00:00.000Z'

  it('daily soma 1 dia', () => {
    expect(computeNextOccurrence(base, 'daily', null)).toBe('2026-06-11T14:00:00.000Z')
  })
  it('weekly soma 7 dias', () => {
    expect(computeNextOccurrence(base, 'weekly', null)).toBe('2026-06-17T14:00:00.000Z')
  })
  it('monthly soma 1 mês preservando dia/hora (UTC)', () => {
    expect(computeNextOccurrence(base, 'monthly', null)).toBe('2026-07-10T14:00:00.000Z')
  })
  it('monthly clampa fim de mês (31 jan -> 28 fev)', () => {
    expect(computeNextOccurrence('2026-01-31T10:00:00.000Z', 'monthly', null)).toBe('2026-02-28T10:00:00.000Z')
  })
  it('retorna null quando próxima ocorrência passa do recurrence_end_date', () => {
    expect(computeNextOccurrence(base, 'daily', '2026-06-10')).toBeNull()
  })
  it('retorna null sem recorrência', () => {
    expect(computeNextOccurrence(base, null, null)).toBeNull()
  })
})

describe('validateScheduledSend', () => {
  const openConv = { is_window_open: true, window_expires_at: new Date(Date.now() + 3600_000).toISOString() }
  const closedConv = { is_window_open: false, window_expires_at: null }

  it('texto livre com janela aberta => ok', () => {
    expect(validateScheduledSend({ messageType: 'text', conversation: openConv, templateStatus: null }).ok).toBe(true)
  })
  it('texto livre fora da janela => erro claro WINDOW_EXPIRED', () => {
    const r = validateScheduledSend({ messageType: 'text', conversation: closedConv, templateStatus: null })
    expect(r.ok).toBe(false)
    expect(r.errorCode).toBe('WINDOW_EXPIRED')
    expect(r.errorMessage).toMatch(/24h/i)
  })
  it('texto livre sem conversa => WINDOW_EXPIRED', () => {
    const r = validateScheduledSend({ messageType: 'text', conversation: null, templateStatus: null })
    expect(r.ok).toBe(false)
    expect(r.errorCode).toBe('WINDOW_EXPIRED')
  })
  it('janela expirada por timestamp mesmo com is_window_open=true => WINDOW_EXPIRED', () => {
    const r = validateScheduledSend({
      messageType: 'text',
      conversation: { is_window_open: true, window_expires_at: new Date(Date.now() - 1000).toISOString() },
      templateStatus: null,
    })
    expect(r.ok).toBe(false)
  })
  it('template APPROVED fora da janela => ok (template abre conversa)', () => {
    expect(validateScheduledSend({ messageType: 'template', conversation: null, templateStatus: 'APPROVED' }).ok).toBe(true)
  })
  it('template não aprovado => TEMPLATE_NOT_APPROVED', () => {
    const r = validateScheduledSend({ messageType: 'template', conversation: null, templateStatus: 'PENDING' })
    expect(r.ok).toBe(false)
    expect(r.errorCode).toBe('TEMPLATE_NOT_APPROVED')
  })
})
