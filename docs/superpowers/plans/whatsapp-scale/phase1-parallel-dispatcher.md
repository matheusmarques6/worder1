# Phase 1 — Parallel hot-loop dispatcher with token-bucket pacing — **v2**

Target branch: `claude/debug-console-error-FWrLE`
Primary file: `src/lib/whatsapp/campaign-processor.ts`

---

> ## ⛔ PREREQUISITE: PHASE 0 (FOUNDATIONS) IS A HARD BLOCKER
> **Phase 1 MUST NOT ship before Phase 0.** The v1 plan's claim that this phase is
> "independent" and can go "first" is **WRONG** and is corrected here. Concurrency
> turns three latent races in the shared rate-limiter / circuit-breaker primitives
> into duplicate-send and endpoint-blast bugs. Those primitives are fixed by Phase 0,
> which delivers:
> 1. **Non-consuming `canSend` peek + separate commit** (atomic, and **does not** consume
>    daily quota or a pair-rate token on a denied/peek call).
> 2. **Atomic circuit-breaker** — HALF_OPEN admission and failure/success counting done
>    with atomic Redis ops (Lua / `INCR`-gated), not read-then-incr.
> 3. **Meta error-code pipeline** — `error.code` is populated from the Meta API response
>    (today raw throws give `UNKNOWN`), so 429/80007 backpressure is no longer blind.
> 4. **Shared recipient-idempotency helper** — re-reads live recipient status (filtered
>    to `pending`/`queued`) from the DB immediately before sending, so a requeued job
>    never re-sends already-`sent` rows.
>
> Phase 1 **consumes** these primitives. It does **not** re-implement them. If a Phase 0
> primitive is not yet available, the corresponding degraded-mode fallback in the
> "Phase 0 dependency map" below is **mandatory**, not optional.

---

## v2 CHANGELOG (adversarial-review fixes folded in)

Every item below is grounded in the real code on `claude/debug-console-error-FWrLE`.

- **[FIX-1] (C1, CRITICAL) — `canSend` is consuming, so the recheck loop burns quota/tokens.**
  `canSend` is **not** idempotent: it `redis.incr`s the daily counter (`rate-limiter.ts:128`,
  `const dailyCount = await redis.incr(dailyKey)`) and consumes a pair-rate token
  (`rate-limiter.ts:116`, `const pairResult = await pairLimiter.limit(toPhone)`) on **every**
  call. The v1 design looped up to `maxCanSendRechecks: 20` rechecks **per recipient × N lanes**
  — each iteration burning a fresh daily increment and a pair-rate slot, corrupting the very
  quota it claims to respect. **Fix:** consume Phase 0's non-consuming peek/commit split — peek
  to gate, commit exactly once on the decision to send. Never loop a consuming `canSend`. If the
  split is unavailable, only re-check the throttle/throughput gate (steps 1–2 of `canSend`),
  **never** re-run the daily `incr` (step 4) or pair-rate `limit` (step 3). (Details: Design →
  "Pacing authority".)

- **[FIX-2] (C2, CRITICAL) — circuit-breaker HALF_OPEN admission is read-then-incr → N lanes blast a half-recovered endpoint.**
  `canExecute` reads the half-open counter, compares to the cap, then increments in a separate
  round-trip (`circuit-breaker.ts:105-112`: `const halfOpenCalls = parseInt(await redis.get(...))`
  → `if (halfOpenCalls >= this.halfOpenMaxCalls) return false` → `await redis.incr(...)`). Under N
  concurrent lanes, all N read the same sub-cap value and all pass `< 3`, so a half-recovered
  endpoint gets hit by up to N test calls instead of `halfOpenMaxCalls`. **Fix:** requires Phase 0's
  atomic HALF_OPEN admission (`INCR`-then-compare / Lua). Until then, the breaker check **must be
  serialized** (single-flight mutex around `canExecute`, see Design → "Circuit-breaker abort").

- **[FIX-3] (C3, CRITICAL) — breaker-abort requeue re-sends already-`sent` rows; duplicate blast grows ~1→N.**
  `processBatch` destructures `recipients` from the **job payload** (`campaign-processor.ts:485`,
  `const { ... recipients ... } = data`) and iterates that frozen array. The `pending`/`queued`
  filter exists **only on fresh campaign build** (`campaign-processor.ts:673-675`,
  `.select(...).in('status', ['pending','queued'])`), baked into the payload by `addBatch`. On a
  breaker abort the v1 code `throw new Error('Circuit breaker OPEN')` (`campaign-processor.ts:525`);
  `processJob` catches it and calls `campaignQueue.fail(job.id, ...)` (`campaign-processor.ts:468`),
  which **requeues the same `data.recipients` snapshot — including rows already UPDATEd to `sent`.**
  On replay those `sent` rows are re-sent. Serial v1 leaks ~1 duplicate per abort; with N lanes the
  in-flight window at abort time is up to N, so the duplicate blast grows ~1→N. **Fix:** use Phase 0's
  idempotency helper — re-read each recipient's live DB status (filter to `pending`/`queued`)
  immediately before sending, and skip anything no longer pending. (Design → "Idempotent send".)

