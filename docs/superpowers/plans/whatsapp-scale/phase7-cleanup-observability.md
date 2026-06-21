# Phase 7 (v2) — Cleanup Deprecated Forwarders (VERIFY-FIRST) + Instrument ACK Latency, Real MPS, and Meta Error-Code Breakdown

> Target branch: `claude/debug-console-error-FWrLE`. All code citations were re-read via `git show <branch>:<path>` against that branch for this v2.
> Stack: Next.js 14 (Vercel) + Supabase + Upstash Redis/QStash. ACK latency matters because Meta re-delivers webhooks for 7 days and degrades phone-number quality on repeated delivery failures, so every `200` should be fast and every `5xx` is a quality risk.

---

## v2 CHANGELOG (adversarial-review fixes folded in)

This v2 supersedes the v1 plan. Each change is grounded in code read on the target branch.

- **[FIX-C1] (CRITICAL — corrects a false premise in v1 A.3):** The error-code breakdown is **non-functional today**. The campaign send path calls `sendTemplateMessage` (`campaign-processor.ts:11,551`), which on failure throws a **bare `new Error(...)` with no `.code`** (`meta-api.ts:118`). In the catch block (`campaign-processor.ts:580`) `error.code` is therefore `undefined`, so `recordError(error.code || 'UNKNOWN')` records **`UNKNOWN`** and `error_code: error.code?.toString() || 'UNKNOWN'` (`campaign-processor.ts:570`) persists **`UNKNOWN`** to `whatsapp_campaign_recipients`. The Redis hash `wa:errors:{instance}:{date}` (`rate-limiter.ts:161`) is keyed `UNKNOWN`. The structured `WhatsAppCloudError` class that *does* carry `.code` (`cloud-api.ts:659–709`) is a **different module not used by the campaign loop**. **v1's claim that the seven codes "are already recorded in the hash" is false for the campaign path.** Metric 3 and the code-specific alert now carry a **hard dependency on Phase 0** (Meta error-pipeline: parse `data.error.code` at the send boundary and attach it to the thrown error + `recordError`). Until Phase 0 lands, Metric 3 is scoped as **non-functional** and must not be shipped as if it works.
- **[FIX-H1] (MPS measures the wrong layer):** The in-batch loop is **deliberately throttled** — `await sleep(rateLimiter.getRecommendedDelay())` after every send (`campaign-processor.ts:575`) plus `await sleep((rateCheck.retryAfter||1)*1000)` on rate-limit (`:532`). A per-batch `sent / wall-clock` therefore **re-derives the configured pacing**, not real capacity. **PRIMARY MPS is now cross-batch**, derived from `whatsapp_campaign_recipients.sent_at` (written at `:566`) bucketed by minute. Any in-batch number is demoted and labeled **"pacing utilization,"** not throughput.
- **[FIX-H2] (admin dashboard has no real source):** The health **page is a pure stub** (`page.tsx` — a TODO placeholder, no fetch, no `section` wiring). With C1 unfixed the error breakdown is ~all `UNKNOWN`; ACK p50/p99 lives in no table; only `sent_at`-derived MPS is queryable from Supabase. v1 dashboard surfaces **only sent_at-MPS**. ACK percentiles and the error breakdown live in the **external log platform**, not the admin page. The page must be built (not "wired into existing fetch") — it currently renders nothing.
- **[FIX-H3] (percentile sink is assumed):** `whatsapp-logger.ts` is **pure `console.log/warn/error` to stdout** — there is **no metrics client, no Datadog/Loki SDK** in repo. p50/p99/rate aggregation is a **HARD external dependency** with **no in-repo verification**. The acceptance criterion "p50 < 50ms" is **unverifiable from this repo alone** and is reframed as a dashboard-side target.
- **[FIX-M1] (zero-hit gate presumes a platform):** The "count `deprecated_hit` for ≥ 8 days" gate **only works if the external log platform aggregates stdout JSON lines**. Called out explicitly as a gate precondition.
- **[FIX-L1] (ACK delta excludes cold start):** The in-handler `Date.now()` delta starts **after** the Vercel function is already warm/executing, so it **excludes cold-start / queueing**. Our `ack_ms` p99 is therefore **lower than Meta-observed p99**. One-line caveat added.
- **[FIX-L2] (alert union + code-specific alerting):** `alerts.ts` `type` union (`alerts.ts:6`) **lacks `high_meta_error_rate`**. Alerting on specific codes (130429/131048/131056) **cannot work** while `error_code` is ~all `UNKNOWN` (C1). Until Phase 0, alert on the **`failed` recipient COUNT** over the window, not on codes.
- **[FIX-L3] (forwarder hop doubles latency, invisibly):** Forwarders declare `maxDuration = 30` (`webhook/route.ts`, `meta/webhook/route.ts`) and proxy to `/cloud/webhook` with `maxDuration = 10`. Legacy traffic pays **two function invocations**; the ACK metric is measured **inside `/cloud`** and **cannot see** the forwarder hop. Documented as a known measurement blind spot (and another reason to retire the forwarders).
- **ROUTE VERDICT CONFIRMED (kept from v1, evidence re-read):** both forwarders are **THIN VERBATIM PROXIES** to `/cloud/webhook` — query copied verbatim, raw body forwarded, `x-hub-signature-256` preserved via `headers: request.headers`, HMAC re-verified downstream. **NOT a security bypass.** Part A is sound. Safe to delete **only** behind the zero-hit telemetry gate + ≥ 8d window + the Meta GET-verify caveat.
- **SEQUENCING:** Part A (forwarder log-swap + gate) is **independent — land now**. Metric 1 (ACK) is **independent — land now**. Metric 3 (error breakdown) + the L2 code-specific alert land **AFTER Phase 0 / Phase 5**.

