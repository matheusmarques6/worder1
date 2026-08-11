-- ============================================================================
-- 20260812000004_engine_functions.sql
-- As funções do motor (fork main@288be7f), adaptadas ao schema canônico:
--   * internal.next_message_seq            — contador atômico por direção
--   * internal.coalesced_job + coalesce_due_conversations (SECURITY DEFINER)
--   * internal.claim_conversation / renew_lease / release_lease  (invoker+RLS)
--   * internal.turn_outcome + conclude_turn — o CAS estendido; outbox+message
--     na MESMA transação; conteúdo nulo = Judge 1 reprovou (avança sem enviar)
--   * internal.claimed_send + claim_outbox_batch / mark_outbox_sent / _failed
--   * internal.sweep_outbox_unknown / correlate_outbox_status /
--     review_stale_unknown / reprocess_dead_letters
--   * internal.runtime_heartbeats
--   * public.ingest_inbound_message — F2: o webhook grava seq atômico +
--     pending_response_at e NÃO enfileira (monopólio do coalescer)
--
-- Adaptações declaradas (runtime/FORK.md): organization_id; canal da conversa
-- vem de last_channel (não há channels_accounts); a conta do canal é resolvida
-- no claim do sender (channel_account_id da outbox pode ser NULL → cai na
-- conta ativa única da org).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Contador atômico
-- ----------------------------------------------------------------------------
create function internal.next_message_seq(p_conversation_id uuid, p_direction text)
    returns integer
    language plpgsql
    set search_path = pg_catalog, public
as $$
declare
    v_seq integer;
begin
    if p_direction not in ('inbound', 'outbound') then
        raise exception 'direção desconhecida: %', p_direction;
    end if;

    update public.conversations
       set next_inbound_seq  = next_inbound_seq  + (p_direction = 'inbound')::int,
           next_outbound_seq = next_outbound_seq + (p_direction = 'outbound')::int
     where id = p_conversation_id
    returning case p_direction
                  when 'inbound' then next_inbound_seq
                  else next_outbound_seq
              end
      into v_seq;

    if v_seq is null then
        raise exception 'conversa % não visível para este escopo', p_conversation_id;
    end if;

    return v_seq;
end
$$;

revoke execute on function internal.next_message_seq(uuid, text) from public;
grant execute on function internal.next_message_seq(uuid, text) to worker_role;

-- ----------------------------------------------------------------------------
-- Coalescer — um job por rajada; all-or-nothing
-- ----------------------------------------------------------------------------
create type internal.coalesced_job as (
    conversation_id uuid,
    generation      integer,
    target_seq      integer,
    organization_id uuid,
    otel            jsonb
);

comment on type internal.coalesced_job is
    'Payload do job de entrada. target_seq é o último seq de entrada no instante do enfileiramento — é contra ele que o CAS da conclusão compara para descobrir se chegou mensagem nova durante a geração.';

create function internal.coalesce_due_conversations(
    p_queue text default 'q_inbound',
    p_limit integer default 100
)
    returns setof internal.coalesced_job
    language plpgsql
    security definer
    set search_path = pg_catalog, public, internal
as $$
declare
    v_jobs internal.coalesced_job[];
    v_job  internal.coalesced_job;
begin
    with due as (
        select id
          from public.conversations
         where pending_response_at is not null
           and pending_response_at <= now()
         order by pending_response_at
         for update skip locked
         limit p_limit
    ),
    bumped as (
        update public.conversations c
           set processing_generation = c.processing_generation + 1,
               pending_response_at = null
          from due
         where c.id = due.id
        returning c.id, c.processing_generation, c.next_inbound_seq, c.organization_id
    )
    select array_agg(
               row(id, processing_generation, next_inbound_seq, organization_id, null)
                   ::internal.coalesced_job
           )
      into v_jobs
      from bumped;

    foreach v_job in array coalesce(v_jobs, array[]::internal.coalesced_job[])
    loop
        perform pgmq.send(
            p_queue,
            jsonb_build_object(
                'conversation_id', v_job.conversation_id,
                'generation', v_job.generation,
                'target_seq', v_job.target_seq,
                'organization_id', v_job.organization_id,
                'otel', v_job.otel
            )
        );
        return next v_job;
    end loop;
end
$$;

revoke execute on function internal.coalesce_due_conversations(text, integer) from public;
grant execute on function internal.coalesce_due_conversations(text, integer) to worker_role;