- **[FIX-4] (H1) — `recordFailure`/`recordSuccess` Redis counters race; breaker may never open.**
  `recordSuccess` does `await redis.set(this.failuresKey, '0')` on a CLOSED success
  (`circuit-breaker.ts:155-164`) while a concurrent `recordFailure` does
  `const failures = await redis.incr(this.failuresKey)` (`circuit-breaker.ts:134-137` region). Under
  concurrency a stray success can stomp the failure count back to 0, so in a real outage the breaker
  may never reach `failureThreshold` and never open. **Phase 0 dependency** (atomic counter handling).

- **[FIX-5] (H2) — token bucket allows a burst up to `max` once the trailing sleep is gone.**
  The bucket is `Ratelimit.tokenBucket(targetMPS, '1 s', config.mps)` (`rate-limiter.ts:65-70`),
  i.e. refill = `floor(mps*0.9)`/s but **capacity = `config.mps`** (full tier MPS). When the bucket
  is full it can grant a burst of up to `config.mps` tokens instantly. The serial loop's trailing
  `sleep(getRecommendedDelay())` masked this; removing it under concurrency makes the burst
  realizable, so the bucket is **not** a hard MPS cap as v1 claimed. **Fix:** set bucket
  capacity = `targetMPS` (a Phase 0 / Phase 2 rate-limiter change) **or** cap lanes so peak
  in-flight ≤ targetMPS. Stop describing the bucket as a hard cap until capacity is corrected.

- **[FIX-6] (H3) — all N lanes wake on the same `retryAfter` and re-hit Redis in lockstep.**
  When `canSend` denies, every lane sleeps the same `retryAfter` and rechecks at the same instant,
  producing a thundering-herd against Redis and the bucket. **Fix:** add jitter + exponential
  backoff to the recheck sleep (`base * 2^attempt + random(0, base)`, capped).

- **[FIX-7] (M1) — `error.code` is `UNKNOWN` today, so the 429 backpressure is blind.**
  The catch path does `await rateLimiter.recordError(error.code || 'UNKNOWN')`
  (`campaign-processor.ts:580`), and `recordError` only escalates throttle on codes
  `['429','80007','130429','131056']` (`rate-limiter.ts:160-185`). Today the raw meta-api layer
  throws bare `Error`s with no `.code`, so every failure records as `UNKNOWN` and **never** trips the
  throttle the dispatcher leans on. **Fix:** sequence Phase 1 **after** Phase 0's error-pipeline fix
  (so `error.code` carries the real Meta code). Until then, throttle-based backpressure is documented
  as non-functional.

- **[FIX-8] (L1) — mocked unit tests cannot catch these races.**
  Tests that mock `./rate-limiter` and `./circuit-breaker` replace exactly the code where the races
  live, so they prove nothing about concurrency safety. **Fix:** add a real-Redis (or `ioredis-mock`/
  fake-Redis with true atomic semantics) concurrency test that drives N lanes against the **real**
  primitives. The existing `setTimeout` peak-concurrency test only validates the pool bound, not the
  Redis race surface.

- **[FIX-9] (L2) — `WA_DISPATCH_CONCURRENCY=1` is NOT exact pre-Phase-1 parity.**
  Setting concurrency to 1 also drops the trailing `sleep(getRecommendedDelay())`
  (`campaign-processor.ts:575`), so per-message pacing differs from today's serial loop. State this
  honestly: `=1` is "single-lane, bucket-paced," **not** byte-for-byte legacy behavior.

- **[FIX-SEQ] — Corrected sequencing.** The v1 "Ordering / deps" section claimed independence from
  Phase 0 and recommended "Phase 1 first." That is replaced by: **Phase 0 → Phase 1**, hard
  prerequisite (see banner + "Ordering / deps" below).

---

## A) IMPLEMENTATION PLAN

### Objective
Replace the strictly-serial `for (const recipient of recipients) { … await sleep(getRecommendedDelay()) }`
loop in `processBatch` (`campaign-processor.ts:498–607`) with a **bounded-concurrency dispatcher**
that runs up to N recipient-sends in flight at once. **Phase 0's primitives are the safety floor.**
The Redis token bucket (with **corrected capacity** per [FIX-5]) remains the pacing authority;
concurrency only keeps the bucket saturated instead of idling between Redis round-trips — it never
grants the right to exceed MPS. When the pacing gate denies, the dispatcher backs off (jittered
exponential sleep, [FIX-6]) rather than busy-spinning.

