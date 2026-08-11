-- =====================================================
-- Identity Resolution + Product Recommendations
--
-- Adds three subsystems Worder was missing vs Klaviyo/Omnisend:
--
-- 1. visitor_identities — server-side identity graph that maps every
--    signal we capture (worder_visitor_id, fingerprint, email, phone,
--    shopify_customer_id) to a single stable visitor row. Survives
--    Safari ITP localStorage clearing because the server can re-match
--    by fingerprint+UA hash, restoring the prior worder_visitor_id.
--    This is our equivalent of Klaviyo's "Extended ID" feature.
--
-- 2. visitor_id_aliases — append-only log of every client visitor_id
--    we've seen for a given identity. Lets us link historic
--    contact_events even when localStorage was wiped and a new ID was
--    generated.
--
-- 3. product_recommendations — materialized output of nightly
--    collaborative filtering. Three rec types:
--      - frequently_bought_together (item-item from order line items)
--      - also_viewed (item-item from product view sessions)
--      - view_to_purchase (predicted next purchase from view history)
--    Used by emails/popups to surface dynamic product blocks.
-- =====================================================

-- ============================================
-- 1. visitor_identities
-- ============================================
CREATE TABLE IF NOT EXISTS visitor_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL,

  -- Stable Worder visitor ID (we generate this; clients store it)
  worder_visitor_id TEXT NOT NULL,

  -- Linked contact when identity is known
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Probabilistic matching signals (any combination identifies the same person)
  fingerprint_hash TEXT,                -- ThumbmarkJS or similar hash
  user_agent_hash TEXT,                 -- sha256 of UA string (truncated)
  ip_subnet TEXT,                       -- /24 IPv4 or /48 IPv6

  -- Deterministic matching signals (cross-device)
  email_hash TEXT,                      -- sha256(lower(trim(email)))
  phone_hash TEXT,                      -- sha256(normalized phone)
  shopify_customer_id TEXT,

  -- Last resolved values (for debugging / display only — never join on these)
  last_email TEXT,
  last_user_agent TEXT,
  last_ip TEXT,

  -- Match metadata
  match_count INT DEFAULT 1,            -- how many events resolved to this identity
  match_source TEXT DEFAULT 'visitor_id', -- 'visitor_id' | 'fingerprint' | 'email' | 'phone' | 'shopify_customer'

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Soft-merge: if two identities turn out to be the same person, point
  -- the loser to the winner here and stop matching against the loser.
  merged_into_id UUID REFERENCES visitor_identities(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (organization_id, worder_visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_visitor_identities_worder_id
  ON visitor_identities(organization_id, worder_visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_identities_contact
  ON visitor_identities(contact_id) WHERE contact_id IS NOT NULL;
-- Composite index for fingerprint matching (the hot path)
CREATE INDEX IF NOT EXISTS idx_visitor_identities_fingerprint
  ON visitor_identities(organization_id, fingerprint_hash, user_agent_hash)
  WHERE fingerprint_hash IS NOT NULL AND merged_into_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_visitor_identities_email
  ON visitor_identities(organization_id, email_hash)
  WHERE email_hash IS NOT NULL AND merged_into_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_visitor_identities_shopify
  ON visitor_identities(organization_id, shopify_customer_id)
  WHERE shopify_customer_id IS NOT NULL AND merged_into_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_visitor_identities_last_seen
  ON visitor_identities(organization_id, last_seen_at DESC);

ALTER TABLE visitor_identities ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. visitor_id_aliases — every client-side ID we've ever seen
--    pointed at the canonical worder_visitor_id. Append-only.
-- ============================================
CREATE TABLE IF NOT EXISTS visitor_id_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id UUID NOT NULL REFERENCES visitor_identities(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alias_visitor_id TEXT NOT NULL,
  source TEXT,                         -- 'pixel' | 'embed' | 'identify' | 'cookie'
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (organization_id, alias_visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_visitor_id_aliases_alias
  ON visitor_id_aliases(organization_id, alias_visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitor_id_aliases_identity
  ON visitor_id_aliases(identity_id);

ALTER TABLE visitor_id_aliases ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. product_recommendations — materialized recs from CF
-- ============================================
CREATE TABLE IF NOT EXISTS product_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES shopify_stores(id) ON DELETE CASCADE,

  -- The "anchor" product (what was viewed/purchased)
  source_product_id TEXT NOT NULL,
  -- The product we're recommending
  recommended_product_id TEXT NOT NULL,

  -- 'frequently_bought_together' | 'also_viewed' | 'view_to_purchase' | 'similar_text'
  recommendation_type TEXT NOT NULL,

  -- Co-occurrence count (raw)
  co_occurrence_count INT NOT NULL DEFAULT 1,
  -- Normalized score 0..1 (Jaccard similarity or PMI)
  score NUMERIC(6,4) NOT NULL DEFAULT 0,

  -- For display: cached title/image so we don't hit Shopify on render
  source_product_title TEXT,
  recommended_product_title TEXT,
  recommended_product_image TEXT,
  recommended_product_url TEXT,
  recommended_product_price NUMERIC(12,2),
  recommended_product_currency TEXT,

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (organization_id, source_product_id, recommended_product_id, recommendation_type)
);

CREATE INDEX IF NOT EXISTS idx_product_recs_lookup
  ON product_recommendations(organization_id, source_product_id, recommendation_type, score DESC);
CREATE INDEX IF NOT EXISTS idx_product_recs_store
  ON product_recommendations(store_id, computed_at DESC);

ALTER TABLE product_recommendations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. Helper: hashing functions used by the identity resolver.
--    pg has digest() in pgcrypto. We don't enforce — handlers also
--    pre-hash on the API side, but having the SQL function lets us
--    backfill historical data without round-trips.
-- ============================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION worder_hash_email(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN input IS NULL OR length(trim(input)) = 0 THEN NULL
    ELSE encode(digest(lower(trim(input)), 'sha256'), 'hex')
  END;
$$;

CREATE OR REPLACE FUNCTION worder_hash_phone(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN input IS NULL OR length(regexp_replace(input, '[^0-9]', '', 'g')) = 0 THEN NULL
    ELSE encode(digest(regexp_replace(input, '[^0-9]', '', 'g'), 'sha256'), 'hex')
  END;
$$;
