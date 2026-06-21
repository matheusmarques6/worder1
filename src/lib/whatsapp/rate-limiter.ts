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

export type RateLimitBlockCode = 'throttled' | 'throughput' | 'pair_rate' | 'daily_quota'

export interface RateLimitResult {
  allowed: boolean
  retryAfter?: number // segundos
  remaining?: number
  reason?: string
  code?: RateLimitBlockCode
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

  // =============================================
  // [Phase 0 / Phase 2] Atomic single-eval canSend
  // Single custom Lua script: throttle short-circuit (read-only) ->
  // pair sliding-window (read-only on block) -> token-bucket throughput
  // (HMSET state ONLY on grant) -> daily gate (INCR ONLY on grant).
  // KEYS = [throttle, tb, pair, daily, pairSeq]
  // ARGV = [now_ms, refill_per_sec, capacity, cost, pair_limit,
  //         pair_window_ms, daily_ttl, daily_limit(-1 = no gate)]
  // Returns cjson array [status, retryAfterSec, throughputRemaining, dailyCount]
  // status: 0=allowed 1=throttled 2=throughput 3=pair 4=daily
  // =============================================
  private static readonly LUA_CANSEND = `
-- KEYS: throttle, tb (token bucket), pair (sliding-window zset), daily (counter), pairSeq (monotonic seq)
-- ARGV: now_ms, refill_per_sec, capacity, cost, pair_limit, pair_window_ms, daily_ttl, daily_limit
local now      = tonumber(ARGV[1])
local refill   = tonumber(ARGV[2])
local capacity = tonumber(ARGV[3])
local cost     = tonumber(ARGV[4])
local pairLim  = tonumber(ARGV[5])
local pairWin  = tonumber(ARGV[6])
local dailyTtl = tonumber(ARGV[7])
local dailyLim = tonumber(ARGV[8])   -- -1 => no daily gate

-- 1) THROTTLE (read-only, cheapest, short-circuit; consume nothing)
if redis.call('EXISTS', KEYS[1]) == 1 then
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 1 then ttl = 60 end
  return cjson.encode({1, ttl, 0, 0})
end

-- 2) PAIR RATE — sliding window via sorted set (per instance+recipient).
--    Decide BEFORE consuming a throughput token. No state mutation on block.
local pairCutoff = now - pairWin
redis.call('ZREMRANGEBYSCORE', KEYS[3], 0, pairCutoff)
local pairCount = redis.call('ZCARD', KEYS[3])
if pairCount >= pairLim then
  local oldest = redis.call('ZRANGE', KEYS[3], 0, 0, 'WITHSCORES')
  local retry = 6
  if oldest[2] then
    retry = math.ceil((tonumber(oldest[2]) + pairWin - now) / 1000)
    if retry < 6 then retry = 6 end   -- floor: 1 msg / 6s
  end
  return cjson.encode({3, retry, 0, 0})
end

-- 3) THROUGHPUT — token bucket (per instance). [FIX-C1] state is committed ONLY on grant.
local data   = redis.call('HMGET', KEYS[2], 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts     = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end
local elapsed = (now - ts) / 1000
if elapsed < 0 then elapsed = 0 end
tokens = math.min(capacity, tokens + elapsed * refill)
if tokens < cost then
  -- BLOCK: do NOT HMSET (no ts=now). Compute retry read-only so concurrent denials
  -- keep accumulating elapsed against the same ts. [FIX-C1]
  local need  = cost - tokens
  local retry = math.ceil(need / refill)
  if retry < 1 then retry = 1 end
  -- NOTE [FIX-H3]: this 'retry' is seconds-to-refill, NOT the library's interval-boundary reset. Drift expected.
  return cjson.encode({2, retry, math.floor(tokens), 0})
end

-- 4) DAILY GATE — enforced inside the script BEFORE consuming anything. [FIX-H1]
local daily = tonumber(redis.call('GET', KEYS[4])) or 0
if dailyLim >= 0 and daily >= dailyLim then
  -- BLOCK: no INCR, no token spend. retryAfter computed client-side (secondsUntilMidnight).
  return cjson.encode({4, 0, math.floor(tokens), daily})
end

-- 5) ALLOWED — commit token spend, record pair send, INCR daily (only now). [FIX-C1][FIX-H1]
tokens = tokens - cost
redis.call('HMSET', KEYS[2], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[2], math.ceil((capacity / refill) * 1000) + 1000)

-- [FIX-M1] deterministic, replication-safe unique member: now .. ':' .. monotonic seq
local seq = redis.call('INCR', KEYS[5])
redis.call('PEXPIRE', KEYS[5], pairWin + 1000)
redis.call('ZADD', KEYS[3], now, now .. ':' .. seq)
redis.call('PEXPIRE', KEYS[3], pairWin + 1000)

daily = redis.call('INCR', KEYS[4])
if daily == 1 then redis.call('EXPIRE', KEYS[4], dailyTtl) end

return cjson.encode({0, 0, math.floor(tokens), daily})
`.trim()

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
        limiter: Ratelimit.tokenBucket(targetMPS, '1 s', targetMPS),
        prefix: `wa:throughput:${this.instanceId}`,
        analytics: true,
      })
    }
    return this.throughputLimiter
  }

  /**
   * [FIX-H2] Per-instance gating for the atomic Lua canSend path.
   * A stable hash deterministically buckets each instanceId to EXACTLY one
   * path (Lua or legacy), so no instance is ever served by both → no 2x MPS
   * window during canary. WA_RL_LUA_KILL=1 is a global force-legacy switch.
   */
  private luaPathEnabledFor(instanceId: string): boolean {
    if (process.env.WA_RL_LUA_KILL === '1') return false          // global kill-switch (force legacy)
    const pct = parseInt(process.env.WA_RL_LUA_PCT || '0', 10)    // 0..100 rollout percentage
    if (!Number.isFinite(pct) || pct <= 0) return false
    if (pct >= 100) return true
    let h = 0
    for (let i = 0; i < instanceId.length; i++) h = (h * 31 + instanceId.charCodeAt(i)) >>> 0
    return (h % 100) < pct
  }

  /**
   * Verificar se pode enviar mensagem (versão atômica — 1 round-trip).
   * Despacha por-instância para o caminho Lua atômico ([FIX-H2]); qualquer
   * anomalia de eval/parse cai para `canSendLegacy` (fail-CLOSED — [FIX-C2]).
   *
   * NOTE: this is a consuming check — on the ALLOW path it commits a throughput
   * token + records the pair send + INCRs the daily counter. Use `peek()` for a
   * non-consuming probe that mutates no daily/pair/throughput state.
   */
  async canSend(toPhone: string): Promise<RateLimitResult> {
    if (!this.luaPathEnabledFor(this.instanceId)) return this.canSendLegacy(toPhone)

    const config = TIER_CONFIG[this.tier]
    const now = Date.now()
    const args = [
      now,
      Math.floor(config.mps * 0.9),                  // refill/sec
      Math.floor(config.mps * 0.9),                  // capacity == targetMPS (no burst headroom)
      1,                                             // cost
      10,                                            // pair limit (Meta)
      60_000,                                        // pair window ms
      86_400,                                        // daily ttl
      config.daily === Infinity ? -1 : config.daily, // [FIX-H1] daily limit (-1 = no gate)
    ]
    const keys = [
      `wa:throttle:${this.instanceId}`,
      `wa:tb:${this.instanceId}`,
      `wa:pair:${this.instanceId}:${toPhone}`,
      `wa:daily:${this.instanceId}:${this.getTodayKey()}`,
      `wa:pairseq:${this.instanceId}:${toPhone}`,
    ]

    let status: number, retryAfter: number, tput: number, daily: number
    try {
      const raw = await getRedis().eval(WhatsAppRateLimiter.LUA_CANSEND, keys, args)
      const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as number[]
      if (!Array.isArray(parsed) || parsed.length < 4 || typeof parsed[0] !== 'number') {
        throw new Error('rate-limiter Lua returned malformed verdict')
      }
      ;[status, retryAfter, tput, daily] = parsed
    } catch (err) {
      // [FIX-C2] FAIL-CLOSED: fall back to the proven legacy path, NOT fail-open.
      console.error(`⚠️ canSend Lua path failed for ${this.instanceId}; falling back to legacy`, err)
      try {
        return await this.canSendLegacy(toPhone)
      } catch (legacyErr) {
        console.error(`⚠️ canSend legacy fallback also failed for ${this.instanceId}; denying`, legacyErr)
        return { allowed: false, retryAfter: 60, reason: 'Rate limiter unavailable' }
      }
    }

    switch (status) {
      case 0:
        return { allowed: true, remaining: config.daily === Infinity ? Infinity : Math.max(0, config.daily - daily) }
      case 1:
        return { allowed: false, retryAfter: Math.max(retryAfter, 1), reason: 'Instance throttled due to rate limit errors' }
      case 2:
        return { allowed: false, retryAfter: Math.max(retryAfter, 1), remaining: tput, reason: 'Throughput limit exceeded' }
      case 3:
        return { allowed: false, retryAfter: Math.max(retryAfter, 6), reason: 'Pair rate limit exceeded (max 10 msg/min per recipient)' }
      case 4:
        return { allowed: false, retryAfter: this.getSecondsUntilMidnight(), remaining: 0, reason: `Daily limit exceeded (${config.daily} messages)` }
      default:
        // [FIX-C2] unknown status => fail CLOSED via legacy, never fail open.
        console.error(`⚠️ canSend Lua returned unknown status ${status} for ${this.instanceId}; falling back to legacy`)
        return this.canSendLegacy(toPhone)
    }
  }

  /**
   * Probe NÃO-consumidor: responde "posso enviar?" sem gastar token de
   * throughput, sem registrar o pair, sem INCRementar o daily. O dispatcher
   * (Phase 1) usa isto para decidir esperar sem queimar quota.
   *
   * Implementa as MESMAS verificações read-only do Lua (throttle -> pair ->
   * throughput -> daily) mas sem nenhuma mutação de estado, num único eval.
   * Em qualquer anomalia, fail-CLOSED: `{ allowed: false }` conservador.
   */
  async peek(toPhone: string): Promise<RateLimitResult> {
    const config = TIER_CONFIG[this.tier]
    const now = Date.now()
    const args = [
      now,
      Math.floor(config.mps * 0.9),                  // refill/sec
      Math.floor(config.mps * 0.9),                  // capacity == targetMPS (no burst headroom)
      1,                                             // cost
      10,                                            // pair limit
      60_000,                                        // pair window ms
      config.daily === Infinity ? -1 : config.daily, // daily limit (-1 = no gate)
    ]
    const keys = [
      `wa:throttle:${this.instanceId}`,
      `wa:tb:${this.instanceId}`,
      `wa:pair:${this.instanceId}:${toPhone}`,
      `wa:daily:${this.instanceId}:${this.getTodayKey()}`,
    ]

    let status: number, retryAfter: number, tput: number, daily: number
    try {
      const raw = await getRedis().eval(WhatsAppRateLimiter.LUA_PEEK, keys, args)
      const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as number[]
      if (!Array.isArray(parsed) || parsed.length < 4 || typeof parsed[0] !== 'number') {
        throw new Error('rate-limiter peek Lua returned malformed verdict')
      }
      ;[status, retryAfter, tput, daily] = parsed
    } catch (err) {
      // Fail-CLOSED conservador: na dúvida, não envie já.
      console.error(`⚠️ peek Lua path failed for ${this.instanceId}; denying conservatively`, err)
      return { allowed: false, retryAfter: 1, reason: 'Rate limiter peek unavailable' }
    }

    switch (status) {
      case 0:
        return { allowed: true, remaining: config.daily === Infinity ? Infinity : Math.max(0, config.daily - daily) }
      case 1:
        return { allowed: false, retryAfter: Math.max(retryAfter, 1), reason: 'Instance throttled due to rate limit errors' }
      case 2:
        return { allowed: false, retryAfter: Math.max(retryAfter, 1), remaining: tput, reason: 'Throughput limit exceeded' }
      case 3:
        return { allowed: false, retryAfter: Math.max(retryAfter, 6), reason: 'Pair rate limit exceeded (max 10 msg/min per recipient)' }
      case 4:
        return { allowed: false, retryAfter: this.getSecondsUntilMidnight(), remaining: 0, reason: `Daily limit exceeded (${config.daily} messages)` }
      default:
        return { allowed: false, retryAfter: 1, reason: 'Rate limiter peek unavailable' }
    }
  }

  // =============================================
  // [Phase 0] Non-consuming peek Lua (read-only mirror of LUA_CANSEND).
  // NEVER mutates state: no HMSET, no ZADD, no INCR. Projects token refill and
  // reads the daily counter to produce the SAME verdict canSend would, without
  // spending anything. KEYS = [throttle, tb, pair, daily]; ARGV omits pair_seq
  // and daily_ttl (no writes).
  // =============================================
  private static readonly LUA_PEEK = `
-- KEYS: throttle, tb (token bucket), pair (sliding-window zset), daily (counter)
-- ARGV: now_ms, refill_per_sec, capacity, cost, pair_limit, pair_window_ms, daily_limit
local now      = tonumber(ARGV[1])
local refill   = tonumber(ARGV[2])
local capacity = tonumber(ARGV[3])
local cost     = tonumber(ARGV[4])
local pairLim  = tonumber(ARGV[5])
local pairWin  = tonumber(ARGV[6])
local dailyLim = tonumber(ARGV[7])   -- -1 => no daily gate

-- 1) THROTTLE (read-only)
if redis.call('EXISTS', KEYS[1]) == 1 then
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 1 then ttl = 60 end
  return cjson.encode({1, ttl, 0, 0})
end

-- 2) PAIR RATE (read-only; no ZREMRANGEBYSCORE write — count only fresh members)
local pairCutoff = now - pairWin
local fresh = redis.call('ZCOUNT', KEYS[3], pairCutoff, '+inf')
if fresh >= pairLim then
  local oldest = redis.call('ZRANGEBYSCORE', KEYS[3], pairCutoff, '+inf', 'WITHSCORES', 'LIMIT', 0, 1)
  local retry = 6
  if oldest[2] then
    retry = math.ceil((tonumber(oldest[2]) + pairWin - now) / 1000)
    if retry < 6 then retry = 6 end
  end
  return cjson.encode({3, retry, 0, 0})
end

-- 3) THROUGHPUT — token bucket projection (read-only; no HMSET)
local data   = redis.call('HMGET', KEYS[2], 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts     = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end
local elapsed = (now - ts) / 1000
if elapsed < 0 then elapsed = 0 end
tokens = math.min(capacity, tokens + elapsed * refill)
if tokens < cost then
  local need  = cost - tokens
  local retry = math.ceil(need / refill)
  if retry < 1 then retry = 1 end
  return cjson.encode({2, retry, math.floor(tokens), 0})
end

-- 4) DAILY GATE (read-only)
local daily = tonumber(redis.call('GET', KEYS[4])) or 0
if dailyLim >= 0 and daily >= dailyLim then
  return cjson.encode({4, 0, math.floor(tokens), daily})
end

return cjson.encode({0, 0, math.floor(tokens), daily})
`.trim()

  /**
   * Verificar se pode enviar mensagem (LEGADO — caminho da biblioteca).
   * Checa: throughput global, pair rate, daily quota.
   * Mantido verbatim como fallback fail-CLOSED do caminho Lua atômico.
   */
  private async canSendLegacy(toPhone: string): Promise<RateLimitResult> {
    const redis = getRedis()

    // 1. Verificar se está em throttle (muitos erros 429)
    const isThrottled = await this.isThrottled()
    if (isThrottled) {
      const ttl = await redis.ttl(`wa:throttle:${this.instanceId}`)
      return {
        allowed: false,
        retryAfter: ttl > 0 ? ttl : 60,
        reason: 'Instance throttled due to rate limit errors',
        code: 'throttled',
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
        code: 'throughput',
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
        code: 'pair_rate',
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
        code: 'daily_quota',
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
    // [Phase 0 / 0C] '4' é o código de rate-limit mais comum da Meta
    // (WhatsAppCloudError.isRateLimited = 4 || 80007); '130429'/'131048'/'131049'
    // são os códigos de throughput/marketing que faltavam para o throttle ladder engatar.
    const rateLimitCodes = ['4', '429', '80007', '130429', '131048', '131049', '131056']
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
