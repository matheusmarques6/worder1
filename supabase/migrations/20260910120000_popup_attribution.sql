-- ============================================================================
-- 20260910120000_popup_attribution.sql
-- Popups, Fase 1 (parte 2): o popup vira um canal do motor de atribuição.
--
-- O motor v2 (20260904000001) decide UM crédito por pedido entre e-mail,
-- WhatsApp e SMS. O popup ficava de fora: a inscrição virava contato, o
-- contato comprava, e ninguém ligava uma coisa à outra. Aqui a submissão
-- entra como candidata — a mesma disputa, as mesmas regras:
--
--   * Candidato: a submissão do contato antes do pedido, dentro da janela
--     (padrão 30 dias, Configurações → Atribuição), fora do grupo de
--     controle, e que ainda não levou crédito de outro pedido — a Alia
--     conta o PRIMEIRO pedido após a inscrição, e é isso.
--   * Disputa: último toque como sempre. Se depois de se inscrever a
--     pessoa clicou no e-mail de boas-vindas, o e-mail puxou a compra e
--     leva o crédito; o popup fica com a receita "influenciada".
--   * Três receitas por popup em crm_forms: atribuída (crédito único),
--     influenciada (todo pedido na janela após a inscrição, creditado a
--     quem for) e por código (o cupom do grant foi usado no pedido).
--
-- Mais o relatório de hold-out: compra e receita de quem VIU o popup
-- contra quem foi sorteado para não ver. É a única das três que responde
-- "quanto o popup gerou de verdade".
--
-- Tudo atrás de to_regclass: crm_form_submissions e visitor_identities só
-- existem via migrations-archive. Sem elas (CI), o motor fica como está.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Receita por código: a tabela e o registro
-- ----------------------------------------------------------------------------
create table if not exists public.popup_driven_orders (
    organization_id uuid not null references public.organizations (id) on delete cascade,
    order_ref       text not null,
    grant_id        uuid not null references public.incentive_grants (id) on delete cascade,
    form_id         uuid not null,
    submission_id   uuid,
    contact_id      uuid,
    revenue         numeric(14, 2) not null default 0,
    currency        text not null default 'BRL',
    order_at        timestamptz not null default now(),
    created_at      timestamptz not null default now(),
    primary key (organization_id, order_ref)
);

comment on table public.popup_driven_orders is
    'Pedidos que usaram o cupom emitido por um popup (o grant foi consumido). Um pedido conta uma vez.';

create index if not exists popup_driven_orders_form_idx
    on public.popup_driven_orders (organization_id, form_id, order_at desc);

alter table public.popup_driven_orders enable row level security;
drop policy if exists popup_driven_orders_member_read on public.popup_driven_orders;
create policy popup_driven_orders_member_read on public.popup_driven_orders
    for select to authenticated using (public.user_belongs_to_org(organization_id));
revoke all on public.popup_driven_orders from public, anon;
grant select on public.popup_driven_orders to authenticated;

do $$
begin
    if to_regclass('public.crm_forms') is null then
        raise notice 'crm_forms ausente — pulando colunas de receita influenciada';
        return;
    end if;
    alter table public.crm_forms add column if not exists influenced_revenue numeric(14, 2) not null default 0;
    alter table public.crm_forms add column if not exists influenced_orders  integer        not null default 0;
end $$;

-- Chamada pelo webhook de pedido depois de consume_incentive_grant.
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
              from (select form_id, sum(revenue) as rev, count(*)::integer as n
                      from public.popup_driven_orders
                     where organization_id = $1 and form_id = $2
                     group by form_id) t
             where f.id = t.form_id
        $u$ using p_organization_id, v_grant.form_id;
    end if;
    return true;
end
$$;

