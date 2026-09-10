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

create table if not exists public.shopify_products (
  id uuid primary key default uuid_generate_v4(),
  store_id uuid not null references public.shopify_stores(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  shopify_product_id text not null,
  title text not null,
  handle text,
  product_type text,
  vendor text,
  status text default 'active',
  price numeric(12,2) default 0,
  compare_at_price numeric(12,2),
  cost_per_item numeric(12,2) default 0,
  sku text,
  barcode text,
  inventory_quantity integer default 0,
  image_url text,
  images jsonb default '[]'::jsonb,
  variants jsonb default '[]'::jsonb,
  description text,
  body_html text,
  collections jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  published_at timestamptz,
  unique (store_id, shopify_product_id)
);

create index if not exists idx_shopify_products_store on public.shopify_products(store_id);
create index if not exists idx_shopify_products_sku on public.shopify_products(sku);
create index if not exists idx_shopify_products_org on public.shopify_products(organization_id);

-- Plaintext remains nullable only so existing legacy keys can be read while
-- every current writer creates hash-only credentials after the active bridge.
create table if not exists public.api_keys (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  user_id uuid,
  name text not null,
  key text,
  expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid,
  name text not null,
  description text,
  category text default 'custom',
  design_json jsonb,
  design jsonb,
  html text,
  thumbnail_url text,
  is_prebuilt boolean default false,
  is_active boolean default true,
  editor_type text not null default 'visual'
    check (editor_type in ('visual', 'text')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_email_templates_org
  on public.email_templates(organization_id);
create index if not exists idx_email_templates_store
  on public.email_templates(store_id) where store_id is not null;
create index if not exists email_templates_editor_type_idx
  on public.email_templates(organization_id, editor_type);

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

create table if not exists public.deals (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  stage_id uuid references public.pipeline_stages(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  contact_phone varchar(50),
  contact_name varchar(255),
  contact_email varchar(255),
  title text not null,
  value numeric(12,2) default 0,
  currency text default 'BRL',
  probability integer default 50 check (probability between 0 and 100),
  expected_close_date date,
  status text default 'open' check (status in ('open', 'won', 'lost')),
  won_at timestamptz,
  lost_at timestamptz,
  lost_reason text,
  notes text,
  tags text[] default '{}',
  custom_fields jsonb default '{}'::jsonb,
  position integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_deals_org on public.deals(organization_id);
create index if not exists idx_deals_store on public.deals(store_id);
create index if not exists idx_deals_pipeline on public.deals(pipeline_id);
create index if not exists idx_deals_stage on public.deals(stage_id);
create index if not exists idx_deals_contact on public.deals(contact_id);
create index if not exists idx_deals_status on public.deals(status);

create table if not exists public.deal_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid,
  deal_id uuid not null references public.deals(id) on delete cascade,
  contact_id uuid,
  user_id uuid,
  activity_type text not null check (activity_type in (
    'note', 'call', 'email', 'meeting', 'task', 'stage_change', 'value_change', 'custom'
  )),
  title text,
  description text,
  metadata jsonb default '{}'::jsonb,
  is_pinned boolean default false,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists deal_activities_deal_idx
  on public.deal_activities(deal_id, created_at desc);
create index if not exists deal_activities_org_idx
  on public.deal_activities(organization_id, created_at desc);
create index if not exists deal_activities_contact_idx
  on public.deal_activities(contact_id) where contact_id is not null;

-- Compatibility stub: the later fixed CRM policy consumes only these columns.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid
);

create table if not exists public.pipeline_stage_transitions (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text,
  description text,
  is_enabled boolean default true,
  position integer default 0,
  source_type text not null,
  trigger_event text not null,
  filters jsonb default '{}'::jsonb,
  from_stage_id uuid references public.pipeline_stages(id) on delete cascade,
  to_stage_id uuid not null references public.pipeline_stages(id) on delete cascade,
  mark_as_won boolean default false,
  mark_as_lost boolean default false,
  transitions_count integer default 0,
  last_triggered_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_stage_transitions_org
  on public.pipeline_stage_transitions(organization_id);
create index if not exists idx_stage_transitions_pipeline
  on public.pipeline_stage_transitions(pipeline_id);
create index if not exists idx_stage_transitions_source
  on public.pipeline_stage_transitions(source_type, trigger_event);
create index if not exists idx_stage_transitions_enabled
  on public.pipeline_stage_transitions(organization_id, source_type, trigger_event)
  where is_enabled = true;

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

create table if not exists public.automation_executions (
  id varchar(100) primary key,
  automation_id uuid not null references public.automations(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  status varchar(20) not null default 'running'
    check (status in ('running', 'success', 'error', 'waiting', 'cancelled')),
  trigger_type varchar(100),
  trigger_data jsonb,
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  node_results jsonb default '{}',
  final_context jsonb,
  error_message text,
  error_node_id varchar(100),
  duration_ms integer,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  wait_till timestamptz,
  resume_data jsonb,
  retry_of varchar(100),
  retry_count integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_automation_executions_automation
  on public.automation_executions(automation_id);
create index if not exists idx_automation_executions_org
  on public.automation_executions(organization_id);
create index if not exists idx_automation_executions_status
  on public.automation_executions(status);
create index if not exists idx_automation_executions_started
  on public.automation_executions(started_at desc);
create index if not exists idx_automation_executions_contact
  on public.automation_executions(contact_id);
create index if not exists idx_automation_executions_waiting
  on public.automation_executions(wait_till) where status = 'waiting';

create table if not exists public.automation_versions (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  version integer not null,
  nodes jsonb not null,
  edges jsonb not null,
  settings jsonb,
  change_note text,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id),
  unique (automation_id, version)
);

create index if not exists idx_automation_versions_automation
  on public.automation_versions(automation_id);

create table if not exists public.automation_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.automation_runs(id) on delete cascade,
  node_id text not null,
  node_type text not null,
  node_label text,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'success', 'error', 'skipped')),
  input_data jsonb default '{}',
  output_data jsonb default '{}',
  config_used jsonb default '{}',
  variables_resolved jsonb default '{}',
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  error_message text,
  error_details jsonb,
  step_order integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_run_steps_run on public.automation_run_steps(run_id);
create index if not exists idx_run_steps_status on public.automation_run_steps(status);

create table if not exists public.automation_pending_steps (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references public.automation_runs(id) on delete cascade,
  node_id text not null,
  scheduled_for timestamptz not null,
  context jsonb default '{}',
  status text default 'pending'
    check (status in ('pending', 'processing', 'completed', 'cancelled')),
  qstash_message_id text,
  lock_token uuid,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz default now()
);

create index if not exists idx_pending_steps_scheduled
  on public.automation_pending_steps(scheduled_for);
create index if not exists idx_pending_steps_status
  on public.automation_pending_steps(status);
create index if not exists idx_pending_steps_run
  on public.automation_pending_steps(run_id);
create index if not exists automation_pending_steps_locked_idx
  on public.automation_pending_steps(locked_at) where lock_token is not null;

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

create table if not exists public.whatsapp_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.whatsapp_campaigns(id) on delete cascade,
  contact_id uuid,
  phone_number varchar(20) not null,
  contact_name varchar(255),
  status varchar(20) default 'pending'
    check (status in (
      'pending', 'queued', 'sending', 'sent', 'delivered', 'read', 'clicked', 'replied',
      'failed', 'skipped'
    )),
  queued_at timestamptz,
  sending_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  clicked_at timestamptz,
  replied_at timestamptz,
  failed_at timestamptz,
  opted_out_at timestamptz,
  error_code varchar(50),
  error_message text,
  retry_count integer default 0,
  message_id uuid,
  meta_message_id varchar(255),
  resolved_variables jsonb default '{}',
  conversion_value numeric(12,2),
  conversion_order_id varchar(255),
  converted_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_recipients_campaign
  on public.whatsapp_campaign_recipients(campaign_id);
create index if not exists idx_recipients_status
  on public.whatsapp_campaign_recipients(status);
create index if not exists idx_recipients_meta_msg
  on public.whatsapp_campaign_recipients(meta_message_id);

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

create table if not exists public.email_clicks (
  id uuid primary key default gen_random_uuid(),
  email_send_id uuid not null references public.email_sends(id) on delete cascade,
  url text not null,
  clicked_at timestamptz default now(),
  user_agent text,
  ip_address text
);

create index if not exists idx_email_clicks_send on public.email_clicks(email_send_id);
create index if not exists idx_email_clicks_at on public.email_clicks(clicked_at);

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
