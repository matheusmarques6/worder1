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
  // [Phase 4] Sets back BOTH the exact unique-recipient day-keys (SADD/SCARD/SREM/
  // SISMEMBER) AND the HLL day-keys (PFADD/PFCOUNT modelled as exact cardinality —
  // the fake is exact; HLL's ±error is not exercised here, only the gate logic).
  sets: Map<string, Set<string>> = new Map()
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
      if (this.store.delete(k) || this.sets.delete(k)) n++
      this.hashes.delete(k)
      this.ttls.delete(k)
    }
    return n
  }

  // ---- [Phase 4] Set commands (exact unique-recipient day-keys) -------------
  async sadd(key: string, ...members: string[]): Promise<number> {
    await this.tick()
    const s = this.sets.get(key) ?? new Set<string>()
    let added = 0
    for (const m of members) {
      if (!s.has(m)) { s.add(m); added++ }
    }
    this.sets.set(key, s)
    return added
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    await this.tick()
    const s = this.sets.get(key)
    if (!s) return 0
    let removed = 0
    for (const m of members) {
      if (s.delete(m)) removed++
    }
    return removed
  }

  async scard(key: string): Promise<number> {
    await this.tick()
    return this.sets.get(key)?.size ?? 0
  }

  async sismember(key: string, member: string): Promise<number> {
    await this.tick()
    return this.sets.get(key)?.has(member) ? 1 : 0
  }

  // ---- [Phase 4] HyperLogLog commands (modelled as exact cardinality) -------
  async pfadd(key: string, ...members: string[]): Promise<number> {
    await this.tick()
    const s = this.sets.get(key) ?? new Set<string>()
    const before = s.size
    for (const m of members) s.add(m)
    this.sets.set(key, s)
    return s.size > before ? 1 : 0
  }

  async pfcount(...keys: string[]): Promise<number> {
    await this.tick()
    if (keys.length === 1) return this.sets.get(keys[0])?.size ?? 0
    const merged = new Set<string>()
    for (const k of keys) for (const m of this.sets.get(k) ?? []) merged.add(m)
    return merged.size
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

    // [Phase 4] Faithful JS twins of the rate-limiter Lua (canSend + peek). Run
    // synchronously (no tick()) → the whole daily count-and-gate is atomic, exactly
    // as the real EVAL guarantees. Matched on stable marker comments in the scripts.
    if (script.includes('UNIQUE recipients / rolling 24h, atomic count-and-gate')) {
      return this.evalCanSend(keys, args)
    }
    if (script.includes('UNIQUE recipients / rolling 24h. [FIX-H1][FIX-H2]')) {
      return this.evalPeek(keys, args)
    }

    throw new Error('FakeRedis.eval: unrecognized string script; pass a JS fn or run the gated real-Redis IT')
  }

  // KEYS: throttle, tb, pair, todayRecip, pairSeq, yesterdayRecip
  // ARGV: now, refill, capacity, cost, pairLim, pairWin, dailyTtl, dailyLim, tier, recip, ydayBps
  private evalCanSend(keys: string[], args: string[]): string {
    const N = (v: any) => Number(v)
    const now = N(args[0]), refill = N(args[1]), capacity = N(args[2]), cost = N(args[3])
    const pairLim = N(args[4]), pairWin = N(args[5]), dailyTtl = N(args[6]), dailyLim = N(args[7])
    const tier = N(args[8]), recip = String(args[9]), ydayBps = N(args[10])

    // 1) throttle
    if (this.store.has(keys[0])) {
      let ttl = this.ttls.get(keys[0]) ?? -1
      if (ttl < 1) ttl = 60
      return JSON.stringify([1, ttl, 0, 0])
    }
    // 2) pair (zset modelled via a per-key array in store)
    const zkey = keys[2]
    const z: Array<[number, string]> = (this.store.get(zkey) as any) || []
    const fresh = z.filter(([s]) => s > now - pairWin)
    if (fresh.length >= pairLim) {
      let retry = 6
      if (fresh[0]) {
        retry = Math.ceil((fresh[0][0] + pairWin - now) / 1000)
        if (retry < 6) retry = 6
      }
      return JSON.stringify([3, retry, 0, 0])
    }
    // 3) throughput token bucket (hash: tokens, ts)
    const h = this.hashes.get(keys[1])
    let tokens = h && h.get('tokens') != null ? N(h.get('tokens')) : capacity
    let ts = h && h.get('ts') != null ? N(h.get('ts')) : now
    let elapsed = (now - ts) / 1000
    if (elapsed < 0) elapsed = 0
    tokens = Math.min(capacity, tokens + elapsed * refill)
    if (tokens < cost) {
      let retry = Math.ceil((cost - tokens) / refill)
      if (retry < 1) retry = 1
      return JSON.stringify([2, retry, Math.floor(tokens), 0])
    }
    // 4) daily gate — unique recipients / rolling 24h
    let dailyCount = 0
    if (dailyLim >= 0) {
      const today = this.sets.get(keys[3]) ?? new Set<string>()
      const yday = this.sets.get(keys[5]) ?? new Set<string>()
      if (tier >= 3) {
        const effective = today.size + Math.floor((yday.size * ydayBps) / 10000)
        dailyCount = effective
        if (effective >= Math.floor(dailyLim * 0.99)) {
          return JSON.stringify([4, 0, Math.floor(tokens), effective])
        }
        today.add(recip); this.sets.set(keys[3], today); this.ttls.set(keys[3], dailyTtl)
        dailyCount = effective + 1
      } else {
        const wasNew = !today.has(recip)
        if (wasNew) {
          today.add(recip); this.sets.set(keys[3], today)
          const effective = today.size + Math.floor((yday.size * ydayBps) / 10000)
          if (effective > dailyLim) {
            today.delete(recip)
            return JSON.stringify([4, 0, Math.floor(tokens), effective - 1])
          }
          this.ttls.set(keys[3], dailyTtl)
          dailyCount = effective
        } else {
          dailyCount = today.size + Math.floor((yday.size * ydayBps) / 10000)
        }
      }
    }
    // 5) commit token + pair
    tokens = tokens - cost
    const nh = this.hashes.get(keys[1]) ?? new Map<string, string>()
    nh.set('tokens', String(tokens)); nh.set('ts', String(now)); this.hashes.set(keys[1], nh)
    const seq = (parseInt((this.store.get(keys[4]) as string) || '0') + 1)
    this.store.set(keys[4], String(seq))
    z.push([now, `${now}:${seq}`]); this.store.set(zkey, z as any)
    return JSON.stringify([0, 0, Math.floor(tokens), dailyCount])
  }

  // KEYS: throttle, tb, pair, todayRecip, yesterdayRecip
  // ARGV: now, refill, capacity, cost, pairLim, pairWin, dailyLim, tier, recip, ydayBps
  private evalPeek(keys: string[], args: string[]): string {
    const N = (v: any) => Number(v)
    const now = N(args[0]), refill = N(args[1]), capacity = N(args[2]), cost = N(args[3])
    const pairLim = N(args[4]), pairWin = N(args[5]), dailyLim = N(args[6])
    const tier = N(args[7]), recip = String(args[8]), ydayBps = N(args[9])

    if (this.store.has(keys[0])) {
      let ttl = this.ttls.get(keys[0]) ?? -1
      if (ttl < 1) ttl = 60
      return JSON.stringify([1, ttl, 0, 0])
    }
    const z: Array<[number, string]> = (this.store.get(keys[2]) as any) || []
    const fresh = z.filter(([s]) => s > now - pairWin)
    if (fresh.length >= pairLim) return JSON.stringify([3, 6, 0, 0])
    const h = this.hashes.get(keys[1])
    let tokens = h && h.get('tokens') != null ? N(h.get('tokens')) : capacity
    let ts = h && h.get('ts') != null ? N(h.get('ts')) : now
    let elapsed = (now - ts) / 1000
    if (elapsed < 0) elapsed = 0
    tokens = Math.min(capacity, tokens + elapsed * refill)
    if (tokens < cost) {
      let retry = Math.ceil((cost - tokens) / refill)
      if (retry < 1) retry = 1
      return JSON.stringify([2, retry, Math.floor(tokens), 0])
    }
    if (dailyLim >= 0) {
      const today = this.sets.get(keys[3]) ?? new Set<string>()
      const yday = this.sets.get(keys[4]) ?? new Set<string>()
      const effective = today.size + Math.floor((yday.size * ydayBps) / 10000)
      if (tier >= 3) {
        if (effective >= Math.floor(dailyLim * 0.99)) return JSON.stringify([4, 0, Math.floor(tokens), effective])
        return JSON.stringify([0, 0, Math.floor(tokens), effective])
      }
      if (today.has(recip)) return JSON.stringify([0, 0, Math.floor(tokens), effective])
      if (effective >= dailyLim) return JSON.stringify([4, 0, Math.floor(tokens), effective])
      return JSON.stringify([0, 0, Math.floor(tokens), effective])
    }
    return JSON.stringify([0, 0, Math.floor(tokens), 0])
  }

  reset() {
    this.store.clear()
    this.hashes.clear()
    this.sets.clear()
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
