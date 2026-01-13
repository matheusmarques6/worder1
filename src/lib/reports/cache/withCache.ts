/**
 * Cache Wrapper para Relatórios
 * v2.1 - Wrapper para facilitar uso do cache nas rotas
 */

import { 
  makeReportCacheKey, 
  getReportCache, 
  setReportCache,
  isReportCacheAvailable,
} from './reportCache'

interface WithCacheOptions {
  type: string
  organizationId: string
  storeId?: string
  pipelineId?: string
  period: string
  platform?: string
  skipCache?: boolean
}

interface CacheResult<T> {
  data: T
  fromCache: boolean
}

/**
 * Wrapper que adiciona cache automático a uma função de fetch
 * 
 * @example
 * const { data, fromCache } = await withReportCache(
 *   { type: 'general', organizationId, period },
 *   async () => {
 *     // Lógica de busca de dados
 *     return reportData
 *   }
 * )
 */
export async function withReportCache<T>(
  options: WithCacheOptions,
  fetchFn: () => Promise<T>
): Promise<CacheResult<T>> {
  const { skipCache, ...keyParams } = options

  // 1. Bypass se solicitado via ?fresh=true
  if (skipCache) {
    console.log('[REPORT_CACHE] Bypass solicitado')
    const data = await fetchFn()
    return { data, fromCache: false }
  }

  // 2. Verificar se cache está disponível
  if (!isReportCacheAvailable()) {
    console.log('[REPORT_CACHE] Redis não configurado, bypass automático')
    const data = await fetchFn()
    return { data, fromCache: false }
  }

  // 3. Gerar chave do cache
  const cacheKey = makeReportCacheKey(keyParams)

  // 4. Tentar buscar do cache
  const cached = await getReportCache<T>(cacheKey)
  if (cached !== null) {
    return { data: cached, fromCache: true }
  }

  // 5. Cache miss - buscar dados frescos
  console.log('[REPORT_CACHE] MISS:', cacheKey)
  const data = await fetchFn()

  // 6. Salvar no cache (async, não bloqueia resposta)
  setReportCache(cacheKey, data, options.type).catch(err => {
    console.warn('[REPORT_CACHE] Erro ao salvar no background:', err)
  })

  return { data, fromCache: false }
}

/**
 * Helper para extrair flag skipCache do request
 */
export function shouldSkipCache(searchParams: URLSearchParams): boolean {
  return searchParams.get('fresh') === 'true'
}

/**
 * Helper para adicionar header X-Cache na resposta
 */
export function addCacheHeader(
  response: Response, 
  fromCache: boolean
): Response {
  response.headers.set('X-Cache', fromCache ? 'HIT' : 'MISS')
  return response
}
