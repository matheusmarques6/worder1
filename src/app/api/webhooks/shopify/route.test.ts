import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mockMaybeSingle = vi.fn()
const chain: any = {
  select: () => chain,
  or: () => chain,
  eq: () => chain,
  maybeSingle: () => mockMaybeSingle(),
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ from: () => chain }),
}))
vi.mock('@/lib/events', () => ({ EventBus: {}, EventType: {} }))
vi.mock('@/lib/services/shopify/contact-sync', () => ({ syncContactFromShopify: vi.fn(), updateContactOrderStats: vi.fn() }))
vi.mock('@/lib/services/shopify/deal-sync', () => ({ createOrUpdateDealForContact: vi.fn(), moveDealToStage: vi.fn(), markDealAsWon: vi.fn() }))
vi.mock('@/lib/services/shopify/activity-tracker', () => ({ trackActivity: vi.fn(), trackPurchase: vi.fn(), enrichContactFromOrder: vi.fn() }))
vi.mock('@/lib/services/automation/automation-executor', () => ({ executeAutomationRules: vi.fn(), mapShopifyEventToTrigger: vi.fn() }))
vi.mock('@/lib/shopify/event-service', () => ({ createEvent: vi.fn() }))
vi.mock('@/lib/shopify/event-types', () => ({ WORDER_SHOPIFY_EVENTS: {}, EVENT_SOURCES: {} }))
vi.mock('@/lib/services/shopify/jobs/abandoned-cart', () => ({ markCheckoutRecovered: vi.fn() }))
vi.mock('@/lib/shopify/profile-enricher', () => ({ enrichContactAfterOrder: vi.fn() }))
vi.mock('@/lib/services/shopify/store-totals', () => ({ scheduleRecomputeStoreTotals: vi.fn() }))
vi.mock('@/lib/segments/realtime', () => ({ scheduleSegmentReeval: vi.fn() }))

import { POST } from './route'

const STORE = { id: 'store-1', organization_id: 'org-1', shop_domain: 'shop.example', api_secret: 'shopify-secret' }

async function sign(rawBody: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(STORE.api_secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

function request(rawBody: string, signature?: string) {
  return new NextRequest('http://localhost/api/webhooks/shopify', {
    method: 'POST',
    headers: {
      'X-Shopify-Topic': 'unhandled/topic',
      'X-Shopify-Shop-Domain': 'shop.example',
      ...(signature ? { 'X-Shopify-Hmac-Sha256': signature } : {}),
    },
    body: rawBody,
  })
}

describe('POST /api/webhooks/shopify HMAC boundary', () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset()
    mockMaybeSingle.mockResolvedValue({ data: STORE })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects malformed unsigned bytes before JSON parsing', async () => {
    const parseSpy = vi.spyOn(JSON, 'parse')

    const response = await POST(request('{not-json'))

    expect(response.status).toBe(401)
    expect(parseSpy).not.toHaveBeenCalled()
  })

  it('continues to parse a valid signed payload after HMAC verification', async () => {
    const rawBody = '{"id":1}'

    const response = await POST(request(rawBody, await sign(rawBody)))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
  })
})
