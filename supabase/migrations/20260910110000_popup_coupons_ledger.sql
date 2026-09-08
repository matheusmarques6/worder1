-- ============================================================================
-- 20260910110000_popup_coupons_ledger.sql
-- Popups, Fase 1 (parte 1): o cupom passa a nascer no ledger, de um pool.
--
-- O que havia: a cada inscrição o submit criava uma price_rule + um código
-- na Shopify, em tempo real, pela REST deprecada; se a Shopify demorasse ou
-- limitasse, a pessoa recebia em silêncio o código genérico do bloco. Nada
-- disso passava pelo incentive_ledger, que existe exatamente para ser a
-- fonte única de emissão (idempotência, teto, consumo no pedido).
--
-- O que passa a haver:
--
--   * coupon_pools — a configuração do desconto de um popup (tipo, valor,
--     validade, prefixo, mínimo, combinações) e o estoque desejado.
--   * coupon_codes — códigos únicos já criados na Shopify, cada um o seu
--     próprio desconto com usageLimit=1 (a Shopify não limita uso POR
--     código dentro de um desconto com vários códigos; um desconto por
--     código é o único jeito de "uso único" ser verdade). O cron enche;
--     o submit só reserva.
--   * reserve_coupon_code — a reserva atômica (FOR UPDATE SKIP LOCKED):
--     dois submits simultâneos nunca levam o mesmo código.
--   * issue_popup_incentive — a emissão pelo ledger. UM grant por
--     contato por popup (idempotency_key); reenvio devolve o mesmo código
--     em vez de gastar outro. Pool vazio vira 'denied' no ledger e o
--     chamador cai no código estático — mas fica registrado que caiu.
--   * consume_incentive_grant ganha p_contact_id: com códigos estáticos
--     (o mesmo para todo mundo) o consumo tem de achar o grant DA PESSOA
--     que comprou, não o primeiro que casar pelo texto do cupom.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. coupon_pools
-- ----------------------------------------------------------------------------
create table if not exists public.coupon_pools (
    id                 uuid primary key default gen_random_uuid(),
    organization_id    uuid not null references public.organizations (id) on delete cascade,
    store_id           uuid not null references public.shopify_stores (id) on delete cascade,
    -- crm_forms vive fora do stack canônico; sem FK, com índice único abaixo.
    form_id            uuid,
    name               text not null,
    kind               text not null check (kind in ('percent', 'fixed', 'free_shipping')),
    value              numeric(12, 2) not null default 0,
    currency           text not null default 'BRL',
    code_prefix        text not null default 'POPUP',
    -- Quanto tempo o inscrito tem para usar, contado da emissão.
    validity_days      integer not null default 7 check (validity_days between 1 and 365),
    -- Folga na Shopify: o código fica válido validity_days + buffer, para um
    -- código que ficou parado no estoque ainda honrar a validade prometida.
    pool_buffer_days   integer not null default 14 check (pool_buffer_days between 0 and 90),
    min_stock          integer not null default 25 check (min_stock between 1 and 5000),
    batch_size         integer not null default 25 check (batch_size between 1 and 200),
    minimum_subtotal   numeric(12, 2),
    -- {collections: [gid,...]} | {} = tudo
    applies_to         jsonb not null default '{}'::jsonb,
    combines_with      jsonb not null default '{"order": false, "product": true, "shipping": true}'::jsonb,
    status             text not null default 'active' check (status in ('active', 'paused', 'error')),
    last_error         text,
    last_replenished_at timestamptz,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

comment on table public.coupon_pools is
    'Configuração do desconto de um popup e o estoque desejado de códigos únicos. O cron enche; o submit reserva.';

create unique index if not exists coupon_pools_form_idx
    on public.coupon_pools (organization_id, form_id)
    where form_id is not null;

drop trigger if exists coupon_pools_touch on public.coupon_pools;
create trigger coupon_pools_touch
    before update on public.coupon_pools
    for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. coupon_codes
-- ----------------------------------------------------------------------------
create table if not exists public.coupon_codes (
    id                  uuid primary key default gen_random_uuid(),
    pool_id             uuid not null references public.coupon_pools (id) on delete cascade,
    organization_id     uuid not null references public.organizations (id) on delete cascade,
    code                text not null,
    shopify_discount_id text,
    status              text not null default 'free'
                            check (status in ('free', 'reserved', 'consumed', 'expired', 'void')),
    expires_at          timestamptz not null,
    reserved_at         timestamptz,
    contact_id          uuid references public.contacts (id) on delete set null,
    grant_id            uuid,
    submission_id       uuid,
    consumed_at         timestamptz,
    created_at          timestamptz not null default now(),
    unique (pool_id, code)
);

comment on table public.coupon_codes is
    'Um código = um desconto na Shopify com usageLimit=1. free → reserved (submit) → consumed (pedido) | expired | void.';

create index if not exists coupon_codes_free_idx
    on public.coupon_codes (pool_id, expires_at desc)
    where status = 'free';

create index if not exists coupon_codes_lookup_idx
    on public.coupon_codes (organization_id, upper(code));

create index if not exists coupon_codes_grant_idx
    on public.coupon_codes (grant_id)
    where grant_id is not null;

-- RLS: lojista lê os seus; escreve só o app (service_role).
alter table public.coupon_pools enable row level security;
alter table public.coupon_codes enable row level security;

drop policy if exists coupon_pools_member_read on public.coupon_pools;
create policy coupon_pools_member_read on public.coupon_pools
    for select to authenticated using (public.user_belongs_to_org(organization_id));

drop policy if exists coupon_codes_member_read on public.coupon_codes;
create policy coupon_codes_member_read on public.coupon_codes
    for select to authenticated using (public.user_belongs_to_org(organization_id));

revoke all on public.coupon_pools from public, anon;
revoke all on public.coupon_codes from public, anon;
grant select on public.coupon_pools to authenticated;
grant select on public.coupon_codes to authenticated;

-- ----------------------------------------------------------------------------
-- 3. incentive_grants aceita a origem 'popup'
-- ----------------------------------------------------------------------------
alter table public.incentive_grants add column if not exists form_id        uuid;
alter table public.incentive_grants add column if not exists submission_id  uuid;
alter table public.incentive_grants add column if not exists pool_id        uuid references public.coupon_pools (id) on delete set null;
alter table public.incentive_grants add column if not exists coupon_code_id uuid references public.coupon_codes (id) on delete set null;

alter table public.incentive_grants drop constraint if exists incentive_grants_source_check;
alter table public.incentive_grants add constraint incentive_grants_source_check
    check (source in ('mission', 'moment', 'popup'));

alter table public.incentive_grants drop constraint if exists incentive_grants_object_kind_check;
alter table public.incentive_grants add constraint incentive_grants_object_kind_check
    check (object_kind in ('cart', 'checkout', 'order', 'form'));

alter table public.incentive_grants drop constraint if exists incentive_grants_source_ref;
alter table public.incentive_grants add constraint incentive_grants_source_ref check (
    (source = 'mission' and mission_version_id is not null)
    or (source = 'moment' and moment_id is not null)
    or (source = 'popup'  and form_id is not null)
);

create index if not exists incentive_grants_coupon_idx
    on public.incentive_grants (organization_id, upper(coupon_code))
    where coupon_code is not null;

-- ----------------------------------------------------------------------------
-- 4. reserve_coupon_code — a reserva atômica
-- ----------------------------------------------------------------------------
create or replace function public.reserve_coupon_code(
    p_organization_id     uuid,
    p_pool_id             uuid,
    p_min_validity_days   integer,
    p_contact_id          uuid,
    p_grant_id            uuid,
    p_submission_id       uuid
)
    returns table (code_id uuid, code text, expires_at timestamptz)
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_pool_org uuid;
    v_row      record;
begin
    -- O pool tem de ser da org que pede. Sem isto, um pool_id chutado
    -- gastaria o estoque de outra loja.
    select organization_id into v_pool_org from public.coupon_pools where id = p_pool_id;
    if v_pool_org is null or v_pool_org <> p_organization_id then
        return;
    end if;

    -- O código com mais validade sobrando, que ainda cubra a promessa.
    -- SKIP LOCKED: dois submits no mesmo instante pegam códigos diferentes.
    select c.id, c.code, c.expires_at
      into v_row
      from public.coupon_codes c
     where c.pool_id = p_pool_id
       and c.status = 'free'
       and c.expires_at > now() + make_interval(days => greatest(1, coalesce(p_min_validity_days, 1)))
     order by c.expires_at desc, c.created_at
     limit 1
       for update skip locked;

    if v_row.id is null then
        return;
    end if;

    update public.coupon_codes
       set status = 'reserved',
           reserved_at = now(),
           contact_id = p_contact_id,
           grant_id = p_grant_id,
           submission_id = p_submission_id
     where id = v_row.id;

    return query select v_row.id, v_row.code, v_row.expires_at;
end
$$;

revoke execute on function public.reserve_coupon_code(uuid, uuid, integer, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_coupon_code(uuid, uuid, integer, uuid, uuid, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 5. issue_popup_incentive — a emissão pelo ledger
-- ----------------------------------------------------------------------------
create or replace function public.issue_popup_incentive(
    p_organization_id uuid,
    p_store_id        uuid,
    p_contact_id      uuid,
    p_form_id         uuid,
    p_submission_id   uuid,
    p_kind            text,
    p_value           numeric,
    p_validity_days   integer,
    p_pool_id         uuid,
    p_static_code     text
)
    returns table (grant_id uuid, coupon_code text, validity_until timestamptz, outcome text)
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_key       text;
    v_grant     public.incentive_grants%rowtype;
    v_new       boolean := false;
    v_code      record;
    v_valid     timestamptz;
    v_days      integer := greatest(1, least(coalesce(p_validity_days, 7), 365));
    v_kind      text := case when p_kind in ('percent', 'fixed', 'free_shipping') then p_kind else 'percent' end;
begin
    if p_organization_id is null or p_contact_id is null or p_form_id is null then
        return;
    end if;

    -- Um grant por pessoa por popup. Reenvio, double-click, segundo
    -- aparelho: todos recebem o MESMO grant.
    v_key := format('popup:%s:%s:%s', p_organization_id, p_contact_id, p_form_id);
    v_valid := now() + make_interval(days => v_days);

    insert into public.incentive_grants
        (organization_id, store_id, contact_id, object_kind, object_ref, source,
         form_id, submission_id, kind, value, validity_until, max_uses, status, idempotency_key, pool_id)
    values
        (p_organization_id, p_store_id, p_contact_id, 'form', p_form_id::text, 'popup',
         p_form_id, p_submission_id, v_kind, coalesce(p_value, 0), v_valid, 1, 'issued', v_key, p_pool_id)
    on conflict (idempotency_key) do nothing
    returning * into v_grant;

    if v_grant.id is not null then
        v_new := true;
    else
        select * into v_grant from public.incentive_grants where idempotency_key = v_key;
        -- Já tem código e ainda vale: devolve o mesmo, sem gastar outro.
        if v_grant.coupon_code is not null and v_grant.status = 'issued' and v_grant.validity_until > now() then
            insert into public.incentive_ledger (organization_id, contact_id, entry_kind, grant_id, reason)
            values (p_organization_id, p_contact_id, 'reused', v_grant.id, 'reenvio do popup: mesmo cupom');
            return query select v_grant.id, v_grant.coupon_code, v_grant.validity_until, 'reused'::text;
            return;
        end if;
        -- Tem código mas já foi usado ou venceu: não emite outro pelo mesmo
        -- popup — a regra é um benefício por pessoa por popup.
        if v_grant.coupon_code is not null then
            insert into public.incentive_ledger (organization_id, contact_id, entry_kind, grant_id, reason)
            values (p_organization_id, p_contact_id, 'denied', v_grant.id,
                    format('cupom deste popup já %s', case when v_grant.status = 'consumed' then 'usado' else 'vencido' end));
            return query select v_grant.id, null::text, v_grant.validity_until, 'already_used'::text;
            return;
        end if;
        -- Grant sem código (o pool estava vazio da última vez): tenta de novo.
    end if;

    -- 1) Do pool, se houver.
    if p_pool_id is not null then
        select * into v_code
          from public.reserve_coupon_code(p_organization_id, p_pool_id, v_days, p_contact_id, v_grant.id, p_submission_id);
        if v_code.code is not null then
            update public.incentive_grants
               set coupon_code = v_code.code,
                   coupon_code_id = v_code.code_id,
                   pool_id = p_pool_id,
                   submission_id = coalesce(submission_id, p_submission_id),
                   status = 'issued',
                   validity_until = least(v_valid, v_code.expires_at)
             where id = v_grant.id
            returning * into v_grant;
            insert into public.incentive_ledger (organization_id, contact_id, entry_kind, grant_id, reason)
            values (p_organization_id, p_contact_id, 'issued', v_grant.id, 'cupom único do pool do popup');
            return query select v_grant.id, v_grant.coupon_code, v_grant.validity_until, 'issued_pool'::text;
            return;
        end if;
    end if;

    -- 2) Código estático do bloco (o mesmo para todos), ainda assim no ledger.
    if coalesce(trim(p_static_code), '') <> '' then
        update public.incentive_grants
           set coupon_code = upper(trim(p_static_code)),
               submission_id = coalesce(submission_id, p_submission_id),
               status = 'issued',
               validity_until = v_valid
         where id = v_grant.id
        returning * into v_grant;
        insert into public.incentive_ledger (organization_id, contact_id, entry_kind, grant_id, reason)
        values (p_organization_id, p_contact_id, 'issued', v_grant.id,
                case when p_pool_id is not null then 'pool vazio: código estático do bloco' else 'código estático do bloco' end);
        return query select v_grant.id, v_grant.coupon_code, v_grant.validity_until, 'issued_static'::text;
        return;
    end if;

    -- 3) Nada para dar. O grant fica sem código (tenta de novo no próximo
    --    envio) e a negativa entra na história.
    insert into public.incentive_ledger (organization_id, contact_id, entry_kind, grant_id, reason)
    values (p_organization_id, p_contact_id, 'denied', v_grant.id, 'pool vazio e sem código estático');
    return query select v_grant.id, null::text, v_grant.validity_until, 'pool_empty'::text;
