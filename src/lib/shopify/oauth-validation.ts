import { createHmac, timingSafeEqual } from 'crypto'

export function isShopifyDomain(shop: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)
}

/** Shopify OAuth query HMAC, not the webhook body HMAC contract. */
export function validShopifyOAuthHmac(params: URLSearchParams, secret: string): boolean {
  const supplied = params.get('hmac') || ''
  if (!secret || !/^[a-f0-9]{64}$/i.test(supplied)) return false
  const entries = Array.from(params.entries())
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return false
  // Shopify's documented OAuth algorithm uses decoded, alphabetically sorted pairs.
  const message = entries.filter(([key]) => key !== 'hmac')
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join('&')
  const expected = createHmac('sha256', secret).update(message).digest()
  return timingSafeEqual(expected, Buffer.from(supplied, 'hex'))
}
