-- W2-T5: one canonical history, immutable WhatsApp account identity.
-- No historical account is guessed or backfilled.
alter table public.messages add column channel_account_id uuid;

create function internal.resolve_whatsapp_account(
    p_organization_id uuid, p_waba_id uuid default null
) returns uuid
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
    v_ids uuid[];
begin
    if p_waba_id is not null then
        if not exists (
            select 1 from public.whatsapp_business_accounts w
             where w.id = p_waba_id and w.organization_id = p_organization_id
        ) then
            raise exception 'invalid WhatsApp account for organization' using errcode = '22023';
        end if;
        return p_waba_id;
    end if;
    select array_agg(w.id) into v_ids
      from public.whatsapp_business_accounts w
     where w.organization_id = p_organization_id and w.status = 'active';
    if coalesce(cardinality(v_ids), 0) <> 1 then
        raise exception 'exactly one active WhatsApp account required' using errcode = '22023';
    end if;
    return v_ids[1];
end
$$;
revoke all on function internal.resolve_whatsapp_account(uuid, uuid) from public, anon, authenticated;
grant execute on function internal.resolve_whatsapp_account(uuid, uuid) to worker_role, sender_role, service_role;

drop function public.ingest_inbound_message(uuid, text, text, text, jsonb, text, integer);
create or replace function public.ingest_inbound_message(
    p_organization_id uuid,
    p_channel text,
    p_external_id text,
    p_contact_name text,
    p_content jsonb,
    p_provider_message_id text,
    p_debounce_seconds integer default 8,
    p_waba_id uuid default null
)
    returns table(conversation_id uuid, contact_id uuid, seq integer, deduplicated boolean)
    language plpgsql
    security definer
    set search_path to 'pg_catalog', 'public', 'internal'
as $function$
-- As colunas do RETURNS TABLE são variáveis OUT; sem isto o plpgsql acha que
-- o `contact_id` do ON CONFLICT é a variável e reprova por ambiguidade. Todo
-- o corpo usa prefixos v_/p_, então só o alvo do ON CONFLICT muda de leitura.
#variable_conflict use_column
declare
    v_waba_id         uuid;
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

    if p_channel = 'whatsapp' then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, p_waba_id);
    end if;

    -- Dedup por wamid ANTES de tocar contadores: webhook reentregue não pode
    -- furar seq.
    if p_provider_message_id is not null then
        select m.conversation_id, m.seq
          into v_conversation_id, v_seq
          from public.messages m
         where m.provider_message_id = p_provider_message_id
           and m.organization_id = p_organization_id
           and m.channel = p_channel
           and (p_channel <> 'whatsapp' or m.channel_account_id = v_waba_id);
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
                   wcm.sent_by_bot, wcm."timestamp", wcc.waba_id
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
                 content, provider_message_id, created_at, channel_account_id)
            values
                (p_organization_id, v_conversation_id, v_old.direction, v_copy_seq, 'whatsapp',
                 case when v_old.direction = 'inbound' then 'contact'
                      when v_old.sent_by_bot then 'agent' else 'human' end,
                 -- 17/08: texto plano PRIMEIRO — o formato Meta no histórico
                 -- ensinava o modelo a responder em JSON. `content` só quando
                 -- não há texto (mídia).
                 case when nullif(v_old.text_body, '') is not null
                      then jsonb_build_object('text', v_old.text_body)
                      else v_old.content end,
                 v_old.message_id, v_old."timestamp", v_old.waba_id)
            on conflict do nothing;
        end loop;
    end if;

    -- 3. Seq atômico + mensagem canônica.
    v_seq := internal.next_message_seq(v_conversation_id, 'inbound');

    insert into public.messages
        (organization_id, conversation_id, direction, seq, channel, author_type,
         content, provider_message_id, channel_account_id)
    values
        (p_organization_id, v_conversation_id, 'inbound', v_seq, p_channel, 'contact',
         p_content, p_provider_message_id, v_waba_id);

    -- 4. Debounce: mensagem nova EMPURRA a janela. Só o coalescer limpa.
    --    Takeover humano não agenda resposta de IA.
    update public.conversations
       set pending_response_at = now() + make_interval(secs => p_debounce_seconds)
     where id = v_conversation_id
       and status = 'open';

    return query select v_conversation_id, v_contact_id, v_seq, false;