Today the per-message latency is dominated by serial awaits: ~4 Redis round-trips in `canSend`
(`rate-limiter.ts:82–151`) + the Meta HTTP send + a fixed `sleep(getRecommendedDelay())`
(`campaign-processor.ts:575`). At tier 1, `getRecommendedDelay() = ceil(1000/(40*0.8)) = 32ms` of
pure idle per message **on top of** all network latency — so a 100-recipient batch is effectively
single-flight and nowhere near `targetMPS`. The bucket refills at `floor(mps*0.9)` (`rate-limiter.ts:65`)
but the serial loop can never reach it.

### Premise check against real code (one correction)
The phase brief says "wire the unused `maxParallelBatches`." Reading the code: `maxParallelBatches: 5`
(`campaign-processor.ts:30`) is a **per-batch** knob, but the worker processes **one batch at a time**
(`processJob` is called serially inside the `while` loop, `campaign-processor.ts:363–376`) and there
is no batch-level parallelism to wire. So `maxParallelBatches` is the wrong lever for an *intra-batch*
dispatcher. **Decision: introduce a new, clearly-named in-flight cap `dispatchConcurrency`
(per-worker, intra-batch)** and leave `maxParallelBatches` alone (Phase 3/QStash territory).

### Phase 0 dependency map (degraded-mode fallbacks if a primitive is missing)

| Phase 0 primitive | Phase 1 use | If unavailable (mandatory fallback) |
|---|---|---|
| Non-consuming `canSend` peek + commit | Gate each lane without burning quota ([FIX-1]) | Re-check **only** throttle/throughput (steps 1–2 of `canSend`); never re-run daily `incr` (:128) or pair `limit` (:116). Accept that the first `canSend` already consumed once. |
| Atomic HALF_OPEN admission ([FIX-2]) | Lanes admit ≤ `halfOpenMaxCalls` test calls | Serialize `canExecute` behind a process-local async mutex (single-flight) so reads/incrs don't interleave. |
| Idempotency helper ([FIX-3]) | Re-read live status before send | Inline a per-recipient `select status` filtered to `pending`/`queued` immediately before `sendTemplateMessage`; skip if not pending. **Do not ship Phase 1 without at least this inline guard.** |
| Atomic breaker counters ([FIX-4]) | Breaker opens reliably under load | Keep `dispatchConcurrency` low (≤4) during canary; the race window scales with lane count. |
| Meta error-code pipeline ([FIX-7]) | 429/80007 throttle actually fires | Document throttle backpressure as non-functional; rely solely on bucket + breaker until Phase 0 lands. |

### Affected files
- `src/lib/whatsapp/campaign-processor.ts`
  - `CAMPAIGN_CONFIG` (:25–50) — add `dispatchConcurrency` + env override + recheck-backoff knobs.
  - `processBatch` (:484–607) — the only structural rewrite.
  - (No change to `processJob`, `startWorker`, `getRateLimiter`, `getCircuitBreaker`, `buildTemplateComponents`.)
- `src/lib/whatsapp/campaign-processor.test.ts` — add `describe('processBatch — parallel dispatcher')`.
- **`*.concurrency.test.ts`** (new) — real/fake-Redis race test, [FIX-8].
- No changes to `rate-limiter.ts` / `circuit-breaker.ts` in Phase 1 itself — those edits are **Phase 0**.

### Design

**Concurrency model: a fixed-size worker-pool over a shared recipient cursor** (not `Promise.all`
of chunks — chunking wastes a slot whenever one send is slow). `dispatchConcurrency` async "lanes"
pull the next recipient from a shared index and each lane runs the same per-recipient body, with the
Phase 0 primitives substituted in.

**Idempotent send ([FIX-3]).** Before building components / sending, each lane re-reads the live
status of its recipient (Phase 0 helper, or the inline `select` fallback above) and **skips** any
recipient not in `pending`/`queued`. This is what makes breaker-abort requeue safe under concurrency:
on replay, rows already `sent` are filtered out instead of re-sent.

**Pacing authority = token bucket (capacity-corrected, [FIX-5]) via Phase 0 peek/commit ([FIX-1]).**
Remove the unconditional trailing `sleep(getRecommendedDelay())` (`campaign-processor.ts:575`). Each
lane **peeks** the pacing gate; if denied, it backs off (jittered exponential, [FIX-6]) and re-peeks;
on the decision to send it **commits** exactly once. **Never loop a consuming `canSend`** — that is
the [FIX-1] regression. Either (a) cap bucket capacity at `targetMPS`, or (b) cap lanes so peak
in-flight ≤ `targetMPS`; otherwise the bucket is not a hard cap.

