-- =====================================================
-- custom_variables
--
-- Merchant-defined named shortcuts for paths into trigger / contact /
-- order / cart event payloads. Lets the flow builder show friendly
-- names like {{ Customer Name }} instead of forcing every template
-- author to know that the path is trigger.raw.customer.first_name.
--
-- Each row maps a variable_key (the friendly name shown in the picker)
-- to a path expression (lodash-style, e.g. "trigger.raw.customer.first_name").
-- Optional default_value is used when the path resolves to null/undefined
-- at render time. Optional fallback_path is tried second when primary
-- path is empty.
--
-- Examples a merchant might create:
--   - "Customer Full Name"  → trigger.raw.customer.first_name + " " + trigger.raw.customer.last_name
--   - "Cart Total"          → trigger.TotalPrice (with fallback trigger.raw.total_price)
--   - "First Item Image"    → trigger.Items[0].ImageURL
--   - "Order Confirmation"  → trigger.raw.order_status_url
--
-- The variable engine reads from this table on render and injects them
-- alongside BASE_VARIABLES so they appear in the variable picker UI.
-- =====================================================

CREATE TABLE IF NOT EXISTS custom_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES shopify_stores(id) ON DELETE CASCADE,

  -- Friendly key shown in the picker. Lowercased, snake_case enforced.
  variable_key TEXT NOT NULL,
  -- Human-readable label for the picker UI.
  label TEXT NOT NULL,
  -- Free-text description / hint
  description TEXT,
  -- Category bucket in the picker (e.g. "Cart", "Customer", "Order")
  category TEXT DEFAULT 'custom',
  -- Type hint for downstream filters/formatters
  variable_type TEXT DEFAULT 'string', -- 'string'|'number'|'currency'|'date'|'datetime'|'boolean'|'array'|'object'

  -- Lodash-style path into the variable context (trigger.*, contact.*,
  -- raw.*, etc.). Required.
  path TEXT NOT NULL,
  -- Optional second path tried when primary resolves empty.
  fallback_path TEXT,
  -- Optional default literal when both paths empty.
  default_value TEXT,

  -- Which trigger types this variable applies to. NULL = available for
  -- every trigger. Used by the picker to show only relevant variables
  -- per node (e.g. "Cart Total" only on cart triggers).
  applicable_triggers TEXT[],

  enabled BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (organization_id, variable_key)
);

CREATE INDEX IF NOT EXISTS idx_custom_variables_org
  ON custom_variables(organization_id, enabled);
CREATE INDEX IF NOT EXISTS idx_custom_variables_store
  ON custom_variables(store_id) WHERE store_id IS NOT NULL;

ALTER TABLE custom_variables ENABLE ROW LEVEL SECURITY;
