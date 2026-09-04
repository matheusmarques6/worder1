// =============================================================
// Criar produto na Shopify: a sequência de mutations, o que vira aviso
// e o que vira erro de permissão.
// =============================================================

import { describe, it, expect } from 'vitest'
import {
  createProductInShopify, ShopifyScopeError, ShopifyUserError, productNodeToRow,
} from '../products-admin'
import { ShopifyGraphQLError } from '../graphql-client'

const store = { id: 's1', organization_id: 'o1', shop_domain: 'x.myshopify.com', access_token: 'tok' }

const productNode = {
  id: 'gid://shopify/Product/100', title: 'Sérum', handle: 'serum', status: 'ACTIVE', vendor: 'Groot',
  productType: 'Skincare', tags: ['novo'], descriptionHtml: '<p>Bom</p>', totalInventory: 5,
  createdAt: '2026-09-04T00:00:00Z', updatedAt: '2026-09-04T00:00:00Z', publishedAt: null,
  variants: { nodes: [{
    id: 'gid://shopify/ProductVariant/200', title: 'Default', sku: 'SKU1', price: '49.90', compareAtPrice: '59.90',
    inventoryQuantity: 5, inventoryPolicy: 'DENY', availableForSale: true, barcode: null,
    inventoryItem: { id: 'gid://shopify/InventoryItem/300', tracked: true },
  }] },
  images: { nodes: [{ url: 'https://cdn.shopify.com/a.jpg', altText: 'Sérum' }] },
}

/** Cliente falso: responde por operação e registra as chamadas. */
function fakeGql(overrides: Record<string, (vars: any) => any> = {}) {
  const calls: Array<{ op: string; vars: any }> = []
  const defaults: Record<string, (vars: any) => any> = {
    WorderCreateProduct: () => ({ data: { productCreate: {
      product: { id: 'gid://shopify/Product/100', variants: { nodes: [{ id: 'gid://shopify/ProductVariant/200', inventoryItem: { id: 'gid://shopify/InventoryItem/300' } }] } },
      userErrors: [],
    } } }),
    WorderUpdateVariant: () => ({ data: { productVariantsBulkUpdate: { productVariants: [{ id: 'gid://shopify/ProductVariant/200', inventoryItem: { id: 'gid://shopify/InventoryItem/300', tracked: true } }], userErrors: [] } } }),
    WorderPrimaryLocation: () => ({ data: { locations: { nodes: [{ id: 'gid://shopify/Location/1', name: 'Loja' }] } } }),
    WorderSetInventory: () => ({ data: { inventorySetQuantities: { inventoryAdjustmentGroup: { reason: 'correction' }, userErrors: [] } } }),
    WorderPublications: () => ({ data: { publications: { nodes: [{ id: 'gid://shopify/Publication/9', name: 'Online Store', catalog: { title: 'Online Store' } }] } } }),
    WorderPublish: () => ({ data: { publishablePublish: { userErrors: [] } } }),
    WorderProductById: () => ({ data: { product: productNode } }),
  }
  const handlers = { ...defaults, ...overrides }
  const gql = async (_store: any, query: string, vars: any) => {
    const op = (query.match(/(?:mutation|query)\s+(\w+)/) || [])[1] || 'unknown'
    calls.push({ op, vars })
    const h = handlers[op]
    if (!h) throw new Error(`sem handler para ${op}`)
    return h(vars)
  }
  return { gql: gql as any, calls }
}

const input = {
  title: 'Sérum', price: 49.9, compareAtPrice: 59.9, sku: 'SKU1', trackInventory: true, quantity: 5,
  status: 'active' as const, vendor: 'Groot', productType: 'Skincare', tags: ['novo'],
  imageUrls: ['https://cdn.worder.email/storage/v1/object/public/email-images/o1/a.png'],
}

