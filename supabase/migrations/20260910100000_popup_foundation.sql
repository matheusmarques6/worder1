-- ============================================================================
-- 20260910100000_popup_foundation.sql
-- Popups, Fase 0: a verdade nos números e a prova do consentimento.
--
-- O que muda e por quê:
--
--   * consent_records — a prova. A LGPD (Art. 8º §2º) põe o ônus da prova no
--     controlador: não basta gravar `email_consent = true`, é preciso poder
--     dizer O QUE a pessoa leu, QUANDO, DE ONDE e POR QUAL canal. A submissão
--     guardava IP e user-agent, mas nunca o texto exibido nem a decisão por
--     canal. Append-only pelo mesmo motivo do incentive_ledger: história não
--     se reescreve.
--
--   * crm_form_submissions ganha contexto — visitor_id, sessão, página, país,
--     dispositivo — e as colunas que a Fase 1 preenche (cupom, grant,
--     hold-out, variante, conversão). Sem o visitor_id na submissão não há
--     como ligar a impressão de ontem ao pedido de amanhã.
--
--   * form_events aceita 'holdout', 'step' e 'reward': o grupo de controle e
--     o funil por etapa são eventos como os outros, na mesma tabela.
--
--   * crm_forms ganha os totais que o motor de atribuição vai recalcular
--     (attributed_*, driven_*). Nascem zerados; a Fase 1 os enche.
--
--   * popup_daily_stats / popup_forms_summary — a série diária e o resumo por
--     popup vêm do banco, agregados, em vez do painel dividir um contador
--     total pelo número de dias e chamar de gráfico.
--
-- Guardas: crm_forms, crm_form_submissions e form_events só existem via
-- migrations-archive (não estão no stack do CI). Tudo que as toca fica atrás
-- de to_regclass, no padrão das migrations de RLS de 09/09.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. consent_records — a prova do consentimento, por canal
-- ----------------------------------------------------------------------------
create table if not exists public.consent_records (
    id                uuid primary key default gen_random_uuid(),
    organization_id   uuid not null references public.organizations (id) on delete cascade,
    contact_id        uuid references public.contacts (id) on delete cascade,
    channel           text not null check (channel in ('email', 'whatsapp', 'sms')),
    -- granted: opt-in único · pending: aguardando confirmação (DOI)
    -- confirmed: DOI confirmado · denied: caixa deixada em branco · revoked: opt-out
    action            text not null check (action in ('granted', 'pending', 'confirmed', 'denied', 'revoked')),
    -- De onde veio: popup_form, double_opt_in, checkout, import, manual, whatsapp_keyword…
    source            text not null,
    source_ref        text,
    submission_id     uuid,
    -- O texto EXATO que a pessoa viu, já sem HTML, e um hash para comparar
    -- versões sem carregar o texto.
    consent_text      text,
    consent_text_hash text,
    consent_version   text,
    page_url          text,
    ip_address        text,
    user_agent        text,
    locale            text,
    occurred_at       timestamptz not null default now(),
    created_at        timestamptz not null default now()
);

comment on table public.consent_records is
    'Prova de consentimento por canal (LGPD Art. 8º §2º): o texto exibido, a decisão, a origem e o contexto técnico. Append-only.';

create index if not exists consent_records_contact_idx
    on public.consent_records (organization_id, contact_id, channel, occurred_at desc);

create index if not exists consent_records_submission_idx
    on public.consent_records (organization_id, submission_id)
    where submission_id is not null;

create or replace function internal.forbid_consent_update()
    returns trigger
    language plpgsql
    set search_path = pg_catalog, public
as $$
begin
    raise exception 'consent_records é append-only: registre uma nova decisão, nunca edite a anterior';
end
$$;

drop trigger if exists consent_records_append_only on public.consent_records;
create trigger consent_records_append_only
    before update on public.consent_records
    for each row execute function internal.forbid_consent_update();

alter table public.consent_records enable row level security;

drop policy if exists consent_records_member_read on public.consent_records;
create policy consent_records_member_read on public.consent_records
    for select to authenticated
    using (public.user_belongs_to_org(organization_id));

revoke all on public.consent_records from public, anon;
grant select on public.consent_records to authenticated;

-- ----------------------------------------------------------------------------
-- 2. contacts — origem do consentimento de WhatsApp e SMS (paridade com e-mail)
-- ----------------------------------------------------------------------------
alter table public.contacts add column if not exists whatsapp_consent_source text;
alter table public.contacts add column if not exists sms_consent_source      text;

