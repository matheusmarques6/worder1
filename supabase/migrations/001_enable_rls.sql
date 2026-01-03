-- =============================================
-- WORDER: Migração para Row Level Security (RLS)
-- 
-- Este script habilita RLS em todas as tabelas
-- e cria policies baseadas em organization_id
--
-- IMPORTANTE: Execute em ordem!
-- =============================================

-- =============================================
-- PARTE 1: FUNÇÃO HELPER
-- Obtém organization_id do usuário autenticado
-- =============================================

CREATE OR REPLACE FUNCTION auth.organization_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    -- Primeiro tenta do JWT claim
    (current_setting('request.jwt.claims', true)::json->>'organization_id')::uuid,
    -- Fallback: busca do perfil do usuário
    (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Função para verificar se é admin da organização
CREATE OR REPLACE FUNCTION auth.is_org_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json->>'role') = 'admin',
    (SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid())
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- =============================================
-- PARTE 2: HABILITAR RLS EM TODAS AS TABELAS
-- =============================================

-- Core
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS organization_api_keys ENABLE ROW LEVEL SECURITY;

-- CRM
ALTER TABLE IF EXISTS contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS contact_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS contact_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS contact_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS contact_external_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS custom_field_definitions ENABLE ROW LEVEL SECURITY;

-- Deals/Pipeline
ALTER TABLE IF EXISTS pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pipeline_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pipeline_stage_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS deal_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS deal_stage_history ENABLE ROW LEVEL SECURITY;

-- Automações
ALTER TABLE IF EXISTS automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS automation_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS automation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS automation_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS automation_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS scheduled_automation_jobs ENABLE ROW LEVEL SECURITY;

-- WhatsApp
ALTER TABLE IF EXISTS whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_contact_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_contact_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_campaign_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_flow_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_agent_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_ai_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_ai_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_chatbots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_chat_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_business_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_cloud_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_cloud_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_quality_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS evolution_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS phonebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS phonebook_contacts ENABLE ROW LEVEL SECURITY;

-- AI
ALTER TABLE IF EXISTS ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_agent_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_agent_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_agent_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- Integrações
ALTER TABLE IF EXISTS shopify_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS shopify_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS shopify_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS shopify_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS shopify_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS klaviyo_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS klaviyo_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS klaviyo_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS meta_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS meta_ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS meta_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS meta_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS google_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS google_ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS google_ads_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tiktok_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tiktok_ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tiktok_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tiktok_adgroups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tiktok_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS hotmart_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS woocommerce_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS installed_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS integration_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS integration_health_logs ENABLE ROW LEVEL SECURITY;

-- Métricas e Logs
ALTER TABLE IF EXISTS campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS flow_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS webhook_test_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS api_keys ENABLE ROW LEVEL SECURITY;

-- Outros
ALTER TABLE IF EXISTS agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agent_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS chat_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS order_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS node_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS activities ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PARTE 3: POLICIES PARA TABELAS CORE
-- =============================================

-- PROFILES
-- Usuário só vê/edita próprio perfil
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- ORGANIZATIONS
-- Usuário só vê própria organização
DROP POLICY IF EXISTS "organizations_select" ON organizations;
CREATE POLICY "organizations_select" ON organizations
  FOR SELECT USING (id = auth.organization_id());

DROP POLICY IF EXISTS "organizations_update" ON organizations;
CREATE POLICY "organizations_update" ON organizations
  FOR UPDATE USING (id = auth.organization_id() AND auth.is_org_admin());

-- ORGANIZATION_MEMBERS
DROP POLICY IF EXISTS "org_members_select" ON organization_members;
CREATE POLICY "org_members_select" ON organization_members
  FOR SELECT USING (organization_id = auth.organization_id());

DROP POLICY IF EXISTS "org_members_all" ON organization_members;
CREATE POLICY "org_members_all" ON organization_members
  FOR ALL USING (organization_id = auth.organization_id() AND auth.is_org_admin());

-- =============================================
-- PARTE 4: MACRO PARA POLICIES PADRÃO
-- Cria policies SELECT/INSERT/UPDATE/DELETE
-- baseadas em organization_id
-- =============================================

