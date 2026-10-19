begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Forward-only repair for installations whose legacy OAuth table bypassed the
-- canonical service-only migration. Preserve every row, column and constraint.
do $$
declare
  relation oid := to_regclass('public.oauth_states');
  columns_sql text;
  policy record;
  role_name text;
  privilege_name text;
  attribute record;
  expected boolean;
  known_roles text[] := array['anon','authenticated','service_role','worker_role',
                             'sender_role','runtime_worker_login','runtime_sender_login'];
begin
  if relation is null or not exists (
    select 1 from pg_class where oid=relation and relkind='r' and relpersistence='p'
      and relowner='postgres'::regrole and not relforcerowsecurity and not relispartition
  ) or exists (select 1 from pg_inherits where inhrelid=relation) then
    raise exception 'oauth forward incompatible: relation';
  end if;
  lock table public.oauth_states in access exclusive mode;

  -- Refuse ambiguous access instead of leaving an unexpected principal able
  -- to read nonces. Inherited grants are checked again after the repair.
  if exists (
    select 1 from (
      select x.grantee from pg_class c,
        lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
        where c.oid=relation
      union all
      select x.grantee from pg_attribute a, lateral aclexplode(a.attacl) x
        where a.attrelid=relation and a.attnum>0 and not a.attisdropped
    ) grants
    where grantee<>0 and grantee<>'postgres'::regrole
      and not exists (select 1 from pg_roles r
                      where r.oid=grants.grantee and r.rolname=any(known_roles))
  ) then
    raise exception 'oauth forward incompatible: unknown_grantee';
  end if;
  if not exists (select 1 from pg_roles where rolname='service_role'
                  and rolbypassrls and not rolsuper) then
    raise exception 'oauth forward incompatible: service_role';
  end if;
  -- NOINHERIT alone does not stop SET ROLE. Do not pretend that revoking a
  -- table ACL can repair a principal that can assume an administrative role.
  if exists (
    select 1 from pg_roles member cross join pg_roles parent
     where member.rolname=any(known_roles) and member.oid<>parent.oid
       and (parent.rolsuper or parent.rolbypassrls)
       and pg_has_role(member.oid,parent.oid,'MEMBER')
  ) then
    raise exception 'oauth forward incompatible: privileged_membership';
  end if;

  alter table public.oauth_states enable row level security;
  for policy in select policyname from pg_policies
                 where schemaname='public' and tablename='oauth_states' loop
    execute format('drop policy %I on public.oauth_states',policy.policyname);
  end loop;
  select string_agg(quote_ident(attname),',') into columns_sql from pg_attribute
    where attrelid=relation and attnum>0 and not attisdropped;
  revoke all privileges on public.oauth_states from public;
  execute format('revoke all privileges (%s) on public.oauth_states from public',columns_sql);
  for role_name in select rolname from pg_roles where rolname=any(known_roles) loop
    execute format('revoke all privileges on public.oauth_states from %I',role_name);
    execute format('revoke all privileges (%s) on public.oauth_states from %I',
                   columns_sql,role_name);
  end loop;
  grant select,insert,delete on public.oauth_states to service_role;

  if not (select relrowsecurity from pg_class where oid=relation)
     or exists (select 1 from pg_policies
                 where schemaname='public' and tablename='oauth_states') then
    raise exception 'oauth forward postcondition failed: policies';
  end if;
  for role_name in select rolname from pg_roles where rolname=any(known_roles) loop
    foreach privilege_name in array array[
      'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'
    ] loop
      expected := role_name='service_role' and privilege_name in ('SELECT','INSERT','DELETE');
      if has_table_privilege(role_name,relation,privilege_name) is distinct from expected then
        raise exception 'oauth forward postcondition failed: %.%',role_name,privilege_name;
      end if;
    end loop;
    for attribute in select attname from pg_attribute
                      where attrelid=relation and attnum>0 and not attisdropped loop
      foreach privilege_name in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
        expected := role_name='service_role' and privilege_name in ('SELECT','INSERT');
        if has_column_privilege(role_name,relation,attribute.attname,privilege_name)
           is distinct from expected then
          raise exception 'oauth forward postcondition failed: %.%.%',
                          role_name,attribute.attname,privilege_name;
        end if;
      end loop;
    end loop;
  end loop;
end
$$;

-- Security rollback keeps browser access revoked. Repair the server callback
-- if necessary; never restore broad grants or discard outstanding OAuth states.
commit;
