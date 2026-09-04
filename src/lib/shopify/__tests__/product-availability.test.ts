// =============================================================
// Disponibilidade: o que a Shopify diz sobre poder comprar, nas duas
// formas em que as variantes chegam (webhook REST e sync GraphQL).
// =============================================================

import { describe, it, expect } from 'vitest'
import {
  isVariantAvailable, computeProductAvailability, normalizeSyncedVariant, gidToId,
} from '../product-availability'

describe('isVariantAvailable — forma REST (webhook)', () => {
  it('sem controle de estoque está sempre disponível, mesmo com 0', () => {
    expect(isVariantAvailable({ inventory_management: null, inventory_policy: 'deny', inventory_quantity: 0 })).toBe(true)
  })
  it('controlado, política deny: depende do estoque', () => {
    expect(isVariantAvailable({ inventory_management: 'shopify', inventory_policy: 'deny', inventory_quantity: 3 })).toBe(true)
    expect(isVariantAvailable({ inventory_management: 'shopify', inventory_policy: 'deny', inventory_quantity: 0 })).toBe(false)
  })
  it('venda permitida sem estoque (continue) fica disponível', () => {
    expect(isVariantAvailable({ inventory_management: 'shopify', inventory_policy: 'continue', inventory_quantity: 0 })).toBe(true)
  })
  it('-1 é o "não controlado" antigo', () => {
    expect(isVariantAvailable({ inventory_quantity: -1 })).toBe(true)
  })
  it('sem informação nenhuma: não sei', () => {
    expect(isVariantAvailable({})).toBeNull()
  })
})

describe('isVariantAvailable — forma GraphQL (sync)', () => {
  it('availableForSale já traz a conta feita', () => {
    expect(isVariantAvailable({ available_for_sale: false, inventory_quantity: 10 })).toBe(false)
    expect(isVariantAvailable({ available_for_sale: true, inventory_quantity: 0 })).toBe(true)
  })
  it('tracked=false vale como não controlado', () => {
    expect(isVariantAvailable({ tracked: false, inventory_quantity: 0 })).toBe(true)
  })
})

describe('computeProductAvailability', () => {
  it('alguma variante disponível → produto disponível', () => {
    const r = computeProductAvailability([
      { inventory_management: 'shopify', inventory_policy: 'deny', inventory_quantity: 0 },
      { inventory_management: 'shopify', inventory_policy: 'deny', inventory_quantity: 2 },
    ])
    expect(r.available).toBe(true)
    expect(r.inventoryQuantity).toBe(2)
  })
  it('todas esgotadas → indisponível (é isto que tira o produto do feed)', () => {
    const r = computeProductAvailability([
      { inventory_management: 'shopify', inventory_policy: 'deny', inventory_quantity: 0 },
    ])
    expect(r.available).toBe(false)
    expect(r.inventoryQuantity).toBe(0)
  })
  it('nada controlado → estoque null, disponível', () => {
    const r = computeProductAvailability([{ inventory_management: null, inventory_quantity: 0 }])
    expect(r.available).toBe(true)
    expect(r.inventoryQuantity).toBeNull()
  })
  it('sem variantes → não sei', () => {
    expect(computeProductAvailability([]).available).toBeNull()
    expect(computeProductAvailability(null).available).toBeNull()
  })
})

describe('normalizeSyncedVariant / gidToId', () => {
  it('reduz o nó GraphQL à forma gravada, com inventory_item_id numérico', () => {
    const v = normalizeSyncedVariant({
      id: 'gid://shopify/ProductVariant/111', title: 'Default', sku: 'ABC', price: '10.00', compareAtPrice: null,
      inventoryQuantity: 4, inventoryPolicy: 'DENY', availableForSale: true, barcode: null,
      inventoryItem: { id: 'gid://shopify/InventoryItem/222', tracked: true },
    })
    expect(v).toMatchObject({
      id: '111', sku: 'ABC', price: '10.00', inventory_quantity: 4, inventory_policy: 'deny',
      tracked: true, available_for_sale: true, inventory_item_id: '222',
    })
  })
  it('gidToId aceita gid e id cru', () => {
    expect(gidToId('gid://shopify/Product/42')).toBe('42')
    expect(gidToId('42')).toBe('42')
    expect(gidToId(null)).toBeNull()
  })
})
