-- Existing 7-10 argument callers retain their contract through defaults;
-- inbound alone supplies p_require_runtime=true.
drop function internal.conclude_turn(
    uuid, uuid, integer, integer, integer, jsonb, text, text, uuid[], jsonb
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
    p_otel             jsonb default null,
    p_require_runtime  boolean default false
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

revoke execute on function
    internal.conclude_turn(uuid, uuid, integer, integer, integer, jsonb, text, text, uuid[], jsonb, boolean)
    from public;
grant execute on function
    internal.conclude_turn(uuid, uuid, integer, integer, integer, jsonb, text, text, uuid[], jsonb, boolean)
    to worker_role;
