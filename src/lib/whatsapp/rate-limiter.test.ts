// =============================================
// Phase 0 — Workstream 0A (atomic non-consuming canSend) + 0C (error-code ladder)
//
// Target module: src/lib/whatsapp/rate-limiter.ts
//
// These tests describe the Phase-0 CONTRACT, not the current behaviour. Several
// assertions are RED against the code on claude/debug-console-error-FWrLE and
// must go GREEN once the executor lands 0A/0C. Each such test is annotated.
//
// Mocking strategy: the real module news up `@upstash/redis` and
// `@upstash/ratelimit` at call time via getRedis()/getThroughputLimiter().
// We replace `@upstash/redis` with the shared FakeRedis singleton (so the test
// and the SUT share state) and replace `@upstash/ratelimit` with a token-bucket
// fake whose state is committed only on grant. Tests that require a REAL Lua /
// real Upstash atomic eval are gated behind RUN_REDIS_IT.
// =============================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fakeRedis, FakeTokenBucket } from './__fake-redis'

const RUN_REDIS_IT = !!process.env.RUN_REDIS_IT

// A controllable clock so the burst-window assertions are deterministic.
let NOW = 1_700_000_000_000
const now = () => NOW

// One shared token bucket per (instance) so all "lanes" contend on it.
const buckets = new Map<string, FakeTokenBucket>()
// One shared sliding-window pair limiter map: phone -> remaining in window.
const pairState = new Map<string, { count: number; windowStart: number }>()

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() {
      return fakeRedis as any
    }
  },
}))

vi.mock('@upstash/ratelimit', () => {
  return {
    Ratelimit: class {
      private kind: 'tb' | 'sw'
      private cfg: any
      private prefix: string
      constructor(opts: any) {
        this.kind = opts.limiter.__kind
        this.cfg = opts.limiter
        this.prefix = opts.prefix
      }
      static tokenBucket(refillRate: number, interval: string, capacity: number) {
        return { __kind: 'tb', refillRate, interval, capacity }
      }
      static slidingWindow(max: number, interval: string) {
        return { __kind: 'sw', max, interval }
      }
      async limit(id: string) {
        if (this.kind === 'tb') {
          let b = buckets.get(this.prefix)
          if (!b) {
            // 0A burst-cap contract: capacity must equal targetMPS, NOT full mps.
            b = new FakeTokenBucket(this.cfg.refillRate, 1000, this.cfg.capacity, now)
            buckets.set(this.prefix, b)
          }
          return b.limit()
        }
        // sliding window pair-rate (max per 60s)
        const key = `${this.prefix}:${id}`
        const w = pairState.get(key) ?? { count: 0, windowStart: now() }
        if (now() - w.windowStart >= 60_000) {
          w.count = 0
          w.windowStart = now()
        }
        if (w.count >= this.cfg.max) {
          pairState.set(key, w)
          return { success: false, remaining: 0, reset: w.windowStart + 60_000 }
        }
        w.count += 1
        pairState.set(key, w)
        return { success: true, remaining: this.cfg.max - w.count, reset: w.windowStart + 60_000 }
      }
    },
  }
})

import { WhatsAppRateLimiter, TIER_CONFIG } from '@/lib/whatsapp/rate-limiter'

beforeEach(() => {
  fakeRedis.reset()
  buckets.clear()
  pairState.clear()
  process.env.UPSTASH_REDIS_REST_URL = 'http://fake'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake'
  NOW = 1_700_000_000_000
})