---

## A) IMPLEMENTATION PLAN

### A.0 Objective

1. **Part A (cleanup, GATED) — independent, land now:** keep both legacy forwarders, convert their `console.warn` to aggregatable `wlog` events so a follow-up PR can prove zero hits behind a telemetry gate.
2. **Part B (observability, additive/low-risk):** add metrics via the existing `wlog` JSON-line sink with no added latency on the ACK path. Split by readiness:
   - **Metric 1 — Webhook ACK latency** on `cloud/webhook/route.ts`. **Independent — land now.** Percentiles are aggregated downstream (HARD external dep, [FIX-H3]).
   - **Metric 2 — Real achieved MPS.** PRIMARY = cross-batch via `sent_at` ([FIX-H1]). In-batch number is "pacing utilization" only. **Land now** (sent_at already exists).
   - **Metric 3 — Meta error-code breakdown.** **BLOCKED on Phase 0** ([FIX-C1]). Non-functional until Phase 0 attaches `.code`. **Land after Phase 0 / Phase 5.**
   - Wire alerting into the existing `whatsapp-dead-alert` cron + `alerts.ts`; surface the **sent_at-MPS** aggregate on a (newly built) admin `whatsapp-health` metrics section.

### A.0.1 Phase dependencies (NEW)

- **Phase 0 (Foundations) — Meta error-pipeline.** Phase 0 must parse `data.error.code` at the send boundary (`meta-api.ts:118` currently discards it) and attach it to the thrown error **and** to `recordError`, so that `error.code`, the persisted `whatsapp_campaign_recipients.error_code`, and the Redis `wa:errors` hash carry real Meta codes instead of `UNKNOWN`. **Metric 3 and the code-specific alert (L2) are hard-blocked on this.** Reference: Phase 0 deliverable "attach Meta error code to send-path errors."
- **Phase 5 (clients/send-path).** If Phase 5 restructures the send loop or `recordError` call sites, the Metric-3 anchor moves. Land Metric 3 **after Phase 5** settles the send-path structure (or re-point the anchor at merge). Metric 1, Metric 2, and Part A do **not** depend on Phase 5.

---

### A.1 VERDICT on the two routes (evidence-based, re-read for v2)

Both files read in full on `claude/debug-console-error-FWrLE`. The sibling-branch warning (that they were full independent Evolution/Baileys + Meta handlers) does **NOT** hold here — verified, not assumed.

#### Route 1 — `src/app/api/whatsapp/webhook/route.ts`
**VERDICT: THIN FORWARDER → `/api/whatsapp/cloud/webhook`. Dead-code-eligible behind a zero-hit gate.**

Evidence (read via `git show`):
- Header comment: *"A Evolution foi removida: este endpoint agora apenas encaminha GET e POST, verbatim, para `/api/whatsapp/cloud/webhook`."* and *"Pode ser removido quando a telemetria confirmar zero hits."*
- `GET` builds `new URL('/api/whatsapp/cloud/webhook', request.url)` (`buildForwardUrl`), copies the query string verbatim (`hub.mode`, `hub.verify_token`, `hub.challenge`), `fetch`es it with `headers: request.headers`, and returns the upstream body/status verbatim.
- `POST` reads `request.text()` (raw bytes), forwards `headers: request.headers` (so `x-hub-signature-256` is preserved) + raw body to `/cloud/webhook`, returns the upstream response verbatim. HMAC integrity holds because the canonical route re-verifies against the same raw bytes (`cloud/webhook/route.ts` → `verifyWebhookSignature`).
- **No DB write, no HMAC verify, no Evolution/Baileys logic.** Pure proxy.
- Already emits `console.warn('[DEPRECATED] /api/whatsapp/webhook ... — forwarding to /cloud/webhook')`.
- **`export const maxDuration = 30`** — see [FIX-L3]: legacy traffic pays 30s-budget forwarder **+** 10s-budget `/cloud`, two invocations.

#### Route 2 — `src/app/api/whatsapp/meta/webhook/route.ts`
**VERDICT: THIN FORWARDER → `/api/whatsapp/cloud/webhook`. Dead-code-eligible behind a zero-hit gate.**

