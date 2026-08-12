-- ============================================================================
-- E3 (plano missões-no-nó, 12/08) — o runtime passa a ler o espelho de pedidos.
--
-- `shopify_orders` já existe no banco vivo (espelho que o app alimenta; DDL
-- histórica fora de banda — supabase/README.md). Este arquivo é a versão
-- conformada por introspecção para a fonte canônica: no vivo, tabela e
-- índices são no-op; num banco limpo de CI, bootstrapa o que
-- tests/db/test_purchase_history.py usa. A única mudança REAL no vivo é o
-- GRANT do worker.
--
-- Grant COLUNA a coluna, de propósito: o worker lê o que o prompt precisa
-- (número, valores, status, itens, elo com o contato) e NÃO consegue ler
-- endereço de entrega/cobrança nem telefone — privacidade por construção, no
-- espírito da 20260813000006 (stores atrás de função por causa dos tokens).
-- ============================================================================

create table if not exists public.shopify_orders (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.shopify_stores(id) on delete cascade,
  shopify_order_id text not null,
  order_number text,
  email text,
  phone text,
  total_price numeric default 0,
  subtotal_price numeric default 0,
  total_tax numeric default 0,
  total_discounts numeric default 0,
  currency text default 'BRL',
  financial_status text default 'pending',
  fulfillment_status text,
  customer_id text,
  line_items jsonb default '[]'::jsonb,
  shipping_address jsonb,
  billing_address jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  organization_id uuid not null,
  shopify_order_number text,
  checkout_id uuid,
  contact_id uuid,
  customer_shopify_id text,
  deal_id uuid,
  shopify_created_at timestamptz,
  name text,
  payment_gateway_names text[],
  total_refunded numeric default 0,
  unique (store_id, shopify_order_id)
);

-- Os três caminhos da consulta do runtime (org + elo por contato ou e-mail) —
-- todos já existem no vivo com estes nomes.
create index if not exists idx_shopify_orders_org on public.shopify_orders (organization_id);
create index if not exists idx_orders_contact on public.shopify_orders (contact_id);
create index if not exists idx_orders_email on public.shopify_orders (email);

grant select (id, organization_id, store_id, contact_id, email, name, order_number,
              shopify_order_id, total_price, total_refunded, currency,
              financial_status, fulfillment_status, line_items,
              created_at, shopify_created_at)
  on public.shopify_orders to worker_role;

-- "Esta org tem loja conectada?" (decisão 81b) sem enxergar domínio nem token
-- — a 20260813000006 continua sendo o único caminho para credenciais.
grant select (id, organization_id) on public.shopify_stores to worker_role;
