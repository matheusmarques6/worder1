# Phase 0 — Foundations (PREREQUISITE for all concurrency work)

Branch: `claude/debug-console-error-FWrLE`. Code read via `git show <branch>:<path>`.

> **Why this phase exists.** It was not in the original 7-phase plan. Three independent adversarial reviews (Phases 1, 2, 4) each discovered the same thing: the WhatsApp send path's shared Redis primitives — the rate limiter and the circuit breaker — do **non-atomic read-modify-write**, and the Meta error-code pipeline is **dead**. Phases 1 (in-worker concurrency) and 3 (many stateless QStash workers) are unsafe to ship until these are fixed, and several phases (1, 5, 7) depend on the error pipeline. No existing phase owned the circuit-breaker fix or the `recordError` code-set fix — they fell through the cracks. Phase 0 owns them.
>
> **Nothing downstream ships until Phase 0 lands.** It is small, surgical, and high-leverage.

This phase has four workstreams. 0A and 0D are the deepest; 0B and 0C are contained.

---

## 0A — Atomic, non-consuming `canSend` (the rate limiter)

**Problem (grounded).** `rate-limiter.ts:canSend` (:82-151) is not a pure predicate: it `redis.incr`s the daily counter (:128) and consumes a pair-rate sliding-window token (:116) on **every** call, across ~4 sequential non-atomic round-trips. Two failure modes under concurrency:
- The Phase-1 dispatcher re-checks `canSend` up to N×20 times on throttle → **burns daily quota and pair-rate tokens** on denied attempts (Phase 1 C1).
- N concurrent callers each pass the token bucket within the same window → **burst overshoot** beyond MPS (Phase 1 H2 / Phase 2 C1).

**This is Phase 2's "atomic canSend" work** — see `phase2-cansend-1rt.md` (v2) for the full Lua design and its own fixes (no refill-write on block; fail-closed on parse anomaly; daily check inside the eval so blocked attempts don't burn a slot; same throughput key across canary). Phase 0 requires `canSend` to expose, in addition:

- **A non-consuming `peek()` vs a consuming `commit()`** (or a single eval that only mutates state on grant). The dispatcher (Phase 1) must be able to ask "can I send?" without spending a token when the answer is "wait." This is the contract Phase 1 C1 needs.
- **Burst cap:** set the token-bucket capacity to `targetMPS` (not full tier `mps`) so an idle bucket cannot grant a full-tier burst the instant the inter-batch gap ends (Phase 1 H2).

**Acceptance:** a denied `canSend`/`peek` mutates no daily or pair-rate state; aggregate sends across N lanes never exceed `targetMPS` in any 1s window (load test).

---

## 0B — Atomic circuit breaker

**Problem (grounded, `circuit-breaker.ts`).** Every transition is a non-atomic read-then-write:
- `canExecute()` HALF_OPEN admission (:96-110): `get halfOpenCalls` → compare `>= halfOpenMaxCalls (3)` → `incr`. Under N=8 lanes all 8 read `0`, all pass `< 3`, all `incr` → **8 test calls blast a half-recovered Meta endpoint** instead of 3 (Phase 1 C2).
- `recordFailure` (:146-175) CLOSED path: `incr failures` → check `>= threshold`. `recordSuccess` (:121-141) CLOSED path: `set failures '0'`. A success's `set 0` interleaving between failures **resets the count so the breaker never opens** during a real outage (Phase 1 H1).
- `getState()` OPEN→HALF_OPEN transition (:75-85) is itself a read-modify-write that N callers run concurrently.

**Fix.** Move the admission and the failure/success accounting into **atomic Redis operations** — either Lua `EVAL`s or careful `INCR`-and-compare with no separate read:
- HALF_OPEN admission: `INCR halfOpenCalls` first, then admit iff the returned value `<= halfOpenMaxCalls` (atomic test-and-increment; the increment is the gate). Decrement/compensate is unnecessary because the counter resets on state change.
- Failure accounting: do the threshold check on the value returned by `INCR failures` (already correct in `recordFailure`), but make the CLOSED-success reset not clobber an in-flight open decision — gate the `set failures '0'` behind a state guard inside one eval, or use a short sliding-window failure count instead of a resettable counter.
- State read+transition: one eval that reads state, checks the reset timeout, and writes HALF_OPEN atomically.

**Scope note.** Neither Phase 1 nor Phase 2 was allowed to touch `circuit-breaker.ts` — that is exactly why this is a Phase 0 item. Keep the public interface (`canExecute`/`recordSuccess`/`recordFailure`/`execute`) identical so callers (campaign-processor) are unchanged.

**Acceptance:** with N concurrent lanes, HALF_OPEN admits at most `halfOpenMaxCalls`; a sustained failure stream opens the breaker even when interleaved with occasional successes (concurrency test against a real/fake Redis).

---

## 0C — Meta error-code pipeline (unblocks Phases 1, 5, 7)

**Problem (grounded).** The campaign sender uses the raw `meta-api.ts` client, which throws a **bare `Error` with no `.code`**: `throw new Error(data.error?.message || ...)` (`meta-api.ts:118`). So in the campaign catch (`campaign-processor.ts:577-592`):
- `rateLimiter.recordError(error.code || 'UNKNOWN')` (:580) → always `'UNKNOWN'`,
- `error_code: ... || 'UNKNOWN'` (:588) → column is ~all `UNKNOWN`.

