-- ================================================
-- organizations.feature_flags
-- Plan: Sprint 1 / Fase 3 (Embedded Signup) — feature flag infra
-- ================================================
--
-- Lightweight feature flag mechanism. Keys are short strings,
-- values arbitrary JSON (booleans, percentages, configs).
--
-- Examples:
--   { "whatsapp_embedded_signup": true }
--   { "block_evolution_create": true }
--   { "whatsapp_flows_beta": { "rollout_percent": 25 } }
--
-- Read via src/lib/feature-flags.ts isFeatureEnabled(orgId, key).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_organizations_feature_flags
  ON organizations USING gin (feature_flags);

COMMENT ON COLUMN organizations.feature_flags IS
  'Per-tenant feature flags. Read via src/lib/feature-flags.ts. Boolean keys = simple on/off; object values allow rollouts or configs.';

-- ================================================
-- whatsapp_business_accounts.connection_method
-- ================================================
-- 'manual' (legacy token paste) | 'embedded_signup' (FB.login flow)
-- Used to distinguish onboarding source for analytics and UX hints.
ALTER TABLE whatsapp_business_accounts
  ADD COLUMN IF NOT EXISTS connection_method text DEFAULT 'manual'
    CHECK (connection_method IN ('manual', 'embedded_signup'));

COMMENT ON COLUMN whatsapp_business_accounts.connection_method IS
  'How the merchant onboarded this account: manual = legacy form; embedded_signup = FB.login flow (Sprint 1 / Fase 3).';