-- ----------------------------------------------------------------------------
-- FASE 1 · claim (invoker: a RLS impede claim de conversa alheia)
-- ----------------------------------------------------------------------------
create function internal.claim_conversation(
    p_conversation_id uuid,
    p_token uuid,
    p_lease interval default interval '2 minutes'
)
    returns table (last_processed_seq integer, version integer)
    language sql
    set search_path = pg_catalog, public
as $$
    update public.conversations
       set processing_token = p_token,
           processing_until = now() + p_lease
     where id = p_conversation_id
       and (processing_until is null or processing_until < now())
    returning last_processed_seq, version
$$;

create function internal.renew_lease(
    p_conversation_id uuid,
    p_token uuid,
    p_lease interval default interval '2 minutes'
)
    returns boolean
    language plpgsql
    set search_path = pg_catalog, public
as $$
begin
    update public.conversations
       set processing_until = now() + p_lease
     where id = p_conversation_id
       and processing_token = p_token;

    return found;
end
$$;

create function internal.release_lease(p_conversation_id uuid, p_token uuid)
    returns boolean
    language plpgsql
    set search_path = pg_catalog, public
as $$
begin
    update public.conversations
       set processing_token = null,
           processing_until = null
     where id = p_conversation_id
       and processing_token = p_token;

    return found;
end
$$;

-- ----------------------------------------------------------------------------
-- FASE 3 · conclusão — o CAS estendido
-- ----------------------------------------------------------------------------
create type internal.turn_outcome as (
    committed    boolean,
    outbound_seq integer,
    outbox_id    uuid
);

comment on type internal.turn_outcome is
    'committed=false significa que o CAS falhou: o rascunho morre e NADA foi gravado. O chamador não reenvia — o job novo responderá ao conjunto completo.';

create function internal.conclude_turn(
    p_conversation_id  uuid,
    p_token            uuid,
    p_expected_version integer,
    p_generation       integer,
    p_target_seq       integer,
    p_content          jsonb,
    p_idempotency_key  text,
    p_kind             text default 'reply'
)
    returns internal.turn_outcome
    language plpgsql
    set search_path = pg_catalog, public, internal
as $$
declare
    v_organization_id uuid;
    v_contact_id      uuid;
    v_channel         text;
    v_seq             integer;
    v_outbox_id       uuid;
begin
    -- As quatro condições: sou o dono (token) · nada mudou (version) · meu job
    -- é o corrente (generation) · NENHUMA mensagem nova chegou (next_inbound_seq
    -- = target_seq — a que detecta concorrência com o CLIENTE).
    update public.conversations
       set last_processed_seq = p_target_seq,
           processing_token = null,
           processing_until = null,
           version = version + 1
     where id = p_conversation_id
       and processing_token = p_token
       and version = p_expected_version
       and processing_generation = p_generation
       and next_inbound_seq = p_target_seq
    returning organization_id, contact_id, coalesce(last_channel, 'whatsapp')
      into v_organization_id, v_contact_id, v_channel;

    if not found then
        return row(false, null, null)::internal.turn_outcome;
    end if;

    -- Judge 1 reprovou o rascunho: o turno ACABOU — sequência avançou, lease
    -- liberada — e nada sai: nem outbox nem transcript. A trilha desse
    -- silêncio é a linha de alerts que o responder gravou antes de chamar.
    if p_content is null or jsonb_typeof(p_content) = 'null' then
        return row(true, null, null)::internal.turn_outcome;
    end if;

    -- Daqui para baixo comita com o UPDATE acima ou não comita nada.
    insert into internal.message_outbox
        (organization_id, conversation_id, contact_id, channel,
         kind, payload, idempotency_key)
    values
        (v_organization_id, p_conversation_id, v_contact_id, v_channel,
         p_kind, p_content, p_idempotency_key)
    returning id into v_outbox_id;

    v_seq := internal.next_message_seq(p_conversation_id, 'outbound');

    insert into public.messages
        (organization_id, conversation_id, direction, seq, channel,
         author_type, content, outbox_id)
    values
        (v_organization_id, p_conversation_id, 'outbound', v_seq, v_channel,
         'agent', p_content, v_outbox_id);

    return row(true, v_seq, v_outbox_id)::internal.turn_outcome;
end
$$;

comment on function internal.conclude_turn(uuid, uuid, integer, integer, integer, jsonb, text, text) is
    'Conclui o turno com o CAS estendido. Conteúdo nulo (SQL NULL ou jsonb null) significa "o Judge 1 reprovou": a conversa avança e NADA sai.';

