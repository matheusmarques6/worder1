begin;

alter table public.agent_traces
  add column if not exists trace_source text not null default 'legacy_generated',
  add column if not exists outbox_id uuid,
  add column if not exists channel_account_id uuid,
  add column if not exists generation integer,
  add column if not exists target_seq integer,
  add column if not exists selected_attempt integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.agent_traces'::regclass
       and conname = 'agent_traces_trace_source_check'
  ) then
    alter table public.agent_traces
      add constraint agent_traces_trace_source_check
      check (trace_source in ('legacy_generated', 'runtime_accepted')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.agent_traces'::regclass
       and conname = 'agent_traces_selected_attempt_check'
  ) then
    alter table public.agent_traces
      add constraint agent_traces_selected_attempt_check
      check (selected_attempt is null or selected_attempt >= 0) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.agent_traces'::regclass
       and conname = 'agent_traces_runtime_accepted_complete'
  ) then
    alter table public.agent_traces
      add constraint agent_traces_runtime_accepted_complete
      check (
        trace_source <> 'runtime_accepted'
        or (
          organization_id is not null
          and conversation_id is not null
          and agent_id is not null
          and outbox_id is not null
          and channel_account_id is not null
          and generation is not null
          and target_seq is not null
          and output is not null
        )
      ) not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from public.agent_traces
     where trace_source not in ('legacy_generated', 'runtime_accepted')
  ) then
    alter table public.agent_traces validate constraint agent_traces_trace_source_check;
  end if;
  if not exists (
    select 1 from public.agent_traces where selected_attempt < 0
  ) then
    alter table public.agent_traces validate constraint agent_traces_selected_attempt_check;
  end if;
  if not exists (
    select 1 from public.agent_traces
     where trace_source = 'runtime_accepted'
       and (
         organization_id is null or conversation_id is null or agent_id is null
         or outbox_id is null or channel_account_id is null or generation is null
         or target_seq is null or output is null
       )
  ) then
    alter table public.agent_traces validate constraint agent_traces_runtime_accepted_complete;
  end if;
end
$$;

create unique index if not exists agent_traces_outbox_uniq
  on public.agent_traces (outbox_id) where outbox_id is not null;
create index if not exists agent_traces_org_agent_source_created_idx
  on public.agent_traces (organization_id, agent_id, trace_source, created_at desc);

create table if not exists public.agent_trace_annotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agent_id uuid not null,
  trace_id uuid not null unique references public.agent_traces(id) on delete cascade,
  rating text not null check (rating in ('good', 'bad', 'fix')),
  correction_text text,
  annotated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_trace_annotations_agent
  on public.agent_trace_annotations (agent_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.agent_trace_annotations'::regclass
       and conname = 'agent_trace_annotations_fix_requires_correction'
  ) then
    alter table public.agent_trace_annotations
      add constraint agent_trace_annotations_fix_requires_correction
      check (
        rating <> 'fix'
        or (correction_text is not null and correction_text ~ '[^[:space:]]')
      )
      not valid;
  end if;
  if not exists (
    select 1 from public.agent_trace_annotations
     where rating = 'fix'
       and (correction_text is null or correction_text !~ '[^[:space:]]')
  ) then
    alter table public.agent_trace_annotations
      validate constraint agent_trace_annotations_fix_requires_correction;
  end if;
end
$$;

alter table public.agent_traces enable row level security;
alter table public.agent_trace_annotations enable row level security;

do $$
declare
  policy record;
begin
  for policy in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('agent_traces', 'agent_trace_annotations')
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy.policyname, policy.schemaname, policy.tablename
    );
  end loop;
end
$$;

create policy agent_traces_org_select on public.agent_traces
  for select to authenticated
  using (public.user_belongs_to_org(organization_id));
create policy agent_trace_annotations_org_select on public.agent_trace_annotations
  for select to authenticated
  using (public.user_belongs_to_org(organization_id));

revoke all privileges on table public.agent_traces
  from public, anon, authenticated, service_role, worker_role, sender_role;
revoke all privileges on table public.agent_trace_annotations
  from public, anon, authenticated, service_role, worker_role, sender_role;
grant select on table public.agent_traces, public.agent_trace_annotations
  to authenticated;
grant select, insert on table public.agent_traces to service_role;
grant select, insert, update, delete on table public.agent_trace_annotations
  to service_role;

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
begin
  if p_organization_id is null
     or p_organization_id is distinct from public.current_app_organization_id()
  then
    raise exception 'accepted trace organization is not the session organization'
      using errcode = '42501';
  end if;
  if p_outbox_id is null or p_conversation_id is null or p_agent_id is null
     or p_channel_account_id is null or p_generation is null
     or p_target_seq is null or p_output is null
  then
    raise exception 'accepted trace context is incomplete' using errcode = '22023';
  end if;
  if p_selected_attempt is not null and p_selected_attempt < 0 then
    raise exception 'accepted trace selected attempt is negative' using errcode = '22023';
  end if;
  select * into v_existing
    from public.agent_traces where outbox_id = p_outbox_id;
  if not found then
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
    if not exists (
      select 1 from public.whatsapp_business_accounts a
       where a.id = p_channel_account_id and a.organization_id = p_organization_id
    ) then
      raise exception 'accepted trace channel account does not match' using errcode = '22023';
    end if;
    if not exists (
      select 1 from internal.message_outbox o
       where o.id = p_outbox_id
         and o.organization_id = p_organization_id
         and o.conversation_id = p_conversation_id
         and o.channel_account_id = p_channel_account_id
         and o.payload ->> 'text' is not distinct from p_output
    ) then
      raise exception 'accepted trace outbox or output does not match' using errcode = '22023';
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