// ---------------------------------------------------------------------------
// 0A — denied check mutates NO daily/pair-rate state
// ---------------------------------------------------------------------------
describe('0A: a DENIED check does not consume daily quota or pair-rate tokens', () => {
  it('a throttled instance: canSend denial leaves daily counter at 0', async () => {
    const rl = new WhatsAppRateLimiter('inst-A', 1)
    // Simulate active throttle (0C ladder already fired).
    await fakeRedis.setex('wa:throttle:inst-A', 600, '1')

    const todayKey = new Date().toISOString().split('T')[0]
    // [Phase 4] daily accounting is now a UNIQUE-recipient SET, not an INCR counter.
    const dailyKey = `wa:dailyrecip:inst-A:${todayKey}`

    const res = await rl.canSend('5511999990001')
    expect(res.allowed).toBe(false)

    // CONTRACT (0A): a denied attempt must NOT have added a unique recipient.
    // Throttle path returns before the daily gate, so the recipient set stays empty.
    const daily = await fakeRedis.scard(dailyKey)
    expect(daily).toBe(0)
  })

  it('CONTRACT: when pair-rate or throughput denies, the daily counter is NOT consumed', async () => {
    // CURRENT CODE ORDERING (rate-limiter.ts:90-151): throughput -> pair -> daily.
    // daily is the LAST gate, so a throughput/pair denial already avoids the
    // daily incr. The Phase-0 risk is the INVERSE: the *peek()* contract must
    // also avoid consuming a THROUGHPUT token on a denied call. We assert the
    // observable: after a denied canSend, the daily key is untouched.
    const rl = new WhatsAppRateLimiter('inst-B', 1)
    const todayKey = new Date().toISOString().split('T')[0]
    // [Phase 4] unique-recipient SET. Same phone 10x → SADD adds once (idempotent),
    // so SCARD stays 1; the denied 11th must not change it.
    const dailyKey = `wa:dailyrecip:inst-B:${todayKey}`

    // Exhaust the pair-rate window for this phone (max 10/min).
    const phone = '5511888880002'
    for (let i = 0; i < 10; i++) {
      const r = await rl.canSend(phone)
      expect(r.allowed).toBe(true)
    }
    const before = await fakeRedis.scard(dailyKey)

    const denied = await rl.canSend(phone) // 11th -> pair-rate denies
    expect(denied.allowed).toBe(false)
    expect(denied.reason).toMatch(/pair rate/i)

    const after = await fakeRedis.scard(dailyKey)
    // A denied call must not have advanced the unique-recipient count.
    expect(after).toBe(before)
  })

  it('CONTRACT: peek() does not consume a throughput token (RED until 0A lands)', async () => {
    const rl: any = new WhatsAppRateLimiter('inst-peek', 1)
    if (typeof rl.peek !== 'function') {
      // Document the missing contract loudly rather than silently passing.
      expect(
        rl.peek,
        'Phase 0A requires a non-consuming peek(); not yet implemented',
      ).toBeTypeOf('function')
      return
    }
    const targetMPS = Math.floor(TIER_CONFIG[1].mps * 0.9)
    // Peek many times — must never reduce the bucket below a single consume.
    for (let i = 0; i < targetMPS * 2; i++) {
      await rl.peek('5511777770003')
    }
    const consume = await rl.canSend('5511777770003')
    expect(consume.allowed).toBe(true) // peeks didn't drain the bucket
  })
})

// ---------------------------------------------------------------------------
// 0A — burst cap: aggregate sends across N lanes never exceed targetMPS in 1s
// ---------------------------------------------------------------------------
describe('0A: burst cap — N concurrent lanes never exceed targetMPS in a 1s window', () => {
  it('idle bucket cannot grant a full-tier burst (capacity == targetMPS)', async () => {
    const tier = 2
    // [Phase 4] MPS decoupled from tier: tiers >=1 default to 80 MPS → targetMPS = 72.
    const targetMPS = Math.floor(TIER_CONFIG[tier].mps * 0.9) // 72
    const fullMPS = TIER_CONFIG[tier].mps // 80

    // N lanes all racing canSend within the same 1s window (NOW frozen).
    const N = 16
    const lanes = Array.from({ length: N }, (_, i) => new WhatsAppRateLimiter('inst-burst', tier))

    // Fire fullMPS+N attempts concurrently; clock frozen → single window.
    const attempts = fullMPS + 10
    const results = await Promise.all(
      Array.from({ length: attempts }, (_, i) =>
        lanes[i % N].canSend(`551190000${(1000 + i).toString()}`),
      ),
    )
    const granted = results.filter((r) => r.allowed).length

    // CONTRACT (0A burst cap): grants in a single 1s window must be <= targetMPS,
    // NOT the full tier mps. RED on current code because the token bucket is
    // constructed as tokenBucket(targetMPS, '1 s', config.mps) — capacity =
    // config.mps (full tier) — so an idle bucket grants a full-tier burst.
    // (rate-limiter.ts:71 — capacity arg is `config.mps`, should be targetMPS.)
    expect(granted).toBeLessThanOrEqual(targetMPS)
  })
})

