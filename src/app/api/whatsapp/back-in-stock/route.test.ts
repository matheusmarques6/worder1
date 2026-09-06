import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockFrom = vi.fn()
const mockProcessProductBackInStock = vi.fn()
const mockVerifyBearerToken = vi.fn((header: string | null, secret: string) => {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : header
  return token === secret
})

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}))

vi.mock('@/lib/services/whatsapp/back-in-stock-service', () => ({
  processProductBackInStock: (...args: unknown[]) => mockProcessProductBackInStock(...args),
}))

vi.mock('@/lib/webhook-security', () => ({
  verifyBearerToken: (...args: [string | null, string]) => mockVerifyBearerToken(...args),
}))

import { GET, POST } from './route'

const ORIGINAL_ENV = { ...process.env }

function request(method: 'GET' | 'POST', headers: Record<string, string> = {}, body?: unknown) {
  return new NextRequest('http://localhost/api/whatsapp/back-in-stock?organizationId=org-1', {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function successfulShopifyQueries() {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'shopify_stores') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'store-1', organization_id: 'org-1' } }) }) }),
      }
    }
    if (table === 'shopify_variants') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { product_id: 'product-1', variant_id: 'variant-1', product_title: 'Produto' } }) }) }),
      }
    }
    if (table === 'event_logs') return { insert: vi.fn().mockResolvedValue({ error: null }) }
    throw new Error(`unexpected table ${table}`)
  })
  mockProcessProductBackInStock.mockResolvedValue({ data: { notified: 1 } })
}

function emptyInterestQueries() {
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'whatsapp_product_interests') throw new Error(`unexpected table ${table}`)
    const query: any = {
      select: () => query,
      eq: () => query,
      limit: async () => ({ data: [] }),
    }
    return query
  })
}

describe('/api/whatsapp/back-in-stock internal authorization', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, INTERNAL_API_SECRET: 'internal-secret' }
    delete process.env.CRON_SECRET
    mockFrom.mockReset()
    mockProcessProductBackInStock.mockReset()
    mockVerifyBearerToken.mockClear()
    emptyInterestQueries()
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('denies an inventory payload without Bearer before database, service, or event effects', async () => {
    successfulShopifyQueries()

    const response = await POST(request('POST', { 'x-shopify-shop-domain': 'shop.example' }, {
      inventory_item_id: 1,
      available: 1,
    }))

    expect(response.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockProcessProductBackInStock).not.toHaveBeenCalled()
  })

  it('keeps an authorized inventory payload processing', async () => {
    successfulShopifyQueries()

    const response = await POST(request('POST', {
      authorization: 'Bearer internal-secret',
      'x-shopify-shop-domain': 'shop.example',
    }, { inventory_item_id: 1, available: 1 }))

    expect(response.status).toBe(200)
    expect(mockProcessProductBackInStock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org-1' }))
    expect(mockFrom).toHaveBeenCalledWith('event_logs')
  })

  it('routes the raw legacy header through the shared comparator and preserves its format', async () => {
    const response = await GET(request('GET', { 'x-cron-secret': 'internal-secret' }))

    expect(response.status).toBe(200)
    expect(mockVerifyBearerToken).toHaveBeenLastCalledWith('internal-secret', 'internal-secret')
  })

  it('denies an invalid legacy header through the shared comparator', async () => {
    const response = await GET(request('GET', { 'x-cron-secret': 'wrong-secret' }))

    expect(response.status).toBe(401)
    expect(mockVerifyBearerToken).toHaveBeenLastCalledWith('wrong-secret', 'internal-secret')
  })

  it('denies the legacy header when no internal secret is configured', async () => {
    delete process.env.INTERNAL_API_SECRET

    const response = await GET(request('GET', { 'x-cron-secret': 'internal-secret' }))

    expect(response.status).toBe(401)
    expect(mockVerifyBearerToken).not.toHaveBeenCalled()
  })
})
