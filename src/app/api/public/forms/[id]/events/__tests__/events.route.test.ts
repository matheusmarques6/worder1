// A rota de eventos rodando de verdade. É pública e sem autenticação, e
// o id do popup sai no bundle de toda loja — foi por aqui que dava para
// injetar impressões e grupo de controle na organização alheia.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeSupabase, type FakeSupabase } from '@/test/supabase-fake'

let db: FakeSupabase
let storeByDomain: Record<string, { id: string; organization_id: string }>

vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() { return db },
  getSupabaseAdmin: () => db,
}))
vi.mock('@/lib/shopify/resolve-store-by-domain', () => ({
  resolveStoreByDomain: async (_c: any, domain: string) => storeByDomain[domain] || null,
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 100 }),
  getClientIp: () => '203.0.113.9',
}))

const FORM_ID = '00000000-0000-4000-8000-0000000000aa'

function form(over: Record<string, any> = {}) {
  return { id: FORM_ID, organization_id: 'org-1', status: 'published', store_id: 'store-a', ...over }
}

async function post(body: Record<string, any>, headers: Record<string, string> = {}) {
  const { POST } = await import('../route')
  const req = new NextRequest(`https://app.test/api/public/forms/${FORM_ID}/events`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', ...headers },
    body: JSON.stringify(body),
  })
  return POST(req, { params: { id: FORM_ID } })
}

beforeEach(() => {
  vi.resetModules()
  storeByDomain = {
    'loja-a.myshopify.com': { id: 'store-a', organization_id: 'org-1' },
    'rival.myshopify.com': { id: 'store-x', organization_id: 'org-2' },
  }
  db = fakeSupabase({ rows: { crm_forms: [form()] } })
})

describe('beacon de eventos do popup', () => {
  it('grava a impressão vinda da loja do popup', async () => {
    const res = await post({ type: 'impression', visitor_id: 'v-1', domain: 'loja-a.myshopify.com' })
    expect(res.status).toBe(200)
    const insert = db.queries.find((q) => q.table === 'form_events' && q.operation === 'insert')
    expect(insert, 'a impressão tem de ser gravada').toBeTruthy()
    expect(insert!.written).toMatchObject({ organization_id: 'org-1', form_id: FORM_ID, event_type: 'impression' })
  })

  it('recusa o beacon vindo da loja de outra organização, sem gravar nada', async () => {
    const res = await post({ type: 'impression', visitor_id: 'v-1', domain: 'rival.myshopify.com' })
    // Reconhece para o beacon não ficar repetindo, mas não grava.
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ignored: 'origem de outra organização' })
    expect(db.queries.filter((q) => q.table === 'form_events')).toHaveLength(0)
  })

  it('recusa a loja irmã quando o popup é de uma loja específica', async () => {
    storeByDomain['loja-b.myshopify.com'] = { id: 'store-b', organization_id: 'org-1' }
    const res = await post({ type: 'impression', domain: 'loja-b.myshopify.com' })
    expect(await res.json()).toMatchObject({ ignored: 'origem de outra loja' })
    expect(db.queries.filter((q) => q.table === 'form_events')).toHaveLength(0)
  })

  it('sem origem alguma, o popup preso a uma loja não aceita', async () => {
    const res = await post({ type: 'impression' })
    expect(await res.json()).toMatchObject({ ignored: 'sem origem' })
  })

  it('o cabeçalho Origin serve quando o corpo não traz o domínio', async () => {
    const res = await post({ type: 'impression', visitor_id: 'v-2' }, { origin: 'https://loja-a.myshopify.com' })
    expect(res.status).toBe(200)
    expect(db.queries.some((q) => q.table === 'form_events' && q.operation === 'insert')).toBe(true)
  })

  it('popup não publicado não recebe evento', async () => {
    db = fakeSupabase({ rows: { crm_forms: [form({ status: 'draft' })] } })
    const res = await post({ type: 'impression', domain: 'loja-a.myshopify.com' })
    expect(await res.json()).toMatchObject({ ignored: 'form not published' })
  })

  it('tipo de evento inventado é recusado', async () => {
    const res = await post({ type: 'comprou_tudo', domain: 'loja-a.myshopify.com' })
    expect(res.status).toBe(400)
  })

  it('o grupo vem do tipo do evento, não do que o beacon pede', async () => {
    // Um beacon que diga "sou do controle" numa impressão fabricaria o
    // hold-out e inverteria a leitura do teste.
    await post({ type: 'impression', bucket: 'holdout', visitor_id: 'v-3', domain: 'loja-a.myshopify.com' })
    const insert = db.queries.find((q) => q.table === 'form_events' && q.operation === 'insert')!
    expect(insert.written!.properties.bucket).toBe('exposed')
  })

  it('variante inventada não vira variante no relatório', async () => {
    db = fakeSupabase({ rows: { crm_forms: (q) => (q.filters.some((f) => f.column === 'ab_parent_id') ? [] : [form()]) } })
    await post({ type: 'impression', variant_id: '00000000-0000-4000-8000-0000000000ff', visitor_id: 'v-4', domain: 'loja-a.myshopify.com' })
    const insert = db.queries.find((q) => q.table === 'form_events' && q.operation === 'insert')!
    expect(insert.written!.properties.variant_id ?? null).toBeNull()
  })
})
