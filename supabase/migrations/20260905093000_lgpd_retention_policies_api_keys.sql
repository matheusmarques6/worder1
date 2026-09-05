-- Privacidade e LGPD → Retenção (o cron /api/cron/lgpd-retention já lia esta
-- tabela, que não existia) + Chaves de API com hash e permissões.
create table if not exists public.lgpd_retention_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource text not null check (resource in ('contact_events','email_sends','contacts_inactive')),
  retention_days integer not null check (retention_days >= 30),
  enabled boolean not null default true,
  anonymize_only boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, resource)
);
alter table public.lgpd_retention_policies enable row level security;
drop policy if exists "lgpd_retention_policies_org" on public.lgpd_retention_policies;
create policy "lgpd_retention_policies_org" on public.lgpd_retention_policies for select
  using (organization_id in (select organization_id from public.profiles where id = auth.uid()));

alter table public.api_keys add column if not exists permissions text[] default '{}';
alter table public.api_keys add column if not exists key_hash text;
alter table public.api_keys add column if not exists key_prefix text;
alter table public.api_keys add column if not exists last_used_at timestamptz;
alter table public.api_keys add column if not exists is_active boolean default true;
create index if not exists api_keys_prefix_idx on public.api_keys(key_prefix) where is_active;
