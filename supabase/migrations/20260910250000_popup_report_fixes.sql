-- ============================================================================
-- 20260910250000_popup_report_fixes.sql
-- Duas leituras que estavam enviesadas.
--
-- 1. Receita influenciada nunca voltava a zero. O UPDATE ... FROM só toca
--    nas linhas que aparecem na subconsulta; cancelado o único pedido que
--    um popup influenciou, o número antigo ficava na tela para sempre. A
--    versão anterior já tinha essa "passada de zerar" para a receita
--    atribuída — faltava a irmã.
--
-- 2. Hold-out subestimava o grupo exposto. O relatório casa o visitante
--    por worder_visitor_id, mas o mesmo navegador pode ter um id antigo
--    guardado em visitor_id_aliases (o resolvedor de identidade grava
--    quando o id do cliente difere do canônico). Sem esse casamento, o
--    visitante exposto contava em "visitors" e nunca em "buyers", o que
--    empurrava a receita incremental para baixo — justamente no popup que
--    funciona. (O apelido não é gravado quando o casamento veio de PII
--    digitada: enxertar um id de navegador na identidade de outra pessoa
--    seria pior do que a subcontagem.)
-- ============================================================================

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

    -- Idem para a influenciada: sem nenhum pedido na janela, zera.
    execute $u$
      update public.crm_forms f set influenced_revenue = 0, influenced_orders = 0
       where f.organization_id = $1
         and (f.influenced_orders > 0 or f.influenced_revenue > 0)
         and not exists (
           select 1
             from public.order_attribution oa
             join public.crm_form_submissions s
               on s.organization_id = oa.organization_id
              and s.contact_id = oa.contact_id
              and s.form_id = f.id
              and coalesce(s.holdout, false) = false
              and s.created_at <= oa.order_at
              and s.created_at >= oa.order_at - make_interval(days => $2)
            where oa.organization_id = $1 and oa.revoked_at is null
              and (f.store_id is null or oa.store_id is null or f.store_id = oa.store_id)
         )
    $u$ using p_organization_id, v_popup_days;
  end if;
end;
$$;

revoke execute on function public.refresh_attribution_totals(uuid) from public, anon, authenticated;
grant execute on function public.refresh_attribution_totals(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- Hold-out: casa o visitante também pelos apelidos do navegador
-- ----------------------------------------------------------------------------
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
            -- Casa pelo id canônico OU por um apelido do mesmo navegador.
            select b.bucket, b.visitor_id, b.first_at,
                   coalesce(vi.contact_id, va.contact_id) as contact_id
              from base b
              left join public.visitor_identities vi
                     on vi.organization_id = p_organization_id
                    and vi.worder_visitor_id = b.visitor_id
                    and vi.merged_into_id is null
              left join lateral (
                    select vi2.contact_id
                      from public.visitor_id_aliases al
                      join public.visitor_identities vi2 on vi2.id = al.identity_id
                     where al.organization_id = p_organization_id
                       and al.alias_visitor_id = b.visitor_id
                       and vi2.merged_into_id is null
                     limit 1
              ) va on vi.contact_id is null
        ),
        compras as (
            select i.bucket, i.visitor_id, i.contact_id,
                   count(o.id) as orders,
                   coalesce(sum(coalesce(o.total_price, 0) - coalesce(o.total_refunded, 0)), 0) as revenue
              from ident i
              left join public.shopify_orders o
                     on o.organization_id = p_organization_id
                    and o.contact_id = i.contact_id
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
