// =============================================================
// Produtos excluídos de UM feed.
//
// O lojista monta um feed ("mais vendidos", "carrinho abandonado") e
// escolhe produtos que aquele feed nunca pode mostrar — fora de linha,
// brinde, produto em disputa. É diferente do `hidden_from_feeds`, que
// esconde o produto de TODOS os feeds da loja.
//
// A regra que estes testes seguram: um produto excluído não chega ao
// cliente por caminho nenhum — nem vindo do catálogo, nem vindo do
// evento (carrinho, pedido) — e a exclusão de um feed não vaza para
// outro feed nem para outra organização.
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeSupabase } from '@/tests/fake-supabase'

const fake = createFakeSupabase()
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => fake.from(t), rpc: (n: string, a: any) => fake.rpc(n, a) },
}))

import { resolveProductFeed, isExcluded, safeIdList, __resetFeedStoreCache } from '../product-feeds'
import { normalizeExcluded } from '../product-feed-config'

const ORG = '425db1ba-99c0-4dbb-9434-27fe9cc03ec6'
const OUTRA_ORG = '99999999-9999-4999-8999-999999999999'
const LOJA = 'd5dfd5dd-1d77-425e-a099-850338078999'
const FEED_COM_EXCLUSAO = 'f0000000-0000-4000-8000-000000000001'
const FEED_SEM_EXCLUSAO = 'f0000000-0000-4000-8000-000000000002'
const FEED_DE_OUTRA_ORG = 'f0000000-0000-4000-8000-000000000003'

function seed() {
  fake.seed('shopify_stores', [
    { id: LOJA, organization_id: ORG, shop_name: 'Dr. Groot', shop_domain: '0p7tsk-i5.myshopify.com', primary_domain: 'drgroot.com', is_active: true },
  ])
  fake.seed('shopify_products', [
    { shopify_product_id: '101', organization_id: ORG, store_id: LOJA, title: 'Shampoo', handle: 'shampoo', price: 10, status: 'active', images: [], created_at: '2026-08-05', hidden_from_feeds: false, available: true },
    { shopify_product_id: '102', organization_id: ORG, store_id: LOJA, title: 'Tônico', handle: 'tonico', price: 20, status: 'active', images: [], created_at: '2026-08-04', hidden_from_feeds: false, available: true },
    { shopify_product_id: '103', organization_id: ORG, store_id: LOJA, title: 'Máscara', handle: 'mascara', price: 30, status: 'active', images: [], created_at: '2026-08-03', hidden_from_feeds: false, available: true },
    { shopify_product_id: '104', organization_id: ORG, store_id: LOJA, title: 'Condicionador', handle: 'condicionador', price: 40, status: 'active', images: [], created_at: '2026-08-02', hidden_from_feeds: false, available: true },
  ])
  fake.seed('product_feeds', [
    { id: FEED_COM_EXCLUSAO, organization_id: ORG, store_id: LOJA, name: 'destaques', filters: [], excluded_product_ids: ['102'] },
    { id: FEED_SEM_EXCLUSAO, organization_id: ORG, store_id: LOJA, name: 'tudo', filters: [], excluded_product_ids: [] },
    { id: FEED_DE_OUTRA_ORG, organization_id: OUTRA_ORG, store_id: LOJA, name: 'alheio', filters: [], excluded_product_ids: ['101', '102', '103', '104'] },
  ])
  fake.seed('contacts', [])
  fake.seed('tracking_events', [])
  fake.seed('recovery_carts', [])
}

beforeEach(() => {
  fake.reset()
  __resetFeedStoreCache()
  seed()
})

describe('normalizeExcluded — o que o cliente manda vira lista de ids', () => {
  it('mantém só id de verdade, sem repetição', () => {
    expect(normalizeExcluded(['101', '101', ' 102 ', '', null, undefined])).toEqual(['101', '102'])
  })

  it('recusa o que não é id: espaço, aspas, vírgula, parêntese', () => {
    expect(normalizeExcluded(['1 2', 'a"b', 'a,b', '(x)', 'ok_1-2'])).toEqual(['ok_1-2'])
  })

  it('não é depósito: corta em 500 e recusa id gigante', () => {
    const muitos = Array.from({ length: 600 }, (_, i) => String(i))
    expect(normalizeExcluded(muitos)).toHaveLength(500)
    expect(normalizeExcluded(['x'.repeat(65)])).toEqual([])
  })

  it('coisa que não é lista vira lista vazia', () => {
    expect(normalizeExcluded(null)).toEqual([])
    expect(normalizeExcluded('101')).toEqual([])
    expect(normalizeExcluded({ 0: '101' })).toEqual([])
  })
})

describe('safeIdList — a lista que vai para o filtro do banco', () => {
  it('monta o formato do PostgREST com os ids entre aspas', () => {
    expect(safeIdList(new Set(['101', '102']))).toBe('("101","102")')
  })

  it('sem exclusão nenhuma, não filtra nada', () => {
    expect(safeIdList(new Set())).toBeNull()
    expect(safeIdList(null)).toBeNull()
  })

  it('id com sintaxe de filtro dentro não atravessa', () => {
    expect(safeIdList(new Set(['101', '"),(select 1)--']))).toBe('("101")')
    expect(safeIdList(new Set(['"),(select 1)--']))).toBeNull()
  })
})

