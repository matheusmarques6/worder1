-- ============================================================================
-- 20260813000008_emit_ai_mission_job.sql
-- F1 §3.2.2 passo 1: a porta que o nó `action_ai_mission` chama.
--
-- Invariante §3.4-9: escrita+fila é UMA RPC, nunca duas chamadas — a conversa
-- canônica (criada se preciso) e o job na pgmq comitam juntos ou nada comita.
-- O emissor valida o que é barato validar na hora (rollout, contato, missão
-- ativa da família) e devolve status em vez de exceção: o nó tem caminho de
-- erro, e "sem missão ativa" é resposta com alerta, não stack trace (§3.2.2
-- passo 2: o consumo RE-verifica — a verdade é do turno, não da emissão).
--
-- conclude_turn ganha p_moment_ids: o toque de momento precisa carregá-los na
-- outbox para o preflight do sender re-checar vida + template_readiness
-- (migration 0007). Assinatura nova = a antiga cai (drop) para não sobrar
-- overload ambíguo.
-- ============================================================================

create function public.emit_ai_mission_job(
    p_organization_id    uuid,
    p_contact_id         uuid,
    p_event_family       text,
    p_node_ref           text default null,
    p_delta              jsonb default '{}'::jsonb,
    p_concession_request jsonb default null,
    p_preferred_channel  text default 'whatsapp',
    p_otel               jsonb default null
)
    returns table (status text, conversation_id uuid, msg_id bigint)
    language plpgsql
    security definer
    set search_path = pg_catalog, public, internal, pgmq
as $$
#variable_conflict use_column
declare
    v_mission_id      uuid;
    v_conversation_id uuid;
    v_msg_id          bigint;
begin
    if p_preferred_channel not in ('whatsapp', 'email', 'instagram') then
        raise exception 'canal desconhecido: %', p_preferred_channel;
    end if;

    -- 1. Rollout: org fora do runtime não ganha job — o nó cai no caminho de
    -- erro em vez de enfileirar para um consumidor que não vai atendê-la.
    if not exists (
        select 1 from public.ai_runtime_rollout r
         where r.organization_id = p_organization_id and r.mode = 'runtime'
    ) then
        return query select 'not_rolled_out'::text, null::uuid, null::bigint;
        return;
    end if;

    -- 2. O contato é desta org (o id vem do fluxo, mas confiança se verifica).
    if not exists (
        select 1 from public.contacts c
         where c.id = p_contact_id and c.organization_id = p_organization_id
    ) then
        return query select 'contact_not_found'::text, null::uuid, null::bigint;
        return;
    end if;

    -- 3. Missão ativa da família — sem ela, toque NUNCA sai (§3.4-8): alerta
    -- agora, na emissão, onde o fluxo do lojista ainda pode reagir.
    select m.id into v_mission_id
      from public.ai_missions m
     where m.organization_id = p_organization_id
       and m.event_type = p_event_family
       and m.status = 'active'
     limit 1;
    if v_mission_id is null then
        insert into public.alerts (organization_id, type, severity, title, metadata)
        values (p_organization_id, 'no_active_mission', 'warning',
                'Nó de fluxo pediu toque sem missão ativa',
                jsonb_build_object('event_family', p_event_family,
                                   'node_ref', p_node_ref));
        return query select 'no_active_mission'::text, null::uuid, null::bigint;
        return;
    end if;

    -- 4. Conversa canônica (uma por contato por org; toque frio a cria).
    insert into public.conversations (organization_id, contact_id, last_channel)
    values (p_organization_id, p_contact_id, p_preferred_channel)
    on conflict (organization_id, contact_id) do nothing
    returning id into v_conversation_id;
    if v_conversation_id is null then
        select c.id into v_conversation_id
          from public.conversations c
         where c.organization_id = p_organization_id
           and c.contact_id = p_contact_id;
    end if;

    -- 5. O job — na MESMA transação de tudo acima.
    select pgmq.send(
        'q_domain_events',
        jsonb_build_object(
            'kind', 'mission_touch',
            'organization_id', p_organization_id,
            'contact_id', p_contact_id,
            'conversation_id', v_conversation_id,
            'event_family', p_event_family,
            'mission_version_id', v_mission_id,
            'node_ref', p_node_ref,
            'delta', coalesce(p_delta, '{}'::jsonb),
            'concession_request', p_concession_request,
            'preferred_channel', p_preferred_channel,
            'otel', p_otel
        )
    ) into v_msg_id;

    return query select 'queued'::text, v_conversation_id, v_msg_id;
end
$$;

comment on function public.emit_ai_mission_job(uuid, uuid, text, text, jsonb, jsonb, text, jsonb) is
    'F1 passo 1 (§3.2.2): o nó pede o toque. mission_version_id do payload é informativo — o consumo re-resolve a família e re-verifica; a emissão só recusa cedo o que já se sabe recusar.';

revoke execute on function public.emit_ai_mission_job(uuid, uuid, text, text, jsonb, jsonb, text, jsonb) from public;
grant execute on function public.emit_ai_mission_job(uuid, uuid, text, text, jsonb, jsonb, text, jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- conclude_turn com moment_ids no outbox (o preflight 0007 os re-checa)
-- ----------------------------------------------------------------------------
drop function internal.conclude_turn(uuid, uuid, integer, integer, integer, jsonb, text, text);

create function internal.conclude_turn(
    p_conversation_id  uuid,
    p_token            uuid,
    p_expected_version integer,
    p_generation       integer,
    p_target_seq       integer,
    p_content          jsonb,
    p_idempotency_key  text,
    p_kind             text default 'reply',
    p_moment_ids       uuid[] default '{}'::uuid[]
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
         kind, payload, idempotency_key, moment_ids)
    values
        (v_organization_id, p_conversation_id, v_contact_id, v_channel,
         p_kind, p_content, p_idempotency_key, coalesce(p_moment_ids, '{}'::uuid[]))
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
    internal.conclude_turn(uuid, uuid, integer, integer, integer, jsonb, text, text, uuid[])
    to worker_role;
