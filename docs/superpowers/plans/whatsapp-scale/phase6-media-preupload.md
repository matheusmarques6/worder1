# Phase 6 — Pre-upload media to a cached Media ID (instead of `{ link }`) — **v2**

Branch to implement on: `claude/debug-console-error-FWrLE`
Plan author scope: media pre-upload only.
Depends on: **Phase 0 (Foundations)** and **Phase 3 (QStash durable, re-driven batches)**. See "Phase 3 coupling" — it makes the stale-id handling MANDATORY, not optional.

---

## v2 CHANGELOG (adversarial-review fixes folded in)

- **[FIX-C1] (CRITICAL) — `media_type` is a CATEGORY, not a MIME type.**
  `src/types/campaigns.ts:80` declares `media_type?: 'image' | 'video' | 'document'`.
  `cloud-api.ts uploadMedia` (`:530`) derives Meta's `type` category via
  `mimeType.startsWith('image/')` / `'video/'` / `'audio/'` else `'document'`.
  Passing the bare category string `'image'` matches NONE of those `startsWith`
  checks → silently falls through to `'document'` → Meta rejects (code 100 on the
  Blob type mismatch, or accepts the wrong category and the send later fails).
  **Fix:** derive the REAL MIME from the fetched response's `Content-Type` header
  and pass THAT to `uploadMedia`. Use `media_type` only as a *family fallback*
  mapped to a representative MIME (`image`→`image/jpeg`, `video`→`video/mp4`,
  `document`→`application/pdf`). If the response MIME family disagrees with
  `media_type` (e.g. `media_type:'image'` but `Content-Type: application/pdf`),
  do NOT upload — return `undefined` and fall back to `{ link }`.

- **[FIX-C2] (CRITICAL) — start-time Media ID is embedded in the batch payload, which Phase 3 replays.**
  Phase 3 persists `CampaignBatchData` (incl. `mediaId`) and can re-drive a batch
  hours-to-days later. Meta can delete a Media ID before its ~30-day window (and
  our 20d TTL only governs re-upload at the NEXT *start*, not a replay of an
  already-enqueued batch). On replay the embedded id is dead and EVERY send in
  that batch hard-fails, because `buildTemplateComponents` chooses id-vs-link by
  truthiness only — it never reacts to a Meta error.
  **Fix (ships WITH this phase, not a follow-up):** add a MANDATORY **send-time
  fallback** in `processBatch`. On a media-not-found send error, `cacheDel` the
  key and re-send that SINGLE message with `{ link: mediaUrl }`. See the concrete
  sketch — note the meta-api error-shape constraint below.

- **[FIX-H1] — "never throw" is not enough; the `startCampaign` catch bricks the campaign.**
  `startCampaign`'s catch (`:272-289`) converts ANY thrown escape into a permanent
  `status:'failed'` update (`:277`). If the helper's internal try/catch ever leaks
  (e.g. an `await` rejects outside it), the whole campaign is bricked.
  **Fix:** (a) wrap the `resolveCampaignMediaId` CALL-SITE in `startCampaign` in
  its own `try/catch` that degrades to `mediaId = undefined`; (b) add an
  `AbortSignal.timeout(...)` to the media `fetch` so a hung download cannot stall
  the start path.

- **[FIX-H2] — enforce a HARD byte cap on the downloaded buffer.**
  `Content-Length` is advisory and frequently absent, so it cannot be the only
  guard. A 100 MB document × concurrent campaign starts is an OOM/stall hazard.
  **Fix:** check `Content-Length` when present (early reject), AND after
  `arrayBuffer()` enforce a hard cap on `bytes.byteLength`
  (image 5 MB / video 16 MB / document 100 MB; audio 16 MB if ever added) before
  calling `uploadMedia`. Combine with the fetch timeout from FIX-H1.

- **[FIX-M1] — re-anchored all line numbers against the real file (v1 anchors had drifted).**
  Corrected: `CampaignBatchData` is `:54-78` (not `:53`); the `instance` block is
  nested PER batch item inside the `batchItems.map` at `:246-251` (NOT a top-level
  var); `buildTemplateComponents` header media branch is `:657-664` (within the
  method at `:635`); media fields set at `:253-254`; `processBatch` destructure at
  `:485`; `buildTemplateComponents` call site at `:543`; start-failure catch at
  `:272-289`.