-- Função para criar policies padrão
CREATE OR REPLACE FUNCTION create_org_policies(table_name TEXT)
RETURNS VOID AS $$
BEGIN
  -- Drop existing policies
  EXECUTE format('DROP POLICY IF EXISTS "%s_org_select" ON %I', table_name, table_name);
  EXECUTE format('DROP POLICY IF EXISTS "%s_org_insert" ON %I', table_name, table_name);
  EXECUTE format('DROP POLICY IF EXISTS "%s_org_update" ON %I', table_name, table_name);
  EXECUTE format('DROP POLICY IF EXISTS "%s_org_delete" ON %I', table_name, table_name);
  
  -- Create SELECT policy
  EXECUTE format('
    CREATE POLICY "%s_org_select" ON %I
    FOR SELECT USING (organization_id = auth.organization_id())',
    table_name, table_name
  );
  
  -- Create INSERT policy
  EXECUTE format('
    CREATE POLICY "%s_org_insert" ON %I
    FOR INSERT WITH CHECK (organization_id = auth.organization_id())',
    table_name, table_name
  );
  
  -- Create UPDATE policy (USANDO + WITH CHECK para prevenir mudança de org_id)
  EXECUTE format('
    CREATE POLICY "%s_org_update" ON %I
    FOR UPDATE 
    USING (organization_id = auth.organization_id())
    WITH CHECK (organization_id = auth.organization_id())',
    table_name, table_name
  );
  
  -- Create DELETE policy
  EXECUTE format('
    CREATE POLICY "%s_org_delete" ON %I
    FOR DELETE USING (organization_id = auth.organization_id())',
    table_name, table_name
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- PARTE 5: APLICAR POLICIES EM TODAS AS TABELAS
-- =============================================

-- CRM
SELECT create_org_policies('contacts');
SELECT create_org_policies('contact_activities');
SELECT create_org_policies('contact_tags');
SELECT create_org_policies('contact_purchases');
SELECT create_org_policies('contact_sessions');
SELECT create_org_policies('contact_external_mappings');
SELECT create_org_policies('tags');
SELECT create_org_policies('custom_field_definitions');

-- Deals/Pipeline
SELECT create_org_policies('pipelines');
SELECT create_org_policies('pipeline_stages');
SELECT create_org_policies('pipeline_automation_rules');
SELECT create_org_policies('pipeline_stage_transitions');
SELECT create_org_policies('deals');
SELECT create_org_policies('deal_activities');
SELECT create_org_policies('deal_stage_history');

-- Automações
SELECT create_org_policies('automations');
SELECT create_org_policies('automation_runs');
SELECT create_org_policies('automation_run_steps');
SELECT create_org_policies('automation_queue');
SELECT create_org_policies('automation_logs');
SELECT create_org_policies('automation_rules');
SELECT create_org_policies('automation_triggers');
SELECT create_org_policies('automation_webhooks');
SELECT create_org_policies('scheduled_automation_jobs');

-- WhatsApp
SELECT create_org_policies('whatsapp_instances');
SELECT create_org_policies('whatsapp_configs');
SELECT create_org_policies('whatsapp_conversations');
SELECT create_org_policies('whatsapp_messages');
SELECT create_org_policies('whatsapp_contacts');
SELECT create_org_policies('whatsapp_contact_activities');
SELECT create_org_policies('whatsapp_contact_notes');
SELECT create_org_policies('whatsapp_campaigns');
SELECT create_org_policies('whatsapp_campaign_logs');
SELECT create_org_policies('whatsapp_campaign_recipients');
SELECT create_org_policies('whatsapp_templates');
SELECT create_org_policies('whatsapp_flows');
SELECT create_org_policies('whatsapp_flow_sessions');
SELECT create_org_policies('whatsapp_agents');
SELECT create_org_policies('whatsapp_agent_assignments');
SELECT create_org_policies('whatsapp_ai_configs');
SELECT create_org_policies('whatsapp_ai_interactions');
SELECT create_org_policies('whatsapp_quick_replies');
SELECT create_org_policies('whatsapp_chatbots');
SELECT create_org_policies('whatsapp_chat_tags');
SELECT create_org_policies('whatsapp_conversation_tags');
SELECT create_org_policies('whatsapp_business_accounts');
SELECT create_org_policies('whatsapp_cloud_conversations');
SELECT create_org_policies('whatsapp_cloud_messages');
SELECT create_org_policies('whatsapp_numbers');
SELECT create_org_policies('whatsapp_quality_history');
SELECT create_org_policies('whatsapp_accounts');
SELECT create_org_policies('evolution_instances');
SELECT create_org_policies('phonebooks');
SELECT create_org_policies('phonebook_contacts');

-- AI
SELECT create_org_policies('ai_agents');
SELECT create_org_policies('ai_agent_sources');
SELECT create_org_policies('ai_agent_actions');
SELECT create_org_policies('ai_agent_integrations');
SELECT create_org_policies('ai_agent_configs');
SELECT create_org_policies('ai_agent_chunks');
SELECT create_org_policies('ai_models');
SELECT create_org_policies('ai_usage_logs');
SELECT create_org_policies('knowledge_bases');
SELECT create_org_policies('knowledge_documents');
SELECT create_org_policies('knowledge_chunks');

-- Integrações
SELECT create_org_policies('shopify_stores');
SELECT create_org_policies('shopify_orders');
SELECT create_org_policies('shopify_products');
SELECT create_org_policies('shopify_checkouts');
SELECT create_org_policies('shopify_webhook_events');
SELECT create_org_policies('klaviyo_accounts');
SELECT create_org_policies('klaviyo_integrations');
SELECT create_org_policies('klaviyo_lists');
SELECT create_org_policies('meta_accounts');
SELECT create_org_policies('meta_ad_accounts');
SELECT create_org_policies('meta_campaigns');
SELECT create_org_policies('meta_insights');
SELECT create_org_policies('google_ads_accounts');
SELECT create_org_policies('google_ads_campaigns');
SELECT create_org_policies('google_ads_metrics');
SELECT create_org_policies('tiktok_accounts');
SELECT create_org_policies('tiktok_ad_accounts');
SELECT create_org_policies('tiktok_campaigns');
SELECT create_org_policies('tiktok_adgroups');
SELECT create_org_policies('tiktok_metrics');
SELECT create_org_policies('hotmart_accounts');
SELECT create_org_policies('woocommerce_stores');
SELECT create_org_policies('installed_integrations');
SELECT create_org_policies('integration_health_logs');

-- Métricas e Logs
SELECT create_org_policies('campaign_metrics');
SELECT create_org_policies('flow_metrics');
SELECT create_org_policies('daily_metrics');
SELECT create_org_policies('product_metrics');
SELECT create_org_policies('notifications');
SELECT create_org_policies('audit_logs');
SELECT create_org_policies('activity_logs');
SELECT create_org_policies('event_logs');
SELECT create_org_policies('webhook_events');
SELECT create_org_policies('webhook_test_logs');
SELECT create_org_policies('api_keys');
SELECT create_org_policies('organization_api_keys');

-- Outros
SELECT create_org_policies('agents');
SELECT create_org_policies('agent_permissions');
SELECT create_org_policies('chat_assignments');
SELECT create_org_policies('email_campaigns');
SELECT create_org_policies('order_attribution');
SELECT create_org_policies('activities');

-- =============================================
-- PARTE 6: POLICIES ESPECIAIS
-- Algumas tabelas precisam de regras diferentes
-- =============================================

-- INTEGRATIONS (tabela pública, read-only para todos)
DROP POLICY IF EXISTS "integrations_public_read" ON integrations;
CREATE POLICY "integrations_public_read" ON integrations
  FOR SELECT USING (true);

-- INTEGRATION_CATEGORIES (tabela pública, read-only)
DROP POLICY IF EXISTS "integration_categories_public_read" ON integration_categories;
CREATE POLICY "integration_categories_public_read" ON integration_categories
  FOR SELECT USING (true);

-- NODE_SCHEMAS (tabela pública, read-only)
DROP POLICY IF EXISTS "node_schemas_public_read" ON node_schemas;
CREATE POLICY "node_schemas_public_read" ON node_schemas
  FOR SELECT USING (true);

-- OAUTH_STATES (baseado em user_id, não organization_id)
DROP POLICY IF EXISTS "oauth_states_user" ON oauth_states;
CREATE POLICY "oauth_states_user" ON oauth_states
  FOR ALL USING (user_id = auth.uid());

-- =============================================
-- PARTE 7: GARANTIR QUE organization_id 
-- É PREENCHIDO AUTOMATICAMENTE
-- =============================================

-- Trigger para preencher organization_id automaticamente
CREATE OR REPLACE FUNCTION set_organization_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := auth.organization_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplicar trigger nas tabelas principais
-- (execute manualmente para cada tabela que precisar)
-- Exemplo:
-- CREATE TRIGGER set_org_id_contacts
--   BEFORE INSERT ON contacts
--   FOR EACH ROW
--   EXECUTE FUNCTION set_organization_id();

-- =============================================
-- PARTE 8: VERIFICAÇÃO
-- =============================================

-- Verifica se RLS está habilitado em todas as tabelas
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- =============================================
-- FIM DA MIGRAÇÃO
-- =============================================

-- IMPORTANTE: Após executar este script:
-- 1. Teste com um usuário comum (não service role)
-- 2. Verifique se consegue ver apenas dados da própria organização
-- 3. Atualize o código para usar supabase-client.ts ao invés de supabase-admin.ts
