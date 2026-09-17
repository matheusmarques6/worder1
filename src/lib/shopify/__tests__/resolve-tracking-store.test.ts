// =============================================================
// Eventos públicos (pixel, identify, tracking) e a loja a que pertencem.
//
// O tracking.js manda accountId + storeId (muitas vezes nulo) +
// storeDomain. A ordem antiga tentava a organização ANTES do domínio
// e pegava "qualquer loja da organização, limit 1": todo evento da
// loja B sem storeId era carimbado na loja A.
// =============================================================

import { describe, it, expect, beforeEach } from 'vitest'
import { createFakeSupabase } from '@/tests/fake-supabase'
import { resolveTrackingStore, resolveStoreByDomain } from '../resolve-store-by-domain'

const ORG = '425db1ba-99c0-4dbb-9434-27fe9cc03ec6'
const GROOT = 'd5dfd5dd-1d77-425e-a099-850338078999'
const MEDICUBE = 'd04a4411-abc2-4135-bb88-e1f3c31d3b1b'

const fake = createFakeSupabase()

beforeEach(() => {
  fake.reset()
  fake.seed('shopify_stores', [
    { id: GROOT, organization_id: ORG, shop_domain: '0p7tsk-i5.myshopify.com', primary_domain: 'drgroot.com', shop_domain_aliases: ['ufnij1-ex.myshopify.com'], is_active: true, installed_at: '2026-08-20' },
    { id: MEDICUBE, organization_id: ORG, shop_domain: '32frja-mb.myshopify.com', primary_domain: 'medicube.com.br', shop_domain_aliases: [], is_active: true, installed_at: '2026-09-04' },
  ])
})

describe('resolveTrackingStore', () => {
  it('storeId manda', async () => {
    const s = await resolveTrackingStore(fake as any, { storeId: MEDICUBE, accountId: ORG, storeDomain: 'drgroot.com' })
    expect(s?.id).toBe(MEDICUBE)
  })

  it('o caso do bug: sem storeId, o DOMÍNIO decide antes da organização', async () => {
    const s = await resolveTrackingStore(fake as any, { storeId: null, accountId: ORG, storeDomain: 'https://www.drgroot.com/products/x' })
    expect(s?.id).toBe(GROOT)
  })

  it('domínio público (primary_domain) e alias myshopify resolvem a mesma loja', async () => {
    expect((await resolveTrackingStore(fake as any, { storeDomain: 'medicube.com.br' }))?.id).toBe(MEDICUBE)
    expect((await resolveTrackingStore(fake as any, { storeDomain: 'ufnij1-ex.myshopify.com' }))?.id).toBe(GROOT)
  })

  it('só a organização, com DUAS lojas: descarta em vez de chutar', async () => {
    const s = await resolveTrackingStore(fake as any, { accountId: ORG })
    expect(s).toBeNull()
  })

  it('só a organização, com UMA loja: resolve', async () => {
    fake.seed('shopify_stores', [
      { id: GROOT, organization_id: ORG, shop_domain: '0p7tsk-i5.myshopify.com', primary_domain: 'drgroot.com', shop_domain_aliases: [], is_active: true },
    ])
    const s = await resolveTrackingStore(fake as any, { accountId: ORG })
    expect(s?.id).toBe(GROOT)
  })

  it('domínio parecido NÃO casa (sem sufixo)', async () => {
    // "groot.com" termina igual a "drgroot.com"; o antigo ilike('%groot.com') casaria.
    const s = await resolveStoreByDomain(fake as any, 'groot.com', { activeOnly: true })
    expect(s).toBeNull()
  })
})
