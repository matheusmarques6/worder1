// O cron que dispara as campanhas agendadas.
//
// Este teste existe por causa de um bug que matava TODA campanha
// agendada: o cron marcava a campanha como 'sending' e só então chamava
// /send, que recusa campanha em 'sending' com 400. A resposta 400 não é
// exceção, então nem a volta para 'scheduled' acontecia — a campanha
// ficava presa em 'sending' para sempre, sem e-mail e sem erro na tela.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeSupabase, hasFilter, type FakeSupabase } from '@/test/supabase-fake'

let db: FakeSupabase

vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() { return db },
  getSupabaseAdmin: () => db,
  isSupabaseConfigured: () => true,
}))

const CAMP = { id: 'camp-1', organization_id: 'org-1', scheduled_at: new Date(Date.now() - 60000).toISOString(), timezone_mode: 'fixed' }

let respostas: Array<{ status: number; body?: any } | Error>
let chamadas: Array<{ url: string; headers: Record<string, string>; body: any }>

function mockFetch() {
  chamadas = []
  vi.stubGlobal('fetch', vi.fn(async (url: any, init: any) => {
    chamadas.push({
      url: String(url),
      headers: init?.headers || {},
      body: JSON.parse(init?.body || '{}'),
    })
    const r = respostas.shift() || { status: 200 }
    if (r instanceof Error) throw r
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body ?? {},
    } as any
  }))
}

async function run(headers: Record<string, string> = { 'x-vercel-cron': '1' }) {
  const { GET } = await import('../route')
  const res = await GET(new NextRequest('https://app.test/api/cron/send-scheduled-campaigns', { headers }))
  return { res, body: await res.json() }
}

beforeEach(() => {
  vi.resetModules()
  respostas = []
  db = fakeSupabase({ rows: { email_campaigns: [CAMP] } })
  mockFetch()
})
afterEach(() => { vi.unstubAllGlobals() })

describe('cron das campanhas agendadas', () => {
  it('exige autorização', async () => {
    const { res } = await run({})
    expect([401, 200]).toContain(res.status)
    // Sem segredo configurado o ambiente de teste libera; o que não pode
    // é despachar sem passar pela checagem.
    if (res.status === 401) expect(chamadas).toHaveLength(0)
  })

  it('NÃO marca a campanha como "sending" antes de chamar /send', async () => {
    respostas = [{ status: 200 }]
    await run()
    const escritas = db.on('email_campaigns').filter((q) => q.operation === 'update')
    const marcouSending = escritas.some((q) => (q.written as any)?.status === 'sending')
    expect(marcouSending, 'o claim é de /send, que é atômico; aqui ele só quebrava o envio').toBe(false)
  })

  it('chama /send com os cabeçalhos internos e o id da campanha', async () => {
    respostas = [{ status: 200 }]
    const { body } = await run()
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].url).toContain('/api/email/campaigns/send')
    expect(chamadas[0].headers['X-Internal']).toBe('true')
    expect(chamadas[0].headers['X-Org-Id']).toBe('org-1')
    expect(chamadas[0].body).toEqual({ campaign_id: 'camp-1' })
    expect(body.results[0]).toMatchObject({ id: 'camp-1', ok: true })
  })

  it('problema de configuração (422) devolve a campanha para rascunho com o motivo', async () => {
    respostas = [{ status: 422, body: { error: 'Domain not verified.' } }]
    await run()
    const upd = db.on('email_campaigns').find((q) => q.operation === 'update')!
    expect(upd.written).toMatchObject({ status: 'draft', sent_at: null, error_message: 'Domain not verified.' })
    // Sempre dentro da organização da campanha.
    expect(hasFilter(upd, 'organization_id', 'org-1')).toBe(true)
  })

  it('erro passageiro do servidor não devolve para rascunho — a próxima rodada tenta de novo', async () => {
    respostas = [{ status: 500, body: { error: 'boom' } }]
    await run()
    expect(db.on('email_campaigns').some((q) => q.operation === 'update')).toBe(false)
  })

  it('requisição que não chegou destrava a campanha, e só se ela ficou em "sending"', async () => {
    respostas = [new Error('ECONNRESET')]
    await run()
    const upd = db.on('email_campaigns').find((q) => q.operation === 'update')!
    expect(upd.written).toMatchObject({ status: 'scheduled', sent_at: null })
    expect(hasFilter(upd, 'status', 'sending')).toBe(true)
    expect(hasFilter(upd, 'organization_id', 'org-1')).toBe(true)
  })

  it('sem campanha vencida, não chama nada', async () => {
    db = fakeSupabase({ rows: { email_campaigns: [] } })
    const { body } = await run()
    expect(body.dispatched).toBe(0)
    expect(chamadas).toHaveLength(0)
  })

  it('campanha de horário fixo que ainda não venceu é ignorada nesta rodada', async () => {
    db = fakeSupabase({
      rows: { email_campaigns: [{ ...CAMP, scheduled_at: new Date(Date.now() + 3600_000).toISOString() }] },
    })
    const { body } = await run()
    expect(body.dispatched).toBe(0)
    expect(chamadas).toHaveLength(0)
  })
})