revoke execute on function internal.claim_conversation(uuid, uuid, interval) from public;
revoke execute on function internal.renew_lease(uuid, uuid, interval) from public;
revoke execute on function internal.release_lease(uuid, uuid) from public;
revoke execute on function
    internal.conclude_turn(uuid, uuid, integer, integer, integer, jsonb, text, text) from public;

grant execute on function internal.claim_conversation(uuid, uuid, interval) to worker_role;
grant execute on function internal.renew_lease(uuid, uuid, interval) to worker_role;
grant execute on function internal.release_lease(uuid, uuid) to worker_role;
grant execute on function
    internal.conclude_turn(uuid, uuid, integer, integer, integer, jsonb, text, text)
    to worker_role;

-- ----------------------------------------------------------------------------
-- Sender · claim da outbox (SECURITY DEFINER: um sender drena para todas as
-- orgs; a conta do canal resolve aqui — linha única com tudo que o envio usa)
-- ----------------------------------------------------------------------------
create type internal.claimed_send as (
    outbox_id           uuid,
    organization_id     uuid,
    channel_type        text,
    channel_external_id text,
    to_phone_e164       text,
    payload             jsonb,
    idempotency_key     text,
    attempt_count       integer
);

comment on type internal.claimed_send is
    'Tudo que um envio precisa, numa linha só. channel_external_id: whatsapp → phone_number_id da conta Cloud (a da outbox, ou a conta ativa única da org).';

