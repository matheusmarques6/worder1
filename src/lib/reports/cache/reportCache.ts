/**
 * Report Cache Helper
 * v2.1 - Usa helpers existentes: cacheGet, cacheSet, isRedisConfigured
 */

import crypto from 'crypto'
import { isRedisConfigured, cacheGet, cacheSet } from '@/lib/redis'

const CACHE_PREFIX = 'report'

/**
 * TTLs em segundos para cada tipo de relatório
 */
export const REPORT_CACHE_TTLS: Record<string, number> = {
  general: 300,    // 5 min - dados consolidados mudam pouco
  sales: 300,      // 5 min
  forecast: 600,   // 10 min - previsões mudam menos
  shopify: 900,    // 15 min - dados de integração externa
  email: 900,      // 15 min
  ads: 900,        // 15 min
}

interface CacheKeyParams {
  type: string
  organizationId: string
  storeId?: string
  pipelineId?: string
  period: string
  platform?: string
  startDate?: string
  endDate?: string
}

/**
 * Gera chave única para cache do relatório
 * Formato: report:{type}:{hash}
 */
export function makeReportCacheKey(params: CacheKeyParams): string {
  const normalized = {
    type: params.type,
    org: params.organizationId,
    store: params.storeId || '',
    pipeline: params.pipelineId || '',
    period: params.period,
    platform: params.platform || '',
    start: params.startDate || '',
    end: params.endDate || '',
  }

  const hash = crypto
    .createHash('md5')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .slice(0, 12) // 12 caracteres é suficiente para evitar colisões

  return `${CACHE_PREFIX}:${params.type}:${hash}`
}

/**
 * Busca dados do cache para relatório
 * Usa helper existente cacheGet()
 */
export async function getReportCache<T>(key: string): Promise<T | null> {
  if (!isRedisConfigured()) {
    return null
  }

  try {
    const cached = await cacheGet<T>(key)
    if (cached) {
      console.log('[REPORT_CACHE] HIT:', key)
    }
    return cached
  } catch (error) {
    console.warn('[REPORT_CACHE] Erro ao ler:', error)
    return null
  }
}

/**
 * Salva dados no cache do relatório
 * Usa helper existente cacheSet()
 */
export async function setReportCache<T>(
  key: string,
  data: T,
  type: string
): Promise<boolean> {
  if (!isRedisConfigured()) {
    return false
  }

  try {
    const ttl = REPORT_CACHE_TTLS[type] || 300
    const result = await cacheSet(key, data, ttl)
    if (result) {
      console.log('[REPORT_CACHE] SET:', key, `TTL=${ttl}s`)
    }
    return result
  } catch (error) {
    console.warn('[REPORT_CACHE] Erro ao salvar:', error)
    return false
  }
}

/**
 * Invalida cache de um tipo de relatório para uma organização
 * Útil para webhooks que atualizam dados
 */
export async function invalidateReportCache(
  organizationId: string,
  type?: string
): Promise<boolean> {
  // Por enquanto apenas loga - implementar com SCAN se necessário
  console.log('[REPORT_CACHE] Invalidate requested:', { organizationId, type })
  return true
}

/**
 * Verifica se o cache está configurado e disponível
 */
export function isReportCacheAvailable(): boolean {
  return isRedisConfigured()
}
