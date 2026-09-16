begin;

-- Non-WhatsApp acceptance has no WABA. The RPC enforces channel-specific identity.
alter table public.agent_traces
  drop constraint agent_traces_runtime_accepted_complete;
alter table public.agent_traces
  add constraint agent_traces_runtime_accepted_complete
  check (
    trace_source <> 'runtime_accepted'
    or (
      organization_id is not null
      and conversation_id is not null
      and agent_id is not null
      and outbox_id is not null
      and generation is not null
      and target_seq is not null
      and output is not null
    )
  );

create or replace function internal.record_accepted_trace(
  p_organization_id uuid,
  p_outbox_id uuid,
  p_conversation_id uuid,
  p_agent_id uuid,
  p_channel_account_id uuid,
  p_generation integer,
  p_target_seq integer,
  p_selected_attempt integer,
  p_provider text,
  p_model text,
  p_input text,
  p_output text,
  p_tool_calls jsonb,
  p_tokens integer,
  p_latency_ms integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, internal
as $$
declare
  v_id uuid;
  v_existing public.agent_traces%rowtype;
  v_outbox internal.message_outbox%rowtype;
begin
  if p_organization_id is null
     or p_organization_id is distinct from public.current_app_organization_id()
  then
    raise exception 'accepted trace organization is not the session organization'
      using errcode = '42501';
  end if;
  if p_outbox_id is null or p_conversation_id is null or p_agent_id is null
     or p_generation is null or p_target_seq is null or p_output is null
  then
    raise exception 'accepted trace context is incomplete' using errcode = '22023';
  end if;
  if p_selected_attempt is not null and p_selected_attempt < 0 then
    raise exception 'accepted trace selected attempt is negative' using errcode = '22023';
  end if;
  select * into v_existing
    from public.agent_traces where outbox_id = p_outbox_id;
  if not found then
    select * into v_outbox from internal.message_outbox o
     where o.id = p_outbox_id
       and o.organization_id = p_organization_id
       and o.conversation_id = p_conversation_id;
    if not found then
      raise exception 'accepted trace outbox or output does not match' using errcode = '22023';
    end if;
    if v_outbox.channel = 'whatsapp' then
      if p_channel_account_id is null or not exists (
        select 1 from public.whatsapp_business_accounts a
         where a.id = p_channel_account_id and a.organization_id = p_organization_id
      ) then
        raise exception 'accepted trace channel account does not match' using errcode = '22023';
      end if;
    elsif p_channel_account_id is not null then
      raise exception 'accepted trace channel account does not match' using errcode = '22023';
    end if;
    if not (
      v_outbox.channel_account_id is not distinct from p_channel_account_id
      and v_outbox.payload ->> 'text' is not distinct from p_output
    ) then
      raise exception 'accepted trace outbox or output does not match' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.conversations c
       where c.id = p_conversation_id
         and c.organization_id = p_organization_id
         and c.processing_generation = p_generation
         and c.last_processed_seq = p_target_seq
    ) then
      raise exception 'accepted trace conversation does not match' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.ai_agents a
       where a.id = p_agent_id and a.organization_id = p_organization_id
    ) then
      raise exception 'accepted trace agent does not match' using errcode = '22023';
    end if;

    insert into public.agent_traces (
      organization_id, conversation_id, agent_id, provider, model, input, output,
      tool_calls, tokens, latency_ms, trace_source, outbox_id, channel_account_id,
      generation, target_seq, selected_attempt
    )
    values (
      p_organization_id, p_conversation_id, p_agent_id, p_provider, p_model,
      p_input, p_output, p_tool_calls, p_tokens, p_latency_ms, 'runtime_accepted',
      p_outbox_id, p_channel_account_id, p_generation, p_target_seq,
      p_selected_attempt
    )
    on conflict (outbox_id) where outbox_id is not null do nothing
    returning id into v_id;

    if v_id is not null then
      return v_id;
    end if;
    select * into strict v_existing
      from public.agent_traces where outbox_id = p_outbox_id;
  end if;

  if not (
    v_existing.trace_source is not distinct from 'runtime_accepted'
    and v_existing.organization_id is not distinct from p_organization_id
    and v_existing.conversation_id is not distinct from p_conversation_id
    and v_existing.agent_id is not distinct from p_agent_id
    and v_existing.channel_account_id is not distinct from p_channel_account_id
    and v_existing.generation is not distinct from p_generation
    and v_existing.target_seq is not distinct from p_target_seq
    and v_existing.selected_attempt is not distinct from p_selected_attempt
    and v_existing.provider is not distinct from p_provider
    and v_existing.model is not distinct from p_model
    and v_existing.input is not distinct from p_input
    and v_existing.output is not distinct from p_output
    and v_existing.tool_calls is not distinct from p_tool_calls
    and v_existing.tokens is not distinct from p_tokens
    and v_existing.latency_ms is not distinct from p_latency_ms
  ) then
    raise exception 'accepted trace retry diverged' using errcode = 'P0001';
  end if;
  return v_existing.id;
end
$$;

revoke all on function internal.record_accepted_trace(
  uuid, uuid, uuid, uuid, uuid, integer, integer, integer,
  text, text, text, text, jsonb, integer, integer
) from public, anon, authenticated, service_role, worker_role, sender_role;
grant execute on function internal.record_accepted_trace(
  uuid, uuid, uuid, uuid, uuid, integer, integer, integer,
  text, text, text, text, jsonb, integer, integer
) to worker_role;

commit;
