-- ============================================================================
-- 20260812000001_agents_baseline_prereqs.sql
-- Baseline de pré-requisitos do projeto "Agentes por Evento".
--
-- Conteúdo: CREATE TABLE IF NOT EXISTS das tabelas PREEXISTENTES que o
-- trabalho novo referencia (por FK ou leitura), conformadas ao shape do banco
-- de produção (introspecção via pg_catalog em 12/08/2026) + enums + helpers.
--
-- Propriedades:
--   * No banco vivo é um NO-OP registrado (tudo já existe; só IF NOT EXISTS,
--     zero ALTER, zero RLS, zero trigger).
--   * Num banco limpo (CI: `supabase start`), bootstrapa o mundo que os testes
--     do runtime precisam.
--   * NÃO recria CHECKs nem índices de performance das tabelas legadas
--     (irrelevantes para os testes; fidelidade completa = dump futuro, ver
--     core/agentes-por-evento.md §A.2). Índices SEMÂNTICOS (parciais UNIQUE)
--     são incluídos.
--
-- Fonte canônica dali em diante: supabase/migrations/ (YYYYMMDDHHMMSS_snake).
-- Histórico anterior: supabase/migrations-archive/ (congelado, ver README).
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
-- ai_agent_chunks.embedding é vector(1536); no vivo a extensão já existe.
create extension if not exists vector;

-- ----------------------------------------------------------------------------
-- Enums usados pelas tabelas base
-- ----------------------------------------------------------------------------
do $$ begin
  create type plan_type as enum ('starter', 'growth', 'enterprise');
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_role as enum ('owner', 'admin', 'member', 'agent');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Helpers (definições idênticas às do banco vivo)
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.update_updated_at_column()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.user_belongs_to_org(org_id uuid)
returns boolean language plpgsql security definer as $$
begin
  return exists (
    select 1 from profiles where id = auth.uid() and organization_id = org_id
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- organizations
-- ----------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  logo_url text,
  plan plan_type default 'starter'::plan_type,
  plan_contacts_limit integer default 1000,
  plan_emails_limit integer default 10000,
  plan_whatsapp_limit integer default 1000,
  billing_email text,
  stripe_customer_id text,
  stripe_subscription_id text,
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  sender_name text,
  sender_email text,
  reply_to_email text,
  email_settings jsonb default '{}'::jsonb,
  onboarding_status jsonb default '{"step": 0, "complete": false}'::jsonb,
  tracking_settings jsonb default '{"utm_auto": true, "utm_medium": "email", "utm_source": "worder", "open_tracking": true, "click_tracking": true}'::jsonb,
  company_name varchar(255),
  cnpj varchar(20),
  address text,
  city varchar(100),
  state varchar(2),
  next_billing_date timestamptz,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start smallint not null default 20,
  quiet_hours_end smallint not null default 8,
  quiet_hours_timezone text not null default 'America/Sao_Paulo'::text,
  max_sends_per_contact_per_day integer not null default 0,
  skip_contacts_in_active_flows boolean not null default false,
  max_email_per_contact_per_day integer,
  max_sms_per_contact_per_day integer default 3,
  max_whatsapp_per_contact_per_day integer,
  email_provider text not null default 'resend'::text,
  email_provider_config jsonb not null default '{}'::jsonb,
  feature_flags jsonb not null default '{}'::jsonb,
  billing_model text not null default 'flat'::text,
  message_markup_pct numeric(5,2) not null default 0.00,
  credit_limit_usd numeric(12,2) not null default 0.00,
  credit_used_usd numeric(12,2) not null default 0.00,
  billing_currency text not null default 'BRL'::text,
  billing_notes text
);

