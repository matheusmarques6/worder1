// A lista e a criação de campanhas de WhatsApp.
//
// Esta rota estava quebrada contra o banco de produção: criava com
// colunas inexistentes (500), buscava por `name` numa tabela que só tinha
// `title` e somava métricas de colunas que não existiam. Depois da
// reconciliação, o que estes testes prendem é o contrato e o ESCOPO —
// organização em toda consulta, loja conferida antes de virar filtro.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeSupabase, hasFilter, allScopedToOrg, type FakeSupabase } from '@/test/supabase-fake'

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

const LOJA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function campanha(over: Record<string, any> = {}) {
  return {
    id: 'c1', organization_id: 'org-1', name: 'Promo de maio', status: 'draft',
    audience_count: 100, total_recipients: 100, total_sent: 40, total_delivered: 35,
    total_read: 20, total_replied: 3, total_failed: 5, store_id: null,
    created_at: '2026-09-01T00:00:00Z', ...over,
  }
}

async function get(query = '') {
  const { GET } = await import('../route')
  const res = await GET(new NextRequest(`https://app.test/api/whatsapp/campaigns${query}`))
  return { res, body: await res.json() }
}

async function post(body: Record<string, any>) {
  const { POST } = await import('../route')
  const res = await POST(new NextRequest('https://app.test/api/whatsapp/campaigns', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  return { res, body: await res.json() }
}

beforeEach(() => {
  vi.resetModules()
  db = fakeSupabase({ rows: { whatsapp_campaigns: [campanha()], organization_members: [] } })
})

describe('campanhas de WhatsApp · listar', () => {
  it('devolve campanhas e métricas com os nomes que a tela lê', async () => {
    const { res, body } = await get()
    expect(res.status).toBe(200)
    expect(body.campaigns[0]).toMatchObject({ name: 'Promo de maio', audience_count: 100, total_sent: 40 })
    expect(body.metrics).toMatchObject({
      totalCampaigns: expect.any(Number),
      totalSent: 40,
      totalDelivered: 35,
      totalRead: 20,
      totalReplied: 3,
    })
  })

  it('toda consulta fica presa à organização da sessão', async () => {
    await get()
    expect(allScopedToOrg(db.queries, 'org-1', ['whatsapp_campaigns'])).toBe(true)
  })

  it('loja de outra organização é recusada em vez de virar filtro', async () => {
    db = fakeSupabase({ rows: { whatsapp_campaigns: [campanha()], shopify_stores: [] } })
    const { res, body } = await get(`?storeId=${LOJA}`)
    expect(res.status).toBe(404)
    expect(body.error).toMatch(/store/i)
  })

  it('com loja válida, o filtro inclui as campanhas da organização inteira', async () => {
    db = fakeSupabase({ rows: { whatsapp_campaigns: [campanha()], shopify_stores: [{ id: LOJA }] } })
    await get(`?storeId=${LOJA}`)
    const q = db.on('whatsapp_campaigns')[0]
    // No cliente real o `or` recebe a expressão inteira como argumento
    // único; o registro guarda ela em `column`.
    const or = q.filters.find((f) => f.op === 'or')
    expect(or?.column).toBe(`store_id.eq.${LOJA},store_id.is.null`)
  })

  it('o termo de busca não carrega vírgula nem parêntese para dentro do filtro', async () => {
    await get('?search=' + encodeURIComponent('promo),(x'))
    const q = db.on('whatsapp_campaigns')[0]
    const ilike = q.filters.find((f) => f.op === 'ilike')
    // O saneador troca a gramática por espaço: "promo),(x" busca "promo x",
    // não "promox" — colar as palavras mudaria o que a pessoa procurou.
    expect(ilike?.value).toBe('%promo x%')
  })

  it('falha de leitura vira erro, não lista vazia', async () => {
    db = fakeSupabase({ rows: {}, errors: { whatsapp_campaigns: { message: 'column does not exist' } } })
    const { res, body } = await get()
    expect(res.status).toBe(500)
    expect(body.error).toBe('column does not exist')
  })
})

describe('campanhas de WhatsApp · criar', () => {
  it('recusa campanha sem nome', async () => {
    const { res } = await post({})
    expect(res.status).toBe(400)
  })

  it('grava com o vocabulário do banco e prende à organização', async () => {
    db = fakeSupabase({
      rows: {
        whatsapp_contacts: [{ id: 'ct1' }, { id: 'ct2' }],
        whatsapp_campaigns: [campanha()],
        organization_members: [],
      },
    })
    const { res } = await post({ name: 'Nova promo', audience_type: 'all' })
    expect(res.status).toBe(200)
    const ins = db.on('whatsapp_campaigns').find((q) => q.operation === 'insert')!
    expect(ins.written).toMatchObject({
      organization_id: 'org-1',
      name: 'Nova promo',
      status: 'draft',
      audience_type: 'all',
    })
    // Contagem da audiência vem do banco, não do cliente.
    expect((ins.written as any).audience_count).toBe(2)
    expect((ins.written as any).total_recipients).toBe(2)
  })

  it('loja de outra organização não entra na campanha', async () => {
    db = fakeSupabase({
      rows: { shopify_stores: [], whatsapp_contacts: [], whatsapp_campaigns: [campanha()], organization_members: [] },
    })
    const { res } = await post({ name: 'Promo', store_id: LOJA })
    expect(res.status).toBe(200)
    const ins = db.on('whatsapp_campaigns').find((q) => q.operation === 'insert')!
    // A loja não confirmada não vira vínculo: fica nula.
    expect((ins.written as any).store_id).toBeNull()
  })
})
