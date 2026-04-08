-- ============================================================
-- FIX: Add missing organization_id to Shopify sync tables
-- ============================================================

-- Products
ALTER TABLE shopify_products ADD COLUMN IF NOT EXISTS organization_id UUID;

-- Customers
ALTER TABLE shopify_customers ADD COLUMN IF NOT EXISTS organization_id UUID;

-- Orders (check if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shopify_orders' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE shopify_orders ADD COLUMN organization_id UUID;
  END IF;
END $$;

-- Add store_id to contacts if not exists
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS store_id UUID;