Consequence: **the throttle ladder never fires** (recordError's `rateLimitCodes` set never matches), Phase 1's 429 backpressure is blind, and Phase 7's error breakdown + alerts are non-functional. Even Phase 5 (route through `WhatsAppCloudError`, which has a numeric `.code`) is **incomplete on its own** because `recordError`'s set (`rate-limiter.ts:165-166`) **lacks code `4`** — Meta's most common rate-limit code (`WhatsAppCloudError.isRateLimited` = `4 || 80007`).

**Fix (two small edits, owned here so no phase ships a half-fix):**
1. **Populate `.code` at the throw site.** Either parse `data.error?.code` into the thrown error in `meta-api.ts` (cheapest, unblocks before the full Phase 5 client unification), or land Phase 5's routing through `WhatsAppCloudAPI`. Phase 0 only requires that the error reaching the campaign catch carries a numeric `.code`.
2. **Add the missing codes to `recordError`'s `rateLimitCodes`** (`rate-limiter.ts:165-166`): add `'4'`, and the marketing/throughput codes `'130429'`, `'131048'`, `'131049'` so the throttle ladder actually engages.

**Acceptance:** a simulated Meta `code:4` rate-limit error increments the throttle ladder and (after threshold) throttles the instance; `whatsapp_campaign_recipients.error_code` shows real numeric codes, not `UNKNOWN`.

---

## 0D — Shared recipient-idempotency helper (unblocks Phases 1, 3, 6)

**Problem (grounded).** Three phases independently hit the same outbound-double-send gap, because the Meta send (`campaign-processor.ts:550`) and the `status='sent'` write (:562-569) are **not atomic**, and a re-driven batch carries its **original** recipient array:
- Phase 1 C3: on circuit-breaker abort, the requeued batch re-sends already-`sent` recipients (the `pending/queued` filter only applies on a fresh `getRecipients`, not on job replay).
- Phase 3: a worker that crashes after Meta accepts but before the `sent` commit leaves the recipient `pending` → re-drive double-sends (Meta has no send idempotency key).
- Phase 6 C2: a stale Media ID on re-drive.

**Fix — one shared helper, used by every send path:**
1. **`sending` pre-mark.** Before the Meta call, optimistically transition the recipient `pending/queued → sending` (`.update(...).in('status',['pending','queued']).select('id').maybeSingle()`); if no row comes back, someone else has it — skip. Requires adding `sending` to the `whatsapp_campaign_recipients` status CHECK + a `sending_at` column (tiny migration).
2. **Re-read on (re)processing.** Any batch (re)processing must re-read recipients by ID filtered to `status IN ('pending','queued')` — never trust a snapshot array. This makes `increment_campaign_sent` (:600) a correct running sum across re-drives.
3. **Quarantine sweep.** A cron flips `sending` rows older than ~10 min → `failed` with `error_message='ambiguous_send_quarantine'` for manual review. Bias: a rare crashed-mid-send recipient is left unsent-and-flagged rather than risk a duplicate — correct for marketing.

**Acceptance:** processing the same batch twice sends each recipient at most once; a crash injected between Meta-accept and `sent`-commit leaves the recipient `sending` (not re-sent), surfaced by the sweep.

---

## Sequencing & ownership

| Workstream | Absorbs / unblocks | Migration? |
|---|---|---|
| 0A atomic non-consuming canSend | folds Phase 2; unblocks Phase 1, 3 | no (Redis only) |
| 0B atomic circuit breaker | orphan (no phase owned it); unblocks Phase 1, 3 | no |
| 0C error-code pipeline | partial Phase 5; unblocks Phase 1, 7 | no |
| 0D idempotency helper | unblocks Phase 1 (C3), 3, 6 | yes — `sending` status + `sending_at` |

**Global order:** `Phase 0 → 4 → 1 → 3 → 5(client unification) + 6 → 7`. See `README.md`.

**Test bar for the whole phase:** every workstream needs a concurrency test against a real or faked Redis (`ioredis-mock` / Upstash dev) — the existing tests mock these modules and therefore cannot catch the very races Phase 0 fixes (Phase 1 L1, Phase 2 M3).

---

## Execution prompt (fresh coding agent)

> **Branch:** `claude/debug-console-error-FWrLE`. Implement the four workstreams above in one coordinated PR (they share the concurrency-test harness).
> **0A:** extend `rate-limiter.ts` so `canSend` is atomic (per `phase2-cansend-1rt.md` v2) AND exposes a non-consuming check; set token-bucket capacity = `targetMPS`. **0B:** make `circuit-breaker.ts` `canExecute` HALF_OPEN admission and `recordFailure`/`recordSuccess` accounting atomic (Lua/INCR-and-compare), public interface unchanged. **0C:** ensure the error reaching `campaign-processor.ts:577` carries numeric `.code` (parse `data.error.code` in `meta-api.ts` or land Phase 5 routing) and add `'4','130429','131048','131049'` to `rate-limiter.ts` `rateLimitCodes` (:165-166). **0D:** add `sending` status + `sending_at` to `whatsapp_campaign_recipients` (migration); add a shared helper that pre-marks `sending` before the Meta send and re-reads recipients filtered to `pending/queued`; add a quarantine sweep to a cron.
> **Acceptance:** the four per-workstream acceptance criteria above, each covered by a concurrency test against a real/fake Redis.
> **DO NOT:** change any caller's public interface; ship any workstream without its concurrency test; fail-open on a rate-limiter eval anomaly; mark a recipient `sent` before the Meta call returns.