describe('isExcluded — reconhece o produto venha o id de onde vier', () => {
  const excl = new Set(['777'])

  it('pega o id do catálogo e o do evento (pixel, webhook, cru)', () => {
    expect(isExcluded({ product_id: '777' }, excl)).toBe(true)
    expect(isExcluded({ shopify_product_id: 777 }, excl)).toBe(true)
    expect(isExcluded({ ProductID: 777 }, excl)).toBe(true)
    expect(isExcluded({ productId: '777' }, excl)).toBe(true)
    expect(isExcluded({ product: { id: 777 } }, excl)).toBe(true)
    expect(isExcluded({ id: '777' }, excl)).toBe(true)
  })

  it('outro produto passa; sem exclusão, ninguém é barrado', () => {
    expect(isExcluded({ product_id: '778' }, excl)).toBe(false)
    expect(isExcluded({ product_id: null }, excl)).toBe(false)
    expect(isExcluded(null, excl)).toBe(false)
    expect(isExcluded({ product_id: '777' }, new Set())).toBe(false)
  })
})

describe('feed de catálogo', () => {
  it('o produto excluído não aparece', async () => {
    const p = await resolveProductFeed({ orgId: ORG, storeId: LOJA, feedId: FEED_COM_EXCLUSAO, feedType: 'newest', maxProducts: 10 })
    expect(p.map((x: any) => x.title)).not.toContain('Tônico')
    expect(p.map((x: any) => x.title).sort()).toEqual(['Condicionador', 'Máscara', 'Shampoo'])
  })

  it('a exclusão não abre buraco: pedindo 3, vêm 3', async () => {
    // Sem o filtro no banco, o limite pegaria 101/102/103 e o 102 sairia
    // depois — o e-mail chegaria com 2 produtos numa grade de 3.
    const p = await resolveProductFeed({ orgId: ORG, storeId: LOJA, feedId: FEED_COM_EXCLUSAO, feedType: 'newest', maxProducts: 3 })
    expect(p).toHaveLength(3)
    expect(p.map((x: any) => x.product_id)).not.toContain('102')
  })

  it('feed sem exclusão continua mostrando tudo', async () => {
    const p = await resolveProductFeed({ orgId: ORG, storeId: LOJA, feedId: FEED_SEM_EXCLUSAO, feedType: 'newest', maxProducts: 10 })
    expect(p).toHaveLength(4)
  })

  it('sem feed nenhum, nada é excluído', async () => {
    const p = await resolveProductFeed({ orgId: ORG, storeId: LOJA, feedType: 'newest', maxProducts: 10 })
    expect(p).toHaveLength(4)
  })

  it('exclusão de feed de outra organização não vale aqui', async () => {
    const p = await resolveProductFeed({ orgId: ORG, storeId: LOJA, feedId: FEED_DE_OUTRA_ORG, feedType: 'newest', maxProducts: 10 })
    expect(p).toHaveLength(4)
  })
})

describe('feed de evento — carrinho e pedido', () => {
  const carrinho = {
    Items: [
      { ProductID: '101', ProductName: 'Shampoo', ItemPrice: '10' },
      { ProductID: '102', ProductName: 'Tônico', ItemPrice: '20' },
      { ProductID: '103', ProductName: 'Máscara', ItemPrice: '30' },
    ],
  }

  it('o excluído não vai no carrinho abandonado, mesmo tendo sido comprado', async () => {
    const p = await resolveProductFeed({
      orgId: ORG, storeId: LOJA, feedId: FEED_COM_EXCLUSAO, feedType: 'trigger_cart',
      maxProducts: 4, eventData: carrinho,
    })
    expect(p.map((x: any) => x.title)).toEqual(['Shampoo', 'Máscara'])
  })

  it('pedindo 2 de um carrinho de 3 com 1 excluído, ainda vêm 2', async () => {
    const p = await resolveProductFeed({
      orgId: ORG, storeId: LOJA, feedId: FEED_COM_EXCLUSAO, feedType: 'trigger_cart',
      maxProducts: 2, eventData: carrinho,
    })
    expect(p).toHaveLength(2)
    expect(p.map((x: any) => x.product_id)).not.toContain('102')
  })

  it('o mesmo vale para os produtos do pedido', async () => {
    const p = await resolveProductFeed({
      orgId: ORG, storeId: LOJA, feedId: FEED_COM_EXCLUSAO, feedType: 'trigger_order',
      maxProducts: 4, eventData: { line_items: carrinho.Items },
    })
    expect(p.map((x: any) => x.product_id)).toEqual(['101', '103'])
  })

  it('sem exclusão, o carrinho vai inteiro', async () => {
    const p = await resolveProductFeed({
      orgId: ORG, storeId: LOJA, feedId: FEED_SEM_EXCLUSAO, feedType: 'trigger_cart',
      maxProducts: 4, eventData: carrinho,
    })
    expect(p).toHaveLength(3)
  })
})
