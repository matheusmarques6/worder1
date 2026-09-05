import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeSupabase } from '@/tests/fake-supabase'

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }))

import { getUtmSettings, saveStoreUtmSettings, saveOrgUtmSettings, __resetUtmSettingsCache } from '../utm-settings'
import { DEFAULT_UTM_SETTINGS, normalizeUtmSettings } from '../link-params'

const db = createFakeSupabase()
const ORG = 'org-1'
const STORE_A = 'store-a'
const STORE_B = 'store-b'

beforeEach(() => {
  db.reset()
  __resetUtmSettingsCache()
  db.seed('organizations', [{ id: ORG, email_settings: {} }])
  db.seed('shopify_stores', [
    { id: STORE_A, organization_id: ORG, settings: { utm_settings: { campaign: { utm_source: 'loja-a' } } } },
    { id: STORE_B, organization_id: ORG, settings: {} },
  ])
})

describe('getUtmSettings — a loja decide, a organização é só o padrão', () => {
  it('loja com configuração própria', async () => {
    const r = await getUtmSettings(ORG, STORE_A, db)
    expect(r.source).toBe('store')
    expect(r.settings.campaign.utm_source).toBe('loja-a')
    expect(r.settings.automation.utm_source).toBe('worder')
  })

  it('loja sem configuração cai no padrão da organização, não na loja irmã', async () => {
    db.seed('organizations', [{ id: ORG, email_settings: { utm_settings: { campaign: { utm_source: 'org-x' } } } }])
    const r = await getUtmSettings(ORG, STORE_B, db)
    expect(r.source).toBe('org')
    expect(r.settings.campaign.utm_source).toBe('org-x')
  })

  it('legado da página antiga é honrado quando não há configuração nova', async () => {
    db.seed('organizations', [{ id: ORG, email_settings: { utm_source: 'antigo', utm_medium: 'news', utm_auto_add: true } }])
    const r = await getUtmSettings(ORG, STORE_B, db)
    expect(r.source).toBe('legacy')
    expect(r.settings.automation.utm_source).toBe('antigo')
    expect(r.settings.campaign.utm_medium).toBe('news')
  })

  it('sem nada configurado → padrão Worder; falha de banco também', async () => {
    const r = await getUtmSettings(ORG, STORE_B, db)
    expect(r.source).toBe('default')
    expect(r.settings).toEqual(DEFAULT_UTM_SETTINGS)
    const broken = { from: () => { throw new Error('boom') } }
    const r2 = await getUtmSettings(ORG, STORE_A, broken)
    expect(r2.source).toBe('default')
  })

  it('cache por loja é invalidado ao salvar', async () => {
    expect((await getUtmSettings(ORG, STORE_B, db)).source).toBe('default')
    const saved = await saveStoreUtmSettings(STORE_B, normalizeUtmSettings({ campaign: { utm_source: 'b' } }), db)
    expect(saved.error).toBeNull()
    const r = await getUtmSettings(ORG, STORE_B, db)
    expect(r.source).toBe('store')
    expect(r.settings.campaign.utm_source).toBe('b')
    // A loja A não foi afetada.
    expect((await getUtmSettings(ORG, STORE_A, db)).settings.campaign.utm_source).toBe('loja-a')
  })

  it('salvar na loja preserva as outras chaves do settings jsonb', async () => {
    db.seed('shopify_stores', [{ id: STORE_B, organization_id: ORG, settings: { email_settings: { default_sender_email: 'x@worder.email' } } }])
    await saveStoreUtmSettings(STORE_B, DEFAULT_UTM_SETTINGS, db)
    const row = db.tables.shopify_stores.find((s) => s.id === STORE_B)!
    expect(row.settings.email_settings.default_sender_email).toBe('x@worder.email')
    expect(row.settings.utm_settings).toEqual(DEFAULT_UTM_SETTINGS)
  })

  it('salvar na organização invalida o cache de todas as lojas da org sem config própria', async () => {
    expect((await getUtmSettings(ORG, STORE_B, db)).source).toBe('default')
    await saveOrgUtmSettings(ORG, normalizeUtmSettings({ automation: { utm_source: 'org-auto' } }), db)
    const r = await getUtmSettings(ORG, STORE_B, db)
    expect(r.source).toBe('org')
    expect(r.settings.automation.utm_source).toBe('org-auto')
    const org = db.tables.organizations[0]
    expect(org.email_settings.utm_settings.automation.utm_source).toBe('org-auto')
  })
})
