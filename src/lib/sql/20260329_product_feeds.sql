-- Product Feeds for dynamic email product blocks
CREATE TABLE IF NOT EXISTS product_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  feed_type TEXT NOT NULL DEFAULT 'bestsellers',
  time_period TEXT DEFAULT '30d',
  filters JSONB DEFAULT '[]'::jsonb,
  max_products INT DEFAULT 4,
  layout TEXT DEFAULT '2x2',
  show_price BOOLEAN DEFAULT TRUE,
  show_compare_price BOOLEAN DEFAULT TRUE,
  show_button BOOLEAN DEFAULT TRUE,
  button_text TEXT DEFAULT 'Comprar',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE product_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their org product_feeds" ON product_feeds
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_product_feeds_org ON product_feeds(organization_id);
