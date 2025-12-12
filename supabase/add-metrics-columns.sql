-- Add metrics column to shopify_stores
ALTER TABLE shopify_stores 
ADD COLUMN IF NOT EXISTS metrics jsonb DEFAULT '{}';

-- Add source_name and refunds to shopify_orders
ALTER TABLE shopify_orders 
ADD COLUMN IF NOT EXISTS source_name text DEFAULT 'web';

ALTER TABLE shopify_orders 
ADD COLUMN IF NOT EXISTS refunds jsonb DEFAULT '[]';

-- Create index for faster date queries
CREATE INDEX IF NOT EXISTS idx_shopify_orders_created_at 
ON shopify_orders(store_id, created_at);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_financial_status 
ON shopify_orders(store_id, financial_status);
