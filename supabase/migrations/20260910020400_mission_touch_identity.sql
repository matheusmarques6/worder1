-- A mission touch is one automation-run/node action. PGMQ msg_id remains only
-- transport identity and may change on replay.

create table internal.mission_touch_emissions (
    touch_id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    run_id uuid not null,
    node_ref text not null check (btrim(node_ref) <> ''),
    conversation_id uuid references public.conversations(id) on delete cascade,
    msg_id bigint,
    unique (organization_id, run_id, node_ref)
);

revoke all on internal.mission_touch_emissions from public, anon, authenticated;

drop function public.emit_ai_mission_job(uuid, uuid, text, text, jsonb, jsonb, text, jsonb);

create function public.emit_ai_mission_job(
    p_organization_id    uuid,
    p_contact_id         uuid,
    p_event_family       text,
    p_node_ref           text default null,
    p_delta              jsonb default '{}'::jsonb,
    p_concession_request jsonb default null,
    p_preferred_channel  text default 'whatsapp',
    p_otel               jsonb default null,
    p_run_id             uuid default null
)
returns table (status text, conversation_id uuid, msg_id bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, internal, pgmq
as $$
#variable_conflict use_column
declare
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

comment on function public.emit_ai_mission_job(
    uuid, uuid, text, text, jsonb, jsonb, text, jsonb, uuid
) is 'Emits one idempotent mission touch per organization, automation run and node.';

revoke all on function public.emit_ai_mission_job(
    uuid, uuid, text, text, jsonb, jsonb, text, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.emit_ai_mission_job(
    uuid, uuid, text, text, jsonb, jsonb, text, jsonb, uuid
) to service_role;