-- ----------------------------------------------------------------------------
-- profiles (1 linha por usuário auth; organization_id é o vínculo de tenancy)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  first_name text,
  last_name text,
  full_name text generated always as ((coalesce(first_name, ''::text) || ' '::text) || coalesce(last_name, ''::text)) stored,
  avatar_url text,
  phone text,
  role user_role default 'member'::user_role,
  organization_id uuid references public.organizations(id) on delete set null,
  timezone text default 'America/Sao_Paulo'::text,
  preferences jsonb default '{"theme": "dark", "notifications": true}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  must_change_password boolean default false
);

-- ----------------------------------------------------------------------------
-- shopify_stores (credenciais Shopify; access_token em texto plano — fato do
-- banco vivo, ver core/agentes-por-evento.md §A / decisão G)
-- ----------------------------------------------------------------------------
create table if not exists public.shopify_stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  shop_domain text not null,
  shop_id bigint,
  shop_name text,
  shop_email text,
  currency text default 'BRL'::text,
  plan_name text,
  access_token text not null,
  scope text[],
  webhooks_registered boolean default false,
  webhook_ids jsonb default '[]'::jsonb,
  last_sync_at timestamptz,
  last_sync_status text,
  customers_synced integer default 0,
  orders_synced integer default 0,
  default_pipeline_id uuid,
  default_stage_id uuid,
  settings jsonb default '{}'::jsonb,
  status text not null default 'active'::text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  connection_status varchar(20) default 'active'::character varying,
  status_message text,
  status_code varchar(50),
  health_checked_at timestamptz,
  consecutive_failures integer default 0,
  token_expires_at timestamptz,
  last_notification_at timestamptz,
  api_secret text,
  timezone text default 'America/Sao_Paulo'::text,
  is_active boolean default true,
  contact_type text default 'auto'::text,
  auto_tags text[] default array['shopify'::text],
  sync_orders boolean default true,
  sync_customers boolean default true,
  sync_checkouts boolean default true,
  sync_refunds boolean default false,
  stage_mapping jsonb default '{}'::jsonb,
  is_configured boolean default false,
  webhooks_registered_at timestamptz,
  last_reconcile_at timestamptz,
  import_status text default 'pending'::text,
  import_progress integer default 0,
  total_customers_imported integer default 0,
  total_orders_imported integer default 0,
  connected_by uuid,
  api_version text default '2026-01'::text,
  webhook_secret text,
  initial_sync_completed boolean default false,
  pixel_installed boolean default false,
  embed_installed boolean default false,
  scopes text[],
  installed_at timestamptz default now(),
  uninstalled_at timestamptz,
  total_customers integer default 0,
  total_orders integer default 0,
  total_products integer default 0,
  total_revenue numeric(12,2) default 0,
  connection_type text default 'oauth'::text,
  client_id text,
  sync_products boolean default true,
  shop_domain_aliases text[] default '{}'::text[],
  shopify_shop_id text,
  embed_installed_at timestamptz
);

-- ----------------------------------------------------------------------------
-- stores (multi-store genérica; store_id das tabelas novas fica sem FK no v1)
-- ----------------------------------------------------------------------------
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name varchar(255) not null,
  domain varchar(255),
  platform varchar(50) default 'shopify'::character varying,
  shopify_store_id varchar(255),
  shopify_access_token text,
  settings jsonb default '{}'::jsonb,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  client_id text,
  connection_type text default 'oauth'::text,
  token_expires_at timestamptz,
  currency text default 'BRL'::text,
  last_sync_at timestamptz,
  sync_orders boolean default true,
  sync_customers boolean default true,
  sync_checkouts boolean default true,
  sync_products boolean default true,
  sync_refunds boolean default true,
  user_id uuid,
  shopify_domain text,
  webhook_secret text
);

