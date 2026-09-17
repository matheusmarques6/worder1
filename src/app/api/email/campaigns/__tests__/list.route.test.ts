// O contrato da lista de campanhas.
//
// A tela lia `recipients_count`, `sent_count`, `open_rate` do topo do
// objeto e `stats` na raiz da resposta — nada disso a rota mandava: os
// quatro cartões ficavam em zero e a coluna de destinatários mostrava
// NaN. Erro de contrato não aparece no typecheck (a resposta é `any` do
// outro lado do fetch), então fica preso aqui.
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
  validateStoreAccess: async () => ({ valid: true }),
}))

const LOJA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function campanha(over: Record<string, any> = {}) {
  return {
    id: 'c1', organization_id: 'org-1', name: 'Black Friday', subject: 'Oi',
    status: 'sent', total_sent: 1000, total_failed: 50, total_recipients: 1050,
    error_message: null, created_at: '2026-09-01T00:00:00Z', store_id: LOJA, ...over,
  }
}

async function get(query = '') {
  const { GET } = await import('../route')
  const res = await GET(new NextRequest(`https://app.test/api/email/campaigns${query}`))
  return { res, body: await res.json() }
}

beforeEach(() => {
  vi.resetModules()
  db = fakeSupabase({ rows: { email_campaigns: [campanha()] }, rpc: { campaign_email_stats: [] } })
})

describe('lista de campanhas · contrato com a tela', () => {
  it('manda o resumo que os cartões do topo mostram', async () => {
    const { res, body } = await get()
    expect(res.status).toBe(200)
    expect(body.stats).toEqual({
      total: 1,
      sent: 1,
      avg_open_rate: expect.any(Number),
      avg_click_rate: expect.any(Number),
    })
  })

  it('cada campanha leva os números calculados dos envios', async () => {
    const { body } = await get()
    const c = body.campaigns[0]
    expect(c.stats).toMatchObject({
      total: 1000,
      bounced: 50,
      delivered: 950,
      opened: expect.any(Number),
      clicked: expect.any(Number),
    })
    // A tela usa estes dois para a coluna de destinatários.
    expect(c.total_recipients).toBe(1050)
    expect(c).toHaveProperty('error_message')
  })

  it('as médias são ponderadas pelo volume, não pela quantidade de campanhas', async () => {
    // Uma campanha de 10 pessoas com 10 aberturas e outra de 1000 com 10.
    db = fakeSupabase({
      rows: { email_campaigns: [
        campanha({ id: 'c1', total_sent: 10, total_failed: 0 }),
        campanha({ id: 'c2', total_sent: 1000, total_failed: 0 }),
      ] },
      rpc: { campaign_email_stats: [
        { campaign_id: 'c1', opened: 10, clicked: 0 },
        { campaign_id: 'c2', opened: 10, clicked: 0 },
      ] },
    })
    const { body } = await get()
    // Ponderado: 20 / 1010 ≈ 1,98%. Pela média simples daria 50,5%.
    expect(body.stats.avg_open_rate).toBeLessThan(5)
  })

  it('a organização da sessão entra em toda consulta', async () => {
    await get(`?storeId=${LOJA}`)
    for (const q of db.on('email_campaigns')) {
      expect(hasFilter(q, 'organization_id', 'org-1')).toBe(true)
    }
  })

  it('com loja pedida, o filtro de loja é aplicado', async () => {
    await get(`?storeId=${LOJA}`)
    expect(hasFilter(db.on('email_campaigns')[0], 'store_id', LOJA)).toBe(true)
  })

  it('sem campanha nenhuma, o resumo é zero — e não desaparece', async () => {
    db = fakeSupabase({ rows: { email_campaigns: [] }, rpc: { campaign_email_stats: [] } })
    const { body } = await get()
    expect(body.campaigns).toEqual([])
    expect(body.stats).toEqual({ total: 0, sent: 0, avg_open_rate: 0, avg_click_rate: 0 })
  })
})