// ---------------------------------------------------------------------------
// 0A — atomic burst under REAL redis (gated): requires the implemented Lua
// ---------------------------------------------------------------------------
describe.skipIf(!RUN_REDIS_IT)('0A: atomic canSend against REAL Upstash (integration)', () => {
  it('aggregate grants across 50 concurrent canSend never exceed targetMPS', async () => {
    // Requires UPSTASH_REDIS_REST_URL/TOKEN to a dev instance AND the Phase-0
    // Lua-backed canSend. Mock fakes cannot prove the EVAL is genuinely atomic.
    const rl = new WhatsAppRateLimiter(`it-burst-${Date.now()}`, 1)
    await rl.reset()
    const targetMPS = Math.floor(TIER_CONFIG[1].mps * 0.9)
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => rl.canSend(`it${i}`)),
    )
    const granted = results.filter((r) => r.allowed).length
    expect(granted).toBeLessThanOrEqual(targetMPS)
  })
})

// ---------------------------------------------------------------------------
// 0C — error-code ladder: code 4 must increment ladder and throttle
// ---------------------------------------------------------------------------
describe('0C: Meta code:4 increments the throttle ladder and throttles past threshold', () => {
  it('CONTRACT: rateLimitCodes must include 4 (RED until 0C lands)', async () => {
    const rl = new WhatsAppRateLimiter('inst-4', 1)
    // 10 code:4 errors → current threshold ladder fires at >=10 (1-min throttle).
    for (let i = 0; i < 10; i++) {
      await rl.recordError(4)
    }
    // CONTRACT (0C step 2): code '4' must be in rateLimitCodes
    // (rate-limiter.ts:165 currently ['429','80007','130429','131056'] — NO '4').
    // RED today: code 4 is counted in the errors hash but never summed into the
    // throttle ladder, so isThrottled() stays false.
    const throttled = await rl.isThrottled()
    expect(throttled, 'code:4 must engage the throttle ladder').toBe(true)
  })

  it('numeric code is recorded under its numeric key, not UNKNOWN', async () => {
    const rl = new WhatsAppRateLimiter('inst-num', 1)
    await rl.recordError(4)
    const todayKey = new Date().toISOString().split('T')[0]
    const errs = await fakeRedis.hgetall(`wa:errors:inst-num:${todayKey}`)
    expect(errs).toBeTruthy()
    expect(errs!['4']).toBe('1')
    expect(errs!['UNKNOWN']).toBeUndefined()
  })

  it('marketing throughput codes 130429/131048/131049 also drive the ladder (RED until 0C lands)', async () => {
    const rl = new WhatsAppRateLimiter('inst-mkt', 1)
    for (let i = 0; i < 10; i++) {
      await rl.recordError(130429)
    }
    // 130429 IS already in the current set, so this is a control that should be
    // GREEN; 131048/131049 are the ones 0C adds.
    expect(await rl.isThrottled()).toBe(true)

    const rl2 = new WhatsAppRateLimiter('inst-mkt2', 1)
    for (let i = 0; i < 10; i++) await rl2.recordError(131049)
    // CONTRACT (0C): 131049 must be in rateLimitCodes (RED today).
    expect(await rl2.isThrottled()).toBe(true)
  })

  it('the existing 429 path still throttles at threshold (regression guard)', async () => {
    const rl = new WhatsAppRateLimiter('inst-429', 1)
    for (let i = 0; i < 20; i++) await rl.recordError(429)
    expect(await rl.isThrottled()).toBe(true)
    // 5-min ladder rung at >=20.
    const ttl = await fakeRedis.ttl('wa:throttle:inst-429')
    expect(ttl).toBe(300)
  })
})

// ===========================================================================
// Phase 4 — tier source-of-truth + unique-recipient daily accounting
// ===========================================================================
import {
  MESSAGING_LIMIT_BY_TIER,
  tierFromMessagingLimit,
  throughputMpsForTier,
  TIER0_THROUGHPUT_MPS,
  DEFAULT_THROUGHPUT_MPS,
  UNLIMITED_SENTINEL,
} from '@/config/whatsapp-tiers'

