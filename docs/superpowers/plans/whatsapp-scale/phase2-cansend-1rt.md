# Phase 2 — Collapse `canSend` to 1 Redis Round-Trip (v2)

Branch to implement on: `claude/debug-console-error-FWrLE`
File: `src/lib/whatsapp/rate-limiter.ts` (single file; two call-site touches in `campaign-processor.ts` at :529 and :535 — both are `canSend` calls, no signature change).

> **Position in the larger plan:** This document is the **"atomic canSend" slice of Phase 0 (Foundations)** and is executed as part of Phase 0. Phase 0 owns four prerequisites that unblock all concurrency work: **(1) atomic `canSend` — THIS doc**, (2) atomic circuit-breaker, (3) the Meta error-code pipeline fix, and (4) a shared recipient-idempotency helper. The sibling tasks (breaker atomicity, error-code pipeline, idempotency helper) live in `phase0-foundations.md` — **do not duplicate them here.** Where this doc touches the throttle key written by the error pipeline, it only *reads* it and treats its contract as owned by the Phase 0 error-pipeline task. The phase numbers in §A.10 ("Phase 1/3/4") refer to the *downstream* concurrency/rollout phases that Phase 0 unblocks.

---

## v2 changelog (adversarial-review fixes folded in)

Each fix is grounded in the real code on `claude/debug-console-error-FWrLE` and is enforced in BOTH the implementation plan and the execution prompt (acceptance + DO-NOTs).

- **[FIX-C1] (CRITICAL) Lua must NOT persist refill state on the BLOCK path.** v1 wrote `HMSET tokens,ts=now` even when denying throughput (v1 line 116). Under N concurrent denials each resets `ts=now`, so `elapsed` never accumulates and the bucket never refills — tokens stall/leak. v2 writes token-bucket state **only on the GRANT path**, mirroring `@upstash/ratelimit`'s token-bucket Lua which commits state only on success. On block we compute `retry` from a read-only refill projection and return without any `HMSET`.
- **[FIX-C2] (CRITICAL) Fail-CLOSED, not fail-open, on EVAL/parse anomaly.** v1's `default:` returned `{ allowed: true }` (v1 line 181) — a script bug would mean "send with no rate limit at all." v2: any thrown `eval` error or unparseable/unknown status **falls back to `canSendLegacy`** (preferred — preserves all limits via the proven library path); if legacy itself throws, return `{ allowed: false, retryAfter: 60, reason: '...' }`. Fail-open is only reconsidered after the script is proven in staging+canary (§A.12), and even then is not adopted in this phase.
- **[FIX-H1] Daily quota checked INSIDE the Lua; INCR only when allowing.** The real code at `rate-limiter.ts:128` does `INCR` *before* the `> config.daily` check and at `:138` issues a **compensating `redis.decr`** when over quota. v1 dropped that compensation, so every blocked attempt would permanently burn a daily slot. v2 passes `dailyLimit` as ARGV; the Lua increments **only on the allow path after the daily check passes**, so there is never an over-count and no `decr` is needed. (Where `daily === Infinity`, pass a sentinel `-1` meaning "no daily gate.")
- **[FIX-H2] No 2× MPS during canary.** v1 introduced a NEW throughput key `wa:tb:*` while legacy used `wa:throughput:*`; during rollout an instance could be served by both paths and run at up to 2× MPS for the *entire* rollout window. v2: the flag is gated **per-instanceId via a stable hash** (deterministic bucketing), never a global env boolean, so any given instance is only ever served by exactly ONE path. The new and legacy throughput keys still differ in format (token-bucket HMGET vs library zset), but because no instance straddles paths, no instance is ever double-budgeted. (A global env kill-switch still exists to force-disable the Lua path entirely, but enabling is per-instance.)
- **[FIX-H3] Do NOT claim retryAfter parity for throughput.** v1's table claimed "equivalent intent." The library's token-bucket `reset` is an **interval boundary**, while our Lua returns "seconds until enough tokens refill." These differ by up to one interval. v2 documents this as expected **drift**, not parity, and the test asserts only `retryAfter >= 1` (a sane lower bound), not equality with the library.
- **[FIX-M1] Deterministic, replication-safe zset member.** v1 used `now .. '-' .. math.random()` (v1 line 125). `math.random()` is non-deterministic and **replication-unsafe** under Redis script replication. v2 uses a **monotonic member** `now .. ':' .. redis.call('INCR', seqKey)` (a per-instance sequence counter with its own short TTL), guaranteeing uniqueness without randomness. `math.random`, `cjson`, and `EVAL` are added to a **staging smoke checklist** (§A.12).
- **[FIX-M2] Timezone mismatch flagged for Phase 4, not fixed here.** `getTodayKey()` uses UTC (`toISOString()`, :255) while `getSecondsUntilMidnight()` uses **local** time (`setHours(24,...)`, :258-261). This pre-existing inconsistency is left intact for byte-for-byte parity and **flagged as a Phase 4 concern** (Phase 4 owns the daily-quota redefinition and should reconcile the timezone there). v2 does not bake either convention into new logic beyond reproducing today's behavior.
- **[FIX-M3] Integration test against a real/fake Redis for the Lua.** v1 tested an eval *stub* — that tests the stub, not the Lua. v2 requires an integration test that runs the **actual `LUA_CANSEND` string** against a real Lua-capable Redis (Upstash dev instance, or an embedded interpreter). Because no `ioredis-mock` is in `package.json` and Upstash's mock does not execute Lua, the integration test is **gated behind an env var** (`RL_LUA_IT=1` + `UPSTASH_REDIS_REST_URL`) and skipped in unit CI; the unit suite still covers TS verdict-mapping with a stub but **must not** claim to validate the Lua.
- **[FIX-L2] `getStats.dailySent` is a Phase 4 touch-point.** `getStats` (:205-209) reads `wa:daily:*`. Once Phase 4 redefines daily as **unique business-initiated recipients/24h**, the raw counter and `dailySent` diverge. Noted as a Phase 4 touch-point; unchanged here.

