-- ============================================================================
-- 20260910150000_popup_experiments.sql
-- Popups, Fase 3: experimentos (A/B e bandit), propensão e ofertas por
-- intenção.
--
--   * popup_experiments — um experimento por popup "pai" (crm_forms). As
--     variantes são linhas de crm_forms com ab_parent_id = pai (colunas que
--     já existiam desde 20260402 e nunca foram usadas). Variante nunca é
--     publicada sozinha: entra na loja só pelo script do pai, que sorteia
--     por visitante.
--   * crm_form_submissions.propensity_score / intent / offer_tier /
--     offer_bucket — o que o runtime mediu e ofereceu naquela inscrição,
--     para calibrar o Smart Triggering e medir Smart Offers contra o
--     controle.
--   * popup_variant_stats — impressões, visitantes, inscrições, opt-ins,
--     pedidos e receita por variante, no período. É o que o teste de
--     significância e o painel leem.
--   * popup_variant_context_stats — o mesmo por contexto (tipo de página ×
--     origem × dispositivo), para o modo bandit.
--
-- Guardas por to_regclass: crm_forms/crm_form_submissions/form_events só
-- existem via migrations-archive; no Postgres limpo do CI é no-op.
-- ============================================================================

do $$
begin
    if to_regclass('public.crm_forms') is null then
        raise notice 'crm_forms ausente — pulando popup_experiments';
        return;
    end if;

    create table if not exists public.popup_experiments (
        id                  uuid primary key default gen_random_uuid(),
        organization_id     uuid not null,
        form_id             uuid not null references public.crm_forms(id) on delete cascade,
        name                text,
        status              text not null default 'draft'
                            check (status in ('draft', 'running', 'ended')),
        mode                text not null default 'split'
                            check (mode in ('split', 'bandit')),
        kpi                 text not null default 'submit'
                            check (kpi in ('submit', 'optin', 'revenue')),
        -- {"<variant_id>": peso} — o pai entra com o próprio id.
        split               jsonb not null default '{}'::jsonb,
        min_sample          integer not null default 200,
        max_days            integer not null default 30,
        confidence          numeric not null default 0.95,
        auto_apply_winner   boolean not null default true,
        -- bandit: abaixo disto por variante vale o split fixo.
        bandit_min_views    integer not null default 10000,
        started_at          timestamptz,
        ended_at            timestamptz,
        winner_variant_id   uuid,
        end_reason          text,
        -- último cálculo do cron: comparações, pesos do bandit, carimbo.
        stats               jsonb not null default '{}'::jsonb,
        created_at          timestamptz not null default now(),
        updated_at          timestamptz not null default now()
    );

    create index if not exists popup_experiments_org_form_idx
        on public.popup_experiments (organization_id, form_id);
    -- Um experimento em andamento por popup.
    create unique index if not exists popup_experiments_one_running_idx
        on public.popup_experiments (form_id)
        where status = 'running';

    alter table public.popup_experiments enable row level security;
    drop policy if exists popup_experiments_member_read on public.popup_experiments;
    create policy popup_experiments_member_read on public.popup_experiments
        for select to authenticated using (public.user_belongs_to_org(organization_id));
    revoke all on public.popup_experiments from public, anon;
    grant select on public.popup_experiments to authenticated;
    grant select, insert, update, delete on public.popup_experiments to service_role;

    create index if not exists crm_forms_ab_parent_idx
        on public.crm_forms (ab_parent_id)
        where ab_parent_id is not null;
end $$;

do $$
begin
    if to_regclass('public.crm_form_submissions') is null then
        return;
    end if;
    alter table public.crm_form_submissions add column if not exists propensity_score numeric;
    alter table public.crm_form_submissions add column if not exists intent           text;
    alter table public.crm_form_submissions add column if not exists offer_tier       text;
    alter table public.crm_form_submissions add column if not exists offer_bucket     text;
    alter table public.crm_form_submissions drop constraint if exists crm_form_submissions_intent_check;
    alter table public.crm_form_submissions add constraint crm_form_submissions_intent_check
        check (intent is null or intent in ('low', 'mid', 'high'));
    alter table public.crm_form_submissions drop constraint if exists crm_form_submissions_offer_bucket_check;
    alter table public.crm_form_submissions add constraint crm_form_submissions_offer_bucket_check
        check (offer_bucket is null or offer_bucket in ('smart', 'control'));
end $$;

-- ----------------------------------------------------------------------------
-- Estatística por variante. A variante "A" é o próprio pai: eventos e
-- inscrições sem variant_id (popups anteriores ao experimento) contam para
-- ele. variant_id em form_events vem do runtime como texto; só o que parece
-- UUID entra.
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.form_events') is null or to_regclass('public.crm_form_submissions') is null then
        return;
    end if;

    execute $fn$
    create or replace function public.popup_variant_stats(
        p_organization_id uuid,
        p_form_id         uuid,
        p_since           timestamptz
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
        p_since           timestamptz
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

    revoke execute on function public.popup_variant_stats(uuid, uuid, timestamptz) from public, anon;
    grant execute on function public.popup_variant_stats(uuid, uuid, timestamptz) to authenticated, service_role;
    revoke execute on function public.popup_variant_context_stats(uuid, uuid, timestamptz) from public, anon;
    grant execute on function public.popup_variant_context_stats(uuid, uuid, timestamptz) to service_role;
end $$;
