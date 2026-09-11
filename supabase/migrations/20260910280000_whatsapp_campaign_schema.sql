-- =============================================
-- Campanha de WhatsApp: o banco e o código falavam línguas diferentes.
--
-- A tabela em produção guardava title / total_contacts / sent_count /
-- delivered_count / read_count / failed_count. O código — inclusive a
-- função que processa os webhooks da Meta, que é quem de fato sabe o que
-- foi entregue e lido — escreve name / audience_count / total_sent /
-- total_delivered / total_read / total_failed, e mais duas dúzias de
-- colunas que nunca existiram aqui.
--
-- O resultado, hoje, em produção:
--
--   • criar campanha responde 500. O insert manda dezesseis colunas
--     inexistentes, e ainda por cima campaign_id e template_name são NOT
--     NULL sem valor padrão e o código não os preenche;
--   • a lista mostra nome vazio e NaN nas métricas, porque lê os nomes
--     que o banco não tem;
--   • buscar por nome derruba a rota (filtro em `name`);
--   • apply_campaign_recipient_webhook — o gatilho de entregue/lido/
--     falhou — escreve total_delivered / total_read / total_failed e
--     falha em toda chamada. Nenhum recibo da Meta era contabilizado;
--   • não havia store_id: uma organização com duas lojas não conseguia
--     separar campanhas de WhatsApp por loja. Isso é a mesma exigência
--     multi-tenant que vale para popup e e-mail.
--
-- A escolha aqui é o vocabulário do código (name / total_*), porque é o
-- que a maioria dos caminhos de leitura e o webhook já usam. As colunas
-- legadas são RENOMEADAS, não duplicadas: duas colunas para a mesma
-- coisa é como se chega a este estado. A tabela está vazia em produção,
-- então não há dado para reconciliar.
--
-- Quem escrevia os nomes antigos e passa a escrever os novos: as quatro
-- funções increment_campaign_* (recriadas abaixo) e dois selects de
-- rotas antigas (ajustados no código).
-- =============================================

-- ── 1. Renomear o vocabulário legado ──────────────────────────────
do $$
declare
  r record;
  renomear text[][] := array[
    array['title', 'name'],
    array['total_contacts', 'audience_count'],
    array['sent_count', 'total_sent'],
    array['delivered_count', 'total_delivered'],
    array['read_count', 'total_read'],
    array['failed_count', 'total_failed']
  ];
  par text[];
begin
  if to_regclass('public.whatsapp_campaigns') is null then
    return;
  end if;
  foreach par slice 1 in array renomear loop
    -- Só renomeia se a antiga existe E a nova ainda não: assim a
    -- migration pode rodar duas vezes sem estourar.
    if exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='whatsapp_campaigns' and column_name=par[1])
       and not exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='whatsapp_campaigns' and column_name=par[2])
    then
      execute format('alter table public.whatsapp_campaigns rename column %I to %I', par[1], par[2]);
      raise notice 'whatsapp_campaigns: % -> %', par[1], par[2];
    end if;
  end loop;
end $$;

-- ── 2. Colunas que o código escreve e não existiam ────────────────
do $$
begin
  if to_regclass('public.whatsapp_campaigns') is null then
    return;
  end if;

  -- A loja: sem ela não há como separar campanhas numa organização com
  -- duas vitrines. Nula = campanha da organização inteira.
  alter table public.whatsapp_campaigns add column if not exists store_id uuid;
  if to_regclass('public.shopify_stores') is not null
     and not exists (select 1 from pg_constraint where conname = 'whatsapp_campaigns_store_id_fkey') then
    alter table public.whatsapp_campaigns
      add constraint whatsapp_campaigns_store_id_fkey
      foreign key (store_id) references public.shopify_stores(id) on delete set null;
  end if;

  alter table public.whatsapp_campaigns add column if not exists description text;
  alter table public.whatsapp_campaigns add column if not exists type varchar(32) default 'broadcast';
  alter table public.whatsapp_campaigns add column if not exists template_id uuid;
  alter table public.whatsapp_campaigns add column if not exists template_variables jsonb default '{}'::jsonb;
  alter table public.whatsapp_campaigns add column if not exists media_url text;
  alter table public.whatsapp_campaigns add column if not exists media_type varchar(32);
  alter table public.whatsapp_campaigns add column if not exists audience_type varchar(32) default 'all';
  alter table public.whatsapp_campaigns add column if not exists audience_tags text[];
  alter table public.whatsapp_campaigns add column if not exists audience_segment_id uuid;
  alter table public.whatsapp_campaigns add column if not exists audience_filters jsonb default '{}'::jsonb;
  alter table public.whatsapp_campaigns add column if not exists imported_contacts jsonb;
  alter table public.whatsapp_campaigns add column if not exists messages_per_second integer default 10;
  alter table public.whatsapp_campaigns add column if not exists total_recipients integer default 0;
  alter table public.whatsapp_campaigns add column if not exists total_replied integer default 0;
  alter table public.whatsapp_campaigns add column if not exists cost_per_message numeric(10,4) default 0;
  alter table public.whatsapp_campaigns add column if not exists total_cost numeric(12,2) default 0;
  alter table public.whatsapp_campaigns add column if not exists created_by uuid;
  alter table public.whatsapp_campaigns add column if not exists created_by_name text;
  alter table public.whatsapp_campaigns add column if not exists started_at timestamptz;
  alter table public.whatsapp_campaigns add column if not exists paused_at timestamptz;
  alter table public.whatsapp_campaigns add column if not exists completed_at timestamptz;
  alter table public.whatsapp_campaigns add column if not exists instance_id uuid;
