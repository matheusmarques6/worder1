# Outbound Webhooks — Design Spec

**Status:** Approved (brainstorming)
**Date:** 2026-04-19
**Owner:** Matheus Marques
**Related code:** `src/lib/events.ts`, `src/app/api/webhooks/shopify/route.ts`

---

## 1. Problem

Worder receives inbound webhooks from many providers (Shopify, WhatsApp Cloud/Evolution, Resend, Klaviyo, custom flows) but has **no outbound mechanism** for third-party systems to subscribe to Worder events. Customers integrating ERPs, BI tools, fulfillment apps, or internal automations have no standard contract to listen to "order paid", "tracking created", "browse abandoned", etc.

This spec defines the v1 outbound webhook system: normalized events emitted by Worder, per-store subscriptions, signed delivery with retries, and a customer-facing UI to manage subscriptions and inspect delivery logs.

## 2. Goals & Non-Goals

### Goals
- Allow customers to subscribe their external systems to Worder events via configurable HTTP webhooks.
- Provide a stable, normalized event contract decoupled from upstream providers (so swapping Shopify for another commerce engine doesn't break integrators).
- Deliver reliably (at-least-once, exponential retry, crash-safe persistence).
- Expose a UI for subscription management, delivery logs, manual replay, and live testing.
- Cover 10 high-value events for the BR commerce use case (orders, payments, shipping, browse abandonment).
- Be safe by default: no SSRF, no plaintext secrets at rest, RLS on all tables containing PII, LGPD-aware retention.

### Non-Goals (v1)
- No formal Dead Letter Queue UI (deliveries that fail all retries simply stay in `failed` status; manual replay is supported).
- No multi-store subscriptions in a single record (subscription is strictly per-store).
- No event versioning beyond `version: "1"` flag (breaking changes will require a v2 spec).
- No internal-only event subscriptions (e.g., `automation.triggered`); only the 10 events listed.
- No automated LGPD data-erasure propagation across delivery history. Retention is the safety net (see §7).

## 3. Event Catalog (v1)

10 normalized event types:

| Event | Source | Notes |
|---|---|---|
| `order.created` | Shopify webhook (`orders/create`) | Already emitted via EventBus |
| `order.paid` | Shopify webhook (`orders/paid`) | Already emitted via EventBus |
| `order.fulfilled` | Shopify webhook (`orders/fulfilled`) | Already emitted via EventBus |
| `order.cancelled` | Shopify webhook (`orders/cancelled`) | Already emitted via EventBus |
| `checkout.abandoned` | `abandoned-cart.ts` cron | Needs `EventBus.emit` instrumentation |
| `customer.created` | Shopify webhook + contact creation | Needs explicit emit on first creation |
| `shipment.tracking_created` | Shopify `fulfillments/create` (`processFulfillmentEvent` at `route.ts:1081`) | Needs EventBus emit (today only writes CDP event) |
| `payment.pix.abandoned` | `abandoned-cart.ts` cron, filtered by `payment_gateway` | New emit path |
| `payment.boleto.abandoned` | `abandoned-cart.ts` cron, filtered by `payment_gateway` | New emit path |
| `browse.abandoned` | **New cron detector** | Detects `viewed_product` without subsequent `added_to_cart`/`placed_order` within 30min–4h window |

## 4. Architecture

The dispatcher uses a **transactional outbox** to guarantee no events are lost if the process dies between EventBus emission and QStash enqueue.

```
[Shopify webhook] ──┐                ┌────────────────────────────┐
                    │                │  outbound_dispatcher        │
[WhatsApp webhook]──┼─► EventBus ───►│  (sync listener, blocks     │
                    │  .emit(...)    │   inbound handler return)   │
[Browse detector]───┘                │                             │
   (new cron)                        │  1. derive deterministic    │
                                     │     event_id (idempotent)   │
                                     │  2. INSERT webhook_deliv.   │
                                     │     (status='pending') —    │
                                     │     UNIQUE(sub_id,event_id) │
                                     │     swallows duplicates     │
                                     │  3. enqueue QStash job      │
                                     │     using delivery.id as    │
                                     │     dedup key               │
                                     └──────────────┬──────────────┘
                                                    │
                  ┌─────────────────────────────────┤
                  │ Stuck-delivery sweeper          │
                  │ /api/cron/webhook-deliveries-   │
                  │ sweeper (every 5min)            │
                  │ Re-enqueues `pending`/`retrying`│
                  │ rows with no QStash activity in │
                  │ last 5min (handles enqueue      │
                  │ failure between INSERT and POST)│
                  └─────────────────────────────────┘
                                                    ▼
                                     ┌────────────────────────────┐
                                     │  /api/workers/webhook-      │
                                     │  delivery (POST per job)    │
                                     │                             │
                                     │  - claim row atomically:    │
                                     │    UPDATE...SET status=     │
                                     │    'in_flight' WHERE id=$1  │
                                     │    AND status IN ('pending',│
                                     │    'retrying') RETURNING *  │
                                     │    (no row → another worker │
                                     │    has it, abort)           │
                                     │  - sign HMAC SHA-256        │
                                     │  - POST customer URL        │
                                     │  - 2xx → delivered          │
                                     │  - 4xx (≠408/429) → failed  │
                                     │  - 5xx/timeout/429 →        │
                                     │    QStash retries           │
                                     └────────────────────────────┘
```

**Crash-safety invariants:**
- Inbound webhook handler MUST `await` `outbound_dispatcher.dispatch(...)` before responding 200. The dispatcher's only async fallible step is the QStash enqueue — if it fails, the row is already in `pending` and the sweeper will re-enqueue it within 5min.
- Browse-abandoned detector runs from cron (no inbound handler to race with) and follows the same INSERT-then-enqueue order.
- QStash message dedup key = `delivery.id` UUID, so sweeper re-enqueues are safe (QStash will not double-deliver within its dedup window).

### New Components

| Path | Purpose |
|---|---|
| `src/lib/webhooks/outbound-dispatcher.ts` | Single EventBus listener; derives deterministic event_id, finds matching subscriptions, INSERTs deliveries (UNIQUE swallows dups), enqueues jobs |
| `src/lib/webhooks/event-id.ts` | Deterministic `event_id` derivation: `evt_` + base32(sha256(source + ":" + source_event_id + ":" + event_type)) |
| `src/lib/webhooks/payload-builder.ts` | Builds normalized payload per event_type (versioned schema); enforces 256KB max with truncation strategy (see §7) |
| `src/lib/webhooks/signature.ts` | HMAC SHA-256 sign (with primary + previous secret during rotation) + constant-time verify |
| `src/lib/webhooks/safe-fetch.ts` | Custom undici Agent with `connect` hook validating resolved IP against blocklist; `redirect: 'manual'` enforced |
| `src/lib/webhooks/secret-store.ts` | Encrypts secrets with `pgsodium`/app KMS at write; decrypts in worker only |
| `src/app/api/workers/webhook-delivery/route.ts` | QStash worker: claims row atomically, POSTs to customer URL via safe-fetch, updates delivery status |
| `src/app/api/cron/webhook-deliveries-sweeper/route.ts` | Re-enqueues stuck `pending`/`retrying` rows |
| `src/lib/services/browse-abandoned/detector.ts` | New cron detector (15min cadence); orgs processed sequentially within tick |
| `src/app/api/cron/browse-abandoned/route.ts` | Cron entrypoint |
| `src/app/(dashboard)/settings/webhooks/page.tsx` | List UI |
| `src/app/(dashboard)/settings/webhooks/new/page.tsx` | Create form |
| `src/app/(dashboard)/settings/webhooks/[id]/edit/page.tsx` | Edit form |
| `src/app/(dashboard)/settings/webhooks/[id]/deliveries/page.tsx` | Delivery log UI |
| `src/app/api/webhooks-admin/subscriptions/route.ts` (+`/[id]`) | CRUD API for subscriptions |
| `src/app/api/webhooks-admin/deliveries/[id]/replay/route.ts` | Manual replay endpoint |
| `src/app/api/webhooks-admin/subscriptions/[id]/test/route.ts` | "Test delivery" endpoint (sends fake payload) |

### Why a single EventBus listener (vs. inline calls in each handler)

Centralizing in `outbound_dispatcher` ensures:
- A new event type is added in **one place**, not N handlers.
- Future automation features (deal events, segment events) become webhook-able for free.
- Handlers stay focused on their domain logic.

The cost: a small audit pass to ensure every event we want to expose actually emits on the EventBus today (~4 handlers — see §8).

## 5. Data Model

### `webhook_subscriptions`

```sql
CREATE TABLE webhook_subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id                 uuid NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  name                     text NOT NULL,
  url                      text NOT NULL,

  -- Encrypted at-rest via pgsodium (or app-level KMS if pgsodium unavailable).
  -- Plaintext only ever exists in worker memory during the POST.
  secret_encrypted         bytea NOT NULL,
  secret_previous_encrypted bytea,                     -- grace-period rotation
  secret_previous_expires_at timestamptz,              -- when old secret stops being signed with

  events                   text[] NOT NULL,
  status                   text NOT NULL DEFAULT 'active',
  description              text,
  created_by               uuid REFERENCES auth.users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT events_not_empty CHECK (array_length(events, 1) > 0),
  CONSTRAINT status_valid CHECK (status IN ('active', 'paused', 'disabled')),
  CONSTRAINT events_in_catalog CHECK (
    events <@ ARRAY[
      'order.created', 'order.paid', 'order.fulfilled', 'order.cancelled',
      'checkout.abandoned', 'customer.created', 'shipment.tracking_created',
      'payment.pix.abandoned', 'payment.boleto.abandoned', 'browse.abandoned'
    ]::text[]
  ),
  CONSTRAINT secret_rotation_consistent CHECK (
    (secret_previous_encrypted IS NULL) = (secret_previous_expires_at IS NULL)
  )
);

CREATE INDEX idx_webhook_subs_lookup ON webhook_subscriptions(store_id, status)
  WHERE status = 'active';
CREATE INDEX idx_webhook_subs_org ON webhook_subscriptions(organization_id);
```

**Secret rotation:** when user clicks "Regenerate", the new secret becomes `secret_encrypted`, the old one moves to `secret_previous_encrypted` with `secret_previous_expires_at = now() + 24h`. During the grace period, deliveries include **two signatures** (`X-Worder-Signature: sha256=<new>, sha256=<old>`) so receivers have time to swap. After expiry, the old one is cleared.

**RLS:** SELECT/INSERT/UPDATE/DELETE allowed only when `auth.jwt() ->> 'organization_id' = organization_id::text` (follow existing pattern in repo). The `secret_encrypted` and `secret_previous_encrypted` columns are excluded from API-exposed views — only the dispatcher (service role) reads them.

### `webhook_deliveries`

```sql
CREATE TABLE webhook_deliveries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id         uuid NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  event_type       text NOT NULL,
  event_id         text NOT NULL,                    -- deterministic, see §4
  payload          jsonb NOT NULL,
  url              text NOT NULL,

  status           text NOT NULL DEFAULT 'pending',
  attempt_count    int NOT NULL DEFAULT 0,
  max_attempts     int NOT NULL DEFAULT 5,
  in_flight_until  timestamptz,                      -- claim lease (10s TTL); released on completion or expiry

  response_code    int,
  response_body    text,                             -- truncated to 2KB
  error_message    text,

  next_retry_at    timestamptz,
  delivered_at     timestamptz,
  last_attempt_at  timestamptz,                      -- for sweeper "no activity in 5min" check
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT status_valid CHECK (status IN ('pending', 'in_flight', 'delivered', 'failed', 'retrying')),
  CONSTRAINT event_type_in_catalog CHECK (event_type IN (
    'order.created', 'order.paid', 'order.fulfilled', 'order.cancelled',
    'checkout.abandoned', 'customer.created', 'shipment.tracking_created',
    'payment.pix.abandoned', 'payment.boleto.abandoned', 'browse.abandoned'
  )),
  -- Idempotency: same source event → same delivery row per subscription.
  -- Dispatcher's INSERT uses ON CONFLICT DO NOTHING.
  CONSTRAINT unique_delivery_per_event UNIQUE (subscription_id, event_id)
);

CREATE INDEX idx_webhook_deliv_sub ON webhook_deliveries(subscription_id, created_at DESC);
CREATE INDEX idx_webhook_deliv_status ON webhook_deliveries(status, next_retry_at)
  WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_webhook_deliv_org ON webhook_deliveries(organization_id, created_at DESC);
-- Sweeper index: stuck rows whose claim lease expired or never enqueued
CREATE INDEX idx_webhook_deliv_stuck ON webhook_deliveries(last_attempt_at NULLS FIRST)
  WHERE status IN ('pending', 'retrying', 'in_flight');
```

**RLS:** identical to `webhook_subscriptions` (org-scoped). The dashboard reads this table directly; without RLS, any authenticated user could read other orgs' delivery payloads (which contain order PII).

```sql
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read own deliveries" ON webhook_deliveries
  FOR SELECT USING (auth.jwt() ->> 'organization_id' = organization_id::text);
-- INSERT/UPDATE only via service role (dispatcher/worker); no client-side write.
```

**Retention (LGPD-aware):** delivered/failed deliveries older than **30 days** are pruned by a daily cron (`/api/cron/webhook-deliveries-prune`). This is the LGPD safety net — deleted customers may appear in delivery history for up to 30 days, which is documented in the integrator agreement. Pruning also covers payload bloat from large orders.

**Why denormalize `organization_id` and `store_id`:** dashboard queries must not require a join (and FKs ensure integrity).

**Why store `url` and `payload`:** snapshots survive subscription edits (URL change must not retroactively rewrite history) and are needed to render replay UI.

### `browse_abandoned_emissions`

Dedicated table to gate browse-abandoned emissions — keeps the `contact_events` table clean (no synthetic markers) and provides O(1) idempotency.

```sql
CREATE TABLE browse_abandoned_emissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id       uuid NOT NULL,
  product_id       text NOT NULL,
  view_event_id    uuid NOT NULL,                   -- references contact_events.id
  emitted_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_browse_abandoned_emission
    UNIQUE (contact_id, product_id, view_event_id)
);

CREATE INDEX idx_browse_aband_org_emitted ON browse_abandoned_emissions(organization_id, emitted_at DESC);
```

Retention: pruned at 7 days (we never need to dedup beyond the 4h detection window, but keep a buffer).

## 6. Payload Contract

```json
{
  "id": "evt_01HQABC123...",
  "event": "order.created",
  "version": "1",
  "created_at": "2026-04-19T16:23:45.123Z",
  "organization_id": "org_uuid",
  "store_id": "store_uuid",
  "store": {
    "id": "store_uuid",
    "shop_domain": "minhaloja.myshopify.com",
    "name": "Minha Loja"
  },
  "data": { /* event-specific schema */ }
}
```

### Headers

```
Content-Type: application/json
X-Worder-Event: order.created
X-Worder-Event-Id: evt_01HQABC123...
X-Worder-Signature: sha256=<hmac_hex_primary>[, sha256=<hmac_hex_previous>]
X-Worder-Timestamp: 1745086425
X-Worder-Delivery-Id: <delivery uuid>
User-Agent: Worder-Webhooks/1.0
```

### Signature

`HMAC_SHA256(subscription.secret, X-Worder-Timestamp + "." + raw_request_body)` — same construction as Stripe.

During the 24h secret rotation grace period, the header includes **two** comma-separated signatures (primary + previous) so receivers can roll over without downtime.

Receivers MUST:
1. Reject if `|now - X-Worder-Timestamp| > 5 min` (replay protection).
2. Recompute HMAC and constant-time compare against **any** `sha256=` value in `X-Worder-Signature` (split on comma, trim, strip `sha256=` prefix). Match on any → accept.

### Idempotency

`event_id` is **deterministic**: derived as `evt_` + base32(sha256(`source` + `:` + `source_event_id` + `:` + `event_type`)). For example, a Shopify `orders/create` for order `5678901234` always produces the same `event_id`, so re-firing the inbound webhook (Shopify retries) results in the dispatcher's `INSERT ... ON CONFLICT DO NOTHING` no-op. Receivers can additionally dedup on `X-Worder-Event-Id`.

Note: at-least-once also means the worker can legitimately retry a delivery for transient failures — receivers MUST be idempotent on `X-Worder-Event-Id`.

### `data` schemas (v1)

Per-event TypeScript interfaces live in `src/lib/webhooks/event-schemas.ts`. The shapes mirror existing internal types where possible (e.g., `order.*` mirrors `PlacedOrderProperties` from `src/lib/shopify/event-types.ts`) plus a `payment_method` field on order/checkout/payment events.

## 7. Delivery Semantics

- **At-least-once** via QStash. Receivers MUST be idempotent (use `X-Worder-Event-Id` as dedup key).
- **Retry schedule:** 1min → 5min → 30min → 2h → 6h (configured in QStash job options). Max 5 attempts.
- **Status transitions:**
  - `pending` → `in_flight` (worker claims with `UPDATE ... SET status='in_flight', in_flight_until=now()+10s WHERE id=$1 AND status IN ('pending','retrying') RETURNING *` — no row returned means another worker has it; abort)
  - `in_flight` → `delivered` (2xx received)
  - `in_flight` → `failed` (4xx ≠ 408/429, OR max attempts exhausted)
  - `in_flight` → `retrying` (5xx, 408, 429, timeout, network error; `next_retry_at` set; QStash schedules retry)
  - `in_flight` → `pending` (sweeper, if `in_flight_until < now()` and worker never recorded outcome — claim lease expired)
- **Concurrency:** the atomic claim above is the source of truth. `UPDATE ... RETURNING` with the status guard is single-statement atomic in Postgres and prevents two workers from both POSTing. QStash provides best-effort single-delivery per message but the claim is the durable guarantee.
- **Timeout:** 10s per request (matches `in_flight_until` lease).
- **Body truncation:** `response_body` truncated to 2KB.
- **Payload size limit:** 256KB max (QStash default body limit). `payload-builder` enforces this. Strategy when exceeded:
  - For `order.*` with very large `items[]`: truncate to first 100 items and add `_truncated: { items: true, original_count: N }` marker in payload.
  - For other events: emit a slim payload with only the IDs and a `_truncated: true` flag; integrators can refetch full data via Worder API. Logged as warning.
- **Stuck-delivery sweeper:** `/api/cron/webhook-deliveries-sweeper` runs every 5min. Re-enqueues rows where `status IN ('pending','retrying','in_flight')` AND (`last_attempt_at IS NULL` OR `last_attempt_at < now() - interval '5 min'`) AND (`in_flight_until IS NULL` OR `in_flight_until < now()`). Handles the rare case where dispatcher INSERT succeeded but QStash enqueue failed.
- **Pruning (LGPD):** `/api/cron/webhook-deliveries-prune` runs daily, deletes rows in `delivered`/`failed` status older than 30 days.

## 8. Handler Audit (EventBus instrumentation)

| Handler | Today | v1 Change |
|---|---|---|
| `shopify/route.ts` — `processOrderCreated/Paid/Fulfilled/Cancelled` | Emits on EventBus | Add `customer.created` emit on first contact creation in `syncContactFromShopify` |
| `shopify/route.ts` — `processFulfillmentEvent` (line 1081) | Writes CDP event only | Add `EventBus.emit(SHIPMENT_TRACKING_CREATED, ...)` when `tracking_number` present |
| `abandoned-cart.ts:35` — `detectAbandonedCarts` | Writes CDP event only | Add `EventBus.emit(CHECKOUT_ABANDONED, ...)` always; conditionally emit `PAYMENT_PIX_ABANDONED` or `PAYMENT_BOLETO_ABANDONED` based on stored `payment_gateway` |
| `browse-abandoned/detector.ts` (new) | n/a | Emits `BROWSE_ABANDONED` |

New `EventType` enum entries to add in `src/lib/events.ts`:
- `SHIPMENT_TRACKING_CREATED = 'shipment.tracking_created'`
- `PAYMENT_PIX_ABANDONED = 'payment.pix.abandoned'`
- `PAYMENT_BOLETO_ABANDONED = 'payment.boleto.abandoned'`
- `BROWSE_ABANDONED = 'browse.abandoned'`

(The existing `CART_ABANDONED` is renamed/aliased to `CHECKOUT_ABANDONED` in the outbound contract — internal enum stays for backward compatibility.)

## 9. Browse Abandoned Detector

**Cron cadence:** every 15 minutes via `/api/cron/browse-abandoned`.

**Concurrency:** orgs are processed **sequentially** within a single tick. Per-tick budget at 100 active orgs is well under cron timeout. If load grows, switch to a per-org QStash fan-out (out of v1 scope).

**Algorithm (per organization with at least one active subscription to `browse.abandoned`):**

```
1. Query contact_events WHERE
     event_type = 'viewed_product'
     AND created_at BETWEEN (now - 4h) AND (now - 30min)
     AND organization_id = $1
   (joined LEFT to filter out contacts with subsequent add_to_cart/placed_order
    in a single query — see SQL below)

2. For each candidate row, attempt:
     INSERT INTO browse_abandoned_emissions
       (organization_id, contact_id, product_id, view_event_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (contact_id, product_id, view_event_id) DO NOTHING
     RETURNING id
   If a row is returned → first emission, fire EventBus.emit(BROWSE_ABANDONED, payload).
   If NULL → already emitted, skip.

3. EventBus.emit triggers the outbound dispatcher in the same process.
```

**Why a dedicated table (not `contact_events` markers):**
- `INSERT ... ON CONFLICT DO NOTHING RETURNING` is the **atomic emit gate** — race-free even if two ticks overlap.
- Keeps `contact_events` clean of synthetic markers (segmentation/automation queries don't need to filter them).
- O(1) lookup via the unique constraint vs. O(N) scan of `contact_events`.

**Window rationale:** under 30min is too eager (still browsing); over 4h is too late for retargeting value. Both bounds configurable via env vars (`BROWSE_ABANDONED_MIN_MIN`, `BROWSE_ABANDONED_MAX_HOURS`).

**Detection query sketch (single bulk query):**
```sql
SELECT v.id, v.contact_id, v.payload->>'product_id' AS product_id, v.created_at
FROM contact_events v
WHERE v.organization_id = $1
  AND v.event_type = 'viewed_product'
  AND v.created_at BETWEEN now() - interval '4 hours' AND now() - interval '30 minutes'
  AND NOT EXISTS (
    SELECT 1 FROM contact_events x
    WHERE x.contact_id = v.contact_id
      AND x.event_type IN ('added_to_cart', 'placed_order')
      AND x.created_at > v.created_at
      AND (x.event_type = 'placed_order' OR x.payload->>'product_id' = v.payload->>'product_id')
  );
```

## 10. UI

**Location:** `src/app/(dashboard)/settings/webhooks/`

### Screen 1 — List (`/settings/webhooks`)

Table of subscriptions with: name, store, URL, event count, last delivery status (green check / yellow / red X). Filters: store, status. Action: `[+ Novo webhook]`.

### Screen 2 — Create/Edit (`/settings/webhooks/new`, `/[id]/edit`)

Form fields:
- Name (free text)
- **Store** (required dropdown — subscriptions are strictly per-store)
- URL (validated as https://)
- Events (checkboxes grouped: Pedidos / Checkout & Pagamento / Cliente & Comportamento / Logística)
- Secret (auto-generated on creation, copyable, regenerate button)
- Status toggle (Ativo / Pausado)
- `[Testar entrega]` — sends a synthetic event payload to the URL to validate

### Screen 3 — Deliveries (`/settings/webhooks/[id]/deliveries`)

Table of last 100 deliveries with: status icon, event_type, timestamp, response_code, latency. Click a row → drawer with full request (URL, headers, body) and response (code, body), tentativa list, `[Reenviar agora]` button.

Top-level action: `[Reenviar tudo]` (re-queues all `failed` deliveries).

### Empty/error states
- No subscriptions yet → CTA card explaining what webhooks are + `[Criar primeiro webhook]`.
- Subscription with 5+ consecutive failures → warning banner on list and detail.

## 11. Security

### Secret handling
- **Generation:** 32-byte cryptographically random (`crypto.randomBytes(32)`), prefixed `whsec_` and base64url-encoded.
- **At rest:** encrypted via `pgsodium` (preferred — Supabase native) or app-level KMS wrapping if pgsodium unavailable. Never stored in plaintext.
- **Display:** plaintext shown **once** on creation in a one-time-view toast. Subsequent UI shows last 6 chars only (`whsec_••••••XYZ`).
- **Rotation:** "Regenerate" creates new secret; old becomes `secret_previous` with 24h grace; signature header includes both during grace window. After 24h, old secret is purged. UI confirms with "Old secret will work for 24h to allow rollover."

### URL validation & SSRF defense
URL validation runs at **create time** AND inside `safe-fetch` at **delivery time** (DNS rebinding defense — TOCTOU-safe via `undici` Agent `connect` hook).

- **Scheme:** `https://` only. (`http://localhost:*` allowed when `NODE_ENV !== 'production'` for testing.)
- **Blocked IPv4 ranges:** `0.0.0.0/8`, `10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16` (link-local + AWS/GCP/Azure metadata at `169.254.169.254`), `172.16.0.0/12`, `192.168.0.0/16`, `224.0.0.0/4` (multicast), `240.0.0.0/4` (reserved).
- **Blocked IPv6 ranges:** `::1/128` (loopback), `fc00::/7` (unique local), `fe80::/10` (link-local), `::ffff:0:0/96` IPv4-mapped private equivalents, `2001:db8::/32` (documentation).
- **Blocked hostnames:** `metadata.google.internal`, `metadata.aws.internal`, `metadata.azure.com` (defense in depth — most are caught by IP block but DNS may resolve them differently).
- **Implementation:** `safe-fetch.ts` builds an `undici` `Agent` with a custom `connect` callback that resolves the hostname, validates every returned IP against the blocklist, and rejects before opening the socket. **Redirects disabled** (`redirect: 'manual'`) — if the customer URL responds with a 3xx, the worker treats it as a non-retryable failure and surfaces the redirect Location in `error_message`.
- **Note on Node `fetch`:** Node's built-in `fetch` doesn't expose DNS results before connect, which is why we use `undici` directly with a `dispatcher` option.

### Other
- **RLS:** enforced on `webhook_subscriptions` AND `webhook_deliveries` AND `browse_abandoned_emissions` (all org-scoped). Service-role only used by dispatcher and worker.
- **Replay protection:** 5-minute timestamp window enforced on receiver side; documented in integration guide.
- **Replay endpoint authorization:** manual replay requires the user to be a member of the org owning the subscription (server-side check on user JWT vs. delivery's `organization_id`).
- **Rate limiting on test endpoint:** 10 test deliveries per subscription per hour.
- **PII / LGPD:** `customer.created` and `order.*` payloads contain PII (name, email, phone, possibly CPF in shipping address). This is the explicit purpose of the integration. Mitigations:
  - Org admins must accept a "Webhook payloads contain PII" consent on first webhook creation (one-time modal, recorded in `audit_logs`).
  - 30-day delivery payload retention (§7) is the data-erasure safety net.
  - Documentation explicitly tells integrators their endpoint is responsible for LGPD compliance on the receiving side.

## 12. Testing

### Unit tests
- `outbound-dispatcher.test.ts` — N matching subscriptions → N deliveries inserted; non-matching events ignored; **same source event fired twice → ON CONFLICT DO NOTHING swallows duplicate (one row per sub)**
- `event-id.test.ts` — deterministic derivation; same (source, source_event_id, event_type) → same `event_id`
- `signature.test.ts` — HMAC matches reference vectors; constant-time verify; rejects tampered body; **dual-signature header during rotation accepts both**
- `payload-builder.test.ts` — every event_type produces a payload conforming to its schema; **>256KB triggers truncation strategy correctly**
- `safe-fetch.test.ts` — blocks IPv4 private ranges, IPv6 private ranges, cloud metadata hostnames; redirect attempts surface as failures
- `secret-store.test.ts` — encrypt → decrypt round-trip; rotation flow (primary/previous/expiry) advances correctly
- `browse-abandoned/detector.test.ts` — window edges, exclusion by add_to_cart, exclusion by order; **`browse_abandoned_emissions` ON CONFLICT prevents double emission across overlapping ticks**
- `worker.test.ts` — atomic claim works (two concurrent workers, only one processes); 2xx → delivered; 4xx → failed; 5xx → retrying with `next_retry_at`; 4xx 408/429 treated as retryable; expired in_flight lease released by sweeper

### Integration tests
- Subscription test endpoint posting to a mock server (`webhook.site`-style or in-process) — confirm signature validates and 2xx response transitions delivery to `delivered`
- Idempotency: same delivery row processed twice never POSTs twice (status check in worker)

### Manual smoke
- Create subscription via UI pointing at `https://webhook.site/<id>`
- Trigger test order in Shopify dev store
- Verify payload received, signature valid, delivery row marked `delivered`
- Pause subscription, trigger another event, verify no delivery created
- Trigger event with deliberately failing URL (return 500), verify retry sequence

## 13. Rollout Plan

| Phase | Scope | Estimate |
|---|---|---|
| 1. Foundation | Migrations, dispatcher, worker, HMAC, unit tests | 2-3 days |
| 2. Event coverage | Instrument 4 handlers (audit §8), add new EventType entries | 1-2 days |
| 3. UI | List, create/edit, deliveries log, drawer, replay, test endpoint | 2-3 days |
| 4. Browse abandoned | Detector + cron + tests | 1-2 days |
| 5. Docs | Public integrator guide (payload reference, HMAC validation in Node/PHP/Python) | 0.5 day |

**Total:** ~9-12 focused days.

## 14. Open Questions / Future Work (post-v1)

- Formal DLQ UI with bulk replay and date filters
- Event versioning strategy when v2 schema is needed
- Internal event subscriptions (`automation.triggered`, `deal.stage_changed`, etc.)
- Webhook templates for popular integrations (Slack, Discord, Make, n8n) — pre-filled URL + selected events
- Per-event payload customization (subset of fields)
- Batched delivery (multiple events in a single POST) — for high-volume integrators
- Metrics dashboard: delivery success rate per subscription, p50/p95 latency, top failing URLs
- Per-org browse-abandoned cron sharding via QStash fan-out (when org count exceeds single-tick budget)
- Active LGPD data-erasure propagation (today: best-effort via 30-day retention prune)
