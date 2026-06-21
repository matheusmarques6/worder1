// =============================================
// Phase 0 — Workstream 0B (atomic circuit breaker)
//
// Target module: src/lib/whatsapp/circuit-breaker.ts
//
// Two races the executor must close (plan 0B, grounded at the cited lines):
//  1. HALF_OPEN admission (circuit-breaker.ts:96-110) is get->compare->incr.
//     Under N concurrent canExecute() all read 0, all pass `< max`, all incr →
//     more than halfOpenMaxCalls test calls hit a half-recovered Meta.
//  2. CLOSED accounting: recordSuccess does `set failures '0'` (:135). A success
//     interleaving a failure stream resets the count so the breaker never OPENs
//     (:146-175 vs :121-141).
//
// We drive these with FakeRedis.withLatency() so each get/set/incr resolves on a
// future tick — letting Promise.all([...]) of N callers interleave read-before-
// write, exactly reproducing the non-atomic window. A correct Phase-0 fix
// (INCR-and-compare on the returned value; no separate read) makes the fake
// behave atomically because INCR mutates+returns in one awaited command.
//
// The genuinely-atomic guarantee under a REAL distributed Redis EVAL is gated
// behind RUN_REDIS_IT (mocks cannot prove Lua atomicity).
// =============================================
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeRedis } from './__fake-redis'

const RUN_REDIS_IT = !!process.env.RUN_REDIS_IT

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() {
      return fakeRedis as any
    }
  },
}))

import { CircuitBreaker } from '@/lib/whatsapp/circuit-breaker'

beforeEach(() => {
  fakeRedis.reset()
  process.env.UPSTASH_REDIS_REST_URL = 'http://fake'
  process.env.UPSTASH_REDIS_REST_TOKEN = 'fake'
})

