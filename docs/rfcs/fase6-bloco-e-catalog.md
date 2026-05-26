# RFC: Fase 6 — Bloco E: Catalog & Commerce API

**Status:** Proposed  
**Author:** Worder Engineering  
**Date:** 2026-05-26

## Problem

Worder serves e-commerce businesses but cannot leverage Meta's WhatsApp Catalog and Commerce features:
- No product catalog sync from Shopify/WooCommerce to Meta
- No native product browsing within WhatsApp conversations
- No cart + checkout flow inside WhatsApp
- No order status updates via structured messages

## Solution (MVP)

### Catalog Sync
- Pull product catalog from connected e-commerce platform (Shopify, WooCommerce, Nuvemshop)
- Push to Meta Commerce Manager via Catalog API
- Keep in sync: price changes, stock updates, new products (webhook-driven or periodic)
- Handle product images (Meta requires specific formats/sizes)

### In-Chat Commerce
- Send product messages (single product or multi-product) via Cloud API
- Handle `order` webhook events when customer places order in-chat
- Cart management: add/remove items, view cart, proceed to checkout
- Payment: redirect to external checkout or use WhatsApp Payments (when available in BR)

### Order Updates
- Structured order confirmation messages
- Shipping update notifications with tracking
- Delivery confirmation + review request (connects to NPS flow from Bloco A)

### API Endpoints
- `POST /api/commerce/catalog/sync` — trigger catalog sync
- `GET /api/commerce/catalog/status` — sync status + product count
- `POST /api/commerce/orders` — create order from WhatsApp cart
- `GET /api/commerce/orders/[id]` — order details
- `POST /api/commerce/send-product` — send product card in conversation

### Database Changes
```sql
CREATE TABLE whatsapp_catalog_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  external_product_id TEXT NOT NULL,   -- Shopify/WooCommerce ID
  meta_product_id TEXT,                 -- Meta Catalog ID
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'BRL',
  image_url TEXT,
  availability TEXT DEFAULT 'in stock',
  sync_status TEXT DEFAULT 'pending',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE whatsapp_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  contact_id UUID REFERENCES whatsapp_contacts(id),
  account_id UUID REFERENCES whatsapp_business_accounts(id),
  order_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  items JSONB NOT NULL,
  total_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'BRL',
  shipping_address JSONB,
  external_order_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

## Non-scope
- WhatsApp Payments (not yet available in Brazil for businesses)
- Multi-currency support (BRL only)
- Inventory management (rely on e-commerce platform)
- Returns/refunds processing (handled externally)

## Success Metrics
- Catalog sync completes in <5 minutes for 1000 products
- Product messages render correctly in WhatsApp (100% format compliance)
- In-chat order conversion rate >5% (from product view to checkout)
- Order status messages delivered within 30 seconds of status change

## Dependencies
- Cloud API connection (Fase 1-4)
- E-commerce platform integration (existing Shopify/WooCommerce connections)
- Meta Commerce Manager account linked to WABA
- Catalog API access (requires Meta Business Verification)

## Risks
- **Catalog API limits**: Meta has rate limits on catalog operations. Batch updates needed for large catalogs.
- **Image format requirements**: Meta rejects images that don't meet size/format specs. Need image processing pipeline.
- **Cart expiry**: WhatsApp cart sessions expire after 24h. Must handle gracefully.
- **Platform-specific mapping**: Each e-commerce platform has different product data structures.

## Estimate
- Catalog sync (Shopify first): 5 days
- In-chat product messages: 3 days
- Order handling: 4 days
- Order updates: 2 days
- **Total: ~14 working days**