-- ----------------------------------------------------------------------------
-- 3. crm_form_submissions — contexto da captura e ganchos da Fase 1
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.crm_form_submissions') is null then
        raise notice 'crm_form_submissions ausente — pulando colunas de contexto';
        return;
    end if;

    alter table public.crm_form_submissions add column if not exists visitor_id         text;
    alter table public.crm_form_submissions add column if not exists session_id         text;
    alter table public.crm_form_submissions add column if not exists page_url           text;
    alter table public.crm_form_submissions add column if not exists country            text;
    alter table public.crm_form_submissions add column if not exists device             text;
    -- Fase 1: cupom e ledger
    alter table public.crm_form_submissions add column if not exists coupon_code        text;
    alter table public.crm_form_submissions add column if not exists coupon_kind        text;
    alter table public.crm_form_submissions add column if not exists grant_id           uuid;
    -- Fase 1/3: experimento
    alter table public.crm_form_submissions add column if not exists holdout            boolean not null default false;
    alter table public.crm_form_submissions add column if not exists variant_id         uuid;
    -- Fase 1: espelho da atribuição (o motor grava aqui, como faz em email_sends)
    alter table public.crm_form_submissions add column if not exists converted_order_id text;
    alter table public.crm_form_submissions add column if not exists converted_at       timestamptz;
    alter table public.crm_form_submissions add column if not exists conversion_value   numeric(12, 2);

    -- Candidatos de atribuição: "submissões deste contato antes do pedido".
    create index if not exists crm_form_submissions_contact_time_idx
        on public.crm_form_submissions (organization_id, contact_id, created_at desc)
        where contact_id is not null;

    create index if not exists crm_form_submissions_visitor_idx
        on public.crm_form_submissions (organization_id, visitor_id)
        where visitor_id is not null;

    create index if not exists crm_form_submissions_grant_idx
        on public.crm_form_submissions (grant_id)
        where grant_id is not null;
end $$;

-- ----------------------------------------------------------------------------
-- 4. form_events — grupo de controle e funil por etapa são eventos também
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.form_events') is null then
        raise notice 'form_events ausente — pulando extensão de tipos';
        return;
    end if;

    alter table public.form_events drop constraint if exists form_events_event_type_check;
    alter table public.form_events add constraint form_events_event_type_check
        check (event_type in ('impression', 'dismissed', 'submitted', 'engaged',
                              'holdout', 'step', 'reward'));

    -- A série diária filtra por (form, tipo, dia); o índice existente é
    -- (org, form, tempo) e força o filtro de tipo a varrer.
    create index if not exists form_events_form_type_time_idx
        on public.form_events (form_id, event_type, occurred_at desc);
end $$;

-- ----------------------------------------------------------------------------
-- 5. crm_forms — totais de receita que o motor de atribuição mantém
-- ----------------------------------------------------------------------------
do $$
begin
    if to_regclass('public.crm_forms') is null then
        raise notice 'crm_forms ausente — pulando totais de atribuição';
        return;
    end if;

    alter table public.crm_forms add column if not exists attributed_revenue numeric(14, 2) not null default 0;
    alter table public.crm_forms add column if not exists attributed_orders  integer        not null default 0;
    alter table public.crm_forms add column if not exists driven_revenue     numeric(14, 2) not null default 0;
    alter table public.crm_forms add column if not exists driven_orders      integer        not null default 0;
end $$;

-- ----------------------------------------------------------------------------
-- 6. Agregações — o que o painel lê
-- ----------------------------------------------------------------------------
-- Ambas filtram por organization_id ANTES de tudo: o tenant é o primeiro
-- predicado, não um detalhe do chamador. Rodam como quem chama (invoker):
-- o app chama com service_role depois de autenticar; um usuário logado pela
-- Data API cai na RLS de form_events/crm_forms.
do $$
begin
    if to_regclass('public.form_events') is null or to_regclass('public.crm_forms') is null then
        raise notice 'form_events/crm_forms ausentes — pulando funções de agregação';
        return;
    end if;

    execute $fn$
    create or replace function public.popup_daily_stats(
        p_organization_id uuid,
        p_form_id         uuid,
        p_days            integer default 30
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
        with dias as (
            select generate_series(
                (now() at time zone 'utc')::date - (greatest(1, least(p_days, 365)) - 1),
                (now() at time zone 'utc')::date,
                interval '1 day'
            )::date as day
        ),
        ev as (
            select (occurred_at at time zone 'utc')::date as day,
                   event_type,
                   count(*) as n
              from public.form_events
             where organization_id = p_organization_id
               and form_id = p_form_id
               and occurred_at >= (now() at time zone 'utc')::date - greatest(1, least(p_days, 365))
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

    execute $fn$
    create or replace function public.popup_forms_summary(
        p_organization_id uuid,
        p_days            integer default 30
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
        with ev as (
            select form_id,
                   count(*) filter (where event_type = 'impression') as impressions,
                   count(distinct properties->>'visitor_id')
                        filter (where event_type = 'impression' and properties->>'visitor_id' is not null) as unique_visitors,
                   count(*) filter (where event_type = 'submitted')  as submissions,
                   count(*) filter (where event_type = 'dismissed')  as dismissals,
                   count(*) filter (where event_type = 'holdout')    as holdouts
              from public.form_events
             where organization_id = p_organization_id
               and occurred_at >= now() - make_interval(days => greatest(1, least(p_days, 365)))
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

    execute 'revoke execute on function public.popup_daily_stats(uuid, uuid, integer) from public, anon';
    execute 'grant execute on function public.popup_daily_stats(uuid, uuid, integer) to authenticated, service_role';
    execute 'revoke execute on function public.popup_forms_summary(uuid, integer) from public, anon';
    execute 'grant execute on function public.popup_forms_summary(uuid, integer) to authenticated, service_role';
end $$;