revoke execute on function public.record_popup_driven_order(uuid, uuid, text, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_popup_driven_order(uuid, uuid, text, numeric, text, timestamptz) to service_role;

-- ----------------------------------------------------------------------------
-- 2. O canal 'popup' no motor
-- ----------------------------------------------------------------------------
alter table public.order_attribution drop constraint if exists order_attribution_channel_check;
alter table public.order_attribution add constraint order_attribution_channel_check
    check (channel in ('email', 'sms', 'whatsapp', 'popup'));

do $$
begin
    if to_regclass('public.crm_form_submissions') is null then
        raise notice 'crm_form_submissions ausente — motor de atribuição segue sem o canal popup';
        return;
    end if;

    -- Assinaturas novas (um parâmetro a mais): as antigas saem para não
    -- virar sobrecarga ambígua.
    drop function if exists public.attribution_candidates(uuid, uuid, timestamptz, uuid, integer, integer, integer, boolean, boolean, text);
    drop function if exists public.attribute_order(uuid, text, uuid, timestamptz, numeric, numeric, text, uuid, integer, integer, integer, boolean, boolean, text);
    drop function if exists public.backfill_order_attribution(uuid, timestamptz, integer, integer, integer, text);

    execute $fn$
    create function public.attribution_candidates(
      p_organization_id uuid,
      p_contact_id      uuid,
      p_order_at        timestamptz,
      p_store_id        uuid    default null,
      p_email_days      integer default 5,
      p_whatsapp_days   integer default 2,
      p_sms_days        integer default 2,
      p_count_opens     boolean default true,
      p_exclude_mpp     boolean default true,
      p_model           text    default 'last_touch',
      p_popup_days      integer default 30,
      p_order_id        text    default null
    )
    returns table (
      channel       text,
      send_id       uuid,
      campaign_id   uuid,
      automation_id uuid,
      engaged_at    timestamptz,
      sent_at       timestamptz,
      engaged       boolean
    )
    language sql stable security definer
    set search_path = pg_catalog, public
    as $body$
      with email_c as (
        select 'email'::text as channel, es.id, es.campaign_id, es.automation_id,
               coalesce(es.clicked_at, es.opened_at,
                        case when not p_exclude_mpp then es.mpp_opened_at end) as engaged_at,
               es.sent_at,
               (es.clicked_at is not null
                 or (p_count_opens and es.opened_at is not null)
                 or (p_count_opens and not p_exclude_mpp and es.mpp_opened_at is not null)) as engaged
        from public.email_sends es
        where es.organization_id = p_organization_id
          and es.contact_id = p_contact_id
          and es.sent_at <= p_order_at
          and es.sent_at >= p_order_at - (p_email_days || ' days')::interval
          and (p_store_id is null or es.store_id is null or es.store_id = p_store_id)
          and es.bounced_at is null and es.complained_at is null
          and (es.clicked_at is null or es.clicked_at <= p_order_at)
          and (es.opened_at  is null or es.opened_at  <= p_order_at)
      ),
      wa_c as (
        select 'whatsapp'::text, ws.id, ws.campaign_id, ws.automation_id,
               coalesce(ws.replied_at, ws.read_at, ws.delivered_at) as engaged_at,
               ws.sent_at,
               (ws.replied_at is not null or ws.read_at is not null or ws.delivered_at is not null) as engaged
        from public.whatsapp_sends ws
        where ws.organization_id = p_organization_id
          and ws.contact_id = p_contact_id
          and ws.sent_at <= p_order_at
          and ws.sent_at >= p_order_at - (p_whatsapp_days || ' days')::interval
          and (p_store_id is null or ws.store_id is null or ws.store_id = p_store_id)
          and (ws.replied_at   is null or ws.replied_at   <= p_order_at)
          and (ws.read_at      is null or ws.read_at      <= p_order_at)
          and (ws.delivered_at is null or ws.delivered_at <= p_order_at)
      ),
      sms_c as (
        select 'sms'::text, ss.id, ss.campaign_id, ss.automation_id,
               coalesce(ss.clicked_at, ss.delivered_at) as engaged_at,
               ss.sent_at,
               (ss.clicked_at is not null or ss.delivered_at is not null) as engaged
        from public.sms_sends ss
        where ss.organization_id = p_organization_id
          and ss.contact_id = p_contact_id
          and ss.sent_at <= p_order_at
          and ss.sent_at >= p_order_at - (p_sms_days || ' days')::interval
          and (p_store_id is null or ss.store_id is null or ss.store_id = p_store_id)
          and (ss.clicked_at   is null or ss.clicked_at   <= p_order_at)
          and (ss.delivered_at is null or ss.delivered_at <= p_order_at)
      ),
      -- A inscrição é o toque. Engajou por definição (a pessoa preencheu).
      -- Só o PRIMEIRO pedido depois dela pode levar o crédito: uma
      -- submissão que já foi creditada a outro pedido sai da disputa.
      popup_c as (
        select 'popup'::text, s.id, null::uuid, null::uuid,
               s.created_at as engaged_at,
               s.created_at as sent_at,
               true as engaged
        from public.crm_form_submissions s
        left join public.crm_forms f on f.id = s.form_id
        where s.organization_id = p_organization_id
          and s.contact_id = p_contact_id
          and s.created_at <= p_order_at
          and s.created_at >= p_order_at - (p_popup_days || ' days')::interval
          and coalesce(s.holdout, false) = false
          and (p_store_id is null or f.store_id is null or f.store_id = p_store_id)
          and not exists (
            select 1 from public.order_attribution oa
             where oa.organization_id = p_organization_id
               and oa.channel = 'popup'
               and oa.send_id = s.id
               and oa.revoked_at is null
               and (p_order_id is null or oa.order_id <> p_order_id)
          )
      ),
      todos as (
        select * from email_c union all select * from wa_c union all select * from sms_c union all select * from popup_c
      )
      select channel, id, campaign_id, automation_id, engaged_at, sent_at, engaged
      from todos
      order by
        engaged desc,
        case when p_model = 'first_touch' then coalesce(engaged_at, sent_at) end asc nulls last,
        case when p_model <> 'first_touch' then coalesce(engaged_at, sent_at) end desc nulls last,
        sent_at desc, id;
    $body$;
    $fn$;

    execute $fn$
    create function public.attribute_order(
      p_organization_id uuid,
      p_order_id        text,
      p_contact_id      uuid,
      p_order_at        timestamptz,
      p_gross_revenue   numeric,
      p_refunded        numeric  default 0,
      p_currency        text     default 'BRL',
      p_store_id        uuid     default null,
      p_email_days      integer  default 5,
      p_whatsapp_days   integer  default 2,
      p_sms_days        integer  default 2,
      p_count_opens     boolean  default true,
      p_exclude_mpp     boolean  default true,
      p_model           text     default 'last_touch',
      p_popup_days      integer  default 30
    )
    returns public.order_attribution
    language plpgsql security definer
    set search_path = pg_catalog, public
    as $body$
    declare
      v_cand   record;
      v_row    public.order_attribution;
    begin
      if p_contact_id is null or p_order_id is null then
        return null;
      end if;

      select * into v_cand
      from public.attribution_candidates(
        p_organization_id, p_contact_id, p_order_at, p_store_id,
        p_email_days, p_whatsapp_days, p_sms_days,
        p_count_opens, p_exclude_mpp, p_model, p_popup_days, p_order_id
      )
      limit 1;

      if v_cand is null then
        return null;
      end if;

      insert into public.order_attribution as oa (
        organization_id, order_id, store_id, contact_id,
        channel, send_id, campaign_id, automation_id,
        classification, attribution_model, engaged_at, order_at,
        gross_revenue, refunded, currency
      ) values (
        p_organization_id, p_order_id, p_store_id, p_contact_id,
        case when v_cand.engaged then v_cand.channel else null end,
        case when v_cand.engaged then v_cand.send_id else null end,
        case when v_cand.engaged then v_cand.campaign_id else null end,
        case when v_cand.engaged then v_cand.automation_id else null end,
        case when v_cand.engaged then 'attributed' else 'recipient' end,
        p_model, v_cand.engaged_at, p_order_at,
        coalesce(p_gross_revenue, 0), coalesce(p_refunded, 0), coalesce(p_currency, 'BRL')
      )
      on conflict (organization_id, order_id) do update set
        gross_revenue = greatest(oa.gross_revenue, excluded.gross_revenue),
        refunded      = greatest(oa.refunded, excluded.refunded),
        store_id      = coalesce(oa.store_id, excluded.store_id),
        channel        = case when oa.classification = 'recipient' and excluded.classification = 'attributed'
                              then excluded.channel else oa.channel end,
        send_id        = case when oa.classification = 'recipient' and excluded.classification = 'attributed'
                              then excluded.send_id else oa.send_id end,
        campaign_id    = case when oa.classification = 'recipient' and excluded.classification = 'attributed'
                              then excluded.campaign_id else oa.campaign_id end,
        automation_id  = case when oa.classification = 'recipient' and excluded.classification = 'attributed'
                              then excluded.automation_id else oa.automation_id end,
        engaged_at     = case when oa.classification = 'recipient' and excluded.classification = 'attributed'
                              then excluded.engaged_at else oa.engaged_at end,
        classification = case when oa.classification = 'recipient' and excluded.classification = 'attributed'
                              then 'attributed' else oa.classification end,
        updated_at    = now()
      returning * into v_row;

      if v_row.classification = 'attributed' and v_row.send_id is not null then
        if v_row.channel = 'email' then
          update public.email_sends set conversion_value = v_row.net_revenue, converted_at = coalesce(converted_at, now()), order_id = v_row.order_id
            where id = v_row.send_id;
        elsif v_row.channel = 'whatsapp' then
          update public.whatsapp_sends set conversion_value = v_row.net_revenue, converted_at = coalesce(converted_at, now()), order_id = v_row.order_id
            where id = v_row.send_id;
        elsif v_row.channel = 'sms' then
          update public.sms_sends set conversion_value = v_row.net_revenue, converted_at = coalesce(converted_at, now()), order_id = v_row.order_id
            where id = v_row.send_id;
        elsif v_row.channel = 'popup' then
          update public.crm_form_submissions
             set conversion_value = v_row.net_revenue,
                 converted_at = coalesce(converted_at, v_row.order_at),
                 converted_order_id = v_row.order_id
           where id = v_row.send_id;
        end if;
      end if;

      return v_row;
    end;
    $body$;
    $fn$;

    execute $fn$
    create function public.backfill_order_attribution(
      p_organization_id uuid,
      p_since           timestamptz default now() - interval '90 days',
      p_email_days      integer default 5,
      p_whatsapp_days   integer default 2,
      p_sms_days        integer default 2,
      p_model           text    default 'last_touch',
      p_popup_days      integer default 30
    )
    returns table (pedidos_processados integer, atribuidos integer, apenas_destinatarios integer)
    language plpgsql security definer
    set search_path = pg_catalog, public
    as $body$
    declare
      o        record;
      v_row    public.order_attribution;
      n_total  integer := 0;
      n_attr   integer := 0;
      n_recip  integer := 0;
    begin
      for o in
        select id, shopify_order_id, contact_id, store_id, total_price, total_refunded,
               coalesce(shopify_created_at, created_at) as order_at
        from public.shopify_orders
        where organization_id = p_organization_id
          and contact_id is not null
          and coalesce(shopify_created_at, created_at) >= p_since
        order by coalesce(shopify_created_at, created_at)
      loop
        n_total := n_total + 1;
        v_row := public.attribute_order(
          p_organization_id,
          coalesce(o.shopify_order_id::text, o.id::text),
          o.contact_id, o.order_at,
          coalesce(o.total_price, 0), coalesce(o.total_refunded, 0), 'BRL', o.store_id,
          p_email_days, p_whatsapp_days, p_sms_days, true, true, p_model, p_popup_days
        );
        if v_row.order_id is not null then
          if v_row.classification = 'attributed' then n_attr := n_attr + 1; else n_recip := n_recip + 1; end if;
        end if;
      end loop;
      return query select n_total, n_attr, n_recip;
    end;
    $body$;
    $fn$;

    execute 'revoke execute on function public.attribution_candidates(uuid, uuid, timestamptz, uuid, integer, integer, integer, boolean, boolean, text, integer, text) from public, anon';
    execute 'revoke execute on function public.attribute_order(uuid, text, uuid, timestamptz, numeric, numeric, text, uuid, integer, integer, integer, boolean, boolean, text, integer) from public, anon';
    execute 'revoke execute on function public.backfill_order_attribution(uuid, timestamptz, integer, integer, integer, text, integer) from public, anon';
    execute 'grant execute on function public.attribution_candidates(uuid, uuid, timestamptz, uuid, integer, integer, integer, boolean, boolean, text, integer, text) to service_role';
    execute 'grant execute on function public.attribute_order(uuid, text, uuid, timestamptz, numeric, numeric, text, uuid, integer, integer, integer, boolean, boolean, text, integer) to service_role';
    execute 'grant execute on function public.backfill_order_attribution(uuid, timestamptz, integer, integer, integer, text, integer) to service_role';
end $$;

-- ----------------------------------------------------------------------------
-- 3. Totais por popup no refresh (atribuída + influenciada)
-- ----------------------------------------------------------------------------
-- plpgsql: as referências a crm_* são resolvidas em tempo de execução,
-- atrás de to_regclass — onde a tabela não existe, o bloco não roda.
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
                   where s.organization_id = oa.organization_id
                     and s.contact_id = oa.contact_id
                     and coalesce(s.holdout, false) = false
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

-- ----------------------------------------------------------------------------
-- 4. Relatório de hold-out
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