end
$function$;
revoke all on function public.ingest_inbound_message(uuid, text, text, text, jsonb, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.ingest_inbound_message(uuid, text, text, text, jsonb, text, integer, uuid) to service_role;

drop function internal.mirror_outbound_to_inbox(uuid, text, text, text);
create function internal.mirror_outbound_to_inbox(
    p_organization_id uuid,
    p_to_phone        text,
    p_wamid           text,
    p_text            text,
    p_waba_id uuid default null
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_waba_id uuid;
    v_conversation record;
begin
    if p_waba_id is not null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, p_waba_id);
    end if;
    if v_waba_id is null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, null);
    end if;

    select wcc.id, wcc.waba_id into v_conversation
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and wcc.waba_id = v_waba_id
       and (wcc.wa_id = p_to_phone or wcc.wa_id = ltrim(p_to_phone, '+'))
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
revoke all on function internal.mirror_outbound_to_inbox(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function internal.mirror_outbound_to_inbox(uuid, text, text, text, uuid) to sender_role;

drop function internal.emit_ai_run_step(uuid, uuid, text, text, uuid, jsonb, uuid, text);
create or replace function internal.emit_ai_run_step(
    p_organization_id uuid,
    p_run_id          uuid,
    p_step            text,
    p_detail          text  default null,
    p_agent_id        uuid  default null,
    p_metadata        jsonb default null,
    p_conversation_id uuid  default null,
    p_phone           text  default null,
    p_waba_id uuid default null
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_waba_id uuid;
    v_phone text := p_phone;
    v_cloud uuid;
begin
    if p_waba_id is not null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, p_waba_id);
    end if;
    -- Worker: parte da conversa canônica → identidade WhatsApp do contato.
    if v_phone is null and p_conversation_id is not null then
        select ci.external_id into v_phone
          from public.conversations c
          join public.channel_identities ci
            on ci.organization_id = c.organization_id
           and ci.contact_id = c.contact_id
           and ci.channel = 'whatsapp'
         where c.id = p_conversation_id
           and c.organization_id = p_organization_id
         limit 1;
    end if;

    if v_phone is null then
        return false;
    end if;

    -- Mesma resolução do espelho: wa_id com e sem '+'.
    if v_waba_id is null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, null);
    end if;

    select wcc.id into v_cloud
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and wcc.waba_id = v_waba_id
       and (wcc.wa_id = v_phone or wcc.wa_id = ltrim(v_phone, '+'))
     limit 1;

    if v_cloud is null then
        -- Sem conversa no inbox (toque frio): sem palco, sem chip — o passo
        -- é adereço de UI, nunca motivo de erro.
        return false;
    end if;

    insert into public.whatsapp_ai_run_steps
        (organization_id, conversation_id, run_id, agent_id, step, detail, metadata)
    values
        (p_organization_id, v_cloud, p_run_id, p_agent_id, p_step, p_detail, p_metadata);
    return true;
end
$$;
revoke all on function internal.emit_ai_run_step(uuid, uuid, text, text, uuid, jsonb, uuid, text, uuid) from public, anon, authenticated;
grant execute on function internal.emit_ai_run_step(uuid, uuid, text, text, uuid, jsonb, uuid, text, uuid) to worker_role, sender_role;

drop function internal.legacy_conversation_guard_state(uuid, uuid);
create function internal.legacy_conversation_guard_state(
    p_organization_id uuid,
    p_conversation_id uuid,
    p_waba_id uuid default null
)
    returns table (
        ai_enabled           boolean,
        ai_agent_id          uuid,
        ai_transferred_at    timestamptz,
        bot_message_count    integer,
        last_bot_message_at  timestamptz,
        has_human_reply      boolean
    )
    language plpgsql
    stable
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_waba_id uuid;
    v_phone text;
    v_cloud uuid;
