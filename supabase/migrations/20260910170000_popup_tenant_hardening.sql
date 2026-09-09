-- ============================================================================
-- 20260910170000_popup_tenant_hardening.sql
-- Popups: endurecimento multi-tenant e integridade, depois da auditoria.
--
--   * crm_forms.ab_parent_id ganha FK (on delete cascade) e um trigger que
--     impede variante de outra org; popup_experiments ganha o mesmo
--     trigger contra o formulário.
--   * consume_incentive_grant recebe p_store_id: um código estático usado
--     numa loja não consome o grant do popup de OUTRA loja da mesma org.
--   * issue_popup_incentive confere que o pool é do popup e da loja antes
--     de reservar um código.
--   * refresh_attribution_totals: receita influenciada só de pedidos da
--     loja do popup. popup_holdout_report: idem.
--   * popup_variant_stats / _context_stats ganham p_until: experimento
--     encerrado para de acumular tráfego.
-- ============================================================================

do $$
begin
    if to_regclass('public.crm_forms') is null then
        return;
    end if;
    -- Variante sem pai é lixo: apagar o popup principal apaga as variantes.
    if not exists (select 1 from pg_constraint where conname = 'crm_forms_ab_parent_fk') then
        delete from public.crm_forms v
         where v.ab_parent_id is not null
           and not exists (select 1 from public.crm_forms p where p.id = v.ab_parent_id);
        alter table public.crm_forms
            add constraint crm_forms_ab_parent_fk
            foreign key (ab_parent_id) references public.crm_forms(id) on delete cascade;
    end if;
end $$;

create schema if not exists internal;

create or replace function internal.popup_variant_same_org()
    returns trigger
    language plpgsql
    set search_path = pg_catalog, public
as $$
declare
    v_parent_org uuid;
begin
    if new.ab_parent_id is null then
        return new;
    end if;
    if new.ab_parent_id = new.id then
        raise exception 'popup não pode ser variante de si mesmo';
    end if;
    select organization_id into v_parent_org from public.crm_forms where id = new.ab_parent_id;
    if v_parent_org is null or v_parent_org <> new.organization_id then
        raise exception 'variante e popup principal precisam ser da mesma organização';
    end if;
    return new;
end
$$;

do $$
begin
    if to_regclass('public.crm_forms') is null then
        return;
    end if;
    drop trigger if exists crm_forms_variant_same_org on public.crm_forms;
    create trigger crm_forms_variant_same_org
        before insert or update of ab_parent_id, organization_id on public.crm_forms
        for each row execute function internal.popup_variant_same_org();
end $$;

create or replace function internal.popup_experiment_same_org()
    returns trigger
    language plpgsql
    set search_path = pg_catalog, public
as $$
declare
    v_form_org uuid;
begin
    select organization_id into v_form_org from public.crm_forms where id = new.form_id;
    if v_form_org is null or v_form_org <> new.organization_id then
        raise exception 'experimento e popup precisam ser da mesma organização';
    end if;
    return new;
end
$$;

do $$
begin
    if to_regclass('public.popup_experiments') is null then
        return;
    end if;
    drop trigger if exists popup_experiments_same_org on public.popup_experiments;
    create trigger popup_experiments_same_org
        before insert or update of form_id, organization_id on public.popup_experiments
        for each row execute function internal.popup_experiment_same_org();
end $$;

-- ----------------------------------------------------------------------------
-- consume_incentive_grant com loja
-- ----------------------------------------------------------------------------
drop function if exists public.consume_incentive_grant(uuid, text, text, uuid);