Evidence:
- Header: *"Onda 3 D.2 — forwards both GET and POST verbatim to `/api/whatsapp/cloud/webhook` ... Delete after telemetry confirms zero hits."*
- Identical structure: `buildForwardUrl` → `new URL('/api/whatsapp/cloud/webhook', request.url)`, verbatim query copy, `fetch` with `headers: request.headers`, verbatim response. `POST` forwards raw body + headers; canonical route re-verifies HMAC.
- No DB writes, no independent handler logic. Emits `console.warn('[DEPRECATED] /meta/webhook hit', ...)`.
- **`export const maxDuration = 30`** — same [FIX-L3] double-hop.

**Conclusion:** Both are deprecated *thin verbatim forwarders* kept alive only so legacy Meta Business Suite config still works. **Neither is a live independent handler. Not a security bypass.** Safe to delete **only after telemetry proves zero inbound hits** for a full Meta retry window.

> **Why not delete now (and the Meta GET-verify caveat):** Meta re-delivers POST for 7 days; an old subscription URL could still point at either path. Deleting prematurely turns those into `404`s → delivery failures → phone-quality degradation. **Additionally, a Meta GET verification challenge** (subscription re-confirm) could arrive at a legacy URL; if the route is gone, re-verification fails. The gate must observe **zero GET and zero POST** hits.

---

### A.2 Gated deletion plan (Part A) — independent, land now

The current forwarders use **un-aggregatable** `console.warn('[DEPRECATED] ...')`. Step 1 converts these to **structured `wlog` counters**. Deletion is a **follow-up PR** gated on evidence.

**Step 1 (this PR — additive):** Replace each `console.warn('[DEPRECATED] ...')` with a `wlog.warn` event carrying a stable `event` name and route/method:
- `wlog.warn('whatsapp.webhook.deprecated_hit', { route: '/api/whatsapp/webhook', method: 'GET'|'POST' })`
- `wlog.warn('whatsapp.webhook.deprecated_hit', { route: '/api/whatsapp/meta/webhook', method: 'GET'|'POST' })`

Single shared event name + `route`/`method` field so one log query covers both. Forwarding behavior stays byte-for-byte unchanged.

**Step 2 (observation window — no code):** Watch the `whatsapp.webhook.deprecated_hit` count for **≥ 8 days** (one full 7-day Meta retry window + margin). **[FIX-M1]: this gate presumes the external log platform aggregates stdout JSON lines — if no platform aggregates these, the gate cannot be evaluated and deletion stays blocked.** Gate is GREEN when the count is `0` (GET **and** POST) across the window AND no active Meta subscription points at either legacy path (verify in Meta Business Suite).

**Step 3 (follow-up PR — deletion):** Once GREEN, delete both route files. **Out of scope for this PR**; must not be bundled with observability changes.

**Keep-recommendation fallback:** If either event fires with non-zero count, **KEEP** the corresponding forwarder and chase the stale Meta subscription URL instead.

---

### A.3 Metrics design (Part B) — grounded in `wlog` + existing infra

**Sink reality ([FIX-H3]).** `wlog` (`src/lib/observability/whatsapp-logger.ts`) is **one JSON line per event to stdout via `console.log/warn/error` — nothing more.** There is **no metrics client, no Datadog/Loki SDK, no percentile computation** in repo. Therefore: all metrics emit via `wlog`; **any p50/p99/rate aggregation is performed by an external log platform that is a HARD dependency and CANNOT be verified from this repo.** In-repo we can only assert that the structured line is emitted with the right fields.

For the **admin surface**, the only Supabase-queryable signal is `whatsapp_campaign_recipients.sent_at`. v1's dashboard surfaces **only sent_at-derived MPS**. ACK percentiles and error breakdown are **NOT** on the admin page — they require the log platform ([FIX-H2]).

> **Do not conflate:** the *ACK latency* metric is **in-process handler time** (request entry → `200`). The `whatsapp_webhook_events.received_at → processed_at` delta measures **ingest→async-worker** latency — a *different* number that does NOT capture ACK time. ACK latency is an explicit `Date.now()` delta inside the route, emitted via `wlog`; it is not derivable from any table. **[FIX-L1]: that delta also excludes Vercel cold-start/queueing, so our `ack_ms` p99 is lower than Meta-observed p99.**

#### Metric 1 — Webhook ACK latency (`cloud/webhook/route.ts`) — INDEPENDENT, land now
- **Where:** `POST` and `GET` in `src/app/api/whatsapp/cloud/webhook/route.ts`.
- **How:** capture `const t0 = Date.now()` as the **first** statement of each handler. On **every** return path (`GET`: 403 invalid mode, 403 token mismatch, 200 challenge; `POST`: 401 invalid signature, 401 missing-sig/secret, 400 invalid json, 200 ignored-non-whatsapp, 200 sync-done, 200 insert-failed-swallow, 200 queued), compute `ack_ms = Date.now() - t0` and emit `wlog.info('whatsapp.webhook.ack', { ack_ms, status, async, outcome })` **immediately before constructing the response**, never after extra awaits.
  - Do NOT add any awaited work between `t0` and the response purely for measurement. The QStash enqueue (`enqueueWhatsAppWebhook`) stays exactly where it is.
