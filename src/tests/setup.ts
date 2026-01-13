/**
 * Vitest Setup
 * Configuração global para testes
 */

import { vi } from 'vitest'

// Mock do Redis
vi.mock('@/lib/redis', () => ({
  isRedisConfigured: vi.fn(() => false),
  cacheGet: vi.fn(() => null),
  cacheSet: vi.fn(() => true),
  cacheDel: vi.fn(() => true),
}))

// Mock do Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(() => ({
            lte: vi.fn(() => ({
              single: vi.fn(() => ({ data: null, error: null })),
              maybeSingle: vi.fn(() => ({ data: null, error: null })),
            })),
          })),
          single: vi.fn(() => ({ data: null, error: null })),
          maybeSingle: vi.fn(() => ({ data: null, error: null })),
        })),
        in: vi.fn(() => ({
          gte: vi.fn(() => ({
            lte: vi.fn(() => ({ data: [], error: null })),
          })),
        })),
      })),
    })),
    auth: {
      getUser: vi.fn(() => ({ data: { user: null }, error: null })),
    },
  })),
}))

// Helpers globais de teste
export function createMockDeal(overrides = {}) {
  return {
    id: 'deal-1',
    value: 1000,
    status: 'won',
    store_id: 'store-1',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createMockOrder(overrides = {}) {
  return {
    id: 'order-1',
    total_price: 150,
    subtotal_price: 140,
    total_discounts: 10,
    total_tax: 5,
    total_shipping: 15,
    line_items: [],
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

export function createMockInsight(overrides = {}) {
  return {
    date: '2024-01-15',
    campaign_id: 'camp-1',
    spend: 100,
    impressions: 5000,
    clicks: 150,
    conversions: 10,
    conversion_value: 500,
    roas: 5.0,
    ...overrides,
  }
}