end
$$;

revoke execute on function public.issue_popup_incentive(uuid, uuid, uuid, uuid, uuid, text, numeric, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.issue_popup_incentive(uuid, uuid, uuid, uuid, uuid, text, numeric, integer, uuid, text) to service_role;

-- ----------------------------------------------------------------------------
-- 6. consume_incentive_grant — pelo contato que comprou
-- ----------------------------------------------------------------------------
-- A assinatura de 3 argumentos sai; a nova tem p_contact_id com default
-- nulo, então as chamadas antigas (runtime Python, webhook) seguem valendo.
drop function if exists public.consume_incentive_grant(uuid, text, text);

create function public.consume_incentive_grant(
    p_organization_id uuid,
    p_coupon_code     text,
    p_order_ref       text,
    p_contact_id      uuid default null
)
    returns table (status text, grant_id uuid)
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_grant record;
begin
    if coalesce(trim(p_coupon_code), '') = '' or coalesce(trim(p_order_ref), '') = '' then
        return query select 'not_found'::text, null::uuid;
        return;
    end if;

    -- Código único: um grant só casa. Código estático: vários casam, e o
    -- da pessoa que comprou vem primeiro; sem contato, o mais antigo.
    select g.id, g.contact_id, g.uses, g.max_uses, g.status, g.coupon_code_id
      into v_grant
      from public.incentive_grants g
     where g.organization_id = p_organization_id
       and upper(g.coupon_code) = upper(trim(p_coupon_code))
       and g.status in ('issued', 'consumed')
     order by (p_contact_id is not null and g.contact_id = p_contact_id) desc,
              g.created_at
     limit 1;

    if v_grant.id is null then
        return query select 'not_found'::text, null::uuid;
        return;
    end if;

    begin
        insert into public.incentive_ledger
            (organization_id, contact_id, entry_kind, grant_id, order_ref, reason)
        values
            (p_organization_id, v_grant.contact_id, 'consumed', v_grant.id,
             trim(p_order_ref),
             format('cupom %s usado no pedido %s', upper(trim(p_coupon_code)), trim(p_order_ref)));
    exception when unique_violation then
        return query select 'already'::text, v_grant.id;
        return;
    end;

    update public.incentive_grants g
       set uses = g.uses + 1,
           status = case when g.uses + 1 >= g.max_uses then 'consumed' else g.status end
     where g.id = v_grant.id;

    if v_grant.coupon_code_id is not null then
        update public.coupon_codes
           set status = 'consumed', consumed_at = now()
         where id = v_grant.coupon_code_id and status <> 'consumed';
    end if;

    return query select 'consumed'::text, v_grant.id;
end
$$;

revoke execute on function public.consume_incentive_grant(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.consume_incentive_grant(uuid, text, text, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 7. A expiração de grants também expira o código do pool
-- ----------------------------------------------------------------------------
create or replace function internal.expire_incentive_grants()
    returns integer
    language sql
    security definer
    set search_path = pg_catalog, public
as $$
    with dead as (
        update public.incentive_grants g
           set status = 'expired'
         where g.status = 'issued'
           and g.validity_until <= now()
        returning g.id, g.organization_id, g.contact_id, g.coupon_code_id
    ),
    codes as (
        update public.coupon_codes c
           set status = 'expired'
          from dead d
         where c.id = d.coupon_code_id and c.status = 'reserved'
        returning c.id
    ),
    trail as (
        insert into public.incentive_ledger
            (organization_id, contact_id, entry_kind, grant_id, reason)
        select d.organization_id, d.contact_id, 'expired', d.id,
               'validade venceu sem uso'
          from dead d
        returning 1
    )
    select count(*)::integer from trail
$$;