- **Aggregation:** p50/p99 computed **in the log platform** over `ack_ms` (external, [FIX-H3]). The admin health route does **not** compute percentiles.
- **Target (NOT a repo-verifiable acceptance criterion):** p50 < 50ms on the dashboard (matches the route's stated `<50ms` contract). **[FIX-L1]** caveat: excludes cold start, so it underestimates Meta-observed latency. **[FIX-L3]** caveat: this metric is measured inside `/cloud` and is blind to the forwarder hop for legacy traffic.

#### Metric 2 — MPS (PRIMARY = cross-batch via `sent_at`) — land now  [FIX-H1]
- **PRIMARY (real throughput):** derive achieved MPS from `whatsapp_campaign_recipients.sent_at` (written at `campaign-processor.ts:566`) **bucketed by minute**, per-instance and global, over a recent window (e.g. last 15m). This measures the **cross-batch** rate the system actually achieves — independent of the throttled in-loop pacing. Computed off the hot path (admin-gated query and/or log-platform query over emitted `sent_at`).
- **SECONDARY ("pacing utilization," NOT throughput):** if a per-batch number is emitted at all, label it `pacing_utilization`, not `mps`. It only reflects `CAMPAIGN_CONFIG.targetMPS` (`:33`, =70) and the in-loop `sleep` (`:575`) — it **re-derives configured pacing**, so it is useful only as "are we hitting the intended pace," never as capacity.
  - If emitting it: `wlog.info('whatsapp.send.batch_pacing', { campaign_id, instance_id, batch_index, sent, failed, skipped, duration_ms, pacing_utilization: <sent/(duration_ms/1000)>, target_mps: CAMPAIGN_CONFIG.targetMPS })`, guarding `duration_ms === 0`.
- **Aggregation:** PRIMARY MPS = `count(sent_at)` per minute window. Admin dashboard surfaces **this** number (the only Supabase-sound one, [FIX-H2]).

#### Metric 3 — Meta error-code breakdown — BLOCKED on Phase 0  [FIX-C1]
- **HARD DEPENDENCY:** today the campaign path cannot produce real codes. `sendTemplateMessage` throws a **bare Error** (`meta-api.ts:118`); the catch (`campaign-processor.ts:580`) sees `error.code === undefined`; `recordError('UNKNOWN')` (`rate-limiter.ts:157,161`) and `error_code: 'UNKNOWN'` (`:570`) are stored. The `backoff.ts` retry classifier (`:148–165`) reads `error.code` too — for campaign sends it sees `undefined` and only the `error.message?.includes('fetch failed')` fallback can fire. **Until Phase 0 attaches `data.error.code` to the thrown error and to `recordError`, this metric records only `UNKNOWN` and is non-functional.**
- **Scope honestly until Phase 0:** Do **not** ship Metric 3 as working. Either (a) omit it from PR-1, or (b) ship the emit wired but documented as "emits `UNKNOWN` until Phase 0," with the dashboard hidden.
- **How (AFTER Phase 0, additive):** in the send-loop catch, alongside the existing `recordError`, emit `wlog.warn('whatsapp.send.meta_error', { code: String(error.code), label: metaErrorLabel(error.code), instance_id, campaign_id, organization_id, phone_last4: recipient.phone_number.slice(-4), retryable: defaultShouldRetry(error) })`. Keep `recordError(error.code || 'UNKNOWN')` exactly as-is.
  - Label map (the seven codes of interest): `130429=rate_limit, 131056=pair_rate, 131049=per_user_marketing_cap, 131048=spam_rate, 131026=undeliverable, 131047=reengagement_24h, 131064=generic`. Note **131064 is not referenced anywhere in code today** — it only appears once a send returns it (Phase 0 pipeline records it); add to the known-codes list only.
- **Aggregation (post-Phase-0):** counts per code from logs (external platform), or `whatsapp_campaign_recipients.error_code` over a window once it carries real codes.

#### Dashboards / alerts hooks
- **Admin health page/route ([FIX-H2]):**
  - **Route:** add `case 'metrics': return getMetrics();` to the `switch (section)` in `src/app/api/admin/whatsapp-health/route.ts` (mirrors `overview`/`accounts`, admin-gated via `requireAdmin`, 403 for non-admin). `getMetrics()` returns the **sent_at-derived MPS only** (last 15m, per-instance + global) plus an explicit `ack: { note: 'see external log platform' }` and `error_codes: { note: 'blocked on Phase 0; currently UNKNOWN' }`. Do **not** run an expensive scan or pretend to compute percentiles.
  - **Page:** `src/app/(dashboard)/admin/whatsapp-health/page.tsx` is **currently a stub** (a static TODO placeholder — no fetch, no `section` state, no tabs). The metrics section must be **built**: add a client fetch to `?section=metrics` and render the MPS number + the ACK/error-code "see logs / blocked on Phase 0" notes. Keep it admin-only consistent with the route guard.
- **Alerting (`alerts.ts` + `whatsapp-dead-alert` cron) ([FIX-L2]):**
  - The cron (`/api/cron/whatsapp-dead-alert`, `*/15 * * * *`) already calls `checkCampaignWorkerHealth()` in **both** return paths and demonstrates the dedup pattern (`dedupKey: 'campaign_worker_stalled:global'`, plus an open-alert pre-check).
  - **Until Phase 0:** add a best-effort check that counts `whatsapp_campaign_recipients` rows with `status = 'failed'` (the **COUNT**, since `error_code` is ~all `UNKNOWN`) over the last 15m and calls `sendAlert(...)` above a threshold. **Do not** filter by 130429/131048/131056 — those buckets are empty pre-Phase-0.
  - **After Phase 0:** switch the filter to the specific rate/spam codes.
  - **Alert type:** `alerts.ts:6` union lacks `high_meta_error_rate`. Either add it to the union (`alerts.ts`) or reuse `type: 'quality_drop'`. Use an explicit `dedupKey: 'high_meta_error_rate:global'`. Wrap in try/catch like `checkCampaignWorkerHealth` so DB/Redis issues can't break the cron.
  - **Do NOT** add a new `vercel.json` cron entry — piggyback the existing 15-min cadence.

---

### A.4 Affected files + anchors

| File | Change | Anchor | Phase gate |
| --- | --- | --- | --- |
| `src/app/api/whatsapp/cloud/webhook/route.ts` | `t0 = Date.now()` + `wlog.info('whatsapp.webhook.ack', …)` on every return path | top of `POST`/`GET`; each `return`/`new Response`/`NextResponse.json` | **now** |
| `src/lib/whatsapp/campaign-processor.ts` | (Metric 2 secondary) optional `whatsapp.send.batch_pacing` emit, labeled pacing — **NOT** mps; (Metric 3) per-error `wlog.warn('whatsapp.send.meta_error', …)` | `processBatch` end-of-loop (`~:600`); catch at `recordError` (`:580`) | pacing: now / meta_error: **after Phase 0** |
| `src/app/api/whatsapp/webhook/route.ts` | Swap both `console.warn('[DEPRECATED]…')` → `wlog.warn('whatsapp.webhook.deprecated_hit', {route, method})` | the two `console.warn` lines | **now** |
| `src/app/api/whatsapp/meta/webhook/route.ts` | Same swap | the two `console.warn` lines | **now** |
| `src/app/api/admin/whatsapp-health/route.ts` | New `case 'metrics': getMetrics()` returning sent_at-MPS + ack/error notes | the `switch (section)` block (`:29`) | **now** |
| `src/app/(dashboard)/admin/whatsapp-health/page.tsx` | **Build** metrics section (currently a stub) — fetch `?section=metrics`, render MPS + notes | whole file (replace stub body) | **now** |
| `src/app/api/cron/whatsapp-dead-alert/route.ts` | Add failed-COUNT check → `sendAlert` (dedupKey, try/catch) | after `checkCampaignWorkerHealth()` in `GET` | **now** (count) / codes **after Phase 0** |
| `src/lib/whatsapp/alerts.ts` | (optional) add `'high_meta_error_rate'` to the `type` union | `AlertParams.type` (`:6`) | **now** |
| **Phase 0 (separate)** `src/lib/whatsapp/meta-api.ts` | Attach `data.error.code` to the thrown error so `recordError`/`error_code` carry real codes | `:118` (and siblings :51,:84,:151) | **prereq for Metric 3** |

No new tables, no new migrations, no new cron entries for v1.

### A.5 Test plan
- **Unit:** `whatsapp-logger` shape unchanged (existing). If emitting batch pacing, test the math guards `duration_ms === 0` (no divide-by-zero) and is labeled `pacing_utilization`/`batch_pacing`, not `mps`. Test `metaErrorLabel` maps the 7 codes (the helper is pure; testable even though the metric is blocked on Phase 0).
- **Route:** `cloud/webhook` `POST`/`GET` still return the same status codes (401 bad sig, 400 bad json, 200 valid, 403 GET invalid mode/token) AND emit a `whatsapp.webhook.ack` line with numeric `ack_ms` on **each** path (spy on `wlog.info`).
- **Forwarders:** assert GET/POST still forward verbatim (status + body preserved, headers incl. `x-hub-signature-256` passed) and now emit `whatsapp.webhook.deprecated_hit` (spy on `wlog.warn`) — behavior unchanged, only logging changed.
- **Health route:** `section=metrics` returns `{ mps: {...}, ack: { note }, error_codes: { note } }`; **403 for non-admin** (existing `requireAdmin`).
- **Metric 3 (post-Phase-0 only):** once Phase 0 lands, add a test that a coded send failure produces `whatsapp.send.meta_error` with the real `code`. **Do not** write this assertion against the current branch — it would assert `UNKNOWN`.
- **Commands (PowerShell):** `npm run lint`; `npx tsc --noEmit`; `npx vitest run` scoped to touched files.

### A.6 Rollout
1. **PR-1 (now, additive):** Metric 1 (ACK) + Metric 2 PRIMARY (sent_at-MPS dashboard) + forwarder log-swap + health `section=metrics` (MPS + notes) + dead-alert **failed-COUNT** check. Zero behavior change to ACK/forward paths. Confirm in preview that `ack_ms` values are sane.
2. **Observation window (≥ 8 days):** collect `whatsapp.webhook.deprecated_hit` counts + ACK/MPS baselines (requires log platform, [FIX-M1]).
3. **PR-2 (after Phase 0):** enable Metric 3 (`whatsapp.send.meta_error` with real codes) + switch the dead-alert filter to specific codes + surface the error breakdown.
4. **PR-3 (follow-up, deletion):** only if `deprecated_hit == 0` (GET+POST) for the full window, delete the two forwarder routes. Reversible by `git revert`.

### A.7 Ordering / deps vs other phases
- **Part A + Metric 1 + Metric 2:** independent — land now.
- **Metric 3 + code-specific L2 alert:** **hard-blocked on Phase 0** (error-pipeline) and should land **after Phase 5** settles the send-loop structure ([FIX-C1], A.0.1).
- **No dependency** for Metric 1 — `cloud/webhook/route.ts` is canonical and stable.

### A.8 Risks & blast radius
- **R1 — deleting a live route (HIGH if ungated):** legacy Meta subscription URLs → 404 → delivery failures → quality degradation; also breaks a stray GET re-verify. **Mitigation:** zero-hit gate (GET+POST) + ≥8d window + separate PR. Single most important guardrail.
- **R2 — adding latency to ACK path (MEDIUM):** any awaited work for measurement inflates p99 → Meta retries. **Mitigation:** `Date.now()` subtraction + one synchronous `wlog.info` only, before the response; QStash stays fire-and-forget.
- **R3 — shipping a non-functional metric as if real (MEDIUM, NEW):** Metric 3 records `UNKNOWN` pre-Phase-0; a dashboard "all UNKNOWN" or a code-filtered alert that never fires is worse than nothing. **Mitigation:** gate Metric 3 + code-specific alert on Phase 0; until then alert on the failed COUNT.
- **R4 — log volume / PII (LOW):** `meta_error`/`ack` lines cost money and could leak phones. **Mitigation:** log last-4 only; `ack` is one low-cardinality line per webhook; `meta_error` only on failures.
- **R5 — divide-by-zero / NaN pacing (LOW):** guard `duration_ms === 0`.
- **R6 — measurement blind spot (LOW, [FIX-L3]):** ACK metric is inside `/cloud` and cannot see the forwarder hop; legacy traffic's true ACK is forwarder+`/cloud`. Documented, not fixable without instrumenting the forwarders (which we are retiring).
- **Blast radius:** instrumentation touches 2 hot files additively (webhook + processor); forwarder/health/cron changes isolated. No schema/cron-config changes in v1. Fully reversible via revert.

---

## B) EXECUTION PROMPT (for a fresh coding agent)

> **Branch:** `claude/debug-console-error-FWrLE`. **Scope:** Phase 7 v2 — additive observability + convert deprecated-forwarder logging to structured events. **DO NOT delete any route in this PR.**
> **READ FIRST:** Metric 3 (Meta error-code breakdown) is **BLOCKED on Phase 0** — the campaign send path throws a bare Error with no `.code` (`meta-api.ts:118`), so error codes are recorded as `UNKNOWN`. **Do not implement Metric 3's coded behavior in this PR** unless Phase 0 has already landed on this branch (check: does `meta-api.ts:sendTemplateMessage` attach `data.error.code` to the thrown error?). If Phase 0 is NOT present, ship only Part A + Metric 1 + Metric 2 + the failed-COUNT alert.

### Goal
Land the **independent** Phase 7 work now: convert the two deprecated forwarders' `console.warn` to aggregatable `wlog` events; add **ACK latency** instrumentation (Metric 1) with **zero added latency**; add the **PRIMARY sent_at-derived MPS** dashboard (Metric 2); build the admin health metrics section; and wire a **failed-COUNT** error-rate alert into the existing 15-min dead-alert cron. Defer Metric 3's coded path and code-specific alerting to a post-Phase-0 PR.

### Files you will edit (exact paths)
1. `src/app/api/whatsapp/cloud/webhook/route.ts` — Metric 1
2. `src/lib/whatsapp/campaign-processor.ts` — (Metric 2 secondary "pacing" only; Metric 3 emit ONLY if Phase 0 present)
3. `src/app/api/whatsapp/webhook/route.ts` — forwarder log swap
4. `src/app/api/whatsapp/meta/webhook/route.ts` — forwarder log swap
5. `src/app/api/admin/whatsapp-health/route.ts` — `section=metrics`
6. `src/app/(dashboard)/admin/whatsapp-health/page.tsx` — **build** the metrics section (currently a stub)
7. `src/app/api/cron/whatsapp-dead-alert/route.ts` — failed-COUNT alert
8. (optional) `src/lib/whatsapp/alerts.ts` — add `'high_meta_error_rate'` to `AlertParams.type` (`:6`)

Logger to reuse (DO NOT modify): `src/lib/observability/whatsapp-logger.ts` → `wlog.info/warn/error(event, data)`. It is pure `console.*` to stdout — there is **no metrics client**; percentiles are computed downstream in an external log platform, not here.

### Precise edits

**1) ACK latency — `cloud/webhook/route.ts`** (import `wlog` already present)
- Add `const t0 = Date.now();` as the first line of `POST` and of `GET`.
- Before **every** `return`/`new Response(...)`/`NextResponse.json(...)` in both handlers, emit `wlog.info('whatsapp.webhook.ack', { ack_ms: Date.now()-t0, status, async: process.env.ENABLE_ASYNC_WEBHOOK === 'true', outcome })`. Use a small local helper that builds the line and is called immediately before each return. Return paths to cover:
  - `GET`: 403 `invalid_mode`, 403 `token_mismatch`, 200 `verified`/`challenge`.
  - `POST`: 401 `invalid_signature`, 401 `missing_sig_or_secret`, 400 `invalid_json`, 200 `ignored` (non-whatsapp), 200 `sync_done` (legacy path), 200 `insert_failed` (swallow), 200 `queued`.
