begin;

set local search_path = public, extensions;
set local lock_timeout = '5s';

do $$
declare
  relation oid := to_regclass('public.oauth_states');
  state_attribute smallint;
  valid_uniques integer;
  p record;
  role_name text;
  privilege_name text;
  column_name text;
  expected boolean;
begin
  if relation is null then
    if to_regclass('public.oauth_states_pkey') is not null
       or to_regclass('public.oauth_states_state_key') is not null then
      raise exception 'oauth_states incompatible: unique_index name';
    end if;
    create table public.oauth_states (
      id uuid primary key default gen_random_uuid(),
      state varchar(64) not null unique,
      organization_id text not null,
      provider varchar(50) not null default 'shopify',
      metadata jsonb default '{}'::jsonb,
      expires_at timestamptz not null,
      created_at timestamptz default now()
    );
    relation := 'public.oauth_states'::regclass;
  end if;

  if not exists (
    select 1 from pg_class
     where oid=relation and relkind='r' and relpersistence='p'
       and relowner='postgres'::regrole and not relforcerowsecurity
       and not relispartition
  ) or exists (select 1 from pg_inherits where inhrelid=relation) then
    raise exception 'oauth_states incompatible: relation';
  end if;
  lock table public.oauth_states in access exclusive mode;

  -- No legacy conversion or column coercion: callbacks may still own these rows.
  if exists (
    with expected(name, pg_type, nullable, default_sql) as (values
      ('id', 'uuid', false, 'gen_random_uuid()'),
      ('state', 'character varying(64)', false, null),
      ('organization_id', 'text', false, null),
      ('provider', 'character varying(50)', false, '''shopify''::character varying'),
      ('metadata', 'jsonb', true, '''{}''::jsonb'),
      ('expires_at', 'timestamp with time zone', false, null),
      ('created_at', 'timestamp with time zone', true, 'now()')
    ), actual as (
      select a.attname::text as name, format_type(a.atttypid,a.atttypmod) as pg_type,
             not a.attnotnull as nullable, pg_get_expr(d.adbin,d.adrelid) as default_sql,
             a.attidentity, a.attgenerated
        from pg_attribute a left join pg_attrdef d
          on d.adrelid=a.attrelid and d.adnum=a.attnum
       where a.attrelid=relation and a.attnum>0 and not a.attisdropped
    )
    select 1 from expected e full join actual a using (name)
     where e.name is null or a.name is null
        or (a.pg_type,a.nullable,a.default_sql) is distinct from
           (e.pg_type,e.nullable,e.default_sql)
        or a.attidentity<>'' or a.attgenerated<>''
  ) then
    raise exception 'oauth_states incompatible: columns';
  end if;

  if (select count(*) from pg_constraint
       where conrelid=relation and contype='p' and not condeferrable
         and convalidated and pg_get_constraintdef(oid,true)='PRIMARY KEY (id)')<>1
     or exists (
       select 1 from pg_constraint
        where conrelid=relation and contype not in ('p','u')
     ) then
    raise exception 'oauth_states incompatible: primary_key or constraints';
  end if;

  select attnum into state_attribute from pg_attribute
   where attrelid=relation and attname='state' and not attisdropped;
  -- A partial, composite, invalid or deferred index cannot arbitrate nonce inserts.
  select count(*) into valid_uniques from pg_index
   where indrelid=relation and not indisprimary
     and indisunique and indisvalid and indisready and indimmediate
     and indnkeyatts=1 and indnatts=1 and indkey[0]=state_attribute
     and indpred is null and indexprs is null;
  if valid_uniques>1
     or (select count(*) from pg_index where indrelid=relation and not indisprimary)
        <>valid_uniques
     or exists (
       select 1 from pg_class c
        where c.oid=to_regclass('public.oauth_states_state_key')
          and not exists (
            select 1 from pg_index i
             where i.indexrelid=c.oid and i.indrelid=relation
               and not i.indisprimary and i.indisunique and i.indisvalid
               and i.indisready and i.indimmediate and i.indnkeyatts=1
               and i.indnatts=1 and i.indkey[0]=state_attribute
               and i.indpred is null and i.indexprs is null
          )
     ) then
    raise exception 'oauth_states incompatible: unique_index';
  end if;
  if valid_uniques=0 and exists (
    select 1 from public.oauth_states group by state having count(*)>1
  ) then
    raise exception 'oauth_states incompatible: duplicate_state';
  end if;

  if exists (
    select 1 from (
      select x.grantee from pg_class c,
        lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
       where c.oid=relation
      union all
      select x.grantee from pg_attribute a, lateral aclexplode(a.attacl) x
       where a.attrelid=relation and a.attnum>0 and not a.attisdropped
    ) grants
    where grantee<>0 and grantee not in (
      'postgres'::regrole, 'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole,
      'worker_role'::regrole, 'sender_role'::regrole
    )
  ) then
    raise exception 'oauth_states incompatible: unknown_grantee';
  end if;
  if not exists (
    select 1 from pg_roles where rolname='service_role' and rolbypassrls and not rolsuper
  ) then
    raise exception 'oauth_states incompatible: service_role';
  end if;

  -- All compatibility checks precede changes to an existing table.
  if valid_uniques=0 then
    alter table public.oauth_states add constraint oauth_states_state_key unique (state);
  end if;
  alter table public.oauth_states enable row level security;
  for p in select policyname from pg_policies
            where schemaname='public' and tablename='oauth_states' loop
    execute format('drop policy %I on public.oauth_states',p.policyname);
  end loop;
  revoke all privileges on public.oauth_states
    from public,anon,authenticated,service_role,worker_role,sender_role;
  revoke all privileges (id,state,organization_id,provider,metadata,expires_at,created_at)
    on public.oauth_states from public,anon,authenticated,service_role,worker_role,sender_role;
  grant select,insert,delete on public.oauth_states to service_role;

  if not (select relrowsecurity and not relforcerowsecurity from pg_class where oid=relation)
     or exists (select 1 from pg_policies
                 where schemaname='public' and tablename='oauth_states')
     or exists (
       select 1 from pg_class c, lateral aclexplode(c.relacl) x
        where c.oid=relation and x.grantee<>c.relowner
          and (x.grantee<>'service_role'::regrole or x.is_grantable
               or x.privilege_type not in ('SELECT','INSERT','DELETE'))
     )
     or exists (
       select 1 from pg_attribute a, lateral aclexplode(a.attacl) x
        where a.attrelid=relation and a.attnum>0 and not a.attisdropped
          and x.grantee<>'postgres'::regrole
     ) then
    raise exception 'oauth_states postcondition failed: security catalog';
  end if;

  foreach role_name in array array[
    'anon','authenticated','service_role','worker_role','sender_role'
  ] loop
    foreach privilege_name in array array[
      'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'
    ] loop
      expected := role_name='service_role' and privilege_name in ('SELECT','INSERT','DELETE');
      if has_table_privilege(role_name,relation,privilege_name) is distinct from expected then
        raise exception 'oauth_states postcondition failed: %.%',role_name,privilege_name;
      end if;
    end loop;
    foreach column_name in array array[
      'id','state','organization_id','provider','metadata','expires_at','created_at'
    ] loop
      foreach privilege_name in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
        expected := role_name='service_role' and privilege_name in ('SELECT','INSERT');
        if has_column_privilege(role_name,relation,column_name,privilege_name)
           is distinct from expected then
          raise exception 'oauth_states postcondition failed: %.%.%',
                          role_name,column_name,privilege_name;
        end if;
      end loop;
    end loop;
  end loop;
end
$$;

commit;
