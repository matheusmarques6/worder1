-- =============================================
-- Ensure shopify_checkouts has all columns the
-- webhook + recovery API expect.
-- Two prior schemas existed:
--   * V3 (cart_value-less, total_price + recovery_url)
--   * flow_builder (cart_value + abandoned_checkout_url)
-- This migration unifies them so upserts stop
-- failing silently when a column is missing.
-- =============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_checkouts') THEN
    -- numeric / text columns the webhook writes
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS total_price       DECIMAL(12,2) DEFAULT 0;
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS subtotal_price    DECIMAL(12,2) DEFAULT 0;
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS total_tax         DECIMAL(12,2) DEFAULT 0;
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS total_discounts   DECIMAL(12,2) DEFAULT 0;
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS phone             TEXT;
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS customer_shopify_id TEXT;

    -- Keep both URL columns so old + new code paths work
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS recovery_url            TEXT;
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS abandoned_checkout_url  TEXT;

    -- Lifecycle timestamps + status
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS status              TEXT DEFAULT 'pending';
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS abandoned_at        TIMESTAMPTZ;
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS recovered_at        TIMESTAMPTZ;
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS converted_at        TIMESTAMPTZ;
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS converted_order_id  TEXT;
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS shopify_created_at  TIMESTAMPTZ;
    ALTER TABLE shopify_checkouts ADD COLUMN IF NOT EXISTS shopify_updated_at  TIMESTAMPTZ;

    -- Backfill total_price from cart_value if cart_value exists and total_price is 0
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'shopify_checkouts' AND column_name = 'cart_value'
    ) THEN
      UPDATE shopify_checkouts
         SET total_price = COALESCE(cart_value, 0)
       WHERE (total_price IS NULL OR total_price = 0)
         AND cart_value IS NOT NULL;
    END IF;

    -- Backfill URLs in both directions
    UPDATE shopify_checkouts
       SET recovery_url = abandoned_checkout_url
     WHERE recovery_url IS NULL AND abandoned_checkout_url IS NOT NULL;

    UPDATE shopify_checkouts
       SET abandoned_checkout_url = recovery_url
     WHERE abandoned_checkout_url IS NULL AND recovery_url IS NOT NULL;

    -- Make sure the unique constraint exists (different schemas defined it differently)
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname IN (
        'shopify_checkouts_store_id_shopify_checkout_id_key',
        'shopify_checkouts_store_checkout_unique'
      )
    ) THEN
      BEGIN
        ALTER TABLE shopify_checkouts
          ADD CONSTRAINT shopify_checkouts_store_checkout_unique
          UNIQUE (store_id, shopify_checkout_id);
      EXCEPTION WHEN duplicate_object OR unique_violation THEN
        NULL;
      END;
    END IF;
  ELSE
    RAISE NOTICE 'shopify_checkouts does not exist yet — skipping ALTERs';
  END IF;
END $$;

-- Indexes that help the recovery page
CREATE INDEX IF NOT EXISTS idx_shopify_checkouts_org_status
  ON shopify_checkouts (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shopify_checkouts_store_status
  ON shopify_checkouts (store_id, status, created_at DESC);

-- =============================================
-- shopify_webhook_events: schema says event_id
-- but code writes shopify_event_id. Also missing
-- organization_id, payload, received_at columns.
-- =============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shopify_webhook_events') THEN
    -- Rename event_id → shopify_event_id if old schema has event_id
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'shopify_webhook_events' AND column_name = 'event_id'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'shopify_webhook_events' AND column_name = 'shopify_event_id'
    ) THEN
      ALTER TABLE shopify_webhook_events RENAME COLUMN event_id TO shopify_event_id;
    END IF;

    -- Add columns code expects but old schema didn't have
    ALTER TABLE shopify_webhook_events ADD COLUMN IF NOT EXISTS shopify_event_id TEXT;
    ALTER TABLE shopify_webhook_events ADD COLUMN IF NOT EXISTS organization_id  UUID;
    ALTER TABLE shopify_webhook_events ADD COLUMN IF NOT EXISTS payload          JSONB DEFAULT '{}';
    ALTER TABLE shopify_webhook_events ADD COLUMN IF NOT EXISTS received_at      TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;
