-- 20261016000005_runtime_tool_grants.sql
--
-- Plano IA (15/10/2026), M1 passo 9 — runtime/docs/alteracoes/2026-10-15-06.
--
-- As ferramentas do catálogo (product_lookup, order_status, timeline,
-- save_customer, save_interests, transfer_to_human) passam a existir no
-- runtime Python, que acessa o banco como `worker_role` com RLS ligada e a
-- org escopada em `app.organization_id` (`public.current_app_organization_id()`).
-- Até aqui o worker só lia `contacts` e colunas de `shopify_orders`. Esta
-- migration dá o mínimo que cada ferramenta precisa, coluna a coluna, com a
-- política por org correspondente. Nada aqui amplia o que o app (service
-- role) ou os usuários já podem fazer.
--
-- down: revoke os grants abaixo e drop das políticas *_worker_*.

-- Helper local: cria a política só se não existir (idempotente).
create or replace function pg_temp.ensure_policy(
  p_name text, p_table text, p_cmd text, p_using text, p_check text
) returns void language plpgsql as $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = p_table and policyname = p_name
  ) then
    execute format(
      'create policy %I on public.%I for %s to worker_role using (%s)%s',
      p_name, p_table, p_cmd, p_using,
      case when p_check is null then '' else ' with check (' || p_check || ')' end
    );
  end if;
end $$;

-- 1. Produtos (product_lookup): leitura das colunas que a ferramenta devolve.
grant select (id, store_id, organization_id, title, handle, status, price, compare_at_price,
              sku, inventory_quantity, variants, image_url, available)
  on public.shopify_products to worker_role;
alter table public.shopify_products enable row level security;
select pg_temp.ensure_policy('shopify_products_worker_read', 'shopify_products', 'select',
  'organization_id = public.current_app_organization_id()', null);

-- 2. Pedidos (order_status): a 20260815000001 já dá as colunas principais;
--    falta `phone` para a busca por telefone do contato.
grant select (phone) on public.shopify_orders to worker_role;

-- 3. Contatos (save_customer, save_interests): escrita restrita às colunas
--    que as ferramentas tocam.
grant insert (organization_id, phone, first_name, email, tags, custom_fields, source, created_at, updated_at)
  on public.contacts to worker_role;
grant update (first_name, email, tags, custom_fields, updated_at)
  on public.contacts to worker_role;
select pg_temp.ensure_policy('contacts_worker_insert', 'contacts', 'insert',
  'true', 'organization_id = public.current_app_organization_id()');
select pg_temp.ensure_policy('contacts_worker_update', 'contacts', 'update',
  'organization_id = public.current_app_organization_id()',
  'organization_id = public.current_app_organization_id()');

-- 4. Timeline do contato (timeline, transfer_to_human).
grant select (id, organization_id, contact_id, type, title, description, metadata, created_at)
  on public.contact_activities to worker_role;
grant insert (organization_id, contact_id, type, title, description, metadata, conversation_id,
              created_by_name, created_by_type, source)
  on public.contact_activities to worker_role;
alter table public.contact_activities enable row level security;
select pg_temp.ensure_policy('contact_activities_worker_read', 'contact_activities', 'select',
  'organization_id = public.current_app_organization_id()', null);
select pg_temp.ensure_policy('contact_activities_worker_insert', 'contact_activities', 'insert',
  'true', 'organization_id = public.current_app_organization_id()');

-- 5. Interesses em produto (save_interests).
grant select (id, organization_id, contact_id, product_id, variant_id)
  on public.whatsapp_product_interests to worker_role;
grant insert (organization_id, contact_id, phone, product_id, product_title, store_id)
  on public.whatsapp_product_interests to worker_role;
alter table public.whatsapp_product_interests enable row level security;
select pg_temp.ensure_policy('wpi_worker_read', 'whatsapp_product_interests', 'select',
  'organization_id = public.current_app_organization_id()', null);
select pg_temp.ensure_policy('wpi_worker_insert', 'whatsapp_product_interests', 'insert',
  'true', 'organization_id = public.current_app_organization_id()');

drop function pg_temp.ensure_policy(text, text, text, text, text);