begin
    if p_waba_id is not null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, p_waba_id);
    end if;
    -- Canônica → identidade WhatsApp do contato, exatamente como o
    -- emit_ai_run_step faz. `and c.organization_id = p_organization_id` é o
    -- escopo: sem RLS aqui, quem escopa é a query (FORK.md item 6).
    select ci.external_id into v_phone
      from public.conversations c
      join public.channel_identities ci
        on ci.organization_id = c.organization_id
       and ci.contact_id = c.contact_id
       and ci.channel = 'whatsapp'
     where c.id = p_conversation_id
       and c.organization_id = p_organization_id
     limit 1;

    if v_phone is null then
        return;
    end if;

    -- Mesma resolução do espelho: wa_id com e sem '+'.
    if v_waba_id is null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, null);
    end if;

    select wcc.id into v_cloud
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and wcc.waba_id = v_waba_id
       and (wcc.wa_id = v_phone or wcc.wa_id = ltrim(v_phone, '+'))
     limit 1;

    if v_cloud is null then
        -- Conversa que ainda não existe no inbox legado: zero linhas. Quem
        -- chama lê isso como "ninguém transferiu, o bot não respondeu, nenhum
        -- humano falou" — que é a verdade, não um default otimista. E o bot
        -- segue LIGADO: ninguém o desligou.
        return;
    end if;

    return query
    -- `is distinct from false` é o `=== false` do TS: NULL é bot ligado.
    select wcc.ai_enabled is distinct from false,
           wcc.ai_agent_id,
           wcc.ai_transferred_at,
           -- sent_by_bot cobre os dois motores: o mirror do sender do runtime
           -- grava a resposta com sent_by_bot = true (sender_preflight.sql:257).
           coalesce(bot.total, 0)::integer,
           bot.last_at,
           coalesce(human.exists_, false)
      from public.whatsapp_cloud_conversations wcc
      left join lateral (
          select count(*) as total, max(wcm."timestamp") as last_at
            from public.whatsapp_cloud_messages wcm
           where wcm.organization_id = p_organization_id
             and wcm.conversation_id = wcc.id
             and wcm.sent_by_bot
      ) bot on true
      left join lateral (
          select true as exists_
            from public.whatsapp_cloud_messages wcm
           where wcm.organization_id = p_organization_id
             and wcm.conversation_id = wcc.id
             and wcm.sender = 'human'
           limit 1
      ) human on true
     where wcc.id = v_cloud;
end
$$;
revoke all on function internal.legacy_conversation_guard_state(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function internal.legacy_conversation_guard_state(uuid, uuid, uuid) to worker_role;

drop function internal.mark_ai_handoff(uuid, uuid, text);
create or replace function internal.mark_ai_handoff(
    p_organization_id uuid,
    p_conversation_id uuid,
    p_reason          text,
    p_waba_id uuid default null
)
    returns boolean
    language plpgsql
    security definer
    set search_path = pg_catalog, public
as $$
declare
    v_waba_id uuid;
    v_phone text;
    v_cloud uuid;
begin
    if p_waba_id is not null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, p_waba_id);
    end if;
    select ci.external_id into v_phone
      from public.conversations c
      join public.channel_identities ci
        on ci.organization_id = c.organization_id
       and ci.contact_id = c.contact_id
       and ci.channel = 'whatsapp'
     where c.id = p_conversation_id
       and c.organization_id = p_organization_id
     limit 1;

    if v_phone is null then
        return false;
    end if;

    if v_waba_id is null then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, null);
    end if;

    select wcc.id into v_cloud
      from public.whatsapp_cloud_conversations wcc
     where wcc.organization_id = p_organization_id
       and wcc.waba_id = v_waba_id
       and (wcc.wa_id = v_phone or wcc.wa_id = ltrim(v_phone, '+'))
     limit 1;

    if v_cloud is null then
        return false;
    end if;

    update public.whatsapp_cloud_conversations
       set ai_enabled = false,
           ai_disabled_at = now(),
           ai_disabled_reason = p_reason,
           ai_transferred_at = now(),
           updated_at = now()
     where id = v_cloud
       and organization_id = p_organization_id;

    return true;
