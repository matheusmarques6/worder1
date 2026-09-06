import crypto from 'crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockResolveStoreByDomain = vi.fn()
const mockEnqueue = vi.fn()
const mockIsQStashConfigured = vi.fn()

vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {} }))
vi.mock('@/lib/shopify/resolve-store-by-domain', () => ({
  resolveStoreByDomain: (...args: unknown[]) => mockResolveStoreByDomain(...args),
}))
vi.mock('@/lib/queue', () => ({
  enqueueShopifyWebhook: (...args: unknown[]) => mockEnqueue(...args),
  isQStashConfigured: () => mockIsQStashConfigured(),
}))

import { POST } from './route'

const STORE = {
  id: 'store-1',
  organization_id: 'org-1',
  api_secret: 'shopify-secret',
  is_active: true,
  sync_orders: true,
  sync_customers: true,
  sync_checkouts: true,
}

function sign(rawBody: string) {
  return crypto.createHmac('sha256', STORE.api_secret).update(rawBody, 'utf8').digest('base64')
}

function request(rawBody: string, signature?: string) {
  return new NextRequest('http://localhost/api/integrations/shopify/webhook', {
    method: 'POST',
    headers: {
      'x-shopify-topic': 'orders/create',
      'x-shopify-shop-domain': 'shop.example',
      ...(signature ? { 'x-shopify-hmac-sha256': signature } : {}),
    },
    body: rawBody,
  })
}

describe('POST /api/integrations/shopify/webhook HMAC boundary', () => {
  beforeEach(() => {
    mockResolveStoreByDomain.mockReset()
    mockResolveStoreByDomain.mockResolvedValue(STORE)
    mockEnqueue.mockReset()
    mockEnqueue.mockResolvedValue('queue-1')
    mockIsQStashConfigured.mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects malformed unsigned bytes before JSON parsing', async () => {
    const parseSpy = vi.spyOn(JSON, 'parse')

    const response = await POST(request('{not-json'))

    expect(response.status).toBe(401)
    expect(parseSpy).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('continues to parse and enqueue a valid signed payload', async () => {
    const rawBody = '{"id":1}'

    const response = await POST(request(rawBody, sign(rawBody)))

    expect(response.status).toBe(200)
    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({ payload: { id: 1 } }))
  })
})