-- ----------------------------------------------------------------------------
-- whatsapp_instances (legado Evolution/Meta manual; alvo de FK de
-- whatsapp_contacts/whatsapp_templates — por isso entra no baseline)
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  title text,
  phone_number text,
  phone_number_id text,
  access_token text,
  status text default 'disconnected'::text,
  online_status text default 'offline'::text,
  api_type text default 'META_CLOUD'::text,
  unique_id text,
  instance_name text,
  instance_id text,
  server_url text,
  api_key text,
  owner_jid text,
  profile_name text,
  profile_picture_url text,
  qr_code text,
  qr_code_base64 text,
  webhook_url text,
  webhook_events text[] default '{}'::text[],
  settings jsonb default '{}'::jsonb,
  last_seen_at timestamptz,
  last_message_at timestamptz,
  messages_sent integer default 0,
  messages_received integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  webhook_token text,
  api_url text,
  webhook_configured boolean default false,
  webhook_enabled boolean default true,
  chatwoot_enabled boolean default false,
  chatwoot_account_id text,
  chatwoot_token text,
  chatwoot_url text,
  chatwoot_sign_msg boolean default false,
  chatwoot_reopen_conversation boolean default false,
  chatwoot_conversation_pending boolean default false,
  rabbitmq_enabled boolean default false,
  rabbitmq_events text[],
  typebot_enabled boolean default false,
  typebot_url text,
  typebot_typebot text,
  typebot_expire integer default 0,
  typebot_keyword_finish text,
  typebot_delay_message integer default 1000,
  typebot_unknown_message text,
  typebot_listening_from_me boolean default false,
  proxy_enabled boolean default false,
  proxy_host text,
  proxy_port text,
  proxy_protocol text,
  proxy_username text,
  proxy_password text,
  connection_status text default 'disconnected'::text,
  disconnection_reason text,
  disconnected_at timestamptz,
  connected_at timestamptz,
  is_default boolean default false,
  auto_reply_enabled boolean default false,
  ai_enabled boolean default false,
  ai_agent_id uuid,
  store_id uuid references public.shopify_stores(id),
  display_phone text,
  business_name text,
  webhook_verify_token text default (gen_random_uuid())::text,
  is_active boolean not null default true,
  is_verified boolean not null default false,
  webhook_verified boolean not null default false,
  tier integer not null default 0,
  daily_limit integer not null default 250,
  api_version text not null default 'v21.0'::text,
  quality_rating text default 'GREEN'::text,
  metadata jsonb default '{}'::jsonb,
  access_token_encrypted text,
  constraint unique_instance_name_per_store unique (store_id, instance_name)
);

-- ----------------------------------------------------------------------------
-- whatsapp_contacts (identidade WhatsApp; crm_contact_id liga ao CRM)
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  instance_id uuid references public.whatsapp_instances(id) on delete set null,
  wa_id text,
  phone_number text not null,
  profile_name text,
  push_name text,
  profile_picture_url text,
  is_business boolean default false,
  is_group boolean default false,
  crm_contact_id uuid,
  tags text[] default '{}'::text[],
  metadata jsonb default '{}'::jsonb,
  last_message_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  name varchar(255),
  email varchar(255),
  address jsonb default '{}'::jsonb,
  custom_fields jsonb default '{}'::jsonb,
  deal_id uuid,
  pipeline_id uuid,
  stage_id uuid,
  shopify_customer_id varchar(100),
  total_orders integer default 0,
  total_spent numeric(10,2) default 0,
  last_order_at timestamptz,
  is_blocked boolean default false,
  blocked_reason text,
  blocked_at timestamptz,
  source varchar(50) default 'whatsapp'::character varying,
  first_message_at timestamptz,
  total_conversations integer default 0,
  total_messages_received integer default 0,
  total_messages_sent integer default 0,
  store_id uuid references public.shopify_stores(id),
  profile_picture text,
  constraint whatsapp_contacts_org_phone_unique unique (organization_id, phone_number)
);