describe('Phase 4 — config: MESSAGING_LIMIT_BY_TIER (unique recipients/24h)', () => {
  it('has the canonical Meta limits; tier-1 is 1000 (not 2000)', () => {
    expect(MESSAGING_LIMIT_BY_TIER[0]).toBe(250)
    expect(MESSAGING_LIMIT_BY_TIER[1]).toBe(1000)
    expect(MESSAGING_LIMIT_BY_TIER[2]).toBe(10000)
    expect(MESSAGING_LIMIT_BY_TIER[3]).toBe(100000)
    expect(MESSAGING_LIMIT_BY_TIER[4]).toBe(Infinity)
  })
})

describe('Phase 4 — [FIX-C1] tierFromMessagingLimit maps Meta enum string → index', () => {
  it.each([
    ['TIER_250', 0],
    ['TIER_NOT_SET', 0],
    ['TIER_1K', 1],
    ['TIER_10K', 2],
    ['TIER_100K', 3],
    ['UNLIMITED', 4],
    ['TIER_UNLIMITED', 4],
  ] as const)('%s → tier %i', (s, tier) => {
    expect(tierFromMessagingLimit(s)).toBe(tier)
  })

  it('unknown / null / undefined → tier 0 (most conservative)', () => {
    expect(tierFromMessagingLimit('SOMETHING_ELSE')).toBe(0)
    expect(tierFromMessagingLimit(null)).toBe(0)
    expect(tierFromMessagingLimit(undefined)).toBe(0)
    expect(tierFromMessagingLimit('')).toBe(0)
  })
})

describe('Phase 4 — [FIX-M3] throughput is per-number, NOT tier-derived', () => {
  it('tier 0 floors at TIER0_THROUGHPUT_MPS; tiers >=1 use the default', () => {
    expect(throughputMpsForTier(0)).toBe(TIER0_THROUGHPUT_MPS)
    expect(throughputMpsForTier(0)).toBe(10)
    expect(throughputMpsForTier(1)).toBe(DEFAULT_THROUGHPUT_MPS)
    expect(throughputMpsForTier(3)).toBe(80)
    expect(throughputMpsForTier(4)).toBe(80)
  })

  it('getRecommendedDelay differs tier-0 vs tier-1 but is independent of the daily numeric', () => {
    const t0 = new WhatsAppRateLimiter('d0', 0).getRecommendedDelay()
    const t1 = new WhatsAppRateLimiter('d1', 1).getRecommendedDelay()
    const t3 = new WhatsAppRateLimiter('d3', 3).getRecommendedDelay()
    expect(t0).toBe(Math.ceil(1000 / (10 * 0.8)))
    expect(t1).toBe(Math.ceil(1000 / (80 * 0.8)))
    expect(t1).not.toBe(t0)
    // tiers 1 and 3 have very different daily limits but the SAME throughput/delay.
    expect(t3).toBe(t1)
  })
})

