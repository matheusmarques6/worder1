-- ============================================================================
-- 20260910200000_popup_summary_tz.sql
-- popup_forms_summary ganha p_tz: a lista de popups conta os mesmos dias
-- de calendário que o analytics e a exportação (meia-noite local, não
-- N×24h a partir de agora em UTC). "Últimos 30 dias" passa a ser um só
-- número em todas as telas.
-- ============================================================================
do $$
begin
    if to_regclass('public.form_events') is null or to_regclass('public.crm_forms') is null then
        return;
    end if;

    drop function if exists public.popup_forms_summary(uuid, integer);
    execute $fn$
    create or replace function public.popup_forms_summary(
        p_organization_id uuid,
        p_days            integer default 30,
        p_tz              text default null
    )
    returns table (
        form_id            uuid,
        impressions        bigint,
        unique_visitors    bigint,
        submissions        bigint,
        dismissals         bigint,
        holdouts           bigint,
        attributed_revenue numeric,
        attributed_orders  integer,
        driven_revenue     numeric,
        driven_orders      integer
    )
    language sql
    stable
    set search_path = pg_catalog, public
    as $body$
        with win as (
            -- Sem fuso: janela rolante de N×24h, como antes.
            select case
                     when p_tz is null or p_tz = '' then now() - make_interval(days => greatest(1, least(p_days, 365)))
                     else ((now() at time zone p_tz)::date - (greatest(1, least(p_days, 365)) - 1)) at time zone p_tz
                   end as since
        ),
        ev as (
            select form_id,
                   count(*) filter (where event_type = 'impression') as impressions,
                   count(distinct properties->>'visitor_id')
                        filter (where event_type = 'impression' and properties->>'visitor_id' is not null) as unique_visitors,
                   count(*) filter (where event_type = 'submitted')  as submissions,
                   count(*) filter (where event_type = 'dismissed')  as dismissals,
                   count(*) filter (where event_type = 'holdout')    as holdouts
              from public.form_events, win
             where organization_id = p_organization_id
               and occurred_at >= win.since
             group by form_id
        )
        select f.id,
               coalesce(ev.impressions, 0)::bigint,
               coalesce(ev.unique_visitors, 0)::bigint,
               coalesce(ev.submissions, 0)::bigint,
               coalesce(ev.dismissals, 0)::bigint,
               coalesce(ev.holdouts, 0)::bigint,
               f.attributed_revenue,
               f.attributed_orders,
               f.driven_revenue,
               f.driven_orders
          from public.crm_forms f
          left join ev on ev.form_id = f.id
         where f.organization_id = p_organization_id
    $body$;
    $fn$;

    execute 'revoke execute on function public.popup_forms_summary(uuid, integer, text) from public, anon';
    execute 'grant execute on function public.popup_forms_summary(uuid, integer, text) to authenticated, service_role';
end $$;