- **[FIX-M3] — URL-keyed cache vs signed/expiring URLs.**
  Confirmed `campaign.media_url` is free-form client input (`campaigns/route.ts:105`
  passes it straight to the row) and the in-product media library produces STABLE
  public URLs via `getPublicUrl` (`content/media/route.ts:56,124` — no signature,
  no rotating query). So `sha256(media_url)` is safe for the common case.
  **Fix/guard:** before hashing, strip the query string ONLY when the path looks
  content-addressed (stable filename in path); if a signed URL with a rotating
  query is detected and the path is NOT content-addressed, fall back to hashing
  the full URL and accept the cache miss (correctness over hit-rate). Never key on
  a value that rotates per request without this guard, or the cache always misses
  and the optimization is silently dead.

- **CONFIRMED-GOOD (kept from v1):** `uploadMedia` exists and returns `{ id }`
  (`cloud-api.ts:530`); `cacheGet`/`cacheSet`(`setex`, seconds)/`cacheDel` exist
  and swallow errors (`redis.ts:119/131/146`), storing the bare id string; media
  is per-campaign 1:1 with a single `.single()` instance (`:162`) carrying
  `phone_number_id` — so the per-`phoneNumberId` cache key is sufficient; the
  text-only no-op (`!mediaUrl || !mediaType` → `undefined`) is correct.

---

## A) IMPLEMENTATION PLAN

### Objective
Eliminate Meta's per-send media re-download. Today every image/video/document
campaign message sends `{ [mediaType]: { link: mediaUrl } }`, forcing Meta to
re-fetch `media_url` on EVERY message. Because media is a **per-campaign constant**
(verified below), upload it **once at campaign start**, obtain a Graph **Media ID**,
cache it, and send `{ [mediaType]: { id: mediaId } }`. Keep a `{ link }` fallback so
a failed upload or cache miss never blocks a campaign — and add a send-time
`{ link }` fallback (FIX-C2) so a stale id replayed by Phase 3 never bricks a batch.

### Premise check — per-campaign or per-recipient? (VERIFIED: per-campaign)
- `src/types/campaigns.ts:79-80` — campaign row has `media_url?: string` and
  `media_type?: 'image' | 'video' | 'document'` (single value per campaign).
- `campaign-processor.ts:253-254` — batch items copy `campaign.media_url` /
  `campaign.media_type` verbatim into every `CampaignBatchData`.
- `:485` `processBatch` destructures `mediaUrl, mediaType` and passes the SAME
  values to `buildTemplateComponents` for every recipient (`:543-547`).
- `supabase/campaigns-schema.sql:85-86` — `media_url TEXT`, `media_type VARCHAR(20)`.
  No per-recipient media column.
- Conclusion: one upload per campaign is the entire win. No per-message work.

### Does an upload helper already exist? (YES — reuse it, but feed it a real MIME — FIX-C1)
- `cloud-api.ts:530` `WhatsAppCloudAPI.uploadMedia(fileData: ArrayBuffer,
  mimeType: string, filename?: string): Promise<{ id: string }>`.
  - It builds `new Blob([fileData], { type: mimeType })` and derives the Meta
    `type` category from `mimeType.startsWith(...)` (`:533-541`). **This is exactly
    why we must pass a real MIME** (`image/jpeg`), not the category `'image'`.
  - POSTs `FormData` to `${META_BASE_URL}/${this.config.phoneNumberId}/media`
    (`:547`) — keyed implicitly by phone-number-id, matching Meta's constraint.
- `cloud-api.ts:829` `createWhatsAppCloudClient(config)` factory; `META_BASE_URL`
  re-exported at `:9`.
- `meta-api.ts:93` `sendTemplateMessage` is media-agnostic — it forwards whatever
  `components` it is given. **Send function needs NO change for the id-vs-link
  choice** (that lives in `buildTemplateComponents`). BUT note its error shape for
  FIX-C2 below.

