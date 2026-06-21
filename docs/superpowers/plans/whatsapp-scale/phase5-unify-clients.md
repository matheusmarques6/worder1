# Phase 5 (v2) — Unify WhatsApp send clients on `cloud-api.ts`

Branch to plan/execute against: `claude/debug-console-error-FWrLE`.
Scope: retire the raw `meta-api.ts` send path so every WhatsApp send flows through
`WhatsAppCloudAPI` (one send path, one retry/error policy). **Lands AFTER Phase 0.**

---

## v2 changelog (adversarial-review fixes folded in)

- **[FIX-1] (C1, CRITICAL) — the error-code fix is NOT Phase 5's, and v1's was incomplete.**
  v1 claimed routing campaigns through cloud-api would "finally feed real numeric codes to the
  rate limiter, activating the throttle ladder." That is only **half** true and the other half was
  self-contradictory. `WhatsAppCloudError.isRateLimited()` returns true for code `4 || 80007`
  (cloud-api.ts:676-678), but `rate-limiter.recordError`'s throttle set is
  `['429', '80007', '130429', '131056']` (rate-limiter.ts:165) — it **lacks `'4'`**, Meta's most
  common rate-limit code. So even with a real `WhatsAppCloudError` flowing into
  `recordError(error.code)`, a stream of code-`4` rate limits would **still never** trip the
  10/20/50 throttle ladder. v1 then forbade touching `rate-limiter.ts` in its own DO-NOTs —
  directly contradicting its stated objective. **Resolution:** the `data.error.code` parse and the
  `rateLimitCodes` set extension (add `'4'`, `'130429'` already present, plus `'131048'`/`'131049'`
  to cover spam/frequency-cap) are owned by **Phase 0 (Foundations)**. Phase 5 **depends on Phase 0**
  and makes **no standalone claim** to fix the throttle ladder. Phase 5's only contribution to the
  error pipeline is structural: it routes campaign sends through the client that throws a
  `WhatsAppCloudError` carrying `.code` at all (raw `sendTemplateMessage` throws a bare `Error`,
  meta-api.ts:118). Phase 0 makes that `.code` correct and makes the limiter act on it.

- **[FIX-2] (H1) — retry budget CHANGES; it is not "equivalent."** Stated explicitly below in A.3a.
  The old external `createWhatsAppRetry`/`defaultShouldRetry` retried 131047, 131026, and 131031;
  cloud-api's `request()` `shouldRetry` retries **none** of those and fails them fast. This is a
  deliberate behavioral delta, not a no-op. Fail-fast-on-permanent is confirmed intended.

- **[FIX-3] (H2) — per-recipient accounting shift, decided NOW (not deferred).** Permanent errors
  that the old path retried 5× (in-process) now surface on the first attempt. We special-case
  terminal `WhatsAppCloudError`s (`isInvalidRecipient`, `isTemplateNotApproved`, `isWindowExpired`)
  as terminal → `skipped`/`failed` **without** incrementing `retry_count`, so retry_count semantics
  don't silently change. See A.5.

- **[FIX-4] (H3) — hoist client construction out of the per-recipient loop.** `createWhatsAppCloudClient`
  is built **once per batch** (the `instance` phoneNumberId/accessToken are constant across the
  batch), not per recipient. See A.5.

- **[FIX-5] (M2) — don't oversell breaker behavior.** `circuitBreaker.recordFailure(error)`
  (circuit-breaker.ts:143) ignores `error.code` entirely; it keys only off the failure event /
  `.message`. Breaker behavior is **identical** before and after this phase. v1's "feeds real codes
  to the circuit breaker" line is removed.

- **[FIX-6] (M4) — the two `normalizePhone` implementations differ; flagged as accepted risk.**
  meta-api's `normalizePhone` (meta-api.ts:268) is a hand-rolled BR prefixer (strip non-digits,
  drop leading `0`, prepend `55` for 10/11-digit numbers). cloud-api's `normalizePhone`
  (cloud-api.ts:721) uses `libphonenumber-js` with default country `BR`. For most well-formed
  Brazilian numbers these agree, but **edge numbers** (already-`+`-prefixed, non-BR, malformed,
  or unusual lengths) can produce a **different `to`** → different delivery / invalid-recipient
  outcomes. See A.4a — verify against real campaign phone data or accept explicitly.

