-- =====================================================
-- contacts.store_id: backfill + auto-fill trigger
--
-- Multi-tenant audit found 1 contact with store_id=NULL on Dr.
-- Melaxin's org. Future inserts (form submissions, WhatsApp, manual
-- imports) sometimes bypass store_id too. Instead of NOT NULL
-- (would break legacy paths), use a trigger: when store_id is NULL
-- on INSERT, default to the org's most-recently-installed store.
-- =====================================================

UPDATE contacts c
SET store_id = sub.store_id
FROM (
  SELECT DISTINCT ON (s.organization_id) s.organization_id, s.id AS store_id
  FROM shopify_stores s
  ORDER BY s.organization_id, s.installed_at DESC NULLS LAST
) sub
WHERE c.store_id IS NULL
  AND c.organization_id = sub.organization_id;

CREATE OR REPLACE FUNCTION contacts_fill_store_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.store_id IS NULL AND NEW.organization_id IS NOT NULL THEN
    SELECT id INTO NEW.store_id
    FROM shopify_stores
    WHERE organization_id = NEW.organization_id
    ORDER BY installed_at DESC NULLS LAST
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contacts_fill_store_id_trigger ON public.contacts;
CREATE TRIGGER contacts_fill_store_id_trigger
  BEFORE INSERT ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION contacts_fill_store_id();