-- ----------------------------------------------------------------------------
-- contacts (CRM canônico — o contact_id das tabelas novas aponta para cá)
-- ----------------------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text,
  phone text,
  whatsapp text,
  first_name text,
  last_name text,
  full_name text generated always as ((coalesce(first_name, ''::text) || ' '::text) || coalesce(last_name, ''::text)) stored,
  company text,
  position text,
  avatar_url text,
  source text default 'manual'::text,
  shopify_customer_id text,
  klaviyo_profile_id text,
  total_orders integer default 0,
  total_spent numeric(12,2) default 0,
  average_order_value numeric(12,2) default 0,
  last_order_at timestamptz,
  lifetime_value numeric(12,2) default 0,
  tags text[] default '{}'::text[],
  custom_fields jsonb default '{}'::jsonb,
  is_subscribed_email boolean default true,
  is_subscribed_sms boolean default false,
  is_subscribed_whatsapp boolean default false,
  email_consent_at timestamptz,
  sms_consent_at timestamptz,
  whatsapp_consent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  first_order_at timestamptz,
  last_order_id text,
  last_order_value numeric(12,2),
  last_order_number text,
  last_order_products jsonb default '[]'::jsonb,
  days_since_last_order integer,
  order_frequency_days integer,
  favorite_products jsonb default '[]'::jsonb,
  last_seen_at timestamptz,
  total_page_views integer default 0,
  last_viewed_products jsonb default '[]'::jsonb,
  rfm_recency_score integer,
  rfm_frequency_score integer,
  rfm_monetary_score integer,
  rfm_segment text,
  store_id uuid references public.shopify_stores(id),
  whatsapp_contact_id uuid references public.whatsapp_contacts(id) on delete set null,
  profile_picture_url text,
  last_whatsapp_conversation_id uuid,
  total_whatsapp_messages integer default 0,
  last_whatsapp_at timestamptz,
  is_whatsapp_blocked boolean default false,
  profile_name text,
  whatsapp_id text,
  is_blocked boolean default false,
  blocked_reason text,
  blocked_at timestamptz,
  blocked_by uuid,
  first_message_at timestamptz,
  last_message_at timestamptz,
  total_conversations integer default 0,
  total_messages_received integer default 0,
  total_messages_sent integer default 0,
  source_campaign_id uuid,
  first_contact_channel varchar(50),
  address jsonb default '{}'::jsonb,
  email_consent text default 'subscribed'::text,
  email_consent_updated_at timestamptz,
  suppressed boolean default false,
  last_email_at timestamptz,
  email_open_count integer default 0,
  email_click_count integer default 0,
  last_active_at timestamptz,
  lifecycle_stage text default 'subscriber'::text,
  rfm_recency integer,
  rfm_frequency integer,
  rfm_monetary integer,
  predicted_clv numeric(12,2),
  churn_risk numeric(5,4),
  email_consent_source text,
  sms_consent boolean default false,
  whatsapp_consent boolean default false,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device_type text,
  browser text,
  os text,
  visitor_id text,
  last_event_type text,
  total_events integer default 0,
  birthday date,
  gender text,
  city text,
  state text,
  country text,
  zip text,
  utm_data jsonb default '{}'::jsonb,
  timezone text,
  best_send_hour integer,
  last_email_sent_at timestamptz,
  engagement_score integer default 50
);

-- ----------------------------------------------------------------------------
-- whatsapp_business_accounts (conta Cloud API; token criptografado
-- access_token_encrypted com fallback plaintext access_token)
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_business_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  waba_id text,
  phone_number_id text not null unique,
  business_id text,
  app_id text,
  phone_number text,
  display_phone_number text,
  verified_name text,
  quality_rating text default 'UNKNOWN'::text,
  access_token text,
  access_token_encrypted text,
  webhook_verify_token text,
  webhook_configured boolean default false,
  status text default 'active'::text,
  account_mode text default 'LIVE'::text,
  messaging_limit text,
  messaging_tier integer default 1,
  messages_sent_today integer default 0,
  messages_received_today integer default 0,
  total_messages_sent integer default 0,
  total_messages_received integer default 0,
  last_message_at timestamptz,
  last_webhook_at timestamptz,
  connection_method text default 'manual'::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  flow_public_key_pem text,
  flow_private_key_encrypted text,
  flow_key_uploaded_at timestamptz,
  flow_public_key_uploaded boolean not null default false,
  flow_keys_created_at timestamptz,
  store_id uuid,
  last_health_check_at timestamptz,
  last_health_status text,
  last_health_error_code integer,
  last_health_expires_at timestamptz,
  token_invalid_at timestamptz,
  token_invalid_code integer,
  token_invalid_message text
);

