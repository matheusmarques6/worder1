begin;

set local search_path = public, extensions;
set local lock_timeout = '5s';

-- Fixed, executable contract matrix. It is deliberately local to this
-- transaction: callers cannot supply schema SQL, exclusions or mappings.
create temporary table app_baseline_columns (
  table_name text not null,
  column_name text not null,
  pg_type text not null,
  nullable boolean not null,
  default_sql text,
  primary key (table_name, column_name)
) on commit drop;

insert into app_baseline_columns values
  ('organization_members', 'id', 'uuid', false, 'uuid_generate_v4()'),
  ('organization_members', 'organization_id', 'uuid', false, null),
  ('organization_members', 'user_id', 'uuid', true, null),
  ('organization_members', 'role', 'user_role', true, '''member''::user_role'),
  ('organization_members', 'email', 'text', true, null),
  ('organization_members', 'name', 'text', true, null),
  ('organization_members', 'status', 'text', true, '''active''::text'),
  ('organization_members', 'invited_by', 'uuid', true, null),
  ('organization_members', 'invited_at', 'timestamp with time zone', true, 'now()'),
  ('organization_members', 'joined_at', 'timestamp with time zone', true, null),
  ('organization_members', 'created_at', 'timestamp with time zone', true, 'now()'),
  ('pipelines', 'id', 'uuid', false, 'uuid_generate_v4()'),
  ('pipelines', 'organization_id', 'uuid', false, null),
  ('pipelines', 'store_id', 'uuid', true, null),
  ('pipelines', 'name', 'text', false, null),
  ('pipelines', 'description', 'text', true, null),
  ('pipelines', 'color', 'text', true, '''#8b5cf6''::text'),
  ('pipelines', 'position', 'integer', true, '0'),
  ('pipelines', 'automation_rules_count', 'integer', true, '0'),
  ('pipelines', 'is_default', 'boolean', true, 'false'),
  ('pipelines', 'has_active_automations', 'boolean', true, 'false'),
  ('pipelines', 'created_at', 'timestamp with time zone', true, 'now()'),
  ('pipelines', 'updated_at', 'timestamp with time zone', true, 'now()'),
  ('pipeline_stages', 'id', 'uuid', false, 'uuid_generate_v4()'),
  ('pipeline_stages', 'pipeline_id', 'uuid', false, null),
  ('pipeline_stages', 'name', 'text', false, null),
  ('pipeline_stages', 'color', 'text', true, '''#8b5cf6''::text'),
  ('pipeline_stages', 'position', 'integer', false, '0'),
  ('pipeline_stages', 'probability', 'integer', true, '50'),
  ('pipeline_stages', 'is_won', 'boolean', true, 'false'),
  ('pipeline_stages', 'is_lost', 'boolean', true, 'false'),
  ('pipeline_stages', 'created_at', 'timestamp with time zone', true, 'now()'),
  ('automations', 'id', 'uuid', false, 'uuid_generate_v4()'),
  ('automations', 'organization_id', 'uuid', false, null),
  ('automations', 'store_id', 'uuid', true, null),
  ('automations', 'created_by', 'uuid', true, null),
  ('automations', 'name', 'text', false, null),
  ('automations', 'description', 'text', true, null),
  ('automations', 'status', 'text', true, '''draft''::text'),
  ('automations', 'trigger_type', 'text', false, null),
  ('automations', 'trigger_config', 'jsonb', true, '''{}''::jsonb'),
  ('automations', 'trigger_filters', 'jsonb', true, '''[]''::jsonb'),
  ('automations', 'audience_filters', 'jsonb', true, '''[]''::jsonb'),
  ('automations', 'exit_conditions', 'jsonb', true, '''[]''::jsonb'),
  ('automations', 'frequency_config', 'jsonb', true, '''{"type": "once"}''::jsonb'),
  ('automations', 'nodes', 'jsonb', true, '''[]''::jsonb'),
  ('automations', 'edges', 'jsonb', true, '''[]''::jsonb'),
  ('automations', 'total_runs', 'integer', true, '0'),
  ('automations', 'successful_runs', 'integer', true, '0'),
  ('automations', 'failed_runs', 'integer', true, '0'),
  ('automations', 'conversions', 'integer', true, '0'),
  ('automations', 'total_revenue', 'numeric(12,2)', true, '0'),
  ('automations', 'attributed_revenue', 'numeric', true, '0'),
  ('automations', 'recipient_revenue', 'numeric', true, '0'),
  ('automations', 'last_run_at', 'timestamp with time zone', true, null),
  ('automations', 'activated_at', 'timestamp with time zone', true, null),
  ('automations', 'paused_at', 'timestamp with time zone', true, null),
  ('automations', 'created_at', 'timestamp with time zone', true, 'now()'),
  ('automations', 'updated_at', 'timestamp with time zone', true, 'now()'),
  ('automation_runs', 'id', 'uuid', false, 'uuid_generate_v4()'),
  ('automation_runs', 'automation_id', 'uuid', false, null),
  ('automation_runs', 'organization_id', 'uuid', true, null),
  ('automation_runs', 'contact_id', 'uuid', true, null),
  ('automation_runs', 'deal_id', 'uuid', true, null),
  ('automation_runs', 'trigger_event_id', 'uuid', true, null),
  ('automation_runs', 'lock_token', 'uuid', true, null),
  ('automation_runs', 'status', 'text', true, '''pending''::text'),
  ('automation_runs', 'current_node_id', 'text', true, null),
  ('automation_runs', 'trigger_type', 'text', true, null),
  ('automation_runs', 'error_message', 'text', true, null),
  ('automation_runs', 'error_node_id', 'text', true, null),
  ('automation_runs', 'last_error', 'text', true, null),
  ('automation_runs', 'locked_by', 'text', true, null),
  ('automation_runs', 'retry_count', 'integer', true, '0'),
  ('automation_runs', 'result', 'jsonb', true, '''{}''::jsonb'),
  ('automation_runs', 'node_results', 'jsonb', true, '''{}''::jsonb'),
  ('automation_runs', 'metadata', 'jsonb', true, '''{}''::jsonb'),
  ('automation_runs', 'trigger_data', 'jsonb', true, '''{}''::jsonb'),
  ('automation_runs', 'resume_data', 'jsonb', true, null),
  ('automation_runs', 'waiting_until', 'timestamp with time zone', true, null),
  ('automation_runs', 'completed_at', 'timestamp with time zone', true, null),
  ('automation_runs', 'locked_at', 'timestamp with time zone', true, null),
  ('automation_runs', 'last_heartbeat_at', 'timestamp with time zone', true, null),
  ('automation_runs', 'resume_at', 'timestamp with time zone', true, null),
  ('automation_runs', 'started_at', 'timestamp with time zone', true, 'now()'),
  ('automation_runs', 'created_at', 'timestamp with time zone', true, 'now()'),
  ('automation_runs', 'updated_at', 'timestamp with time zone', true, 'now()'),
  ('email_campaigns', 'id', 'uuid', false, 'gen_random_uuid()'),
  ('email_campaigns', 'organization_id', 'uuid', false, null),
  ('email_campaigns', 'store_id', 'uuid', true, null),
  ('email_campaigns', 'template_id', 'uuid', true, null),
  ('email_campaigns', 'list_id', 'uuid', true, null),
  ('email_campaigns', 'segment_id', 'uuid', true, null),
  ('email_campaigns', 'created_by', 'uuid', true, null),
  ('email_campaigns', 'name', 'text', false, null),
  ('email_campaigns', 'subject', 'text', true, null),
  ('email_campaigns', 'from_name', 'text', true, null),
  ('email_campaigns', 'from_email', 'text', true, null),
  ('email_campaigns', 'sender_name', 'text', true, null),
  ('email_campaigns', 'reply_to', 'text', true, null),
  ('email_campaigns', 'html_content', 'text', true, null),
  ('email_campaigns', 'text_content', 'text', true, null),
  ('email_campaigns', 'status', 'text', true, '''draft''::text'),
  ('email_campaigns', 'total_recipients', 'integer', true, '0'),
  ('email_campaigns', 'total_sent', 'integer', true, '0'),
  ('email_campaigns', 'total_delivered', 'integer', true, '0'),
  ('email_campaigns', 'total_opened', 'integer', true, '0'),
  ('email_campaigns', 'total_clicked', 'integer', true, '0'),
  ('email_campaigns', 'total_bounced', 'integer', true, '0'),
  ('email_campaigns', 'total_unsubscribed', 'integer', true, '0'),
  ('email_campaigns', 'total_complained', 'integer', true, '0'),
  ('email_campaigns', 'total_failed', 'integer', true, '0'),
  ('email_campaigns', 'opens', 'integer', true, '0'),
  ('email_campaigns', 'clicks', 'integer', true, '0'),
  ('email_campaigns', 'bounces', 'integer', true, '0'),
  ('email_campaigns', 'unsubscribes', 'integer', true, '0'),
  ('email_campaigns', 'conversions', 'integer', true, '0'),
  ('email_campaigns', 'revenue', 'numeric(12,2)', true, '0'),
  ('email_campaigns', 'attributed_revenue', 'numeric(12,2)', true, '0'),
  ('email_campaigns', 'recipient_revenue', 'numeric', true, '0'),
  ('email_campaigns', 'open_rate', 'numeric(5,2)', true, '0'),
  ('email_campaigns', 'click_rate', 'numeric(5,2)', true, '0'),
  ('email_campaigns', 'bounce_rate', 'numeric(5,2)', true, '0'),
  ('email_campaigns', 'settings', 'jsonb', true, '''{}''::jsonb'),
  ('email_campaigns', 'metadata', 'jsonb', true, '''{}''::jsonb'),
  ('email_campaigns', 'scheduled_at', 'timestamp with time zone', true, null),
  ('email_campaigns', 'sent_at', 'timestamp with time zone', true, null),
  ('email_campaigns', 'completed_at', 'timestamp with time zone', true, null),
  ('email_campaigns', 'created_at', 'timestamp with time zone', true, 'now()'),
  ('email_campaigns', 'updated_at', 'timestamp with time zone', true, 'now()'),
  ('email_campaigns', 'timezone_mode', 'text', false, '''fixed''::text'),
  ('whatsapp_campaigns', 'id', 'uuid', false, 'gen_random_uuid()'),
  ('whatsapp_campaigns', 'organization_id', 'uuid', false, null),
  ('whatsapp_campaigns', 'store_id', 'uuid', true, null),
  ('whatsapp_campaigns', 'instance_id', 'uuid', true, null),
  ('whatsapp_campaigns', 'template_id', 'uuid', true, null),
  ('whatsapp_campaigns', 'audience_segment_id', 'uuid', true, null),
  ('whatsapp_campaigns', 'audience_phonebook_id', 'uuid', true, null),
  ('whatsapp_campaigns', 'phonebook_id', 'uuid', true, null),
  ('whatsapp_campaigns', 'created_by', 'uuid', true, null),
  ('whatsapp_campaigns', 'updated_by', 'uuid', true, null),
  ('whatsapp_campaigns', 'name', 'text', true, null),
  ('whatsapp_campaigns', 'title', 'text', true, null),
  ('whatsapp_campaigns', 'campaign_id', 'text', true, null),
  ('whatsapp_campaigns', 'description', 'text', true, null),
  ('whatsapp_campaigns', 'template_name', 'text', true, null),
  ('whatsapp_campaigns', 'media_url', 'text', true, null),
  ('whatsapp_campaigns', 'media_type', 'text', true, null),
  ('whatsapp_campaigns', 'created_by_name', 'text', true, null),
  ('whatsapp_campaigns', 'type', 'text', true, '''broadcast''::text'),
  ('whatsapp_campaigns', 'status', 'text', true, '''draft''::text'),
  ('whatsapp_campaigns', 'template_language', 'text', true, '''pt_BR''::text'),
  ('whatsapp_campaigns', 'audience_type', 'text', true, '''all''::text'),
  ('whatsapp_campaigns', 'audience_tags', 'text[]', true, null),
  ('whatsapp_campaigns', 'template_variables', 'jsonb', true, '''{}''::jsonb'),
  ('whatsapp_campaigns', 'audience_filters', 'jsonb', true, '''{}''::jsonb'),
  ('whatsapp_campaigns', 'body_variables', 'jsonb', true, '''[]''::jsonb'),
  ('whatsapp_campaigns', 'button_variables', 'jsonb', true, '''[]''::jsonb'),
  ('whatsapp_campaigns', 'imported_contacts', 'jsonb', true, null),
  ('whatsapp_campaigns', 'header_variable', 'jsonb', true, null),
  ('whatsapp_campaigns', 'timezone', 'text', true, '''America/Sao_Paulo''::text'),
  ('whatsapp_campaigns', 'messages_per_second', 'integer', true, '10'),
  ('whatsapp_campaigns', 'batch_size', 'integer', true, '100'),
  ('whatsapp_campaigns', 'delay_between_batches', 'integer', true, '1000'),
  ('whatsapp_campaigns', 'send_interval_ms', 'integer', true, '1000'),
  ('whatsapp_campaigns', 'audience_count', 'integer', true, '0'),
  ('whatsapp_campaigns', 'total_recipients', 'integer', true, '0'),
  ('whatsapp_campaigns', 'total_contacts', 'integer', true, '0'),
  ('whatsapp_campaigns', 'total_sent', 'integer', true, '0'),
  ('whatsapp_campaigns', 'total_delivered', 'integer', true, '0'),
  ('whatsapp_campaigns', 'total_read', 'integer', true, '0'),
  ('whatsapp_campaigns', 'total_clicked', 'integer', true, '0'),
  ('whatsapp_campaigns', 'total_replied', 'integer', true, '0'),
  ('whatsapp_campaigns', 'total_failed', 'integer', true, '0'),
  ('whatsapp_campaigns', 'total_opted_out', 'integer', true, '0'),
  ('whatsapp_campaigns', 'sent_count', 'integer', true, '0'),
  ('whatsapp_campaigns', 'delivered_count', 'integer', true, '0'),
  ('whatsapp_campaigns', 'read_count', 'integer', true, '0'),
  ('whatsapp_campaigns', 'failed_count', 'integer', true, '0'),
  ('whatsapp_campaigns', 'replied_count', 'integer', true, '0'),
  ('whatsapp_campaigns', 'attributed_orders', 'integer', true, '0'),
  ('whatsapp_campaigns', 'conversions', 'integer', true, '0'),
  ('whatsapp_campaigns', 'attribution_window_hours', 'integer', true, '72'),
  ('whatsapp_campaigns', 'revenue', 'numeric(12,2)', true, '0'),
  ('whatsapp_campaigns', 'attributed_revenue', 'numeric(12,2)', true, '0'),
  ('whatsapp_campaigns', 'total_cost', 'numeric(12,2)', true, '0'),
  ('whatsapp_campaigns', 'recipient_revenue', 'numeric', true, '0'),
  ('whatsapp_campaigns', 'cost_per_message', 'numeric(6,4)', true, '0.05'),
  ('whatsapp_campaigns', 'scheduled_at', 'timestamp with time zone', true, null),
  ('whatsapp_campaigns', 'started_at', 'timestamp with time zone', true, null),
  ('whatsapp_campaigns', 'completed_at', 'timestamp with time zone', true, null),
  ('whatsapp_campaigns', 'paused_at', 'timestamp with time zone', true, null),
  ('whatsapp_campaigns', 'created_at', 'timestamp with time zone', true, 'now()'),
  ('whatsapp_campaigns', 'updated_at', 'timestamp with time zone', true, 'now()'),
  ('sms_campaigns', 'id', 'uuid', false, 'gen_random_uuid()'),
  ('sms_campaigns', 'organization_id', 'uuid', false, null),
  ('sms_campaigns', 'store_id', 'uuid', true, null),
  ('sms_campaigns', 'name', 'text', false, null),
  ('sms_campaigns', 'status', 'text', true, '''draft''::text'),
  ('sms_campaigns', 'message_body', 'text', true, null),
  ('sms_campaigns', 'audience_count', 'integer', true, '0'),
  ('sms_campaigns', 'sent_count', 'integer', true, '0'),
  ('sms_campaigns', 'delivered_count', 'integer', true, '0'),
  ('sms_campaigns', 'failed_count', 'integer', true, '0'),
  ('sms_campaigns', 'replied_count', 'integer', true, '0'),
  ('sms_campaigns', 'conversions', 'integer', true, '0'),
  ('sms_campaigns', 'revenue', 'numeric(12,2)', true, '0'),
  ('sms_campaigns', 'attributed_revenue', 'numeric', true, '0'),
  ('sms_campaigns', 'recipient_revenue', 'numeric', true, '0'),
  ('sms_campaigns', 'scheduled_at', 'timestamp with time zone', true, null),
  ('sms_campaigns', 'started_at', 'timestamp with time zone', true, null),
  ('sms_campaigns', 'completed_at', 'timestamp with time zone', true, null),
  ('sms_campaigns', 'created_at', 'timestamp with time zone', false, 'now()'),
  ('sms_campaigns', 'updated_at', 'timestamp with time zone', false, 'now()'),
  ('email_sends', 'id', 'uuid', false, 'gen_random_uuid()'),
  ('email_sends', 'organization_id', 'uuid', false, null),
  ('email_sends', 'campaign_id', 'uuid', true, null),
  ('email_sends', 'contact_id', 'uuid', true, null),
  ('email_sends', 'store_id', 'uuid', true, null),
  ('email_sends', 'automation_id', 'uuid', true, null),
  ('email_sends', 'automation_run_id', 'uuid', true, null),
  ('email_sends', 'flow_id', 'uuid', true, null),
  ('email_sends', 'email_template_id', 'uuid', true, null),
  ('email_sends', 'email', 'text', false, null),
  ('email_sends', 'to_email', 'text', true, null),
  ('email_sends', 'from_email', 'text', true, null),
  ('email_sends', 'sender_email', 'text', true, null),
  ('email_sends', 'subject', 'text', true, null),
  ('email_sends', 'provider', 'text', true, null),
  ('email_sends', 'resend_id', 'text', true, null),
  ('email_sends', 'provider_message_id', 'text', true, null),
  ('email_sends', 'dedupe_key', 'text', true, null),
  ('email_sends', 'node_id', 'text', true, null),
  ('email_sends', 'bounce_type', 'text', true, null),
  ('email_sends', 'bounce_message', 'text', true, null),
  ('email_sends', 'error_message', 'text', true, null),
  ('email_sends', 'ip_address', 'text', true, null),
  ('email_sends', 'user_agent', 'text', true, null),
  ('email_sends', 'order_id', 'text', true, null),
  ('email_sends', 'ab_variant', 'text', true, null),
  ('email_sends', 'isp_domain', 'text', true, null),
  ('email_sends', 'status', 'text', true, '''queued''::text'),
  ('email_sends', 'sent_at', 'timestamp with time zone', true, null),
  ('email_sends', 'delivered_at', 'timestamp with time zone', true, null),
  ('email_sends', 'opened_at', 'timestamp with time zone', true, null),
  ('email_sends', 'mpp_opened_at', 'timestamp with time zone', true, null),
  ('email_sends', 'clicked_at', 'timestamp with time zone', true, null),
  ('email_sends', 'bounced_at', 'timestamp with time zone', true, null),
  ('email_sends', 'failed_at', 'timestamp with time zone', true, null),
  ('email_sends', 'unsubscribed_at', 'timestamp with time zone', true, null),
  ('email_sends', 'complained_at', 'timestamp with time zone', true, null),
  ('email_sends', 'converted_at', 'timestamp with time zone', true, null),
  ('email_sends', 'open_count', 'integer', true, '0'),
  ('email_sends', 'click_count', 'integer', true, '0'),
  ('email_sends', 'conversion_value', 'numeric(12,2)', true, '0'),
  ('email_sends', 'metadata', 'jsonb', true, '''{}''::jsonb'),
  ('email_sends', 'created_at', 'timestamp with time zone', true, 'now()'),
  ('email_sends', 'updated_at', 'timestamp with time zone', true, 'now()'),
  ('whatsapp_sends', 'id', 'uuid', false, 'gen_random_uuid()'),
  ('whatsapp_sends', 'organization_id', 'uuid', false, null),
  ('whatsapp_sends', 'contact_id', 'uuid', true, null),
  ('whatsapp_sends', 'campaign_id', 'uuid', true, null),
  ('whatsapp_sends', 'store_id', 'uuid', true, null),
  ('whatsapp_sends', 'automation_id', 'uuid', true, null),
  ('whatsapp_sends', 'automation_run_id', 'uuid', true, null),
  ('whatsapp_sends', 'flow_id', 'uuid', true, null),
  ('whatsapp_sends', 'phone_number', 'text', false, null),
  ('whatsapp_sends', 'node_id', 'text', true, null),
  ('whatsapp_sends', 'message_body', 'text', true, null),
  ('whatsapp_sends', 'template_name', 'text', true, null),
  ('whatsapp_sends', 'media_url', 'text', true, null),
  ('whatsapp_sends', 'error_message', 'text', true, null),
  ('whatsapp_sends', 'order_id', 'text', true, null),
  ('whatsapp_sends', 'external_message_id', 'text', true, null),
  ('whatsapp_sends', 'template_params', 'jsonb', true, null),
  ('whatsapp_sends', 'status', 'text', false, '''pending''::text'),
  ('whatsapp_sends', 'sent_at', 'timestamp with time zone', true, null),
  ('whatsapp_sends', 'delivered_at', 'timestamp with time zone', true, null),
  ('whatsapp_sends', 'read_at', 'timestamp with time zone', true, null),
  ('whatsapp_sends', 'replied_at', 'timestamp with time zone', true, null),
  ('whatsapp_sends', 'failed_at', 'timestamp with time zone', true, null),
  ('whatsapp_sends', 'converted_at', 'timestamp with time zone', true, null),
  ('whatsapp_sends', 'conversion_value', 'numeric(12,2)', true, '0'),
  ('whatsapp_sends', 'metadata', 'jsonb', true, '''{}''::jsonb'),
  ('whatsapp_sends', 'created_at', 'timestamp with time zone', false, 'now()'),
  ('whatsapp_sends', 'updated_at', 'timestamp with time zone', false, 'now()'),
  ('sms_sends', 'id', 'uuid', false, 'gen_random_uuid()'),
  ('sms_sends', 'organization_id', 'uuid', false, null),
  ('sms_sends', 'contact_id', 'uuid', true, null),
  ('sms_sends', 'campaign_id', 'uuid', true, null),
  ('sms_sends', 'store_id', 'uuid', true, null),
  ('sms_sends', 'automation_id', 'uuid', true, null),
  ('sms_sends', 'automation_run_id', 'uuid', true, null),
  ('sms_sends', 'flow_id', 'uuid', true, null),
  ('sms_sends', 'phone_number', 'text', false, null),
  ('sms_sends', 'node_id', 'text', true, null),
  ('sms_sends', 'error_message', 'text', true, null),
  ('sms_sends', 'order_id', 'text', true, null),
  ('sms_sends', 'external_message_id', 'text', true, null),
  ('sms_sends', 'message_body', 'text', false, '''''::text'),
  ('sms_sends', 'status', 'text', false, '''pending''::text'),
  ('sms_sends', 'sent_at', 'timestamp with time zone', true, null),
  ('sms_sends', 'delivered_at', 'timestamp with time zone', true, null),
  ('sms_sends', 'clicked_at', 'timestamp with time zone', true, null),
  ('sms_sends', 'failed_at', 'timestamp with time zone', true, null),
  ('sms_sends', 'converted_at', 'timestamp with time zone', true, null),
  ('sms_sends', 'conversion_value', 'numeric(12,2)', true, '0'),
  ('sms_sends', 'metadata', 'jsonb', true, '''{}''::jsonb'),
  ('sms_sends', 'created_at', 'timestamp with time zone', false, 'now()'),
  ('sms_sends', 'updated_at', 'timestamp with time zone', false, 'now()');

do $$
declare
  labels text[];
begin
  if to_regtype('public.user_role') is null then
    raise exception 'app baseline incompatible: user_role.type';
  end if;

  select array_agg(e.enumlabel order by e.enumsortorder)
    into labels
    from pg_enum e
   where e.enumtypid = 'public.user_role'::regtype;

  if labels not in (array['owner', 'admin', 'member', 'analyst'],
                    array['owner', 'admin', 'member', 'agent', 'analyst']) then
    raise exception 'app baseline incompatible: user_role.values';
  end if;

  if not 'agent' = any(labels) then
    alter type public.user_role add value 'agent' before 'analyst';
  end if;
end
$$;

-- Refuse unknown existing shapes before applying any approved adjustment.
do $$
declare
  r record;
  actual_type text;
  actual_nullable boolean;
  actual_default text;
  has_rows boolean;
begin
  for r in select * from app_baseline_columns order by table_name, column_name loop
    if to_regclass('public.' || r.table_name) is null then
      continue;
    end if;

    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = r.table_name and c.relkind = 'r'
    ) then
      raise exception 'app baseline incompatible: %.relation_kind', r.table_name;
    end if;

    select format_type(a.atttypid, a.atttypmod), not a.attnotnull,
           pg_get_expr(d.adbin, d.adrelid)
      into actual_type, actual_nullable, actual_default
      from pg_attribute a
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = to_regclass('public.' || r.table_name)
       and a.attname = r.column_name and a.attnum > 0 and not a.attisdropped;

    if not found then
      if not r.nullable then
        execute format('select exists(select 1 from public.%I)', r.table_name)
           into has_rows;
        if has_rows then
          raise exception 'app baseline incompatible: %.%', r.table_name, r.column_name;
        end if;
      end if;
      continue;
    end if;

    if actual_type <> r.pg_type then
      raise exception 'app baseline incompatible: %.%.type', r.table_name, r.column_name;
    end if;

    if actual_nullable <> r.nullable
       and not (r.table_name = 'organization_members' and r.column_name = 'user_id'
                and not actual_nullable) then
      raise exception 'app baseline incompatible: %.%.nullability', r.table_name, r.column_name;
    end if;

    if actual_default is distinct from r.default_sql
       and not (r.table_name = 'email_sends' and r.column_name = 'status'
                and actual_default is not distinct from '''pending''::text')
       and not (r.table_name = 'automations' and r.column_name = 'frequency_config'
                and actual_default is null) then
      raise exception 'app baseline incompatible: %.%.default', r.table_name, r.column_name;
    end if;
  end loop;

  if exists (
    select 1
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in (select distinct table_name from app_baseline_columns)
       and a.attnum > 0 and not a.attisdropped
       and not exists (
         select 1 from app_baseline_columns e
          where e.table_name = c.relname and e.column_name = a.attname
       )
  ) then
    raise exception 'app baseline incompatible: scoped_columns.unknown';
  end if;
end
$$;

-- Missing relations are empty shells first; the fixed matrix supplies their
-- columns without backfilling any pre-existing row.
create table if not exists public.organization_members ();
create table if not exists public.pipelines ();
create table if not exists public.pipeline_stages ();
create table if not exists public.automations ();
create table if not exists public.automation_runs ();
create table if not exists public.email_campaigns ();
create table if not exists public.whatsapp_campaigns ();
create table if not exists public.sms_campaigns ();
create table if not exists public.email_sends ();
create table if not exists public.whatsapp_sends ();
create table if not exists public.sms_sends ();

do $$
declare
  r record;
  has_null boolean;
  ddl_type text;
begin
  for r in select * from app_baseline_columns order by table_name, column_name loop
    if not exists (
      select 1 from pg_attribute a
       where a.attrelid = to_regclass('public.' || r.table_name)
         and a.attname = r.column_name and a.attnum > 0 and not a.attisdropped
    ) then
      ddl_type := case when r.pg_type = 'user_role' then 'public.user_role' else r.pg_type end;
      execute format('alter table public.%I add column %I %s',
                     r.table_name, r.column_name, ddl_type);
    end if;

    if r.default_sql is not null then
      execute format('alter table public.%I alter column %I set default %s',
                     r.table_name, r.column_name, r.default_sql);
    end if;

    if not r.nullable then
      execute format('select exists(select 1 from public.%I where %I is null)',
                     r.table_name, r.column_name) into has_null;
      if has_null then
        raise exception 'app baseline incompatible: %.%.nullability',
                        r.table_name, r.column_name;
      end if;
      execute format('alter table public.%I alter column %I set not null',
                     r.table_name, r.column_name);
    end if;
  end loop;

  alter table public.organization_members alter column user_id drop not null;
end
$$;

create temporary table app_baseline_checks (
  table_name text not null,
  column_name text not null,
  allowed_values text[] not null,
  canonical_definition text not null,
  legacy_definitions text[] not null,
  primary key (table_name, column_name)
) on commit drop;

insert into app_baseline_checks values
  ('automations', 'status',
   array['draft', 'active', 'paused', 'archived'],
   'CHECK (status = ANY (ARRAY[''draft''::text, ''active''::text, ''paused''::text, ''archived''::text]))',
   array[]::text[]),
  ('automation_runs', 'status',
   array['pending', 'waiting', 'running', 'completed', 'failed', 'cancelled'],
   'CHECK (status = ANY (ARRAY[''pending''::text, ''waiting''::text, ''running''::text, ''completed''::text, ''failed''::text, ''cancelled''::text]))',
   array[
     'CHECK (status = ANY (ARRAY[''pending''::text, ''running''::text, ''completed''::text, ''failed''::text, ''cancelled''::text]))',
     'CHECK (status = ANY (ARRAY[''pending''::text, ''running''::text, ''success''::text, ''error''::text, ''waiting''::text, ''cancelled''::text]))',
     'CHECK (status = ANY (ARRAY[''running''::text, ''completed''::text, ''failed''::text, ''cancelled''::text]))'
   ]),
  ('email_campaigns', 'status',
   array['draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled', 'failed'],
   'CHECK (status = ANY (ARRAY[''draft''::text, ''scheduled''::text, ''sending''::text, ''sent''::text, ''paused''::text, ''cancelled''::text, ''failed''::text]))',
   array[
     'CHECK (status = ANY (ARRAY[''draft''::text, ''scheduled''::text, ''sending''::text, ''sent''::text, ''paused''::text, ''cancelled''::text]))'
   ]),
  ('email_campaigns', 'timezone_mode',
   array['fixed', 'recipient'],
   'CHECK (timezone_mode = ANY (ARRAY[''fixed''::text, ''recipient''::text]))',
   array[]::text[]),
  ('whatsapp_campaigns', 'status',
   array['draft', 'scheduled', 'pending', 'running', 'sending', 'sent', 'completed',
         'paused', 'cancelled', 'failed', 'PENDING', 'SCHEDULED', 'RUNNING', 'SENDING',
         'SENT', 'COMPLETED', 'PAUSED', 'CANCELLED', 'FAILED'],
   'CHECK (status = ANY (ARRAY[''draft''::text, ''scheduled''::text, ''pending''::text, ''running''::text, ''sending''::text, ''sent''::text, ''completed''::text, ''paused''::text, ''cancelled''::text, ''failed''::text, ''PENDING''::text, ''SCHEDULED''::text, ''RUNNING''::text, ''SENDING''::text, ''SENT''::text, ''COMPLETED''::text, ''PAUSED''::text, ''CANCELLED''::text, ''FAILED''::text]))',
   array[
     'CHECK (status = ANY (ARRAY[''draft''::text, ''scheduled''::text, ''pending''::text, ''running''::text, ''sending''::text, ''sent''::text, ''completed''::text, ''paused''::text, ''cancelled''::text, ''failed''::text]))',
     'CHECK (status = ANY (ARRAY[''PENDING''::text, ''SCHEDULED''::text, ''RUNNING''::text, ''SENDING''::text, ''SENT''::text, ''COMPLETED''::text, ''PAUSED''::text, ''CANCELLED''::text, ''FAILED''::text]))'
   ]),
  ('email_sends', 'status',
   array['queued', 'pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced',
         'failed', 'unsubscribed', 'complained'],
   'CHECK (status = ANY (ARRAY[''queued''::text, ''pending''::text, ''sent''::text, ''delivered''::text, ''opened''::text, ''clicked''::text, ''bounced''::text, ''failed''::text, ''unsubscribed''::text, ''complained''::text]))',
   array[
     'CHECK (status = ANY (ARRAY[''queued''::text, ''sent''::text, ''delivered''::text, ''opened''::text, ''clicked''::text, ''bounced''::text, ''failed''::text, ''unsubscribed''::text, ''complained''::text]))',
     'CHECK (status = ANY (ARRAY[''pending''::text, ''sent''::text, ''delivered''::text, ''opened''::text, ''clicked''::text, ''bounced''::text, ''failed''::text, ''unsubscribed''::text, ''complained''::text]))'
   ]),
  ('whatsapp_sends', 'status',
   array['pending', 'sent', 'delivered', 'read', 'replied', 'failed'],
   'CHECK (status = ANY (ARRAY[''pending''::text, ''sent''::text, ''delivered''::text, ''read''::text, ''replied''::text, ''failed''::text]))',
   array[]::text[]),
  ('sms_sends', 'status',
   array['pending', 'sent', 'delivered', 'clicked', 'failed', 'undelivered'],
   'CHECK (status = ANY (ARRAY[''pending''::text, ''sent''::text, ''delivered''::text, ''clicked''::text, ''failed''::text, ''undelivered''::text]))',
   array[]::text[]);

do $$
declare
  r record;
  c record;
  has_bad_data boolean;
  value_list text;
  constraint_name text;
begin
  for r in select * from app_baseline_checks order by table_name, column_name loop
    execute format(
      'select exists(select 1 from public.%I where %I is not null and not (%I = any($1)))',
      r.table_name, r.column_name, r.column_name
    ) into has_bad_data using r.allowed_values;

    if has_bad_data then
      raise exception 'app baseline incompatible: %.%', r.table_name, r.column_name;
    end if;

    for c in
      select k.conname, pg_get_constraintdef(k.oid, true) as definition
        from pg_constraint k
        join pg_attribute a
          on a.attrelid = k.conrelid and a.attnum = any(k.conkey)
       where k.conrelid = to_regclass('public.' || r.table_name)
         and k.contype = 'c' and a.attname = r.column_name
    loop
      if c.definition = r.canonical_definition then
        continue;
      end if;
      if c.definition = any(r.legacy_definitions) then
        execute format('alter table public.%I drop constraint %I',
                       r.table_name, c.conname);
      else
        raise exception 'app baseline incompatible: %.%.check',
                        r.table_name, r.column_name;
      end if;
    end loop;

    if not exists (
      select 1 from pg_constraint k
       where k.conrelid = to_regclass('public.' || r.table_name)
         and k.contype = 'c'
         and pg_get_constraintdef(k.oid, true) = r.canonical_definition
    ) then
      constraint_name := r.table_name || '_' || r.column_name || '_check';
      if exists (
        select 1 from pg_constraint k
         where k.conrelid = to_regclass('public.' || r.table_name)
           and k.conname = constraint_name
      ) then
        raise exception 'app baseline incompatible: %.%.check_name',
                        r.table_name, r.column_name;
      end if;
      select string_agg(quote_literal(v), ', ' order by ord)
        into value_list
        from unnest(r.allowed_values) with ordinality as x(v, ord);
      execute format('alter table public.%I add constraint %I check (%I in (%s))',
                     r.table_name, constraint_name, r.column_name, value_list);
    end if;
  end loop;
end
$$;

create temporary table app_baseline_constraints (
  table_name text not null,
  definition text not null,
  primary key (table_name, definition)
) on commit drop;

insert into app_baseline_constraints
select table_name, 'PRIMARY KEY (id)'
  from (values
    ('organization_members'), ('pipelines'), ('pipeline_stages'), ('automations'),
    ('automation_runs'), ('email_campaigns'), ('whatsapp_campaigns'), ('sms_campaigns'),
    ('email_sends'), ('whatsapp_sends'), ('sms_sends')
  ) as t(table_name);

insert into app_baseline_constraints values
  ('organization_members', 'UNIQUE (organization_id, user_id)');

insert into app_baseline_constraints
select table_name, canonical_definition from app_baseline_checks;

do $$
declare
  r record;
  c record;
  has_bad_data boolean;
begin
  for r in select distinct table_name from app_baseline_columns order by table_name loop
    select k.conname, pg_get_constraintdef(k.oid, true) as definition
      into c
      from pg_constraint k
     where k.conrelid = to_regclass('public.' || r.table_name) and k.contype = 'p';

    if found and c.definition <> 'PRIMARY KEY (id)' then
      raise exception 'app baseline incompatible: %.primary_key', r.table_name;
    end if;

    if not found then
      execute format(
        'select exists(select 1 from public.%I group by id having id is null or count(*) > 1)',
        r.table_name
      ) into has_bad_data;
      if has_bad_data then
        raise exception 'app baseline incompatible: %.primary_key', r.table_name;
      end if;
      execute format('alter table public.%I add constraint %I primary key (id)',
                     r.table_name, r.table_name || '_pkey');
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint k
     where k.conrelid = 'public.organization_members'::regclass
       and k.contype = 'u'
       and pg_get_constraintdef(k.oid, true) = 'UNIQUE (organization_id, user_id)'
  ) then
    select exists (
      select 1 from public.organization_members
       where user_id is not null
       group by organization_id, user_id having count(*) > 1
    ) into has_bad_data;
    if has_bad_data then
      raise exception 'app baseline incompatible: organization_members.organization_id_user_id';
    end if;
    alter table public.organization_members
      add constraint organization_members_organization_id_user_id_key
      unique (organization_id, user_id);
  end if;
end
$$;

create temporary table app_baseline_foreign_keys (
  table_name text not null,
  column_name text not null,
  target_table text not null,
  delete_action text not null,
  definition text not null,
  primary key (table_name, column_name)
) on commit drop;

insert into app_baseline_foreign_keys values
  ('organization_members', 'organization_id', 'organizations', 'cascade',
   'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('organization_members', 'user_id', 'profiles', 'cascade',
   'FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE'),
  ('organization_members', 'invited_by', 'profiles', '',
   'FOREIGN KEY (invited_by) REFERENCES profiles(id)'),
  ('pipelines', 'organization_id', 'organizations', 'cascade',
   'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('pipeline_stages', 'pipeline_id', 'pipelines', 'cascade',
   'FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE'),
  ('automations', 'organization_id', 'organizations', 'cascade',
   'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('automations', 'created_by', 'profiles', 'set null',
   'FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL'),
  ('automation_runs', 'automation_id', 'automations', 'cascade',
   'FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE'),
  ('automation_runs', 'contact_id', 'contacts', 'set null',
   'FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL'),
  ('email_campaigns', 'organization_id', 'organizations', 'cascade',
   'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('whatsapp_campaigns', 'organization_id', 'organizations', 'cascade',
   'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('whatsapp_campaigns', 'template_id', 'whatsapp_templates', '',
   'FOREIGN KEY (template_id) REFERENCES whatsapp_templates(id)'),
  ('whatsapp_campaigns', 'instance_id', 'whatsapp_instances', '',
   'FOREIGN KEY (instance_id) REFERENCES whatsapp_instances(id)'),
  ('sms_campaigns', 'organization_id', 'organizations', 'cascade',
   'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('email_sends', 'organization_id', 'organizations', 'cascade',
   'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('email_sends', 'campaign_id', 'email_campaigns', 'set null',
   'FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE SET NULL'),
  ('email_sends', 'contact_id', 'contacts', 'set null',
   'FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL'),
  ('whatsapp_sends', 'organization_id', 'organizations', 'cascade',
   'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('whatsapp_sends', 'campaign_id', 'whatsapp_campaigns', 'set null',
   'FOREIGN KEY (campaign_id) REFERENCES whatsapp_campaigns(id) ON DELETE SET NULL'),
  ('whatsapp_sends', 'contact_id', 'contacts', 'set null',
   'FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL'),
  ('sms_sends', 'organization_id', 'organizations', 'cascade',
   'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE'),
  ('sms_sends', 'campaign_id', 'sms_campaigns', 'set null',
   'FOREIGN KEY (campaign_id) REFERENCES sms_campaigns(id) ON DELETE SET NULL'),
  ('sms_sends', 'contact_id', 'contacts', 'set null',
   'FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL');

insert into app_baseline_constraints
select table_name, definition from app_baseline_foreign_keys;

do $$
declare
  r record;
  c record;
  has_orphan boolean;
  constraint_name text;
  delete_sql text;
begin
  for r in select * from app_baseline_foreign_keys order by table_name, column_name loop
    for c in
      select k.conname, pg_get_constraintdef(k.oid, true) as definition
        from pg_constraint k
        join pg_attribute a
          on a.attrelid = k.conrelid and a.attnum = any(k.conkey)
       where k.conrelid = to_regclass('public.' || r.table_name)
         and k.contype = 'f' and a.attname = r.column_name
    loop
      if c.definition <> r.definition then
        raise exception 'app baseline incompatible: %.%.foreign_key',
                        r.table_name, r.column_name;
      end if;
    end loop;

    if not exists (
      select 1 from pg_constraint k
       where k.conrelid = to_regclass('public.' || r.table_name)
         and k.contype = 'f' and pg_get_constraintdef(k.oid, true) = r.definition
    ) then
      execute format(
        'select exists(select 1 from public.%I s left join public.%I t on t.id = s.%I '
        || 'where s.%I is not null and t.id is null)',
        r.table_name, r.target_table, r.column_name, r.column_name
      ) into has_orphan;
      if has_orphan then
        raise exception 'app baseline incompatible: %.%.orphan',
                        r.table_name, r.column_name;
      end if;

      constraint_name := r.table_name || '_' || r.column_name || '_fkey';
      if exists (
        select 1 from pg_constraint k
         where k.conrelid = to_regclass('public.' || r.table_name)
           and k.conname = constraint_name
      ) then
        raise exception 'app baseline incompatible: %.%.foreign_key_name',
                        r.table_name, r.column_name;
      end if;
      delete_sql := case when r.delete_action = '' then ''
                         else ' on delete ' || r.delete_action end;
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) '
        || 'references public.%I(id)%s',
        r.table_name, constraint_name, r.column_name, r.target_table, delete_sql
      );
    end if;
  end loop;
end
$$;

-- From here on, the column contract is exact: legacy exceptions no longer apply.
do $$
declare
  r record;
  actual_type text;
  actual_nullable boolean;
  actual_default text;
begin
  for r in select * from app_baseline_columns order by table_name, column_name loop
    if to_regclass('public.' || r.table_name) is null then
      raise exception 'app baseline incompatible: %.missing', r.table_name;
    end if;

    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = r.table_name and c.relkind = 'r'
    ) then
      raise exception 'app baseline incompatible: %.relation_kind', r.table_name;
    end if;

    select format_type(a.atttypid, a.atttypmod), not a.attnotnull,
           pg_get_expr(d.adbin, d.adrelid)
      into actual_type, actual_nullable, actual_default
      from pg_attribute a
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = to_regclass('public.' || r.table_name)
       and a.attname = r.column_name and a.attnum > 0 and not a.attisdropped;

    if not found then
      raise exception 'app baseline incompatible: %.%', r.table_name, r.column_name;
    end if;

    if actual_type <> r.pg_type then
      raise exception 'app baseline incompatible: %.%.type', r.table_name, r.column_name;
    end if;

    if actual_nullable <> r.nullable then
      raise exception 'app baseline incompatible: %.%.nullability', r.table_name, r.column_name;
    end if;

    if actual_default is distinct from r.default_sql then
      raise exception 'app baseline incompatible: %.%.default', r.table_name, r.column_name;
    end if;
  end loop;

  if exists (
    select 1
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in (select distinct table_name from app_baseline_columns)
       and a.attnum > 0 and not a.attisdropped
       and not exists (
         select 1 from app_baseline_columns e
          where e.table_name = c.relname and e.column_name = a.attname
       )
  ) then
    raise exception 'app baseline incompatible: scoped_columns.unknown';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1 from app_baseline_constraints e
     where (
       select count(*)
         from pg_constraint k
        where k.conrelid = to_regclass('public.' || e.table_name)
          and k.contype in ('p', 'f', 'u', 'c')
          and pg_get_constraintdef(k.oid, true) = e.definition
     ) > 1
  ) then
    raise exception 'app baseline incompatible: scoped_constraints.multiplicity';
  end if;

  if exists (
    select 1
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in (select distinct table_name from app_baseline_columns)
       and k.contype in ('p', 'f', 'u', 'c')
       and not exists (
         select 1 from app_baseline_constraints e
          where e.table_name = c.relname
            and e.definition = pg_get_constraintdef(k.oid, true)
       )
  ) or exists (
    select 1 from app_baseline_constraints e
     where not exists (
       select 1
         from pg_constraint k
        where k.conrelid = to_regclass('public.' || e.table_name)
          and k.contype in ('p', 'f', 'u', 'c')
          and pg_get_constraintdef(k.oid, true) = e.definition
     )
  ) then
    raise exception 'app baseline incompatible: scoped_constraints.definition';
  end if;
end
$$;

create temporary table app_baseline_indexes (
  index_name text primary key,
  table_name text not null,
  keys text[] not null,
  is_unique boolean not null,
  predicate text
) on commit drop;

insert into app_baseline_indexes values
  ('idx_pipeline_stages_pipeline_position', 'pipeline_stages',
   array['pipeline_id', '"position"'], false, null),
  ('idx_automation_runs_pending', 'automation_runs',
   array['created_at'], false, '(status = ''pending''::text)'),
  ('idx_automation_runs_waiting', 'automation_runs',
   array['waiting_until'], false, '(status = ''waiting''::text)'),
  ('uq_email_sends_dedupe_key', 'email_sends',
   array['dedupe_key'], true, '(dedupe_key IS NOT NULL)'),
  ('uq_email_sends_org_order', 'email_sends',
   array['organization_id', 'order_id'], true, '(order_id IS NOT NULL)'),
  ('whatsapp_sends_order_idempotency_idx', 'whatsapp_sends',
   array['organization_id', 'order_id'], true, '(order_id IS NOT NULL)'),
  ('sms_sends_order_idempotency_idx', 'sms_sends',
   array['organization_id', 'order_id'], true, '(order_id IS NOT NULL)'),
  ('idx_email_sends_store', 'email_sends',
   array['store_id'], false, '(store_id IS NOT NULL)'),
  ('idx_whatsapp_sends_store', 'whatsapp_sends',
   array['store_id'], false, '(store_id IS NOT NULL)'),
  ('idx_sms_sends_store', 'sms_sends',
   array['store_id'], false, '(store_id IS NOT NULL)'),
  ('idx_email_campaigns_scheduled', 'email_campaigns',
   array['status', 'scheduled_at'], false, '(status = ''scheduled''::text)');

do $$
declare
  r record;
  has_duplicate boolean;
  key_sql text;
  predicate_sql text;
begin
  for r in select * from app_baseline_indexes order by index_name loop
    if exists (
      select 1
        from pg_index i
        join pg_class c on c.oid = i.indrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_class idx on idx.oid = i.indexrelid
        join pg_am am on am.oid = idx.relam
       where n.nspname = 'public' and c.relname = r.table_name
         and array(
           select pg_get_indexdef(i.indexrelid, pos, true)
             from generate_series(1, i.indnatts) pos
         ) = r.keys
         and i.indisunique = r.is_unique
         and pg_get_expr(i.indpred, i.indrelid) is not distinct from r.predicate
         and am.amname = 'btree' and i.indisvalid and i.indisready
         and not i.indnullsnotdistinct and i.indnkeyatts = cardinality(r.keys)
         and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)
    ) then
      continue;
    end if;

    if to_regclass('public.' || r.index_name) is not null then
      raise exception 'app baseline incompatible: %.index', r.table_name;
    end if;

    select string_agg(format('%I', (parse_ident(key_name))[1]), ', ' order by ord)
      into key_sql
      from unnest(r.keys) with ordinality as x(key_name, ord);
    predicate_sql := case when r.predicate is null then ''
                          else ' where ' || r.predicate end;

    if r.is_unique then
      execute format(
        'select exists(select 1 from public.%I%s group by %s having count(*) > 1)',
        r.table_name, predicate_sql, key_sql
      ) into has_duplicate;
      if has_duplicate then
        raise exception 'app baseline incompatible: %.unique_index', r.table_name;
      end if;
    end if;

    execute format('create %s index %I on public.%I (%s)%s',
                   case when r.is_unique then 'unique' else '' end,
                   r.index_name, r.table_name, key_sql, predicate_sql);
  end loop;

  if exists (
    select 1 from app_baseline_indexes e
     where (
       select count(*)
         from pg_index i
         join pg_class c on c.oid = i.indrelid
         join pg_namespace n on n.oid = c.relnamespace
         join pg_class idx on idx.oid = i.indexrelid
         join pg_am am on am.oid = idx.relam
        where n.nspname = 'public' and c.relname = e.table_name
          and array(
            select pg_get_indexdef(i.indexrelid, pos, true)
              from generate_series(1, i.indnatts) pos
          ) = e.keys
          and i.indisunique = e.is_unique
          and pg_get_expr(i.indpred, i.indrelid) is not distinct from e.predicate
          and am.amname = 'btree' and i.indisvalid and i.indisready
          and not i.indnullsnotdistinct and i.indnkeyatts = cardinality(e.keys)
          and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)
     ) > 1
  ) then
    raise exception 'app baseline incompatible: scoped_indexes.multiplicity';
  end if;

  if exists (
    select 1
      from pg_index i
      join pg_class c on c.oid = i.indrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_class idx on idx.oid = i.indexrelid
      join pg_am am on am.oid = idx.relam
     where n.nspname = 'public'
       and c.relname in (select distinct table_name from app_baseline_columns)
       and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)
       and not exists (
         select 1 from app_baseline_indexes e
          where e.table_name = c.relname
            and e.keys = array(
              select pg_get_indexdef(i.indexrelid, pos, true)
                from generate_series(1, i.indnatts) pos
            )
            and e.is_unique = i.indisunique
            and e.predicate is not distinct from pg_get_expr(i.indpred, i.indrelid)
            and am.amname = 'btree' and i.indisvalid and i.indisready
            and not i.indnullsnotdistinct and i.indnkeyatts = cardinality(e.keys)
       )
  ) then
    raise exception 'app baseline incompatible: scoped_indexes.definition';
  end if;
end
$$;

create temporary table app_baseline_policies (
  table_name text not null,
  command text not null,
  roles name[] not null,
  permissive text not null,
  using_expression text,
  check_expression text,
  primary key (table_name, command, roles, permissive, using_expression, check_expression)
) on commit drop;

insert into app_baseline_policies
select table_name, 'ALL', array['authenticated']::name[], 'PERMISSIVE',
       '(organization_id = get_user_organization_id())',
       '(organization_id = get_user_organization_id())'
  from (values
    ('organization_members'), ('pipelines'), ('automations'), ('automation_runs'),
    ('email_campaigns'), ('whatsapp_campaigns'), ('sms_campaigns'), ('email_sends'),
    ('whatsapp_sends'), ('sms_sends')
  ) as t(table_name);

insert into app_baseline_policies values
  ('pipelines', 'ALL', array['authenticated']::name[], 'PERMISSIVE',
   '(store_id IN ( SELECT s.id FROM shopify_stores s WHERE (s.organization_id = get_user_organization_id())))',
   '(store_id IN ( SELECT s.id FROM shopify_stores s WHERE (s.organization_id = get_user_organization_id())))'),
  ('pipeline_stages', 'ALL', array['authenticated']::name[], 'PERMISSIVE',
   '(EXISTS ( SELECT 1 FROM pipelines p WHERE ((p.id)::text = (pipeline_stages.pipeline_id)::text)))',
   '(EXISTS ( SELECT 1 FROM pipelines p WHERE ((p.id)::text = (pipeline_stages.pipeline_id)::text)))');

do $$
declare
  r record;
begin
  if exists (
    select 1 from pg_policies p
     where p.schemaname = 'public'
       and p.tablename in (select distinct table_name from app_baseline_columns)
       and not exists (
         select 1 from app_baseline_policies e
          where e.table_name = p.tablename and e.command = p.cmd
            and e.roles = p.roles and e.permissive = p.permissive
            and e.using_expression is not distinct from
                btrim(regexp_replace(p.qual, '[[:space:]]+', ' ', 'g'))
            and e.check_expression is not distinct from
                btrim(regexp_replace(p.with_check, '[[:space:]]+', ' ', 'g'))
       )
  ) then
    raise exception 'app baseline incompatible: scoped_policies.unknown';
  end if;

  for r in select distinct table_name from app_baseline_columns order by table_name loop
    if (select c.relforcerowsecurity from pg_class c
         where c.oid = to_regclass('public.' || r.table_name)) then
      raise exception 'app baseline incompatible: %.force_rls', r.table_name;
    end if;
    execute format('alter table public.%I enable row level security', r.table_name);
  end loop;

  for r in
    select table_name from (values
      ('organization_members'), ('pipelines'), ('automations'), ('automation_runs'),
      ('email_campaigns'), ('whatsapp_campaigns'), ('sms_campaigns'), ('email_sends'),
      ('whatsapp_sends'), ('sms_sends')
    ) as t(table_name)
  loop
    if not exists (
      select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = r.table_name
         and p.cmd = 'ALL' and p.roles = array['authenticated']::name[]
         and p.permissive = 'PERMISSIVE'
         and btrim(regexp_replace(p.qual, '[[:space:]]+', ' ', 'g'))
               = '(organization_id = get_user_organization_id())'
         and btrim(regexp_replace(p.with_check, '[[:space:]]+', ' ', 'g'))
               = '(organization_id = get_user_organization_id())'
    ) then
      execute format(
        'create policy app_baseline_org_isolation on public.%I '
        || 'as permissive for all to authenticated '
        || 'using (organization_id = public.get_user_organization_id()) '
        || 'with check (organization_id = public.get_user_organization_id())',
        r.table_name
      );
    end if;
  end loop;

  if not exists (
    select 1 from pg_policies p
     where p.schemaname = 'public' and p.tablename = 'pipelines'
       and p.cmd = 'ALL' and p.roles = array['authenticated']::name[]
       and p.permissive = 'PERMISSIVE'
       and btrim(regexp_replace(p.qual, '[[:space:]]+', ' ', 'g'))
             = '(store_id IN ( SELECT s.id FROM shopify_stores s WHERE (s.organization_id = get_user_organization_id())))'
       and btrim(regexp_replace(p.with_check, '[[:space:]]+', ' ', 'g'))
             = '(store_id IN ( SELECT s.id FROM shopify_stores s WHERE (s.organization_id = get_user_organization_id())))'
  ) then
    create policy app_baseline_org_via_store on public.pipelines
      as permissive for all to authenticated
      using (store_id in (
        select s.id from public.shopify_stores s
         where s.organization_id = public.get_user_organization_id()
      ))
      with check (store_id in (
        select s.id from public.shopify_stores s
         where s.organization_id = public.get_user_organization_id()
      ));
  end if;

  if not exists (
    select 1 from pg_policies p
     where p.schemaname = 'public' and p.tablename = 'pipeline_stages'
       and p.cmd = 'ALL' and p.roles = array['authenticated']::name[]
       and p.permissive = 'PERMISSIVE'
       and btrim(regexp_replace(p.qual, '[[:space:]]+', ' ', 'g'))
             = '(EXISTS ( SELECT 1 FROM pipelines p WHERE ((p.id)::text = (pipeline_stages.pipeline_id)::text)))'
       and btrim(regexp_replace(p.with_check, '[[:space:]]+', ' ', 'g'))
             = '(EXISTS ( SELECT 1 FROM pipelines p WHERE ((p.id)::text = (pipeline_stages.pipeline_id)::text)))'
  ) then
    create policy app_baseline_org_via_parent on public.pipeline_stages
      as permissive for all to authenticated
      using (exists (
        select 1 from public.pipelines p where p.id::text = pipeline_stages.pipeline_id::text
      ))
      with check (exists (
        select 1 from public.pipelines p where p.id::text = pipeline_stages.pipeline_id::text
      ));
  end if;

  if exists (
    select 1 from app_baseline_policies e
     where (
       select count(*) from pg_policies p
        where p.schemaname = 'public' and p.tablename = e.table_name
          and p.cmd = e.command and p.roles = e.roles and p.permissive = e.permissive
          and btrim(regexp_replace(p.qual, '[[:space:]]+', ' ', 'g'))
                is not distinct from e.using_expression
          and btrim(regexp_replace(p.with_check, '[[:space:]]+', ' ', 'g'))
                is not distinct from e.check_expression
     ) > 1
  ) then
    raise exception 'app baseline incompatible: scoped_policies.multiplicity';
  end if;

  if exists (
    select 1 from app_baseline_policies e
     where not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = e.table_name
          and p.cmd = e.command and p.roles = e.roles and p.permissive = e.permissive
          and btrim(regexp_replace(p.qual, '[[:space:]]+', ' ', 'g'))
                is not distinct from e.using_expression
          and btrim(regexp_replace(p.with_check, '[[:space:]]+', ' ', 'g'))
                is not distinct from e.check_expression
     )
  ) then
    raise exception 'app baseline incompatible: scoped_policies.definition';
  end if;
end
$$;

do $$
declare
  r record;
  allowed_roles text[] := array['postgres', 'anon', 'authenticated', 'service_role'];
  allowed_privileges text[] := array[
    'INSERT', 'SELECT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
  ];
begin
  if exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace,
           lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     where n.nspname = 'public'
       and c.relname in (select distinct table_name from app_baseline_columns)
       and (case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end
              <> all(allowed_roles)
            or pg_get_userbyid(a.grantor) <> 'postgres'
            or a.privilege_type <> all(allowed_privileges)
            or a.is_grantable)
  ) then
    raise exception 'app baseline incompatible: scoped_grants.unknown';
  end if;

  for r in select distinct table_name from app_baseline_columns order by table_name loop
    execute format('grant all privileges on table public.%I to anon, authenticated, service_role',
                   r.table_name);
  end loop;

  if exists (
    select 1
      from (select unnest(allowed_roles) as role_name) roles
      cross join (select unnest(allowed_privileges) as privilege_name) privileges
      cross join (select distinct table_name from app_baseline_columns) tables
     where not exists (
       select 1
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace,
              lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
        where n.nspname = 'public' and c.relname = tables.table_name
          and (case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end)
                = roles.role_name
          and pg_get_userbyid(a.grantor) = 'postgres'
          and a.privilege_type = privileges.privilege_name
          and not a.is_grantable
     )
  ) then
    raise exception 'app baseline incompatible: scoped_grants.definition';
  end if;
end
$$;

do $$
declare
  labels text[];
begin
  select array_agg(e.enumlabel order by e.enumsortorder)
    into labels from pg_enum e
   where e.enumtypid = 'public.user_role'::regtype;
  if labels <> array['owner', 'admin', 'member', 'agent', 'analyst'] then
    raise exception 'app baseline incompatible: user_role.order';
  end if;

  if exists (
    select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in (select distinct table_name from app_baseline_columns)
       and not t.tgisinternal
  ) then
    raise exception 'app baseline incompatible: scoped_triggers.unknown';
  end if;
end
$$;

drop policy if exists org_via_pai on public.whatsapp_campaign_recipients;
create policy org_via_pai on public.whatsapp_campaign_recipients
  as permissive for all to authenticated
  using (exists (
    select 1
      from public.whatsapp_campaigns p
     where p.id::text = whatsapp_campaign_recipients.campaign_id::text
  ))
  with check (exists (
    select 1
      from public.whatsapp_campaigns p
     where p.id::text = whatsapp_campaign_recipients.campaign_id::text
  ));

-- 091000 enabled RLS on these existing runtime dependencies. Restore the
-- operation-specific policies for the roles that already held narrow grants.
drop policy if exists ai_agents_worker_read on public.ai_agents;
create policy ai_agents_worker_read on public.ai_agents
  as permissive for select to worker_role
  using (organization_id = public.current_app_organization_id());

drop policy if exists ai_agent_versions_worker_read on public.ai_agent_versions;
create policy ai_agent_versions_worker_read on public.ai_agent_versions
  as permissive for select to worker_role
  using (organization_id = public.current_app_organization_id());

drop policy if exists ai_agent_sources_worker_read on public.ai_agent_sources;
create policy ai_agent_sources_worker_read on public.ai_agent_sources
  as permissive for select to worker_role
  using (organization_id = public.current_app_organization_id());

drop policy if exists ai_agent_chunks_worker_read on public.ai_agent_chunks;
create policy ai_agent_chunks_worker_read on public.ai_agent_chunks
  as permissive for select to worker_role
  using (organization_id = public.current_app_organization_id());

drop policy if exists shopify_stores_worker_read on public.shopify_stores;
create policy shopify_stores_worker_read on public.shopify_stores
  as permissive for select to worker_role
  using (organization_id = public.current_app_organization_id());

drop policy if exists shopify_orders_worker_read on public.shopify_orders;
create policy shopify_orders_worker_read on public.shopify_orders
  as permissive for select to worker_role
  using (organization_id = public.current_app_organization_id());

drop policy if exists organization_api_keys_worker_read on public.organization_api_keys;
create policy organization_api_keys_worker_read on public.organization_api_keys
  as permissive for select to worker_role
  using (organization_id = public.current_app_organization_id());

drop policy if exists organizations_app_read on public.organizations;
create policy organizations_app_read on public.organizations
  as permissive for select to worker_role, sender_role
  using (id = public.current_app_organization_id());

drop policy if exists ai_usage_logs_worker_insert on public.ai_usage_logs;
create policy ai_usage_logs_worker_insert on public.ai_usage_logs
  as permissive for insert to worker_role
  with check (organization_id = public.current_app_organization_id());

-- These three views are a service-only boundary over the private schema.
-- Invoker mode removed service_role's deliberate view-only access.
alter view public.ai_runtime_activity set (security_invoker = off);
alter view public.ai_runtime_activity_calls set (security_invoker = off);
alter view public.ai_runtime_activity_tools set (security_invoker = off);

grant select, insert, update, delete on
  public.shopify_products,
  public.api_keys,
  public.email_templates,
  public.deals,
  public.deal_activities,
  public.events,
  public.pipeline_stage_transitions,
  public.email_clicks,
  public.automation_executions,
  public.automation_versions,
  public.automation_run_steps,
  public.automation_pending_steps,
  public.whatsapp_campaign_recipients
to authenticated, service_role;

grant select on public.shopify_stores to authenticated;
grant select on public.email_universal_usage to service_role;

commit;
