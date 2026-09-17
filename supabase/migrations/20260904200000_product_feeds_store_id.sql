-- =============================================================
-- product_feeds ganha a loja
--
-- Um feed é a receita de um bloco de produtos (tipo, filtros). Até
-- aqui só tinha organization_id, e a organização tem VÁRIAS lojas; o
-- resolvedor então escolhia "a loja ativa mais nova" para montar os
-- links — foi assim que um e-mail da Dr. Groot saiu com links da
-- Medicube. Os produtos passam a sair da loja do e-mail; a coluna
-- aqui deixa cada feed pertencer a uma loja no editor.
--
-- Feeds antigos ficam com store_id nulo: valem para a organização
-- inteira e continuam aparecendo em todas as lojas.
-- =============================================================

ALTER TABLE product_feeds
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_feeds_store ON product_feeds(store_id);
