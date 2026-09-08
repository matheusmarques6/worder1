import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FakeSupabase } from '@/tests/fake-supabase'

const mockAuth = vi.fn()
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: (...args: any[]) => mockAuth(...args),
  authError: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}))
// O banco de mentira nasce dentro do mock (o alias @/ não resolve num
// require síncrono dentro de vi.hoisted) e é exposto como __db.
vi.mock('@/lib/supabase-admin', async () => {
  const { createFakeSupabase } = await import('@/tests/fake-supabase')
  const fake = createFakeSupabase()
  return { supabaseAdmin: fake, getSupabaseAdmin: () => fake, __db: fake }
})

import * as adminMod from '@/lib/supabase-admin'
import { GET, PATCH } from './route'
import { __resetUtmSettingsCache } from '@/lib/tracking/utm-settings'

const db = (adminMod as any).__db as FakeSupabase

const ORG = 'org-1'
const OTHER_ORG = 'org-2'
const STORE = 'store-1'
const FOREIGN_STORE = 'store-2'

function getReq(qs = ''): any {
  const url = new URL(`http://localhost/api/settings/utm${qs}`)
  return { nextUrl: url, url: url.toString() }
}
function patchReq(body: any): any {
  return { json: async () => body }
}

beforeEach(() => {
  db.reset()
  __resetUtmSettingsCache()
  mockAuth.mockReset()
  mockAuth.mockResolvedValue({ supabase: db, user: { id: 'u1', organization_id: ORG } })
  db.seed('organizations', [{ id: ORG, email_settings: {} }])
  db.seed('shopify_stores', [
    { id: STORE, organization_id: ORG, shop_name: 'Dr. Groot', settings: { email_settings: { default_sender_email: 'a@worder.email' } } },
    { id: FOREIGN_STORE, organization_id: OTHER_ORG, shop_name: 'Outra', settings: {} },
  ])
})

describe('/api/settings/utm', () => {
  it('GET devolve o padrão Worder, o catálogo de variáveis e a identificação fixa', async () => {
    const res = await GET(getReq(`?storeId=${STORE}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe('default')
    expect(body.settings.campaign.utm_source).toBe('worder')
    expect(body.variables.some((v: any) => v.key === 'campaign_name')).toBe(true)
    expect(body.identification).toContain('worderContactID')
    expect(body.store).toEqual({ id: STORE, name: 'Dr. Groot' })
  })

  it('PATCH salva na loja sem apagar as outras configurações dela, e GET passa a ler "store"', async () => {
    const res = await PATCH(patchReq({
      storeId: STORE,
      settings: {
        campaign: { utm_source: 'drgroot', utm_campaign: '{{campaign_name}}' },
        custom: [{ key: 'utm_store', campaign: '{{store_name}}', automation: '{{store_name}}' }],
      },
    }))
    expect(res.status).toBe(200)
    const saved = await res.json()
    expect(saved.source).toBe('store')
    expect(saved.settings.campaign.utm_source).toBe('drgroot')
    expect(saved.settings.automation.utm_source).toBe('worder')

    const row = db.tables.shopify_stores.find((s: any) => s.id === STORE)!
    expect(row.settings.email_settings.default_sender_email).toBe('a@worder.email')
    expect(row.settings.utm_settings.custom[0].key).toBe('utm_store')

    const again = await (await GET(getReq(`?storeId=${STORE}`))).json()
    expect(again.source).toBe('store')
  })

  it('PATCH recusa parâmetro personalizado com nome reservado ou valor longo demais', async () => {
    const r1 = await PATCH(patchReq({ storeId: STORE, settings: { custom: [{ key: 'worderContactID', campaign: 'x', automation: 'x' }] } }))
    expect(r1.status).toBe(400)
    const r2 = await PATCH(patchReq({ storeId: STORE, settings: { campaign: { utm_source: 'x'.repeat(300) } } }))
    expect(r2.status).toBe(400)
    const r3 = await PATCH(patchReq({ storeId: STORE, settings: 'nada' }))
    expect(r3.status).toBe(400)
  })

  it('multi-tenant: loja de outra organização é 404 no GET e no PATCH', async () => {
    expect((await GET(getReq(`?storeId=${FOREIGN_STORE}`))).status).toBe(404)
    expect((await PATCH(patchReq({ storeId: FOREIGN_STORE, settings: {} }))).status).toBe(404)
    const row = db.tables.shopify_stores.find((s: any) => s.id === FOREIGN_STORE)!
    expect(row.settings.utm_settings).toBeUndefined()
  })

  it('sem storeId edita o padrão da organização; reset devolve a loja ao padrão herdado', async () => {
    const org = await PATCH(patchReq({ settings: { automation: { utm_source: 'org-default' } } }))
    expect((await org.json()).source).toBe('org')
    expect(db.tables.organizations[0].email_settings.utm_settings.automation.utm_source).toBe('org-default')

    await PATCH(patchReq({ storeId: STORE, settings: { automation: { utm_source: 'loja' } } }))
    expect((await (await GET(getReq(`?storeId=${STORE}`))).json()).settings.automation.utm_source).toBe('loja')

    const reset = await PATCH(patchReq({ storeId: STORE, reset: true }))
    const body = await reset.json()
    expect(body.source).toBe('org')
    expect(body.settings.automation.utm_source).toBe('org-default')
    expect((await PATCH(patchReq({ reset: true }))).status).toBe(400)
  })

  it('exige autenticação', async () => {
    mockAuth.mockResolvedValue(null)
    expect((await GET(getReq())).status).toBe(401)
    expect((await PATCH(patchReq({}))).status).toBe(401)
  })
})
