// =============================================
// In-memory fake @upstash/redis for Phase-0 concurrency tests.
//
// The repo does NOT bundle ioredis-mock / a redis test double — existing
// tests (`campaign-processor.test.ts`, `opt-out-guard.test.ts`) mock the
// whole module (`vi.mock('./rate-limiter')`) and therefore CANNOT catch the
// non-atomic read-modify-write races that Phase 0 fixes (plan: "the existing
// tests mock these modules and therefore cannot catch the very races Phase 0
// fixes (Phase 1 L1, Phase 2 M3)").
//
// This fake implements the small surface the rate-limiter and circuit-breaker
// use (incr/decr/get/set/setex/expire/exists/ttl/hincrby/hget/hgetall/del/
// eval). Atomicity is modelled by executing each command body synchronously
// (single-threaded JS event loop) WITHOUT awaiting between the read and the
// write inside a single method — so a correct INCR-and-compare is atomic here,
// while a get()->compare->incr() spread across two awaited calls can interleave.
//
// To EXPOSE interleaving for non-atomic code paths we expose `withLatency()`,
// which inserts a real microtask/timer gap inside multi-await sequences by
// making each command resolve on a future tick. That lets `Promise.all([...])`
// of N callers interleave their reads before their writes, reproducing the
// burst-overshoot / half-open-overshoot races.
//
// Real-Redis integration assertions are gated behind RUN_REDIS_IT (see each
// test's describe.skipIf) — those need an actual Upstash/ioredis endpoint and
// the *implemented* Lua, neither of which exists at review time.
// =============================================

type Store = Map<string, any>

export class FakeRedis {
  store: Store = new Map()
  hashes: Map<string, Map<string, string>> = new Map()
  ttls: Map<string, number> = new Map()
  // When >0, each command yields to the event loop before mutating, so that
  // N concurrent callers can interleave their non-atomic read/write windows.
  private latency = 0

  withLatency(ms: number) {
    this.latency = ms
    return this
  }

  private async tick() {
    if (this.latency > 0) {
      await new Promise((r) => setTimeout(r, this.latency))
    } else {
      // even with 0, yield once so Promise.all callers interleave on awaits
      await Promise.resolve()
    }
  }

  async incr(key: string): Promise<number> {
    await this.tick()
    const v = parseInt((this.store.get(key) as string) || '0') + 1
    this.store.set(key, String(v))
    return v
  }

  async decr(key: string): Promise<number> {
    await this.tick()
    const v = parseInt((this.store.get(key) as string) || '0') - 1
    this.store.set(key, String(v))
    return v
  }

  async get(key: string): Promise<any> {
    await this.tick()
    return this.store.has(key) ? this.store.get(key) : null
  }

  async set(key: string, value: any): Promise<'OK'> {
    await this.tick()
    this.store.set(key, value)
    return 'OK'
  }

  async setex(key: string, seconds: number, value: any): Promise<'OK'> {
    await this.tick()
    this.store.set(key, value)
    this.ttls.set(key, seconds)
    return 'OK'
  }

  async expire(key: string, seconds: number): Promise<number> {
    await this.tick()
    if (this.store.has(key) || this.hashes.has(key)) {
      this.ttls.set(key, seconds)
      return 1
    }
    return 0
  }

  async ttl(key: string): Promise<number> {
    await this.tick()
    return this.ttls.get(key) ?? -1
  }

  async exists(key: string): Promise<number> {
    await this.tick()
    return this.store.has(key) ? 1 : 0
  }

  async hincrby(key: string, field: string, by: number): Promise<number> {
    await this.tick()
    const h = this.hashes.get(key) ?? new Map<string, string>()
    const v = parseInt(h.get(field) || '0') + by
    h.set(field, String(v))
    this.hashes.set(key, h)
    return v
  }

  async hget(key: string, field: string): Promise<string | null> {
    await this.tick()
    return this.hashes.get(key)?.get(field) ?? null
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    await this.tick()
    const h = this.hashes.get(key)
    if (!h) return null
    return Object.fromEntries(h.entries())
  }

  async del(...keys: string[]): Promise<number> {
    await this.tick()
    let n = 0
    for (const k of keys) {
      if (this.store.delete(k)) n++
      this.hashes.delete(k)
      this.ttls.delete(k)
    }
    return n
  }