create function internal.claim_outbox_batch(
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
           m.attempt_count
      from marked m
      join public.contacts ct on ct.id = m.contact_id
$$;

create function internal.mark_outbox_sent(
    p_outbox_id           uuid,
    p_claim_token         uuid,
    p_provider_message_id text
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, internal
as $$
begin
    update internal.message_outbox
       set status = 'sent',
           sent_at = now(),
           provider_message_id = p_provider_message_id,
           locked_by = null,
           locked_until = null,
           last_error = null
     where id = p_outbox_id
       and status = 'sending'
       and locked_by = p_claim_token::text;
    return found;
end
$$;

create function internal.mark_outbox_failed(
    p_outbox_id   uuid,
    p_claim_token uuid,
    p_transient   boolean,
    p_error       text,
    -- O atraso vem do runtime (backoff com acaso injetado). O SQL não
    -- recalcula a escada.
    p_retry_in    interval default interval '30 seconds'
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, internal
as $$
begin
    if p_transient then
        update internal.message_outbox
           set status = 'pending',
               next_attempt_at = now() + p_retry_in,
               locked_by = null,
               locked_until = null,
               last_error = p_error
         where id = p_outbox_id
           and status = 'sending'
           and locked_by = p_claim_token::text;
    else
        update internal.message_outbox
           set status = 'failed',
               locked_by = null,
               locked_until = null,
               last_error = p_error
         where id = p_outbox_id
           and status = 'sending'
           and locked_by = p_claim_token::text;
    end if;
    return found;
end
$$;

revoke execute on function internal.claim_outbox_batch(uuid, integer, interval) from public;
revoke execute on function internal.mark_outbox_sent(uuid, uuid, text) from public;
revoke execute on function
    internal.mark_outbox_failed(uuid, uuid, boolean, text, interval) from public;

grant execute on function internal.claim_outbox_batch(uuid, integer, interval) to sender_role;
grant execute on function internal.mark_outbox_sent(uuid, uuid, text) to sender_role;
grant execute on function
    internal.mark_outbox_failed(uuid, uuid, boolean, text, interval) to sender_role;

-- ----------------------------------------------------------------------------
-- Unknown, revisão e reprocesso
-- ----------------------------------------------------------------------------
create function internal.sweep_outbox_unknown()
    returns integer
    language sql
    security definer
    set search_path = pg_catalog, internal
as $$
    with swept as (
        update internal.message_outbox
           set status = 'unknown',
               locked_until = null,
               last_error = 'send lease expired mid-request; outcome unknown'
         where status = 'sending'
           and locked_until < now()
        returning 1
    )
    select count(*)::integer from swept
$$;

create function internal.correlate_outbox_status(
    p_idempotency_key     text,
    p_status              text,
    p_provider_message_id text default null
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, internal
as $$
begin
    if p_status not in ('sent', 'failed') then
        raise exception 'unknown correlation status: %', p_status;
    end if;
    update internal.message_outbox
       set status = p_status,
           provider_message_id = coalesce(p_provider_message_id, provider_message_id),
           sent_at = case when p_status = 'sent' then now() else sent_at end,
           locked_by = null,
           locked_until = null,
           last_error = case when p_status = 'sent' then null else last_error end
     where idempotency_key = p_idempotency_key
       and status in ('sending', 'unknown');
    return found;
end
$$;

create function internal.review_stale_unknown(
    p_review_after interval default interval '5 minutes'
)
    returns integer
    language sql
    security definer
    set search_path = pg_catalog, internal
as $$
    with flagged as (
        update internal.message_outbox
           set status = 'manual_review'
         where status = 'unknown'
           and request_started_at < now() - p_review_after
        returning 1
    )
    select count(*)::integer from flagged
$$;

create function internal.reprocess_dead_letters(
    p_dead_letter_queue text,
    p_origin_queue      text,
    p_limit             integer default 50
)
    returns integer
    language plpgsql
    security definer
    set search_path = pg_catalog, internal
as $$
declare
    v_message record;
    v_count   integer := 0;
begin
    for v_message in
        select msg_id, message
          from pgmq.read(p_dead_letter_queue, 60, p_limit)
    loop
        perform pgmq.send(
            p_origin_queue,
            (v_message.message - 'error_class') - 'last_error'
        );
        perform pgmq.archive(p_dead_letter_queue, v_message.msg_id);
        v_count := v_count + 1;
    end loop;
    return v_count;
end
$$;

revoke execute on function internal.sweep_outbox_unknown() from public;
revoke execute on function internal.correlate_outbox_status(text, text, text) from public;
revoke execute on function internal.review_stale_unknown(interval) from public;
revoke execute on function internal.reprocess_dead_letters(text, text, integer) from public;

grant execute on function internal.sweep_outbox_unknown() to sender_role;
grant execute on function internal.correlate_outbox_status(text, text, text) to sender_role;
grant execute on function internal.review_stale_unknown(interval) to sender_role;
grant execute on function internal.reprocess_dead_letters(text, text, integer) to worker_role;

-- ----------------------------------------------------------------------------
-- Heartbeat do processo
-- ----------------------------------------------------------------------------
create table internal.runtime_heartbeats (
    process_name text primary key,
    started_at   timestamptz not null default now(),
    beat_at      timestamptz not null default now()
);

comment on table internal.runtime_heartbeats is
    'Liveness do processo asyncio único. O alerta "heartbeat > 3 min" lê daqui.';

grant select, insert, update on internal.runtime_heartbeats to worker_role;
revoke all on internal.runtime_heartbeats from anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- F2 · Ingestão inbound (chamada pelo webhook Next.js para org migrada,
-- DEPOIS do insert em whatsapp_cloud_messages — inbox intocado).
-- Grava seq atômico + pending_response_at e NÃO enfileira.
-- Em public porque o PostgREST só alcança os exposed schemas; EXECUTE só para
-- service_role (o app server). SECURITY DEFINER com validação explícita.
-- ----------------------------------------------------------------------------
create function public.ingest_inbound_message(
    p_organization_id     uuid,
    p_channel             text,
    p_external_id         text,
    p_contact_name        text,
    p_content             jsonb,
    p_provider_message_id text,
    p_debounce_seconds    integer default 8
)
    returns table (conversation_id uuid, contact_id uuid, seq integer, deduplicated boolean)
    language plpgsql
    security definer
    set search_path = pg_catalog, public, internal
as $$
-- As colunas do RETURNS TABLE são variáveis OUT; sem isto o plpgsql acha que
-- o `contact_id` do ON CONFLICT é a variável e reprova por ambiguidade. Todo
-- o corpo usa prefixos v_/p_, então só o alvo do ON CONFLICT muda de leitura.
#variable_conflict use_column
declare
    v_contact_id      uuid;
    v_conversation_id uuid;
    v_is_new          boolean := false;
    v_status          text;
    v_seq             integer;
    v_old             record;
    v_copy_seq        integer;
begin
    if p_channel not in ('whatsapp', 'email', 'instagram') then
        raise exception 'canal desconhecido: %', p_channel;
    end if;

    -- Dedup por wamid ANTES de tocar contadores: webhook reentregue não pode
    -- furar seq.
    if p_provider_message_id is not null then
        select m.conversation_id, m.seq
          into v_conversation_id, v_seq
          from public.messages m
         where m.provider_message_id = p_provider_message_id;
        if found then
            select c.contact_id into v_contact_id
              from public.conversations c where c.id = v_conversation_id;
            return query select v_conversation_id, v_contact_id, v_seq, true;
            return;
        end if;
    end if;

    -- 1. Identidade do canal → contato CRM (cria se não houver).
    select ci.contact_id into v_contact_id
      from public.channel_identities ci
     where ci.organization_id = p_organization_id
       and ci.channel = p_channel
       and ci.external_id = p_external_id;

    if v_contact_id is null then
        select c.id into v_contact_id
          from public.contacts c
         where c.organization_id = p_organization_id
           and (c.whatsapp = p_external_id or c.phone = p_external_id)
         order by c.created_at
         limit 1;

        if v_contact_id is null then
            insert into public.contacts (organization_id, phone, whatsapp, first_name, source)
            values (p_organization_id, p_external_id, p_external_id,
                    nullif(p_contact_name, ''), 'whatsapp')
            returning id into v_contact_id;
        end if;

        insert into public.channel_identities (organization_id, contact_id, channel, external_id)
        values (p_organization_id, v_contact_id, p_channel, p_external_id)
        on conflict (organization_id, channel, external_id) do nothing;
    end if;

    -- 2. Conversa canônica (uma por contato por org).
    insert into public.conversations (organization_id, contact_id, last_channel, last_inbound_at)
    values (p_organization_id, v_contact_id, p_channel, now())
    on conflict (organization_id, contact_id) do nothing
    returning id into v_conversation_id;

    if v_conversation_id is not null then
        v_is_new := true;
    else
        select c.id, c.status into v_conversation_id, v_status
          from public.conversations c
         where c.organization_id = p_organization_id and c.contact_id = v_contact_id;

        update public.conversations
           set last_channel = p_channel,
               last_inbound_at = now(),
               status = case when status = 'closed' then 'open' else status end
         where id = v_conversation_id;
    end if;

    -- 2b. Primeira criação: copia as últimas 20 mensagens do espelho cloud
    -- (contexto limitado; sem job global de backfill).
    if v_is_new and p_channel = 'whatsapp' then
        for v_old in
            select wcm.message_id, wcm.direction, wcm.text_body, wcm.content,
                   wcm.sent_by_bot, wcm."timestamp"
              from public.whatsapp_cloud_messages wcm
              join public.whatsapp_cloud_conversations wcc on wcc.id = wcm.conversation_id
             where wcc.organization_id = p_organization_id
               and wcc.wa_id = p_external_id
               and wcm.message_id is distinct from p_provider_message_id
             order by wcm."timestamp" desc
             limit 20
        loop
            v_copy_seq := internal.next_message_seq(
                v_conversation_id,
                case v_old.direction when 'inbound' then 'inbound' else 'outbound' end
            );
            insert into public.messages
                (organization_id, conversation_id, direction, seq, channel, author_type,
                 content, provider_message_id, created_at)
            values
                (p_organization_id, v_conversation_id, v_old.direction, v_copy_seq, 'whatsapp',
                 case when v_old.direction = 'inbound' then 'contact'
                      when v_old.sent_by_bot then 'agent' else 'human' end,
                 coalesce(v_old.content, jsonb_build_object('text', v_old.text_body)),
                 v_old.message_id, v_old."timestamp")
            on conflict do nothing;
        end loop;
    end if;

    -- 3. Seq atômico + mensagem canônica.
    v_seq := internal.next_message_seq(v_conversation_id, 'inbound');

    insert into public.messages
        (organization_id, conversation_id, direction, seq, channel, author_type,
         content, provider_message_id)
    values
        (p_organization_id, v_conversation_id, 'inbound', v_seq, p_channel, 'contact',
         p_content, p_provider_message_id);

    -- 4. Debounce: mensagem nova EMPURRA a janela. Só o coalescer limpa.
    --    Takeover humano não agenda resposta de IA.
    update public.conversations
       set pending_response_at = now() + make_interval(secs => p_debounce_seconds)
     where id = v_conversation_id
       and status = 'open';

    return query select v_conversation_id, v_contact_id, v_seq, false;
end
$$;

comment on function public.ingest_inbound_message(uuid, text, text, text, jsonb, text, integer) is
    'F2: ingestão canônica de inbound para org migrada (rollout=runtime). Dedup por wamid, seq atômico, pending_response_at empurrado — NUNCA enfileira (monopólio do coalescer). Cópia limitada de histórico na primeira criação.';

revoke execute on function
    public.ingest_inbound_message(uuid, text, text, text, jsonb, text, integer) from public;
revoke execute on function
    public.ingest_inbound_message(uuid, text, text, text, jsonb, text, integer)
    from anon, authenticated;
grant execute on function
    public.ingest_inbound_message(uuid, text, text, text, jsonb, text, integer)
    to service_role;