---

## 0. Premise check (1 correction, retained from v1)

The brief says canSend does "~4 SEQUENTIAL round-trips." Grounded in the real code (`rate-limiter.ts`), the happy path is:

1. `isThrottled()` → `redis.exists(wa:throttle:…)` (:197, called from :86)
2. (only when throttled) `redis.ttl(...)` (:88) — NOT on the happy path
3. throughput `getThroughputLimiter().limit()` Lua eval (:97)
4. a **freshly-constructed-per-call** pair `new Ratelimit({ slidingWindow(10,'1 m') })` `.limit()` (:109-116)
5. `redis.incr(wa:daily:…)` (:128), plus a 2nd `redis.expire` on first send of the day (:132), plus a `redis.decr` when over quota (:138)

So the happy path is `exists` + 2 Lua evals + `incr` = **4 sequential REST round-trips** (5 on first-of-day). At 50-100ms each that is 200-500ms of pure rate-check latency per message. Goal: **1 round-trip on the happy path.**

`recordError` (:157) does up to ~7 sequential round-trips (`hincrby`, `expire`, 4× `hget`, `setex`). It is NOT on the happy send path (only fires on API error) and its pipelining belongs to the **Phase 0 error-pipeline task** — Phase 2 leaves `recordError` untouched (see §A.4). Daily `incr` is the only happy-path write we are removing.

---

# A) IMPLEMENTATION PLAN

## A.1 Objective

Make `canSend(toPhone)` perform exactly **one** Upstash REST call on the happy path by replacing the 4 sequential ops (throttle-exists + throughput-token-bucket + pair-sliding-window + daily-incr) with a **single custom Lua script** executed via `redis.eval(...)` that atomically:

- checks the throttle flag (read-only, short-circuit),
- runs a per-recipient pair sliding-window,
- runs a per-instance token-bucket for throughput,
- **enforces the daily quota inside the script** and only `INCR`s the daily counter when allowing,

and returns a structured verdict + `retryAfter` per blocked reason. Every limiter stays **server-side in Redis** (mandatory — downstream parallel dispatch and multi-worker make in-memory guards incorrect).

