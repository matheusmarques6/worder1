-- Configurações (redesign): papel "analista", sessões do usuário e histórico de login.

-- 1) Papel Analista (só leitura de relatórios) — Administrador/Editor/Analista/Suporte
alter type user_role add value if not exists 'analyst';

-- 2) Sessões abertas pelo login do Worder (a tabela auth.sessions só registra o
--    user agent do servidor, então guardamos aqui o navegador/IP reais).
create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid,
  auth_session_id uuid,                -- claim session_id do JWT (auth.sessions.id)
  user_agent text,
  ip text,
  city text,
  country text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists user_sessions_user_idx on public.user_sessions(user_id, revoked_at);
create unique index if not exists user_sessions_auth_session_idx on public.user_sessions(auth_session_id);
alter table public.user_sessions enable row level security;
drop policy if exists "user_sessions_own" on public.user_sessions;
create policy "user_sessions_own" on public.user_sessions for select using (auth.uid() = user_id);

-- 3) Histórico de login (sucesso e bloqueio) — últimos 30 dias na tela Segurança.
create table if not exists public.auth_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text,
  ip text,
  user_agent text,
  city text,
  country text,
  success boolean not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists auth_login_events_user_idx on public.auth_login_events(user_id, created_at desc);
create index if not exists auth_login_events_email_idx on public.auth_login_events(lower(email), created_at desc);
alter table public.auth_login_events enable row level security;
drop policy if exists "auth_login_events_own" on public.auth_login_events;
create policy "auth_login_events_own" on public.auth_login_events for select using (auth.uid() = user_id);

-- 4) Encerrar uma sessão específica do próprio usuário (apaga em auth.sessions;
--    o refresh token morre na hora e o access token expira em até 1h).
create or replace function public.revoke_auth_session(p_session_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n int;
begin
  delete from auth.sessions where id = p_session_id and user_id = p_user_id;
  get diagnostics n = row_count;
  update public.user_sessions set revoked_at = now()
    where auth_session_id = p_session_id and user_id = p_user_id and revoked_at is null;
  return n > 0;
end;
$$;
revoke all on function public.revoke_auth_session(uuid, uuid) from public;
grant execute on function public.revoke_auth_session(uuid, uuid) to service_role;

-- 5) Encerrar todas as outras sessões do usuário (mantém a atual).
create or replace function public.revoke_other_auth_sessions(p_user_id uuid, p_keep_session_id uuid)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  n int;
begin
  delete from auth.sessions where user_id = p_user_id and (p_keep_session_id is null or id <> p_keep_session_id);
  get diagnostics n = row_count;
  update public.user_sessions set revoked_at = now()
    where user_id = p_user_id and revoked_at is null
      and (p_keep_session_id is null or auth_session_id is distinct from p_keep_session_id);
  return n;
end;
$$;
revoke all on function public.revoke_other_auth_sessions(uuid, uuid) from public;
grant execute on function public.revoke_other_auth_sessions(uuid, uuid) to service_role;

-- 6) Lista as sessões vivas em auth.sessions do usuário (para casar com user_sessions).
create or replace function public.list_auth_sessions(p_user_id uuid)
returns table (id uuid, created_at timestamptz, updated_at timestamptz, user_agent text, ip text)
language sql
security definer
set search_path = public, auth
as $$
  select s.id, s.created_at, s.updated_at, s.user_agent, s.ip::text
  from auth.sessions s where s.user_id = p_user_id order by s.updated_at desc;
$$;
revoke all on function public.list_auth_sessions(uuid) from public;
grant execute on function public.list_auth_sessions(uuid) to service_role;
