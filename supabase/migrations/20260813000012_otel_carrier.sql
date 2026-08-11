-- ============================================================================
-- 9.1b (Adendo §B, D13) — o traceparent atravessa o banco.
--
-- O Logfire só mostra "a conversa da fila ao envio" se o contexto viajar com
-- o trabalho. Três pontos de costura, todos com default null (quem chama sem
-- otel continua funcionando igual):
--
--   * coalesce_due_conversations ganha p_otel: o passe do coalescer carimba
--     seu contexto em cada job enfileirado (o worker retoma como LINK — um
--     passe cria N turnos; parent viraria um trace-monstro);
--   * internal.message_outbox ganha a coluna otel; conclude_turn ganha
--     p_otel e grava o contexto do TURNO na linha (o sender retoma como
--     PARENT — turno e envio são o mesmo trace);
--   * claimed_send/claim_outbox_batch devolvem otel ao sender.
--
-- Assinaturas antigas caem (drop explícito) para nunca haver duas versões
-- divergindo — o padrão da 0007.
-- ============================================================================

alter table internal.message_outbox add column otel jsonb;

comment on column internal.message_outbox.otel is
    'Carrier W3C {"traceparent": ...} do turno que gerou a linha (9.1b). '
    'Null = turno sem tracer; o sender abre span sem parent.';

-- ----------------------------------------------------------------------------
-- Coalescer: o passe carimba o contexto nos jobs.
-- ----------------------------------------------------------------------------

drop function internal.coalesce_due_conversations(text, integer);

create function internal.coalesce_due_conversations(
    p_queue text default 'q_inbound',
    p_limit integer default 100,
    p_otel  jsonb default null
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
               row(id, processing_generation, next_inbound_seq, organization_id, p_otel)
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

revoke execute on function internal.coalesce_due_conversations(text, integer, jsonb) from public;
grant execute on function internal.coalesce_due_conversations(text, integer, jsonb) to worker_role;

-- ----------------------------------------------------------------------------
-- Conclude: o contexto do turno entra na linha de outbox junto do resto.
-- ----------------------------------------------------------------------------

drop function internal.conclude_turn(
    uuid, uuid, integer, integer, integer, jsonb, text, text, uuid[]
);

create function internal.conclude_turn(
    p_conversation_id  uuid,
    p_token            uuid,
    p_expected_version integer,
    p_generation       integer,
    p_target_seq       integer,
    p_content          jsonb,
    p_idempotency_key  text,
    p_kind             text default 'reply',
    p_moment_ids       uuid[] default '{}'::uuid[],
    p_otel             jsonb default null
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
         kind, payload, idempotency_key, moment_ids, otel)
    values
        (v_organization_id, p_conversation_id, v_contact_id, v_channel,
         p_kind, p_content, p_idempotency_key, coalesce(p_moment_ids, '{}'::uuid[]),
         p_otel)
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

grant execute on function
    internal.conclude_turn(uuid, uuid, integer, integer, integer, jsonb, text, text, uuid[], jsonb)
    to worker_role;

-- ----------------------------------------------------------------------------
-- Claim: o sender recebe o contexto junto do payload.
-- ----------------------------------------------------------------------------

alter type internal.claimed_send add attribute otel jsonb;

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
           m.kind,
           m.moment_ids,
           m.otel
      from marked m
      join public.contacts ct on ct.id = m.contact_id
$$;
