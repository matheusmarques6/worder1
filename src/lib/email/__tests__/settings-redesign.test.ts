import { describe, it, expect } from 'vitest'
import { renderMergeTags } from '../render'
import { checkEmail } from '../email-hygiene'
import { filterInactiveContacts, quietHoursApplyTo, type OrgSendingRules } from '../sending-rules'

const rules = (over: Partial<OrgSendingRules> = {}): OrgSendingRules => ({
  quietHoursEnabled: true, quietHoursStart: 22, quietHoursEnd: 8, quietHoursTimezone: 'America/Sao_Paulo',
  maxSendsPerContactPerDay: 0, maxEmailPerContactPerDay: null, maxSmsPerContactPerDay: 3, maxWhatsappPerContactPerDay: null,
  quietHoursChannels: 'sms_whatsapp', campaignPriority: true, suppressInactiveDays: null, validateOnEntry: true, ...over,
})

describe('filtros de merge tags (Configurações → Variáveis)', () => {
  it('default: usa o padrão quando o valor está vazio', () => {
    expect(renderMergeTags('Olá {{ first_name | default: "cliente" }}!', { first_name: '' })).toBe('Olá cliente!')
    expect(renderMergeTags('Olá {{ first_name | default: "cliente" }}!', { first_name: 'Marina' })).toBe('Olá Marina!')
  })
  it('money: formata em pt-BR na moeda pedida', () => {
    const out = renderMergeTags('{{ order_total | money: "BRL" }}', { order_total: '74.20' })
    expect(out.replace(/ /g, ' ')).toBe('R$ 74,20')
  })
  it('date: formata com padrão strftime', () => {
    expect(renderMergeTags('{{ last_order_at | date: "%d/%m/%Y" }}', { last_order_at: '2026-08-27T12:00:00Z' })).toBe('27/08/2026')
  })
  it('fallback simples continua funcionando', () => {
    expect(renderMergeTags('{{ checkout_url | https://loja.com }}', {})).toBe('https://loja.com')
  })
})

describe('higiene de e-mails na entrada', () => {
  it('rejeita descartáveis e formatos inválidos, sugere correção de digitação', () => {
    expect(checkEmail('joao@mailinator.com').ok).toBe(false)
    expect(checkEmail('joao@mailinator.com').reason).toBe('disposable')
    expect(checkEmail('joao@@gmail.com').ok).toBe(false)
    const c = checkEmail('Joao@Gmail.co')
    expect(c.ok).toBe(true)
    expect(c.normalized).toBe('joao@gmail.co')
    expect(c.suggestion).toBe('joao@gmail.com')
  })
})

describe('regras de envio', () => {
  it('horário de silêncio vale só nos canais escolhidos', () => {
    expect(quietHoursApplyTo(rules(), 'email')).toBe(false)
    expect(quietHoursApplyTo(rules(), 'whatsapp')).toBe(true)
    expect(quietHoursApplyTo(rules({ quietHoursChannels: 'all' }), 'email')).toBe(true)
    expect(quietHoursApplyTo(rules({ quietHoursEnabled: false, quietHoursChannels: 'all' }), 'sms')).toBe(false)
  })
  it('supressão de inativos tira só quem não engaja há mais de N dias', () => {
    const now = new Date('2026-09-05T12:00:00Z')
    const old = new Date(now.getTime() - 200 * 86400_000).toISOString()
    const recent = new Date(now.getTime() - 10 * 86400_000).toISOString()
    const r = filterInactiveContacts([
      { created_at: old, last_active_at: old },                       // inativo
      { created_at: old, last_active_at: old, last_order_at: recent }, // comprou → fica
      { created_at: recent },                                          // novo → fica
    ], rules({ suppressInactiveDays: 180 }), now)
    expect(r.suppressed).toBe(1)
    expect(r.kept).toHaveLength(2)
    expect(filterInactiveContacts([{ created_at: old }], rules(), now).suppressed).toBe(0)
  })
})
