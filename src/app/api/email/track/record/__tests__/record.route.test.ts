// O registro de abertura e clique.
//
// Esta rota grava estatística a partir do que recebe, e o trio de uuids
// (campanha, contato, organização) viaja em toda URL de rastreamento —
// ou seja, está nas mãos de qualquer destinatário. Sem segredo, dava para
// inflar as aberturas de uma loja com um curl.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeSupabase, hasFilter, type FakeSupabase } from '@/test/supabase-fake'

let db: FakeSupabase

vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() { return db },
  getSupabaseAdmin: () => db,
  isSupabaseConfigured: () => true,
}))

const SEGREDO = 'segredo-de-teste'
const ORG = 'org-1'
const CAMP = 'camp-1'
const CONTATO = 'contato-1'
const ENVIO = 'envio-1'

async function post(body: Record<string, any>, headers: Record<string, string> = {}) {
  const { POST } = await import('../route')
  const res = await POST(new NextRequest('https://app.test/api/email/track/record', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }))
  return { res, body: await res.json().catch(() => ({})) }
}

const autorizado = { authorization: `Bearer ${SEGREDO}`, 'x-internal': 'true' }
const abertura = { type: 'open', campaignId: CAMP, contactId: CONTATO, orgId: ORG, sendId: ENVIO }

beforeEach(() => {
  vi.resetModules()
  process.env.INTERNAL_API_SECRET = SEGREDO
  db = fakeSupabase({
    rows: {
      email_campaigns: [{ id: CAMP, organization_id: ORG }],
      contacts: [{ id: CONTATO, organization_id: ORG }],
      contact_events: [],
      email_sends: [],
    },
  })
})
afterEach(() => { delete process.env.INTERNAL_API_SECRET })

describe('registro de abertura e clique', () => {
  it('sem segredo no cabeçalho, recusa — e não grava nada', async () => {
    const { res } = await post(abertura, { 'x-internal': 'true' })
    expect(res.status).toBe(401)
    expect(db.queries).toHaveLength(0)
  })

  it('com segredo errado, recusa', async () => {
    const { res } = await post(abertura, { authorization: 'Bearer outro' })
    expect(res.status).toBe(401)
  })

  it('com o segredo certo, grava o evento', async () => {
    const { res } = await post(abertura, autorizado)
    expect(res.status).toBe(200)
    const ins = db.queries.find((q) => q.table === 'contact_events' && q.operation === 'insert')
    expect(ins?.written).toMatchObject({ organization_id: ORG, contact_id: CONTATO, event_type: 'email_opened' })
  })

  it('campanha de outra organização não grava nada', async () => {
    db = fakeSupabase({
      rows: {
        email_campaigns: [{ id: CAMP, organization_id: 'org-2' }],
        contacts: [{ id: CONTATO, organization_id: ORG }],
      },
    })
    const { res } = await post(abertura, autorizado)
    expect(res.status).toBe(200)
    expect(db.queries.some((q) => q.operation === 'insert')).toBe(false)
  })

  it('contato de outra organização não grava nada', async () => {
    db = fakeSupabase({
      rows: {
        email_campaigns: [{ id: CAMP, organization_id: ORG }],
        contacts: [{ id: CONTATO, organization_id: 'org-2' }],
      },
    })
    const { res } = await post(abertura, autorizado)
    expect(res.status).toBe(200)
    expect(db.queries.some((q) => q.operation === 'insert')).toBe(false)
  })

  it('a marcação de aberto no envio é presa à organização E à campanha', async () => {
    await post(abertura, autorizado)
    const upd = db.queries.find((q) => q.table === 'email_sends' && q.operation === 'update')!
    expect(hasFilter(upd, 'id', ENVIO)).toBe(true)
    expect(hasFilter(upd, 'organization_id', ORG)).toBe(true)
    expect(hasFilter(upd, 'campaign_id', CAMP)).toBe(true)
    // Só marca o que ainda não estava marcado.
    expect(upd.filters.some((f) => f.op === 'is' && f.column === 'opened_at')).toBe(true)
  })
})
