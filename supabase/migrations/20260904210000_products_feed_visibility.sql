-- =============================================================
-- Produtos: ocultar dos feeds + disponibilidade sincronizada
--
-- hidden_from_feeds — decisão do lojista, só na Worder: o produto
--   continua na Shopify e nas escolhas manuais do editor, mas nenhum
--   feed dinâmico (mais vendidos, recentes, recomendados, vistos
--   recentemente, aleatório) o inclui. A sincronização com a Shopify
--   nunca escreve esta coluna, então a escolha sobrevive a qualquer
--   sync ou webhook.
--
-- available — o que a Shopify diz sobre poder comprar: alguma variante
--   com estoque, sem controle de estoque, ou com venda permitida sem
--   estoque. NULL = ainda não sabemos (linha antiga); tratado como
--   disponível até a próxima sincronização/webhook preencher. Um feed
--   nunca oferece produto esgotado.
-- =============================================================

ALTER TABLE public.shopify_products
  ADD COLUMN IF NOT EXISTS hidden_from_feeds BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS available BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_shopify_products_feed_visible
  ON public.shopify_products (store_id)
  WHERE hidden_from_feeds = false;
