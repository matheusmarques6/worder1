# Task 4 Review Fix Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two Important Task 4 review findings without weakening accepted-trace atomicity or legacy channel behavior.

**Architecture:** `AttemptTraceCapture` owns one transient union of credentials discovered during a turn; it uses that union only while sanitizing trace copies and clears it on `build()`. The accepted-trace RPC accepts a nullable account only for a non-WhatsApp outbox and still requires/validates WABA identity for WhatsApp.

**Tech Stack:** Python 3.12, psycopg, PostgreSQL migrations, pytest, disposable Supabase Docker.

**Spec:** `.superpowers/sdd/2026-09-08-auditoria-ia-accepted-trace-transport/task-4-brief.md`; independent review dated 2026-09-15.

## Global Constraints

- No new dependency, API endpoint, remote mutation, push, deploy, or migration rewrite.
- Every accepted write remains CAS/outbox/trace atomic in phase 3; writer errors roll back all three.
- Secret values may exist only in the active tool invocation/LLM payload; never in DTO, trace, metering or log.
- WhatsApp requires a tenant-owned WABA; non-WhatsApp preserves `channel_account_id IS NULL`.
- Every Docker action uses a fresh direct 32-hex child of `.superpowers/sdd/auditoria-ia-disposable` and stops it.

---

### Task 1: Propagate discovered credentials through a turn's trace sanitizer

**Files:**
- Modify: `runtime/src/agents_runtime/agent_core/trace.py:76-145`
- Modify: `runtime/tests/unit/test_accepted_trace_producers.py`

**Interfaces:**
- Consumes: `AttemptTraceCapture.record_tool(attempt, payload, known_secrets=...)`.
- Produces: `build()` returns an immutable `AcceptedTracePayload` whose selected `tool_calls` omit every credential discovered earlier or at the same tool call.

- [ ] **Step 1: Write failing producer regressions**

Add one responder and one toucher sequence: authenticated tool A discovers `credential-A` and returns it; a later unknown/tool-B payload contains it in `arguments.query`; assert the selected accepted trace contains `[REDACTED]` and no `credential-A`, while the tool execution double receives the original payload.

- [ ] **Step 2: Run RED**

Run: `uv run --directory runtime pytest tests/unit/test_accepted_trace_producers.py -q`
Expected: the two sequence regressions fail because later capture knows only its local credential set.

- [ ] **Step 3: Implement the shared minimal fix**

In `AttemptTraceCapture.record_tool`, append nonempty `known_secrets` to the capture-local secret tuple before calling `_sanitize`; use the cumulative tuple for every later capture. In `build`, copy the sanitized selected tools, then clear the capture-local secret tuple before returning. Do not retain raw tool payloads or alter LLM/tool execution inputs.

- [ ] **Step 4: Run GREEN**

Run: `uv run --directory runtime pytest tests/unit/test_accepted_trace_payload.py tests/unit/test_accepted_trace_producers.py -q`
Expected: payload limits/redaction and both multi-tool regressions pass.

### Task 2: Keep accepted non-WhatsApp outbound traceable

**Files:**
- Create: `supabase/migrations/20260915030000_accepted_trace_channel_compat.sql`
- Modify: `runtime/src/agents_runtime/repository/agent_traces.py`
- Modify: `runtime/tests/db/test_accepted_trace_commit.py`
- Modify: `runtime/tests/db/test_multi_waba_bridge.py` or a focused pipeline trace test

**Interfaces:**
- Consumes: `record_accepted_trace(..., channel_account_id: UUID | None, ...)`.
- Produces: the same RPC signature with a nullable account only when the matching outbox channel is not `whatsapp`; nullable matching uses `IS NOT DISTINCT FROM`.

- [ ] **Step 1: Write failing DB/pipeline regressions**

Create accepted inbound and touch cases for `email` and/or `instagram` that return content and an owned agent trace. Assert CAS/outbox/trace commit together, account is null in outbox and trace, and WhatsApp-with-null remains rejected with SQLSTATE `22023`.

- [ ] **Step 2: Run RED**

Run the focused tests in a fresh disposable Docker run.
Expected: non-WhatsApp accepted paths fail at `accepted trace context is incomplete` and roll back, proving the regression.

- [ ] **Step 3: Add the forward-only RPC compatibility migration**

Replace only `internal.record_accepted_trace` in a new migration. First locate the matching outbox by id/org/conversation. Require `p_channel_account_id` and a tenant-owned WABA when its `channel='whatsapp'`; require null and use `IS NOT DISTINCT FROM` when it is any other channel. Preserve all generation, target sequence, output, retry/idempotency, RLS and grant checks. Change the Python writer annotation to `UUID | None`.

- [ ] **Step 4: Run GREEN and full Task 4 replay**

Run the focused unit gate, then a fresh disposable Docker run over the original ten primary targets plus extra consumers and the two new channel cases. Run Ruff, import contracts and `git diff --check` after the final source bytes settle.

### Task 3: Independent fix-round review and commit

**Files:**
- Modify: `.superpowers/sdd/2026-09-08-auditoria-ia-accepted-trace-transport/progress.md`
- Modify: `.superpowers/sdd/2026-09-08-auditoria-ia-accepted-trace-transport/task-4-report.md`

- [ ] **Step 1: Record every fresh RED/GREEN nonce, result and cleanup state.**
- [ ] **Step 2: Request a fresh read-only review of the complete Task 4 diff, including the two original Important findings.**
- [ ] **Step 3: Commit only after no Critical or Important finding remains.**

## Self-review

- Review finding 1 maps to Task 1; a two-call regression for both producers proves cross-call redaction and local lifetime.
- Review finding 2 maps to Task 2; inbound/touch non-WhatsApp acceptance and WhatsApp null rejection prove channel-specific behavior.
- No historical migration is edited; the only DB change is forward-only.
- The plan contains no TODO/TBD placeholders and uses the existing capture/RPC interfaces.