describe('Phase 4 — daily gate counts UNIQUE recipients (Lua path)', () => {
  beforeEach(() => {
    process.env.WA_RL_LUA_PCT = '100' // force the atomic Lua path
    vi.useFakeTimers()
    // Fix mid-day UTC so the yesterday-key weight is partial but non-zero.
    vi.setSystemTime(new Date('2026-06-21T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
    delete process.env.WA_RL_LUA_PCT
  })

  // Advance the clock so the throughput token bucket refills between sends.
  const tick = () => vi.setSystemTime(new Date(Date.now() + 1000))

  it('first send to A counts 1; a re-send to A is allowed and consumes nothing', async () => {
    const rl = new WhatsAppRateLimiter('inst-uniq', 1)
    const todayKey = `wa:dailyrecip:inst-uniq:${new Date().toISOString().split('T')[0]}`

    const first = await rl.canSend('5511000000001')
    expect(first.allowed).toBe(true)
    expect(await fakeRedis.scard(todayKey)).toBe(1)

    tick()
    const resend = await rl.canSend('5511000000001')
    expect(resend.allowed).toBe(true)
    // Idempotent: still exactly one unique recipient counted.
    expect(await fakeRedis.scard(todayKey)).toBe(1)
  })

  it('N distinct recipients up to the limit are allowed; the (limit+1)-th NEW one is rejected (tier 0 = 250)', async () => {
    const rl = new WhatsAppRateLimiter('inst-bound', 0) // limit 250, exact SET
    const limit = MESSAGING_LIMIT_BY_TIER[0]
    for (let i = 0; i < limit; i++) {
      const r = await rl.canSend(`+55119${(1000000 + i).toString()}`)
      expect(r.allowed).toBe(true)
      tick()
    }
    const over = await rl.canSend('+5511999999999')
    expect(over.allowed).toBe(false)
    expect(over.reason).toMatch(/messaging limit exceeded/i)
  })

  it('[FIX-C2] tier-0 rejected add is rolled back inside the eval (SCARD never exceeds the limit)', async () => {
    const rl = new WhatsAppRateLimiter('inst-atomic', 0)
    const limit = MESSAGING_LIMIT_BY_TIER[0]
    const todayKey = `wa:dailyrecip:inst-atomic:${new Date().toISOString().split('T')[0]}`
    for (let i = 0; i < limit; i++) {
      await rl.canSend(`+55118${(2000000 + i).toString()}`)
      tick()
    }
    expect(await fakeRedis.scard(todayKey)).toBe(limit)
    const rejected = await rl.canSend('+5511777777777')
    expect(rejected.allowed).toBe(false)
    // The just-attempted member must have been SREM'd: cardinality stays at limit.
    expect(await fakeRedis.scard(todayKey)).toBe(limit)
  })

  it('[FIX-H1] tier-3 (HLL) rejects at limit*0.99, not at limit', async () => {
    const rl = new WhatsAppRateLimiter('inst-hll', 3)
    const todayKey = `wa:dailyrecip:inst-hll:${new Date().toISOString().split('T')[0]}`
    // Pre-seed the HLL day-key with exactly the conservative gate's worth of members.
    const gate = Math.floor(MESSAGING_LIMIT_BY_TIER[3] * 0.99) // 99000
    // Seed directly (avoid spreading 99k args through pfadd). The fake models HLL
    // PFCOUNT as exact cardinality, so this puts effective count exactly at the gate.
    const seed = new Set<string>()
    for (let i = 0; i < gate; i++) seed.add(`g${i}`)
    fakeRedis.sets.set(todayKey, seed)
    const rejected = await rl.canSend('+5511000000099')
    expect(rejected.allowed).toBe(false)
    expect(rejected.reason).toMatch(/messaging limit exceeded/i)
  })

  it('[FIX-L2] tier-4 (unlimited) is never daily-rejected; getStats uses the -1 sentinel and round-trips JSON', async () => {
    const rl = new WhatsAppRateLimiter('inst-unl', 4)
    for (let i = 0; i < 5; i++) {
      const r = await rl.canSend(`+5511000${(3000 + i).toString()}`)
      expect(r.allowed).toBe(true)
      tick()
    }
    const stats = await rl.getStats()
    expect(stats.dailyLimit).toBe(UNLIMITED_SENTINEL)
    expect(stats.dailyLimit).toBe(-1)
    expect(stats.dailyRemaining).toBe(-1)
    // Infinity would serialize to null; the sentinel survives the round-trip.
    const round = JSON.parse(JSON.stringify(stats))
    expect(round.dailyLimit).toBe(-1)
    expect(round.dailyRemaining).toBe(-1)
  })

  it('[FIX-H2] yesterday-key contribution decays with elapsed UTC fraction (no clean 00:00 reset)', async () => {
    const rl = new WhatsAppRateLimiter('inst-roll', 1)
    const dateOf = (d: Date) => d.toISOString().split('T')[0]

    // Seed yesterday's recipient set with 100 unique members.
    const today = new Date('2026-06-21T00:01:00.000Z')
    const ydayKey = `wa:dailyrecip:inst-roll:${dateOf(new Date('2026-06-20T00:00:00.000Z'))}`
    await fakeRedis.sadd(ydayKey, ...Array.from({ length: 100 }, (_, i) => `y${i}`))

    // Just after midnight UTC: yesterday weighs ~100% → effective count ≈ 100 + new.
    vi.setSystemTime(today)
    const justAfter = await rl.getStats()
    expect(justAfter.dailySent).toBeGreaterThanOrEqual(99) // ~100, not 0 → no clean reset

    // Late in the UTC day: yesterday's weight has decayed toward 0.
    vi.setSystemTime(new Date('2026-06-21T23:30:00.000Z'))
    const lateDay = await rl.getStats()
    expect(lateDay.dailySent).toBeLessThan(justAfter.dailySent)
  })
})