- **Do not** add any `await` between `t0` and a response for measurement. Do not move `enqueueWhatsAppWebhook`.
- Caveat to leave as a code comment: `ack_ms` excludes Vercel cold-start, so it underestimates Meta-observed latency.

**2) MPS (Metric 2) — `campaign-processor.ts`**
- **PRIMARY MPS is NOT computed here.** It is derived from `whatsapp_campaign_recipients.sent_at` in the admin route (edit #4). Do not emit a per-batch number as `mps`.
- **Optional secondary** (only if you want pacing visibility): after the `for (const recipient of recipients)` loop in `processBatch`, before `increment_campaign_sent`, emit `wlog.info('whatsapp.send.batch_pacing', { campaign_id: campaignId, instance_id: instance.id, batch_index: data.batchIndex, sent: result.sent, failed: result.failed, skipped: result.skipped, duration_ms, pacing_utilization: duration_ms>0 ? result.sent/(duration_ms/1000) : 0, target_mps: CAMPAIGN_CONFIG.targetMPS })` where `duration_ms = Date.now() - batchStart` and `const batchStart = Date.now();` is captured before the loop. **Label it `pacing_utilization`, never `mps`** — the in-loop `await sleep(rateLimiter.getRecommendedDelay())` (`:575`) makes this re-derive configured pacing, not capacity.

**3) Meta error breakdown (Metric 3) — `campaign-processor.ts` — ONLY IF Phase 0 is present**
- Guard: confirm `meta-api.ts:sendTemplateMessage` attaches `data.error.code` to the thrown error. **If it does not, SKIP this edit entirely** and note in the PR that Metric 3 is deferred to post-Phase-0.
- If present: in the catch at `await rateLimiter.recordError(error.code || 'UNKNOWN')` (`:580`), **after** it (do not change `recordError`), add:
  `wlog.warn('whatsapp.send.meta_error', { code: String(error.code ?? 'UNKNOWN'), label: metaErrorLabel(error.code), instance_id: instance.id, campaign_id: campaignId, organization_id: organizationId, phone_last4: recipient.phone_number.slice(-4) });`
