-- Application prerequisites missing from the active migration stream.
-- Fresh creation only: existing relations are left untouched. The separate
-- upgrade migration reconciles existing shapes. Later active migrations own
-- RLS, ACLs, auth triggers, attribution aggregates and tracking additions.
-- Sources: complete-schema.sql; claude-b-migration.sql; campaigns-schema.sql;
-- whatsapp-schema-v3.sql; archived 20260401/20260415/20260508/20260513 changes;
-- current campaign, automation, auth and tracking readers/writers.

create table if not exists public.organization_members (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role public.user_role default 'member',
  email text,
  name text,
  status text default 'active',
  invited_by uuid references public.profiles(id),
  invited_at timestamptz default now(),
  joined_at timestamptz,
  created_at timestamptz default now(),
  unique (organization_id, user_id)
);

create table if not exists public.pipelines (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  name text not null,
  description text,
  color text default '#8b5cf6',
  position integer default 0,
  is_default boolean default false,
  has_active_automations boolean default false,
  automation_rules_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.pipeline_stages (
  id uuid primary key default uuid_generate_v4(),
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  color text default '#8b5cf6',
  position integer not null default 0,
  probability integer default 50,
  is_won boolean default false,
  is_lost boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_pipeline_stages_pipeline_position
  on public.pipeline_stages(pipeline_id, position);

create table if not exists public.automations (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  name text not null,
  description text,
  status text default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  trigger_type text not null,
  trigger_config jsonb default '{}'::jsonb,
  trigger_filters jsonb default '[]'::jsonb,
  audience_filters jsonb default '[]'::jsonb,
  exit_conditions jsonb default '[]'::jsonb,
  frequency_config jsonb default '{"type":"once"}'::jsonb,
  nodes jsonb default '[]'::jsonb,
  edges jsonb default '[]'::jsonb,
  total_runs integer default 0,
  successful_runs integer default 0,
  failed_runs integer default 0,
  total_revenue numeric(12,2) default 0,
  last_run_at timestamptz,
  activated_at timestamptz,
  paused_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default uuid_generate_v4(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  organization_id uuid,
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid,
  trigger_event_id uuid,
  trigger_type text,
  status text default 'pending'
    check (status in ('pending', 'waiting', 'running', 'completed', 'failed', 'cancelled')),
  current_node_id text,
  waiting_until timestamptz,
  started_at timestamptz default now(),
  completed_at timestamptz,
  result jsonb default '{}'::jsonb,
  node_results jsonb default '{}'::jsonb,
  error_message text,
  error_node_id text,
  last_error text,
  retry_count integer default 0,
  metadata jsonb default '{}'::jsonb,
  trigger_data jsonb default '{}'::jsonb,
  lock_token uuid,
  locked_at timestamptz,
  locked_by text,
  last_heartbeat_at timestamptz,
  resume_data jsonb,
  resume_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_automation_runs_pending
  on public.automation_runs(created_at) where status = 'pending';
create index if not exists idx_automation_runs_waiting
  on public.automation_runs(waiting_until) where status = 'waiting';

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  name text not null,
  subject text,
  from_name text,
  from_email text,
  sender_name text,
  reply_to text,
  html_content text,
  text_content text,
  template_id uuid,
  list_id uuid,
  segment_id uuid,
  status text default 'draft'
    check (status in ('draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled', 'failed')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  total_recipients integer default 0,
  total_sent integer default 0,
  total_delivered integer default 0,
  total_opened integer default 0,
  total_clicked integer default 0,
  total_bounced integer default 0,
  total_unsubscribed integer default 0,
  total_complained integer default 0,
  total_failed integer default 0,
  opens integer default 0,
  clicks integer default 0,
  bounces integer default 0,
  unsubscribes integer default 0,
  open_rate numeric(5,2) default 0,
  click_rate numeric(5,2) default 0,
  bounce_rate numeric(5,2) default 0,
  revenue numeric(12,2) default 0,
  attributed_revenue numeric(12,2) default 0,
  conversions integer default 0,
  settings jsonb default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Both the title-based legacy writer and the name-based current writer remain
-- valid. Neither label is required on its own; unrelated legacy parent tables
-- (phonebooks/segments) are not fabricated merely to attach a foreign key.
create table if not exists public.whatsapp_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  instance_id uuid references public.whatsapp_instances(id),
  name text,
  title text,
  campaign_id text,
  description text,
  type text default 'broadcast',
  status text default 'draft'
    check (status in ('draft', 'scheduled', 'pending', 'running', 'sending', 'sent',
      'completed', 'paused', 'cancelled', 'failed', 'PENDING', 'SCHEDULED', 'RUNNING',
      'SENDING', 'SENT', 'COMPLETED', 'PAUSED', 'CANCELLED', 'FAILED')),
  template_id uuid references public.whatsapp_templates(id),
  template_name text,
  template_language text default 'pt_BR',
  template_variables jsonb default '{}'::jsonb,
  body_variables jsonb default '[]'::jsonb,
  header_variable jsonb,
  button_variables jsonb default '[]'::jsonb,
  media_url text,
  media_type text,
  audience_type text default 'all',
  audience_tags text[],
  audience_segment_id uuid,
  audience_phonebook_id uuid,
  phonebook_id uuid,
  audience_filters jsonb default '{}'::jsonb,
  audience_count integer default 0,
  imported_contacts jsonb,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  paused_at timestamptz,
  timezone text default 'America/Sao_Paulo',
  messages_per_second integer default 10,
  batch_size integer default 100,
  delay_between_batches integer default 1000,
  send_interval_ms integer default 1000,
  total_recipients integer default 0,
  total_contacts integer default 0,
  total_sent integer default 0,
  total_delivered integer default 0,
  total_read integer default 0,
  total_clicked integer default 0,
  total_replied integer default 0,
  total_failed integer default 0,
  total_opted_out integer default 0,
  sent_count integer default 0,
  delivered_count integer default 0,
  read_count integer default 0,
  failed_count integer default 0,
  replied_count integer default 0,
  attributed_revenue numeric(12,2) default 0,
  attributed_orders integer default 0,
  attribution_window_hours integer default 72,
  revenue numeric(12,2) default 0,
  conversions integer default 0,
  cost_per_message numeric(6,4) default 0.05,
  total_cost numeric(12,2) default 0,
  created_by uuid,
  created_by_name text,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.sms_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  name text not null,
  status text default 'draft',
  message_body text,
  audience_count integer default 0,
  sent_count integer default 0,
  delivered_count integer default 0,
  failed_count integer default 0,
  replied_count integer default 0,
  revenue numeric(12,2) default 0,
  conversions integer default 0,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.email_campaigns(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  store_id uuid,
  automation_id uuid,
  automation_run_id uuid,
  flow_id uuid,
  node_id text,
  email_template_id uuid,
  email text not null,
  to_email text,
  from_email text,
  sender_email text,
  subject text,
  status text default 'queued'
    check (status in ('queued', 'pending', 'sent', 'delivered', 'opened', 'clicked',
      'bounced', 'failed', 'unsubscribed', 'complained')),
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  failed_at timestamptz,
  unsubscribed_at timestamptz,
  complained_at timestamptz,
  open_count integer default 0,
  click_count integer default 0,
  bounce_type text,
  bounce_message text,
  error_message text,
  provider text,
  provider_message_id text,
  resend_id text,
  dedupe_key text,
  ip_address text,
  user_agent text,
  conversion_value numeric(12,2) default 0,
  converted_at timestamptz,
  order_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists uq_email_sends_dedupe_key
  on public.email_sends(dedupe_key) where dedupe_key is not null;

create table if not exists public.whatsapp_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  campaign_id uuid references public.whatsapp_campaigns(id) on delete set null,
  store_id uuid,
  automation_id uuid,
  automation_run_id uuid,
  flow_id uuid,
  node_id text,
  phone_number text not null,
  message_body text,
  template_name text,
  template_params jsonb,
  media_url text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'delivered', 'read', 'replied', 'failed')),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  failed_at timestamptz,
  error_message text,
  conversion_value numeric(12,2) default 0,
  converted_at timestamptz,
  order_id text,
  external_message_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whatsapp_sends_order_idempotency_idx
  on public.whatsapp_sends(organization_id, order_id) where order_id is not null;

create table if not exists public.sms_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  campaign_id uuid references public.sms_campaigns(id) on delete set null,
  store_id uuid,
  automation_id uuid,
  automation_run_id uuid,
  flow_id uuid,
  node_id text,
  phone_number text not null,
  message_body text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'delivered', 'clicked', 'failed', 'undelivered')),
  sent_at timestamptz,
  delivered_at timestamptz,
  clicked_at timestamptz,
  failed_at timestamptz,
  error_message text,
  conversion_value numeric(12,2) default 0,
  converted_at timestamptz,
  order_id text,
  external_message_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sms_sends_order_idempotency_idx
  on public.sms_sends(organization_id, order_id) where order_id is not null;

create table if not exists public.product_feeds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  name text not null,
  feed_type text not null default 'bestsellers',
  time_period text default '30d',
  filters jsonb default '[]'::jsonb,
  max_products int default 4,
  layout text default '2x2',
  show_price boolean default true,
  show_compare_price boolean default true,
  show_button boolean default true,
  button_text text default 'Comprar',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.product_feeds enable row level security;

create policy "Users can manage their org product_feeds" on public.product_feeds
  for all using (
    organization_id in (
      select organization_id from profiles where id = auth.uid()
    )
  );

create index if not exists idx_product_feeds_org on public.product_feeds(organization_id);
