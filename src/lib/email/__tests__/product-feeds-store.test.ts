// =============================================================
// O feed de produtos é de UMA loja: a do e-mail.
//
// O defeito: uma organização com duas lojas (Dr. Groot, antiga, e
// Medicube, cadastrada hoje) mandou um e-mail da Dr. Groot cujos
// produtos apontavam para a Medicube. O resolvedor escolhia "a loja
// ativa mais nova da organização" para montar o link e lia o catálogo
// da organização inteira. Estes testes fixam a regra nova: loja
// explícita → loja do evento → loja do contato → única loja ativa →
// nada. Nunca "qualquer uma".
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeSupabase } from '@/tests/fake-supabase'

const fake = createFakeSupabase()
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => fake.from(t), rpc: (n: string, a: any) => fake.rpc(n, a) },
}))

import { resolveProductFeed, resolveFeedStore, __resetFeedStoreCache } from '../product-feeds'

const ORG = '425db1ba-99c0-4dbb-9434-27fe9cc03ec6'
const OUTRA_ORG = '99999999-9999-4999-8999-999999999999'
const GROOT = 'd5dfd5dd-1d77-425e-a099-850338078999'
const MEDICUBE = 'd04a4411-abc2-4135-bb88-e1f3c31d3b1b'
const ALHEIA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CONTATO_GROOT = 'c0000000-0000-4000-8000-000000000001'

function seedDuasLojas() {
  fake.seed('shopify_stores', [
    { id: GROOT, organization_id: ORG, shop_name: 'Dr. Groot', shop_domain: '0p7tsk-i5.myshopify.com', primary_domain: 'drgroot.com', is_active: true, installed_at: '2026-08-20' },
    { id: MEDICUBE, organization_id: ORG, shop_name: 'Medicube', shop_domain: '32frja-mb.myshopify.com', primary_domain: null, is_active: true, installed_at: '2026-09-04' },
    { id: ALHEIA, organization_id: OUTRA_ORG, shop_name: 'Alheia', shop_domain: 'alheia.myshopify.com', primary_domain: 'alheia.com', is_active: true, installed_at: '2026-01-01' },
  ])
  fake.seed('shopify_products', [
    { shopify_product_id: '1', organization_id: ORG, store_id: GROOT, title: 'Shampoo Groot', handle: 'shampoo-groot', price: 10, status: 'active', images: [], created_at: '2026-08-01', hidden_from_feeds: false, available: true },
    { shopify_product_id: '2', organization_id: ORG, store_id: GROOT, title: 'Tônico Groot', handle: 'tonico-groot', price: 20, status: 'active', images: [], created_at: '2026-08-02', hidden_from_feeds: false, available: true },
    { shopify_product_id: '3', organization_id: ORG, store_id: MEDICUBE, title: 'Sérum Medicube', handle: 'serum-medicube', price: 30, status: 'active', images: [], created_at: '2026-09-04', hidden_from_feeds: false, available: null },
    { shopify_product_id: '4', organization_id: OUTRA_ORG, store_id: ALHEIA, title: 'Coisa alheia', handle: 'alheia', price: 99, status: 'active', images: [], created_at: '2026-09-04', hidden_from_feeds: false, available: true },
  ])
  fake.seed('contacts', [
    { id: CONTATO_GROOT, organization_id: ORG, store_id: GROOT, email: 'cliente@groot.com' },
  ])
  fake.seed('tracking_events', [])
  fake.seed('recovery_carts', [])
  fake.seed('product_feeds', [])
}

beforeEach(() => {
  fake.reset()
  __resetFeedStoreCache()
  seedDuasLojas()
})

describe('resolveFeedStore — de qual loja é este e-mail?', () => {
  it('a loja explícita manda, mesmo não sendo a mais nova', async () => {
    const s = await resolveFeedStore(ORG, GROOT)
    expect(s.id).toBe(GROOT)
    expect(s.source).toBe('explicit')
    expect(s.host).toBe('drgroot.com')
  })

  it('o host é o domínio principal; sem ele, o myshopify', async () => {
    expect((await resolveFeedStore(ORG, GROOT)).host).toBe('drgroot.com')
    expect((await resolveFeedStore(ORG, MEDICUBE)).host).toBe('32frja-mb.myshopify.com')
  })

  it('loja de OUTRA organização é ignorada, venha de onde vier o id', async () => {
    const s = await resolveFeedStore(ORG, ALHEIA)
    expect(s.id).not.toBe(ALHEIA)
    // Sem contato nem evento, e com duas lojas na organização: nada.
    expect(s.id).toBeNull()
    expect(s.source).toBe('none')
  })

  it('sem loja explícita, o evento que disparou decide', async () => {
    const s = await resolveFeedStore(ORG, null, null, { store_id: MEDICUBE, event_type: 'checkout_abandoned' })
    expect(s.id).toBe(MEDICUBE)
    expect(s.source).toBe('event')
  })

  it('sem loja nem evento, o contato (que é de UMA loja) decide', async () => {
    const s = await resolveFeedStore(ORG, null, CONTATO_GROOT)
    expect(s.id).toBe(GROOT)
    expect(s.source).toBe('contact')
  })

  it('com duas lojas e nenhuma pista, NÃO adivinha', async () => {
    const s = await resolveFeedStore(ORG)
    expect(s.id).toBeNull()
    expect(s.host).toBe('')
    expect(s.source).toBe('none')
  })

  it('organização com uma única loja ativa resolve sozinha', async () => {
    fake.seed('shopify_stores', [
      { id: GROOT, organization_id: ORG, shop_domain: '0p7tsk-i5.myshopify.com', primary_domain: 'drgroot.com', is_active: true },
      // Loja "sem integração" (domínio sintético) não conta.
      { id: MEDICUBE, organization_id: ORG, shop_domain: 'manual-nova-abc.worder.local', primary_domain: null, is_active: true },
      // Loja desativada não conta.
      { id: ALHEIA, organization_id: ORG, shop_domain: 'velha.myshopify.com', primary_domain: null, is_active: false },
    ])
    const s = await resolveFeedStore(ORG)
    expect(s.id).toBe(GROOT)
    expect(s.source).toBe('single')
  })
})

