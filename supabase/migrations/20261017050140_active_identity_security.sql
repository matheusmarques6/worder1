-- Deploy together with the server identity guard. No profile fallback remains.
-- Legacy owners cannot be offboarded by the application. Other profile-only
-- accounts require reconciliation; do not turn every stale profile into access.
insert into public.organization_members (organization_id, user_id, role, email, status, joined_at)
select p.organization_id, p.id, 'owner'::public.user_role, p.email, 'active', now()
from public.profiles p
where p.organization_id is not null and p.role::text = 'owner'
  and not exists (select 1 from public.organization_members m where m.organization_id=p.organization_id and m.user_id=p.id)
on conflict (organization_id,user_id) do nothing;

-- Legacy agent creation used agents/whatsapp_agents without a membership.
-- A retained removal or recorded offboarding always wins. Missing audit history
-- is ambiguous: leave those accounts denied for explicit reconciliation.
do $$
declare t text;
begin
  if to_regclass('public.audit_logs') is not null then
    foreach t in array array['agents','whatsapp_agents'] loop
      if to_regclass('public.' || t) is not null then
        execute format($sql$
          insert into public.organization_members (organization_id,user_id,role,email,status,joined_at)
          select distinct p.organization_id,p.id,'agent'::public.user_role,p.email,'active',now()
          from public.profiles p join public.%I a on a.user_id=p.id and a.organization_id=p.organization_id
          where a.is_active=true and p.role::text in ('agent','member')
            and not exists (select 1 from public.organization_members m where m.user_id=p.id and m.organization_id=p.organization_id)
            and not exists (
              select 1 from public.audit_logs l
              where l.organization_id=p.organization_id and l.action='team.removed'
                and lower(l.details->>'email')=lower(p.email)
            )
          on conflict (organization_id,user_id) do nothing
        $sql$, t);
      end if;
    end loop;
  end if;
end $$;

create schema if not exists internal;
create index if not exists organization_members_active_user_org_idx
  on public.organization_members (user_id,organization_id) where status='active';

-- Private security-definer lookup avoids recursion through membership RLS.
-- It can only answer for auth.uid(), never an arbitrary supplied user.
create or replace function internal.has_active_org_access(p_org text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id=m.organization_id
    where m.user_id=auth.uid() and m.organization_id::text=p_org and m.status='active'
      and exists (select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id')
      and (
        auth.jwt()->>'aal'='aal2'
        or (coalesce(o.settings->>'require_2fa','false') <> 'true'
            and not exists (select 1 from auth.mfa_factors f where f.user_id=auth.uid() and f.status::text='verified'))
      )
  );
$$;
revoke all on function internal.has_active_org_access(text) from public, anon;
grant usage on schema internal to authenticated;
grant execute on function internal.has_active_org_access(text) to authenticated, service_role;

-- Restrictive policies AND with every existing permissive policy, including
-- legacy profile-based policies. Runtime worker/sender/service roles are intact.
do $$
declare t record; pred text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      join pg_attribute a on a.attrelid=c.oid and a.attname='organization_id' and not a.attisdropped
    where n.nspname='public' and c.relkind='r' and c.relname <> 'profiles'
  loop
    pred := 'internal.has_active_org_access(organization_id::text)';
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('drop policy if exists active_identity_required on public.%I', t.relname);
    execute format('create policy active_identity_required on public.%I as restrictive for all to authenticated using (%s) with check (%s)', t.relname,pred,pred);
  end loop;
end $$;

alter table public.organizations enable row level security;
drop policy if exists active_identity_required on public.organizations;
create policy active_identity_required on public.organizations as restrictive for all to authenticated
  using (internal.has_active_org_access(id::text)) with check (internal.has_active_org_access(id::text));

-- The authority itself is managed by authorized server handlers only.
revoke insert, update, delete on public.organization_members from anon, authenticated;
revoke insert, update, delete on public.organizations from anon, authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;
do $$
declare t text; cols text;
begin
  foreach t in array array['organization_members','organizations','profiles','agents','whatsapp_agents','agent_permissions'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    if t <> 'profiles' then
      execute format('revoke insert,update,delete on public.%I from anon,authenticated',t);
    end if;
    select string_agg(quote_ident(a.attname),',') into cols from pg_attribute a
      where a.attrelid=to_regclass('public.' || t) and a.attnum>0 and not a.attisdropped
        ;
    if cols is not null then execute format('revoke insert (%s),update (%s) on public.%I from anon,authenticated',cols,cols,t); end if;
  end loop;
end $$;
-- The forced-password UI only clears this flag. Other account/profile changes
-- already use the authorized settings/account server handler.
grant update (must_change_password,updated_at) on public.profiles to authenticated;

-- Existing UI/guard RPC contract, absent from some historical migration chains.
create or replace function internal.list_mfa_factors(p_user_id uuid)
returns table(id uuid, factor_type text, status text, friendly_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select f.id,f.factor_type::text,f.status::text,f.friendly_name,f.created_at
  from auth.mfa_factors f where f.user_id=p_user_id;
$$;
revoke all on function internal.list_mfa_factors(uuid) from public,anon,authenticated;
grant execute on function internal.list_mfa_factors(uuid) to service_role;
grant usage on schema internal to service_role;
do $$ begin
  -- Keep any existing RPC return shape; callers only require id/status/type.
  if to_regprocedure('public.list_mfa_factors(uuid)') is null then
    execute $fn$create function public.list_mfa_factors(p_user_id uuid)
      returns table(id uuid, factor_type text, status text, friendly_name text, created_at timestamptz)
      language sql stable security invoker set search_path = '' as
      'select * from internal.list_mfa_factors(p_user_id)'$fn$;
  end if;
end $$;
revoke all on function public.list_mfa_factors(uuid) from public,anon,authenticated;
grant execute on function public.list_mfa_factors(uuid) to service_role;