end
$$;
revoke all on function internal.mark_ai_handoff(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function internal.mark_ai_handoff(uuid, uuid, text, uuid) to worker_role;

drop function internal.conclude_turn(uuid, uuid, integer, integer, integer, jsonb, text, text, uuid[], jsonb, boolean);
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
    p_otel             jsonb default null,
    p_require_runtime  boolean default false,
    p_channel_account_id uuid default null
)
    returns internal.turn_outcome
    language plpgsql
    set search_path = pg_catalog, public, internal
as $$
declare
    v_account_id      uuid;
    v_organization_id uuid;
    v_contact_id      uuid;
    v_channel         text;
    v_seq             integer;
    v_outbox_id       uuid;
begin
    select organization_id, coalesce(last_channel, 'whatsapp')
      into v_organization_id, v_channel
      from public.conversations where id = p_conversation_id;
    if not found then
        return row(false, null, null)::internal.turn_outcome;
    end if;
    if v_channel = 'whatsapp' then
        v_account_id := internal.resolve_whatsapp_account(v_organization_id, p_channel_account_id);
    end if;
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
       and (
           not p_require_runtime
           or exists (
               select 1
                 from public.ai_runtime_rollout r
                where r.organization_id = public.conversations.organization_id
                  and r.mode = 'runtime'
           )
       )
    returning organization_id, contact_id, coalesce(last_channel, 'whatsapp')
      into v_organization_id, v_contact_id, v_channel;

    if not found then
        return row(false, null, null)::internal.turn_outcome;
    end if;

    if p_content is null or jsonb_typeof(p_content) = 'null' then
        return row(true, null, null)::internal.turn_outcome;
    end if;

    insert into internal.message_outbox
        (organization_id, conversation_id, contact_id, channel,
         kind, payload, idempotency_key, moment_ids, otel, channel_account_id)
    values
        (v_organization_id, p_conversation_id, v_contact_id, v_channel,
         p_kind, p_content, p_idempotency_key, coalesce(p_moment_ids, '{}'::uuid[]),
         p_otel, v_account_id)
    returning id into v_outbox_id;

    v_seq := internal.next_message_seq(p_conversation_id, 'outbound');

    insert into public.messages
        (organization_id, conversation_id, direction, seq, channel,
         author_type, content, outbox_id, channel_account_id)
    values
        (v_organization_id, p_conversation_id, 'outbound', v_seq, v_channel,
         'agent', p_content, v_outbox_id, v_account_id);

    return row(true, v_seq, v_outbox_id)::internal.turn_outcome;
end
$$;
revoke all on function internal.conclude_turn(uuid, uuid, integer, integer, integer, jsonb, text, text, uuid[], jsonb, boolean, uuid) from public, anon, authenticated;
grant execute on function internal.conclude_turn(uuid, uuid, integer, integer, integer, jsonb, text, text, uuid[], jsonb, boolean, uuid) to worker_role;

create or replace function internal.coalesce_due_conversations(
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
    with due_runtime as (
        -- INNER JOIN, não LEFT: o orçamento do runtime só existe para quem
        -- TEM linha com mode = 'runtime' — é o filtro entrando ANTES do
        -- limit, para nenhuma legacy tomar uma vaga daqui.
        select c.id
          from public.conversations c
          join public.ai_runtime_rollout r
            on r.organization_id = c.organization_id
           and r.mode = 'runtime'
         where c.pending_response_at is not null
           and c.pending_response_at <= now()
         order by c.pending_response_at
         for update of c skip locked
         limit p_limit
    ),
    bumped as (
        update public.conversations c
           set processing_generation = c.processing_generation + 1,
               pending_response_at = null
          from due_runtime
         where c.id = due_runtime.id
        returning c.id, c.processing_generation, c.next_inbound_seq, c.organization_id
    ),
    due_legacy as (
        -- Orçamento PRÓPRIO, mesmo teto p_limit — nunca compete com
        -- due_runtime pelas mesmas vagas porque são conjuntos disjuntos
        -- (uma org é runtime OU legacy, nunca as duas) e cada CTE aplica o
        -- corte no seu próprio SELECT.
        select c.id
          from public.conversations c
          left join public.ai_runtime_rollout r on r.organization_id = c.organization_id
         where c.pending_response_at is not null
           and c.pending_response_at <= now()
           and coalesce(r.mode, 'legacy') = 'legacy'
         order by c.pending_response_at
         for update of c skip locked
         limit p_limit
    ),
    -- Prazo limpo, sem job, sem bump de geração (ruling do item 09) — sem ser
    -- lida pelo SELECT final, mas dentro do mesmo WITH ela executa do mesmo
    -- jeito: uma CTE que só atualiza roda por estar na lista, não por ser
    -- referenciada depois (confirmado ao vivo contra o Postgres local antes
    -- de confiar nisso, na 20260828000003 original).
    legacy_cleared as (
        update public.conversations c
           set pending_response_at = null
          from due_legacy
         where c.id = due_legacy.id
        returning c.id
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
            ) || jsonb_strip_nulls(jsonb_build_object(
                'channel_account_id', (
                    select m.channel_account_id from public.messages m
                     where m.conversation_id = v_job.conversation_id
                       and m.organization_id = v_job.organization_id
                       and m.direction = 'inbound' and m.seq <= v_job.target_seq
                     order by m.seq desc limit 1
                )
            ))
        );
        return next v_job;
    end loop;
