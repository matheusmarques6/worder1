/**
 * Testes para sistema de cache de relatórios
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  makeReportCacheKey,
  REPORT_CACHE_TTLS,
} from '@/lib/reports/cache/reportCache'

describe('makeReportCacheKey', () => {
  it('gera chave com formato correto', () => {
    const key = makeReportCacheKey({
      type: 'general',
      organizationId: 'org-123',
      period: '30d',
    })
    
    expect(key).toMatch(/^report:general:[a-f0-9]{12}$/)
  })

  it('gera mesma chave para mesmos parâmetros', () => {
    const params = {
      type: 'shopify',
      organizationId: 'org-123',
      storeId: 'store-456',
      period: '30d',
    }
    
    const key1 = makeReportCacheKey(params)
    const key2 = makeReportCacheKey(params)
    
    expect(key1).toBe(key2)
  })

  it('gera chaves diferentes para parâmetros diferentes', () => {
    const key1 = makeReportCacheKey({
      type: 'general',
      organizationId: 'org-123',
      period: '30d',
    })
    
    const key2 = makeReportCacheKey({
      type: 'general',
      organizationId: 'org-456',
      period: '30d',
    })
    
    expect(key1).not.toBe(key2)
  })

  it('diferencia por período', () => {
    const key1 = makeReportCacheKey({
      type: 'general',
      organizationId: 'org-123',
      period: '7d',
    })
    
    const key2 = makeReportCacheKey({
      type: 'general',
      organizationId: 'org-123',
      period: '30d',
    })
    
    expect(key1).not.toBe(key2)
  })

  it('diferencia por storeId', () => {
    const key1 = makeReportCacheKey({
      type: 'shopify',
      organizationId: 'org-123',
      storeId: 'store-1',
      period: '30d',
    })
    
    const key2 = makeReportCacheKey({
      type: 'shopify',
      organizationId: 'org-123',
      storeId: 'store-2',
      period: '30d',
    })
    
    expect(key1).not.toBe(key2)
  })

  it('diferencia por platform em ads', () => {
    const key1 = makeReportCacheKey({
      type: 'ads',
      organizationId: 'org-123',
      platform: 'meta',
      period: '30d',
    })
    
    const key2 = makeReportCacheKey({
      type: 'ads',
      organizationId: 'org-123',
      platform: 'google',
      period: '30d',
    })
    
    expect(key1).not.toBe(key2)
  })
})

describe('REPORT_CACHE_TTLS', () => {
  it('tem TTL para general', () => {
    expect(REPORT_CACHE_TTLS.general).toBe(300)
  })

  it('tem TTL para sales', () => {
    expect(REPORT_CACHE_TTLS.sales).toBe(300)
  })

  it('tem TTL para forecast', () => {
    expect(REPORT_CACHE_TTLS.forecast).toBe(600)
  })

  it('tem TTL para shopify', () => {
    expect(REPORT_CACHE_TTLS.shopify).toBe(900)
  })

  it('tem TTL para email', () => {
    expect(REPORT_CACHE_TTLS.email).toBe(900)
  })

  it('tem TTL para ads', () => {
    expect(REPORT_CACHE_TTLS.ads).toBe(900)
  })
})