-- ----------------------------------------------------------------------------
-- whatsapp_cloud_conversations (origem de sync da canônica `conversations`)
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_cloud_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  waba_id uuid not null references public.whatsapp_business_accounts(id) on delete cascade,
  contact_id uuid references public.whatsapp_contacts(id) on delete set null,
  wa_id text not null,
  chat_id text,
  contact_name text,
  contact_phone text,
  status text default 'open'::text,
  is_window_open boolean default false,
  window_expires_at timestamptz,
  last_customer_message_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_direction text,
  unread_count integer default 0,
  assigned_to uuid references auth.users(id) on delete set null,
  labels text[] default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  profile_picture text,
  store_id uuid,
  ai_enabled boolean not null default true,
  ai_disabled_at timestamptz,
  ai_disabled_reason text,
  assigned_agent_id uuid,
  ai_agent_id uuid,
  ai_debounce_until timestamptz,
  ai_pending boolean default false,
  ai_retry_count integer not null default 0,
  ai_transferred_at timestamptz,
  constraint whatsapp_cloud_conversations_waba_id_wa_id_key unique (waba_id, wa_id)
);

-- ----------------------------------------------------------------------------
-- whatsapp_cloud_messages (espelho do inbox; dedup por wamid)
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_cloud_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  waba_id uuid not null references public.whatsapp_business_accounts(id) on delete cascade,
  conversation_id uuid not null references public.whatsapp_cloud_conversations(id) on delete cascade,
  message_id text not null unique,
  direction text not null,
  from_number text,
  to_number text,
  message_type text not null,
  content jsonb,
  text_body text,
  caption text,
  media_id text,
  status text default 'received'::text,
  error_code text,
  error_message text,
  template_name text,
  template_data jsonb,
  "timestamp" timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  store_id uuid,
  sent_by_bot boolean not null default false,
  sender text,
  ai_agent_id uuid,
  delivered_at timestamptz,
  read_at timestamptz,
  media_url text,
  media_filename text,
  media_mime_type text,
  media_storage_path text,
  media_download_status text
);

-- ----------------------------------------------------------------------------
-- whatsapp_opt_status (fonte do opt-out-guard; preflight do sender lê daqui)
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_opt_status (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  contact_id uuid,
  phone text not null,
  status text not null default 'opted_in'::text,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  opt_in_source text default 'manual'::text,
  opt_out_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  consent_evidence jsonb default '{}'::jsonb
);

-- ----------------------------------------------------------------------------
-- whatsapp_templates (aprovação de template; preflight de janela fechada lê)
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  instance_id uuid references public.whatsapp_instances(id) on delete cascade,
  template_id text,
  name text not null,
  language text not null default 'pt_BR'::text,
  category text not null,
  status text not null default 'PENDING'::text,
  components jsonb not null,
  times_sent integer default 0,
  synced_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  waba_id uuid references public.whatsapp_business_accounts(id) on delete cascade,
  meta_template_id text,
  rejection_reason text,
  header_type text default 'none'::text,
  header_text text,
  header_media_url text,
  body_text text,
  body_variables integer default 0,
  footer_text text,
  buttons jsonb default '[]'::jsonb,
  use_count integer default 0,
  last_used_at timestamptz,
  quality_score jsonb,
  category_change_history jsonb default '[]'::jsonb,
  last_category_change_at timestamptz,
  variables_count integer not null default 0,
  constraint uq_wt_waba_name_lang unique (waba_id, name, language)
);