describe('resolveProductFeed — produtos e links só da loja do e-mail', () => {
  it('bestsellers da Dr. Groot: só produtos dela, links em drgroot.com', async () => {
    const products = await resolveProductFeed({ orgId: ORG, storeId: GROOT, feedType: 'bestsellers', maxProducts: 4 })
    expect(products.map((p) => p.title).sort()).toEqual(['Shampoo Groot', 'Tônico Groot'])
    for (const p of products) expect(p.url.startsWith('https://drgroot.com/products/')).toBe(true)
    expect(products.some((p) => p.url.includes('medicube'))).toBe(false)
  })

  it('o caso do bug: e-mail da Dr. Groot com a Medicube recém-cadastrada NÃO vaza', async () => {
    // Antes: getShopDomain(org) devolvia a loja mais nova (Medicube) e o
    // catálogo vinha da organização inteira.
    const products = await resolveProductFeed({ orgId: ORG, storeId: GROOT, feedType: 'newest', maxProducts: 10 })
    expect(products.every((p) => p.url.includes('drgroot.com'))).toBe(true)
    expect(products.find((p) => p.title === 'Sérum Medicube')).toBeUndefined()
  })

  it('fluxo da organização inteira: a loja vem do contato', async () => {
    const products = await resolveProductFeed({ orgId: ORG, feedType: 'recommendations', contactId: CONTATO_GROOT, maxProducts: 4 })
    expect(products.length).toBe(2)
    expect(products.every((p) => p.url.includes('drgroot.com'))).toBe(true)
  })

  it('sem pista nenhuma numa organização com duas lojas, o bloco fica vazio em vez de misturar', async () => {
    const products = await resolveProductFeed({ orgId: ORG, feedType: 'bestsellers', maxProducts: 4 })
    expect(products).toEqual([])
  })

  it('random também respeita a loja', async () => {
    const products = await resolveProductFeed({ orgId: ORG, storeId: MEDICUBE, feedType: 'random', maxProducts: 4 })
    expect(products.map((p) => p.title)).toEqual(['Sérum Medicube'])
    expect(products[0].url).toBe('https://32frja-mb.myshopify.com/products/serum-medicube')
  })

  it('recently_viewed: produto visto na loja irmã não entra no e-mail desta', async () => {
    fake.seed('tracking_events', [
      { visitor_id: CONTATO_GROOT, event_type: 'product_viewed', properties: { product_id: '3' }, created_at: '2026-09-04' },
      { visitor_id: CONTATO_GROOT, event_type: 'product_viewed', properties: { product_id: '1' }, created_at: '2026-09-03' },
    ])
    const products = await resolveProductFeed({ orgId: ORG, storeId: GROOT, feedType: 'recently_viewed', contactId: CONTATO_GROOT, maxProducts: 4 })
    expect(products.map((p) => p.title)).toEqual(['Shampoo Groot'])
  })

  it('produto oculto pelo lojista não entra em feed nenhum', async () => {
    fake.tables.shopify_products.find((p) => p.shopify_product_id === '1')!.hidden_from_feeds = true
    const products = await resolveProductFeed({ orgId: ORG, storeId: GROOT, feedType: 'bestsellers', maxProducts: 4 })
    expect(products.map((p) => p.title)).toEqual(['Tônico Groot'])
  })

  it('produto esgotado (available=false) sai do feed; sem informação (null) fica', async () => {
    fake.tables.shopify_products.find((p) => p.shopify_product_id === '2')!.available = false
    fake.tables.shopify_products.find((p) => p.shopify_product_id === '1')!.available = null
    const products = await resolveProductFeed({ orgId: ORG, storeId: GROOT, feedType: 'newest', maxProducts: 4 })
    expect(products.map((p) => p.title)).toEqual(['Shampoo Groot'])
  })

  it('trigger_auto: itens do evento são enriquecidos com o catálogo e o host DA loja', async () => {
    const products = await resolveProductFeed({
      orgId: ORG, storeId: GROOT, feedType: 'trigger_auto', maxProducts: 4,
      eventData: { event_type: 'checkout_abandoned', Items: [{ ProductID: '1', ProductName: 'Shampoo Groot', ItemPrice: '10' }] },
    })
    expect(products.length).toBe(1)
    expect(products[0].url).toBe('https://drgroot.com/products/shampoo-groot')
  })
})