**No busy-spin, with jitter+backoff ([FIX-6]).** On deny: `await sleep(min(maxBackoff, base*2^attempt) + random(0, base))`,
re-peek the *same* recipient (don't advance the cursor). Cap re-checks via `maxCanSendRechecks` or a
wall-clock budget tied to `jobTimeoutMs` so a stuck bucket can't pin a lane forever.

**Circuit-breaker abort semantics preserved, admission made safe ([FIX-2]).** Today an OPEN breaker
`throw`s out of the loop, aborting the batch and requeuing the remainder
(`campaign-processor.ts:521–527`, caught at `:470`). Under concurrency: lanes check a shared `aborted`
flag; when any lane sees the breaker OPEN it sets `aborted = true`, the not-yet-processed recipients
are accounted `skipped`, and all lanes drain; after the pool, if `aborted` we
`throw new Error('Circuit breaker OPEN')` so `processJob` requeues exactly as today — **and the
idempotency re-read ([FIX-3]) makes that requeue safe.** The breaker **admission** call (`canExecute`,
HALF_OPEN) goes through Phase 0's atomic admission, or the serialized fallback mutex.

**Ordering of side-effects per recipient is unchanged** (`recordSuccess` after a successful UPDATE;
`recordError`→`recordFailure`→failed-UPDATE in the catch). Only cross-recipient ordering relaxes,
which is acceptable — recipients are independent rows.

### Concrete code sketch (grounded in current lines)

`CAMPAIGN_CONFIG` (after `targetMPS`/`minDelayBetweenMs`, ~:32):

```ts
// Phase 1: intra-batch parallel dispatcher (per-worker in-flight cap).
// PREREQ: Phase 0 primitives (peek/commit canSend, atomic breaker, idempotency helper).
// Pacing authority = Redis token bucket (capacity corrected to targetMPS — FIX-5).
// Kill-switch: =1 → single lane, bucket-paced (NOT byte-for-byte legacy — FIX-9).
dispatchConcurrency: Number(process.env.WA_DISPATCH_CONCURRENCY ?? 8),
maxCanSendRechecks: 20,            // bounds per-recipient backpressure waits
recheckBackoffBaseMs: 250,        // FIX-6: jittered exponential backoff base
recheckBackoffMaxMs: 8000,        // FIX-6: backoff ceiling
```

`processBatch` rewrite (replace the `for (const recipient of recipients)` block at :498–607; keep
everything before :498 and the `increment_campaign_sent` rpc at :600–605):

```ts
const concurrency = Math.max(1, Math.min(
  CAMPAIGN_CONFIG.dispatchConcurrency,
  recipients.length,
))

let cursor = 0
let aborted = false

// One recipient = the per-recipient body, with Phase 0 primitives substituted.
const sendOne = async (recipient: typeof recipients[number]): Promise<void> => {
  // 0. IDEMPOTENCY (FIX-3): re-read live status; skip if no longer pending/queued.
  //    Phase 0 helper preferred; inline fallback shown.
  const stillPending = await recipientIdempotency.isPending(recipient.id) // Phase 0
  // fallback: const { data } = await supabase.from('whatsapp_campaign_recipients')
  //   .select('status').eq('id', recipient.id).single();
  //   const stillPending = ['pending','queued'].includes(data?.status)
  if (!stillPending) { result.skipped++; return }

  // 1. opt-out guard (was :502) — unchanged
  const optCheck = await requireOptIn(
    organizationId, recipient.phone_number, template.category,
    { sender: 'campaign-processor' },
  )
  if (!optCheck.allowed) {
    await supabase.from('whatsapp_campaign_recipients')
      .update({ status: 'skipped', error_message: 'Contato opted_out' })
      .eq('id', recipient.id)
    result.skipped++
    return
  }

  // 2. circuit breaker (was :521) — ATOMIC/serialized admission (FIX-2). OPEN aborts batch.
  if (!await circuitBreaker.canExecute()) {  // Phase 0 atomic, or serialized fallback
    aborted = true
    return
  }

  // 3. pacing gate = PEEK (FIX-1, non-consuming). Jittered exponential backoff (FIX-6).
  let allowed = false
  for (let i = 0; i < CAMPAIGN_CONFIG.maxCanSendRechecks && !aborted; i++) {
    const peek = await rateLimiter.canSendPeek(recipient.phone_number) // Phase 0
    // fallback (no peek): re-check ONLY throttle/throughput, NEVER daily incr / pair limit.
    if (peek.allowed) { allowed = true; break }
    const backoff = Math.min(
      CAMPAIGN_CONFIG.recheckBackoffMaxMs,
      CAMPAIGN_CONFIG.recheckBackoffBaseMs * 2 ** i,
    ) + Math.random() * CAMPAIGN_CONFIG.recheckBackoffBaseMs
    await sleep(Math.max((peek.retryAfter || 0) * 1000, backoff))
  }
  if (!allowed) { result.skipped++; return }

  // 4. COMMIT the pacing decision exactly once (FIX-1), then send (was :548–573).
  await rateLimiter.canSendCommit(recipient.phone_number) // Phase 0: consumes once
  const components = this.buildTemplateComponents(
    recipient.resolved_variables, mediaUrl, mediaType)
  const sendResult = await this.whatsAppRetry(() => sendTemplateMessage({
    phoneNumberId: instance.phoneNumberId, accessToken: instance.accessToken,
    to: recipient.phone_number, templateName: template.name,
    languageCode: template.language, components,
  }))
  await supabase.from('whatsapp_campaign_recipients')
    .update({ status: 'sent', sent_at: new Date().toISOString(),
              meta_message_id: sendResult.messages?.[0]?.id })
    .eq('id', recipient.id)
  await circuitBreaker.recordSuccess()   // Phase 0 atomic counters (FIX-4)
  result.sent++
}

// Worker-pool: `concurrency` lanes share one cursor.
const lane = async (): Promise<void> => {
  while (!aborted) {
    const idx = cursor++
    if (idx >= recipients.length) return
    const recipient = recipients[idx]
    try {
      await sendOne(recipient)
    } catch (error: any) {        // per-recipient catch (was :577–598)
      console.error(`Failed to send to ${recipient.phone_number}:`, error.message)
      // FIX-7: error.code is real only after Phase 0 error-pipeline; else 'UNKNOWN'.
      await rateLimiter.recordError(error.code || 'UNKNOWN')
      await circuitBreaker.recordFailure(error)  // Phase 0 atomic counters (FIX-4)
      await supabase.from('whatsapp_campaign_recipients')
        .update({ status: 'failed', failed_at: new Date().toISOString(),
                  error_code: error.code?.toString() || 'UNKNOWN',
                  error_message: error.message,
                  retry_count: (recipient.retry_count || 0) + 1 })
        .eq('id', recipient.id)
      result.failed++
      result.errors.push({ phone: recipient.phone_number, error: error.message })
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => lane()))

if (aborted) {
  // Account untouched recipients as skipped and bubble up so processJob requeues.
  // Safe under concurrency because of the FIX-3 idempotency re-read on replay.
  result.skipped += Math.max(0, recipients.length - (result.sent + result.failed + result.skipped))
  throw new Error('Circuit breaker OPEN')
}
```

The `increment_campaign_sent` rpc (`campaign-processor.ts:600–605`) and `return result` stay as-is.
`result.sent++`/`failed++`/`skipped++` are touched concurrently; Node is single-threaded and `++`
between awaits is atomic at the microtask level, so no lock is needed.

### Config / env
- New env `WA_DISPATCH_CONCURRENCY` (default 8). **Kill-switch = `1`** → single lane, bucket-paced.
  **[FIX-9]:** this is *not* byte-for-byte legacy — it also drops the trailing `getRecommendedDelay()`
  sleep, so per-message timing differs from today's serial loop. Mirrors the repo's
  `ENABLE_ASYNC_WEBHOOK !== 'true'` canary pattern (`cloud/webhook/route.ts:106`).
- Document in `worker/` env setup (`worker/campaign-worker.ts`). No `vercel.json` change (worker-only path).

### Rollout & feature-flagging
0. **Land Phase 0 first.** Verify its peek/commit, atomic breaker, error pipeline, and idempotency
   helper are merged and tested on the branch. **Do not start Phase 1 rollout otherwise.**
1. Ship with `WA_DISPATCH_CONCURRENCY=1` on the worker (single-lane, bucket-paced — safe deploy).
2. Canary one org/instance at `4`, watch MPS + Meta 429/80007 (now real via Phase 0 error pipeline,
   `rate-limiter.ts:160–185`) + p99 send latency + **duplicate-send rate** for 24h.
3. Ramp `8`. With bucket capacity corrected to `targetMPS` ([FIX-5]) the bucket is now a true cap;
   concurrency just decides how fast we reach it. Upper bound governed by tier; no need to exceed
   `~ceil(targetMPS*RTT)` lanes (and never beyond what keeps peak in-flight ≤ targetMPS).

### Test plan (vitest)
Add `describe('processBatch — parallel dispatcher')` to `campaign-processor.test.ts` (mocks
`./rate-limiter`, `./circuit-breaker`, `./meta-api`, `./opt-out-guard`, `@/lib/supabase-admin`):
- **Concurrency bounded:** instrument `sendTemplateMessage` to track in-flight count; peak ≤ `dispatchConcurrency`.
- **All recipients sent once:** 50 recipients, gate allows; `result.sent===50`, each id UPDATEd once.
- **Backpressure, no busy-spin, with backoff ([FIX-6]):** peek denies once with `retryAfter` then
  allows; assert sleep awaited with **jittered/growing** delay and recipient still sent.
- **Breaker OPEN aborts batch:** `canExecute` false after K sends → `throw 'Circuit breaker OPEN'`,
  remainder `skipped`.
- **Idempotent replay ([FIX-3]):** seed some recipients as already `sent`; assert they are **skipped**,
  never re-sent (`sendTemplateMessage` not called for them).
- **Per-recipient failure isolation:** one `sendTemplateMessage` rejection → that one `failed`
  (`recordError`+`recordFailure` called), rest `sent`.
- **Kill-switch ([FIX-9]):** `WA_DISPATCH_CONCURRENCY=1` → peak concurrency exactly 1.

**[FIX-8] Real-Redis concurrency test (new `*.concurrency.test.ts`):** drive N lanes against the
**real** rate-limiter + circuit-breaker (real Upstash test instance or atomic fake-Redis). Assert:
(i) daily quota / pair tokens consumed **exactly once per sent** (catches [FIX-1]); (ii) HALF_OPEN
admits ≤ `halfOpenMaxCalls` total across N lanes (catches [FIX-2]); (iii) under interleaved
success/failure the breaker still opens at `failureThreshold` (catches [FIX-4]). The mocked unit
tests above **cannot** catch these — they stub the exact code under race.

Run: `npx vitest run src/lib/whatsapp/campaign-processor.test.ts`, then `npx vitest run src/lib/whatsapp`.

### Observability
Emit one `wlog.info('whatsapp.campaign.batch_dispatched', { campaign_id, batch_index, concurrency,
sent, failed, skipped, duration_ms })` just before `return result` (`wlog` already used here, e.g.
`:423`). Seed for Phase 7 dashboards. The `console.log` job-duration line in `processJob` (`:464`) stays.

### Rollback
Set `WA_DISPATCH_CONCURRENCY=1` (single-lane). Full revert = revert the single `processBatch` commit.
Blast radius contained to one method. (Phase 0 primitives are independent and stay.)

### Ordering / deps vs other phases — **CORRECTED**
- **Phase 0 → Phase 1 (HARD PREREQUISITE).** Reverses the v1 "Phase 1 first / independent" claim.
  Phase 1 consumes Phase 0's peek/commit `canSend`, atomic breaker, error pipeline, and idempotency
  helper. Shipping Phase 1 without them turns C1/C2/C3 into live duplicate-send and endpoint-blast bugs.
- **Phase 2** (collapse `canSend` to 1 round-trip / fix bucket capacity, [FIX-5]) lands before or after;
  Phase 1 treats the pacing gate via the Phase 0 peek/commit contract.
- **Phase 3 (QStash, many workers):** in-flight cap is **per-worker**; global MPS still enforced by the
  shared Redis bucket → correct by construction.
- **Phase 4 (TIER_CONFIG + daily=unique-recipients):** changes the *meaning* of the daily check, not
  the gate contract → no impact here.
- **Phases 5/6/7:** orthogonal. Phase 7 builds on `batch_dispatched`.

### Risks & mitigations
- **R1 — Overshoot MPS / Meta bans.** Mitigated by bucket capacity = `targetMPS` ([FIX-5]) **and** lane
  cap; trailing fixed sleep removed (was never the real throttle). Canary watches 429/80007.
- **R2 — Busy-spin on throttle.** Jittered exponential backoff ([FIX-6]), bounded by `maxCanSendRechecks`.
- **R3 — Lost breaker abort.** Shared `aborted` flag + post-pool `throw` reproduces old requeue path,
  now safe via [FIX-3].
- **R4 — Quota/token burn on recheck.** Eliminated by peek/commit ([FIX-1]); fallback re-checks only
  the non-consuming gate.
- **R5 — Half-recovered endpoint blast.** Atomic/serialized HALF_OPEN admission ([FIX-2]).
- **R6 — Duplicate sends on requeue.** Idempotency re-read ([FIX-3]).
- **R7 — Breaker never opens under load.** Atomic counters ([FIX-4]); low canary concurrency until Phase 0.
- **R8 — Blind backpressure.** Real `error.code` after Phase 0 ([FIX-7]).
- **Blast radius:** one method on the Railway worker only; instant env kill-switch.

---

## B) EXECUTION PROMPT

> You are implementing **Phase 1 of a WhatsApp scale-up** on branch
> `claude/debug-console-error-FWrLE`. Work ONLY on that branch.
>
> **⛔ HARD PREREQUISITE — PHASE 0 MUST BE MERGED FIRST.** Before writing any Phase 1 code, confirm
> Phase 0 has delivered on this branch: (a) a **non-consuming `canSend` peek + separate commit**;
> (b) an **atomic circuit-breaker** (atomic HALF_OPEN admission, atomic failure/success counters);
> (c) the **Meta error-code pipeline** (`error.code` populated from Meta responses, not `UNKNOWN`);
> (d) a **shared recipient-idempotency helper** that re-reads live status filtered to
> `pending`/`queued`. If any are missing, use the corresponding mandatory fallback from the
> "Phase 0 dependency map" in section A — and **never** ship without at least the idempotency re-read.
>
> **Goal:** Replace the serial `for + sleep` loop in `processBatch` with a bounded-concurrency,
> per-worker dispatcher. The Redis token bucket (capacity corrected to `targetMPS`) is the pacing
> authority, gated via the Phase 0 peek/commit contract. Do not change the queue, the worker loop,
> opt-out, or backoff modules. Do **not** re-implement Phase 0's primitives — consume them.
>
> **File to edit:** `src/lib/whatsapp/campaign-processor.ts` (and its colocated tests + a new
> `*.concurrency.test.ts`).
>
> **Current code anchors (read first via
> `git show claude/debug-console-error-FWrLE:src/lib/whatsapp/campaign-processor.ts`):**
> - `CAMPAIGN_CONFIG` ~:25 (`batchSize:100`, `maxParallelBatches:5` UNUSED — leave alone, `targetMPS:70`).
> - `processBatch` ~:484; serial loop `for (const recipient of recipients)` ~:498 → `increment_campaign_sent` rpc ~:600.
> - `recipients` is destructured from the **job payload** at ~:485 — the `pending`/`queued` filter is
>   ONLY at campaign-build time (`.in('status', ['pending','queued'])` ~:673); a requeued job replays
>   the original snapshot. **This is why the idempotency re-read is mandatory (FIX-3/C3).**
> - In the loop, in order: `requireOptIn` (~:502) → `circuitBreaker.canExecute()` OPEN→`throw` (~:521)
>   → `rateLimiter.canSend()` single recheck (~:529) → `buildTemplateComponents` (~:548) →
>   `whatsAppRetry(() => sendTemplateMessage(...))` (~:551) → UPDATE `sent` + `recordSuccess()` (~:560)
>   → `await sleep(rateLimiter.getRecommendedDelay())` (~:575) → `catch`:
>   `recordError`→`recordFailure`→UPDATE `failed` (~:577).
> - Underlying race facts to respect: `canSend` consumes daily quota (`rate-limiter.ts:128`,
>   `redis.incr(dailyKey)`) and a pair token (`rate-limiter.ts:116`, `pairLimiter.limit`) on EVERY
>   call → never loop a consuming `canSend` (FIX-1). `circuit-breaker.ts:105-112` HALF_OPEN is
>   read-then-incr → use atomic/serialized admission (FIX-2). Bucket is
>   `tokenBucket(targetMPS,'1 s',config.mps)` (`rate-limiter.ts:65`) → capacity is full tier MPS, so cap
>   capacity or lanes (FIX-5).
>
> **Edits:**
> 1. In `CAMPAIGN_CONFIG` add `dispatchConcurrency: Number(process.env.WA_DISPATCH_CONCURRENCY ?? 8)`,
>    `maxCanSendRechecks: 20`, `recheckBackoffBaseMs: 250`, `recheckBackoffMaxMs: 8000`, with a comment
>    that `=1` is single-lane/bucket-paced (NOT byte-for-byte legacy — FIX-9).
> 2. Rewrite `processBatch` from the `for` loop (~:498) up to (but NOT including) the
>    `increment_campaign_sent` rpc, as a fixed-size async worker-pool of `dispatchConcurrency` lanes
>    over a shared `cursor`. Each lane runs `sendOne(recipient)` with these differences from the old loop:
>    - **(FIX-3) FIRST**, re-read live recipient status (Phase 0 helper or inline
>      `select('status').eq('id', recipient.id)` filtered to `pending`/`queued`); if not pending,
>      `result.skipped++` and return — never re-send.
>    - Remove the trailing `await sleep(rateLimiter.getRecommendedDelay())`.
>    - **(FIX-1)** Gate via the Phase 0 **peek** (`canSendPeek`); on the decision to send, **commit
>      once** (`canSendCommit`). NEVER loop a consuming `canSend`. Fallback (no peek): re-check only the
>      throttle/throughput gate, never the daily `incr` or pair `limit`.
>    - **(FIX-6)** On deny, sleep `min(maxBackoff, base*2^i) + random(0, base)` (jittered exponential),
>      bounded by `maxCanSendRechecks`; no busy-spin.
>    - **(FIX-2)** Breaker admission via Phase 0 atomic `canExecute`, or a serialized single-flight
>      fallback. On OPEN: set shared `aborted = true` and return (do not throw inside the lane).
>    - Keep `recordSuccess` after the successful UPDATE; in the `catch`:
>      `recordError`→`recordFailure`→failed-UPDATE→`result.failed++`/`errors.push`. (Note FIX-7:
>      `error.code` is real only after Phase 0's pipeline; otherwise `UNKNOWN`.)
>    - After `await Promise.all(lanes)`: if `aborted`, add remaining recipients to `result.skipped` and
>      `throw new Error('Circuit breaker OPEN')` (so `processJob` requeues — safe because of FIX-3).
>    - Clamp: `Math.max(1, Math.min(dispatchConcurrency, recipients.length))`.
> 3. Keep `increment_campaign_sent` rpc and `return result` unchanged. Add one
>    `wlog.info('whatsapp.campaign.batch_dispatched', { campaign_id, batch_index: data.batchIndex,
>    concurrency, sent, failed, skipped, duration_ms })` before `return result`.
>
> Use the section-A sketch as the structural guide.
>
> **Tests** — add `describe('processBatch — parallel dispatcher')` to `campaign-processor.test.ts`:
> (a) peak concurrency ≤ `dispatchConcurrency`; (b) 50 recipients all sent, each UPDATEd once;
> (c) peek denies once then allows → recipient sent, **jittered/growing** sleep awaited;
> (d) breaker OPEN after K → throws `'Circuit breaker OPEN'`, remainder `skipped`;
> (e) **(FIX-3)** recipients pre-seeded as `sent` are skipped, `sendTemplateMessage` NOT called for them;
> (f) one `sendTemplateMessage` rejection → that one `failed` (+`recordError`/`recordFailure`), others sent;
> (g) `WA_DISPATCH_CONCURRENCY=1` → peak concurrency exactly 1.
> **(FIX-8) Add a new `*.concurrency.test.ts`** driving N lanes against the **real** rate-limiter +
> circuit-breaker (real test Redis or atomic fake): assert daily/pair consumed exactly once per sent
> (FIX-1), HALF_OPEN admits ≤ `halfOpenMaxCalls` across N lanes (FIX-2), and the breaker still opens at
> `failureThreshold` under interleaved success/failure (FIX-4).
>
> **Commands:** `npx vitest run src/lib/whatsapp/campaign-processor.test.ts`;
> `npx vitest run src/lib/whatsapp`; `npx tsc --noEmit`.
>
> **Acceptance:** Phase 0 confirmed present (or fallbacks applied); all whatsapp tests green;
> type-check clean; idempotent replay never re-sends `sent` rows; no quota/token burn on recheck;
> HALF_OPEN admission bounded under concurrency; breaker opens reliably under load; `=1` is single-lane
> bucket-paced; per-recipient error handling and `recordSuccess`/(`recordError`→`recordFailure`)
> ordering preserved; no busy-spin (jittered backoff).
>
> **Do NOT:**
> - Do NOT ship Phase 1 before Phase 0, and do NOT re-implement Phase 0's primitives — consume them.
> - **Do NOT loop a consuming `canSend`** (FIX-1) — peek to gate, commit once.
> - **Do NOT skip the idempotency re-read** (FIX-3) — a requeued job replays already-`sent` rows.
> - Do NOT rely on read-then-incr HALF_OPEN admission (FIX-2) — atomic or serialized only.
> - Do NOT describe the token bucket as a hard cap without capacity = `targetMPS` or a lane cap (FIX-5).
> - Do NOT claim `=1` is byte-for-byte legacy parity (FIX-9).
> - Do NOT validate concurrency safety with mock-only tests (FIX-8) — add the real-Redis race test.
> - Do NOT modify `rate-limiter.ts`/`circuit-breaker.ts` in Phase 1 (those edits belong to Phase 0),
>   `queue.ts`/`worker/*` migration (Phase 3), `TIER_CONFIG`/daily (Phase 4), `meta-api.ts` (Phase 5),
>   media (Phase 6), or broad observability (Phase 7).
> - Do NOT repurpose `maxParallelBatches`; do NOT change `processJob`, `startWorker`, the queue, or `vercel.json`.
