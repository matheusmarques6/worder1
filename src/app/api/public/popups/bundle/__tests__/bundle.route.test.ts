// A rota do bundle rodando de verdade: requisição entra, JavaScript sai.
// É o que a vitrine de cada loja baixa, então os erros aqui são os que
// chegam ao visitante — e a fronteira entre lojas é o que mais importa.
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
vi.mock('@/lib/popups/experiment-service', () => ({
  attachExperiments: async () => new Map(),
}))

const POPUP = (over: Record<string, any> = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  organization_id: 'org-1',
  name: 'Boas-vindas',
  status: 'published',
  form_type: 'popup',
  store_id: 'store-a',
  updated_at: '2026-09-01T00:00:00Z',
  ab_parent_id: null,
  success_message: '',
  redirect_url: null,
  behavior: { display: { timeEnabled: true, delay: 3 } },
  design_json: {
    formType: 'popup',
    styles: { width: 480 },
    steps: [{ blocks: [{ id: 'e', type: 'email', props: { required: true } }, { id: 'b', type: 'button', props: { text: 'Ok', action: 'submit' } }] }],
    successStep: { blocks: [{ id: 's', type: 'text', props: { content: 'Obrigado' } }] },
  },
  ...over,
})

async function get(domain: string, headers: Record<string, string> = {}) {
  const { GET } = await import('../route')
  const req = new NextRequest(`https://app.test/api/public/popups/bundle?domain=${encodeURIComponent(domain)}`, { headers })
  return GET(req)
}

beforeEach(() => {
  vi.resetModules()
  storeByDomain = { 'loja-a.myshopify.com': { id: 'store-a', organization_id: 'org-1' } }
  db = fakeSupabase({ rows: { crm_forms: [POPUP()] } })
})

describe('bundle de popups da loja', () => {
  it('serve o runtime uma vez e uma chamada por popup', async () => {
    db = fakeSupabase({ rows: { crm_forms: [POPUP(), POPUP({ id: '00000000-0000-4000-8000-000000000002', name: 'Saida' })] } })
    const res = await get('loja-a.myshopify.com')
    expect(res.status).toBe(200)
    const js = await res.text()

    const key = js.match(/window\["(wfRT[a-z0-9]+)"\]=function/)
    expect(key, 'o runtime tem de estar definido uma vez').toBeTruthy()
    expect(js.split('=function(FID,FNAME,BU,D,B,EXP,VARIANT_ID,SMSG)').length - 1).toBe(1)
    expect(js.split(`window["${key![1]}"](`).length - 1).toBe(2)
    expect(js).toContain('00000000-0000-4000-8000-000000000001')
    expect(js).toContain('00000000-0000-4000-8000-000000000002')
  })

  it('o JavaScript servido é executável', async () => {
    const res = await get('loja-a.myshopify.com')
    const js = await res.text()
    expect(() => new Function(js)).not.toThrow()
  })

  it('domínio de outra organização nunca recebe os popups desta', async () => {
    storeByDomain['rival.myshopify.com'] = { id: 'store-x', organization_id: 'org-2' }
    await get('rival.myshopify.com')
    const q = db.on('crm_forms')[0]
    expect(q, 'a rota tem de consultar os popups').toBeTruthy()
    expect(q.filters.find((f) => f.column === 'organization_id')?.value).toBe('org-2')
  })

  it('popup de outra loja da mesma organização não entra no bundle desta', async () => {
    db = fakeSupabase({ rows: { crm_forms: [POPUP(), POPUP({ id: '00000000-0000-4000-8000-000000000003', store_id: 'store-b' })] } })
    const js = await (await get('loja-a.myshopify.com')).text()
    expect(js).toContain('00000000-0000-4000-8000-000000000001')
    expect(js).not.toContain('00000000-0000-4000-8000-000000000003')
  })

  it('variante de teste A/B não vira um popup solto na loja', async () => {
    db = fakeSupabase({ rows: { crm_forms: [POPUP(), POPUP({ id: '00000000-0000-4000-8000-000000000004', ab_parent_id: '00000000-0000-4000-8000-000000000001' })] } })
    const js = await (await get('loja-a.myshopify.com')).text()
    expect(js).not.toContain('00000000-0000-4000-8000-000000000004')
  })

  it('formulário clássico publicado não vira popup em branco', async () => {
    db = fakeSupabase({ rows: { crm_forms: [POPUP({ design_json: {}, form_type: 'embed' })] } })
    const js = await (await get('loja-a.myshopify.com')).text()
    expect(js).toContain('nenhum popup publicado')
  })

  it('domínio desconhecido não recebe nada e nem consulta popups', async () => {
    const res = await get('site-qualquer.com')
    expect(await res.text()).toContain('loja não encontrada')
    expect(db.on('crm_forms')).toHaveLength(0)
  })

  it('ETag responde 304 quando nada mudou', async () => {
    const first = await get('loja-a.myshopify.com')
    const etag = first.headers.get('etag')!
    expect(etag).toBeTruthy()
    const second = await get('loja-a.myshopify.com', { 'if-none-match': etag })
    expect(second.status).toBe(304)
  })

  it('o ETag muda quando o popup muda', async () => {
    const a = (await get('loja-a.myshopify.com')).headers.get('etag')
    db = fakeSupabase({ rows: { crm_forms: [POPUP({ updated_at: '2026-09-02T00:00:00Z' })] } })
    const b = (await get('loja-a.myshopify.com')).headers.get('etag')
    expect(b).not.toBe(a)
  })
})
