import { describe, it, expect } from 'vitest'
import { exportPopupData, erasePopupData } from '../lgpd'

// Banco de mentira: guarda o que cada consulta pediu e o que cada update
// escreveu, para o teste checar o escopo (org + contato) e o conteúdo.
type Call = { table: string; filters: Record<string, any>; update?: Record<string, any> }

function fakeAdmin(rows: Record<string, any[]> = {}) {
  const calls: Call[] = []
  const admin: any = {
    from(table: string) {
      const call: Call = { table, filters: {} }
      const q: any = {
        select: () => q,
        order: () => q,
        eq(col: string, val: any) { call.filters[col] = val; return q },
        update(patch: Record<string, any>) { call.update = patch; calls.push(call); return q },
        // Encadeável e aguardável ao mesmo tempo, como o cliente real.
        limit() { if (!call.update) calls.push(call); return q },
        then(resolve: any) { return Promise.resolve({ data: rows[table] || [] }).then(resolve) },
      }
      return q
    },
    _calls: calls,
  }
  return admin
}

const ORG = 'org-1'
const CONTACT = 'contact-9'

describe('exportação dos dados de popup', () => {
  it('busca as cinco fontes, sempre presas à organização e ao contato', async () => {
    const admin = fakeAdmin()
    const out = await exportPopupData(admin, ORG, CONTACT)
    const tables = admin._calls.map((c: Call) => c.table).sort()
    expect(tables).toEqual([
      'consent_records',
      'crm_form_submissions',
      'incentive_grants',
      'visitor_identities',
      'whatsapp_opt_status',
    ])
    for (const c of admin._calls) {
      expect(c.filters.organization_id).toBe(ORG)
      expect(c.filters.contact_id).toBe(CONTACT)
    }
    expect(out).toHaveProperty('submissions')
    expect(out).toHaveProperty('consents')
    expect(out).toHaveProperty('coupons')
    expect(out).toHaveProperty('visitors')
    expect(out).toHaveProperty('whatsapp')
  })

  it('devolve o nome do popup junto de cada inscrição', async () => {
    const admin = fakeAdmin({
      crm_form_submissions: [{ id: 's1', answers: { email: 'ana@x.com' }, form: { name: 'Boas-vindas' } }],
    })
    const out = await exportPopupData(admin, ORG, CONTACT)
    expect(out.submissions[0].popup).toBe('Boas-vindas')
    expect(out.submissions[0].form).toBeUndefined()
  })
})

describe('exclusão dos dados de popup', () => {
  it('apaga o que a pessoa digitou e o rastro, sempre dentro da org e do contato', async () => {
    const admin = fakeAdmin()
    await erasePopupData(admin, ORG, CONTACT)
    const by = (t: string) => admin._calls.find((c: Call) => c.table === t && c.update)!
    for (const t of ['crm_form_submissions', 'consent_records', 'visitor_identities', 'whatsapp_opt_status']) {
      expect(by(t).filters.organization_id).toBe(ORG)
      expect(by(t).filters.contact_id).toBe(CONTACT)
    }

    // As respostas do formulário são só dela: somem por completo.
    expect(by('crm_form_submissions').update).toMatchObject({
      answers: {}, ip_address: null, user_agent: null, referrer: null, page_url: null, visitor_id: null, session_id: null,
    })

    // O rastro do navegador se desliga da pessoa.
    expect(by('visitor_identities').update).toMatchObject({
      contact_id: null, last_email: null, last_ip: null, email_hash: null, phone_hash: null,
    })

    // O WhatsApp fica registrado como opt-out, sem o número.
    expect(by('whatsapp_opt_status').update).toMatchObject({
      phone: null, status: 'opted_out', opt_out_reason: 'lgpd_erasure',
    })
  })

  it('a prova do consentimento sobrevive: sai o que identifica, fica o que prova', async () => {
    const admin = fakeAdmin()
    await erasePopupData(admin, ORG, CONTACT)
    const consent = admin._calls.find((c: Call) => c.table === 'consent_records' && c.update)!
    // Art. 8º §2º: o ônus da prova é do controlador. Some IP, user agent e
    // a página; ficam o texto lido, a versão, o canal e a data.
    expect(consent.update).toEqual({ ip_address: null, user_agent: null, page_url: null })
    expect(consent.update).not.toHaveProperty('consent_text')
    expect(consent.update).not.toHaveProperty('occurred_at')
    expect(consent.update).not.toHaveProperty('channel')
  })

  it('devolve quantas linhas de cada tipo foram alcançadas', async () => {
    const admin = fakeAdmin({
      crm_form_submissions: [{ id: 'a' }, { id: 'b' }],
      consent_records: [{ id: 'c' }],
      visitor_identities: [],
      whatsapp_opt_status: [{ id: 'w' }],
    })
    const report = await erasePopupData(admin, ORG, CONTACT)
    expect(report).toEqual({ submissions: 2, consents: 1, visitors: 0, whatsapp: 1 })
  })
})