**Decision:** do NOT write a new raw uploader. Add a thin **download → validate →
upload + cache** wrapper that calls `uploadMedia` (or Phase 5's unified equivalent).

### `meta-api.ts` error shape — load-bearing for FIX-C2
`sendTemplateMessage` (`:116-118`) does:
```ts
const data = await response.json();
if (!response.ok) {
  throw new Error(data.error?.message || 'Failed to send template');
}
```
It throws a **plain `Error` carrying only the message string** — `data.error.code`
and `error_subcode` are DISCARDED. The DO-NOT list forbids changing send logic, so
the send-time fallback (FIX-C2) must detect media-not-found by **matching the error
message string**, not a numeric code. Meta's media-not-found surfaces with messages
containing phrases like "media", "not found", "could not be retrieved", or
"unsupported" for a dead id (subcode 2655007 / code 131052). Match
case-insensitively on `/media.*(not found|could not|unsupported|invalid)/i` (keep
the matcher in one named predicate so it is easy to widen). If we later want exact
code-based detection, the minimal, surgical option is to attach `error.code` to the
thrown Error in `meta-api.ts` — but that is OUT OF SCOPE here unless Phase 5/Phase 3
already touch that file; default to string-matching.

### Redis cache — already-available primitives (CONFIRMED-GOOD)
`src/lib/redis.ts`:
- `cacheGet<T>(key)` (`:119`), `cacheSet(key, value, ttlSeconds)` (`:131`, uses
  `redis.setex(key, ttlSeconds, value)`), `cacheDel(key)` (`:146`),
  `isRedisConfigured()` (`:35`). All swallow errors → safe non-fatal cache.
- Existing `CACHE_PREFIX` (`:92`) and `CACHE_TTL` (`:71`) are plain object literals
  (no `WA_*` entries yet). Add additively:
  - `CACHE_PREFIX.WA_MEDIA = 'wa:media:'`
  - `CACHE_TTL.WA_MEDIA_ID = 20 * 24 * 60 * 60` (20 days — under Meta's ~30d expiry,
    so a cached id is naturally re-uploaded at the next *start* before Meta drops it.
    This does NOT protect already-enqueued batches — that is FIX-C2's job.)

#### Redis key schema
```
wa:media:<phoneNumberId>:<sha256(stableMediaUrl)>  ->  <mediaId>   (TTL 20 days)
```
- Keying by `phoneNumberId` is mandatory: a Media ID uploaded by phone A is invalid
  for phone B. The campaign's single `.single()` instance (`:162`) provides one
  `phone_number_id`, so this key is sufficient (CONFIRMED-GOOD).
- `stableMediaUrl` = the url with rotating query stripped IFF content-addressed,
  else the full url (FIX-M3). Hash with `node:crypto` `createHash('sha256')`.
- Value is the bare id string (matches what `cacheSet`/`setex` stores).

### Where in the lifecycle does the upload happen?
**At campaign START** (`startCampaign`, `:108`), AFTER the instance is resolved
(`:162-169`, gives `phone_number_id` + `access_token`) and BEFORE the
`batchItems.map` (`:234`). Rationale: instance/token known; runs exactly once per
campaign; resolve one `mediaId` and thread it into every `CampaignBatchData`.
Do NOT upload in `processBatch`/per-batch — that risks N uploads under concurrency
and (with Phase 3) per-replay.

**FIX-H1 call-site guard** (this is the only new logic in `startCampaign`):
```ts
let mediaId: string | undefined
try {
  mediaId = await resolveCampaignMediaId({
    phoneNumberId: instance.phone_number_id,
    accessToken: instance.access_token,
    mediaUrl: campaign.media_url,
    mediaType: campaign.media_type,
  })
} catch (e: any) {
  // Defense in depth: resolveCampaignMediaId must never throw, but if it does,
  // a thrown error here would hit the startCampaign catch (:272) and brick the
  // campaign with status:'failed'. Degrade silently to the link path instead.
  wlog.warn('whatsapp.media.preupload.failed', { campaign_id: campaignId, reason: e?.message })
  mediaId = undefined
}
```

Threading (FIX-M1 anchors):
- `CampaignBatchData` (`:54-78`): add `mediaId?: string` (alongside `mediaUrl?`,
  `mediaType?` at `:77-78`).
- In the `batchItems.map` (`:234-262`): add `mediaId` to each emitted object
  (next to `mediaUrl: campaign.media_url` at `:253`). The `instance` block is
  nested per item at `:246-251` — do NOT add `mediaId` inside `instance`.
- `processBatch` (`:485`): add `mediaId` to the destructure.
- Pass `mediaId` as the 4th arg to `buildTemplateComponents` (`:543-547`).

### `resolveCampaignMediaId` helper design (FIX-C1, H1, H2, M3)
New function:
```ts
export async function resolveCampaignMediaId(params: {
  phoneNumberId: string
  accessToken: string
  mediaUrl?: string
  mediaType?: 'image' | 'video' | 'document' | string
}): Promise<string | undefined>
```
Body (entire thing wrapped in one `try/catch` → on ANY error log
`whatsapp.media.preupload.failed` and return `undefined`; NEVER throw):
1. If `!mediaUrl || !mediaType` → return `undefined` (text-only no-op).
2. `key = \`${CACHE_PREFIX.WA_MEDIA}${phoneNumberId}:${sha256(stableUrl(mediaUrl))}\``.
   `cacheGet<string>(key)` hit → log `.hit`, return it.
3. Miss (`.miss`): fetch with timeout (FIX-H1):
   ```ts
   const res = await fetch(mediaUrl, { signal: AbortSignal.timeout(15000) })
   if (!res.ok) { log('.failed', { http: res.status }); return undefined }
   ```
4. **MIME reconciliation (FIX-C1):**
   ```ts
   const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
   const fam = (s: string) => s.startsWith('image/') ? 'image'
             : s.startsWith('video/') ? 'video'
             : s.startsWith('audio/') ? 'audio' : 'document'
   const FALLBACK_MIME = { image: 'image/jpeg', video: 'video/mp4', document: 'application/pdf' }
   const realMime = ct || FALLBACK_MIME[mediaType] // family fallback when header absent
   // disagreement guard: if header present and its family != declared media_type → bail
   if (ct && fam(ct) !== mediaType) { log('.failed', { reason: 'mime_family_mismatch', ct, mediaType }); return undefined }
   ```
   Pass `realMime` (a true MIME) to `uploadMedia`, never the category.
5. **Content-Length early reject (FIX-H2, advisory):**
   ```ts
   const CAPS = { image: 5*1024*1024, video: 16*1024*1024, document: 100*1024*1024, audio: 16*1024*1024 }
   const cap = CAPS[mediaType] ?? CAPS.document
   const cl = Number(res.headers.get('content-length') || 0)
   if (cl && cl > cap) { log('.oversize', { cl, cap }); return undefined }
   ```
6. **Download + HARD cap (FIX-H2):**
   ```ts
   const buf = await res.arrayBuffer()
   if (buf.byteLength > cap) { log('.oversize', { bytes: buf.byteLength, cap }); return undefined }
   ```
7. Upload via the unified client (Phase 5) if landed, else
   `createWhatsAppCloudClient({ phoneNumberId, accessToken }).uploadMedia(buf, realMime)`
   → `{ id }`.
8. `cacheSet(key, id, CACHE_TTL.WA_MEDIA_ID)` (non-fatal); log `.uploaded`
   `{ phoneNumberId, mediaType, bytes: buf.byteLength, ms }`; return id.

`stableUrl(mediaUrl)` (FIX-M3): if the URL has a query string AND the path segment
looks content-addressed (e.g. ends in a stable filename/hash), return the
origin+path without query; otherwise return the full URL. Keep this in one small
pure helper with a comment so the heuristic is auditable.

### `buildTemplateComponents` — `id` with `link` fallback (FIX-M1 anchors)
Method at `:635`; header media branch at `:657-664`. Change signature to accept
`mediaId`, prefer `id`, else `link`:
```ts
private buildTemplateComponents(
  variables: Record<string, string>,
  mediaUrl?: string,
  mediaType?: string,
  mediaId?: string,            // NEW (FIX-C2: this is the start-time id; send-time still falls back)
): any[] {
  const components: any[] = []
  // ... body params unchanged (:640-656) ...
  if (mediaUrl && mediaType) {                          // :657
    const mediaParam = mediaId ? { id: mediaId } : { link: mediaUrl }
    components.push({
      type: 'header',
      parameters: [{ type: mediaType, [mediaType]: mediaParam }],
    })
  }
  return components
}
```
Call site `:543` passes `mediaId` (from `data.mediaId`) as the 4th arg.

### Send-time fallback — MANDATORY (FIX-C2, ships in this phase)
In `processBatch`'s per-recipient `try` (the send is at `:550-561` inside
`this.whatsAppRetry(() => sendTemplateMessage({ ... }))`): after the retried send
rejects, before recording the recipient as `failed` (`:580-593`), check if this was
a media-not-found error on an id-based header AND a fallback is possible:
```ts
// build once per recipient with the start-time mediaId
let components = this.buildTemplateComponents(recipient.resolved_variables, mediaUrl, mediaType, mediaId)
try {
  const sendResult = await this.whatsAppRetry(() => sendTemplateMessage({ ...args, components }))
  // success path unchanged (:560-573)
} catch (err: any) {
  // FIX-C2: a Phase-3 replay can carry an expired Media ID. If the send failed
  // because the id is dead, invalidate cache and re-send THIS message with { link }.
  if (mediaId && mediaUrl && mediaType && isMediaNotFoundError(err)) {
    await cacheDel(`${CACHE_PREFIX.WA_MEDIA}${instance.phoneNumberId}:${sha256(stableUrl(mediaUrl))}`)
    const linkComponents = this.buildTemplateComponents(recipient.resolved_variables, mediaUrl, mediaType /* no id */)
    const retryResult = await this.whatsAppRetry(() => sendTemplateMessage({ ...args, components: linkComponents }))
    // record success from retryResult; log whatsapp.media.preupload.sendfallback
  } else {
    throw err  // existing catch (:577) records failed as today
  }
}
```
Where `isMediaNotFoundError(err)` is the single string-matching predicate described
in the meta-api error-shape section (since `error.code` is not propagated). Keep the
inner re-send guarded so a SECOND failure rethrows into the existing failed-path —
no infinite loop, no per-recipient extra network when `mediaId` is absent.

> Implementation note: factor the send into a small local helper so the
> id-then-link retry doesn't duplicate the supabase success/failed update blocks
> (`:560-573` / `:580-593`). The structural change is: wrap the existing
> single send in the id→link retry; success/failure bookkeeping is unchanged.

### Phase 3 coupling (why FIX-C2 is non-negotiable here)
Phase 3 makes batches **durable and re-driven** (QStash). The `mediaId` baked into a
`CampaignBatchData` at start time can be replayed after Meta has expired/deleted the
id. Without FIX-C2, a replay turns one stale id into a whole-batch hard-fail with no
recovery. The 20d TTL only forces a fresh upload at the NEXT campaign start — it does
nothing for an in-flight enqueued batch. Therefore the send-time `cacheDel` +
`{ link }` re-send MUST ship in Phase 6, in lockstep with Phase 3.

### Test plan (vitest — pattern from `campaign-processor.test.ts`, mocks at ~`:35-46`)
1. `buildTemplateComponents`: `mediaId` present → header param `{ id }`; `mediaId`
   absent + `mediaUrl` present → `{ link }`; no media → no header component.
   (Private method — test via the components passed to the mocked
   `sendTemplateMessage` in a `processBatch` run.)
2. `resolveCampaignMediaId`:
   - cache hit → cached id, no `fetch`, no upload.
   - miss → `fetch` returns `Content-Type: image/jpeg` + bytes → `uploadMedia`
     called **with `'image/jpeg'` (NOT `'image'`)** → `cacheSet` with correct
     key+TTL → returns id. **(FIX-C1 assertion)**
   - `media_type:'image'` but `Content-Type: application/pdf` → `undefined`, no
     upload. **(FIX-C1 disagreement guard)**
   - no `Content-Type` header → uses family fallback MIME `'image/jpeg'`, uploads.
   - `Content-Length` over cap → `undefined`, no download/upload. **(FIX-H2)**
   - buffer over cap with absent/lying `Content-Length` → `undefined` after
     download. **(FIX-H2 hard cap)**
   - fetch rejects / aborts (timeout) → `undefined`, logged. **(FIX-H1)**
   - upload throws → `undefined`. - no `mediaUrl` → `undefined`, no fetch.
3. `startCampaign`: with media set, `resolveCampaignMediaId` invoked once and the
   resulting `mediaId` appears on enqueued `batchItems` (assert `campaignQueue.addBatch`
   mock args). And: helper rejecting → start still succeeds, batches carry
   `mediaId: undefined`, status NOT `failed`. **(FIX-H1)**
4. `processBatch` send-time fallback (FIX-C2): first `sendTemplateMessage` rejects
   with a media-not-found message while `mediaId` set → `cacheDel` called →
   second call made with `{ link }` components → recipient recorded `sent`. And:
   non-media error → no second call, recipient `failed` (unchanged). And:
   `mediaId` absent → never a second call.
Commands: `npx vitest run src/lib/whatsapp/campaign-processor.test.ts
src/lib/whatsapp/media-preupload.test.ts`; `npx tsc --noEmit`; `npm run lint`.

### Observability
- `.hit` / `.miss` (cache) → hit rate. - `.uploaded` { phoneNumberId, mediaType, bytes, ms }.
- `.failed` { reason } / `.oversize` { bytes|cl, cap } → fallback alerting.
- `.sendfallback` { campaignId, reason: 'media_id_expired' } → counts Phase-3
  replays that hit a dead id (a spike signals TTL/replay-window mismatch).
Use the existing `wlog` (`campaign-processor.ts:13`).

### Ordering / deps vs Phase 5 (unify clients)
The upload helper should live next to the unified send so media and message paths
share one client/config.
- **Phase 5 first (preferred):** put `resolveCampaignMediaId` in the unified client
  module; call the unified `uploadMedia`; keep send media-agnostic.
- **Phase 6 first:** implement in standalone `src/lib/whatsapp/media-preupload.ts`
  reusing `WhatsAppCloudAPI.uploadMedia` via `createWhatsAppCloudClient`
  (`cloud-api.ts:829`). Phase 5 later re-homes the upload call without touching
  `buildTemplateComponents`, the cache, or the FIX-C2 send-time fallback.
- Do NOT hard-couple `buildTemplateComponents` to any client — it consumes a string.

### Risks (residual)
- **Stale id on replay:** addressed by FIX-C2 send-time `cacheDel` + `{ link }`.
  Residual: the fallback fires per-recipient, so a fully-expired batch does one
  extra failed-send round-trip per recipient before falling back. Acceptable;
  `.sendfallback` makes it observable.
- **Error-code detection is string-based (meta-api discards `error.code`):** a Meta
  wording change could miss the media-not-found match → that recipient records
  `failed` instead of falling back (no worse than today's link-only baseline; it
  does NOT brick the batch). Mitigation: keep the matcher broad and centralized.
- **MIME family fallback when `Content-Type` absent:** `image/jpeg` for a PNG/WebP
  still uploads fine (Meta sniffs); the representative MIME only sets the Blob type.
  Low risk.
- **Cache/Redis down:** `cacheGet`/`cacheSet` swallow → behaves as miss → upload
  attempted → if that fails, link fallback. No campaign blocked.
- **Double upload under concurrency:** start runs once per campaign; SETNX lock is
  over-engineering for v1.

### Blast radius (minimal, reversible)
- `campaign-processor.ts`: +`mediaId?` on `CampaignBatchData` (`:78`); guarded
  helper call in `startCampaign`; `mediaId` threaded through map/destructure/4th
  arg; `id`-vs-`link` branch in `buildTemplateComponents`; send-time fallback wrap
  in `processBatch`. No change to rate limiting, retries, or `sendTemplateMessage`.
- `redis.ts`: +2 constants (additive).
- New module + tests. **No DB migration** (cache-only; no `media_id` column added).
  Revert is trivial — the `{ link }` path is the standing fallback.

---

## B) EXECUTION PROMPT (for a fresh coding agent)

> You are implementing **Phase 6 v2: pre-upload campaign media to a cached Meta
> Media ID** on branch `claude/debug-console-error-FWrLE` (Next.js 14 + Supabase +
> Upstash Redis + WhatsApp Cloud/Graph API). Make **minimal, reversible** changes
> and KEEP a working `{ link }` fallback at BOTH start time and send time. This
> phase has a hard dependency on **Phase 3** (durable, re-driven batches) — the
> send-time fallback (step 5) is MANDATORY, not optional.
>
> ### Goal
> Today each campaign send uses `{ [mediaType]: { link: mediaUrl } }`, forcing Meta
> to re-download on every message. Media is a per-campaign constant
> (`campaign.media_url` / `media_type`). Upload it ONCE at campaign start to get a
> Media ID, cache it (Redis, keyed by phone-number-id + url), and send
> `{ [mediaType]: { id: mediaId } }` — falling back to `{ link }` on any failure or
> cache miss, AND falling back at SEND TIME if a replayed id is dead.
>
> ### Critical correctness facts (do not skip — these are the v2 fixes)
> - **[C1] `media_type` is a CATEGORY** (`'image'|'video'|'document'`,
>   `src/types/campaigns.ts:80`), NOT a MIME. `cloud-api.ts uploadMedia` (`:530`)
>   derives Meta's category via `mimeType.startsWith('image/')`. Passing `'image'`
>   matches nothing → defaults to `'document'` → Meta rejects. You MUST pass the
>   REAL MIME from the fetched response's `Content-Type`; use `media_type` only as a
>   family fallback (`image`→`image/jpeg`, `video`→`video/mp4`,
>   `document`→`application/pdf`). If the header's family disagrees with
>   `media_type`, do NOT upload — return `undefined`.
> - **[C2] start-time id is embedded in the batch and Phase 3 can replay it after
>   Meta deletes it.** `buildTemplateComponents` only picks id-vs-link by
>   truthiness; it never reacts to a send error. You MUST add a send-time fallback
>   in `processBatch`: on a media-not-found send error, `cacheDel` the key and
>   re-send THAT message with `{ link }`.
> - **[H1] never-throw is not enough:** `startCampaign`'s catch (`:272-289`) turns
>   any thrown error into permanent `status:'failed'` (`:277`). Wrap the
>   `resolveCampaignMediaId` call-site in its own try/catch (→ `mediaId=undefined`)
>   AND put `AbortSignal.timeout(15000)` on the media `fetch`.
> - **[H2] enforce a HARD byte cap** on the downloaded buffer (image 5MB / video
>   16MB / document 100MB) after `arrayBuffer()`, plus the `Content-Length` early
>   reject (it is advisory and often absent).
> - **[M3] cache key:** strip the query string before hashing ONLY if the URL path
>   is content-addressed; else hash the full URL. (Campaign media URLs are normally
>   stable `getPublicUrl` links — `content/media/route.ts:56` — but the field is
>   free-form client input.)
> - **meta-api error shape:** `sendTemplateMessage` (`meta-api.ts:116-118`) throws
>   `new Error(data.error?.message)` and DISCARDS `error.code`. Your
>   media-not-found detector MUST match the message STRING (centralize it in one
>   predicate `isMediaNotFoundError`). Do NOT modify `meta-api.ts`.
>
> ### Files & anchors (re-anchored — read first via the repo)
> - `src/lib/whatsapp/campaign-processor.ts`
>   - `CampaignBatchData` `:54-78` (`mediaUrl?`/`mediaType?` at `:77-78`).
>   - `startCampaign` `:108`; instance resolved `:162`; `batchItems.map` `:234-262`;
>     `instance` block nested per item `:246-251`; media fields `:253-254`;
>     start-failure catch `:272-289` (sets `status:'failed'` at `:277`).
>   - `processBatch` `:485` (destructure `mediaUrl, mediaType`); send call
>     `:550-561`; success bookkeeping `:560-573`; failed bookkeeping `:577-593`.
>   - `buildTemplateComponents` `:635`; header media branch `:657-664`; call site
>     `:543-547`. `wlog` imported `:13`.
> - `src/lib/whatsapp/cloud-api.ts` — `uploadMedia(ArrayBuffer, mimeType,
>   filename?) => {id}` `:530` (derives category from MIME `:533-541`);
>   `createWhatsAppCloudClient` `:829`; `META_BASE_URL` re-export `:9`.
> - `src/lib/whatsapp/meta-api.ts` — `sendTemplateMessage` `:93` (error shape above);
>   DO NOT change it.
> - `src/lib/redis.ts` — `cacheGet` `:119`, `cacheSet`(setex) `:131`, `cacheDel`
>   `:146`, `isRedisConfigured` `:35`, `CACHE_PREFIX` `:92`, `CACHE_TTL` `:71`.
> - Tests: `src/lib/whatsapp/campaign-processor.test.ts` (vitest, `vi.mock` at
>   `:35-46`).
>
> ### Edits
> 1. **`redis.ts`** — additive: `CACHE_PREFIX.WA_MEDIA = 'wa:media:'`;
>    `CACHE_TTL.WA_MEDIA_ID = 20 * 24 * 60 * 60`.
> 2. **New module** `src/lib/whatsapp/media-preupload.ts` exporting
>    `resolveCampaignMediaId(params)` and `isMediaNotFoundError(err)` and a small
>    `stableUrl(url)` + `sha256(s)` helper. Behaviour: text-only no-op; cache
>    hit/miss; fetch with `AbortSignal.timeout(15000)`; MIME reconciliation +
>    disagreement guard (C1); Content-Length reject + post-download hard cap (H2);
>    upload with the REAL MIME; `cacheSet` with the 20d TTL; whole body in one
>    try/catch → log `whatsapp.media.preupload.failed`, return `undefined`, NEVER
>    throw. Use `wlog` from `@/lib/observability/whatsapp-logger`.
> 3. **`campaign-processor.ts`**:
>    - Add `mediaId?: string` to `CampaignBatchData` (`:78`).
>    - In `startCampaign`, after the instance is resolved and before the
>      `batchItems.map` (~`:233`), add the **guarded** call (H1):
>      ```ts
>      let mediaId: string | undefined
>      try {
>        mediaId = await resolveCampaignMediaId({
>          phoneNumberId: instance.phone_number_id,
>          accessToken: instance.access_token,
>          mediaUrl: campaign.media_url,
>          mediaType: campaign.media_type,
>        })
>      } catch (e: any) {
>        wlog.warn('whatsapp.media.preupload.failed', { campaign_id: campaignId, reason: e?.message })
>        mediaId = undefined
>      }
>      ```
>      Add `mediaId` to each batch item in the map (next to `mediaUrl` at `:253`,
>      NOT inside the nested `instance` block).
>    - In `processBatch` (`:485`) destructure `mediaId`.
>    - Update `buildTemplateComponents` (`:635`): new `mediaId?` param;
>      `const mediaParam = mediaId ? { id: mediaId } : { link: mediaUrl }`. Pass
>      `mediaId` as 4th arg at the call site (`:543`).
>    - **Send-time fallback (C2)** in `processBatch`'s per-recipient try: build
>      components with `mediaId`; on send rejection, if `mediaId && mediaUrl &&
>      mediaType && isMediaNotFoundError(err)` → `cacheDel(key)` and re-send once
>      with `{ link }` components, then record success; otherwise rethrow into the
>      existing failed-path (`:577`). Guard the inner re-send so a second failure
>      rethrows (no loop). Log `whatsapp.media.preupload.sendfallback`.
>    - Import `resolveCampaignMediaId`, `isMediaNotFoundError`, the key helpers,
>      `cacheDel`, `CACHE_PREFIX` as needed.
> 4. **Tests** — extend `campaign-processor.test.ts` and add
>    `media-preupload.test.ts` per the Test plan above, including the C1 assertion
>    (upload called with `'image/jpeg'` not `'image'`), the H2 hard-cap case, the
>    H1 helper-throws-but-start-succeeds case, and the C2 send-time fallback cases.
>    Mock global `fetch` (with `headers.get`) and the client `uploadMedia`.
>
> ### Acceptance criteria
> - Campaign with media uploads exactly once at start; `uploadMedia` receives a
>   real MIME (e.g. `image/jpeg`), never the bare category. Subsequent sends use
>   `{ id }`.
> - Cache hit on re-run of the same (phone-number-id, url) → no re-upload.
> - Any start-side failure (fetch/timeout/upload/redis/oversize/mime-mismatch) →
>   silent fallback to `{ link }`; campaign starts; status NEVER `failed` from the
>   media path; no throw escapes the call-site.
> - On a replayed batch whose id is dead, the send-time fallback `cacheDel`s and
>   re-sends with `{ link }`; that recipient is `sent`, not `failed`.
> - Key includes phone-number-id; TTL = 20 days.
> - `npx tsc --noEmit`, `npm run lint`, and `npx vitest run
>   src/lib/whatsapp/campaign-processor.test.ts
>   src/lib/whatsapp/media-preupload.test.ts` all pass.
>
> ### Do NOT
> - Do NOT pass `media_type` (a category) as the MIME to `uploadMedia` — derive the
>   real MIME from the response `Content-Type`. (C1)
> - Do NOT rely on truthiness alone for the media id — keep the send-time
>   `cacheDel` + `{ link }` fallback for replayed/expired ids. (C2)
> - Do NOT let `resolveCampaignMediaId` (or its call-site) throw into
>   `startCampaign`'s catch — it would set `status:'failed'` permanently. (H1)
> - Do NOT trust `Content-Length` alone — enforce the post-download hard byte cap.
>   (H2)
> - Do NOT modify `sendTemplateMessage` / `meta-api.ts` send logic; detect
>   media-not-found by message string. - Do NOT add a DB column / migration.
> - Do NOT upload per-recipient or per-batch — only once in `startCampaign`.
> - Do NOT hard-couple `buildTemplateComponents` to a specific client (string in).
> - If **Phase 5 (unify clients)** is reshaping the send client, place the upload
>   behind the unified client and keep the upload step swappable.