end $$;

-- ── 3. NOT NULL legados que barravam qualquer criação ─────────────
-- campaign_id é o identificador externo (único), template_name só
-- existe depois que o lojista escolhe o template. Nenhum dos dois pode
-- ser exigido na criação de um rascunho. `name` continua obrigatório —
-- a rota já recusa campanha sem nome.
do $$
begin
  if to_regclass('public.whatsapp_campaigns') is null then
    return;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='whatsapp_campaigns'
                and column_name='campaign_id' and is_nullable='NO') then
    alter table public.whatsapp_campaigns alter column campaign_id drop not null;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='whatsapp_campaigns'
                and column_name='template_name' and is_nullable='NO') then
    alter table public.whatsapp_campaigns alter column template_name drop not null;
  end if;
end $$;

-- ── 4. Contadores: as quatro funções passam a somar nas colunas novas ──
create or replace function public.increment_campaign_sent(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.whatsapp_campaigns
     set total_sent = coalesce(total_sent, 0) + 1, updated_at = now()
   where id = p_campaign_id;
end;
$$;

create or replace function public.increment_campaign_delivered(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.whatsapp_campaigns
     set total_delivered = coalesce(total_delivered, 0) + 1, updated_at = now()
   where id = p_campaign_id;
end;
$$;

create or replace function public.increment_campaign_read(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.whatsapp_campaigns
     set total_read = coalesce(total_read, 0) + 1, updated_at = now()
   where id = p_campaign_id;
end;
$$;

create or replace function public.increment_campaign_failed(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.whatsapp_campaigns
     set total_failed = coalesce(total_failed, 0) + 1, updated_at = now()
   where id = p_campaign_id;
end;
$$;

-- Estas funções somam contador de uma campanha por id; quem chama é o
-- servidor. Fora do service_role ninguém precisa delas.
do $$
begin
  execute 'revoke all on function public.increment_campaign_sent(uuid) from public, anon';
  execute 'revoke all on function public.increment_campaign_delivered(uuid) from public, anon';
  execute 'revoke all on function public.increment_campaign_read(uuid) from public, anon';
  execute 'revoke all on function public.increment_campaign_failed(uuid) from public, anon';
  execute 'grant execute on function public.increment_campaign_sent(uuid) to service_role';
  execute 'grant execute on function public.increment_campaign_delivered(uuid) to service_role';
  execute 'grant execute on function public.increment_campaign_read(uuid) to service_role';
  execute 'grant execute on function public.increment_campaign_failed(uuid) to service_role';
exception when others then
  raise notice 'grants dos contadores: %', sqlerrm;
end $$;

-- ── 5. Índices das consultas que a tela faz ───────────────────────
create index if not exists idx_wa_campaigns_org_created
  on public.whatsapp_campaigns (organization_id, created_at desc);

create index if not exists idx_wa_campaigns_org_store
  on public.whatsapp_campaigns (organization_id, store_id)
  where store_id is not null;

comment on column public.whatsapp_campaigns.store_id is
  'Loja desta campanha. Nula = campanha da organização inteira.';
comment on column public.whatsapp_campaigns.campaign_id is
  'Identificador externo legado (único). Opcional.';
