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
- Deliver reliably (at-least-once, exponential retry).
- Expose a UI for subscription management, delivery logs, manual replay, and live testing.
- Cover 10 high-value events for the BR commerce use case (orders, payments, shipping, browse abandonment).

### Non-Goals (v1)
- No formal Dead Letter Queue UI (deliveries that fail all retries simply stay in `failed` status; manual replay is supported).
- No multi-store subscriptions in a single record (subscription is strictly per-store).
- No event versioning beyond `version: "1"` flag (breaking changes will require a v2 spec).
- No internal-only event subscriptions (e.g., `automation.triggered`); only the 10 events listed.

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

```
[Shopify webhook] ──┐                ┌───────────────────────────┐
                    │                │  outbound_dispatcher       │
[WhatsApp webhook]──┼─► EventBus ───►│  (listener on EventBus)    │
                    │  .emit(...)    │                            │
[Browse detector]───┘                │  1. fetch active subs      │
   (new cron)                        │     for (store, event)     │
                                     │  2. insert webhook_deliv.  │
                                     │  3. enqueue QStash job     │
                                     └─────────────┬──────────────┘
                                                   │
                                                   ▼
                                     ┌───────────────────────────┐
                                     │  /api/workers/webhook-     │
                                     │  delivery (POST per job)   │
                                     │                            │
                                     │  - sign HMAC SHA-256       │
                                     │  - POST customer URL       │
                                     │  - 2xx → delivered         │
                                     │  - 4xx (≠408/429) → failed │
                                     │  - 5xx/timeout/429 →       │
                                     │    QStash retries          │
                                     └───────────────────────────┘
```

### New Components

| Path | Purpose |
|---|---|
| `src/lib/webhooks/outbound-dispatcher.ts` | Single EventBus listener; finds matching subscriptions, creates deliveries, enqueues jobs |
| `src/lib/webhooks/payload-builder.ts` | Builds normalized payload per event_type (versioned schema) |
| `src/lib/webhooks/signature.ts` | HMAC SHA-256 sign + constant-time verify |
| `src/app/api/workers/webhook-delivery/route.ts` | QStash worker: receives job, POSTs to customer URL, updates delivery status |
| `src/lib/services/browse-abandoned/detector.ts` | New cron detector (15min cadence) |
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
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id        uuid NOT NULL REFERENCES shopify_stores(id) ON DELETE CASCADE,
  name            text NOT NULL,
  url             text NOT NULL,
  secret          text NOT NULL,
  events          text[] NOT NULL,
  status          text NOT NULL DEFAULT 'active',
  description     text,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT events_not_empty CHECK (array_length(events, 1) > 0),
  CONSTRAINT status_valid CHECK (status IN ('active', 'paused', 'disabled'))
);

CREATE INDEX idx_webhook_subs_lookup ON webhook_subscriptions(store_id, status)
  WHERE status = 'active';
CREATE INDEX idx_webhook_subs_org ON webhook_subscriptions(organization_id);
```

**RLS:** SELECT/INSERT/UPDATE/DELETE allowed only when `auth.jwt() ->> 'organization_id' = organization_id::text` (follow existing pattern in repo).

### `webhook_deliveries`

```sql
CREATE TABLE webhook_deliveries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  uuid NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL,
  store_id         uuid NOT NULL,
  event_type       text NOT NULL,
  event_id         text NOT NULL,
  payload          jsonb NOT NULL,
  url              text NOT NULL,

  status           text NOT NULL DEFAULT 'pending',
  attempt_count    int NOT NULL DEFAULT 0,
  max_attempts     int NOT NULL DEFAULT 5,

  response_code    int,
  response_body    text,
  error_message    text,

  next_retry_at    timestamptz,
  delivered_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT status_valid CHECK (status IN ('pending', 'delivered', 'failed', 'retrying'))
);

CREATE INDEX idx_webhook_deliv_sub ON webhook_deliveries(subscription_id, created_at DESC);
CREATE INDEX idx_webhook_deliv_status ON webhook_deliveries(status, next_retry_at)
  WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_webhook_deliv_org ON webhook_deliveries(organization_id, created_at DESC);
```

**Retention:** delivered/failed deliveries older than 30 days can be pruned via cron (out of scope for v1, but indexes support it).

**Why denormalize `organization_id` and `store_id`:** queries for "all my deliveries last week" must not require a join.

**Why store `url` and `payload`:** snapshots survive subscription edits (URL change must not retroactively rewrite history) and are needed to render replay UI.

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
X-Worder-Signature: sha256=<hmac_hex>
X-Worder-Timestamp: 1745086425
X-Worder-Delivery-Id: <delivery uuid>
User-Agent: Worder-Webhooks/1.0
```

