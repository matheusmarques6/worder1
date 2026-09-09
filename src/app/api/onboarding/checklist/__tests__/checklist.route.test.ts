// A rota do roteiro rodando de verdade: os fatos têm de vir da
// organização da sessão, e nunca de um "já vi esta tela".
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
  getAuthClient: async () => ({ user: { id: 'u-1', organization_id: 'org-1' } }),
  authError: () => new Response('unauthorized', { status: 401 }),
}))

async function get(query = '') {
  const { GET } = await import('../route')
  const res = await GET(new NextRequest(`https://app.test/api/onboarding/checklist${query}`))
  return { res, body: await res.json() }
}

const passo = (body: any, id: string) => body.steps.find((s: any) => s.id === id)

// O storeId vai para dentro de um filtro montado como texto: aqui só
// passa UUID, e os testes usam ids de verdade por isso.
const LOJA_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const LOJA_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

beforeEach(() => {
  vi.resetModules()
  db = fakeSupabase({ rows: {} })
})

describe('roteiro de primeiros passos · rota', () => {
  it('organização recém-criada começa do zero, sem nenhum passo dado', async () => {
    const { res, body } = await get()
    expect(res.status).toBe(200)
    expect(body.done).toBe(0)
    expect(body.next.id).toBe('store')
    expect(body.complete).toBe(false)
  })

  it('todo fato é contado dentro da organização da sessão', async () => {
    await get()
    expect(allScopedToOrg(db.queries, 'org-1', [
      'shopify_stores', 'crm_forms', 'crm_form_submissions', 'email_domains', 'automations', 'email_campaigns',
    ])).toBe(true)
  })

  it('só conta domínio próprio verificado — o nosso não fecha o passo', async () => {
    await get()
    const q = db.on('email_domains')[0]
    expect(hasFilter(q, 'status', 'verified')).toBe(true)
    expect(q.filters.some((f) => f.column === 'is_system' && f.op === 'neq')).toBe(true)
  })

  it('só conta popup publicado que não é variante de teste', async () => {
    await get()
    const q = db.on('crm_forms')[0]
    expect(hasFilter(q, 'status', 'published')).toBe(true)
    expect(q.filters.some((f) => f.column === 'ab_parent_id' && f.op === 'is')).toBe(true)
  })

  it('com uma loja escolhida, é a vitrine DELA que precisa estar ativa', async () => {
    db = fakeSupabase({
      rows: { shopify_stores: [
        { id: LOJA_A, embed_installed: false },
        { id: LOJA_B, embed_installed: true },
      ] },
    })
    const { body } = await get(`?storeId=${LOJA_A}`)
    expect(passo(body, 'store').done).toBe(true)
    // A irmã já ativada não fecha o passo desta loja.
    expect(passo(body, 'embed').done).toBe(false)
  })

  it('sem loja escolhida, qualquer vitrine ativa fecha o passo', async () => {
    db = fakeSupabase({
      rows: { shopify_stores: [{ id: LOJA_A, embed_installed: false }, { id: LOJA_B, embed_installed: true }] },
    })
    const { body } = await get()
    expect(passo(body, 'embed').done).toBe(true)
  })

  it('storeId que não é UUID é recusado, em vez de virar filtro', async () => {
    const { res } = await get('?storeId=abc),(x')
    expect(res.status).toBe(400)
  })

  it('não guarda cache: o roteiro reflete o estado de agora', async () => {
    const { res } = await get()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