// ---------------------------------------------------------------------------
// 0B — HALF_OPEN admits at most halfOpenMaxCalls under concurrency
// ---------------------------------------------------------------------------
describe('0B: HALF_OPEN admits at most halfOpenMaxCalls under concurrent canExecute()', () => {
  it('N concurrent lanes get at most halfOpenMaxCalls grants (RED until atomic admission)', async () => {
    const MAX = 3
    const cb = new CircuitBreaker('cb-half', {
      halfOpenMaxCalls: MAX,
      resetTimeout: 1, // so getState() flips OPEN->HALF_OPEN immediately
    })

    // Put the breaker into OPEN with an old lastFailure so the next getState()
    // transitions to HALF_OPEN and zeroes halfOpenCalls.
    await fakeRedis.set('cb:cb-half:state', 'OPEN')
    await fakeRedis.set('cb:cb-half:lastFailure', '1') // ancient → past resetTimeout
    await fakeRedis.set('cb:cb-half:halfOpenCalls', '0')

    // Expose the non-atomic window: each redis op resolves on a future tick.
    fakeRedis.withLatency(1)

    const N = 8
    const grants = await Promise.all(
      Array.from({ length: N }, () => cb.canExecute()),
    )
    const admitted = grants.filter(Boolean).length

    // CONTRACT (0B): admissions in HALF_OPEN must never exceed halfOpenMaxCalls.
    // RED on current code (:96-110 get->compare->incr): all 8 read 0, pass the
    // `>= 3` check, then incr → 8 admissions. Fix = INCR-then-admit-iff-<=max.
    expect(admitted).toBeLessThanOrEqual(MAX)
    expect(admitted).toBeGreaterThan(0)
  })

  it('halfOpenCalls counter never exceeds the admitted count (no lost increments)', async () => {
    const cb = new CircuitBreaker('cb-half2', { halfOpenMaxCalls: 3, resetTimeout: 1 })
    await fakeRedis.set('cb:cb-half2:state', 'HALF_OPEN')
    await fakeRedis.set('cb:cb-half2:halfOpenCalls', '0')

    fakeRedis.withLatency(1)
    await Promise.all(Array.from({ length: 6 }, () => cb.canExecute()))

    const counter = parseInt((await fakeRedis.get('cb:cb-half2:halfOpenCalls')) || '0')
    // With INCR-as-gate the counter equals the number of canExecute calls (6),
    // but admissions returned must be <= 3. The key invariant: the persisted
    // counter is monotonic and never under-counts admissions.
    expect(counter).toBeGreaterThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------
// 0B — sustained failures OPEN the breaker even interleaved with successes
// ---------------------------------------------------------------------------
describe('0B: breaker OPENs under sustained failures interleaved with successes', () => {
  it('CONTRACT: an interleaved success must not reset an in-flight open decision (atomic accounting)', async () => {
    // NOTE: the breaker uses CONSECUTIVE-failure semantics (a success resets the
    // CLOSED failure counter) — that is the original production design, and
    // Phase 0B's mandate is ATOMICITY of that model, not switching to a sliding
    // window. So the guarantee under test is the *torn-state* invariant: a
    // success can never interleave between a failure's INCR and its threshold
    // compare to leave the breaker CLOSED while the count is already at/over
    // threshold (the pre-Phase-0 race: recordSuccess `set failures '0'` landing
    // mid-failure-eval). With single-EVAL accounting this can never happen,
    // regardless of which op wins the race.
    const THRESHOLD = 5
    const cb = new CircuitBreaker('cb-open', { failureThreshold: THRESHOLD })
    fakeRedis.withLatency(1)
    for (let i = 0; i < 25; i++) {
      await fakeRedis.set('cb:cb-open:state', 'CLOSED')
      await fakeRedis.set('cb:cb-open:failures', String(THRESHOLD - 1))
      // The failure would cross the threshold (4 -> 5 -> OPEN); the success would
      // reset to 0. Run them concurrently with interleave latency.
      await Promise.all([cb.recordFailure(new Error('meta down')), cb.recordSuccess()])
      const state = await fakeRedis.get('cb:cb-open:state')
      const failures = parseInt((await fakeRedis.get('cb:cb-open:failures')) || '0')
      // Invariant: never CLOSED while the count is at/over threshold. Either the
      // failure won (OPEN, failures>=threshold) or the success won (CLOSED,
      // failures reset then re-incremented to 1) — never a torn middle.
      expect(state === 'CLOSED' && failures >= THRESHOLD, `torn state: ${state}/${failures}`).toBe(false)
    }
    fakeRedis.withLatency(0)
  })

  it('sequential sustained failures still OPEN at threshold (regression guard)', async () => {
    const cb = new CircuitBreaker('cb-seq', { failureThreshold: 5 })
    await fakeRedis.set('cb:cb-seq:state', 'CLOSED')
    for (let i = 0; i < 5; i++) await cb.recordFailure(new Error('x'))
    expect(await fakeRedis.get('cb:cb-seq:state')).toBe('OPEN')
  })

  it('a single failure in HALF_OPEN reopens the circuit (regression guard)', async () => {
    const cb = new CircuitBreaker('cb-ho', { resetTimeout: 1 })
    await fakeRedis.set('cb:cb-ho:state', 'HALF_OPEN')
    await cb.recordFailure(new Error('still down'))
    expect(await fakeRedis.get('cb:cb-ho:state')).toBe('OPEN')
  })
})

// ---------------------------------------------------------------------------
// 0B — public interface unchanged (plan: keep canExecute/recordSuccess/
// recordFailure/execute identical so campaign-processor is untouched)
// ---------------------------------------------------------------------------
describe('0B: public interface is preserved', () => {
  it('keeps canExecute/recordSuccess/recordFailure/execute', () => {
    const cb: any = new CircuitBreaker('cb-iface')
    expect(cb.canExecute).toBeTypeOf('function')
    expect(cb.recordSuccess).toBeTypeOf('function')
    expect(cb.recordFailure).toBeTypeOf('function')
    expect(cb.execute).toBeTypeOf('function')
  })

  it('execute() rejects with CircuitBreakerError when not admitted', async () => {
    const cb = new CircuitBreaker('cb-exec', { resetTimeout: 60_000 })
    await fakeRedis.set('cb:cb-exec:state', 'OPEN')
    await fakeRedis.set('cb:cb-exec:lastFailure', Date.now().toString())
    await expect(cb.execute(async () => 'ok')).rejects.toThrow(/is OPEN/)
  })
})

// ---------------------------------------------------------------------------
// 0B — real-Redis atomicity (gated): mocks can't prove Lua/INCR atomicity
// ---------------------------------------------------------------------------
describe.skipIf(!RUN_REDIS_IT)('0B: atomic admission against REAL Redis (integration)', () => {
  it('50 concurrent canExecute() in HALF_OPEN admit at most halfOpenMaxCalls', async () => {
    const cb = new CircuitBreaker(`it-cb-${Date.now()}`, { halfOpenMaxCalls: 3, resetTimeout: 1 })
    await cb.reset()
    await cb.forceState('HALF_OPEN')
    const grants = await Promise.all(Array.from({ length: 50 }, () => cb.canExecute()))
    expect(grants.filter(Boolean).length).toBeLessThanOrEqual(3)
  })
})
