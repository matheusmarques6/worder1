// =============================================
// WHATSAPP RATE LIMITER - ALTA ESCALA
// Controle de throughput por tier da Meta
// =============================================

import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

// Inicializar Redis (lazy)
let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required')
    }
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return redis
}

// Configuração por tier da Meta (Out 2025)
// https://developers.facebook.com/docs/whatsapp/messaging-limits
export const TIER_CONFIG: Record<number, { mps: number; daily: number; name: string }> = {
  0: { mps: 10, daily: 250, name: 'Não verificado' },
  1: { mps: 40, daily: 2000, name: 'Tier 1' },
  2: { mps: 60, daily: 10000, name: 'Tier 2' },
  3: { mps: 80, daily: 100000, name: 'Tier 3' },
  4: { mps: 500, daily: Infinity, name: 'Unlimited' }, // Margem de 1000
}

export interface RateLimitResult {
  allowed: boolean
  retryAfter?: number // segundos
  remaining?: number
  reason?: string
}

export interface RateLimiterStats {
  dailySent: number
  dailyLimit: number
  dailyRemaining: number
  errors: Record<string, number>
  tier: number
  tierName: string
  isThrottled: boolean
  utilizationPercent: number
}

export class WhatsAppRateLimiter {
  private instanceId: string
  private tier: number
  private throughputLimiter: Ratelimit | null = null

  constructor(instanceId: string, tier: number = 1) {
    this.instanceId = instanceId
    this.tier = Math.min(Math.max(tier, 0), 4) // Clamp 0-4
  }

  private getThroughputLimiter(): Ratelimit {
    if (!this.throughputLimiter) {
      const config = TIER_CONFIG[this.tier]
      const targetMPS = Math.floor(config.mps * 0.9) // 90% do limite (margem)

      this.throughputLimiter = new Ratelimit({
        redis: getRedis(),
        limiter: Ratelimit.tokenBucket(targetMPS, '1 s', config.mps),
        prefix: `wa:throughput:${this.instanceId}`,
        analytics: true,
      })
    }
    return this.throughputLimiter
  }