- Add a module-level helper:
  `const META_ERROR_LABELS: Record<string,string> = { '130429':'rate_limit','131056':'pair_rate','131049':'per_user_marketing_cap','131048':'spam_rate','131026':'undeliverable','131047':'reengagement_24h','131064':'generic' }; function metaErrorLabel(code: unknown){ return META_ERROR_LABELS[String(code)] ?? 'other'; }`

**4) Deprecated forwarders — `webhook/route.ts` and `meta/webhook/route.ts`**
- Add `import { wlog } from '@/lib/observability/whatsapp-logger';`.
- Replace each `console.warn('[DEPRECATED] ...')` with `wlog.warn('whatsapp.webhook.deprecated_hit', { route: <'/api/whatsapp/webhook' | '/api/whatsapp/meta/webhook'>, method: 'GET'|'POST' });` (set per file & handler).
- **Change nothing else** — verbatim forwarding (URL build, raw-body forward, `headers: request.headers` pass-through, verbatim response, `maxDuration = 30`) stays byte-for-byte identical.

**5) Admin health — `admin/whatsapp-health/route.ts` + page**
- Add `case 'metrics': return getMetrics();` to the `switch (section)` (`:29`).
- `getMetrics()` (admin-gated via existing `requireAdmin`): derive **achieved MPS** from `whatsapp_campaign_recipients.sent_at` over the last 15m (bucket by minute; global + per-instance). Return `{ mps: { achieved_15m, target: 70 }, ack: { note: 'p50/p99 in external log platform' }, error_codes: { note: 'blocked on Phase 0; currently UNKNOWN' } }`. Do **not** compute percentiles or run an expensive scan.
- `page.tsx` is **a stub today** (static TODO, no fetch). Replace the body with a client that fetches `?section=metrics` and renders the MPS number + the two notes. Keep it admin-only (route already 403s non-admins).

