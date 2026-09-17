// Destravar uma campanha presa. Esta rota existia e NUNCA funcionava:
// escrevia error_message, coluna que não existia em email_campaigns, e o
// PostgREST recusa a linha inteira quando não conhece um campo — a
// resposta era "não está num estado que permite retentativa" para toda
// campanha, inclusive as presas de verdade. A coluna foi criada; estes
// testes prendem o contrato.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeSupabase, hasFilter, type FakeSupabase } from '@/test/supabase-fake'

let db: FakeSupabase

vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() { return db },
  getSupabaseAdmin: () => db,
  isSupabaseConfigured: () => true,
}))
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: async () => ({ supabase: db, user: { id: 'u-1', organization_id: 'org-1' } }),
  authError: () => new Response('unauthorized', { status: 401 }),
}))

const ID = 'camp-1'

async function post() {
  const { POST } = await import('../route')
  const res = await POST(
    new NextRequest(`https://app.test/api/email/campaigns/${ID}/retry`, { method: 'POST' }),
    { params: Promise.resolve({ id: ID }) },
  )
  return { res, body: await res.json() }
}

beforeEach(() => {
  vi.resetModules()
  db = fakeSupabase({ rows: { email_campaigns: [{ id: ID, name: 'Black Friday', status: 'draft' }] } })
})

describe('destravar campanha', () => {
  it('volta para rascunho, limpa o carimbo de envio e o erro', async () => {
    const { res, body } = await post()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    const upd = db.on('email_campaigns').find((q) => q.operation === 'update')!
    expect(upd.written).toEqual({ status: 'draft', sent_at: null, error_message: null })
  })

  it('só alcança campanha desta organização', async () => {
    await post()
    const upd = db.on('email_campaigns').find((q) => q.operation === 'update')!
    expect(hasFilter(upd, 'organization_id', 'org-1')).toBe(true)
    expect(hasFilter(upd, 'id', ID)).toBe(true)
  })

  it('só destrava o que está preso: sending ou failed', async () => {
    await post()
    const upd = db.on('email_campaigns').find((q) => q.operation === 'update')!
    const inFilter = upd.filters.find((f) => f.op === 'in' && f.column === 'status')!
    expect(inFilter.value).toEqual(['sending', 'failed'])
  })

  it('campanha que não existe (ou não está presa) responde 404, sem inventar sucesso', async () => {
    db = fakeSupabase({ rows: { email_campaigns: [] } })
    const { res, body } = await post()
    expect(res.status).toBe(404)
    expect(body.error).toMatch(/retryable/i)
  })

  it('erro do banco não vira sucesso', async () => {
    db = fakeSupabase({
      rows: { email_campaigns: [{ id: ID }] },
      errors: { email_campaigns: { message: 'column does not exist' } },
    })
    const { res } = await post()
    expect(res.status).toBe(404)
  })
})
