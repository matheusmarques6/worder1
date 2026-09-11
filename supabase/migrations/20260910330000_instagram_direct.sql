-- =============================================
-- Instagram Direct: o que o código usa e o banco não tinha
--
-- A caixa de entrada do Instagram grava mensagens em `instagram_messages`
-- e contatos em `instagram_contacts` — nenhuma das duas tabelas existia.
-- Toda mensagem recebida pelo webhook era descartada em silêncio (o
-- PostgREST responde erro, e o código não checava), a listagem de
-- conversas quebrava nos embeds (`contact:instagram_contacts`,
-- `profiles!instagram_conversations_assigned_to_fkey`) porque não havia
-- chave estrangeira, e a janela de atendimento (is_window_open,
-- window_expires_at) não tinha onde ser guardada.
-- =============================================

-- Produção já possuía estas tabelas; o histórico ativo não. Mantemos o
-- contrato observado em produção para que um banco Fresh também seja válido.
create table if not exists public.instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid,
  ig_user_id text,
  instagram_business_id text,
  page_id text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  username text,
  name text,
  profile_picture_url text,
  followers_count integer default 0,
  status text not null default 'active',
  webhook_verify_token text,
  webhook_configured boolean default false,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.instagram_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  account_id uuid not null references public.instagram_accounts(id) on delete cascade,
  contact_id uuid,
  ig_user_id text not null,
  participant_id text,
  contact_name text,
  username text,
  status text not null default 'open',
  assigned_to uuid,
  ai_enabled boolean default false,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count integer not null default 0,
  tags jsonb,
  notes text,
  store_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Contatos do Instagram ──
create table if not exists public.instagram_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid references public.shopify_stores(id) on delete set null,
  ig_user_id text not null,
  username text,
  name text,
  profile_picture_url text,
  source text default 'instagram_dm',
  crm_contact_id uuid references public.contacts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_contacts_org_ig_user_key unique (organization_id, ig_user_id)
);

create index if not exists idx_instagram_contacts_org on public.instagram_contacts(organization_id);
create index if not exists idx_instagram_contacts_crm on public.instagram_contacts(crm_contact_id);

-- ── Mensagens ──
create table if not exists public.instagram_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid references public.shopify_stores(id) on delete set null,
  account_id uuid not null references public.instagram_accounts(id) on delete cascade,
  conversation_id uuid not null references public.instagram_conversations(id) on delete cascade,
  message_id text,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_id text,
  recipient_id text,
  from_user_id text,
  to_user_id text,
  message_type text not null default 'text',
  content jsonb not null default '{}'::jsonb,
  text_body text,
  media_url text,
  status text not null default 'sent',
  error_message text,
  reaction text,
  reaction_at timestamptz,
  is_read boolean not null default false,
  read_at timestamptz,
  timestamp timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint instagram_messages_org_message_key unique (organization_id, message_id)
);

create index if not exists idx_instagram_messages_conversa
  on public.instagram_messages(conversation_id, timestamp desc);
create index if not exists idx_instagram_messages_org on public.instagram_messages(organization_id);
create index if not exists idx_instagram_messages_conta on public.instagram_messages(account_id);

-- ── Colunas que faltavam na conta ──
alter table public.instagram_accounts
  add column if not exists media_count integer default 0,
  add column if not exists error_message text,
  add column if not exists last_error_at timestamptz,
  add column if not exists last_message_at timestamptz,
  add column if not exists last_webhook_at timestamptz,
  add column if not exists messages_received_today integer default 0,
  add column if not exists total_messages_received integer default 0;

-- ── Janela de atendimento e direção da última mensagem ──
alter table public.instagram_conversations
  add column if not exists is_window_open boolean default true,
  add column if not exists window_expires_at timestamptz,
  add column if not exists last_customer_message_at timestamptz,
  add column if not exists last_message_direction text;

-- ── Chaves estrangeiras que os embeds da listagem precisam ──
-- contact_id aponta para instagram_contacts (o contato do Instagram),
-- não para o contato do CRM — esse fica em instagram_contacts.crm_contact_id.
do $$
begin
  lock table public.instagram_conversations in share row exclusive mode;
  if exists (
    select 1 from public.instagram_conversations c
     where not exists (
       select 1 from public.instagram_accounts a
        where a.id = c.account_id and a.organization_id = c.organization_id
     )
  ) then
    raise exception 'instagram preflight: account_id incompatible';
  end if;
  if exists (
    select 1 from public.instagram_conversations c
     where c.contact_id is not null
       and not exists (
         select 1 from public.instagram_contacts ic
          where ic.id = c.contact_id and ic.organization_id = c.organization_id
       )
  ) then
    raise exception 'instagram preflight: contact_id incompatible';
  end if;
  if exists (
    select 1 from public.instagram_conversations c
     where c.assigned_to is not null
       and not exists (
         select 1 from public.profiles p
          where p.id = c.assigned_to and p.organization_id = c.organization_id
       )
  ) then
    raise exception 'instagram preflight: assigned_to incompatible';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.instagram_conversations'::regclass
       and conname = 'instagram_conversations_contact_id_fkey'
       and pg_get_constraintdef(oid) <>
           'FOREIGN KEY (contact_id) REFERENCES instagram_contacts(id) ON DELETE SET NULL'
  ) then
    raise exception 'instagram preflight: contact_id foreign key incompatible';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.instagram_conversations'::regclass
       and conname = 'instagram_conversations_contact_id_fkey'
  ) then
    alter table public.instagram_conversations
      add constraint instagram_conversations_contact_id_fkey
      foreign key (contact_id) references public.instagram_contacts(id) on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.instagram_conversations'::regclass
       and conname = 'instagram_conversations_assigned_to_fkey'
       and pg_get_constraintdef(oid) <>
           'FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL'
  ) then
    raise exception 'instagram preflight: assigned_to foreign key incompatible';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.instagram_conversations'::regclass
       and conname = 'instagram_conversations_assigned_to_fkey'
  ) then
    alter table public.instagram_conversations
      add constraint instagram_conversations_assigned_to_fkey
      foreign key (assigned_to) references public.profiles(id) on delete set null;
  end if;
end $$;

-- ── RLS: as quatro tabelas são por organização ──
alter table public.instagram_accounts enable row level security;
alter table public.instagram_conversations enable row level security;
alter table public.instagram_contacts enable row level security;
alter table public.instagram_messages enable row level security;

drop policy if exists org_isolation_rls on public.instagram_accounts;
create policy org_isolation_rls on public.instagram_accounts
  for all to authenticated
  using (organization_id = get_user_organization_id())
  with check (organization_id = get_user_organization_id());

drop policy if exists org_isolation_rls on public.instagram_conversations;
create policy org_isolation_rls on public.instagram_conversations
  for all to authenticated
  using (organization_id = get_user_organization_id())
  with check (organization_id = get_user_organization_id());

drop policy if exists org_isolation_rls on public.instagram_contacts;
create policy org_isolation_rls on public.instagram_contacts
  for all to authenticated
  using (organization_id = get_user_organization_id())
  with check (organization_id = get_user_organization_id());

drop policy if exists org_isolation_rls on public.instagram_messages;
create policy org_isolation_rls on public.instagram_messages
  for all to authenticated
  using (organization_id = get_user_organization_id())
  with check (organization_id = get_user_organization_id());
