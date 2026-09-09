-- Synthetic legacy application schema. Test data only; no production values.

create table public.organization_members (
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

create table public.pipelines (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  name text not null,
  description text,
  color text default '#8b5cf6',
  position integer default 0,
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.pipeline_stages (
  id uuid primary key default uuid_generate_v4(),
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null,
  color text default '#8b5cf6',
  position integer not null default 0,
  probability integer default 50,
  created_at timestamptz default now()
);

create table public.automations (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  name text not null,
  description text,
  status text default 'draft'
    check (status in ('draft', 'active', 'paused', 'archived')),
  trigger_type text not null,
  trigger_config jsonb default '{}'::jsonb,
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

create table public.automation_runs (
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
  retry_count integer default 0,
  metadata jsonb default '{}'::jsonb,
  trigger_data jsonb default '{}'::jsonb,
  lock_token uuid,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz default now()
);

create table public.email_campaigns (
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

create table public.whatsapp_campaigns (
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

create table public.sms_campaigns (
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

create table public.email_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.email_campaigns(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  automation_id uuid,
  automation_run_id uuid,
  flow_id uuid,
  node_id text,
  email_template_id uuid,
  email text not null,
  from_email text,
  subject text,
  status text default 'pending'
    check (status in ('queued', 'pending', 'sent', 'delivered', 'opened', 'clicked',
      'bounced', 'failed', 'unsubscribed', 'complained')),
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  unsubscribed_at timestamptz,
  open_count integer default 0,
  click_count integer default 0,
  bounce_type text,
  bounce_message text,
  error_message text,
  provider text,
  provider_message_id text,
  resend_id text,
  ip_address text,
  user_agent text,
  conversion_value numeric(12,2) default 0,
  converted_at timestamptz,
  order_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.whatsapp_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  campaign_id uuid references public.whatsapp_campaigns(id) on delete set null,
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

create table public.sms_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  campaign_id uuid references public.sms_campaigns(id) on delete set null,
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

create table public.product_feeds (
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

insert into public.organizations (id, name, slug, settings, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000001', 'Legacy Fixture', 'legacy-fixture',
        '{"fixture":true}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

insert into public.contacts
  (id, organization_id, email, phone, first_name, last_name, custom_fields,
   created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000001', 'contact@example.test', '+15550000002',
   'Legacy', 'Contact', '{"source":"fixture"}',
   '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z');

insert into public.organization_members
  (id, organization_id, user_id, role, email, name, status, invited_at, created_at)
values
  ('00000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-000000000001', null, 'member',
   'invitee@example.test', 'Invited Member', 'invited',
   '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z');

insert into public.pipelines
  (id, organization_id, store_id, name, description, color, position, is_default,
   created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000004',
   '00000000-0000-4000-8000-000000000001', null, 'Legacy Pipeline',
   'Fixture pipeline', '#123456', 4, true,
   '2026-01-04T00:00:00Z', '2026-01-04T00:00:00Z');

insert into public.pipeline_stages
  (id, pipeline_id, name, color, position, probability, created_at)
values
  ('00000000-0000-4000-8000-000000000005',
   '00000000-0000-4000-8000-000000000004', 'Legacy Stage', '#654321', 2, 65,
   '2026-01-05T00:00:00Z');

insert into public.automations
  (id, organization_id, name, description, status, trigger_type, trigger_config,
   nodes, edges, total_runs, successful_runs, failed_runs, total_revenue,
   created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000006',
   '00000000-0000-4000-8000-000000000001', 'Legacy Automation',
   'Fixture automation', 'active', 'contact_created', '{"kind":"fixture"}',
   '[{"id":"start"}]', '[{"from":"start","to":"end"}]', 9, 6, 3, 42.50,
   '2026-01-06T00:00:00Z', '2026-01-06T00:00:00Z');

insert into public.automation_runs
  (id, automation_id, organization_id, contact_id, trigger_type, status,
   current_node_id, waiting_until, started_at, result, node_results, retry_count,
   metadata, trigger_data, lock_token, locked_at, locked_by, created_at)
values
  ('00000000-0000-4000-8000-000000000007',
   '00000000-0000-4000-8000-000000000006',
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000002', 'manual', 'pending', 'start', null,
   '2026-01-07T00:00:00Z', '{"outcome":"pending"}', '{"start":"queued"}', 2,
   '{"fixture":7}', '{"event":"pending"}',
   '00000000-0000-4000-8000-000000000107', '2026-01-07T00:01:00Z', 'worker-7',
   '2026-01-07T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000008',
   '00000000-0000-4000-8000-000000000006',
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000002', 'delay', 'waiting', 'delay-1',
   '2026-01-09T00:00:00Z', '2026-01-08T00:00:00Z', '{"outcome":"waiting"}',
   '{"delay-1":"waiting"}', 1, '{"fixture":8}', '{"event":"waiting"}',
   '00000000-0000-4000-8000-000000000108', '2026-01-08T00:01:00Z', 'worker-8',
   '2026-01-08T00:00:00Z');

insert into public.email_campaigns
  (id, organization_id, name, subject, status, total_recipients, total_sent,
   total_opened, total_clicked, opens, clicks, settings, metadata, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000009',
   '00000000-0000-4000-8000-000000000001', 'Legacy Email', 'Fixture subject',
   'scheduled', 20, 18, 7, 3, 8, 4, '{"mode":"legacy"}', '{"fixture":9}',
   '2026-01-09T00:00:00Z', '2026-01-09T00:00:00Z');

insert into public.whatsapp_campaigns
  (id, organization_id, name, title, campaign_id, status, template_name,
   template_variables, body_variables, audience_count, total_recipients,
   total_sent, total_delivered, sent_count, delivered_count, read_count,
   failed_count, replied_count, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000010',
   '00000000-0000-4000-8000-000000000001', 'Modern Campaign', null, null,
   'scheduled', 'modern_fixture', '{"first_name":"Legacy"}', '["Legacy"]',
   11, 11, 5, 4, 0, 0, 0, 0, 0,
   '2026-01-10T00:00:00Z', '2026-01-10T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000011',
   '00000000-0000-4000-8000-000000000001', null, 'Legacy Campaign', 'legacy-11',
   'RUNNING', 'legacy_fixture', '{}', '["Legacy"]', 0, 0, 0, 0, 7, 6, 5, 2, 1,
   '2026-01-11T00:00:00Z', '2026-01-11T00:00:00Z');

insert into public.sms_campaigns
  (id, organization_id, name, status, message_body, audience_count, sent_count,
   delivered_count, failed_count, replied_count, revenue, conversions,
   created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000012',
   '00000000-0000-4000-8000-000000000001', 'Legacy SMS', 'draft',
   'Fixture message', 6, 5, 4, 1, 2, 12.34, 1,
   '2026-01-12T00:00:00Z', '2026-01-12T00:00:00Z');

insert into public.email_sends
  (id, organization_id, campaign_id, contact_id, automation_id, automation_run_id,
   flow_id, node_id, email, from_email, subject, status, open_count, click_count,
   provider, provider_message_id, resend_id, metadata, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000013',
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000009',
   '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000006',
   '00000000-0000-4000-8000-000000000007',
   '00000000-0000-4000-8000-000000000006', 'email-1', 'recipient@example.test',
   'sender@example.test', 'Legacy pending', 'pending', 3, 1, 'fixture', 'msg-13',
   'resend-13', '{"fixture":13}', '2026-01-13T00:00:00Z', '2026-01-13T00:00:00Z');

insert into public.whatsapp_sends
  (id, organization_id, contact_id, campaign_id, automation_id, automation_run_id,
   flow_id, node_id, phone_number, message_body, template_name, template_params,
   status, external_message_id, metadata, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000014',
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000010',
   '00000000-0000-4000-8000-000000000006',
   '00000000-0000-4000-8000-000000000007',
   '00000000-0000-4000-8000-000000000006', 'wa-1', '+15550000014',
   'Fixture WhatsApp', 'modern_fixture', '["Legacy"]', 'sent', 'wamid-14',
   '{"fixture":14}', '2026-01-14T00:00:00Z', '2026-01-14T00:00:00Z');

insert into public.sms_sends
  (id, organization_id, contact_id, campaign_id, automation_id, automation_run_id,
   flow_id, node_id, phone_number, message_body, status, external_message_id,
   metadata, created_at, updated_at)
values
  ('00000000-0000-4000-8000-000000000015',
   '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000012',
   '00000000-0000-4000-8000-000000000006',
   '00000000-0000-4000-8000-000000000008',
   '00000000-0000-4000-8000-000000000006', 'sms-1', '+15550000015',
   'Fixture SMS', 'delivered', 'sms-15', '{"fixture":15}',
   '2026-01-15T00:00:00Z', '2026-01-15T00:00:00Z');