**6) Error-rate alert — `cron/whatsapp-dead-alert/route.ts`**
- After `checkCampaignWorkerHealth()` in `GET`, add a best-effort check (wrapped in try/catch like the worker-health check): count `whatsapp_campaign_recipients` rows with `status = 'failed'` in the last 15m; if above threshold (e.g. > 50 or > X% of attempts), call `sendAlert({ severity: 'warning', type: 'high_meta_error_rate' /* add to union */ || 'quality_drop', title: 'High WhatsApp send failure rate', message: ..., dedupKey: 'high_meta_error_rate:global', metadata: {...} })`.
- **Do NOT filter by error_code 130429/131048/131056** — those are empty until Phase 0 (codes are `UNKNOWN` today). Switch to code-filtering in the post-Phase-0 PR.

### Acceptance criteria
- `cloud/webhook` emits `whatsapp.webhook.ack` with numeric `ack_ms` on **every** response path; **no new `await`** before any response; existing status codes (401/400/200/403) unchanged.
- Forwarders emit `whatsapp.webhook.deprecated_hit`; forwarding byte-for-byte unchanged; **no route files deleted**.
- `admin/whatsapp-health?section=metrics` returns `{ mps, ack:{note}, error_codes:{note} }` and is **403 for non-admins**.
- Dead-alert cron gains a **failed-COUNT** `sendAlert` with a `dedupKey`; cron still returns 200 if the new check throws.
- **NOT an acceptance criterion:** "p50 < 50ms" — unverifiable from this repo ([FIX-H3]); it is a dashboard-side target only.
- Metric 3 coded behavior is present **only if** Phase 0 is on the branch; otherwise it is explicitly deferred.