  // Minimal EVAL: atomic against this store (no tick() inside — the whole body
  // runs to completion with no interleaving, which is the guarantee Phase 0 must
  // provide). Accepts a JS fn, OR models the circuit-breaker.ts LUA_* scripts as
  // faithful JS twins (matched on stable INCR/transition lines) so 0B atomicity
  // is exercised here without a real Redis. Rate-limiter Lua still routes through
  // the gated real-Redis IT / the FakeTokenBucket legacy path.
  async eval(script: string | ((store: FakeRedis, keys: string[], args: string[]) => any), keys: string[] = [], args: string[] = []): Promise<any> {
    if (typeof script === 'function') {
      return script(this, keys, args)
    }
    const g = (k: string) => (this.store.has(k) ? (this.store.get(k) as string) : null)
    const num = (v: any) => Number(v)

    if (script.includes('(now - lastFailure) > resetTimeout')) {
      // LUA_GET_STATE — KEYS=[state,lastFailure,halfOpenCalls] ARGV=[now,resetTimeout]
      const state = g(keys[0])
      if (state === 'OPEN') {
        const lastFailure = parseInt(g(keys[1]) || '0')
        if (num(args[0]) - lastFailure > num(args[1])) {
          this.store.set(keys[0], 'HALF_OPEN'); this.store.set(keys[2], '0'); return 'HALF_OPEN'
        }
        return 'OPEN'
      }
      return state ?? 'CLOSED'
    }

    if (script.includes("local n = redis.call('INCR', KEYS[2])")) {
      // LUA_HALFOPEN_ADMIT — KEYS=[state,halfOpenCalls] ARGV=[max]
      const state = g(keys[0])
      if (state !== 'HALF_OPEN') return (state === 'CLOSED' || state == null) ? 1 : 0
      const c = parseInt(g(keys[1]) || '0') + 1
      this.store.set(keys[1], String(c))
      return c <= num(args[0]) ? 1 : 0
    }

    if (script.includes("local failures = redis.call('INCR', KEYS[2])")) {
      // LUA_RECORD_FAILURE — KEYS=[state,failures,successes] ARGV=[failureThreshold]
      const state = g(keys[0]) ?? 'CLOSED'
      if (state === 'HALF_OPEN') {
        this.store.set(keys[0], 'OPEN'); this.store.set(keys[2], '0'); return ['OPEN', 0]
      }
      if (state === 'CLOSED') {
        const f = parseInt(g(keys[1]) || '0') + 1
        this.store.set(keys[1], String(f))
        if (f >= num(args[0])) { this.store.set(keys[0], 'OPEN'); return ['OPEN', f] }
        return ['CLOSED', f]
      }
      return [state, parseInt(g(keys[1]) || '0')]
    }

    if (script.includes("local successes = redis.call('INCR', KEYS[3])")) {
      // LUA_RECORD_SUCCESS — KEYS=[state,failures,successes] ARGV=[successThreshold]
      const state = g(keys[0]) ?? 'CLOSED'
      if (state === 'HALF_OPEN') {
        const s = parseInt(g(keys[2]) || '0') + 1
        this.store.set(keys[2], String(s))
        if (s >= num(args[0])) {
          this.store.set(keys[0], 'CLOSED'); this.store.set(keys[1], '0'); this.store.set(keys[2], '0')
          return ['CLOSED', s]
        }
        return ['HALF_OPEN', s]
      }
      if (state === 'CLOSED') { this.store.set(keys[1], '0'); return ['CLOSED', 0] }
      return [state, parseInt(g(keys[2]) || '0')]
    }

    throw new Error('FakeRedis.eval: unrecognized string script; pass a JS fn or run the gated real-Redis IT')
  }

  reset() {
    this.store.clear()
    this.hashes.clear()
    this.ttls.clear()
    this.latency = 0
  }
}

// Shared singleton so `vi.mock('@upstash/redis')` returns the same instance the
// test holds a reference to.
export const fakeRedis = new FakeRedis()

// A fake @upstash/ratelimit token bucket / sliding window that shares state via
// FakeRedis-style counters, so we can assert burst-cap behaviour deterministically.
// Mirrors the @upstash/ratelimit token-bucket contract: capacity = `max`,
// refill `refillRate` tokens per `interval`. State committed ONLY on grant
// (the Phase-2 v2 FIX-C1 contract) — a denied call must not move `ts`.
export class FakeTokenBucket {
  private tokens: number
  private lastRefill: number
  constructor(
    private refillRate: number,
    private intervalMs: number,
    private capacity: number,
    private now: () => number = Date.now,
  ) {
    this.tokens = capacity
    this.lastRefill = this.now()
  }

  // returns { success, remaining, reset }
  limit(): { success: boolean; remaining: number; reset: number } {
    const t = this.now()
    const elapsed = t - this.lastRefill
    const refill = Math.floor((elapsed / this.intervalMs) * this.refillRate)
    if (refill > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + refill)
      this.lastRefill = t
    }
    if (this.tokens >= 1) {
      this.tokens -= 1
      return { success: true, remaining: this.tokens, reset: t + this.intervalMs }
    }
    // BLOCK path: do NOT advance lastRefill (FIX-C1 in phase2-cansend v2)
    return { success: false, remaining: 0, reset: this.lastRefill + this.intervalMs }
  }
}
