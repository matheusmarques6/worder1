-- ============================================================================
-- 20260910160000_popup_review_fixes.sql
-- Popups: correções da revisão das fases 0–2.
--
--   * crm_forms.status aceita 'paused' — pausar um popup ativo não pode
--     virar "rascunho" na tela.
--   * coupon_pools.replenish_lock_at — trava curta para cron, publicação e
--     botão manual não reporem o mesmo pool ao mesmo tempo.
--   * popup_daily_stats ganha p_tz: os dias da série no fuso do lojista,
--     não em UTC (21h em São Paulo caía no dia seguinte).
--   * popup_driven_orders.refunded + refund_popup_driven_order: a receita
--     "com o cupom" desconta reembolsos, como a atribuída já fazia.
--   * índice em crm_form_submissions (org, contato, data) — a subconsulta
--     da receita influenciada em refresh_attribution_totals roda por
--     pedido; sem índice era uma varredura por linha.
-- ============================================================================

do $$
begin
    if to_regclass('public.crm_forms') is null then
        return;
    end if;
    alter table public.crm_forms drop constraint if exists crm_forms_status_check;
    alter table public.crm_forms add constraint crm_forms_status_check
        check (status in ('draft', 'published', 'paused', 'archived'));
end $$;

alter table public.coupon_pools add column if not exists replenish_lock_at timestamptz;

do $$
begin
    if to_regclass('public.crm_form_submissions') is null then
        return;
    end if;
    create index if not exists crm_form_submissions_org_contact_time_idx
        on public.crm_form_submissions (organization_id, contact_id, created_at desc)
        where contact_id is not null;
end $$;

-- ----------------------------------------------------------------------------
-- Série diária no fuso do lojista
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.form_events') is null then
        return;
    end if;
    drop function if exists public.popup_daily_stats(uuid, uuid, integer);
    execute $fn$
    create or replace function public.popup_daily_stats(
        p_organization_id uuid,
        p_form_id         uuid,
        p_days            integer default 30,
        p_tz              text default 'UTC'
    )
    returns table (
        day          date,
        impressions  bigint,
        submissions  bigint,
        dismissals   bigint,
        holdouts     bigint
    )
    language sql
    stable
    set search_path = pg_catalog, public
    as $body$
        with tz as (
            select case when p_tz is null or p_tz = '' then 'UTC' else p_tz end as name
        ),
        hoje as (
            select (now() at time zone (select name from tz))::date as d
        ),
        dias as (
            select generate_series(
                (select d from hoje) - (greatest(1, least(p_days, 365)) - 1),
                (select d from hoje),
                interval '1 day'
            )::date as day
        ),
        ev as (
            select (occurred_at at time zone (select name from tz))::date as day,
                   event_type,
                   count(*) as n
              from public.form_events
             where organization_id = p_organization_id
               and form_id = p_form_id
               and occurred_at >= ((select d from hoje) - greatest(1, least(p_days, 365)))::timestamp at time zone (select name from tz)
             group by 1, 2
        )
        select d.day,
               coalesce(sum(ev.n) filter (where ev.event_type = 'impression'), 0)::bigint,
               coalesce(sum(ev.n) filter (where ev.event_type = 'submitted'),  0)::bigint,
               coalesce(sum(ev.n) filter (where ev.event_type = 'dismissed'),  0)::bigint,
               coalesce(sum(ev.n) filter (where ev.event_type = 'holdout'),    0)::bigint
          from dias d
          left join ev on ev.day = d.day
         group by d.day
         order by d.day
    $body$;
    $fn$;
    revoke execute on function public.popup_daily_stats(uuid, uuid, integer, text) from public, anon;
    grant execute on function public.popup_daily_stats(uuid, uuid, integer, text) to authenticated, service_role;
end $$;

-- ----------------------------------------------------------------------------
-- Reembolso na receita "com o cupom"
-- ----------------------------------------------------------------------------
alter table public.popup_driven_orders add column if not exists refunded numeric(14, 2) not null default 0;

create or replace function public.refund_popup_driven_order(
    p_organization_id uuid,
    p_order_ref       text,
    p_refunded_total  numeric
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_form uuid;
begin
    update public.popup_driven_orders
       set refunded = least(revenue, greatest(0, coalesce(p_refunded_total, 0)))
     where organization_id = p_organization_id
       and order_ref = trim(p_order_ref)
    returning form_id into v_form;
    if v_form is null then
        return false;
    end if;
    if to_regclass('public.crm_forms') is not null then
        execute $u$
            update public.crm_forms f
               set driven_revenue = t.rev, driven_orders = t.n
              from (select form_id, sum(revenue - refunded) as rev, count(*)::integer as n
                      from public.popup_driven_orders
                     where organization_id = $1 and form_id = $2
                     group by form_id) t
             where f.id = t.form_id
        $u$ using p_organization_id, v_form;
    end if;
    return true;
end
$$;

revoke execute on function public.refund_popup_driven_order(uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.refund_popup_driven_order(uuid, text, numeric) to service_role;

-- record_popup_driven_order passa a somar líquido de reembolso.
create or replace function public.record_popup_driven_order(
    p_organization_id uuid,
    p_grant_id        uuid,
    p_order_ref       text,
    p_revenue         numeric,
    p_currency        text default 'BRL',
    p_order_at        timestamptz default now()
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_grant record;
begin
    select g.form_id, g.submission_id, g.contact_id, g.organization_id
      into v_grant
      from public.incentive_grants g
     where g.id = p_grant_id and g.source = 'popup';
    if v_grant.form_id is null or v_grant.organization_id <> p_organization_id then
        return false;
    end if;

    insert into public.popup_driven_orders
        (organization_id, order_ref, grant_id, form_id, submission_id, contact_id, revenue, currency, order_at)
    values
        (p_organization_id, trim(p_order_ref), p_grant_id, v_grant.form_id, v_grant.submission_id, v_grant.contact_id,
         coalesce(p_revenue, 0), coalesce(p_currency, 'BRL'), coalesce(p_order_at, now()))
    on conflict (organization_id, order_ref) do update
        set revenue = greatest(public.popup_driven_orders.revenue, excluded.revenue);

    if to_regclass('public.crm_forms') is not null then
        execute $u$
            update public.crm_forms f
               set driven_revenue = t.rev, driven_orders = t.n
              from (select form_id, sum(revenue - refunded) as rev, count(*)::integer as n
                      from public.popup_driven_orders
                     where organization_id = $1 and form_id = $2
                     group by form_id) t
             where f.id = t.form_id
        $u$ using p_organization_id, v_grant.form_id;
    end if;
    return true;
end
$$;
