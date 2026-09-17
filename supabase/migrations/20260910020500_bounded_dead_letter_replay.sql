-- A dead letter is replayable only when the recorded failure was transient,
-- and only once. Everything else remains available for manual inspection.
create or replace function internal.reprocess_dead_letters(
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
    v_payload jsonb;
    v_count   integer := 0;
begin
    if p_origin_queue is null
       or p_origin_queue not in ('q_inbound', 'q_domain_events', 'q_scheduled', 'q_evals')
       or p_dead_letter_queue is null
       or p_dead_letter_queue <> p_origin_queue || '_dlq' then
        raise exception 'invalid dead-letter queue pair: % -> %',
            p_dead_letter_queue, p_origin_queue;
    end if;

    if p_limit is null or p_limit < 1 or p_limit > 50 then
        raise exception 'dead-letter replay limit must be between 1 and 50';
    end if;

    for v_message in
        select msg_id, message
          from pgmq.read(p_dead_letter_queue, 60, p_limit)
    loop
        v_payload := v_message.message;

        if jsonb_typeof(v_payload) is distinct from 'object' then
            continue;
        end if;
        if v_payload ->> 'failure_kind' is distinct from 'transient' then
            continue;
        end if;
        if jsonb_typeof(v_payload -> 'replay_count') is distinct from 'number' then
            continue;
        end if;
        if v_payload ->> 'replay_count' is distinct from '0' then
            continue;
        end if;
        if v_payload ->> 'kind' = 'mission_touch'
           and nullif(btrim(v_payload ->> 'touch_id'), '') is null then
            continue;
        end if;

        perform pgmq.send(
            p_origin_queue,
            jsonb_set(
                (v_payload - 'error_class') - 'last_error',
                '{replay_count}',
                '1'::jsonb,
                true
            )
        );
        perform pgmq.archive(p_dead_letter_queue, v_message.msg_id);
        v_count := v_count + 1;
    end loop;

    return v_count;
end
$$;

revoke execute on function internal.reprocess_dead_letters(text, text, integer)
    from public, anon, authenticated, service_role, sender_role;
grant execute on function internal.reprocess_dead_letters(text, text, integer)
    to worker_role;