- **CONFIRMED-GOOD (kept, not re-litigated):**
  - Return shape preserved: both paths surface `messages[0].id`; cloud-api `sendTemplate` returns
    `SendMessageResult` with `messages: Array<{id}>` (cloud-api.ts:25), and the call site reads
    `sendResult.messages?.[0]?.id` unchanged.
  - Call-site map accurate: only `campaign-processor.ts` (runtime) and `campaign-processor.test.ts`
    (mock) import the meta-api **send** fns; `src/lib/meta-api.ts` (Ads client) is unrelated;
    `route.ts`'s `sendTemplateMessage` is a local fn, not the meta-api export. Deleting the 4
    meta-api send fns + the `sendMessage` switch is safe.
  - Phase 6 media stays pluggable: header media lives only inside the `components` array built by
    `buildTemplateComponents`; the `sendTemplate(...)` call is untouched.

---

## A) IMPLEMENTATION PLAN

### A.1 Objective
Today there are **two** send stacks with **two** retry/error policies:

- **(cloud)** `WhatsAppCloudAPI` (`src/lib/whatsapp/cloud-api.ts`): `request()` wraps every call in
  `withRetry` (maxRetries 5, decorrelated jitter), parses `Retry-After` → `err.retryAfterMs` →
  `getDelayOverride`, throws `WhatsAppCloudError` with numeric `.code` and predicates
  (`isRateLimited` 4/80007, `isWindowExpired` 131047, `isInvalidRecipient` 131026,
  `isTemplateNotApproved` 132012, `isAuthError` 190/102/200, …). Used 1:1 by
  `scheduled-message-sender.ts`, `message-service.ts`, cloud routes.
- **(raw)** `meta-api.ts`: bare `fetch` fns (`sendTextMessage`, `sendMediaMessage`,
  `sendTemplateMessage`, `sendInteractiveMessage`) that `throw new Error(data.error?.message)`
  — **no `.code`, no internal retry**. Only `campaign-processor.ts` wraps retry *externally* via
  `createWhatsAppRetry` from `backoff.ts`.

**The fix is to route the campaign template send through `WhatsAppCloudAPI.sendTemplate`.** This
is a de-duplication: one send path, one retry policy, and a thrown error that actually carries
`.code`. It is **not, by itself, the throttle-ladder fix** — see A.1a.

### A.1a Relationship to Phase 0 (READ FIRST — dependency)
**Phase 0 (Foundations) owns the Meta error-code pipeline fix.** Two changes live there, not here:

1. Parse `data.error.code` into the thrown error at the API boundary (so `.code` is the real Meta
   numeric code, not `0`/undefined). In cloud-api this already happens —
   `new WhatsAppCloudError(data.error || …)` and `this.code = error.code || 0` (cloud-api.ts:97,
   :669) — Phase 0 ensures the boundary consistently populates it.
2. Extend `rate-limiter.recordError`'s `rateLimitCodes` set. Today it is
   `['429', '80007', '130429', '131056']` (rate-limiter.ts:165). **It is missing `'4'`** — Meta's
   single most common rate-limit code, and the exact code `isRateLimited()` keys on. Phase 0 adds
   `'4'` (plus `'131048'` spam-rate-limit and `'131049'` frequency-cap so the ladder reflects all
   throttle-class errors). Without this, routing code-`4` rate limits into `recordError` still
   never trips the 10/20/50 throttle ladder.

**Therefore:** Phase 5 must merge **after** Phase 0, and Phase 5's PR description must **not** claim
it fixes the throttle ladder. Phase 5 makes campaigns throw `WhatsAppCloudError` with a `.code`;
**Phase 0** makes that `.code` correct and makes the limiter act on code `4`. Both are required for
the throttle ladder to actually fire for campaigns. (Verification: with only Phase 5 merged, a
campaign hitting code-`4` rate limits would record `recordError(4)` but never throttle, because
`'4' ∉ rateLimitCodes` — this is the dead-path bug Phase 0 closes.)

