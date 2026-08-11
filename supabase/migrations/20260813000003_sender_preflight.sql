-- ============================================================================
-- 20260813000003_sender_preflight.sql
-- O preflight do sender (decisão H do plano) e o espelho no inbox:
--   * public.channel_template_policies — o LAR dos nomes de template na camada
--     de canal (missão nunca carrega template; regra da fronteira §4.3).
--     event_type NULL = template default da org naquele canal.
--   * internal.sender_preflight — a decisão em SQL, numa transação curta:
--     opt-out → janela 24h → fallback de template. O sender executa o
--     veredito; nunca recalcula a regra.
--   * internal.mirror_outbound_to_inbox — 1 linha em whatsapp_cloud_messages
--     (dedup por wamid) + preview da conversa: o inbox continua vivo sem a UI
--     saber que o runtime existe.
--
-- O preflight de template de MOMENTO chega com commercial_moments (Etapa 5).
-- ============================================================================

create table public.channel_template_policies (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid        not null references public.organizations (id) on delete cascade,
    -- NULL = default da org para o canal (v1 usa este); por-evento refina depois.
    event_type      text,
    channel         text        not null default 'whatsapp'
                        check (channel in ('whatsapp', 'email', 'instagram')),
    template_name   text        not null,
    language        text        not null default 'pt_BR',
    status          text        not null default 'approved'
                        check (status in ('approved', 'paused')),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create unique index channel_template_policies_uniq
    on public.channel_template_policies (organization_id, channel, coalesce(event_type, ''));

create trigger channel_template_policies_touch
    before update on public.channel_template_policies
    for each row execute function public.touch_updated_at();

grant select on public.channel_template_policies to sender_role, worker_role, authenticated;

alter table public.channel_template_policies enable row level security;

create policy ctp_member_read on public.channel_template_policies
    for select to authenticated
    using (public.user_belongs_to_org(organization_id));

create policy ctp_app_read on public.channel_template_policies
    for select to worker_role, sender_role
    using (organization_id = public.current_app_organization_id());

-- ----------------------------------------------------------------------------
-- O claim passa a carregar `kind`: é ele que o preflight usa para decidir se
-- janela fechada vira supressão (reply) ou fallback de template (toque de
-- funil). ADD ATTRIBUTE anexa no fim — posição 9, e o repository lê por índice.
-- ----------------------------------------------------------------------------
alter type internal.claimed_send add attribute kind text;

comment on type internal.claimed_send is
    'Tudo que um envio precisa, numa linha só. channel_external_id: whatsapp → phone_number_id da conta Cloud (a da outbox, ou a conta ativa única da org). kind alimenta o preflight (reply vs toque de funil).';

create or replace function internal.claim_outbox_batch(
    p_claim_token uuid,
    p_limit       integer default 50,
    p_lease       interval default interval '60 seconds'
)
    returns setof internal.claimed_send
    language sql
    security definer
    set search_path = pg_catalog, public, internal
as $$
    with claimed as (
        select id
          from internal.message_outbox
         where status = 'pending'
           and next_attempt_at <= now()
         order by next_attempt_at
         for update skip locked
         limit p_limit
    ),
    marked as (
        update internal.message_outbox o
           set status = 'sending',
               locked_by = p_claim_token::text,
               locked_until = now() + p_lease,
               request_started_at = now(),
               attempt_count = o.attempt_count + 1
          from claimed
         where o.id = claimed.id
        returning o.*
    )
    select m.id,
           m.organization_id,
           m.channel,
           case when m.channel = 'whatsapp' then
               coalesce(
                   (select w.phone_number_id
                      from public.whatsapp_business_accounts w
                     where w.id = m.channel_account_id),
                   (select w.phone_number_id
                      from public.whatsapp_business_accounts w
                     where w.organization_id = m.organization_id
                       and w.status = 'active'
                     order by w.created_at
                     limit 1)
               )
           end,
           coalesce(ct.whatsapp, ct.phone),
           m.payload,
           m.idempotency_key,
           m.attempt_count,
           m.kind
      from marked m
      join public.contacts ct on ct.id = m.contact_id
$$;

-- ----------------------------------------------------------------------------
-- O veredito do preflight. SECURITY DEFINER: o sender consulta opt-status e
-- conversas de qualquer org que ele esteja drenando — a função valida por
-- argumentos explícitos, no padrão das claim functions.
--   verdict: 'ok' | 'opt_out' | 'window_closed' | 'template' | 'no_template'
-- ----------------------------------------------------------------------------
create function internal.sender_preflight(
    p_organization_id uuid,
    p_to_phone        text,
    p_kind            text,
    p_channel         text default 'whatsapp'
)
    returns table (verdict text, template_name text, template_language text)
    language plpgsql
    stable
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_opted_out   boolean;
    v_last_inbound timestamptz;
    v_window_open boolean;
    v_name        text;
    v_lang        text;
begin
    -- 1. Opt-out (whatsapp_opt_status; telefone com e sem '+').
    select exists (
        select 1 from public.whatsapp_opt_status o
         where o.organization_id = p_organization_id
           and o.status = 'opted_out'
           and (o.phone = p_to_phone
                or o.phone = ltrim(p_to_phone, '+')
                or ltrim(o.phone, '+') = ltrim(p_to_phone, '+'))
    ) into v_opted_out;
    if v_opted_out then
        return query select 'opt_out'::text, null::text, null::text;
        return;
    end if;

    -- 2. Janela de 24h, pela conversa canônica do contato. Contato que nunca
    -- mandou inbound (toque de funil frio) = janela fechada.
    select c.last_inbound_at into v_last_inbound
      from public.conversations c
      join public.contacts ct on ct.id = c.contact_id
     where c.organization_id = p_organization_id
       and (ct.whatsapp = p_to_phone or ct.phone = p_to_phone
            or ltrim(ct.whatsapp, '+') = ltrim(p_to_phone, '+')
            or ltrim(coalesce(ct.phone, ''), '+') = ltrim(p_to_phone, '+'))
     order by c.last_inbound_at desc nulls last
     limit 1;

    v_window_open := v_last_inbound is not null
                     and v_last_inbound > now() - interval '24 hours';
    if v_window_open then
        return query select 'ok'::text, null::text, null::text;
        return;
    end if;

    -- 3. Janela fechada: resposta livre não sai; toque de funil cai para o
    -- template aprovado da org (default do canal).
    if p_kind = 'reply' then
        return query select 'window_closed'::text, null::text, null::text;
        return;
    end if;

    select t.template_name, t.language into v_name, v_lang
      from public.channel_template_policies t
     where t.organization_id = p_organization_id
       and t.channel = p_channel
       and t.status = 'approved'
     order by t.event_type nulls last
     limit 1;

    if v_name is null then
        return query select 'no_template'::text, null::text, null::text;
        return;
    end if;

    return query select 'template'::text, v_name, v_lang;
end
$$;

revoke execute on function internal.sender_preflight(uuid, text, text, text) from public;
grant execute on function internal.sender_preflight(uuid, text, text, text) to sender_role;

-- ----------------------------------------------------------------------------
-- A terceira perna da decisão 59: o webhook de STATUS chega no app server
-- (service_role), e `internal` é invisível para a Data API de propósito.
-- Mesmo padrão de public.ingest_inbound_message: wrapper público, SECURITY
-- DEFINER, EXECUTE só para quem é o webhook de verdade.
-- ----------------------------------------------------------------------------
create function public.correlate_channel_status(
    p_idempotency_key     text,
    p_status              text,
    p_provider_message_id text default null
)
    returns boolean
    language sql
    security definer
    set search_path = pg_catalog, internal
as $$
    select internal.correlate_outbox_status(
        p_idempotency_key, p_status, p_provider_message_id
    )
$$;

revoke execute on function public.correlate_channel_status(text, text, text) from public;
grant execute on function public.correlate_channel_status(text, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- O espelho: o envio do runtime aparece no inbox como sempre apareceu.
-- ----------------------------------------------------------------------------
create function internal.mirror_outbound_to_inbox(
    p_organization_id uuid,
    p_to_phone        text,
    p_wamid           text,
    p_text            text
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_conversation record;
begin
    select wcc.id, wcc.waba_id into v_conversation
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and (wcc.wa_id = p_to_phone or wcc.wa_id = ltrim(p_to_phone, '+'))
     order by wcc.last_message_at desc nulls last
     limit 1;

    if v_conversation.id is null then
        -- Sem conversa no espelho (toque frio): nada a espelhar; a canônica
        -- é a fonte e o inbox conhece a pessoa quando ela responder.
        return false;
    end if;

    insert into public.whatsapp_cloud_messages
        (organization_id, waba_id, conversation_id, message_id, direction,
         to_number, message_type, text_body, status, sent_by_bot, sender)
    values
        (p_organization_id, v_conversation.waba_id, v_conversation.id, p_wamid,
         'outbound', p_to_phone, 'text', p_text, 'sent', true, 'ai')
    on conflict (message_id) do nothing;

    update public.whatsapp_cloud_conversations
       set last_message_at = now(),
           last_message_preview = left(coalesce(p_text, ''), 120),
           last_message_direction = 'outbound',
           updated_at = now()
     where id = v_conversation.id;

    return true;
end
$$;

revoke execute on function internal.mirror_outbound_to_inbox(uuid, text, text, text) from public;
grant execute on function internal.mirror_outbound_to_inbox(uuid, text, text, text) to sender_role;
