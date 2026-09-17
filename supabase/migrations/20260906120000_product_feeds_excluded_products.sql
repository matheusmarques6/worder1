-- Feed de produtos: produtos que NUNCA podem aparecer neste feed.
-- Guarda o shopify_product_id (texto, como em shopify_products).
alter table public.product_feeds
  add column if not exists excluded_product_ids text[] not null default '{}';

comment on column public.product_feeds.excluded_product_ids is
  'shopify_product_id dos produtos que este feed nunca mostra (exclusão por feed; hidden_from_feeds é a exclusão global da loja).';