### Signature

`HMAC_SHA256(subscription.secret, X-Worder-Timestamp + "." + raw_request_body)` — same construction as Shopify/Stripe.

Receivers MUST:
1. Reject if `|now - X-Worder-Timestamp| > 5 min` (replay protection).
2. Recompute HMAC and constant-time compare against `X-Worder-Signature` (strip `sha256=` prefix).

### `data` schemas (v1)

Per-event TypeScript interfaces live in `src/lib/webhooks/event-schemas.ts`. The shapes mirror existing internal types where possible (e.g., `order.*` mirrors `PlacedOrderProperties` from `src/lib/shopify/event-types.ts`) plus a `payment_method` field on order/checkout/payment events.

## 7. Delivery Semantics

- **At-least-once** via QStash. Receivers MUST be idempotent (use `X-Worder-Event-Id` as dedup key).
- **Retry schedule:** 1min → 5min → 30min → 2h → 6h (configured in QStash job options). Max 5 attempts.
- **Status transitions:**
  - `pending` → `delivered` (2xx received)
  - `pending`/`retrying` → `failed` (4xx ≠ 408/429, OR max attempts exhausted)
  - `pending` → `retrying` (5xx, 408, 429, timeout, network error; `next_retry_at` set)
- **Timeout:** 10s per request.
- **Body truncation:** `response_body` stored truncated to 2KB (avoid bloating jsonb on large error pages).
- **Concurrency:** QStash handles parallelism; no app-level locking needed. The worker uses `UPDATE ... WHERE id = $1 AND status IN ('pending', 'retrying')` to prevent double-processing.

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

**Algorithm (per organization with at least one active subscription to `browse.abandoned`):**

```
1. Query contact_events WHERE
     event_type = 'viewed_product'
     AND created_at BETWEEN (now - 4h) AND (now - 30min)
     AND organization_id = $1
2. For each row, check (using a single bulk query when possible):
     - No 'added_to_cart' for same contact_id with same product_id
       since the view's created_at
     - No 'placed_order' for same contact_id since the view's created_at
     - No prior 'browse_abandoned' emission for this (contact_id, product_id, view_event_id)
3. For matches: EventBus.emit(BROWSE_ABANDONED, payload)
4. Insert idempotency marker into contact_events
   (event_type='browse_abandoned_emitted', dedup key in payload)
```

**Window rationale:** under 30min is too eager (still browsing); over 4h is too late for retargeting value. Both bounds configurable via env vars (`BROWSE_ABANDONED_MIN_MIN`, `BROWSE_ABANDONED_MAX_HOURS`).

**Idempotency key:** `browse_abandoned:{contact_id}:{product_id}:{view_event_id}` — same view never emits twice.

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

- **HMAC signing** as described in §6 — using `subscription.secret` (32-byte cryptographically random, generated server-side).
- **Secret display:** shown in cleartext only on creation (one-time toast); thereafter masked (`whsec_••••••XYZ`) with a "Regenerate" button (confirmation modal: regeneration immediately invalidates old secret).
- **URL validation:** must be `https://` (allow `http://localhost:*` only when `NODE_ENV !== 'production'` for testing).
- **SSRF protection:** reject URLs resolving to private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 127.0.0.0/8) at create-time *and* at delivery-time (DNS rebinding defense).
- **RLS:** all rows scoped by `organization_id`. Service-role only used by the dispatcher and worker (server-side).
- **Replay protection:** 5-minute timestamp window enforced on the receiver side; documented in integration guide.
- **Replay endpoint authorization:** manual replay requires the user to be a member of the org owning the subscription (server-side check).
- **Rate limiting on test endpoint:** 10 test deliveries per subscription per hour (prevent accidental flood of integrator's URL).

## 12. Testing

### Unit tests
- `outbound-dispatcher.test.ts` — N matching subscriptions → N deliveries inserted; non-matching events ignored
- `signature.test.ts` — HMAC matches reference vectors; constant-time verify; rejects tampered body
- `payload-builder.test.ts` — every event_type produces a payload conforming to its schema
- `browse-abandoned/detector.test.ts` — window edges, exclusion by add_to_cart, exclusion by order, idempotency
- `worker.test.ts` — 2xx → delivered; 4xx → failed; 5xx → retrying with `next_retry_at`; 4xx 408/429 treated as retryable

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
