# Phase 4 — Tier Source + Daily Accounting to Match Meta's Model (v2)

Branch to plan against: `claude/debug-console-error-FWrLE`
Lands **immediately after Phase 0 (Foundations)** and **before Phase 2**.
Scope: WhatsApp Cloud API messaging-tier *source of truth* + daily-quota *semantics* (unique recipients/24h) + `TIER_CONFIG` dedup. Code + one small Redis-key change. No destructive DB migration.

---

## v2 CHANGELOG (adversarial-review fixes folded in)

- **[FIX-C1] Tier was never real.** v1 assumed `messaging_tier` carried Meta's tier. Grep proves zero writes to `messaging_tier` (only a READ at `campaign-processor.ts:242`); the column is `INTEGER DEFAULT 1` so **every instance silently runs tier=1**. Meta's real value is the STRING enum `messaging_limit` / API field `messaging_limit_tier` (`TIER_250/TIER_1K/...`), only consumed by `alerts.ts:218`. v2 adds a deterministic `messaging_limit(string) → tier(index)` map and derives the rate-limiter tier from it. **This lands FIRST**; without it, fixing accounting from 1000→250 for unverified numbers would actually *tighten* a limit that today is silently 1000, but the safety win only materializes once the tier is real. (A TIER_250 number accounted at 1000/day is the live bug.)
- **[FIX-C2] Tier-0 exact gate is now atomic.** v1's `SADD → SCARD → SREM`-on-reject is three round-trips and races: two concurrent rejects can both `SREM` and drop `SCARD` below 250, re-admitting over the most ban-sensitive limit. v2 makes the tier-0 count-and-gate **atomic inside Phase 0's canSend Lua** (the new recipient is only committed to the set if it stays within limit). No defer-to-Phase-2 hand-wave.
- **[FIX-H1] Exact SETs up through 10K; HLL only for 100K+.** HLL ±0.81% is asymmetric: an *undercount* admits extra recipients → a Meta violation (at 100K, ±810 at 1σ). v2 uses exact `SET`s (`SADD`/`SCARD`) for tiers 0–2 (≤10K members ≈ ≤0.5 MB worst case, sized below) and reserves HLL for tier 3 (100K) with a conservative gate `count > limit * 0.99`. Error budget stated explicitly in §A.4.
- **[FIX-H2] Calendar-day UTC ≠ Meta's rolling 24h.** v1 keyed on `getTodayKey()` (UTC calendar day) and called it "conservative." It is not: a hard reset at 00:00 UTC (21:00 BRT) lets a number send up to **2× the limit** across a straddling 24h. v2 keeps two day-keys (today + yesterday) and gates on a merged count, weighting yesterday by the elapsed fraction of the current UTC day. Still an approximation of a true sliding window, but bounded — never a clean 2× reset.
- **[FIX-M1] The reset RPC exists — just not in the applied dir.** v1 said "no migration." Wrong: `reset_daily_whatsapp_counters` IS defined in `worder-cloud-api-fixes/01-migration-cloud-api-schema.sql:622` and `docs/ALL-MIGRATIONS-CONSOLIDATED.sql:795`, but NOT under `supabase/migrations/`. Correct framing: **REQUIRES-VERIFICATION (not in applied-migrations dir)**. It resets the DB column `messages_sent_today` (alerts/health UI), **never** the Redis `wa:daily:*` counter — so the cron and our Redis accounting are orthogonal. v2 does not imply the cron ever touched Redis.
- **[FIX-M2] Don't mislabel the UI.** Keeping the field name `dailySent` while its meaning becomes unique-recipients mislabels admin/stats. v2 keeps the wire field `dailySent` (avoids touching `queue/stats/route.ts`) but **relabels at the presentation layer** (`WabaHealthWidget` / queue-stats consumer) to "destinatários únicos / 24h".
- **[FIX-M3] No flat-80 MPS for tier-0.** `recordError` backoff only triggers after 10–50 errors, so flat 80 MPS on an ungranted number burns 429s first. v2 keeps a **lower tier-0/unverified default** (`TIER0_THROUGHPUT_MPS = 10`) until a per-instance `throughput_mps` override column exists; tiers ≥1 use `DEFAULT_THROUGHPUT_MPS = 80`. Throughput is still **not** derived from the messaging-limit numeric.
- **[FIX-L2] `Infinity` serializes to `null`.** `JSON.stringify(Infinity) === 'null'`, so `getStats().dailyLimit`/`dailyRemaining` break the stats route for unlimited tiers. v2 returns a sentinel (`-1` = unlimited) on the wire and renders "Ilimitado" in the UI.
- **[FIX] tier-1 daily 2000 → 1000.** Code had `daily: 2000` for tier 1; canonical Meta tier is `TIER_1K` = 1000. Corrected. Meta model CONFIRMED across sources; the official page is JS-rendered so **exact wording REQUIRES-VERIFICATION** — caveat retained.
- **[Phase-0 coordination] Don't rewrite the Lua twice.** Phase 0 owns the atomic `canSend` Lua, the atomic circuit-breaker, the error-code pipeline, and a recipient-idempotency helper. Phase 2's plan already routes a `dailyKey` slot through that Lua "designed so Phase 4 slots in without a rewrite." **Phase 4 does not author the Lua structure — it supplies the unique-recipient *semantics* (the SADD/SCARD-and-gate or PFADD/PFCOUNT branch, plus the tier-0 atomic commit) that Phase 0's Lua implements.** Phase 4 owns the daily-counter semantics; Phase 0 owns the Lua harness that runs them.

