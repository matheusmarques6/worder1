// =============================================
// WHATSAPP RATE LIMITER - ALTA ESCALA
// Controle de throughput por tier da Meta
// =============================================

import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import {
  MESSAGING_LIMIT_BY_TIER,
  TIER_NAME,
  TIER_CONFIG,
  throughputMpsForTier,
  UNLIMITED_SENTINEL,
} from '@/config/whatsapp-tiers'

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

// [Phase 4] Daily quota = UNIQUE business-initiated recipients per rolling 24h.
// Numerics (MPS decoupled from tier, daily = unique recipients) live in the single
// source of truth: src/config/whatsapp-tiers.ts (re-exported `TIER_CONFIG` for compat).
export { TIER_CONFIG }

// [Phase 4] Daily-recipient TTL: 48h so the yesterday day-key survives the two-day
// rolling-window overlap (today + weighted-yesterday). [FIX-H2]
const DAILY_RECIP_TTL = 172_800

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
  // (HMSET state ONLY on grant) -> daily gate.
  //
  // [Phase 4] DAILY GATE = UNIQUE business-initiated recipients / rolling 24h.
  // Replaces the per-send INCR with a recipient-keyed unique counter, gated and
  // committed ATOMICALLY in this same eval (no SADD->SCARD->SREM across round-trips):
  //  - tiers 0-2: EXACT SET (SADD/SCARD); over-limit add is rolled back via SREM
  //    inside the eval (the new recipient is only kept if it stays within limit). [FIX-C2][FIX-H1]
  //  - tier 3:    HyperLogLog (PFADD/PFCOUNT); gate at limit*0.99 (conservative,
  //    PFADD is irreversible so we check effective count BEFORE committing). [FIX-H1]
  //  - tier 4:    no daily gate.
  // Window: two day-keys (today + yesterday) merged; yesterday weighted by
  //   (1 - elapsedFractionOfTodayUtc) so there is no clean 2x reset at 00:00 UTC. [FIX-H2]
  // Idempotency: a re-send to an already-present recipient (SADD->0) consumes
  //   nothing and is always allowed.
  //
  // KEYS = [throttle, tb, pair, todayRecip, pairSeq, yesterdayRecip]
  // ARGV = [now_ms, refill_per_sec, capacity, cost, pair_limit, pair_window_ms,
  //         daily_ttl, daily_limit(-1=no gate), tier, recipient, yday_weight_bps]
  //   yday_weight_bps = floor((1 - elapsedFractionOfTodayUtc) * 10000)  (basis points)
  // Returns cjson array [status, retryAfterSec, throughputRemaining, dailyCount]
  // status: 0=allowed 1=throttled 2=throughput 3=pair 4=daily
  // =============================================
  private static readonly LUA_CANSEND = `
-- KEYS: throttle, tb (token bucket), pair (sliding-window zset), todayRecip, pairSeq, yesterdayRecip
-- ARGV: now_ms, refill_per_sec, capacity, cost, pair_limit, pair_window_ms,
--       daily_ttl, daily_limit, tier, recipient, yday_weight_bps
local now      = tonumber(ARGV[1])
local refill   = tonumber(ARGV[2])
local capacity = tonumber(ARGV[3])
local cost     = tonumber(ARGV[4])
local pairLim  = tonumber(ARGV[5])
local pairWin  = tonumber(ARGV[6])
local dailyTtl = tonumber(ARGV[7])
local dailyLim = tonumber(ARGV[8])   -- -1 => no daily gate
local tier     = tonumber(ARGV[9])
local recip    = ARGV[10]
local ydayBps  = tonumber(ARGV[11])  -- (1 - elapsedFractionOfTodayUtc) * 10000

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

-- 4) DAILY GATE — UNIQUE recipients / rolling 24h, atomic count-and-gate. [FIX-C2][FIX-H1][FIX-H2]
--    Committed ONLY if (and after) it passes; rollback inside this eval otherwise.
local dailyCount = 0
if dailyLim >= 0 then
  if tier >= 3 then
    -- HyperLogLog (tier 3+). PFADD is irreversible, so gate on effective count
    -- BEFORE committing, with a conservative limit*0.99 boundary. [FIX-H1]
    local todayC = redis.call('PFCOUNT', KEYS[4])
    local ydayC  = redis.call('PFCOUNT', KEYS[6])
    local effective = todayC + math.floor(ydayC * ydayBps / 10000)
    dailyCount = effective
    local gate = math.floor(dailyLim * 0.99)
    if effective >= gate then
      -- BLOCK: no PFADD, no token spend. (A re-send to an existing recipient over
      -- the gate is also blocked — HLL cannot test membership cheaply; conservative.)
      return cjson.encode({4, 0, math.floor(tokens), effective})
    end
    redis.call('PFADD', KEYS[4], recip)
    redis.call('EXPIRE', KEYS[4], dailyTtl)
    dailyCount = effective + 1
  else
    -- EXACT SET (tiers 0-2). Atomic probe-and-rollback. [FIX-C2]
    local added = redis.call('SADD', KEYS[4], recip)
    if added == 1 then
      local todayC = redis.call('SCARD', KEYS[4])
      local ydayC  = redis.call('SCARD', KEYS[6])
      local effective = todayC + math.floor(ydayC * ydayBps / 10000)
      if effective > dailyLim then
        -- ROLLBACK the just-added member within the same eval; no token spend. [FIX-C2]
        redis.call('SREM', KEYS[4], recip)
        return cjson.encode({4, 0, math.floor(tokens), effective - 1})
      end
      redis.call('EXPIRE', KEYS[4], dailyTtl)
      dailyCount = effective
    else
      -- Idempotent re-send: already counted today. Consumes nothing, always allowed.
      local todayC = redis.call('SCARD', KEYS[4])
      local ydayC  = redis.call('SCARD', KEYS[6])
      dailyCount = todayC + math.floor(ydayC * ydayBps / 10000)
    end
  end
end

-- 5) ALLOWED — commit token spend, record pair send. [FIX-C1]
tokens = tokens - cost
redis.call('HMSET', KEYS[2], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[2], math.ceil((capacity / refill) * 1000) + 1000)

-- [FIX-M1] deterministic, replication-safe unique member: now .. ':' .. monotonic seq
local seq = redis.call('INCR', KEYS[5])
redis.call('PEXPIRE', KEYS[5], pairWin + 1000)
redis.call('ZADD', KEYS[3], now, now .. ':' .. seq)
redis.call('PEXPIRE', KEYS[3], pairWin + 1000)

return cjson.encode({0, 0, math.floor(tokens), dailyCount})
`.trim()

  constructor(instanceId: string, tier: number = 1) {
    this.instanceId = instanceId
    this.tier = Math.min(Math.max(tier, 0), 4) // Clamp 0-4
  }

  private getThroughputLimiter(): Ratelimit {
    if (!this.throughputLimiter) {
      // [FIX-M3] Throughput is per-phone-number, NOT tier-derived (except tier-0 floor).
      const mps = throughputMpsForTier(this.tier)
      const targetMPS = Math.floor(mps * 0.9) // 90% do limite (margem)

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

  /** Daily messaging limit (unique recipients/24h) for this tier; Infinity = unlimited. */
  private dailyLimit(): number {
    return MESSAGING_LIMIT_BY_TIER[this.tier]
  }

  /**
   * Verificar se pode enviar mensagem (versão atômica — 1 round-trip).
   * Despacha por-instância para o caminho Lua atômico ([FIX-H2]); qualquer
   * anomalia de eval/parse cai para `canSendLegacy` (fail-CLOSED — [FIX-C2]).
   *
   * NOTE: this is a consuming check — on the ALLOW path it commits a throughput
   * token + records the pair send + counts the unique recipient (idempotent per
   * recipient). Use `peek()` for a non-consuming probe that mutates no state.
   */
  async canSend(toPhone: string): Promise<RateLimitResult> {
    if (!this.luaPathEnabledFor(this.instanceId)) return this.canSendLegacy(toPhone)

    const limit = this.dailyLimit()
    const mps = throughputMpsForTier(this.tier)
    const now = Date.now()
    const args = [
      now,
      Math.floor(mps * 0.9),                  // refill/sec
      Math.floor(mps * 0.9),                  // capacity == targetMPS (no burst headroom)
      1,                                      // cost
      10,                                     // pair limit (Meta)
      60_000,                                 // pair window ms
      DAILY_RECIP_TTL,                        // daily ttl (48h, two-day rolling window)
      limit === Infinity ? -1 : limit,        // [FIX-H1] daily limit (-1 = no gate)
      this.tier,                              // tier (selects exact SET vs HLL)
      toPhone,                                // recipient (unique-count member)
      this.yesterdayWeightBps(),              // [FIX-H2] (1 - elapsedFractionOfTodayUtc) * 10000
    ]
    const keys = [
      `wa:throttle:${this.instanceId}`,
      `wa:tb:${this.instanceId}`,
      `wa:pair:${this.instanceId}:${toPhone}`,
      `wa:dailyrecip:${this.instanceId}:${this.getTodayKey()}`,
      `wa:pairseq:${this.instanceId}:${toPhone}`,
      `wa:dailyrecip:${this.instanceId}:${this.getYesterdayKey()}`,
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
        return { allowed: true, remaining: limit === Infinity ? Infinity : Math.max(0, limit - daily) }
      case 1:
        return { allowed: false, retryAfter: Math.max(retryAfter, 1), reason: 'Instance throttled due to rate limit errors' }
      case 2:
        return { allowed: false, retryAfter: Math.max(retryAfter, 1), remaining: tput, reason: 'Throughput limit exceeded' }
      case 3:
        return { allowed: false, retryAfter: Math.max(retryAfter, 6), reason: 'Pair rate limit exceeded (max 10 msg/min per recipient)' }
      case 4:
        return { allowed: false, retryAfter: this.getSecondsUntilMidnight(), remaining: 0, reason: 'Messaging limit exceeded (unique recipients/24h)' }
      default:
        // [FIX-C2] unknown status => fail CLOSED via legacy, never fail open.
        console.error(`⚠️ canSend Lua returned unknown status ${status} for ${this.instanceId}; falling back to legacy`)
        return this.canSendLegacy(toPhone)
    }
  }

  /**
   * Probe NÃO-consumidor: responde "posso enviar?" sem gastar token de
   * throughput, sem registrar o pair, sem contar o destinatário. O dispatcher
   * (Phase 1) usa isto para decidir esperar sem queimar quota.
   *
   * Implementa as MESMAS verificações read-only do Lua (throttle -> pair ->
   * throughput -> daily) mas sem nenhuma mutação de estado, num único eval.
   * Em qualquer anomalia, fail-CLOSED: `{ allowed: false }` conservador.
   */
  async peek(toPhone: string): Promise<RateLimitResult> {
    const limit = this.dailyLimit()
    const mps = throughputMpsForTier(this.tier)
    const now = Date.now()
    const args = [
      now,
      Math.floor(mps * 0.9),                  // refill/sec
      Math.floor(mps * 0.9),                  // capacity == targetMPS (no burst headroom)
      1,                                      // cost
      10,                                     // pair limit
      60_000,                                 // pair window ms
      limit === Infinity ? -1 : limit,        // daily limit (-1 = no gate)
      this.tier,                              // tier (selects exact SET vs HLL)
      this.yesterdayWeightBps(),              // [FIX-H2] yesterday weight (basis points)
    ]
    const keys = [
      `wa:throttle:${this.instanceId}`,
      `wa:tb:${this.instanceId}`,
      `wa:pair:${this.instanceId}:${toPhone}`,
      `wa:dailyrecip:${this.instanceId}:${this.getTodayKey()}`,
      `wa:dailyrecip:${this.instanceId}:${this.getYesterdayKey()}`,
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
        return { allowed: true, remaining: limit === Infinity ? Infinity : Math.max(0, limit - daily) }
      case 1:
        return { allowed: false, retryAfter: Math.max(retryAfter, 1), reason: 'Instance throttled due to rate limit errors' }
      case 2:
        return { allowed: false, retryAfter: Math.max(retryAfter, 1), remaining: tput, reason: 'Throughput limit exceeded' }
      case 3:
        return { allowed: false, retryAfter: Math.max(retryAfter, 6), reason: 'Pair rate limit exceeded (max 10 msg/min per recipient)' }
      case 4:
        return { allowed: false, retryAfter: this.getSecondsUntilMidnight(), remaining: 0, reason: 'Messaging limit exceeded (unique recipients/24h)' }
      default:
        return { allowed: false, retryAfter: 1, reason: 'Rate limiter peek unavailable' }
    }
  }

  // =============================================
  // [Phase 0 / Phase 4] Non-consuming peek Lua (read-only mirror of LUA_CANSEND).
  // NEVER mutates state: no HMSET, no ZADD, no SADD/PFADD. Projects token refill
  // and reads the unique-recipient daily counter (today + weighted-yesterday) to
  // produce the SAME verdict canSend would, without spending anything.
  // For exact tiers it checks membership read-only via SISMEMBER (already-counted
  // recipients are always allowed); for HLL it gates on the conservative effective
  // count. KEYS = [throttle, tb, pair, todayRecip, yesterdayRecip];
  // ARGV = [now, refill, capacity, cost, pair_limit, pair_window_ms,
  //         daily_limit, tier, recipient, yday_weight_bps].
  // =============================================
  private static readonly LUA_PEEK = `
-- KEYS: throttle, tb (token bucket), pair (sliding-window zset), todayRecip, yesterdayRecip
-- ARGV: now_ms, refill_per_sec, capacity, cost, pair_limit, pair_window_ms,
--       daily_limit, tier, recipient, yday_weight_bps
local now      = tonumber(ARGV[1])
local refill   = tonumber(ARGV[2])
local capacity = tonumber(ARGV[3])
local cost     = tonumber(ARGV[4])
local pairLim  = tonumber(ARGV[5])
local pairWin  = tonumber(ARGV[6])
local dailyLim = tonumber(ARGV[7])   -- -1 => no daily gate
local tier     = tonumber(ARGV[8])
local recip    = ARGV[9]
local ydayBps  = tonumber(ARGV[10])

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

-- 4) DAILY GATE (read-only) — UNIQUE recipients / rolling 24h. [FIX-H1][FIX-H2]
if dailyLim >= 0 then
  if tier >= 3 then
    local todayC = redis.call('PFCOUNT', KEYS[4])
    local ydayC  = redis.call('PFCOUNT', KEYS[5])
    local effective = todayC + math.floor(ydayC * ydayBps / 10000)
    local gate = math.floor(dailyLim * 0.99)
    if effective >= gate then
      return cjson.encode({4, 0, math.floor(tokens), effective})
    end
    return cjson.encode({0, 0, math.floor(tokens), effective})
  else
    local todayC = redis.call('SCARD', KEYS[4])
    local ydayC  = redis.call('SCARD', KEYS[5])
    local effective = todayC + math.floor(ydayC * ydayBps / 10000)
    -- Already-counted recipient is always allowed (idempotent re-send).
    if redis.call('SISMEMBER', KEYS[4], recip) == 1 then
      return cjson.encode({0, 0, math.floor(tokens), effective})
    end
    if effective >= dailyLim then
      return cjson.encode({4, 0, math.floor(tokens), effective})
    end
    return cjson.encode({0, 0, math.floor(tokens), effective})
  end
end

return cjson.encode({0, 0, math.floor(tokens), 0})
`.trim()

  /**
   * Verificar se pode enviar mensagem (LEGADO — caminho da biblioteca).
   * Checa: throughput global, pair rate, daily quota (UNIQUE recipients/24h).
   * Mantido como fallback fail-CLOSED do caminho Lua atômico; consistente com o
   * novo modelo de destinatários únicos (não contradiz o Lua). [Phase 4]
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

    // 4. Check daily quota — UNIQUE business-initiated recipients / rolling 24h.
    // [Phase 4] Exact SET (tiers 0-2) / HLL (tier 3+); re-send to an already-counted
    // recipient consumes nothing. Two-day rolling merge (today + weighted-yesterday).
    const limit = this.dailyLimit()
    if (limit !== Infinity) {
      const todayKey = `wa:dailyrecip:${this.instanceId}:${this.getTodayKey()}`
      const yesterdayKey = `wa:dailyrecip:${this.instanceId}:${this.getYesterdayKey()}`
      const weight = this.yesterdayWeightBps() / 10000

      if (this.tier >= 3) {
        // HyperLogLog: gate conservatively at limit*0.99 BEFORE committing (PFADD irreversible).
        const [todayC, ydayC] = await Promise.all([
          redis.pfcount(todayKey),
          redis.pfcount(yesterdayKey),
        ])
        const effective = (todayC as number) + Math.floor((ydayC as number) * weight)
        if (effective >= Math.floor(limit * 0.99)) {
          return {
            allowed: false,
            retryAfter: this.getSecondsUntilMidnight(),
            remaining: 0,
            reason: 'Messaging limit exceeded (unique recipients/24h)',
            code: 'daily_quota',
          }
        }
        await redis.pfadd(todayKey, toPhone)
        await redis.expire(todayKey, DAILY_RECIP_TTL)
        return { allowed: true, remaining: Math.max(0, limit - (effective + 1)) }
      }

      // Exact SET: add, then check; rollback on over-limit.
      const added = await redis.sadd(todayKey, toPhone)
      if (added === 1) {
        const [todayC, ydayC] = await Promise.all([
          redis.scard(todayKey),
          redis.scard(yesterdayKey),
        ])
        const effective = (todayC as number) + Math.floor((ydayC as number) * weight)
        if (effective > limit) {
          await redis.srem(todayKey, toPhone)
          return {
            allowed: false,
            retryAfter: this.getSecondsUntilMidnight(),
            remaining: 0,
            reason: 'Messaging limit exceeded (unique recipients/24h)',
            code: 'daily_quota',
          }
        }
        await redis.expire(todayKey, DAILY_RECIP_TTL)
        return { allowed: true, remaining: Math.max(0, limit - effective) }
      }
      // Idempotent re-send: already counted; consumes nothing.
      const [todayC, ydayC] = await Promise.all([
        redis.scard(todayKey),
        redis.scard(yesterdayKey),
      ])
      const effective = (todayC as number) + Math.floor((ydayC as number) * weight)
      return { allowed: true, remaining: Math.max(0, limit - effective) }
    }

    return { allowed: true, remaining: Infinity }
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
   * Obter estatísticas atuais.
   * [Phase 4] `dailySent` = destinatários ÚNICOS contados na janela de 24h
   * (hoje + ontem ponderado), NÃO total de mensagens. `dailyLimit`/`dailyRemaining`
   * usam o sentinela UNLIMITED_SENTINEL (-1) para tier ilimitado pois Infinity
   * serializa para null em JSON. [FIX-L2][FIX-M2]
   */
  async getStats(): Promise<RateLimiterStats> {
    const redis = getRedis()
    const todayKey = `wa:dailyrecip:${this.instanceId}:${this.getTodayKey()}`
    const yesterdayKey = `wa:dailyrecip:${this.instanceId}:${this.getYesterdayKey()}`
    const limit = this.dailyLimit()
    const weight = this.yesterdayWeightBps() / 10000

    let sent = 0
    let errors: Record<string, number> = {}
    let isThrottled = false

    if (limit === Infinity) {
      // Sem gate diário — não há contador de destinatários únicos a ler.
      const [errs, thr] = await Promise.all([
        redis.hgetall(`wa:errors:${this.instanceId}:${this.getTodayKey()}`),
        this.isThrottled(),
      ])
      errors = (errs as Record<string, number>) || {}
      isThrottled = thr
    } else if (this.tier >= 3) {
      const [todayC, ydayC, errs, thr] = await Promise.all([
        redis.pfcount(todayKey),
        redis.pfcount(yesterdayKey),
        redis.hgetall(`wa:errors:${this.instanceId}:${this.getTodayKey()}`),
        this.isThrottled(),
      ])
      sent = (todayC as number) + Math.floor((ydayC as number) * weight)
      errors = (errs as Record<string, number>) || {}
      isThrottled = thr
    } else {
      const [todayC, ydayC, errs, thr] = await Promise.all([
        redis.scard(todayKey),
        redis.scard(yesterdayKey),
        redis.hgetall(`wa:errors:${this.instanceId}:${this.getTodayKey()}`),
        this.isThrottled(),
      ])
      sent = (todayC as number) + Math.floor((ydayC as number) * weight)
      errors = (errs as Record<string, number>) || {}
      isThrottled = thr
    }

    return {
      dailySent: sent,
      dailyLimit: limit === Infinity ? UNLIMITED_SENTINEL : limit,
      dailyRemaining: limit === Infinity ? UNLIMITED_SENTINEL : Math.max(0, limit - sent),
      errors,
      tier: this.tier,
      tierName: TIER_NAME[this.tier],
      isThrottled,
      utilizationPercent: limit === Infinity ? 0 : (sent / limit) * 100,
    }
  }

  /**
   * Calcular delay recomendado entre mensagens.
   * [FIX-M3] Baseado no throughput (MPS) por número, NÃO derivado do tier de mensagens.
   */
  getRecommendedDelay(): number {
    // Delay = 1000ms / (MPS * 0.8) para margem de segurança
    return Math.ceil(1000 / (throughputMpsForTier(this.tier) * 0.8))
  }

  /**
   * Resetar contadores (para testes)
   */
  async reset(): Promise<void> {
    const redis = getRedis()

    await Promise.all([
      redis.del(`wa:dailyrecip:${this.instanceId}:${this.getTodayKey()}`),
      redis.del(`wa:dailyrecip:${this.instanceId}:${this.getYesterdayKey()}`),
      redis.del(`wa:errors:${this.instanceId}:${this.getTodayKey()}`),
      redis.del(`wa:throttle:${this.instanceId}`),
    ])
  }

  private getTodayKey(): string {
    return new Date().toISOString().split('T')[0]
  }

  // [FIX-H2] Yesterday day-key (UTC) for the two-day rolling-window merge.
  private getYesterdayKey(): string {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().split('T')[0]
  }

  /**
   * [FIX-H2] Yesterday's weight as basis points (integer-safe for Lua):
   * floor((1 - elapsedFractionOfTodayUtc) * 10000). At 00:00 UTC ≈ 10000 (≈100%);
   * at 23:59 UTC ≈ 0. Softens the UTC-boundary reset — no clean 2x window.
   *
   * RESIDUAL: still a bounded approximation of Meta's true sliding 24h window.
   */
  private yesterdayWeightBps(): number {
    const now = new Date()
    const secondsSinceMidnightUtc =
      now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()
    const elapsedFraction = secondsSinceMidnightUtc / 86_400
    return Math.floor((1 - elapsedFraction) * 10_000)
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
