# Phase 3 — Migrate Campaign Send to QStash; Retire MessageQueue Polling; Remove Railway SPOF

Branch to implement on: `claude/debug-console-error-FWrLE`
Plan author altitude: senior architect. All file refs read via `git show claude/debug-console-error-FWrLE:<path>`.

> **v2 — adversarial-review revision.** This supersedes the first draft. Six fixes were folded in after grounding against `campaign-processor.ts:484-607` / `:786-827`. Each is tagged **[FIX-n]** where it lands. Summary of what changed vs v1:
> 1. **[FIX-1] Throughput model corrected.** Concurrency ≠ throughput for a single WABA number — the global Redis token bucket (`wa:throughput:<instanceId>`, ~72 MPS at tier 3) is the ceiling regardless of invocation count. v1's fan-out pacing (`floor(n/20)` → ~28× oversubscription) caused token starvation → 300s timeouts → `attempts++` → premature `dead` with unsent recipients. Pacing now matches drain rate, and the value proposition is repositioned (SPOF removal + retries/DLQ + multi-number/multi-org scale, NOT single-number speed).
> 2. **[FIX-2] Send-then-crash double-send window closed.** Meta has no send idempotency key, and `processBatch` does not write `sent` atomically with the Meta call. A recipient is now marked `sending` BEFORE the Meta call and quarantined (not re-sent) on re-drive.
> 3. **[FIX-3] Lease > maxDuration.** `in_flight_until` is now 360s for a 300s `maxDuration` to absorb Postgres/Vercel clock skew (v1 set them equal, inviting overlap → concurrent dup processing).
> 4. **[FIX-4] Per-org canary is a real per-org gate** (allowlist / org column), not a single global env boolean.
> 5. **[FIX-5] Circuit-breaker-open does not burn a retry attempt** (re-enqueue without `attempts++`, with jitter) — prevents a breaker flap from mass-killing 500 concurrent batches into `dead`.
> 6. **[FIX-6] Housekeeping:** drop the vestigial `campaignQueue.getStats()` Redis round-trip in `checkCampaignCompletion`; guard the `completed` double-write race; document the QStash-down degraded mode.

---

## 0. Premise checks (carried from v1, still valid)

1. **`MessageQueue` cannot be deleted.** `lowPriorityQueue` is dead, but `webhookQueue` and `campaignQueue` are imported by read-only stats/alert routes:
   - `src/app/api/whatsapp/queue/stats/route.ts` (`campaignQueue, webhookQueue` → `.getStats()` + DLQ-retry handler).
   - `src/app/api/cron/whatsapp-dead-alert/route.ts` (`campaignQueue` → `.getStats()` + `.getOldestPendingAgeMs()`).
   Retirement = **stop using `campaignQueue` as the campaign-batch producer/consumer**, not "delete the class."
2. **No per-batch persistence exists today.** Campaign batches live only as ephemeral Redis JSON jobs. We introduce a durable `whatsapp_campaign_batches` row so QStash carries an opaque `batchId` and the worker does an atomic DB claim — mirroring `claim_whatsapp_webhook_event`.

---

## A) IMPLEMENTATION PLAN

### A.1 Objective (repositioned — [FIX-1])

Replace the single Railway polling consumer with QStash-driven Vercel invocations to gain: **(i) SPOF elimination** (no single worker whose death stops all sending), **(ii) free retries + DLQ + durable recovery**, and **(iii) horizontal scale across many WABA numbers / orgs** — each number having its own Redis token bucket.

**Explicitly NOT a goal:** raising the throughput of a *single* WABA number. That number's ceiling is its `canSend` token bucket (~72 MPS at tier 3). Saturating that bucket is **Phase 1** (parallel dispatch); raising/decoupling it is **Phase 4**. Phase 3 must therefore **pace its fan-out to the bucket's drain rate** (A.6) — over-fanning a single number just creates token-starved invocations that time out.

Mirrors the verified webhook pipeline:
`ingest → persist → enqueue(id) → QStash → worker (verify sig → atomic claim → process → mark done/failed → 200) → recovery cron`.

### A.2 Affected & new files