end
$$;
alter type internal.claimed_send add attribute channel_account_id uuid;
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
           set channel_account_id = case when o.channel = 'whatsapp'
                   then internal.resolve_whatsapp_account(o.organization_id, o.channel_account_id)
                   else o.channel_account_id end,
               status = 'sending',
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
               (select w.phone_number_id
                  from public.whatsapp_business_accounts w
                 where w.id = m.channel_account_id and w.organization_id = m.organization_id)
           end,
           coalesce(ct.whatsapp, ct.phone),
           m.payload,
           m.idempotency_key,
           m.attempt_count,
           m.kind,
           m.moment_ids,
           m.otel,
           (select msg.provider_message_id
              from public.messages msg
             where msg.conversation_id = m.conversation_id
               and msg.direction = 'inbound'
               and msg.channel = m.channel
               and msg.organization_id = m.organization_id
               and (m.channel <> 'whatsapp' or msg.channel_account_id = m.channel_account_id)
             order by msg.seq desc
             limit 1),
           m.channel_account_id
      from marked m
      join public.contacts ct on ct.id = m.contact_id and ct.organization_id = m.organization_id
$$;
drop function public.emit_ai_mission_job(uuid, uuid, text, text, jsonb, jsonb, text, jsonb, uuid);
create function public.emit_ai_mission_job(
    p_organization_id    uuid,
    p_contact_id         uuid,
    p_event_family       text,
    p_node_ref           text default null,
    p_delta              jsonb default '{}'::jsonb,
    p_concession_request jsonb default null,
    p_preferred_channel  text default 'whatsapp',
    p_otel               jsonb default null,
    p_run_id             uuid default null,
    p_waba_id            uuid default null
)
returns table (status text, conversation_id uuid, msg_id bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, internal, pgmq
as $$
#variable_conflict use_column
declare
    v_waba_id         uuid;
    v_mission_id      uuid;
    v_touch_id        uuid;
    v_conversation_id uuid;
    v_msg_id          bigint;
begin
    if p_run_id is null or nullif(btrim(p_node_ref), '') is null then
        return query select 'missing_run_identity'::text, null::uuid, null::bigint;
        return;
    end if;

    if not exists (
        select 1
          from public.automation_runs r
         where r.id = p_run_id
           and r.organization_id = p_organization_id
    ) then
        return query select 'run_not_found'::text, null::uuid, null::bigint;
        return;
    end if;

    if p_preferred_channel not in ('whatsapp', 'email', 'instagram') then
        raise exception 'canal desconhecido: %', p_preferred_channel;
    end if;

    if not exists (
        select 1 from public.ai_runtime_rollout r
         where r.organization_id = p_organization_id and r.mode = 'runtime'
    ) then
        return query select 'not_rolled_out'::text, null::uuid, null::bigint;
        return;
    end if;

    if not exists (
        select 1 from public.contacts c
         where c.id = p_contact_id and c.organization_id = p_organization_id
    ) then
        return query select 'contact_not_found'::text, null::uuid, null::bigint;
        return;
    end if;

    if p_preferred_channel = 'whatsapp' then
        v_waba_id := internal.resolve_whatsapp_account(p_organization_id, p_waba_id);
    end if;

    select m.id into v_mission_id
      from public.ai_missions m
     where m.organization_id = p_organization_id
       and m.event_type = p_event_family
       and m.status = 'active'
     limit 1;
    if v_mission_id is null then
        insert into public.alerts (organization_id, type, severity, title, metadata)
        values (
            p_organization_id,
            'no_active_mission',
            'warning',
            'Nó de fluxo pediu toque sem missão ativa',
            jsonb_build_object('event_family', p_event_family, 'node_ref', p_node_ref)
        );
        return query select 'no_active_mission'::text, null::uuid, null::bigint;
        return;
    end if;

    insert into internal.mission_touch_emissions (organization_id, run_id, node_ref)
    values (p_organization_id, p_run_id, p_node_ref)
    on conflict (organization_id, run_id, node_ref)
    do update set node_ref = excluded.node_ref
    returning touch_id, conversation_id, msg_id
         into v_touch_id, v_conversation_id, v_msg_id;

    if v_msg_id is not null then
        return query select 'queued'::text, v_conversation_id, v_msg_id;
        return;
    end if;

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

    select pgmq.send(
        'q_domain_events',
        jsonb_build_object(
            'kind', 'mission_touch',
            'touch_id', v_touch_id,
            'organization_id', p_organization_id,
            'contact_id', p_contact_id,
            'conversation_id', v_conversation_id,
            'event_family', p_event_family,
            'mission_version_id', v_mission_id,
            'node_ref', p_node_ref,
            'delta', coalesce(p_delta, '{}'::jsonb),
            'concession_request', p_concession_request,
            'preferred_channel', p_preferred_channel,
            'channel_account_id', v_waba_id,
            'otel', p_otel
        )
    ) into v_msg_id;

    update internal.mission_touch_emissions
       set conversation_id = v_conversation_id,
           msg_id = v_msg_id
     where touch_id = v_touch_id;

    return query select 'queued'::text, v_conversation_id, v_msg_id;
end
$$;
revoke all on function public.emit_ai_mission_job(uuid, uuid, text, text, jsonb, jsonb, text, jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.emit_ai_mission_job(uuid, uuid, text, text, jsonb, jsonb, text, jsonb, uuid, uuid) to service_role;

create function internal.whatsapp_business_account_for_number(
    p_organization_id uuid, p_phone_number_id text
) returns table (id uuid, phone_number_id text, access_token text, access_token_encrypted text)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
    if p_organization_id is distinct from public.current_app_organization_id() then
        raise exception 'WhatsApp account organization is not the session organization';
    end if;
    return query select w.id, w.phone_number_id, w.access_token, w.access_token_encrypted
      from public.whatsapp_business_accounts w
     where w.organization_id = p_organization_id
       and w.phone_number_id = p_phone_number_id and w.status = 'active';
end
$$;
revoke all on function internal.whatsapp_business_account_for_number(uuid, text) from public, anon, authenticated, worker_role;
grant execute on function internal.whatsapp_business_account_for_number(uuid, text) to sender_role;

-- Keep the old token port for compatibility, but never choose among multiple accounts.
create or replace function internal.active_whatsapp_business_account(p_organization_id uuid)
returns table (id uuid, phone_number_id text, access_token text, access_token_encrypted text)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
begin
    if p_organization_id is distinct from public.current_app_organization_id() then
        raise exception 'WhatsApp account organization is not the session organization';
    end if;
    if (select count(*) from public.whatsapp_business_accounts w
         where w.organization_id = p_organization_id and w.status = 'active') > 1 then
        raise exception 'exactly one active WhatsApp account required' using errcode = '22023';
    end if;
    return query select w.id, w.phone_number_id, w.access_token, w.access_token_encrypted
      from public.whatsapp_business_accounts w
     where w.organization_id = p_organization_id and w.status = 'active';
end
$$;
