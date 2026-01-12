// =====================================================
// CLIENTE REDIS (UPSTASH)
// Cache para embeddings e outros dados
// =====================================================

import { Redis } from '@upstash/redis'

// Singleton para evitar múltiplas conexões
let redisClient: Redis | null = null

/**
 * Retorna instância do cliente Redis
 * Usa singleton para reutilizar conexão
 */
export function getRedis(): Redis {
  if (!redisClient) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (!url || !token) {
      throw new Error(
        'Redis não configurado. Configure UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN no .env.local'
      )
    }

    redisClient = new Redis({ url, token })
  }

  return redisClient
}

/**
 * Verifica se Redis está configurado (sem lançar erro)
 */
export function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

/**
 * Testa conexão com Redis
 */
export async function testRedisConnection(): Promise<{
  connected: boolean
  latencyMs?: number
  error?: string
}> {
  try {
    const redis = getRedis()
    const start = Date.now()
    
    await redis.set('_test_connection', 'ok', { ex: 10 })
    const value = await redis.get('_test_connection')
    await redis.del('_test_connection')
    
    const latencyMs = Date.now() - start

    if (value === 'ok') {
      return { connected: true, latencyMs }
    } else {
      return { connected: false, error: 'Valor retornado não corresponde' }
    }
  } catch (error: any) {
    return { connected: false, error: error.message }
  }
}

// =====================================================
// CONSTANTES DE TTL (Time To Live)
// =====================================================

export const CACHE_TTL = {
  // Embeddings - 7 dias (textos raramente mudam)
  EMBEDDING: 7 * 24 * 60 * 60,
  
  // Detecção de intenção - 1 hora
  INTENT: 1 * 60 * 60,
  
  // Análise de sentimento - 1 hora
  SENTIMENT: 1 * 60 * 60,
  
  // Configuração de agente - 5 minutos
  AGENT_CONFIG: 5 * 60,
  
  // Resultados RAG - 30 minutos
  RAG_RESULTS: 30 * 60,
}

// =====================================================
// PREFIXOS DE CHAVE
// =====================================================

export const CACHE_PREFIX = {
  // Embeddings de texto
  EMBEDDING: 'emb:',
  
  // Detecção de intenção
  INTENT: 'intent:',
  
  // Análise de sentimento
  SENTIMENT: 'sent:',
  
  // Configuração de agente
  AGENT: 'agent:',
  
  // Resultados RAG
  RAG: 'rag:',
  
  // Rate limiting
  RATE: 'rate:',
}

// =====================================================
// HELPERS DE CACHE
// =====================================================

/**
 * Wrapper para get com tratamento de erro
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    if (!isRedisConfigured()) return null
    const redis = getRedis()
    return await redis.get<T>(key)
  } catch (error) {
    console.warn('[Redis] Erro ao ler cache:', error)
    return null
  }
}

/**
 * Wrapper para set com tratamento de erro
 */
export async function cacheSet(
  key: string,
  value: any,
  ttlSeconds: number
): Promise<boolean> {
  try {
    if (!isRedisConfigured()) return false
    const redis = getRedis()
    await redis.setex(key, ttlSeconds, value)
    return true
  } catch (error) {
    console.warn('[Redis] Erro ao salvar cache:', error)
    return false
  }
}

/**
 * Wrapper para del com tratamento de erro
 */
export async function cacheDel(key: string): Promise<boolean> {
  try {
    if (!isRedisConfigured()) return false
    const redis = getRedis()
    await redis.del(key)
    return true
  } catch (error) {
    console.warn('[Redis] Erro ao deletar cache:', error)
    return false
  }
}

/**
 * Busca múltiplas chaves de uma vez
 */
export async function cacheGetMany<T>(keys: string[]): Promise<(T | null)[]> {
  try {
    if (!isRedisConfigured() || keys.length === 0) {
      return keys.map(() => null)
    }
    const redis = getRedis()
    return await redis.mget<T[]>(...keys)
  } catch (error) {
    console.warn('[Redis] Erro ao ler múltiplas chaves:', error)
    return keys.map(() => null)
  }
}

/**
 * Lista chaves por prefixo (usar com cuidado em produção)
 */
export async function cacheKeys(pattern: string): Promise<string[]> {
  try {
    if (!isRedisConfigured()) return []
    const redis = getRedis()
    return await redis.keys(pattern)
  } catch (error) {
    console.warn('[Redis] Erro ao listar chaves:', error)
    return []
  }
}

/**
 * Estatísticas do cache
 */
export async function getCacheStats(prefix: string): Promise<{
  totalKeys: number
  estimatedMemoryMB: number
}> {
  try {
    const keys = await cacheKeys(`${prefix}*`)
    
    // Estimativa de memória (embedding = ~6KB por chave)
    const avgSizeKB = prefix === CACHE_PREFIX.EMBEDDING ? 6 : 1
    const estimatedMemoryMB = (keys.length * avgSizeKB) / 1024

    return {
      totalKeys: keys.length,
      estimatedMemoryMB: Math.round(estimatedMemoryMB * 100) / 100,
    }
  } catch (error) {
    return { totalKeys: 0, estimatedMemoryMB: 0 }
  }
}