  /**
   * Verificar se pode enviar mensagem
   * Checa: throughput global, pair rate, daily quota
   */
  async canSend(toPhone: string): Promise<RateLimitResult> {
    const redis = getRedis()

    // 1. Verificar se está em throttle (muitos erros 429)
    const isThrottled = await this.isThrottled()
    if (isThrottled) {
      const ttl = await redis.ttl(`wa:throttle:${this.instanceId}`)
      return {
        allowed: false,
        retryAfter: ttl > 0 ? ttl : 60,
        reason: 'Instance throttled due to rate limit errors',
      }
    }

    // 2. Check throughput global (MPS)
    const throughputResult = await this.getThroughputLimiter().limit(this.instanceId)
    if (!throughputResult.success) {
      const retryAfter = Math.ceil((throughputResult.reset - Date.now()) / 1000)
      return {
        allowed: false,
        retryAfter: Math.max(retryAfter, 1),
        remaining: throughputResult.remaining,
        reason: 'Throughput limit exceeded',
      }
    }

    // 3. Check pair rate (10 msg/min por destinatário - regra da Meta)
    const pairKey = `wa:pair:${this.instanceId}:${toPhone}`
    const pairLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '1 m'),
      prefix: pairKey,
    })

    const pairResult = await pairLimiter.limit(toPhone)
    if (!pairResult.success) {
      const retryAfter = Math.ceil((pairResult.reset - Date.now()) / 1000)
      return {
        allowed: false,
        retryAfter: Math.max(retryAfter, 6), // Mínimo 6s (pair rate = 1 msg/6s)
        reason: 'Pair rate limit exceeded (max 10 msg/min per recipient)',
      }
    }

    // 4. Check daily quota
    const dailyKey = `wa:daily:${this.instanceId}:${this.getTodayKey()}`
    const dailyCount = await redis.incr(dailyKey)

    // Set expiry se é primeira mensagem do dia
    if (dailyCount === 1) {
      await redis.expire(dailyKey, 86400) // 24h
    }

    const config = TIER_CONFIG[this.tier]
    if (config.daily !== Infinity && dailyCount > config.daily) {
      // Decrementar pois não vai enviar
      await redis.decr(dailyKey)
      return {
        allowed: false,
        retryAfter: this.getSecondsUntilMidnight(),
        remaining: 0,
        reason: `Daily limit exceeded (${config.daily} messages)`,
      }
    }

    return {
      allowed: true,
      remaining: config.daily === Infinity ? Infinity : config.daily - dailyCount,
    }
  }

  /**
   * Registrar erro da API
   * Se muitos 429s, ativa throttle
   */
  async recordError(errorCode: string | number): Promise<void> {
    const redis = getRedis()
    const errorKey = `wa:errors:${this.instanceId}:${this.getTodayKey()}`

    await redis.hincrby(errorKey, String(errorCode), 1)
    await redis.expire(errorKey, 86400)

    // Se muitos erros de rate limit (429 ou 80007), ativar throttle
    const rateLimitCodes = ['429', '80007', '130429', '131056']
    let totalRateLimitErrors = 0

    for (const code of rateLimitCodes) {
      const count = await redis.hget(errorKey, code)
      totalRateLimitErrors += parseInt(count as string || '0')
    }

    // Throttle progressivo baseado em erros
    if (totalRateLimitErrors >= 50) {
      await redis.setex(`wa:throttle:${this.instanceId}`, 600, '1') // 10 min
      console.log(`🔴 Instance ${this.instanceId} throttled for 10min (${totalRateLimitErrors} rate limit errors)`)
    } else if (totalRateLimitErrors >= 20) {
      await redis.setex(`wa:throttle:${this.instanceId}`, 300, '1') // 5 min
      console.log(`🟠 Instance ${this.instanceId} throttled for 5min (${totalRateLimitErrors} rate limit errors)`)
    } else if (totalRateLimitErrors >= 10) {
      await redis.setex(`wa:throttle:${this.instanceId}`, 60, '1') // 1 min
      console.log(`🟡 Instance ${this.instanceId} throttled for 1min (${totalRateLimitErrors} rate limit errors)`)
    }
  }

  /**
   * Registrar sucesso - limpa throttle se estava ativo
   */
  async recordSuccess(): Promise<void> {
    // Opcionalmente decrementar contador de erros ou limpar throttle
    // Por enquanto, deixa o throttle expirar naturalmente
  }

  /**
   * Verificar se instância está em throttle
   */
  async isThrottled(): Promise<boolean> {
    const redis = getRedis()
    return (await redis.exists(`wa:throttle:${this.instanceId}`)) === 1
  }

  /**
   * Obter estatísticas atuais
   */
  async getStats(): Promise<RateLimiterStats> {
    const redis = getRedis()
    const today = this.getTodayKey()

    const [dailyCount, errors, isThrottled] = await Promise.all([
      redis.get(`wa:daily:${this.instanceId}:${today}`),
      redis.hgetall(`wa:errors:${this.instanceId}:${today}`),
      this.isThrottled(),
    ])

    const config = TIER_CONFIG[this.tier]
    const sent = parseInt(dailyCount as string || '0')

    return {
      dailySent: sent,
      dailyLimit: config.daily,
      dailyRemaining: config.daily === Infinity ? Infinity : Math.max(0, config.daily - sent),
      errors: (errors as Record<string, number>) || {},
      tier: this.tier,
      tierName: config.name,
      isThrottled,
      utilizationPercent: config.daily === Infinity ? 0 : (sent / config.daily) * 100,
    }
  }

  /**
   * Calcular delay recomendado entre mensagens
   * Baseado no tier atual
   */
  getRecommendedDelay(): number {
    const config = TIER_CONFIG[this.tier]
    // Delay = 1000ms / (MPS * 0.8) para margem de segurança
    return Math.ceil(1000 / (config.mps * 0.8))
  }

  /**
   * Resetar contadores (para testes)
   */
  async reset(): Promise<void> {
    const redis = getRedis()
    const today = this.getTodayKey()

    await Promise.all([
      redis.del(`wa:daily:${this.instanceId}:${today}`),
      redis.del(`wa:errors:${this.instanceId}:${today}`),
      redis.del(`wa:throttle:${this.instanceId}`),
    ])
  }

  private getTodayKey(): string {
    return new Date().toISOString().split('T')[0]
  }

  private getSecondsUntilMidnight(): number {
    const now = new Date()
    const midnight = new Date(now)
    midnight.setHours(24, 0, 0, 0)
    return Math.ceil((midnight.getTime() - now.getTime()) / 1000)
  }
}

// =============================================
// FACTORY FUNCTION
// =============================================
const rateLimiters = new Map<string, WhatsAppRateLimiter>()

export function getRateLimiter(instanceId: string, tier: number = 1): WhatsAppRateLimiter {
  const key = `${instanceId}:${tier}`
  let limiter = rateLimiters.get(key)

  if (!limiter) {
    limiter = new WhatsAppRateLimiter(instanceId, tier)
    rateLimiters.set(key, limiter)
  }

  return limiter
}

// =============================================
// EXPORTS
// =============================================
export default WhatsAppRateLimiter