**New:**
- `supabase/migrations/2026XXXX_whatsapp_campaign_batches.sql` — table + `claim_whatsapp_campaign_batch(uuid)` + `pending_whatsapp_campaign_batches_for_reprocess(int,int)`. Structure mirrors `20260522_whatsapp_webhook_events.sql`.
- `src/app/api/workers/whatsapp-campaign-batch/route.ts` — new worker, mirrors `whatsapp-webhook/route.ts`.
- `src/app/api/cron/reprocess-whatsapp-campaign-batches/route.ts` — recovery cron, mirrors `reprocess-whatsapp-pending/route.ts`.

**Edited:**
- `src/lib/queue.ts` — add `enqueueWhatsAppCampaignBatch(batchId, opts)` beside `enqueueWhatsAppWebhook`.
- `src/lib/whatsapp/campaign-processor.ts` — gate `startCampaign` step 6 (`addBatch` ~line 257); extract `processJob` body → `processBatchById(batchId)`; **[FIX-2]** add a `sending` pre-mark in `processBatch`; **[FIX-6]** drop the dead `getStats()` call in `checkCampaignCompletion` (:788).
- `src/config/whatsapp.ts` or org settings — **[FIX-4]** per-org canary source (see A.8).
- `vercel.json` — add recovery cron (`* * * * *`). Do NOT add the worker route as a cron.

**Untouched (noted):** `src/lib/whatsapp/queue.ts` (keep), `worker/campaign-worker.ts` (keep as fallback), `scheduled-campaigns.ts` (contract unchanged), `rate-limiter.ts` (Phase 1/2).

### A.3 Worker route sketch (mirrors whatsapp-webhook)

```ts
// src/app/api/workers/whatsapp-campaign-batch/route.ts
export const dynamic = 'force-dynamic';
export const maxDuration = 300;            // [FIX-3] lease is 360 (> this) in the RPC

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('upstash-signature');
  const receiver = getQstashReceiver();
  // IDENTICAL signature-verify block copied from whatsapp-webhook/route.ts
  //   prod => require sig+receiver+valid; dev => verify-if-present else x-internal-request

  let batchId: string | undefined;
  try { batchId = JSON.parse(rawBody).batchId; } catch { return NextResponse.json({error:'invalid body'},{status:400}); }
  if (!batchId) return NextResponse.json({ error: 'batchId required' }, { status: 400 });

  const { data: claimedRows, error: claimError } =
    await supabaseAdmin.rpc('claim_whatsapp_campaign_batch', { p_id: batchId });
  if (claimError) return NextResponse.json({ error: 'claim failed' }, { status: 500 });
  const claimed = (claimedRows as any[])?.[0];
  if (!claimed) return NextResponse.json({ skipped: true, reason: 'not_claimable' }, { status: 200 });

  try {
    const result = await campaignProcessor.processBatchById(batchId);
    await markDone(batchId, result);
    return NextResponse.json({ ok: true, batchId, result });
  } catch (err: any) {
    // [FIX-5] breaker-open is not a real failure — re-enqueue without burning an attempt.
    if (err?.code === 'CIRCUIT_OPEN') {
      await releaseClaimWithoutAttempt(batchId);                 // status back to 'pending', attempts unchanged, in_flight cleared
      await enqueueWhatsAppCampaignBatch(batchId, { delay: 30 + jitter(batchId, 30) });
      return NextResponse.json({ ok: false, requeued: 'circuit_open' }, { status: 200 });
    }
    await markFailed(batchId, err?.message ?? 'unknown', claimed.attempts, claimed.max_attempts);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 200 });
  }
}
```

