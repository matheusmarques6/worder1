import { describe, it, expect } from 'vitest'
import {
  triggerFamily,
  triggerCtaLabel,
  normalizeHost,
  hostFromUrl,
  buildCartPermalink,
  getShopDomain,
  resolveTriggerCtaUrl,
  isManualCtaOverride,
} from '../trigger-cta'

describe('triggerFamily', () => {
  it('classifies checkout even with "abandon" in the id', () => {
    expect(triggerFamily('trigger_checkout_abandoned')).toBe('checkout')
    expect(triggerFamily('checkout.abandoned')).toBe('checkout')
  })
  it('classifies browse/view/back-in-stock as product (before the abandon rule)', () => {
    expect(triggerFamily('trigger_browse_abandoned')).toBe('product')
    expect(triggerFamily('trigger_viewed_product')).toBe('product')
    expect(triggerFamily('trigger_back_in_stock')).toBe('product')
  })
  it('classifies cart / add-to-cart / legacy abandon as cart', () => {
    expect(triggerFamily('trigger_added_to_cart')).toBe('cart')
    expect(triggerFamily('trigger_abandon')).toBe('cart')
    expect(triggerFamily('cart.abandoned')).toBe('cart')
  })
  it('classifies pending-payment abandon (pix/boleto) as checkout, not cart', () => {
    expect(triggerFamily('trigger_payment_pix_abandoned')).toBe('checkout')
    expect(triggerFamily('trigger_payment_boleto_abandoned')).toBe('checkout')
  })
  it('classifies orders', () => {
    expect(triggerFamily('trigger_order_paid')).toBe('order')
    expect(triggerFamily('trigger_order_fulfilled')).toBe('order')
  })
  it('empty/unknown → generic', () => {
    expect(triggerFamily('')).toBe('generic')
    expect(triggerFamily(null)).toBe('generic')
    expect(triggerFamily('form_submitted')).toBe('generic')
  })
})

describe('normalizeHost / hostFromUrl', () => {
  it('normalizes bare domains and strips protocol/path/trailing slash', () => {
    expect(normalizeHost('shop.myshopify.com')).toBe('https://shop.myshopify.com')
    expect(normalizeHost('https://shop.com/')).toBe('https://shop.com')
    expect(normalizeHost('http://shop.com/cart?x=1')).toBe('https://shop.com')
    expect(normalizeHost('')).toBe('')
  })
  it('hostFromUrl only works on full URLs', () => {
    expect(hostFromUrl('https://shop.com/checkouts/c/abc')).toBe('https://shop.com')
    expect(hostFromUrl('/cart/123')).toBe('')
  })
})

describe('buildCartPermalink', () => {
  it('builds /cart/variant:qty for all items with numeric variant ids', () => {
    const url = buildCartPermalink('shop.myshopify.com', [
      { variant_id: 111, quantity: 2 },
      { variant_id: '222', quantity: 1 },
    ])
    expect(url).toBe('https://shop.myshopify.com/cart/111:2,222:1')
  })
  it('skips items without a variant id, defaults qty to 1', () => {
    const url = buildCartPermalink('https://shop.com', [
      { variant_id: 'gid://shopify/ProductVariant/999', quantity: 0 },
      { quantity: 3 },
    ])
    // gid extracted to digits, qty<=0 → 1
    expect(url).toBe('https://shop.com/cart/999:1')
  })
  it('returns "" when no host or no valid items', () => {
    expect(buildCartPermalink('', [{ variant_id: 1, quantity: 1 }])).toBe('')
    expect(buildCartPermalink('shop.com', [])).toBe('')
    expect(buildCartPermalink('shop.com', [{ quantity: 2 }])).toBe('')
  })
})

describe('getShopDomain', () => {
  it('prefers explicit shop_domain in raw', () => {
    expect(getShopDomain({ raw: { shop_domain: 'a.myshopify.com' } })).toBe('https://a.myshopify.com')
  })
  it('falls back to host of a known URL', () => {
    expect(getShopDomain({ properties: { CheckoutURL: 'https://b.com/checkouts/c/x' } })).toBe('https://b.com')
  })
  it('empty when nothing usable', () => {
    expect(getShopDomain({})).toBe('')
  })
})

describe('resolveTriggerCtaUrl', () => {
  const shopDomain = 'shop.myshopify.com'
  const items = [{ variant_id: 10, quantity: 1 }, { variant_id: 20, quantity: 2 }]

  it('checkout family → recovery URL', () => {
    expect(resolveTriggerCtaUrl({
      triggerType: 'trigger_checkout_abandoned',
      eventCheckoutUrl: 'https://shop.com/checkouts/c/abc/recover',
      shopDomain, items,
    })).toBe('https://shop.com/checkouts/c/abc/recover')
  })

  it('cart family → cart permalink with the items (even if a checkout URL exists)', () => {
    expect(resolveTriggerCtaUrl({
      triggerType: 'trigger_added_to_cart',
      eventCheckoutUrl: 'https://shop.com/checkouts/c/abc',
      shopDomain, items,
    })).toBe('https://shop.myshopify.com/cart/10:1,20:2')
  })

  it('cart family → falls back to checkout when no variant ids', () => {
    expect(resolveTriggerCtaUrl({
      triggerType: 'trigger_added_to_cart',
      eventCheckoutUrl: 'https://shop.com/checkouts/c/abc',
      shopDomain, items: [{ quantity: 1 }],
    })).toBe('https://shop.com/checkouts/c/abc')
  })

  it('product family → product URL', () => {
    expect(resolveTriggerCtaUrl({
      triggerType: 'trigger_viewed_product',
      productUrl: 'https://shop.com/products/foo',
      eventCheckoutUrl: 'https://shop.com/checkouts/c/abc',
      shopDomain, items,
    })).toBe('https://shop.com/products/foo')
  })

  it('order family → order status URL', () => {
    expect(resolveTriggerCtaUrl({
      triggerType: 'trigger_order_paid',
      orderStatusUrl: 'https://shop.com/orders/1/status',
      shopDomain, items,
    })).toBe('https://shop.com/orders/1/status')
  })

  it('universal fallback → store home when nothing else', () => {
    expect(resolveTriggerCtaUrl({ triggerType: 'trigger_added_to_cart', shopDomain, items: [] }))
      .toBe('https://shop.myshopify.com')
    expect(resolveTriggerCtaUrl({ triggerType: 'generic' })).toBe('')
  })
})

describe('isManualCtaOverride', () => {
  it('auto placeholders are NOT overrides', () => {
    expect(isManualCtaOverride('')).toBe(false)
    expect(isManualCtaOverride('{{ trigger.link }}')).toBe(false)
    expect(isManualCtaOverride('{{ CheckoutURL }}')).toBe(false)
    expect(isManualCtaOverride('{{checkout_url}}')).toBe(false)
    expect(isManualCtaOverride(null)).toBe(false)
  })
  it('a real custom URL IS an override', () => {
    expect(isManualCtaOverride('https://shop.com/promo')).toBe(true)
    expect(isManualCtaOverride('{{ CheckoutURL }}&discount=X')).toBe(true)
  })
})