describe('createProductInShopify — caminho feliz', () => {
  it('cria, define variante, estoque, publica e relê', async () => {
    const { gql, calls } = fakeGql()
    const r = await createProductInShopify(store as any, input, gql)
    expect(calls.map((c) => c.op)).toEqual([
      'WorderCreateProduct', 'WorderUpdateVariant', 'WorderPrimaryLocation', 'WorderSetInventory',
      'WorderPublications', 'WorderPublish', 'WorderProductById',
    ])
    expect(r.warnings).toEqual([])
    expect(r.shopifyProductId).toBe('100')
    expect(r.row.price).toBe(49.9)
    expect(r.row.available).toBe(true)
    expect(r.row.variants[0].inventory_item_id).toBe('300')
  })

  it('manda preço como string com duas casas, SKU e controle de estoque na variante', async () => {
    const { gql, calls } = fakeGql()
    await createProductInShopify(store as any, input, gql)
    const upd = calls.find((c) => c.op === 'WorderUpdateVariant')!
    expect(upd.vars.variants[0]).toMatchObject({
      id: 'gid://shopify/ProductVariant/200', price: '49.90', compareAtPrice: '59.90',
      inventoryItem: { sku: 'SKU1', tracked: true }, inventoryPolicy: 'DENY',
    })
    const create = calls.find((c) => c.op === 'WorderCreateProduct')!
    expect(create.vars.product.status).toBe('ACTIVE')
    expect(create.vars.media[0]).toMatchObject({ mediaContentType: 'IMAGE' })
  })

  it('sem controle de estoque não mexe em inventário; rascunho não publica', async () => {
    const { gql, calls } = fakeGql()
    await createProductInShopify(store as any, { ...input, trackInventory: false, quantity: 10, status: 'draft' }, gql)
    const ops = calls.map((c) => c.op)
    expect(ops).not.toContain('WorderSetInventory')
    expect(ops).not.toContain('WorderPublish')
    const upd = calls.find((c) => c.op === 'WorderUpdateVariant')!
    expect(upd.vars.variants[0].inventoryItem.tracked).toBe(false)
  })
})

describe('createProductInShopify — permissões', () => {
  const denied = () => { throw new ShopifyGraphQLError('Access denied for productCreate field. Required access: `write_products` access scope.', [{ message: 'Access denied', extensions: { code: 'ACCESS_DENIED' } }]) }

  it('sem write_products é erro claro, com o scope que falta', async () => {
    const { gql } = fakeGql({ WorderCreateProduct: denied })
    await expect(createProductInShopify(store as any, input, gql)).rejects.toBeInstanceOf(ShopifyScopeError)
    await expect(createProductInShopify(store as any, input, gql)).rejects.toMatchObject({ scope: 'write_products' })
  })

  it('sem write_inventory o produto é criado e o estoque vira aviso', async () => {
    const { gql } = fakeGql({ WorderSetInventory: denied })
    const r = await createProductInShopify(store as any, input, gql)
    expect(r.shopifyProductId).toBe('100')
    expect(r.warnings.some((w) => /write_inventory/.test(w))).toBe(true)
  })

  it('sem write_publications o produto é criado e a publicação vira aviso', async () => {
    const { gql } = fakeGql({ WorderPublications: denied })
    const r = await createProductInShopify(store as any, input, gql)
    expect(r.warnings.some((w) => /write_publications/.test(w))).toBe(true)
  })

  it('userErrors da Shopify no produto são erro de validação', async () => {
    const { gql } = fakeGql({ WorderCreateProduct: () => ({ data: { productCreate: { product: null, userErrors: [{ field: ['title'], message: 'Title has already been taken' }] } } }) })
    await expect(createProductInShopify(store as any, input, gql)).rejects.toBeInstanceOf(ShopifyUserError)
  })

  it('falha na releitura não perde o produto: grava o que sabe e avisa', async () => {
    const { gql } = fakeGql({ WorderProductById: () => { throw new Error('rede') } })
    const r = await createProductInShopify(store as any, input, gql)
    expect(r.row.shopify_product_id).toBe('100')
    expect(r.row.title).toBe('Sérum')
    expect(r.warnings.some((w) => /sincroniza/.test(w))).toBe(true)
  })
})

describe('productNodeToRow', () => {
  it('monta a linha com disponibilidade e texto limpo', () => {
    const row = productNodeToRow(productNode)
    expect(row).toMatchObject({
      shopify_product_id: '100', handle: 'serum', status: 'active', tags: 'novo',
      price: 49.9, compare_at_price: 59.9, sku: 'SKU1', inventory_quantity: 5, available: true, description: 'Bom',
    })
    expect(row.images[0].url).toBe('https://cdn.shopify.com/a.jpg')
  })
})
