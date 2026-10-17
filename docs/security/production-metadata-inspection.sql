-- Somente leitura. Executar no projeto Worder CRM apenas após autorização
-- específica para inspecionar metadados de produção. Nenhuma linha de contato,
-- mensagem, objeto Storage ou credencial é consultada.
select jsonb_build_object(
  'bucket', (
    select jsonb_agg(jsonb_build_object('id', id, 'public', public, 'file_size_limit', file_size_limit))
    from storage.buckets where id = 'whatsapp-media'
  ),
  'storage_policies', (
    select jsonb_agg(jsonb_build_object('name', policyname, 'roles', roles, 'cmd', cmd, 'qual', qual, 'with_check', with_check))
    from pg_policies where schemaname = 'storage' and tablename = 'objects'
  ),
  'columns', (
    select jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name, 'type', data_type, 'nullable', is_nullable, 'generated', is_generated))
    from information_schema.columns
    where table_schema = 'public' and (
      (table_name = 'contacts' and column_name in ('full_name', 'email_consent', 'sms_consent', 'whatsapp_consent'))
      or (table_name = 'organization_members' and column_name in ('status', 'role', 'user_id', 'organization_id'))
      or (table_name in ('agents','whatsapp_agents') and column_name in ('user_id', 'is_active', 'organization_id'))
    )
  ),
  'member_constraints', (
    select jsonb_agg(pg_get_constraintdef(c.oid)) from pg_constraint c
    where c.conrelid = to_regclass('public.organization_members') and c.contype = 'c'
  ),
  'lgpd_tables', jsonb_build_object(
    'requests', to_regclass('public.lgpd_data_requests')::text,
    'events', to_regclass('public.contact_events')::text,
    'consent_records', to_regclass('public.consent_records')::text
  )
) as security_metadata;