### A.2 Full call-site map (CONFIRMED)
**meta-api.ts send-fn importers across the branch** — only the campaign + its test:
| File | Symbol | Kind |
|---|---|---|
| `src/lib/whatsapp/campaign-processor.ts:11,551` | `sendTemplateMessage` | **runtime send — MIGRATE** |
| `src/lib/whatsapp/campaign-processor.test.ts:41` | `vi.mock('./meta-api', …)` | test mock — update |
| `src/app/api/whatsapp/templates/route.ts:3,121` | `getTemplates` | read-only list — out of scope (A.6) |

`sendTextMessage` / `sendMediaMessage` / `sendInteractiveMessage` / `sendMessage` / `markAsRead`
(meta-api versions) have **zero** external importers. Other `sendMessage`/`markAsRead`/
`normalizePhone` grep hits are unrelated local definitions. `src/lib/meta-api.ts` is the **Ads**
client — unrelated. `route.ts`'s `sendTemplateMessage` is a **local** fn, not the meta-api export.
So the only live send dependency on meta-api is the campaign template send.

**cloud-api.ts (WhatsAppCloudAPI) consumers — canonical path, must NOT regress:**
| File | Use |
|---|---|
| `src/lib/whatsapp/scheduled-message-sender.ts` | `createWhatsAppCloudClient` → `sendText`/`sendTemplate` (1:1) |
| `src/lib/services/whatsapp/message-service.ts` | `new WhatsAppCloudAPI(...)` → send + `markAsRead` (inbox 1:1) |
| `src/app/api/whatsapp/cloud/messages/route.ts` | `createWhatsAppCloudClient`, `normalizePhone` |
| `src/app/api/whatsapp/cloud/conversations/route.ts` | `client.markAsRead` |
| `src/lib/whatsapp/opt-out-guard.ts` | `normalizePhone` only |

### A.3 Chosen approach + justification
**Route the campaign template send through `WhatsAppCloudAPI.sendTemplate`** and **delete meta-api's
send functions** (no shim needed — callers are fully migrated; compiler/tests catch any stray).

Why this is the clean fit:
- **Shape matches.** `sendTemplate(to, templateName, languageCode, components)` (cloud-api.ts:300)
  serializes the identical body meta-api builds (`type:'template'`, `template:{name,language:{code},
  components}`). The `components` array from `buildTemplateComponents` passes through **verbatim** —
  no transform. Header media stays inside `components` → media-agnostic, Phase 6 slots in.
- **Config maps 1:1.** `instance.phoneNumberId` / `instance.accessToken` →
  `createWhatsAppCloudClient({ phoneNumberId, accessToken })`.
