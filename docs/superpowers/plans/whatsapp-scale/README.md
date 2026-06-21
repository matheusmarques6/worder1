# WhatsApp Scale-Up — Plan Index

Implementation plans for scaling WhatsApp campaign sending from ~1-2 MPS (single serial Railway worker) toward the per-number Meta ceiling, on branch `claude/debug-console-error-FWrLE`.

Each `phaseN-*.md` contains an **implementation plan** + a **self-contained execution prompt**. All were drafted against the real code, then adversarially reviewed; the reviews surfaced a hidden prerequisite (**Phase 0**) and folded fixes into every doc (look for the `v2 changelog` header).

> **Scope note:** the **receiving** pipeline (`cloud/webhook` → QStash → worker → claim RPC → recovery cron) is already production-grade — do not touch it, except the additive metrics in Phase 7. All work below is on the **sending** path.

---

## Three systemic root causes (read first)

Found independently by multiple phase reviews; they drive the sequencing.

1. **Non-atomic shared primitives.** `rate-limiter.canSend` and `circuit-breaker` do read-modify-write across separate Redis round-trips. Under any concurrency (Phase 1) or multi-worker (Phase 3) they burn quota, fail to cap bursts, admit too many HALF_OPEN calls, and can fail to open. → **Phase 0A/0B.**
2. **Dead error-code pipeline.** Campaign sends throw bare `Error` (no `.code`) → `recordError` logs `UNKNOWN` → the throttle ladder never fires and error metrics/alerts are blind. → **Phase 0C** (Phase 5 alone is a half-fix; it forgets code `4`).
3. **Outbound double-send.** Meta has no send idempotency key, and the `sent` write isn't atomic with the send; re-driven batches replay snapshots. → **Phase 0D** (one helper used by Phases 1, 3, 6).

---

## Phases

| # | File | What | Status | Hard deps |
|---|------|------|--------|-----------|
| **0** | `phase0-foundations.md` | Atomic canSend + atomic breaker + error pipeline + idempotency helper | **NEW — prerequisite** | — |
| 4 | `phase4-tiers-accounting.md` | Fix tier source; MPS decoupled; daily = unique recipients (HLL/SET); dedupe TIER_CONFIG | v2 | 0 |
| 1 | `phase1-parallel-dispatcher.md` | Bounded-concurrency dispatcher (bucket = pacing authority) | v2 | 0 |
| 3 | `phase3-qstash-migration.md` | Campaign send via QStash; retire MessageQueue poller; kill SPOF | v2 | 0, 1 |
| 5 | `phase5-unify-clients.md` | Route campaign send through `WhatsAppCloudAPI` (one retry/error policy) | v2 | 0C |
| 6 | `phase6-media-preupload.md` | Upload media once → cached Media ID (`{id}` with `{link}` fallback) | v2 | 3, 5 |
| 7 | `phase7-cleanup-observability.md` | Delete dead forwarders (gated); ACK p50/p99 + MPS + Meta-error metrics | v2 | 0C/5 (metrics), else independent |

---

## Recommended execution order

```
        ┌─────────────────────────────────────────────┐
        │  PHASE 0 — Foundations (atomic primitives,   │
        │  error pipeline, idempotency helper)         │
        └───────────────┬─────────────────────────────┘
                        │ unblocks everything concurrent
        ┌───────────────▼───────────┐
        │  PHASE 4 — tiers/accounting │  (fix tier source FIRST; folds into 0A's Lua)
        └───────────────┬───────────┘
        ┌───────────────▼───────────┐
        │  PHASE 1 — dispatcher      │  (now canSend/breaker are atomic → safe)
        └───────────────┬───────────┘
        ┌───────────────▼───────────┐
        │  PHASE 3 — QStash migration │  (per-invocation dispatch; paced fan-out)
        └───────────────┬───────────┘
        ┌───────────────▼───────────┐
        │  PHASE 5 (client) + 6 (media) │  (parallelizable)
        └───────────────┬───────────┘
        ┌───────────────▼───────────┐
        │  PHASE 7 — cleanup + obs    │  (Part A any time; error metrics after 0C/5)
        └───────────────────────────┘
```

**Why this differs from the original "1+2 first" ROI order:** the reviews showed that shipping concurrency (Phase 1) or multi-worker (Phase 3) before the primitives are atomic (Phase 0) ships double-sends, burst overshoots, and a broken breaker. ROI is still front-loaded — Phase 0 is small, and Phases 4+1 together deliver the bulk of the throughput win for a single number.

**Independent quick wins you can start now, in parallel with Phase 0:**
- Phase 7 **Part A only** (swap forwarder `console.warn` → telemetry event; open the ≥8-day zero-hit window before any deletion).
- Phase 7 **Metric 1** (webhook ACK p50/p99) — independent of the send path (but needs an external log/metrics sink; see that doc's H3).

---

## What the per-number ceiling actually is

For a single WABA number, throughput is capped by its `canSend` token bucket (~72 MPS at tier 3 = `mps*0.9`). **Concurrency does not raise that ceiling** — Phase 1 *saturates* it, Phase 4 *raises/decouples* it (MPS is decoupled from tier; default ~80, requestable to ~1000), and Phase 3 removes the SPOF + scales across *many* numbers/orgs. Don't expect Phase 3 alone to make one number faster.

---

## Verification methodology (how these plans were built)

Drafted by reading the real branch code via `git show <branch>:<path>` (the branch lives in a separate worktree the planning sandbox can't read directly). Every plan was then reviewed by an independent adversarial pass that re-grounded each claim in code; CRITICAL/HIGH findings were folded back in as `[FIX-n]`. Residual `REQUIRES-VERIFICATION` items (e.g. exact Meta doc wording; whether `reset_daily_whatsapp_counters` is applied in the live DB; whether an external metrics sink exists) are flagged in the individual docs and must be confirmed before implementing the dependent phase.