Constraint: **minimal, reversible.** Per-instance flag gating (no global cutover). No TIER number changes (that's Phase 4). No `decr` compensation (the Lua never over-counts — [FIX-H1]).

## A.2 Affected files + line anchors (real, verified on branch)

| File | Anchor | Change |
|---|---|---|
| `src/lib/whatsapp/rate-limiter.ts` | `canSend` :82-152 | Rename current body verbatim to `private async canSendLegacy(toPhone)`. New `canSend` dispatches per-instance ([FIX-H2]) to Lua path or legacy. |
| | `getThroughputLimiter` :63-77 | Keep — used by `canSendLegacy` fallback only. |
| | pair limiter :109-116 | The `new Ratelimit(...)` per-call construction exists only inside the legacy body; the Lua path reimplements it. |
| | daily block :126-145 (`incr`/`expire`/`decr`/`> config.daily`) | Lua path enforces daily inside the script and `INCR`s only on allow ([FIX-H1]); no `decr`. |
| | `getStats` :205-209 | Unchanged; still reads `wa:daily:*` (Phase 4 touch-point — [FIX-L2]). |
| | new `LUA_CANSEND` const + `luaPathEnabledFor(instanceId)` helper | Module-level Lua string; per-instance gating helper. |
| `src/lib/whatsapp/campaign-processor.ts` | :529 and :535 | Two `canSend` call sites; **no signature change**, no edit needed. |
| `src/lib/whatsapp/rate-limiter.test.ts` | NEW | Unit (verdict mapping, stub) + gated integration (real Lua) — none exists today. |

## A.3 The Lua design

**Decision: single `EVAL` (custom Lua), not `redis.pipeline()`.**
A pipeline returns raw per-op results and the token-bucket / sliding-window refill math must run *somewhere*; doing it client-side after a pipeline is a non-atomic read-then-decide that races under concurrency. One Lua eval is atomic, is one REST round-trip, and lets us short-circuit (if throttled or pair-blocked, do NOT consume a throughput token). `@upstash/ratelimit`'s own algorithms are Lua; we reimplement the two we need.

### Lua contract

`KEYS = [throttleKey, tbKey, pairKey, dailyKey, pairSeqKey]`
`ARGV = [nowMs, refillPerSec, capacity, cost, pairLimit, pairWindowMs, dailyTtl, dailyLimit]`
(`dailyLimit = -1` means "no daily gate", used for tier-4 `Infinity`.)

Returns a `cjson.encode`d array (Upstash `eval` returns it as a string we `JSON.parse`):
`[ status, retryAfterSec, throughputRemaining, dailyCount ]`
where `status`: `0=allowed`, `1=throttled`, `2=throughput`, `3=pair`, `4=daily`.

```lua
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
```

Correctness notes:
- **[FIX-C1]** Token state is HMSET only in the GRANT branch (step 5). The block branch (step 3) reads-and-projects only, so N concurrent denials all measure `elapsed` against the same persisted `ts` and the bucket continues to refill.
- **[FIX-M1]** The zset member is `now .. ':' .. INCR(pairSeq)`. Deterministic and replication-safe (no `math.random`). The seq key gets its own short TTL so it self-cleans.
- **[FIX-H1]** Daily is read (`GET`) and gated in step 4; `INCR` happens only in step 5 on allow. No over-count, no `decr`. `dailyLim = -1` disables the gate for tier-4.
- Token-bucket params from `TIER_CONFIG[tier]`: `capacity = config.mps`, `refill = floor(config.mps * 0.9)` per second (preserves the existing 90%-margin behavior at :66). **No tier numbers change.**

### Client invocation (TS)

```ts
private static readonly LUA_CANSEND = `<the script above>`

// [FIX-H2] per-instance gating: a stable hash buckets each instance to exactly one path.
// No instance is ever served by both paths, so no instance can run at 2x MPS during canary.
private luaPathEnabledFor(instanceId: string): boolean {
  if (process.env.WA_RL_LUA_KILL === '1') return false          // global kill-switch (force legacy)
  const pct = parseInt(process.env.WA_RL_LUA_PCT || '0', 10)    // 0..100 rollout percentage
  if (pct <= 0) return false
  if (pct >= 100) return true
  let h = 0
  for (let i = 0; i < instanceId.length; i++) h = (h * 31 + instanceId.charCodeAt(i)) >>> 0
  return (h % 100) < pct
}

async canSend(toPhone: string): Promise<RateLimitResult> {
  if (!this.luaPathEnabledFor(this.instanceId)) return this.canSendLegacy(toPhone)

  const config = TIER_CONFIG[this.tier]
  const now = Date.now()
  const args = [
    now,
    Math.floor(config.mps * 0.9),                 // refill/sec
    config.mps,                                    // capacity
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
    const raw = await getRedis().eval(WhatsAppRateLimiter.LUA_CANSEND, keys, args) as string
    const parsed = JSON.parse(raw) as number[]
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
```

`redis.eval(script, keys, args)` — `@upstash/redis` `^1.35.8` (verified in `package.json`) supports `eval`. **Do NOT add `evalsha` caching now** (defer to Phase 7 cleanup).

### retryAfter semantics per blocked reason

| Reason | status | retryAfter | Relationship to current code |
|---|---|---|---|
| Throttled | 1 | `TTL(wa:throttle)`, `<1 ⇒ 60`, then `max(,1)` | **Parity** with :88-92 |
| Throughput | 2 | `ceil(tokens_needed / refill)`, min 1 | **DRIFT, not parity [FIX-H3]** — current `:99` uses `ceil((reset-now)/1000)` where `reset` is the library's interval boundary; ours is seconds-to-refill. Both ≥1; values can differ by up to one interval. Documented, not asserted equal. |
| Pair rate | 3 | time until oldest-of-window expires, min **6** | **Parity** with :117-122 (min 6s) |
| Daily | 4 | `getSecondsUntilMidnight()` (computed in TS) | **Parity** with :140-143 |

## A.4 `recordError` / throttle behavior

**Untouched in Phase 2.** The throttle key (`wa:throttle:${instanceId}`) and thresholds (10/20/50 → 60/300/600s, :180-194) are **read by the Lua** (step 1) and **written by `recordError`** exactly as today. Pipelining `recordError`'s 4 sequential `hget`s and the `hincrby`+`expire` is the **Phase 0 error-pipeline task** (`phase0-foundations.md`), NOT this slice. Do not modify `recordError` here — keep blast radius to the happy path.

`recordSuccess` (:172) is a no-op today; leave it. `isThrottled()`, `getRecommendedDelay()`, `getTodayKey()`, `getSecondsUntilMidnight()`, `reset()`, `getStats()` are unchanged (legacy fallback and stats still use them).

## A.5 Daily-quota: enforced in the Lua, no reconciler in Phase 2

v1 proposed a cached-boolean + reconciler-cron seam. **v2 removes that surface from this phase.** The Lua enforces the daily gate directly from the counter it already holds ([FIX-H1]), so the happy path stays **1 round-trip** and behavior is parity with today (block when `daily >= config.daily`), with the bonus that **no daily slot is burned on a blocked attempt** (the real code's `decr` at :138 becomes unnecessary because we never `INCR` before the gate).

**Phase 4 coordination seam:** when Phase 4 redefines daily as "COUNT(DISTINCT recipient) of business-initiated msgs in last 24h", it will (a) change the *source/definition* of the daily count and likely move the gate to a reconciled cached value, and (b) reconcile the **UTC vs local timezone mismatch [FIX-M2]** between `getTodayKey()` (UTC) and `getSecondsUntilMidnight()` (local). Phase 4 also revisits `getStats.dailySent` [FIX-L2]. None of that is built here; this phase only has to keep daily behind the `dailyLimit` ARGV so Phase 4 can swap it.

## A.6 Rollout / flag ([FIX-H2])

- **Per-instance gating, not a global cutover.** `WA_RL_LUA_PCT` (0..100) controls the rollout percentage; `luaPathEnabledFor(instanceId)` hashes the instanceId and serves it the Lua path iff `hash % 100 < PCT`. A given instance is **deterministically** on exactly one path, so it can never be served by both legacy (`wa:throughput:*`) and Lua (`wa:tb:*`) simultaneously → **no 2× MPS window.**
- `WA_RL_LUA_KILL=1` is a global force-legacy kill-switch for instant revert without redeploy.
- Default (`PCT` unset/0) → 100% legacy. Recommended ramp: 1 instance → 10% → 50% → 100%, watching block-reason metrics and Meta 429s at each step.
- New `wa:tb:*` / `wa:pairseq:*` keys are only written by the Lua path; legacy keys (`wa:throughput:*`) are only written by the legacy path. Because no instance straddles, the key-format divergence is harmless.

## A.7 Test plan ([FIX-M3])

No `rate-limiter.test.ts` exists today (verified). Add `src/lib/whatsapp/rate-limiter.test.ts` (vitest `^1.2.0`, `vitest run`; follow `opt-out-guard.test.ts` style — `vi.mock` hoisted before import).

**Unit tier (always runs) — TS verdict mapping only.** Mock `@upstash/redis`'s `Redis` so `.eval` returns each of the 5 verdict arrays on demand; also stub `exists/ttl/get/incr/expire/decr/setex/hincrby/hget/del` for the legacy + fallback paths.
- allowed → `{allowed:true}`, remaining computed; **exactly one `eval` call** (spy count === 1).
- throttled → `retryAfter` from ttl (min 1, ttl<1⇒60), exact reason.
- throughput block → `retryAfter >= 1` **only** (NOT equality — [FIX-H3]), reason match.
- pair block → `retryAfter >= 6`, reason match.
- daily block (status 4) → `retryAfter === getSecondsUntilMidnight()`, `remaining 0`, reason match.
- **[FIX-C2] fail-closed:** when `.eval` **throws**, assert `canSend` calls `canSendLegacy` (spy) and does NOT return `allowed:true` by default; when both throw, returns `allowed:false`.
- **[FIX-C2] malformed verdict:** `.eval` resolves a non-array / short array → falls back to legacy, never fail-open.
- **[FIX-H2] gating:** with `WA_RL_LUA_PCT=0` (or `KILL=1`), `canSend` delegates to legacy and `.eval` is **never called**; with `PCT=100`, uses Lua. Same instanceId always routes the same way.

**Integration tier (gated, [FIX-M3]) — the REAL Lua.** A `describe.skipIf(!process.env.RL_LUA_IT)` block executes the actual `LUA_CANSEND` string against a Lua-capable Redis (Upstash dev instance via `UPSTASH_REDIS_REST_URL`/`_TOKEN`, or an embedded interpreter). No `ioredis-mock` is in `package.json` and Upstash's mock does not run Lua, so this tier is **opt-in** (`RL_LUA_IT=1`). It must assert at minimum:
- **[FIX-C1]** under repeated throughput denials, `ts` in `wa:tb:*` does NOT advance on block, and a token becomes available after the expected refill interval (no stall).
- **[FIX-H1]** a daily-blocked call does NOT increment `wa:daily:*` (read counter before/after — unchanged).
- **[FIX-M1]** two grants in the same millisecond create two distinct zset members.

Run: `npm run test -- src/lib/whatsapp/rate-limiter.test.ts`; full gate `npm run test`, `npx tsc --noEmit`, `npm run lint`. `campaign-processor.test.ts` already mocks the limiter (`:39`) and circuit-breaker (`:40`) — confirm it stays green.

## A.8 Observability

- Lua returns `throughputRemaining` and `dailyCount`; log a single structured line on block. Add a metric tag `rl_block_reason={throttle|throughput|pair|daily}` and `rl_path={lua|legacy}` so the canary can be watched per path.
- `getStats` continues to read `wa:daily` (unchanged key) so dashboards keep working — Phase 4 touch-point [FIX-L2].

## A.9 Rollback

- `WA_RL_LUA_KILL=1` (or set `WA_RL_LUA_PCT=0`) → instant revert to legacy, same deploy. Or `git revert` the single commit. New `wa:tb:*` / `wa:pairseq:*` keys expire on their own. Zero schema/DB change.

## A.10 Ordering / deps (downstream phases unblocked by Phase 0)

- **Parallel dispatcher (downstream "Phase 1"):** the atomic eval is concurrency-safe; do NOT let it cache pair-rate in memory — Phase 2 keeps it in Redis so concurrency is safe.
- **QStash / multi-worker (downstream "Phase 3"):** server-side atomic limiter is required across workers. Phase 2 must NOT introduce per-process state.
- **TIER_CONFIG + unique-recipient daily (downstream "Phase 4"):** Phase 2 leaves TIER numbers untouched and keeps daily behind the `dailyLimit` ARGV. Phase 4 redefines the daily source, reconciles the UTC/local timezone mismatch [FIX-M2], and revisits `getStats.dailySent` [FIX-L2] — **no `canSend` rework** beyond swapping the daily definition.
- **Sibling Phase 0 tasks** (breaker atomicity, error-code pipeline, idempotency helper): independent; live in `phase0-foundations.md`. This slice only *reads* the throttle key the error pipeline owns.

## A.11 Risks / blast radius

- **Blast radius:** one hot function, gated per-instance ([FIX-H2]) → contained; fail-closed ([FIX-C2]) means a script bug degrades to the proven legacy path, never to "no limit."
- **Throughput retryAfter drift** vs library ([FIX-H3]): documented, not a correctness issue (advisory; Meta is source of truth).
- **`cjson`/`EVAL`/replication on Upstash:** validated via the staging smoke checklist (§A.12) and the gated integration test ([FIX-M3]) before any canary.
- **Clock:** `now = Date.now()` passed in (client clock) — same assumption as the library; the Lua uses the single passed `now` consistently.

## A.12 Staging smoke checklist (run before any canary — [FIX-M1][FIX-M3])

Against an Upstash **dev/staging** instance, confirm:
1. `EVAL` is accepted and returns a string (`cjson.encode` available).
2. `cjson.encode`/`cjson.decode` round-trip a small array.
3. The script contains **no `math.random`** (grep the embedded const) — replication-safe member only.
4. Token-bucket: drain to 0, issue N concurrent denials, verify `ts` does not advance ([FIX-C1]) and a token returns after the refill interval.
5. Daily: with `dailyLimit` reached, a blocked call leaves `wa:daily` unchanged ([FIX-H1]).
6. Two same-ms grants → two zset members ([FIX-M1]).

---

# B) EXECUTION PROMPT (paste into a fresh coding agent)

> **Branch:** `claude/debug-console-error-FWrLE`. Implement the **atomic `canSend`** slice of Phase 0 (a.k.a. "Phase 2"): collapse `WhatsAppRateLimiter.canSend` to ONE Upstash REST round-trip on the happy path, gated per-instance, with full parity, fail-closed safety, and tests. The sibling Phase 0 tasks (circuit-breaker atomicity, Meta error-code pipeline, idempotency helper) are OUT OF SCOPE — do not touch them.
>
> **Files you will touch**
> - `src/lib/whatsapp/rate-limiter.ts` (primary)
> - `src/lib/whatsapp/rate-limiter.test.ts` (NEW — none exists)
> - Do NOT edit `campaign-processor.ts` (its two `canSend` calls at :529 and :535 need no change), and do NOT edit `recordError`.
>
> **Current code anchors (read first via `git show claude/debug-console-error-FWrLE:src/lib/whatsapp/rate-limiter.ts`):**
> - `canSend` :82-152 → 4 sequential Upstash calls: `isThrottled()`→`exists` (call :86, def :197), throughput `getThroughputLimiter().limit()` (:97), a **freshly constructed** `new Ratelimit({ limiter: Ratelimit.slidingWindow(10,'1 m') })` pair limiter `.limit()` (:109-116), and `redis.incr` daily (:128) with `expire` (:132) / `decr` (:138). `TIER_CONFIG` :27. `getThroughputLimiter` :63. `recordError` :157. `isThrottled` :197. `getStats` :205. helpers `getTodayKey` :254 (UTC), `getSecondsUntilMidnight` :258 (LOCAL).
>
> **Goal / acceptance criteria**
> 1. **Per-instance gating ([FIX-H2]).** Add `private luaPathEnabledFor(instanceId)`: returns false if `WA_RL_LUA_KILL==='1'`; else parse `WA_RL_LUA_PCT` (0..100); deterministically hash `instanceId` and serve the Lua path iff `hash % 100 < PCT`. Default (unset) ⇒ legacy. A given instanceId must route to **exactly one** path (assert determinism in tests). NO global on/off env that could let one instance be served by both paths.
> 2. When the Lua path is enabled, `canSend(toPhone)` performs **exactly one** `redis.eval(...)` on the happy path (assert via spy === 1). No `redis.exists`, no library `.limit()`, no separate `incr` on that path.
> 3. The eval is a custom Lua script (embedded module const) that atomically, in order: (a) `EXISTS` throttle key, short-circuit read-only; (b) pair sliding-window per `wa:pair:${instanceId}:${toPhone}` — block read-only if `>= pairLimit`; (c) token-bucket per `wa:tb:${instanceId}`, `capacity=TIER_CONFIG[tier].mps`, `refill=floor(mps*0.9)`/s — **on block, do NOT HMSET ([FIX-C1])**, return read-only retry; (d) daily gate: `GET wa:daily:${instanceId}:${YYYY-MM-DD}`, block if `dailyLimit>=0 && daily>=dailyLimit` **without INCR ([FIX-H1])**; (e) on allow: HMSET token state, ZADD a **deterministic** member `now..':'..INCR(pairSeqKey)` ([FIX-M1] — NO `math.random`), INCR daily (EXPIRE 86400 on first). Return `cjson.encode([status,retryAfter,tputRemaining,dailyCount])`, `status 0=allow,1=throttle,2=throughput,3=pair,4=daily`.
> 4. Map results to the EXISTING `RateLimitResult` shape with **identical `reason` strings**: throttle→`max(ttl,1)` (ttl<1⇒60), reason 'Instance throttled due to rate limit errors'; throughput→`max(retry,1)`, reason 'Throughput limit exceeded'; pair→`max(retry,6)`, reason 'Pair rate limit exceeded (max 10 msg/min per recipient)'; daily→`getSecondsUntilMidnight()`, remaining 0, reason `` `Daily limit exceeded (${config.daily} messages)` ``. Pass `dailyLimit = config.daily===Infinity ? -1 : config.daily`.
> 5. **Fail-CLOSED ([FIX-C2]).** Wrap the `eval`+`JSON.parse` in try/catch and validate the parsed array (is-array, length≥4, `typeof [0]==='number'`). On ANY throw, malformed result, or unknown status → call `canSendLegacy(toPhone)` (the proven library path). If legacy also throws → return `{ allowed:false, retryAfter:60, reason:'Rate limiter unavailable' }`. **NEVER return `{allowed:true}` as a default/fallback.**
> 6. When the Lua path is disabled, behavior is byte-for-byte the current code: rename the existing `canSend` body verbatim to `private async canSendLegacy(toPhone)` and call it.
> 7. `getStats`, `getRecommendedDelay`, `recordError`, `isThrottled`, `recordSuccess`, `reset`, `getThroughputLimiter`, factory `getRateLimiter`, `getTodayKey`, `getSecondsUntilMidnight` — unchanged behavior.
> 8. No change to `TIER_CONFIG` numbers (Phase 4). No call-site signature change in `campaign-processor.ts`.
>
> **Embedded Lua (use this exact logic — see §A.3):** KEYS=[throttle, tb, pair, daily, pairSeq], ARGV=[now, refill, capacity, cost, pairLimit, pairWindowMs, dailyTtl, dailyLimit]. Throttle `EXISTS`+`TTL` short-circuit (read-only). Pair: `ZREMRANGEBYSCORE`+`ZCARD`, block read-only with oldest-based retry (min 6). Token-bucket: `HMGET tokens,ts`, refill, **block branch HMSETs nothing ([FIX-C1])**; grant branch HMSETs+`PEXPIRE`. Daily: `GET`+gate ([FIX-H1]), `INCR` only on grant. Allow: ZADD `now..':'..INCR(pairSeq)` ([FIX-M1]), `PEXPIRE`s, `INCR daily` + first-day `EXPIRE`. Return `cjson.encode` array.
>
> **TS invocation:** `const raw = await getRedis().eval(WhatsAppRateLimiter.LUA_CANSEND, keys, args) as string; const parsed = JSON.parse(raw)` inside the try/catch of criterion 5.
>
> **Tests (`src/lib/whatsapp/rate-limiter.test.ts`, vitest, follow `opt-out-guard.test.ts` hoisted-`vi.mock` style):**
> - **Unit (always runs):** mock `@upstash/redis` `Redis` so `.eval` returns each of the 5 verdicts; stub `exists/ttl/get/incr/expire/decr/setex/hincrby/hget/del`. Assert: allowed (1 eval, remaining computed); throttled (retryAfter min, reason); throughput (`retryAfter >= 1` **only**, NOT equality — [FIX-H3]); pair (`retryAfter >= 6`); daily status-4 (retryAfter=secondsUntilMidnight, remaining 0); **[FIX-C2]** `.eval` throws ⇒ delegates to `canSendLegacy` and never returns default `allowed:true`; malformed (non-array/short) ⇒ legacy fallback; **[FIX-H2]** `WA_RL_LUA_PCT=0`/`KILL=1` ⇒ legacy, `.eval` never called; `PCT=100` ⇒ Lua; same instanceId routes consistently.
> - **Integration (gated, [FIX-M3]):** `describe.skipIf(!process.env.RL_LUA_IT)` running the REAL `LUA_CANSEND` against a Lua-capable Redis (`UPSTASH_REDIS_REST_URL`/`_TOKEN`). Assert [FIX-C1] `ts` unchanged on block + token returns after refill; [FIX-H1] daily-blocked call does not increment `wa:daily`; [FIX-M1] two same-ms grants ⇒ two members. The unit stub does NOT count as validating the Lua.
>
> **Commands:** `npm run test -- src/lib/whatsapp/rate-limiter.test.ts`, then `npm run test`, `npx tsc --noEmit`, `npm run lint`. All must pass. Confirm `campaign-processor.test.ts` (mocks limiter :39, breaker :40) stays green. Before any canary, run the §A.12 staging smoke checklist against an Upstash dev instance.
>
> **Verification:** grep the embedded Lua for `math.random` (must be ZERO — [FIX-M1]); grep that the block branch of the token-bucket has no `HMSET` ([FIX-C1]); grep that the `default`/catch never returns `allowed: true` ([FIX-C2]); confirm `canSendLegacy` retains the original body verbatim including the `decr` at the old :138.
>
> **DO NOT:**
> - DO NOT persist token-bucket state (`HMSET ts=now`) on the throughput BLOCK path — only on GRANT. **[FIX-C1]**
> - DO NOT fail open: no `default: { allowed: true }`, no "allow on eval error." Fail to legacy, then to `allowed:false`. **[FIX-C2]**
> - DO NOT `INCR` the daily counter before the daily gate, and DO NOT add a `decr` — the Lua INCRs only on allow. **[FIX-H1]**
> - DO NOT gate the Lua path with a single global env boolean; gate per-instanceId so no instance is served by both paths (no 2× MPS). **[FIX-H2]**
> - DO NOT claim throughput `retryAfter` parity with `@upstash/ratelimit`; it is documented drift — tests assert `>= 1` only. **[FIX-H3]**
> - DO NOT use `math.random()` (or any non-deterministic / replication-unsafe value) in the zset member; use `now..':'..INCR(seq)`. **[FIX-M1]**
> - DO NOT "fix" the UTC (`getTodayKey`) vs local (`getSecondsUntilMidnight`) timezone mismatch here — leave it for Phase 4. **[FIX-M2]**
> - DO NOT rely solely on a hand-written eval stub to validate the Lua — add the gated real-Redis integration test. **[FIX-M3]**
> - DO NOT make pair-rate an in-memory / per-batch guard — it MUST stay in Redis (inside the Lua).
> - DO NOT change `TIER_CONFIG` numbers, the daily-limit *definition*, the `wa:throttle` key contract or `recordError` thresholds (10/20/50 → 60/300/600s), `canSend`'s signature, or any `RateLimitResult` reason string.
> - DO NOT touch sibling Phase 0 tasks (circuit-breaker, error-code pipeline, idempotency helper) or add `evalsha` caching (defer to Phase 7).