-- ----------------------------------------------------------------------------
-- ai_agents (o Agente da cascata; ganha presentation_mode/client_adaptation
-- em migration própria na Etapa 7)
-- ----------------------------------------------------------------------------
create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  description text,
  system_prompt text not null,
  provider text default 'openai'::text,
  model text default 'gpt-4o-mini'::text,
  api_key text,
  temperature numeric default 0.7,
  max_tokens integer default 500,
  is_active boolean default true,
  created_at timestamptz default now(),
  persona jsonb default '{"tone": "friendly", "language": "pt-BR", "guidelines": [], "reply_delay": 3, "response_length": "medium", "role_description": ""}'::jsonb,
  settings jsonb default '{"behavior": {"activate_on": "new_message", "stop_on_human_reply": true, "cooldown_after_transfer": 300, "max_messages_per_conversation": 0}, "channels": {"channel_ids": [], "all_channels": true}, "schedule": {"days": ["mon", "tue", "wed", "thu", "fri"], "hours": {"end": "18:00", "start": "08:00"}, "timezone": "America/Sao_Paulo", "always_active": true}, "pipelines": {"stage_ids": [], "pipeline_ids": [], "all_pipelines": true}}'::jsonb,
  total_messages integer default 0,
  total_conversations integer default 0,
  total_tokens_used integer default 0,
  avg_response_time_ms integer default 0,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- ai_agent_versions (padrão append-only que ai_missions copia)
-- ----------------------------------------------------------------------------
create table if not exists public.ai_agent_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  version_number integer not null,
  label text not null default 'Alteração de prompt'::text,
  status text not null default 'produção'::text,
  system_prompt text,
  persona jsonb,
  settings jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint ai_agent_versions_agent_id_version_number_key unique (agent_id, version_number)
);

create unique index if not exists idx_agent_versions_one_production
  on public.ai_agent_versions (agent_id) where status = 'produção';

create index if not exists idx_agent_versions_agent
  on public.ai_agent_versions (agent_id, version_number desc);

-- ----------------------------------------------------------------------------
-- ai_agent_sources (a base de conhecimento que o lojista alimenta pela
-- SourcesTab; o runtime só a lê via ai_agent_chunks)
-- ----------------------------------------------------------------------------
create table if not exists public.ai_agent_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  source_type text not null,
  name text not null,
  url text,
  pages_crawled integer default 0,
  file_url text,
  file_size_bytes integer,
  original_filename text,
  mime_type text,
  text_content text,
  integration_id uuid,
  integration_type text,
  products_count integer default 0,
  last_product_sync_at timestamptz,
  status text default 'pending'::text,
  error_message text,
  chunks_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  processed_at timestamptz
);

-- ----------------------------------------------------------------------------
-- ai_agent_chunks (o RAG que o worker lê; grant na migration da trilha)
-- ----------------------------------------------------------------------------
create table if not exists public.ai_agent_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null references public.ai_agent_sources(id) on delete cascade,
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  content text not null,
  content_tokens integer,
  metadata jsonb default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- agent_traces (trilha do lojista; estendida na Etapa 7 com os IDs do frame)
-- ----------------------------------------------------------------------------
create table if not exists public.agent_traces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid,
  agent_id uuid,
  provider text,
  model text,
  input text,
  output text,
  tool_calls jsonb,
  tokens integer,
  latency_ms integer,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- organization_api_keys (BYO de LLM; DDL estava fora de banda — agora canônica)
-- ----------------------------------------------------------------------------
create table if not exists public.organization_api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider varchar(50) not null,
  api_key text not null,
  api_key_hint varchar(20),
  base_url text,
  is_active boolean default true,
  is_valid boolean,
  last_validated_at timestamptz,
  last_error text,
  total_requests integer default 0,
  total_tokens_used integer default 0,
  total_cost numeric(10,4) default 0,
  last_used_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint organization_api_keys_organization_id_provider_key unique (organization_id, provider)
);
