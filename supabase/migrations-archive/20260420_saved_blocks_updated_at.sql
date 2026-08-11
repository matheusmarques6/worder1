-- =============================================================
-- Ensure saved_blocks has updated_at column + auto-update trigger
-- Fixes: "Could not find the 'updated_at' column of 'saved_blocks'
-- in the schema cache" when saving a universal block.
-- =============================================================

ALTER TABLE saved_blocks
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Auto-bump updated_at on every row update
CREATE OR REPLACE FUNCTION touch_saved_blocks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saved_blocks_updated_at ON saved_blocks;
CREATE TRIGGER trg_saved_blocks_updated_at
  BEFORE UPDATE ON saved_blocks
  FOR EACH ROW
  EXECUTE FUNCTION touch_saved_blocks_updated_at();

-- Refresh PostgREST schema cache so the column is visible immediately
NOTIFY pgrst, 'reload schema';