- **One retry/error policy** (cloud-api's internal `withRetry`).

**Double-retry caution (must address):** cloud-api `request()` *already* retries internally
(maxRetries 5). The campaign currently *also* wraps `this.whatsAppRetry(() => sendTemplateMessage(...))`
(campaign-processor.ts:550). Keeping both → 5×5 retries and confused Retry-After honoring.
**Decision: drop the outer `this.whatsAppRetry` wrapper** and rely on cloud-api's internal retry.
`createWhatsAppRetry` then becomes unused in campaign-processor for the send — remove the
`private whatsAppRetry` field (campaign-processor.ts:95) and drop `createWhatsAppRetry` from the
`./backoff` import (campaign-processor.ts:10) **only if** nothing else in the file uses it (grep
first; keep `withRetry`/`sleep`).

### A.3a [FIX-2 / H1] Retry-budget delta — EXPLICIT, not "equivalent"
Dropping the outer wrapper does **not** preserve the old retry budget. The two policies differ:

| Meta code | Old `createWhatsAppRetry` / `defaultShouldRetry` | cloud-api `request().shouldRetry` | Delta |
|---|---|---|---|
| 4 / 80007 (rate limit) | retry | retry (`isRateLimited`) | same |
| 130429 / 131056 | retry | **130429: not retried**; 131056: not retried | **fewer retries** |
| 131048 (spam) / 131049 (freq) | via defaultShouldRetry → not explicit | retry (`isSpamRateLimited`/`isFrequencyCapped`) | **more correct** |
| 131047 (window expired) | **retry** (defaultShouldRetry) | **no retry** (permanent) | **fail-fast now** |
| 131026 (invalid recipient) | **retry** (defaultShouldRetry) | **no retry** (permanent) | **fail-fast now** |
| 131031 (msg failed) | **retry** (defaultShouldRetry) | **no retry** | **fail-fast now** |
| 5xx | retry | retry | same |
| auth 190/102/200 | 190 permanent (no retry) | no retry (`isAuthError`) | same |
| network (ETIMEDOUT/ECONNRESET/fetch failed) | retry | retry (`attempt < 5`) | same |

(Source: `defaultShouldRetry` + `createWhatsAppRetry` in backoff.ts; `request()` `shouldRetry` in
cloud-api.ts:126-145. Note cloud-api's `shouldRetry` retries **only** auth-fail-fast,
rate-limit/freq/spam, and 5xx — everything else returns `false`.)

**Confirmed intended:** retrying a window-expired (131047) or invalid-recipient (131026) send 5×
is wasted work — the outcome is deterministic and won't change on retry. Fail-fast-on-permanent is
the desired behavior. The behavioral consequence (those recipients resolve on attempt 1 instead of
after 5 attempts) is handled deliberately in A.5 [FIX-3].

### A.4 Affected files + anchors
1. `src/lib/whatsapp/campaign-processor.ts`
   - `:11` `import { sendTemplateMessage } from './meta-api'` → remove; add
     `import { createWhatsAppCloudClient, WhatsAppCloudError } from './cloud-api'`.
   - `:95` `private whatsAppRetry = createWhatsAppRetry({...})` → remove (and drop
     `createWhatsAppRetry` from the `:10` backoff import if otherwise unused).
   - hoist client construction to once per batch (A.5 / [FIX-4]).
   - `:543–561` `buildTemplateComponents(...)` + `this.whatsAppRetry(() => sendTemplateMessage({...}))`
     send block → replace (A.5).
   - `:578–600` catch block → add terminal-error special-casing (A.5 / [FIX-3]); keep
     `recordError`/`recordFailure` structurally intact.
2. `src/lib/whatsapp/campaign-processor.test.ts:41`
   - `vi.mock('./meta-api', …)` → `vi.mock('./cloud-api', …)` exposing
     `createWhatsAppCloudClient` returning `{ sendTemplate: vi.fn() }` and a `WhatsAppCloudError`
     class (and `normalizePhone` if the module pulls it).
3. `src/lib/whatsapp/meta-api.ts`
   - Delete the four send fns (`sendTextMessage`, `sendMediaMessage`, `sendTemplateMessage`,
     `sendInteractiveMessage`) and the `sendMessage` switch. **Keep** `getTemplates`,
     `downloadMedia`, `markAsRead`, `normalizePhone` exports. Default = conservative: keep non-send
     exports, drop send exports.

### A.4a [FIX-6 / M4] `normalizePhone` divergence — verify or accept
Routing through cloud-api means the `to` is normalized by **cloud-api's** `normalizePhone`
(`libphonenumber-js`, cloud-api.ts:721) instead of **meta-api's** hand-rolled BR prefixer
(meta-api.ts:268). They diverge on edge numbers:
- meta-api: strips non-digits, drops a single leading `0`, prepends `55` for **10 or 11** digit
  results, otherwise returns digits as-is. No validation — a malformed/foreign number passes through
  raw.
- cloud-api: `parsePhoneNumber(phone, 'BR')` → E.164 without `+`; on parse failure falls back to
  `phone.replace(/\D/g, '')`.

For canonical 10/11-digit BR mobiles they agree. They can differ for: already-`+55`-prefixed inputs,
non-BR numbers, numbers with unusual length, or inputs libphonenumber rejects. A different `to`
changes delivery / invalid-recipient outcomes.
**Action (do not skip):** sample the `phone_number` column for active campaigns and diff the two
normalizers over real data; if no edge cases, record "verified — no delta on real data." If edge
cases exist, decide per-case (cloud-api's libphonenumber normalization is the better long-term
target since all 1:1 traffic already uses it). Either way, **note the decision in the PR.**

### A.5 Code sketch — campaign send via unified client ([FIX-3], [FIX-4])
```ts
// campaign-processor.ts (top)
import { createWhatsAppCloudClient, WhatsAppCloudError } from './cloud-api'
// remove: import { sendTemplateMessage } from './meta-api'
// remove field: private whatsAppRetry = createWhatsAppRetry({...})

// [FIX-4] HOIST: build the client ONCE per batch, before the per-recipient loop.
// instance.phoneNumberId / instance.accessToken are constant across the batch.
const client = createWhatsAppCloudClient({
  phoneNumberId: instance.phoneNumberId,
  accessToken: instance.accessToken,
})

// ... inside the per-recipient loop:
const components = this.buildTemplateComponents(
  recipient.resolved_variables,
  mediaUrl,
  mediaType,            // Phase 6 swaps link->media id INSIDE buildTemplateComponents only
)

// cloud-api.request() handles retry + Retry-After internally — NO outer retry wrapper.
const sendResult = await client.sendTemplate(
  recipient.phone_number,
  template.name,
  template.language,
  components,
)
// sendResult.messages?.[0]?.id — same shape as before (SendMessageResult)
```
**[FIX-3 / H2] Catch block — special-case terminal errors as non-retryable.** Because cloud-api
now fails permanent errors fast (A.3a), a permanent failure surfaces on attempt 1. The OLD path
incremented `retry_count` once per batch-pass and marked `failed`; for terminal errors that will
never succeed, incrementing `retry_count` is misleading. Decide **now**: classify terminal
`WhatsAppCloudError`s and record them as terminal **without** bumping `retry_count`:
```ts
} catch (error: any) {
  console.error(`Failed to send to ${recipient.phone_number}:`, error.message)

  await rateLimiter.recordError(error.code || 'UNKNOWN') // real numeric code (Phase 0 makes it count)
  await circuitBreaker.recordFailure(error)              // [FIX-5] uses .message only — unchanged

  const isTerminal =
    error instanceof WhatsAppCloudError &&
    (error.isInvalidRecipient() ||   // 131026 — not a WhatsApp user / undeliverable
     error.isTemplateNotApproved() || // 132012 — template rejected
     error.isWindowExpired())         // 131047 — 24h window closed (terminal for THIS send)

  if (isTerminal) {
    // terminal: do NOT increment retry_count; invalid-recipient -> 'skipped', others -> 'failed'
    const status = error.isInvalidRecipient() ? 'skipped' : 'failed'
    await supabase.from('whatsapp_campaign_recipients').update({
      status,
      failed_at: new Date().toISOString(),
      error_code: error.code?.toString(),
      error_message: error.message,
      // retry_count intentionally left unchanged
    }).eq('id', recipient.id)
    if (status === 'skipped') result.skipped++; else result.failed++
  } else {
    // transient/unknown: preserve existing semantics (mark failed, bump retry_count)
    await supabase.from('whatsapp_campaign_recipients').update({
      status: 'failed',
      failed_at: new Date().toISOString(),
      error_code: error.code?.toString() || 'UNKNOWN',
      error_message: error.message,
      retry_count: (recipient.retry_count || 0) + 1,
    }).eq('id', recipient.id)
    result.failed++
    result.errors.push({ phone: recipient.phone_number, error: error.message })
  }
}
```
Rationale: `skipped` is already an existing status in this file (used for opt-out and pending
cleanup, campaign-processor.ts:331,512), so reusing it for invalid recipients is consistent.
Without this branch, `retry_count` semantics change silently (a permanent error that the old code
"retried" 5× in-process now reads as a single failure with `retry_count: 1`); FIX-3 makes the
classification explicit and stops bumping `retry_count` for deterministically-permanent failures.

### A.6 Out-of-scope but noted: `getTemplates`
`templates/route.ts` reads templates via meta-api `getTemplates`. `WhatsAppCloudAPI.listTemplates`
already covers this (pagination + retry). Migrating it is a trivial follow-up but is **not a send
path** and **not required** for Phase 5. Leave `getTemplates` in meta-api (migrate in a later,
clearly-scoped commit) to keep this change focused and reversible.

### A.7 Error-classification reference (informational — the limiter set itself is Phase 0's)
| Meta code | WhatsAppCloudError predicate | In limiter throttle set? | Retried by cloud-api? |
|---|---|---|---|
| 4 | isRateLimited | **needs Phase 0 to add `'4'`** | yes |
| 80007 | isRateLimited | yes (already) | yes |
| 131048 | isSpamRateLimited | Phase 0 adds | yes |
| 131049 | isFrequencyCapped | Phase 0 adds | yes |
| 130429 / 131056 | — | yes (already) | no |
| 131047 | isWindowExpired | no | **no (terminal)** |
| 131026 | isInvalidRecipient | no | **no (terminal)** |
| 132012 | isTemplateNotApproved | no | **no (terminal)** |
| 190/102/200 | isAuthError | no | no |
| 5xx | (HTTP status) | no | yes |

`circuit-breaker.recordFailure` (circuit-breaker.ts:143) ignores `.code` → **no breaker drift**
[FIX-5].

### A.8 Deprecation plan for meta-api
Phase 5 deletes the send fns (zero external importers besides campaign + its test). Non-send
helpers stay until a later cleanup phase migrates `templates/route.ts` to `listTemplates` and
deletes the file. Outright deletion of the send fns is cleaner than a shim; the compiler/tests
catch any stray importer.

### A.9 Test plan
- `campaign-processor.test.ts`: move mock from `./meta-api` to `./cloud-api`
  (`createWhatsAppCloudClient` → `{ sendTemplate: vi.fn().mockResolvedValue({ messages:[{id:'wamid'}] }) }`,
  plus a `WhatsAppCloudError` class). Assert `sendTemplate` is called with
  `(phone, template.name, template.language, components)`.
- **[FIX-2] test:** assert NO double-retry — a single thrown rate-limit error retries at the
  cloud-api layer only, and the catch is entered once after retries exhaust (the outer wrapper is
  gone).
- **[FIX-3] test:** throwing `new WhatsAppCloudError({code:131026})` marks the recipient `skipped`
  with `retry_count` **unchanged**; `{code:131047}`/`{code:132012}` mark `failed` with `retry_count`
  unchanged; a generic error still marks `failed` with `retry_count + 1`.
- **[FIX-1] guard (cross-phase):** assert `rateLimiter.recordError` receives the real numeric code
  (e.g. `4`) on a `WhatsAppCloudError({code:4})`. (The throttle-ladder activation itself is a
  Phase 0 test, since it depends on the Phase 0 `rateLimitCodes` change.)
- Run unchanged suites: `scheduled-message-sender.test.ts`, `campaign-recipient-status.test.ts`,
  `cloud-api-signature.test.ts` — expect green.
- Commands: `npm run test -- src/lib/whatsapp`, `npx tsc --noEmit`, `npm run lint`.

### A.10 Observability
cloud-api already emits `wlog.warn('whatsapp.api.retry', {attempt, delay_ms, code, status,
retry_after_ms})` inside `request()` (cloud-api.ts:153). Campaigns gain structured retry logs for
free (the old `whatsAppRetry` used `console.log`). Keep the campaign-level
`console.error('Failed to send …')`. Follow-up note: `whatsapp.api.retry` now also covers campaign
traffic.

### A.11 Ordering / dependencies
- **Phase 0 (Foundations): HARD DEPENDENCY.** Phase 5 merges AFTER Phase 0 (owns the
  `data.error.code` parse + `rateLimitCodes` set extension). See A.1a.
- **Phase 1 (dispatcher) / Phase 3 (QStash worker):** after this phase the canonical send is
  `client.sendTemplate(...)` — a plain awaitable returning `SendMessageResult`, no hidden state, no
  outer retry. Do this phase before/with Phase 1 & 3 so they wire onto the unified client.
- **Phase 6 (media pre-upload):** send interface stays media-agnostic; Phase 6 only changes
  `buildTemplateComponents`. No coupling.
- **Phase 2 (canSend) / Phase 4 (tiers):** unaffected.

### A.12 Risks + blast radius
- **1:1 regression:** NONE — 1:1 senders already use cloud-api and are not modified.
- **Retry-budget delta [FIX-2]:** intended; permanent errors fail fast. Documented A.3a.
- **retry_count semantics [FIX-3]:** addressed by terminal-error classification.
- **`normalizePhone` divergence [FIX-6]:** verify against real data or accept; document in PR.
- **Throttle ladder [FIX-1]:** does NOT activate from Phase 5 alone — requires Phase 0's
  `rateLimitCodes` including `'4'`. Do not claim otherwise.
- **Double-retry:** mitigated by removing the outer `whatsAppRetry` wrapper.
- **Blast radius:** 1 runtime file (`campaign-processor.ts`), 1 test, trim of meta-api send fns.
  Reversible by re-importing meta-api and restoring the wrapper.

---

## B) EXECUTION PROMPT (self-contained, for a fresh coding agent)

> **Branch:** `claude/debug-console-error-FWrLE`. Work only in `src/`.
> **PRECONDITION:** Phase 0 (Foundations) is merged — it owns the `data.error.code` parse and the
> `rate-limiter.recordError` `rateLimitCodes` set extension (adds `'4'`, `'131048'`, `'131049'`).
> **Do NOT** re-implement those here, and **do NOT** claim this phase fixes the throttle ladder.
>
> **Goal:** Route the WhatsApp campaign template send through `WhatsAppCloudAPI.sendTemplate`
> (`src/lib/whatsapp/cloud-api.ts`) instead of raw `sendTemplateMessage` from
> `src/lib/whatsapp/meta-api.ts`, inheriting cloud-api's internal `withRetry` + Retry-After +
> `WhatsAppCloudError` classification. 1:1 sending must not change.
>
> **Acceptance criteria:**
> 1. `campaign-processor.ts` no longer imports from `./meta-api`. It builds the client via
>    `createWhatsAppCloudClient({ phoneNumberId: instance.phoneNumberId, accessToken: instance.accessToken })`
>    **ONCE per batch, outside the per-recipient loop** ([FIX-4 / H3]), and calls
>    `client.sendTemplate(recipient.phone_number, template.name, template.language, components)`.
> 2. The outer `this.whatsAppRetry(() => ...)` wrapper around the send is **removed** (cloud-api
>    retries internally — no double-retry). Remove the `private whatsAppRetry = createWhatsAppRetry({...})`
>    field and drop `createWhatsAppRetry` from the `./backoff` import IF nothing else in the file
>    uses it (grep first; keep `withRetry`/`sleep`).
> 3. **[FIX-2 / H1] Accept the retry-budget delta.** cloud-api does NOT retry 131047/131026/131031
>    (the old path did). Do not try to re-add those retries — fail-fast on permanent errors is
>    intended.
> 4. **[FIX-3 / H2] Terminal-error classification in the catch block.** Keep
>    `rateLimiter.recordError(error.code || 'UNKNOWN')` and `circuitBreaker.recordFailure(error)`.
>    Then: if `error instanceof WhatsAppCloudError` and (`isInvalidRecipient()` ||
>    `isTemplateNotApproved()` || `isWindowExpired()`), mark the recipient terminal **without**
>    incrementing `retry_count` — `isInvalidRecipient()` → `status: 'skipped'`, the others →
>    `status: 'failed'`. All other errors keep the existing behavior (`status: 'failed'`,
>    `retry_count: (recipient.retry_count || 0) + 1`). See A.5 sketch.
> 5. **[FIX-5 / M2]** Do not add `.code`-based logic to the circuit breaker — `recordFailure`
>    ignores `.code`. Breaker behavior is unchanged.
> 6. **[FIX-6 / M4]** Before merge, diff meta-api's `normalizePhone` (hand-rolled BR prefixer,
>    meta-api.ts:268) vs cloud-api's `normalizePhone` (`libphonenumber-js`, cloud-api.ts:721) over a
>    real sample of campaign `phone_number` values. If no divergence, note "verified — no delta." If
>    divergence exists, decide and document in the PR. Do not silently change normalization.
> 7. `buildTemplateComponents(...)` is unchanged — header media stays inside the components array
>    (KEEP PLUGGABLE FOR PHASE 6: do not move media into the sendTemplate call).
> 8. `campaign-processor.test.ts:41`: replace `vi.mock('./meta-api', ...)` with a mock of
>    `./cloud-api` exporting `createWhatsAppCloudClient: vi.fn(() => ({ sendTemplate:
>    vi.fn().mockResolvedValue({ messages: [{ id: 'wamid-test' }] }) }))` and a `WhatsAppCloudError`
>    class (and `normalizePhone` if imported). Add tests for [FIX-2] (no double-retry) and [FIX-3]
>    (terminal → skipped/failed, retry_count unchanged). Tests pass.
> 9. In `meta-api.ts`, remove the orphaned send fns (`sendTextMessage`, `sendMediaMessage`,
>    `sendTemplateMessage`, `sendInteractiveMessage`, and the `sendMessage` switch). KEEP
>    `getTemplates`, `downloadMedia`, `markAsRead`, `normalizePhone`. Verify via grep that the
>    removed fns have no remaining importers.
> 10. `npx tsc --noEmit`, `npm run lint`, `npm run test -- src/lib/whatsapp` all pass.
>
> **Anchors (read first via `git show <branch>:<path>`):**
> - `campaign-processor.ts`: imports `:10–11`; field `:95`; send block `:543–561`; catch `:578–600`;
>   `buildTemplateComponents` builder.
> - `cloud-api.ts`: `sendTemplate` `:300`; `request()` internal `withRetry`/`shouldRetry`
>   `:80–157`; `WhatsAppCloudError` `:659`; `normalizePhone` `:721`; `createWhatsAppCloudClient`
>   `:829`.
> - `backoff.ts`: `defaultShouldRetry` + `createWhatsAppRetry` (the OLD policy you are dropping).
> - `rate-limiter.ts:recordError` `:157`, `rateLimitCodes` `:165` (Phase 0 territory — read, don't edit).
>
> **Verification:** `git grep -n "from './meta-api'" src/` → only test/non-send remain;
> `git grep -n "sendTemplateMessage" src/` → no runtime callers of the meta-api export;
> `git grep -n "'UNKNOWN'" src/lib/whatsapp` → confirm nothing keys on the old always-UNKNOWN value.
>
> **Do NOT:**
> - Do NOT modify `rate-limiter.ts` (its `rateLimitCodes` change is **Phase 0's**), `circuit-breaker.ts`,
>   `queue.ts`, or any QStash/queue code.
> - Do NOT claim this phase fixes the throttle ladder — it depends on Phase 0.
> - Do NOT touch 1:1 senders (`scheduled-message-sender.ts`, `message-service.ts`) or cloud routes.
> - Do NOT add an outer retry wrapper around `sendTemplate` (double-retry).
> - Do NOT re-add retries for 131047/131026/131031 ([FIX-2] — fail-fast is intended).
> - Do NOT change `buildTemplateComponents` or fold media into the send call (Phase 6 owns media).
> - Do NOT silently change phone normalization — verify/decide first ([FIX-6]).
> - Do NOT migrate `getTemplates`/`templates/route.ts` here (separate phase).
> - Keep changes minimal and reversible; one focused commit.
