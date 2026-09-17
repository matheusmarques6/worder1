begin;

create or replace function public.list_eligible_eval_cases(
  p_organization_id uuid,
  p_agent_id uuid,
  p_limit integer default 20
)
returns table (
  id uuid,
  title text,
  input text,
  expected text,
  source text,
  source_id uuid,
  tags text[],
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  return query
  select c.id, c.title, c.input, c.expected, c.source, c.source_id,
         c.tags, c.created_at
    from public.ai_eval_cases c
    left join public.agent_traces t
      on c.source = 'annotation'
     and t.id = c.source_id
     and t.organization_id = p_organization_id
     and t.agent_id = p_agent_id
   where c.organization_id = p_organization_id
     and c.agent_id = p_agent_id
     and (
       c.source = 'scenario'
       or (
         c.source = 'annotation'
         and t.trace_source = 'runtime_accepted'
       )
     )
   order by c.created_at desc, c.id desc
   limit greatest(0, least(coalesce(p_limit, 20), 20));
end
$$;

create or replace function public.list_eligible_low_eval_results(
  p_organization_id uuid,
  p_agent_id uuid,
  p_limit integer default 20
)
returns table (
  case_id uuid,
  score integer,
  judged_output text
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  return query
  select r.case_id, r.score, r.judged_output
    from public.ai_eval_results r
    join public.ai_eval_cases c
      on c.id = r.case_id
     and c.organization_id = p_organization_id
     and c.agent_id = p_agent_id
    left join public.agent_traces t
      on c.source = 'annotation'
     and t.id = c.source_id
     and t.organization_id = p_organization_id
     and t.agent_id = p_agent_id
   where r.organization_id = p_organization_id
     and r.agent_id = p_agent_id
     and r.score < 60
     and (
       c.source = 'scenario'
       or (
         c.source = 'annotation'
         and t.trace_source = 'runtime_accepted'
       )
     )
   order by r.score asc, r.created_at desc, r.id desc
   limit greatest(0, least(coalesce(p_limit, 20), 20));
end
$$;

revoke all on function public.list_eligible_eval_cases(uuid, uuid, integer)
  from public, anon, authenticated, service_role, worker_role, sender_role;
revoke all on function public.list_eligible_low_eval_results(uuid, uuid, integer)
  from public, anon, authenticated, service_role, worker_role, sender_role;

grant execute on function public.list_eligible_eval_cases(uuid, uuid, integer)
  to service_role;
grant execute on function public.list_eligible_low_eval_results(uuid, uuid, integer)
  to service_role;

commit;
