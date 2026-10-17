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

-- Fresh replay: these legacy CRM relations existed outside the canonical
-- migration stream. Bootstrap only the columns used by the current catalog
-- and Inbox writers. Existing relations/data/constraints are never rebuilt.
-- Sources: supabase/contact-activities.sql, sql/integracao-inbox-crm.sql,
-- migrations-archive/20260415_product_interests_payment_links.sql,
-- sql/whatsapp-migration-final.sql and repository/crm.py.
-- Both activity formats are optional: CRM writes type, Inbox activity_type.
-- Rollback keeps these data-bearing tables; revoke runtime grants instead.
do $bootstrap$
begin
  if to_regclass('public.contact_activities') is null then
    create table public.contact_activities (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      contact_id uuid not null references public.contacts(id) on delete cascade,
      conversation_id uuid,
      task_id uuid,
      deal_id uuid,
      type varchar(50),
      activity_type varchar(100),
      title varchar(255),
      description text,
      metadata jsonb default '{}'::jsonb,
      user_id uuid,
      created_by uuid,
      created_by_name varchar(255),
      created_by_type text,
      source text default 'manual',
      occurred_at timestamptz default now(),
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create index idx_contact_activities_contact_id on public.contact_activities(contact_id);
    create index idx_contact_activities_organization_id on public.contact_activities(organization_id);
    create index idx_contact_activities_created_at on public.contact_activities(created_at desc);
    alter table public.contact_activities enable row level security;
    revoke all on public.contact_activities from public, anon, authenticated;
    grant select, insert, update, delete on public.contact_activities to service_role;
    -- The CRM timeline uses the authenticated client. Resolve the tenant from
    -- the signed user's profile, never from editable user metadata.
    grant select, insert on public.contact_activities to authenticated;
    create policy contact_activities_authenticated_read
      on public.contact_activities for select to authenticated
      using (organization_id = (
        select organization_id from public.profiles where id = (select auth.uid())
      ));
    create policy contact_activities_authenticated_insert
      on public.contact_activities for insert to authenticated
      with check (organization_id = (
        select organization_id from public.profiles where id = (select auth.uid())
      ));
  end if;

  if to_regclass('public.whatsapp_product_interests') is null then
    create table public.whatsapp_product_interests (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(id) on delete cascade,
      store_id uuid,
      contact_id uuid,
      phone text,
      product_id text not null,
      variant_id text,
      product_title text,
      notified boolean default false,
      notified_at timestamptz,
      created_at timestamptz default now()
    );
    create index whatsapp_product_interests_org_notified_idx
      on public.whatsapp_product_interests(organization_id, notified);
    create index whatsapp_product_interests_product_idx
      on public.whatsapp_product_interests(product_id, notified);
    create unique index whatsapp_product_interests_unique
      on public.whatsapp_product_interests
        (organization_id, contact_id, product_id, coalesce(variant_id, ''))
      where contact_id is not null;
    alter table public.whatsapp_product_interests enable row level security;
    revoke all on public.whatsapp_product_interests from public, anon, authenticated;
    grant select, insert, update, delete on public.whatsapp_product_interests to service_role;
  end if;
end
$bootstrap$;

-- Helper local: cria a política só se não existir (idempotente).
create or replace function pg_temp.ensure_policy(
  p_name text, p_table text, p_cmd text, p_using text, p_check text
) returns void language plpgsql as $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = p_table and policyname = p_name
  ) then
    -- Política FOR INSERT só aceita WITH CHECK (42601 com USING); a de
    -- insert passa p_using só por simetria e ele é ignorado aqui.
    execute format(
      'create policy %I on public.%I for %s to worker_role%s%s',
      p_name, p_table, p_cmd,
      case when p_using is null or lower(p_cmd) = 'insert' then '' else ' using (' || p_using || ')' end,
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