`markDone/markFailed` mirror the webhook worker. `releaseClaimWithoutAttempt` is a new tiny RPC/update (status→`pending`, `attempts = attempts - 1` to undo the claim's increment, `in_flight_until = null`). `jitter(batchId, n)` is a deterministic 0..n derived from the batch UUID (no `Math.random` needed and stable across resume).

### A.4 Enqueue helper + paced fan-out ([FIX-1])

```ts
// src/lib/queue.ts
export async function enqueueWhatsAppCampaignBatch(batchId: string, options?: EnqueueOptions) {
  const client = getQStashClient(); if (!client) return null;   // QStash off → cron drains (A.6 degraded mode)
  const baseUrl = getBaseUrl(); if (!baseUrl) return null;
  const res = await client.publishJSON({
    url: `${baseUrl}/api/workers/whatsapp-campaign-batch`,
    body: { batchId },
    delay: options?.delay,
    retries: options?.retries ?? 2,            // claim is the idempotency guard; retries cover transport only
    // [FIX-1] optionally set QStash Flow-Control parallelism keyed by phoneNumberId (see note)
    flowControl: options?.flowControl,         // { key: `wa:${phoneNumberId}`, parallelism: K }
  });
  return res.messageId;
}
```

`startCampaign` step 6, canary-gated **per org** ([FIX-4]):

```ts
const useQStash = await isQStashCampaignsEnabled(campaign.organization_id); // [FIX-4] per-org, not global env
if (useQStash) {
  // insert N durable batch rows (UNIQUE(campaign_id,batch_index) makes a retried startCampaign idempotent)
  const inserted = await insertBatchRows(campaignId, batchItems);          // chunked .insert(...).select('id')

  // [FIX-1] PACE to the bucket drain rate, not a fixed fan-out.
  //   effectiveMps = TIER_CONFIG[instance.tier].mps * 0.9   (matches getThroughputLimiter)
  //   a batch of `batchSize` recipients takes ~ batchSize/effectiveMps seconds of token budget,
  //   so release one batch every that-many seconds:
  const effectiveMps = Math.floor(TIER_CONFIG[instance.tier].mps * 0.9);
  const secPerBatch  = CAMPAIGN_CONFIG.batchSize / effectiveMps;           // tier3: 100/72 ≈ 1.39s
  inserted.forEach((r, n) => {
    void enqueueWhatsAppCampaignBatch(r.id, {
      delay: Math.round(n * secPerBatch),                                   // last of 500 ≈ 695s — matches real drain
      flowControl: { key: `wa:${instance.phoneNumberId}`, parallelism: PARALLELISM_PER_NUMBER }, // belt-and-suspenders
    });
  });
} else {
  await campaignQueue.addBatch('send_campaign_batch', batchItems, { delay: 0, priority: 0 }); // legacy rollback path
}
```

**Why both pacing AND Flow-Control:** the `delay` schedule paces the *steady state*; QStash Flow-Control (`parallelism` per `phoneNumberId`) is the hard cap that protects against bursts on retry/cron re-drive. Either alone leaks under re-drive storms; together they bound aggregate offered load to ~the bucket. If your QStash plan lacks Flow-Control, the `delay` pacing is the floor and `PARALLELISM_PER_NUMBER` is enforced softly via the bucket (degraded but safe — starvation just shifts to mild queueing, no `dead` storm because of [FIX-5]).

### A.5 Idempotency / claim design + migration

```sql
CREATE TABLE IF NOT EXISTS whatsapp_campaign_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  batch_index int NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','failed','dead')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 8,          -- [FIX-5] was 5; raised so paced re-drives don't prematurely die
  last_error text,
  result jsonb,
  in_flight_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, batch_index)
);
CREATE INDEX IF NOT EXISTS idx_wa_campaign_batches_status_created
  ON whatsapp_campaign_batches (status, created_at) WHERE status IN ('pending','failed');

-- [FIX-3] lease (360s) is LONGER than worker maxDuration (300s) to absorb clock skew.
CREATE OR REPLACE FUNCTION claim_whatsapp_campaign_batch(p_id uuid)
RETURNS SETOF whatsapp_campaign_batches LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE whatsapp_campaign_batches
  SET status='processing', attempts=attempts+1,
      in_flight_until = now() + interval '360 seconds',   -- [FIX-3] > 300s maxDuration
      updated_at = now()
  WHERE id = p_id AND status IN ('pending','failed')
    AND (in_flight_until IS NULL OR in_flight_until < now())
    AND attempts < max_attempts
  RETURNING *;
END; $$;

-- [FIX-5] release a claim taken for a non-failure (circuit-open) without consuming an attempt.
CREATE OR REPLACE FUNCTION release_whatsapp_campaign_batch(p_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE whatsapp_campaign_batches
  SET status='pending', attempts = GREATEST(attempts - 1, 0),
      in_flight_until = NULL, updated_at = now()
  WHERE id = p_id AND status='processing';
END; $$;

CREATE OR REPLACE FUNCTION pending_whatsapp_campaign_batches_for_reprocess(
  p_older_than_seconds int DEFAULT 120, p_limit int DEFAULT 100)
RETURNS SETOF whatsapp_campaign_batches LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY SELECT * FROM whatsapp_campaign_batches
  WHERE status IN ('pending','failed') AND attempts < max_attempts
    AND (in_flight_until IS NULL OR in_flight_until < now())
    AND created_at < now() - (p_older_than_seconds || ' seconds')::interval
  ORDER BY created_at ASC LIMIT p_limit;
END; $$;

GRANT EXECUTE ON FUNCTION claim_whatsapp_campaign_batch(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION release_whatsapp_campaign_batch(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION pending_whatsapp_campaign_batches_for_reprocess(int,int) TO service_role;
ALTER TABLE whatsapp_campaign_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY wa_campaign_batches_service_role ON whatsapp_campaign_batches
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

**Three-layer idempotency** (was two in v1):

1. **Batch claim** (`claim_whatsapp_campaign_batch`) — one invocation transitions `pending/failed → processing`; duplicates get `skipped` 200. Lease 360s > 300s maxDuration ([FIX-3]).
2. **Recipient re-read** — `processBatchById` re-reads recipients by the IDs in `payload`, filtered to `status IN ('pending','queued')`, so already-`sent`/`failed`/`skipped` recipients are not re-touched. This also keeps `increment_campaign_sent` (`:600`) a correct running sum across re-drives (each run counts only what it sent).
3. **[FIX-2] `sending` pre-mark — closes the send-then-crash window.** Because the Meta Cloud API has **no send idempotency key** and `processBatch` writes `sent` (`:562-569`) only *after* the Meta call (`:550`) returns, a crash in between would leave the recipient `pending` and a re-drive would double-send. Fix: inside the per-recipient loop, transition the recipient `pending/queued → sending` **before** calling Meta:

   ```ts
   // before the Meta send:
   const { data: lock } = await supabase
     .from('whatsapp_campaign_recipients')
     .update({ status: 'sending', sending_at: new Date().toISOString() })
     .eq('id', recipient.id).in('status', ['pending','queued'])   // optimistic: only if still unsent
     .select('id').maybeSingle();
   if (!lock) { result.skipped++; continue; }                     // someone else has it / already past
   // ... Meta send ... on success → status 'sent'; on error → status 'failed'
   ```
   On a re-drive, recipients stuck in `sending` (crashed mid-flight) are **NOT** re-sent — they are excluded by the `pending/queued` re-read filter and surfaced by a small sweep (a cron or the recovery cron) that moves `sending` rows older than e.g. 10 min to `failed` with `error_message='ambiguous_send_quarantine'` for manual review. Trade: a rare crashed-mid-send recipient is left unsent-and-flagged rather than risk a duplicate — the correct bias for marketing sends. Requires adding `sending` to the recipient `status` CHECK and a `sending_at timestamptz` column (tiny migration on `whatsapp_campaign_recipients`).

### A.6 QStash config (retries, DLQ, delay/pacing, degraded mode)

- **Publish retries: 2.** Claim is the idempotency guard; the 200-on-failure contract stops QStash re-driving processing failures (the cron owns those). Mirrors `enqueueWhatsAppAiRespond`.
- **DLQ:** QStash DLQ catches messages that 5xx past retries; functionally our DB `status='dead'` is the queryable/alertable dead-letter store. Rely on DB `dead` for ops.
- **Delay/pacing ([FIX-1]):** `delay = round(batchIndex * batchSize / effectiveMps)` — matches the bucket drain rate; + QStash Flow-Control `parallelism` per `phoneNumberId` as the hard burst cap.
- **Degraded mode (QStash down) ([FIX-6]):** `enqueueWhatsAppCampaignBatch` returns null, rows stay `pending`, and only the recovery cron drains them at `p_limit=100/min`. For a 500-batch campaign that is ~5 min just to first-touch every batch — acceptable as a fallback, but **document it** and consider bumping `p_limit` or cron frequency only if QStash outages are observed. This is strictly a safety net, not the steady path.

### A.7 Vercel maxDuration / batch-size

- `maxDuration = 300` (Pro ceiling); **keep `batchSize = 100`**. Horizontal concurrency across numbers is the scale lever, not bigger batches.
- **[FIX-3]** Lease (`360s`) **exceeds** maxDuration (`300s`) so a timed-out invocation is re-claimable only after Vercel has surely killed it, with skew margin — never overlapping a live run.
- With Phase 1's in-worker dispatch, wall time per 100-recipient batch shrinks further (strictly safer vs the 300s cap). But note ([FIX-1]) that Phase 1 raises per-batch speed only up to the shared bucket — across many concurrent batches for one number, the bucket still governs aggregate, which is exactly why A.4 paces the fan-out.

### A.8 Canary flag — per-org ([FIX-4])

v1 used a single global `ENABLE_QSTASH_CAMPAIGNS` env boolean, which cannot canary one org and so could not deliver the A.13 mitigation ("gate per-org"). Replace with a **per-org gate**:

```ts
async function isQStashCampaignsEnabled(orgId: string): Promise<boolean> {
  if (process.env.ENABLE_QSTASH_CAMPAIGNS === 'all') return true;     // global on (post-ramp)
  if (process.env.ENABLE_QSTASH_CAMPAIGNS !== 'true') return false;   // global kill-switch (off)
  // 'true' => allowlist mode: check an org flag/column or an env allowlist
  return await orgHasFlag(orgId, 'qstash_campaigns');                 // e.g. organizations.feature_flags ? @> '["qstash_campaigns"]'
}
```

- Ramp: enable for one test org → observe exactly-once + `whatsapp_campaign_batches` health → add orgs → finally set env to `all`.
- **Rollback** = remove the org from the allowlist (or env→off). No redeploy. Already-published batches drain through the deployed worker; new campaigns for non-flagged orgs route to Railway.
- Worker + cron ship dark (inert with no rows).

### A.9 Retiring MessageQueue (campaignQueue) safely

Unchanged from v1: **keep** the class + `webhookQueue` + `campaignQueue` singletons. Delete only `lowPriorityQueue` (defer to Phase 7). Producer retirement: at 100% ramp, `startCampaign` stops calling `addBatch`; leave the `else` legacy branch one release as rollback, remove in Phase 7. **dead-alert caveat:** `whatsapp-dead-alert` watches `campaignQueue` Redis depth — after cutover that's always ~0, so add (Phase 7) an equivalent alert on `whatsapp_campaign_batches` rows stuck `pending/failed`/`dead`. Do not remove the existing alert while canary < 100%.

### A.10 Test plan

- **Unit:** `enqueueWhatsAppCampaignBatch` (null when QStash/baseUrl unset; url/body/retries/flowControl); worker (401 bad/missing sig in prod; 400 missing batchId; `skipped` 200 on empty claim; `ok` marks done; throw marks failed → 200; **[FIX-5]** `CIRCUIT_OPEN` → release-without-attempt + requeue 200, attempts unchanged).
- **Idempotency:** invoke worker twice same `batchId` → second `skipped`, recipients sent once. **[FIX-2]** simulate crash after Meta success / before `sent` commit (recipient left `sending`) → re-drive does NOT re-send; quarantine sweep flips it to `failed`.
- **Claim race:** two concurrent claims → exactly one row.
- **[FIX-3] Skew:** lease (360) > maxDuration (300) — cron does not re-drive a row whose `in_flight_until` is still future.
- **[FIX-1] Pacing:** for 500 inserted rows, assert `delay` is monotonic and last ≈ `500 * batchSize/effectiveMps`; assert Flow-Control key is per-`phoneNumberId`.
- **[FIX-4] Per-org canary:** flagged org → rows + publish, `addBatch` not called; non-flagged org → `addBatch`, no rows (extend `campaign-processor.test.ts`, which already mocks `campaignQueue.addBatch`).
- **Recovery / completion:** failed batch older than 120s re-enqueued; **[FIX-6]** `checkCampaignCompletion` no longer calls `campaignQueue.getStats()`; concurrent final batches don't double-write `completed` (guard: `update ... .eq('status','running')` so only the first transition wins).
- Commands: `npm run test -- campaign`, `npm run lint`, `npx tsc --noEmit`.

### A.11 Observability

`wlog` events: `whatsapp.campaign.batch_enqueued|claimed|done|failed|dead|requeued_circuit_open|send_quarantined`. Worker prefix `[whatsapp-campaign-batch-worker]`. Add `whatsapp_campaign_batches` depth (pending/failed/dead) + **[FIX-1]** an "offered-vs-drained MPS" gauge per number to `whatsapp/queue/stats/route.ts` so starvation is visible if pacing is ever misconfigured.

### A.12 Ordering / cross-phase deps ([FIX-1] sharpens this)

- **Phase 3 should land AFTER Phase 1 and Phase 4, not "independent".** Rationale: for a single number, Phase 3 adds no throughput — the bucket is the ceiling. Without Phase 1 each invocation is serial-slow; without Phase 4 the bucket stays low. Shipping Phase 3 first is only justified if your *current* pain is the Railway SPOF or you run many numbers/orgs concurrently. The pacing in A.4 depends on `TIER_CONFIG[tier].mps` — keep it reading the **single source** Phase 4 establishes.
- **Phase 2** `canSend` is Redis-backed, so it stays correct across many stateless invocations — no in-memory assumption broken. ✓
- **Phase 5** orthogonal (swap of the send client inside `processBatch` is transparent).
- **Phase 7** owns: delete `lowPriorityQueue`, remove legacy `addBatch` branch, swap dead-alert signal, optional Railway decommission.

### A.13 Risks & blast radius

- **Double-send — now mitigated at three layers** (batch claim + recipient re-read + [FIX-2] `sending` pre-mark/quarantine) and bounded by [FIX-3] lease>maxDuration and [FIX-4] true per-org canary. Residual: a recipient crashed mid-`sending` is left unsent-and-flagged (acceptable bias).
- **Starvation/`dead` storm — mitigated** by [FIX-1] drain-rate pacing + Flow-Control and [FIX-5] breaker-open-not-an-attempt + `max_attempts=8`.
- **Completion** keys off recipient `pending/queued` count (`:791-797`) — works under concurrency; [FIX-6] adds the `.eq('status','running')` guard against double `completed`.
- **Blast radius:** scheduled + manual campaign sends only; contained by per-org canary + env kill-switch. Webhook ingest, AI reply, automations, email untouched.
- **Cron budget:** +1 (35 total). Negligible.

---

## B) EXECUTION PROMPT (for a fresh coding agent)

> **Branch:** `claude/debug-console-error-FWrLE`. Read files via `git show claude/debug-console-error-FWrLE:<path>`.
>
> **Goal:** Migrate WhatsApp campaign batch sending from the Railway-polled Redis `MessageQueue` to QStash-driven Vercel worker invocations, mirroring the `whatsapp-webhook` async pattern. Add a durable batch table with atomic claim, a recovery cron, a **per-org** canary with instant rollback to Railway, **drain-rate-paced fan-out**, and a **`sending` pre-mark** that closes the send-then-crash double-send window. Do not touch the rate limiter.
>
> **Acceptance criteria:**
> 1. Migration creates `whatsapp_campaign_batches` + `claim_whatsapp_campaign_batch` + `release_whatsapp_campaign_batch` + `pending_whatsapp_campaign_batches_for_reprocess`, mirroring `20260522_whatsapp_webhook_events.sql`. **Lease in the claim = 360s (> the worker's 300s maxDuration).** `max_attempts` default 8. Add `sending` to the `whatsapp_campaign_recipients` status CHECK + a `sending_at` column (separate tiny migration).
> 2. `src/app/api/workers/whatsapp-campaign-batch/route.ts` mirrors `whatsapp-webhook/route.ts`: QStash `Receiver` verify (prod requires sig; dev verify-if-present else `x-internal-request`), parse `{batchId}`, `claim_whatsapp_campaign_batch`, no-claim → `{skipped:true}` 200, process, `markDone`/`markFailed`, **return 200 even on processing failure**. **On `err.code==='CIRCUIT_OPEN'`: call `release_whatsapp_campaign_batch` (no attempt burned) and re-enqueue with a deterministic 30–60s jitter delay, return 200.** `maxDuration=300`.
> 3. `src/lib/queue.ts` gains `enqueueWhatsAppCampaignBatch(batchId, options)` reusing `getQStashClient()`/`getBaseUrl()`, body `{batchId}`, `retries ?? 2`, optional `flowControl:{key,parallelism}`, returns messageId|null.
> 4. `campaign-processor.ts`: gate `startCampaign` step 6 behind **`isQStashCampaignsEnabled(organization_id)`** (per-org allowlist; env `ENABLE_QSTASH_CAMPAIGNS` ∈ {off, `true`=allowlist, `all`=global}). On-path: insert one batch row per sub-batch (`.select('id')`), then publish one QStash message each with **`delay = round(n * batchSize / floor(TIER_CONFIG[tier].mps*0.9))`** and `flowControl.key=`wa:${phoneNumberId}``. Off-path: existing `campaignQueue.addBatch` unchanged. Extract `processJob` body (status guard ~:397, RED guard ~:421, `processBatch` ~:454, completion ~:463) into public `processBatchById(batchId)` that loads the row, **re-reads recipients by payload IDs filtered to `status IN ('pending','queued')`**, runs guards + send loop, returns `ProcessResult`. The Railway loop calls `processBatchById` too.
> 5. In `processBatch`'s per-recipient loop, **optimistically transition `pending/queued → sending` before the Meta call** (`.update({status:'sending',sending_at})...in('status',['pending','queued']).select('id').maybeSingle()`; skip if no row). Keep `sent` on success, `failed` on error. Add a quarantine step (in the recovery cron) that flips `sending` rows older than 10 min → `failed` with `error_message='ambiguous_send_quarantine'`.
> 6. `src/app/api/cron/reprocess-whatsapp-campaign-batches/route.ts` mirrors `reprocess-whatsapp-pending/route.ts`: authorize, `pending_whatsapp_campaign_batches_for_reprocess`, re-enqueue each; also run the `sending` quarantine sweep. Register at `* * * * *` in `vercel.json`.
> 7. **[FIX-6]** Remove the unused `campaignQueue.getStats()` call in `checkCampaignCompletion` (:788); add `.eq('status','running')` to the `completed` update so concurrent final batches don't double-write. `wlog` events emitted. Tests pass; `tsc --noEmit` clean.
>
> **Anchors to copy from:** `whatsapp-webhook/route.ts` (verify+claim+200-on-failure+markDone/markFailed); `20260522_whatsapp_webhook_events.sql` (table+claim+pending+GRANT+RLS); `reprocess-whatsapp-pending/route.ts` (cron); `enqueueWhatsAppWebhook` in `queue.ts`; canary style `ENABLE_ASYNC_WEBHOOK` at `cloud/webhook/route.ts:106`; producer to replace `campaign-processor.ts:257`; the per-recipient loop `campaign-processor.ts:498-596`; completion `:786-827`.
>
> **Tests + commands:** `npm run test -- campaign`, `npm run lint`, `npx tsc --noEmit`.
>
> **Canary rollout:** apply migrations; deploy worker+cron dark; flag one test org; verify exactly-once via recipient `sent` counts + batch rows + that no recipient is left `sending`; ramp orgs; finally env→`all`. **Rollback:** drop org from allowlist (or env→off), no redeploy.
>
> **DO NOT:**
> - DO NOT delete `MessageQueue` / `campaignQueue` / `webhookQueue` (stats + dead-alert import them). `lowPriorityQueue` removal is Phase 7.
> - DO NOT remove the legacy `addBatch` branch — it is the rollback path.
> - DO NOT modify `rate-limiter.ts` / `canSend` / circuit-breaker logic — Phase 1/2.
> - DO NOT carry the recipient array in the QStash body — publish only `{batchId}`.
> - DO NOT return non-200 from the worker on a processing failure.
> - DO NOT set the lease equal to maxDuration — it MUST be longer (360 > 300).
> - DO NOT fan out with a fixed batches-per-second constant — pace by `batchSize/effectiveMps` and/or Flow-Control, or you recreate the starvation→`dead` storm.
> - DO NOT call Meta before the `sending` pre-mark — that reopens the double-send window.
> - DO NOT gate the canary on a single global boolean — it must be per-org.
> - DO NOT change `startCampaign`'s `{success,totalRecipients,totalBatches,error}` return shape.
