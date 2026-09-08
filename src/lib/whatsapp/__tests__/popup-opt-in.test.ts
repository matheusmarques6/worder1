import { describe, it, expect, vi, beforeEach } from 'vitest'

// A guarda de envio lê o supabaseAdmin próprio; aqui ela enxerga o mesmo
// banco de mentira que o módulo recebe por parâmetro.
const db = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, log: [] as Array<{ table: string; op: string; args: any }> }))

function fakeClient() {
  const client: any = {
    from(table: string) {
      const rows = () => db.tables[table] || []
      const filters: Array<[string, any]> = []
      const q: any = {
        _op: 'select',
        _payload: null as any,
        select: () => q,
        eq: (k: string, v: any) => { filters.push([k, v]); return q },
        in: () => q,
        not: () => q,
        order: () => q,
        limit: () => q,
        contains: () => q,
        insert: (payload: any) => { q._op = 'insert'; q._payload = payload; return q },
        update: (payload: any) => { q._op = 'update'; q._payload = payload; return q },
        upsert: (payload: any) => { q._op = 'upsert'; q._payload = payload; return q },
        maybeSingle: async () => {
          const match = rows().find((r) => filters.every(([k, v]) => r[k] === v))
          return { data: match || null }
        },
        single: async () => ({ data: rows()[0] || null }),
        then: (res: any) => {
          if (q._op === 'insert') {
            const items = Array.isArray(q._payload) ? q._payload : [q._payload]
            db.tables[table] = [...rows(), ...items.map((it: any, i: number) => ({ id: `${table}-${rows().length + i + 1}`, ...it }))]
          }
          if (q._op === 'upsert') {
            const idx = rows().findIndex((r) => r.organization_id === q._payload.organization_id && r.phone === q._payload.phone)
            if (idx >= 0) db.tables[table][idx] = { ...db.tables[table][idx], ...q._payload }
            else db.tables[table] = [...rows(), { id: `${table}-${rows().length + 1}`, ...q._payload }]
          }
          if (q._op === 'update') {
            db.tables[table] = rows().map((r) => (filters.every(([k, v]) => r[k] === v) ? { ...r, ...q._payload } : r))
          }
          db.log.push({ table, op: q._op, args: q._payload })
          return Promise.resolve({ data: q._op === 'select' ? rows() : null, error: null }).then(res)
        },
      }
      return q
    },
  }
  return client
}

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: fakeClient() }))
const dispatched = vi.hoisted(() => [] as any[])
vi.mock('@/lib/automation/trigger-dispatcher', () => ({ dispatchTrigger: vi.fn(async (o: any) => { dispatched.push(o); return { automationsMatched: 0, runsCreated: 0 } }) }))
vi.mock('@/lib/observability/whatsapp-logger', () => ({ wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import {
  readWhatsAppOptInConfig,
  isConfirmKeyword,
  inboundConfirms,
  renderVariable,
  startWhatsAppDoubleOptIn,
  confirmWhatsAppOptInFromInbound,
} from '../popup-opt-in'
import { requireOptIn } from '../opt-out-guard'

const ORG = 'org-1'
const PHONE = '5511999990000'

beforeEach(() => {
  db.tables = {}
  db.log.length = 0
  dispatched.length = 0
})

describe('configuração e palavras de confirmação', () => {
  it('só liga com template; variáveis com teto', () => {
    expect(readWhatsAppOptInConfig({ whatsapp: { doubleOptIn: true } }).doubleOptIn).toBe(false)
    const c = readWhatsAppOptInConfig({ whatsapp: { doubleOptIn: true, templateName: ' confirmar_optin ', bodyVariables: ['{{first_name}}', 3, 'x'.repeat(300)] } })
    expect(c).toMatchObject({ doubleOptIn: true, templateName: 'confirmar_optin', templateLanguage: 'pt_BR' })
    expect(c.bodyVariables).toEqual(['{{first_name}}', '', 'x'.repeat(200)])
  })

  it('"Sim!", "confirmo.", "1" confirmam; "sim, depois" e "não" não', () => {
    for (const t of ['Sim!', 'SIM', 'confirmo.', '1', ' ok ', 'Quero', 'Aceito']) expect(isConfirmKeyword(t)).toBe(true)
    for (const t of ['sim, depois', 'não', 'nao', 'talvez', '', null]) expect(isConfirmKeyword(t)).toBe(false)
  })

  it('reconhece botão de resposta rápida, botão interativo e texto', () => {
    expect(inboundConfirms({ type: 'button', button: { text: 'Confirmar', payload: 'CONFIRM_OPTIN' } }, 'Confirmar')).toBe('button')
    expect(inboundConfirms({ type: 'button', button: { text: 'Ver catálogo', payload: 'CATALOG' } }, 'Ver catálogo')).toBeNull()
    expect(inboundConfirms({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'optin_yes', title: 'Sim' } } }, '')).toBe('button')
    expect(inboundConfirms({ type: 'text' }, 'sim')).toBe('keyword')
    expect(inboundConfirms({ type: 'text' }, 'oi, quero saber do frete')).toBeNull()
  })

  it('variáveis do corpo aceitam merge tags', () => {
    expect(renderVariable('Olá {{first_name}} da {{ store_name }}', { first_name: 'Ana', store_name: 'Loja X' })).toBe('Olá Ana da Loja X')
  })
})

describe('pedido de confirmação', () => {
  const config = { doubleOptIn: true, templateName: 'confirmar_optin', templateLanguage: 'pt_BR', bodyVariables: ['{{first_name}}'] }
  const base = { organizationId: ORG, storeId: 'store-1', contactId: 'ct-1', phone: PHONE, formId: 'form-1', formName: 'Boas-vindas', submissionId: 'sub-1', firstName: 'Ana', config }
  const send = vi.fn(async () => ({ messageId: 'wamid.1' }))

  it('deixa pendente, manda o template UTILITY com as variáveis e registra o envio', async () => {
    db.tables.whatsapp_business_accounts = [{ id: 'acc-1', organization_id: ORG, store_id: 'store-1', phone_number_id: 'pn-1', waba_id: 'waba-1', status: 'active', access_token: 't' }]
    db.tables.whatsapp_templates = [{ organization_id: ORG, name: 'confirmar_optin', language: 'pt_BR', category: 'UTILITY', status: 'APPROVED', body_variables: 1 }]
    const r = await startWhatsAppDoubleOptIn(fakeClient(), base, { sendTemplate: send })
    expect(r).toEqual({ sent: true, messageId: 'wamid.1' })
    expect(db.tables.whatsapp_opt_status[0]).toMatchObject({ status: 'pending', phone: PHONE, opt_in_source: 'form_optin', consent_evidence: { form_id: 'form-1', submission_id: 'sub-1', request_message_id: 'wamid.1' } })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-1' }), PHONE, 'confirmar_optin', 'pt_BR', [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }] }])
    expect(db.tables.whatsapp_sends[0]).toMatchObject({ status: 'sent', external_message_id: 'wamid.1', metadata: { kind: 'popup_double_optin' } })
    // Pendente: marketing e texto livre esperam; utilidade passa.
    expect(await requireOptIn(ORG, PHONE, 'MARKETING')).toMatchObject({ allowed: false })
    expect(await requireOptIn(ORG, PHONE, 'UTILITY')).toMatchObject({ allowed: true })
    expect(await requireOptIn(ORG, PHONE)).toMatchObject({ allowed: false })
  })

  it('opt-out antigo: o pedido sai (utilidade) e a evidência anterior é preservada', async () => {
    db.tables.whatsapp_business_accounts = [{ id: 'acc-1', organization_id: ORG, store_id: 'store-1', phone_number_id: 'pn-1', status: 'active', access_token: 't' }]
    db.tables.whatsapp_templates = [{ organization_id: ORG, name: 'confirmar_optin', language: 'pt_BR', category: 'UTILITY', body_variables: 0 }]
    db.tables.whatsapp_opt_status = [{ id: 'o1', organization_id: ORG, phone: PHONE, status: 'opted_out', consent_evidence: { declined_at: '2026-01-01' } }]
    const r = await startWhatsAppDoubleOptIn(fakeClient(), base, { sendTemplate: send })
    expect(r.sent).toBe(true)
    expect(db.tables.whatsapp_opt_status[0]).toMatchObject({ status: 'pending', consent_evidence: { declined_at: '2026-01-01', previous_status: 'opted_out' } })
  })

  it('só a conta da loja do popup ou uma conta da org sem loja podem enviar', async () => {
    db.tables.whatsapp_business_accounts = [{ id: 'acc-other', organization_id: ORG, store_id: 'store-2', phone_number_id: 'pn-2', status: 'active', access_token: 't' }]
    db.tables.whatsapp_templates = [{ organization_id: ORG, name: 'confirmar_optin', language: 'pt_BR', category: 'UTILITY', body_variables: 0 }]
    expect(await startWhatsAppDoubleOptIn(fakeClient(), base, { sendTemplate: send })).toEqual({ sent: false, reason: 'no_account' })
  })

  it('template de marketing não sai: pendente bloqueia marketing na guarda', async () => {
    db.tables.whatsapp_business_accounts = [{ id: 'acc-1', organization_id: ORG, store_id: null, phone_number_id: 'pn-1', status: 'active', access_token: 't' }]
    db.tables.whatsapp_templates = [{ organization_id: ORG, name: 'confirmar_optin', language: 'pt_BR', category: 'MARKETING', body_variables: 0 }]
    const r = await startWhatsAppDoubleOptIn(fakeClient(), base, { sendTemplate: send })
    expect(r).toEqual({ sent: false, reason: 'blocked_by_category' })
    // Sem pedido enviado, ninguém fica pendente.
    expect(db.tables.whatsapp_opt_status || []).toHaveLength(0)
  })

  it('quem já tinha opt-in não recebe pedido', async () => {
    db.tables.whatsapp_opt_status = [{ id: 'o1', organization_id: ORG, phone: PHONE, status: 'opted_in' }]
    const r = await startWhatsAppDoubleOptIn(fakeClient(), base, { sendTemplate: send })
    expect(r).toEqual({ sent: false, reason: 'already_opted_in' })
  })

  it('sem conta ativa da org, nada sai e ninguém fica pendente', async () => {
    const r = await startWhatsAppDoubleOptIn(fakeClient(), base, { sendTemplate: send })
    expect(r).toEqual({ sent: false, reason: 'no_account' })
    expect(db.tables.whatsapp_opt_status || []).toHaveLength(0)
  })
})

describe('confirmação pela resposta', () => {
  const pending = (requestedAt = new Date().toISOString()) => [{ id: 'o1', organization_id: ORG, phone: PHONE, status: 'pending', contact_id: 'ct-1', consent_evidence: { kind: 'popup_double_optin', form_id: 'form-1', form_name: 'Boas-vindas', submission_id: 'sub-1', requested_at: requestedAt } }]
  const params = (over: any = {}) => ({ organizationId: ORG, storeId: 'store-1', phone: PHONE, message: { id: 'wamid.in', type: 'text' }, textBody: 'Sim', ...over })

  it('"Sim" vira opted_in, grava consentimento, prova e dispara o gatilho uma vez por popup', async () => {
    db.tables.whatsapp_opt_status = pending()
    db.tables.contacts = [{ id: 'ct-1' }]
    db.tables.whatsapp_sends = [{ id: 's1', organization_id: ORG, phone_number: PHONE, status: 'sent', metadata: { kind: 'popup_double_optin' } }]
    const r = await confirmWhatsAppOptInFromInbound(fakeClient(), params())
    expect(r).toEqual({ outcome: 'confirmed', contactId: 'ct-1', via: 'keyword' })
    expect(db.tables.whatsapp_opt_status[0]).toMatchObject({ status: 'opted_in', consent_evidence: { confirmed_via: 'keyword', message_id: 'wamid.in', form_id: 'form-1' } })
    expect(db.tables.contacts[0]).toMatchObject({ whatsapp_consent: true, is_subscribed_whatsapp: true, whatsapp_consent_source: 'popup_form:form-1:double_optin' })
    expect(db.tables.consent_records[0]).toMatchObject({ channel: 'whatsapp', action: 'confirmed', source: 'double_opt_in', source_ref: 'form-1', submission_id: 'sub-1' })
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0]).toMatchObject({ triggerType: 'trigger_whatsapp_optin', contactId: 'ct-1', idempotencyKey: 'whatsapp_optin:form-1:ct-1', triggerData: { form_id: 'form-1', confirmed_via: 'keyword' } })
    expect(dispatched[0].matchConfig({ form_id: 'form-1' })).toBe(true)
    expect(dispatched[0].matchConfig({ form_id: 'other' })).toBe(false)
    expect(dispatched[0].matchConfig({})).toBe(true)
    expect(db.tables.whatsapp_sends[0]).toMatchObject({ status: 'replied' })
  })

  it('mensagem comum de quem está pendente não confirma nada', async () => {
    db.tables.whatsapp_opt_status = pending()
    const r = await confirmWhatsAppOptInFromInbound(fakeClient(), params({ textBody: 'qual o prazo de entrega?' }))
    expect(r).toEqual({ outcome: 'ignored', reason: 'not_a_confirmation' })
    expect(db.tables.whatsapp_opt_status[0].status).toBe('pending')
    expect(dispatched).toHaveLength(0)
  })

  it('sem pedido pendente, qualquer "sim" é só uma mensagem', async () => {
    db.tables.whatsapp_opt_status = [{ id: 'o1', organization_id: ORG, phone: PHONE, status: 'opted_in', contact_id: 'ct-1' }]
    expect(await confirmWhatsAppOptInFromInbound(fakeClient(), params())).toEqual({ outcome: 'ignored', reason: 'no_pending' })
    expect(await confirmWhatsAppOptInFromInbound(fakeClient(), params({ phone: '5511000000000' }))).toEqual({ outcome: 'ignored', reason: 'no_pending' })
  })

  it('"PARAR" enquanto pendente vira opted_out', async () => {
    db.tables.whatsapp_opt_status = pending()
    const r = await confirmWhatsAppOptInFromInbound(fakeClient(), params({ textBody: 'PARAR' }))
    expect(r).toEqual({ outcome: 'opted_out' })
    expect(db.tables.whatsapp_opt_status[0]).toMatchObject({ status: 'opted_out', opt_out_reason: 'keyword' })
    expect(dispatched).toHaveLength(0)
  })

  it('palavra solta três dias depois do pedido não confirma; o botão confirma sempre', async () => {
    db.tables.whatsapp_opt_status = pending(new Date(Date.now() - 4 * 86400000).toISOString())
    expect(await confirmWhatsAppOptInFromInbound(fakeClient(), params())).toEqual({ outcome: 'ignored', reason: 'not_a_confirmation' })
    const r = await confirmWhatsAppOptInFromInbound(fakeClient(), params({ message: { id: 'wamid.b', type: 'button', button: { text: 'Confirmar', payload: 'CONFIRM_OPTIN' } }, textBody: '' }))
    expect(r).toMatchObject({ outcome: 'confirmed', via: 'button' })
  })

  it('o botão do template confirma mesmo sem texto', async () => {
    db.tables.whatsapp_opt_status = pending()
    const r = await confirmWhatsAppOptInFromInbound(fakeClient(), params({ message: { id: 'wamid.b', type: 'button', button: { text: 'Confirmar', payload: 'CONFIRM_OPTIN' } }, textBody: '' }))
    expect(r).toMatchObject({ outcome: 'confirmed', via: 'button' })
  })
})
