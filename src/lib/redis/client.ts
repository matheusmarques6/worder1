// =============================================
// Cliente Redis dedicado ao módulo de IA (buffer / lock).
// Não conflita com src/lib/redis.ts (cache de embeddings/intents).
// =============================================

import { Redis } from '@upstash/redis'

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

if (!url || !token) {
  // Em dev/CI ficamos sem Redis; o pipeline cai em modo síncrono.
  console.warn('[redis] Upstash não configurado — buffer/lock ficará desabilitado')
}

export const redis = url && token ? new Redis({ url, token }) : null

/**
 * Adquire um lock distribuído com TTL e executa `fn` se conseguir.
 * Retorna o resultado de `fn`, ou null se outro processo já tem o lock.
 */
export async function withLock<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T | null> {
  if (!redis) return fn()
  const acquired = await redis.set(`lock:${key}`, '1', {
    nx: true,
    ex: ttlSeconds,
  })
  if (!acquired) return null
  try {
    return await fn()
  } finally {
    await redis.del(`lock:${key}`)
  }
}