---

## A) IMPLEMENTATION PLAN

### A.0 Objective

Three grounded corrections:

1. **Make the tier real ([FIX-C1]).** Derive the rate-limiter tier from Meta's enum string `messaging_limit` (API field `messaging_limit_tier`), not from the never-written numeric `messaging_tier`.
2. **Fix daily-quota semantics.** The messaging limit caps **unique business-initiated recipients in a rolling 24h**, not total sends. Today `canSend` does `redis.incr(wa:daily:...)` per send (`rate-limiter.ts:128`), so re-sends and multi-message campaigns burn quota wrongly. v2 changes *what is counted* (unique recipients, idempotent per recipient) and supplies that semantic into Phase 0's atomic Lua.
3. **Dedupe `TIER_CONFIG`** (verbatim in `rate-limiter.ts:27` and `config/whatsapp.ts:6`, the latter with zero importers) to one source of truth, and **decouple throughput (MPS) from the messaging tier**.

### A.1 Validated Meta model — **VERDICT: CONFIRMED (exact page wording REQUIRES-VERIFICATION)**

- **Messaging limit = unique business-initiated recipients / rolling 24h.** Tiers **250 / 1,000 / 10,000 / 100,000 / Unlimited**. Re-sends and additional messages to the *same* recipient in-window do not re-consume; user-initiated replies do not consume it.
- **Throughput (MPS) is a separate, per-phone-number system** (default ~80 MPS, requestable up to ~1000), governed independently of the messaging tier. Exceeding throughput yields *different* error codes than exceeding the messaging limit. **MPS must NOT be a function of tier.**
- **Tier-1 = 1,000** (matches Meta's `TIER_1K` enum; the existing `whatsapp_instances.messaging_limit` already stores this enum string and is authoritative). Code's `daily: 2000` is a bug → fix to 1000.

Sources: `developers.facebook.com/docs/whatsapp/messaging-limits/` (canonical, REQUIRES-VERIFICATION — JS-rendered); chatarmin, wasenderapi, wati, bloomreach, fyno (corroborating, tier/throughput separation).

### A.2 Affected files + anchors (all on `claude/debug-console-error-FWrLE`)

| File | Anchor | Role / change |
|---|---|---|
| `src/config/whatsapp-tiers.ts` | NEW | Single source of truth: `MESSAGING_LIMIT_BY_TIER`, `TIER_NAME`, `MESSAGING_LIMIT_STRING_TO_TIER` ([FIX-C1]), throughput constants ([FIX-M3]), back-compat `TIER_CONFIG`, `UNLIMITED_SENTINEL` ([FIX-L2]). |
| `src/lib/whatsapp/rate-limiter.ts` | `TIER_CONFIG :27`; `getThroughputLimiter :64`; daily INCR/DECR `:127–:148`; `getStats :205`; `getRecommendedDelay :234`; `reset :252`; `getTodayKey :248` | Delete local `TIER_CONFIG` (import instead); throughput from constants not tier; daily section becomes unique-recipient gate (supplied into Phase 0 Lua / fallback path); two-day rolling merge ([FIX-H2]); `getStats` sentinel ([FIX-L2]). |
| `src/config/whatsapp.ts` | `TIER_CONFIG :6–:12`, `TierLevel :74` | **DELETE both** — zero importers (git grep confirms only the two definitions exist; nothing imports `@/config/whatsapp` for these). Keep `WHATSAPP_CONFIG`, `RETRYABLE_ERRORS`, `FATAL_ERRORS`. |
| `src/lib/whatsapp/campaign-processor.ts` | `:242 tier: instance.messaging_tier \|\| 1`; `:488 getRateLimiter(instance.id, instance.tier)` | Replace tier source with `tierFromMessagingLimit(instance.messaging_limit)` ([FIX-C1]); read `messaging_limit` (already selected for the same instance in the WABA query path). |
| `src/app/api/whatsapp/queue/stats/route.ts` | `:30 getRateLimiter(instanceId)`; `:34 getStats()` | No tier passed → derive default from string when available; consumes the `-1` sentinel ([FIX-L2]). |
| `src/components/whatsapp/WabaHealthWidget.tsx` | `TIER_MAP :61–:68` (already maps `TIER_250→0 … UNLIMITED→4`) | Reuse as the canonical string→index reference; relabel `dailySent` display to "destinatários únicos / 24h" ([FIX-M2]); render sentinel as "Ilimitado". |
| `src/lib/whatsapp/alerts.ts` | `:218` checks `TIER_250`/`TIER_1K` | Unchanged; verify string set matches the new map. |
| `src/app/api/cron/reset-daily-whatsapp-counters/route.ts` | `:22 rpc('reset_daily_whatsapp_counters')` | RPC defined in `worder-cloud-api-fixes/01-migration-cloud-api-schema.sql:622` + `docs/ALL-MIGRATIONS-CONSOLIDATED.sql:795`, **NOT in `supabase/migrations/`** → REQUIRES-VERIFICATION ([FIX-M1]). Resets DB `messages_sent_today` only, never Redis. Add comment; do NOT change the RPC call; do NOT flush Redis. |
| DB schema | `whatsapp_instances.messaging_tier INTEGER DEFAULT 1` (`supabase/whatsapp-cloud-api-migration.sql:23`, `campaigns-high-scale.sql:83`); `messaging_limit` enum string (`webhook-processor.ts:612`, `quality/route.ts:334` write it) | Numeric column is effectively dead for tiering; string is the source of truth. No migration required this phase. |

**TIER_CONFIG / TierLevel importers (git grep):** only the two definitions + internal uses in `rate-limiter.ts`. `config/whatsapp.ts`'s symbols have **zero external importers** → safe to delete.

### A.3 New config shape — `src/config/whatsapp-tiers.ts`

```ts
// SINGLE SOURCE OF TRUTH for WhatsApp tier numerics + tier source-of-truth map.

// Messaging limit = UNIQUE business-initiated recipients per rolling 24h.
export const MESSAGING_LIMIT_BY_TIER: Record<number, number> = {
  0: 250,      // TIER_250 / unverified default
  1: 1000,     // TIER_1K   ([FIX] was 2000)
  2: 10000,    // TIER_10K
  3: 100000,   // TIER_100K
  4: Infinity, // UNLIMITED
}

export const TIER_NAME: Record<number, string> = {
  0: 'Não verificado', 1: 'Tier 1K', 2: 'Tier 10K', 3: 'Tier 100K', 4: 'Unlimited',
}

// [FIX-C1] Meta's REAL source: enum string `messaging_limit` / API `messaging_limit_tier`.
// Mirrors the existing WabaHealthWidget TIER_MAP indices.
export const MESSAGING_LIMIT_STRING_TO_TIER: Record<string, number> = {
  TIER_NOT_SET: 0, TIER_250: 0,
  TIER_1K: 1, TIER_10K: 2, TIER_100K: 3,
  UNLIMITED: 4, TIER_UNLIMITED: 4,
}

/** Deterministic, safe-by-default derivation. Unknown/missing → tier 0 (most conservative). */
export function tierFromMessagingLimit(s: string | null | undefined): number {
  if (!s) return 0
  return MESSAGING_LIMIT_STRING_TO_TIER[s] ?? 0
}

// [FIX-M3] Throughput is per-phone-number, NOT tier-derived. Tier-0/unverified stays low
// until a per-instance throughput_mps override exists (avoids 429 storms before backoff).
export const DEFAULT_THROUGHPUT_MPS = 80
export const TIER0_THROUGHPUT_MPS = 10
export const MAX_THROUGHPUT_MPS = 1000
export function throughputMpsForTier(tier: number): number {
  return tier === 0 ? TIER0_THROUGHPUT_MPS : DEFAULT_THROUGHPUT_MPS
}

// [FIX-L2] Infinity JSON-serializes to null. Wire sentinel for "unlimited".
export const UNLIMITED_SENTINEL = -1

export type TierLevel = keyof typeof MESSAGING_LIMIT_BY_TIER

// Back-compat TIER_CONFIG-shaped export (mps now per-tier via throughputMpsForTier,
// NOT the old hand-coded tier ladder). daily uses the corrected limits.
export const TIER_CONFIG: Record<number, { mps: number; daily: number; name: string }> =
  Object.fromEntries(
    Object.keys(MESSAGING_LIMIT_BY_TIER).map((k) => {
      const t = Number(k)
      return [t, { mps: throughputMpsForTier(t), daily: MESSAGING_LIMIT_BY_TIER[t], name: TIER_NAME[t] }]
    })
  )
```

### A.4 Unique-recipient Redis design ([FIX-H1] exact-vs-HLL, [FIX-H2] rolling window, [FIX-C2] atomic tier-0)

Replace the per-send INCR counter with a **per-instance unique-recipient counter, idempotent per recipient**, supplied into Phase 0's atomic `canSend` Lua. Phase 4 defines the *semantics*; Phase 0 hosts them in the single `EVAL`.

**Structure by tier ([FIX-H1]):**
- **Tiers 0–2 (≤10K): exact `SET`** of recipient phone strings, gated on `SCARD`. Memory sized: a phone string ~15 bytes; Redis set overhead ~50–80 B/member → ≤10K members ≈ **≤0.8 MB per instance per day-key**, well within Upstash. Exact = zero undercount risk for the ban-sensitive tiers.
- **Tier 3 (100K): HyperLogLog** (`PFADD`/`PFCOUNT`, ~12 KB fixed) with a **conservative gate `count > limit * 0.99`** so the ±0.81% (≈±810 at 1σ) undercount cannot silently exceed Meta's limit. Error budget: we trade ~1% headroom (gate at 99,000 effective) for bounded over-send risk.
- **Tier 4 (Unlimited): no count gate** — skip entirely.

**Window ([FIX-H2]) — two day-keys, merged, NOT a single calendar reset:**
- Keys per instance: `wa:dailyrecip:{instanceId}:{YYYY-MM-DD}` (today + yesterday), TTL 172800 (48h) so yesterday survives the overlap.
- Effective count = `count(today) + count(yesterday) * (1 - elapsedFractionOfTodayUtc)`, where `elapsedFractionOfTodayUtc = secondsSinceMidnightUtc / 86400`. At 00:01 UTC the prior day still weighs ~100% (no clean 2× reset); by 23:59 UTC it weighs ~0%. For exact SETs this is `SCARD(today) + floor(SCARD(yesterday) * weight)`; for HLL, `PFMERGE` a temp key then `PFCOUNT`, applying the same weight to the yesterday contribution (or, simpler and still safe, gate on the un-weighted `PFCOUNT` of the merged set — strictly more conservative). This is a bounded approximation of Meta's rolling 24h, explicitly **not** "conservative-by-accident."

**Semantics supplied to Phase 0's Lua (`canSend`):**
1. Compute `tier` (from `tierFromMessagingLimit`, passed by caller). If `tier === 4` → skip daily gate.
2. **Atomic count-and-gate ([FIX-C2]):** in ONE Lua eval, for exact tiers — `SADD(todayKey, phone)` to a *probe*, compute effective count (today+weighted-yesterday), and **only keep the add if effective ≤ limit**; otherwise `SREM` the just-added member *within the same eval* (atomic, no inter-round-trip race). For HLL tier — `PFADD` is not removable, so gate by reading effective count *before* committing and only `PFADD` when `count < limit*0.99`; the idempotent re-add of an existing member is a no-op (PFADD returns 0) and never advances the decision.
3. **Idempotency:** a re-send to an already-present recipient (`SADD`→0 / `PFADD`→0) is **always allowed** by the daily gate and consumes nothing — exactly "re-sends don't double-count." (Phase 0's recipient-idempotency helper backs this.)
4. On first add of a day-key, `EXPIRE … 172800`.
5. Reject verdict: `{ allowed:false, retryAfter: secondsUntilMidnightUtc, remaining:0, reason:'Messaging limit exceeded (unique recipients/24h)' }`.

**Removed:** old `wa:daily:{id}:{day}` INCR/DECR (`rate-limiter.ts:127–:148`) and its `getStats`/`reset` reads. New keys `wa:dailyrecip:*` are reconciliation-friendly (idempotent adds, mergeable) so Phase 2's reconciliation can rebuild them.

### A.5 Tier source wiring ([FIX-C1])

- `campaign-processor.ts:242`: replace `tier: instance.messaging_tier || 1` with `tier: tierFromMessagingLimit(instance.messaging_limit)`. The WABA row already carries `messaging_limit` (selected at `campaign-processor.ts:417`); thread it onto the `instance` object used to build the rate limiter at `:488`.
- This MUST land before/with the accounting change so the 250 gate actually applies to real TIER_250 numbers (today they run as tier 1 = 1000).
- `getRateLimiter(instanceId, tier)` key already encodes tier, so a tier change re-keys the cached limiter — no stale-tier bug.

### A.6 Migration (safe, reversible)

- **No destructive DB migration.** `messaging_tier` (now effectively unused for tiering) and `messaging_limit` columns stay.
- **Redis cutover:** new `wa:dailyrecip:*` coexists with old `wa:daily:*`; old keys expire (24h TTL) and are no longer read. Worst case: unique-counts start fresh at deploy → brief under-count → cannot over-send (safe direction). Document in PR.
- **[FIX-M1] reset cron:** `reset_daily_whatsapp_counters` is defined only in `worder-cloud-api-fixes/` + `docs/ALL-MIGRATIONS-CONSOLIDATED.sql`, **not in `supabase/migrations/`** → status REQUIRES-VERIFICATION. It resets DB `messages_sent_today` (health/alerts), never Redis. Leave its RPC call unchanged; add a comment that Redis daily accounting is TTL-based and orthogonal. Do NOT flush Redis here.
- **Optional follow-up:** nullable `throughput_mps INTEGER` on `whatsapp_instances` for per-number overrides (default NULL → `throughputMpsForTier`). Not this phase.
- **Rollback:** revert commit → code reads old `wa:daily:*` (expired → re-INCRs from 0; harmless).

### A.7 Test plan

Add `src/lib/whatsapp/rate-limiter.test.ts` (none exists today; only `campaign-processor.test.ts`). Vitest, mock Upstash (`eval`/`sadd`/`scard`/`srem`/`pfadd`/`pfcount`/`pfmerge`/`expire`/`incr`).

- `MESSAGING_LIMIT_BY_TIER` = {0:250,1:1000,2:10000,3:100000,4:Infinity}.
- `tierFromMessagingLimit`: `TIER_250→0`, `TIER_NOT_SET→0`, `TIER_1K→1`, `TIER_10K→2`, `TIER_100K→3`, `UNLIMITED→4`, unknown/null→0 ([FIX-C1]).
- Throughput: `throughputMpsForTier(0)===10`, `(1)===80`, `(3)===80` — independent of messaging limit ([FIX-M3]); `getRecommendedDelay` for tier 0 ≠ tier 1 but both tier-independent of the daily numeric.
- Daily gate: first send to A → allowed, count 1; re-send to A → allowed, count unchanged ([idempotent]); N distinct up to limit allowed; `limit+1`-th new → rejected.
- **Tier-0 atomic gate ([FIX-C2]):** simulate two concurrent rejects at the boundary → `SCARD` never drops below 250 / never re-admits past 250 (assert the eval keeps adds only within limit).
- **Tier-3 HLL conservative gate ([FIX-H1]):** rejection fires at `count > limit*0.99`, not at `limit`.
- **Rolling window ([FIX-H2]):** yesterday-key contribution decays with `elapsedFractionOfTodayUtc`; no clean reset at 00:00 UTC (count just after midnight ≈ count just before).
- **Sentinel ([FIX-L2]):** tier-4 `getStats().dailyLimit === -1` and JSON round-trips (not `null`); UI renders "Ilimitado".
- Tier-4: never rejected on daily.

Commands: `npx tsc --noEmit && npm run lint && npm test -- rate-limiter && npm test -- campaign-processor`.

### A.8 Observability

- On daily-limit rejection emit `whatsapp.ratelimit.messaging_limit_hit` `{ instanceId, tier, uniqueCount, limit }` (via Phase 0's error-code/`wlog` pipeline).
- `getStats` exposes `dailySent` (= unique recipients), `dailyLimit` (sentinel `-1` for unlimited). **Relabel at presentation** ([FIX-M2]): `WabaHealthWidget`/queue-stats UI show "destinatários únicos / 24h" and "Ilimitado".
- One-time deploy log noting the `wa:daily:* → wa:dailyrecip:*` cutover.

### A.9 Ordering / dependencies

- **Phase 0 (Foundations) — PREREQUISITE.** Owns the atomic `canSend` Lua, atomic circuit-breaker, error-code pipeline, recipient-idempotency helper. Phase 4 supplies the unique-recipient semantics (+ tier-0 atomic commit) that Phase 0's Lua *implements*. **Do not have both rewrite the Lua.**
- **Phase 4 lands right AFTER Phase 0, BEFORE Phase 2.** Phase 2 collapses `canSend` to one round-trip and routes `dailyKey` through the Lua "designed so Phase 4 slots in without a rewrite" — Phase 4 fixes *what is counted* first; Phase 2 then moves the (correct) accounting off the hot path / into reconciliation. Contract key name: `wa:dailyrecip:*`.
- **Phases 1/3/5/6:** independent. **Phase 7:** picks up dead-`config/whatsapp.ts` removal confirmation + `wa:daily:*` reference sweep.

### A.10 Risks + blast radius

- **Over-send risk:** bounded — exact SETs for tiers 0–2 (zero undercount); HLL only at 100K with a 0.99 gate ([FIX-H1]); rolling-window merge removes the 2× reset ([FIX-H2]); tier-0 gate atomic ([FIX-C2]).
- **Tier source ([FIX-C1]) is the highest-leverage change:** real TIER_250 numbers move from a silent 1000/day to 250/day — a *tightening*, correct and safe; verify no legitimate high-tier number is mis-mapped (unknown string → 0 is conservative; cross-check against `messaging_limit` values actually present).
- **Throughput ([FIX-M3]):** tier-0 stays 10 MPS (no 429 storm); tiers ≥1 at 80, within Meta default.
- **Residual:** rolling-window is still an approximation (true sliding window is a follow-up); HLL tier-3 retains ~1% modeled error inside the 0.99 budget; exact Meta page wording REQUIRES-VERIFICATION.
- **Blast radius:** code + one Redis-key family + presentation relabel. Single hot-path consumer (`campaign-processor`). No schema migration, no API contract change. Fully revertible.

---

## B) EXECUTION PROMPT (for a fresh coding agent)

> **Branch:** `claude/debug-console-error-FWrLE`. Work only in `D:\worder1`. Do NOT touch `D:\worder1-fwrle`.
> **Depends on Phase 0** (atomic `canSend` Lua + recipient-idempotency helper already in place). Land Phase 4 AFTER Phase 0, BEFORE Phase 2. **Do not rewrite Phase 0's Lua harness — supply the daily unique-recipient semantics into it.**
>
> **Goal:** (1) [FIX-C1] derive rate-limiter tier from Meta's enum string `messaging_limit`, not the never-written `messaging_tier`; (2) make the daily quota count UNIQUE business-initiated recipients/24h, idempotent per recipient, with the tier-0 gate ATOMIC; (3) dedupe `TIER_CONFIG`, decouple throughput from tier.
>
> **Acceptance criteria:**
> - One canonical config module `src/config/whatsapp-tiers.ts`; `rate-limiter.ts` imports it; `config/whatsapp.ts` no longer defines `TIER_CONFIG`/`TierLevel` (`git grep -n "TIER_CONFIG\|TierLevel" src/` shows only the new module + internal uses).
> - `MESSAGING_LIMIT_BY_TIER` = {0:250, **1:1000**, 2:10000, 3:100000, 4:Infinity}.
> - `tierFromMessagingLimit('TIER_250')===0`, `('TIER_1K')===1`, `('TIER_10K')===2`, `('TIER_100K')===3`, `('UNLIMITED')===4`, unknown/null→0.
> - `campaign-processor.ts` builds the limiter from `tierFromMessagingLimit(instance.messaging_limit)` (NOT `messaging_tier`).
> - Throughput: tier-0 = 10 MPS, tiers ≥1 = 80 MPS, never derived from the daily numeric.
> - Daily gate: re-send to same phone in window → allowed, count unchanged. Tier-0 count-and-gate is atomic (single Lua eval; no SADD→SCARD→SREM across round-trips). Tiers 0–2 exact SET; tier-3 HLL with `count > limit*0.99`; tier-4 skipped. Two-day rolling merge (today + weighted-yesterday), no clean 00:00 UTC reset.
> - `getStats().dailyLimit`/`dailyRemaining` use sentinel `-1` for unlimited (no `null` in JSON).
> - `npx tsc --noEmit && npm run lint && npm test -- rate-limiter && npm test -- campaign-processor` all green.
>
> **Files & edits:**
> 1. **CREATE `src/config/whatsapp-tiers.ts`** exactly per plan §A.3 (`MESSAGING_LIMIT_BY_TIER`, `TIER_NAME`, `MESSAGING_LIMIT_STRING_TO_TIER`, `tierFromMessagingLimit`, `DEFAULT_THROUGHPUT_MPS=80`, `TIER0_THROUGHPUT_MPS=10`, `MAX_THROUGHPUT_MPS=1000`, `throughputMpsForTier`, `UNLIMITED_SENTINEL=-1`, `type TierLevel`, back-compat `TIER_CONFIG`).
> 2. **EDIT `src/lib/whatsapp/rate-limiter.ts`:**
>    - Delete local `TIER_CONFIG` (`:27`); `import { MESSAGING_LIMIT_BY_TIER, TIER_NAME, throughputMpsForTier, tierFromMessagingLimit, UNLIMITED_SENTINEL, TIER_CONFIG } from '@/config/whatsapp-tiers'`.
>    - `getThroughputLimiter()` (`:64`): `const mps = throughputMpsForTier(this.tier); const target = Math.floor(mps * 0.9)`; `tokenBucket(target,'1 s',mps)`. No tier-ladder MPS.
>    - **Daily section (`:127–:148`):** remove `wa:daily` INCR/DECR. Supply the unique-recipient gate into Phase 0's `canSend` Lua (KEYS = today/yesterday dailyrecip keys, ARGV = tier, limit, elapsedFractionOfTodayUtc, ttl=172800). Semantics: exact `SADD`+`SCARD` for tiers 0–2 with atomic in-eval `SREM` if effective count > limit; `PFADD`/`PFCOUNT` for tier 3 gated at `limit*0.99`; tier 4 skip. Effective count = today + floor(yesterday * (1 - elapsedFraction)). Idempotent re-add (returns 0) → always allowed, no consume. Reject → `{ allowed:false, retryAfter:getSecondsUntilMidnight(), remaining:0, reason:'Messaging limit exceeded (unique recipients/24h)' }`. If Phase 0's helper exposes a `dailyUniqueGate` hook, call it; else inline the Lua branch in the existing `EVAL`.
>    - `getStats()` (`:205`): `dailySent` = effective unique count (SCARD/PFCOUNT merged); `dailyLimit` = `limit === Infinity ? UNLIMITED_SENTINEL : limit`; `dailyRemaining` likewise sentinel; `tierName = TIER_NAME[this.tier]`; `utilizationPercent = limit===Infinity ? 0 : sent/limit*100`. Keep field NAMES.
>    - `getRecommendedDelay()` (`:234`): `Math.ceil(1000 / (throughputMpsForTier(this.tier) * 0.8))`.
>    - `reset()` (`:252`): delete `wa:dailyrecip:{id}:{today}` and the exact key, plus `wa:dailyrecip:{id}:{yesterday}`; drop `wa:daily:*`.
>    - Add `getYesterdayKey()` + `elapsedFractionOfTodayUtc()` helpers near `getTodayKey()`.
> 3. **EDIT `src/lib/whatsapp/campaign-processor.ts`:** at `:242` `tier: tierFromMessagingLimit(instance.messaging_limit)`; ensure `messaging_limit` is carried onto the `instance` object (already selected in the WABA query at `:417`). Import from `@/config/whatsapp-tiers`.
> 4. **EDIT `src/config/whatsapp.ts`:** delete `TIER_CONFIG` (`:6–:12`) and `export type TierLevel` (`:74`). Keep `WHATSAPP_CONFIG`, `RETRYABLE_ERRORS`, `FATAL_ERRORS`. `git grep -n "TierLevel\|TIER_CONFIG" src/` → no broken importers (expected none).
> 5. **EDIT `src/components/whatsapp/WabaHealthWidget.tsx`:** relabel the `dailySent` display to "destinatários únicos / 24h"; render `dailyLimit === -1` as "Ilimitado" ([FIX-M2]/[FIX-L2]). (Reuse existing `TIER_MAP` indices; do not duplicate the map — import or align with `whatsapp-tiers.ts`.)
> 6. **EDIT `src/app/api/cron/reset-daily-whatsapp-counters/route.ts`:** add a comment — Redis daily accounting is now TTL-based (`wa:dailyrecip:*`, 48h) and independent of this RPC; the RPC `reset_daily_whatsapp_counters` is defined only in `worder-cloud-api-fixes/`+`docs/` (NOT `supabase/migrations/`), resets DB `messages_sent_today` only. Do NOT change the RPC call; do NOT flush Redis.
> 7. **TESTS:** create `src/lib/whatsapp/rate-limiter.test.ts` covering §A.7 (tier-string map; throughput tier-independence; idempotent re-send; per-tier boundary; tier-0 atomic-no-re-admit; tier-3 0.99 gate; rolling-window decay; `-1` sentinel; tier-4 unbounded). Mock Upstash `eval/sadd/scard/srem/pfadd/pfcount/pfmerge/expire/incr`.
>
> **Verify:** `npx tsc --noEmit && npm run lint && npm test -- rate-limiter && npm test -- campaign-processor`. Then `git grep -n "wa:daily\b" src/` → nothing; `git grep -n "messaging_tier" src/` → no rate-limiter tiering use; `git grep -n "TIER_CONFIG\|TierLevel" src/config/whatsapp.ts` → nothing.
>
> **Do NOT:**
> - Do NOT author or restructure Phase 0's `canSend` Lua harness or the recipient-idempotency helper — only supply the daily unique-recipient *semantics* (and tier-0 atomic commit) into it. Do NOT collapse `canSend`'s other round-trips — that is **Phase 2**.
> - Do NOT use the non-atomic `SADD → SCARD → SREM`-across-round-trips pattern for tier-0 ([FIX-C2]); the count-and-gate must be one atomic eval.
> - Do NOT use HLL for tiers 0–2, and do NOT gate tier-3 HLL at exactly `limit` (use `limit*0.99`) ([FIX-H1]).
> - Do NOT key the daily counter on a single UTC calendar day with a hard 00:00 reset ([FIX-H2]).
> - Do NOT derive MPS from the messaging-limit numeric; do NOT raise tier-0 throughput above `TIER0_THROUGHPUT_MPS` ([FIX-M3]).
> - Do NOT let `Infinity` reach JSON — use `UNLIMITED_SENTINEL` ([FIX-L2]).
> - Do NOT read tier from `messaging_tier` ([FIX-C1]); use `messaging_limit` via `tierFromMessagingLimit`.
> - Do NOT add/alter DB migrations or columns; do NOT flush Redis in the reset cron; do NOT touch dispatcher/QStash/media/client (Phases 1/3/5/6).
> - Do NOT rename returned `RateLimiterStats` fields (`dailySent`/`dailyLimit`); relabel only at the presentation layer.
