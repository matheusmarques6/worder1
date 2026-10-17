-- Passwords are deliberately absent. Provision independently with the database
-- administrator's secure password workflow; never commit/log credentials.
-- Existing NOLOGIN permission roles/policies stay unchanged for mixed versions.
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'runtime_worker_login') then
        create role runtime_worker_login login noinherit nosuperuser nobypassrls
            nocreatedb nocreaterole noreplication;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'runtime_sender_login') then
        create role runtime_sender_login login noinherit nosuperuser nobypassrls
            nocreatedb nocreaterole noreplication;
    end if;
end
$$;

grant worker_role to runtime_worker_login;
grant sender_role to runtime_sender_login;

-- Fail rather than silently reuse an independently created privileged login.
do $$
begin
    if exists (
        select 1 from pg_roles
        where rolname in ('runtime_worker_login', 'runtime_sender_login')
          and (not rolcanlogin or rolinherit or rolsuper or rolbypassrls
               or rolcreatedb or rolcreaterole or rolreplication)
    ) or exists (
        select 1 from pg_auth_members m
        join pg_roles member on member.oid = m.member
        join pg_roles parent on parent.oid = m.roleid
        where member.rolname in ('runtime_worker_login', 'runtime_sender_login')
          and (m.admin_option or parent.rolname <> case member.rolname
               when 'runtime_worker_login' then 'worker_role' else 'sender_role' end)
    ) then
        raise exception 'runtime LOGIN already exists with unsafe privileges';
    end if;
end
$$;
