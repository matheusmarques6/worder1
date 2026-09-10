// Os cartões do dashboard de automações zeravam ao escolher uma loja.
//
// `automation_runs` não tem `store_id` — quem carrega a loja é a
// automação. O `.eq('store_id', …)` derrubava a consulta (coluna
// inexistente) e todo card de execução virava zero. O mesmo valia para
// `automation_rules`, uma tabela que nem existe.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeSupabase, type FakeSupabase } from '@/test/supabase-fake'

let db: FakeSupabase

vi.mock('@/lib/api-utils', () => ({
  getAuthClient: async () => ({ supabase: db, user: { id: 'u-1', organization_id: 'org-1' } }),
  authError: () => new Response('unauthorized', { status: 401 }),
}))

const LOJA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

async function get(query = '') {
  const { GET } = await import('../route')
  const res = await GET(new NextRequest(`https://app.test/api/automations/dashboard-stats${query}`))
  return { res, body: await res.json() }
}

function base(over: Record<string, any> = {}) {
  return {
    organization_members: [{ organization_id: 'org-1' }],
    shopify_stores: [{ id: LOJA }],
    automations: [{ id: 'auto-1' }],
    automation_runs: [{ id: 'r1', deal_id: 'd1' }],
    deals: [{ value: 250 }],
    ...over,
  }
}

beforeEach(() => {
  vi.resetModules()
  db = fakeSupabase({ rows: base() })
})

describe('cartões do dashboard de automações', () => {
  it('nenhuma consulta de execução filtra por uma coluna que não existe', async () => {
    await get(`?storeId=${LOJA}`)
    for (const q of db.on('automation_runs')) {
      expect(q.filters.some((f) => f.column === 'store_id')).toBe(false)
    }
  })

  it('escopa as execuções pelas automações daquela loja', async () => {
    await get(`?storeId=${LOJA}`)
    const runs = db.on('automation_runs')
    expect(runs.length).toBeGreaterThan(0)
    for (const q of runs) {
      expect(q.filters.some((f) => f.op === 'in' && f.column === 'automation_id')).toBe(true)
      expect(q.filters.some((f) => f.column === 'organization_id' && f.value === 'org-1')).toBe(true)
    }
  })

  it('sem loja escolhida, o filtro é só a organização', async () => {
    await get()
    const runs = db.on('automation_runs')
    expect(runs.length).toBeGreaterThan(0)
    for (const q of runs) {
      expect(q.filters.some((f) => f.column === 'automation_id')).toBe(false)
      expect(q.filters.some((f) => f.column === 'organization_id' && f.value === 'org-1')).toBe(true)
    }
  })

  it('loja sem automação nenhuma responde zero sem consultar execução', async () => {
    db = fakeSupabase({ rows: base({ automations: [] }) })
    const { res, body } = await get(`?storeId=${LOJA}`)
    expect(res.status).toBe(200)
    expect(body.processedToday).toBe(0)
    expect(body.conversions30d).toBe(0)
    expect(db.on('automation_runs')).toHaveLength(0)
  })

  it('não consulta mais as tabelas mortas', async () => {
    await get(`?storeId=${LOJA}`)
    expect(db.on('automation_rules')).toHaveLength(0)
    expect(db.on('automation_executions')).toHaveLength(0)
  })
})