### Tests + commands (PowerShell)
- `npm run lint`
- `npx tsc --noEmit`
- `npx vitest run src/lib/whatsapp src/app/api/whatsapp` (adjust to the repo's configured script).
- Spy `wlog.info/warn` to assert new events fire; assert pacing math guards divide-by-zero; assert `metaErrorLabel` maps the 7 codes. **Do not** assert `whatsapp.send.meta_error` carries a real code on this branch unless Phase 0 is present (it would be `UNKNOWN`).

### Verification
- Preview deploy: send a test webhook, confirm one `whatsapp.webhook.ack` line with `ack_ms` (caveat: warm-only).
- Trigger a small campaign, confirm `whatsapp.send.batch_pacing` (if emitted) shows pacing near `target_mps`, and `sent_at`-MPS appears on the health page.
- Hit `/api/admin/whatsapp-health?section=metrics` as admin (and confirm 403 as non-admin).

### DO NOT (guardrails)
- DO NOT delete `src/app/api/whatsapp/webhook/route.ts` or `src/app/api/whatsapp/meta/webhook/route.ts` in this PR. Deletion is a **separate follow-up** gated on `whatsapp.webhook.deprecated_hit == 0` (GET **and** POST) for ≥ 8 days, **and** requires an external log platform to evaluate the gate ([FIX-M1]).
- DO NOT ship Metric 3 (error-code breakdown) or a **code-specific** alert as functional — codes are `UNKNOWN` until **Phase 0** attaches `data.error.code` ([FIX-C1]). Alert on the failed **COUNT** instead.
- DO NOT label the in-batch number `mps` — it is throttled pacing ([FIX-H1]); PRIMARY MPS comes from `sent_at`.
- DO NOT claim a repo-verifiable "p50 < 50ms" — there is no metrics client; percentiles are external ([FIX-H3]).
- DO NOT add latency to the ACK path: no new `await`, no extra DB/network call between request entry and the `200`. Measurement is `Date.now()` + one `wlog` line.
- DO NOT change the forwarders' forwarding logic, HMAC handling, headers, `maxDuration`, or response shape — only swap the log call.
- DO NOT remove or alter `rateLimiter.recordError(...)` — it drives throttling; the `wlog` emit is purely additive.
- DO NOT add a new `vercel.json` cron entry — piggyback the existing `whatsapp-dead-alert` (`*/15 * * * *`).
- DO NOT log full phone numbers (use last-4).
- DO NOT modify `src/lib/observability/whatsapp-logger.ts` (sink contract is fixed).