create function public.consume_incentive_grant(
    p_organization_id uuid,
    p_coupon_code     text,
    p_order_ref       text,
    p_contact_id      uuid default null,
    p_store_id        uuid default null
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
    -- da pessoa que comprou vem primeiro; sem contato, o mais antigo. O
    -- grant de outra loja da mesma org nunca casa.
    select g.id, g.contact_id, g.uses, g.max_uses, g.status, g.coupon_code_id
      into v_grant
      from public.incentive_grants g
     where g.organization_id = p_organization_id
       and upper(g.coupon_code) = upper(trim(p_coupon_code))
       and g.status in ('issued', 'consumed')
       and (g.store_id is null or p_store_id is null or g.store_id = p_store_id)
     order by (p_contact_id is not null and g.contact_id = p_contact_id) desc,
              (g.store_id = p_store_id) desc,
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

revoke execute on function public.consume_incentive_grant(uuid, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_incentive_grant(uuid, text, text, uuid, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- issue_popup_incentive confere o pool
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
    p_static_code     text,
    p_tier_key        text default 'base'
)
    returns table (grant_id uuid, coupon_code text, validity_until timestamptz, outcome text)
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_key       text;
    v_grant     public.incentive_grants%rowtype;
    v_code      record;
    v_valid     timestamptz;
    v_days      integer := greatest(1, least(coalesce(p_validity_days, 7), 365));
    v_kind      text := case when p_kind in ('percent', 'fixed', 'free_shipping') then p_kind else 'percent' end;
    v_tier      text := coalesce(nullif(trim(p_tier_key), ''), 'base');
begin
    if p_organization_id is null or p_contact_id is null or p_form_id is null then
        return;
    end if;

    v_key := format('popup:%s:%s:%s', p_organization_id, p_contact_id, p_form_id);
    v_valid := now() + make_interval(days => v_days);

    insert into public.incentive_grants
        (organization_id, store_id, contact_id, object_kind, object_ref, source,
         form_id, submission_id, kind, value, validity_until, max_uses, status, idempotency_key, pool_id, tier_key)
    values
        (p_organization_id, p_store_id, p_contact_id, 'form', p_form_id::text, 'popup',
         p_form_id, p_submission_id, v_kind, coalesce(p_value, 0), v_valid, 1, 'issued', v_key, p_pool_id, v_tier)
    on conflict (idempotency_key) do nothing
    returning * into v_grant;

    if v_grant.id is null then
        select * into v_grant from public.incentive_grants where idempotency_key = v_key;
        if v_grant.coupon_code is not null and v_grant.status = 'issued' and v_grant.validity_until > now() then
            insert into public.incentive_ledger (organization_id, contact_id, entry_kind, grant_id, reason)
            values (p_organization_id, p_contact_id, 'reused', v_grant.id, 'reenvio do popup: mesmo cupom');
            return query select v_grant.id, v_grant.coupon_code, v_grant.validity_until, 'reused'::text;
            return;
        end if;
        if v_grant.coupon_code is not null then
            insert into public.incentive_ledger (organization_id, contact_id, entry_kind, grant_id, reason)
            values (p_organization_id, p_contact_id, 'denied', v_grant.id,
                    format('cupom deste popup já %s', case when v_grant.status = 'consumed' then 'usado' else 'vencido' end));
            return query select v_grant.id, null::text, v_grant.validity_until, 'already_used'::text;
            return;
        end if;
        -- Sem código da última vez: o tier pode ter mudado no caminho novo.
        update public.incentive_grants
           set kind = v_kind, value = coalesce(p_value, 0), tier_key = v_tier, pool_id = p_pool_id
         where id = v_grant.id;
    end if;

    -- O pool tem de ser deste popup e desta loja: um pool de outra loja da
    -- mesma org emitiria códigos criados na Shopify errada.
    if p_pool_id is not null then
        perform 1 from public.coupon_pools cp
         where cp.id = p_pool_id
           and cp.organization_id = p_organization_id
           and cp.form_id = p_form_id
           and (p_store_id is null or cp.store_id = p_store_id);
        if not found then
            p_pool_id := null;
        end if;
    end if;

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
            values (p_organization_id, p_contact_id, 'issued', v_grant.id, format('cupom único do pool do popup (tier %s)', v_tier));
            return query select v_grant.id, v_grant.coupon_code, v_grant.validity_until, 'issued_pool'::text;
            return;
        end if;
    end if;

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
                case when p_pool_id is not null then format('pool vazio: código estático do bloco (tier %s)', v_tier)
                     else format('código estático do bloco (tier %s)', v_tier) end);
        return query select v_grant.id, v_grant.coupon_code, v_grant.validity_until, 'issued_static'::text;
        return;
    end if;

    insert into public.incentive_ledger (organization_id, contact_id, entry_kind, grant_id, reason)
    values (p_organization_id, p_contact_id, 'denied', v_grant.id, 'pool vazio e sem código estático');
    return query select v_grant.id, null::text, v_grant.validity_until, 'pool_empty'::text;
end
$$;

revoke execute on function public.issue_popup_incentive(uuid, uuid, uuid, uuid, uuid, text, numeric, integer, uuid, text, text) from public, anon, authenticated;
grant execute on function public.issue_popup_incentive(uuid, uuid, uuid, uuid, uuid, text, numeric, integer, uuid, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- Receita influenciada e hold-out só da loja do popup
-- ----------------------------------------------------------------------------
create or replace function public.refresh_attribution_totals(p_organization_id uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_popup_days integer := 30;
begin
  update public.email_campaigns c set
    attributed_revenue = t.attributed, revenue = t.attributed,
    recipient_revenue = t.recipient, conversions = t.orders
  from (
    select campaign_id,
           sum(net_revenue) filter (where classification='attributed') as attributed,
           sum(net_revenue) as recipient,
           count(*) filter (where classification='attributed') as orders
    from public.order_attribution
    where organization_id = p_organization_id and revoked_at is null and campaign_id is not null and channel='email'
    group by campaign_id
  ) t where c.id = t.campaign_id;

  update public.whatsapp_campaigns c set
    attributed_revenue = t.attributed, revenue = t.attributed,
    recipient_revenue = t.recipient, conversions = t.orders
  from (
    select campaign_id,
           sum(net_revenue) filter (where classification='attributed') as attributed,
           sum(net_revenue) as recipient,
           count(*) filter (where classification='attributed') as orders
    from public.order_attribution
    where organization_id = p_organization_id and revoked_at is null and campaign_id is not null and channel='whatsapp'
    group by campaign_id
  ) t where c.id = t.campaign_id;

  update public.sms_campaigns c set
    attributed_revenue = t.attributed, revenue = t.attributed,
    recipient_revenue = t.recipient, conversions = t.orders
  from (
    select campaign_id,
           sum(net_revenue) filter (where classification='attributed') as attributed,
           sum(net_revenue) as recipient,
           count(*) filter (where classification='attributed') as orders
    from public.order_attribution
    where organization_id = p_organization_id and revoked_at is null and campaign_id is not null and channel='sms'
    group by campaign_id
  ) t where c.id = t.campaign_id;

  update public.automations a set
    attributed_revenue = t.attributed, total_revenue = t.attributed,
    recipient_revenue = t.recipient, conversions = t.orders
  from (
    select automation_id,
           sum(net_revenue) filter (where classification='attributed') as attributed,
           sum(net_revenue) as recipient,
           count(*) filter (where classification='attributed') as orders
    from public.order_attribution
    where organization_id = p_organization_id and revoked_at is null and automation_id is not null
    group by automation_id
  ) t where a.id = t.automation_id;

  if to_regclass('public.crm_forms') is not null and to_regclass('public.crm_form_submissions') is not null then
    begin
      select coalesce((o.email_settings->'attribution'->>'popup_window_days')::integer, 30)
        into v_popup_days
        from public.organizations o where o.id = p_organization_id;
    exception when others then
      v_popup_days := 30;
    end;
    v_popup_days := greatest(1, least(coalesce(v_popup_days, 30), 90));

    -- Atribuída: o crédito único caiu no popup (send_id = submissão).
    execute $u$
      update public.crm_forms f set
        attributed_revenue = coalesce(t.attributed, 0),
        attributed_orders  = coalesce(t.orders, 0)
      from (
        select s.form_id,
               sum(oa.net_revenue) filter (where oa.classification='attributed') as attributed,
               count(*) filter (where oa.classification='attributed') as orders
        from public.order_attribution oa
        join public.crm_form_submissions s on s.id = oa.send_id
        where oa.organization_id = $1 and oa.revoked_at is null and oa.channel = 'popup'
        group by s.form_id
      ) t where f.id = t.form_id and f.organization_id = $1
    $u$ using p_organization_id;

    -- Influenciada: todo pedido na janela depois da inscrição, seja de
    -- quem for o crédito. É o número que a Alia chama de "attributed".
    execute $u$
      update public.crm_forms f set
        influenced_revenue = coalesce(t.rev, 0),
        influenced_orders  = coalesce(t.n, 0)
      from (
        select x.form_id, sum(x.net_revenue) as rev, count(*) as n
        from (
          select oa.order_id, oa.net_revenue,
                 (select s.form_id from public.crm_form_submissions s
                    join public.crm_forms pf on pf.id = s.form_id
                   where s.organization_id = oa.organization_id
                     and s.contact_id = oa.contact_id
                     and coalesce(s.holdout, false) = false
                     -- Popup de outra loja da mesma org não influencia este pedido.
                     and (pf.store_id is null or oa.store_id is null or pf.store_id = oa.store_id)
                     and s.created_at <= oa.order_at
                     and s.created_at >= oa.order_at - make_interval(days => $2)
                   order by s.created_at desc limit 1) as form_id
          from public.order_attribution oa
          where oa.organization_id = $1 and oa.revoked_at is null
        ) x
        where x.form_id is not null
        group by x.form_id
      ) t where f.id = t.form_id and f.organization_id = $1
    $u$ using p_organization_id, v_popup_days;

    -- Popups que perderam o último pedido creditado voltam a zero.
    execute $u$
      update public.crm_forms f set attributed_revenue = 0, attributed_orders = 0
       where f.organization_id = $1
         and (f.attributed_orders > 0 or f.attributed_revenue > 0)
         and not exists (
           select 1 from public.order_attribution oa
             join public.crm_form_submissions s on s.id = oa.send_id
            where oa.organization_id = $1 and oa.revoked_at is null and oa.channel = 'popup' and s.form_id = f.id
         )
    $u$ using p_organization_id;
  end if;
end;
$$;

do $$
begin
    if to_regclass('public.form_events') is null or to_regclass('public.visitor_identities') is null then
        raise notice 'form_events/visitor_identities ausentes — pulando relatório de hold-out';
        return;
    end if;

    execute $fn$
    create or replace function public.popup_holdout_report(
        p_organization_id uuid,
        p_form_id         uuid,
        p_days            integer default 30
    )
    returns table (
        bucket            text,
        visitors          bigint,
        identified        bigint,
        buyers            bigint,
        orders            bigint,
        revenue           numeric
    )
    language sql
    stable
    set search_path = pg_catalog, public
    as $body$
        with base as (
            -- A primeira vez que cada visitante foi sorteado, no período.
            select coalesce(properties->>'bucket', case when event_type = 'holdout' then 'holdout' else 'exposed' end) as bucket,
                   properties->>'visitor_id' as visitor_id,
                   min(occurred_at) as first_at
              from public.form_events
             where organization_id = p_organization_id
               and form_id = p_form_id
               and event_type in ('impression', 'holdout')
               and properties->>'visitor_id' is not null
               and occurred_at >= now() - make_interval(days => greatest(1, least(p_days, 365)))
             group by 1, 2
        ),
        ident as (
            select b.bucket, b.visitor_id, b.first_at, vi.contact_id
              from base b
              left join public.visitor_identities vi
                     on vi.organization_id = p_organization_id
                    and vi.worder_visitor_id = b.visitor_id
                    and vi.merged_into_id is null
        ),
        compras as (
            select i.bucket, i.visitor_id, i.contact_id,
                   count(o.id) as orders,
                   coalesce(sum(coalesce(o.total_price, 0) - coalesce(o.total_refunded, 0)), 0) as revenue
              from ident i
              left join public.shopify_orders o
                     on o.organization_id = p_organization_id
                    and o.contact_id = i.contact_id
                    -- Só pedidos da loja do popup (popup sem loja conta todas).
                    and (o.store_id is null or (select f.store_id from public.crm_forms f where f.id = p_form_id) is null
                         or o.store_id = (select f.store_id from public.crm_forms f where f.id = p_form_id))
                    and coalesce(o.shopify_created_at, o.created_at) >= i.first_at
                    and coalesce(o.shopify_created_at, o.created_at) <= i.first_at + make_interval(days => greatest(1, least(p_days, 365)))
             group by 1, 2, 3
        )
        select bucket,
               count(*)::bigint as visitors,
               count(contact_id)::bigint as identified,
               count(*) filter (where orders > 0)::bigint as buyers,
               coalesce(sum(orders), 0)::bigint as orders,
               coalesce(sum(revenue), 0)::numeric as revenue
          from compras
         group by bucket
         order by bucket
    $body$;
    $fn$;

    execute 'revoke execute on function public.popup_holdout_report(uuid, uuid, integer) from public, anon';
    execute 'grant execute on function public.popup_holdout_report(uuid, uuid, integer) to authenticated, service_role';
end $$;

-- ----------------------------------------------------------------------------
-- Estatística por variante com fim (p_until)
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.form_events') is null or to_regclass('public.crm_form_submissions') is null then
        return;
    end if;

    drop function if exists public.popup_variant_stats(uuid, uuid, timestamptz);
    drop function if exists public.popup_variant_context_stats(uuid, uuid, timestamptz);
    execute $fn$
    create or replace function public.popup_variant_stats(
        p_organization_id uuid,
        p_form_id         uuid,
        p_since           timestamptz,
        p_until           timestamptz default null
    )
    returns table (
        variant_id   uuid,
        impressions  bigint,
        visitors     bigint,
        submissions  bigint,
        optins       bigint,
        orders       bigint,
        revenue      numeric
    )
    language sql
    stable
    set search_path = pg_catalog, public
    as $body$
        with imp as (
            select case
                     when (properties->>'variant_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       then (properties->>'variant_id')::uuid
                     else p_form_id
                   end as variant_id,
                   count(*) as impressions,
                   count(distinct nullif(properties->>'visitor_id', '')) as visitors
              from public.form_events
             where organization_id = p_organization_id
               and form_id = p_form_id
               and event_type = 'impression'
               and occurred_at >= p_since
               and occurred_at <= coalesce(p_until, now())
             group by 1
        ),
        sub as (
            select coalesce(s.variant_id, p_form_id) as variant_id,
                   count(*) as submissions,
                   count(*) filter (where exists (
                       select 1 from public.consent_records c
                        where c.submission_id = s.id
                          and c.channel = 'email'
                          and c.action in ('granted', 'confirmed')
                   )) as optins,
                   count(*) filter (where s.converted_order_id is not null) as orders,
                   coalesce(sum(s.conversion_value) filter (where s.converted_order_id is not null), 0)::numeric as revenue
              from public.crm_form_submissions s
             where s.organization_id = p_organization_id
               and s.form_id = p_form_id
               and s.created_at >= p_since
               and s.created_at <= coalesce(p_until, now())
               and coalesce(s.holdout, false) = false
             group by 1
        ),
        ids as (
            select variant_id from imp
            union
            select variant_id from sub
        )
        select i.variant_id,
               coalesce(imp.impressions, 0)::bigint,
               coalesce(imp.visitors, 0)::bigint,
               coalesce(sub.submissions, 0)::bigint,
               coalesce(sub.optins, 0)::bigint,
               coalesce(sub.orders, 0)::bigint,
               coalesce(sub.revenue, 0)::numeric
          from ids i
          left join imp on imp.variant_id = i.variant_id
          left join sub on sub.variant_id = i.variant_id
         order by i.variant_id
    $body$;
    $fn$;

    execute $fn$
    create or replace function public.popup_variant_context_stats(
        p_organization_id uuid,
        p_form_id         uuid,
        p_since           timestamptz,
        p_until           timestamptz default null
    )
    returns table (
        variant_id   uuid,
        page_kind    text,
        traffic_type text,
        device       text,
        impressions  bigint,
        submissions  bigint
    )
    language sql
    stable
    set search_path = pg_catalog, public
    as $body$
        with imp as (
            select case
                     when (properties->>'variant_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       then (properties->>'variant_id')::uuid
                     else p_form_id
                   end as variant_id,
                   coalesce(properties->>'page', 'other')      as page_kind,
                   coalesce(properties->>'traffic', 'direct') as traffic_type,
                   coalesce(properties->>'device', 'desktop') as device,
                   count(*) as impressions
              from public.form_events
             where organization_id = p_organization_id
               and form_id = p_form_id
               and event_type = 'impression'
               and occurred_at >= p_since
               and occurred_at <= coalesce(p_until, now())
             group by 1, 2, 3, 4
        ),
        sub as (
            select coalesce(variant_id, p_form_id) as variant_id,
                   coalesce(page_kind, 'other')     as page_kind,
                   coalesce(traffic_type, 'direct') as traffic_type,
                   coalesce(device, 'desktop')      as device,
                   count(*) as submissions
              from public.crm_form_submissions
             where organization_id = p_organization_id
               and form_id = p_form_id
               and created_at >= p_since
               and created_at <= coalesce(p_until, now())
               and coalesce(holdout, false) = false
             group by 1, 2, 3, 4
        )
        select coalesce(i.variant_id, s.variant_id),
               coalesce(i.page_kind, s.page_kind),
               coalesce(i.traffic_type, s.traffic_type),
               coalesce(i.device, s.device),
               coalesce(i.impressions, 0)::bigint,
               coalesce(s.submissions, 0)::bigint
          from imp i
          full outer join sub s
            on s.variant_id = i.variant_id
           and s.page_kind = i.page_kind
           and s.traffic_type = i.traffic_type
           and s.device = i.device
    $body$;
    $fn$;

    revoke execute on function public.popup_variant_stats(uuid, uuid, timestamptz, timestamptz) from public, anon;
    grant execute on function public.popup_variant_stats(uuid, uuid, timestamptz, timestamptz) to authenticated, service_role;
    revoke execute on function public.popup_variant_context_stats(uuid, uuid, timestamptz, timestamptz) from public, anon;
    grant execute on function public.popup_variant_context_stats(uuid, uuid, timestamptz, timestamptz) to service_role;
end $$;
