-- =============================================
-- Migration: Corrigir policies UPDATE para ter WITH CHECK
-- 
-- Esta migration corrige uma brecha de segurança onde
-- policies de UPDATE não tinham WITH CHECK, permitindo
-- potencialmente que um usuário tentasse mudar organization_id
-- =============================================

-- Função auxiliar para recriar policy de UPDATE com WITH CHECK
CREATE OR REPLACE FUNCTION fix_update_policy(table_name TEXT)
RETURNS VOID AS $$
BEGIN
  -- Drop existing UPDATE policy
  EXECUTE format('DROP POLICY IF EXISTS "%s_org_update" ON %I', table_name, table_name);
  
  -- Recreate with USING + WITH CHECK
  EXECUTE format('
    CREATE POLICY "%s_org_update" ON %I
    FOR UPDATE 
    USING (organization_id = auth.organization_id())
    WITH CHECK (organization_id = auth.organization_id())',
    table_name, table_name
  );
  
  RAISE NOTICE 'Fixed UPDATE policy for table: %', table_name;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not fix policy for %: %', table_name, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- Aplicar correção em todas as tabelas
-- =============================================

-- CRM
SELECT fix_update_policy('contacts');
SELECT fix_update_policy('contact_activities');
SELECT fix_update_policy('contact_tags');
SELECT fix_update_policy('contact_purchases');
SELECT fix_update_policy('contact_sessions');
SELECT fix_update_policy('contact_external_mappings');
SELECT fix_update_policy('tags');
SELECT fix_update_policy('custom_field_definitions');

-- Deals/Pipeline
SELECT fix_update_policy('pipelines');
SELECT fix_update_policy('pipeline_stages');
SELECT fix_update_policy('pipeline_automation_rules');
SELECT fix_update_policy('pipeline_stage_transitions');
SELECT fix_update_policy('deals');
SELECT fix_update_policy('deal_activities');
SELECT fix_update_policy('deal_stage_history');

-- Automações
SELECT fix_update_policy('automations');
SELECT fix_update_policy('automation_runs');
SELECT fix_update_policy('automation_run_steps');
SELECT fix_update_policy('automation_queue');
SELECT fix_update_policy('automation_logs');
SELECT fix_update_policy('automation_rules');
SELECT fix_update_policy('automation_triggers');
SELECT fix_update_policy('automation_webhooks');
SELECT fix_update_policy('scheduled_automation_jobs');

-- WhatsApp
SELECT fix_update_policy('whatsapp_instances');
SELECT fix_update_policy('whatsapp_configs');
SELECT fix_update_policy('whatsapp_conversations');
SELECT fix_update_policy('whatsapp_messages');
SELECT fix_update_policy('whatsapp_contacts');
SELECT fix_update_policy('whatsapp_contact_activities');
SELECT fix_update_policy('whatsapp_contact_notes');
SELECT fix_update_policy('whatsapp_campaigns');
SELECT fix_update_policy('whatsapp_campaign_logs');
SELECT fix_update_policy('whatsapp_campaign_recipients');
SELECT fix_update_policy('whatsapp_templates');
SELECT fix_update_policy('whatsapp_flows');
SELECT fix_update_policy('whatsapp_flow_sessions');
SELECT fix_update_policy('whatsapp_agents');
SELECT fix_update_policy('whatsapp_agent_assignments');
SELECT fix_update_policy('whatsapp_ai_configs');
SELECT fix_update_policy('whatsapp_ai_interactions');
SELECT fix_update_policy('whatsapp_quick_replies');
SELECT fix_update_policy('whatsapp_chatbots');
SELECT fix_update_policy('whatsapp_chat_tags');
SELECT fix_update_policy('whatsapp_conversation_tags');
SELECT fix_update_policy('whatsapp_business_accounts');
SELECT fix_update_policy('whatsapp_cloud_conversations');
SELECT fix_update_policy('whatsapp_cloud_messages');
SELECT fix_update_policy('whatsapp_numbers');
SELECT fix_update_policy('whatsapp_quality_history');

-- AI
SELECT fix_update_policy('ai_agents');
SELECT fix_update_policy('ai_agent_sources');
SELECT fix_update_policy('ai_agent_source_chunks');
SELECT fix_update_policy('ai_agent_actions');
SELECT fix_update_policy('ai_agent_integrations');
SELECT fix_update_policy('ai_chat_sessions');
SELECT fix_update_policy('ai_chat_messages');

-- Integrations
SELECT fix_update_policy('integration_connections');
SELECT fix_update_policy('integration_logs');
SELECT fix_update_policy('shopify_stores');
SELECT fix_update_policy('shopify_orders');
SELECT fix_update_policy('shopify_customers');
SELECT fix_update_policy('shopify_products');
SELECT fix_update_policy('shopify_sync_logs');
SELECT fix_update_policy('klaviyo_accounts');
SELECT fix_update_policy('klaviyo_profiles');
SELECT fix_update_policy('meta_accounts');
SELECT fix_update_policy('meta_campaigns');
SELECT fix_update_policy('meta_insights');
SELECT fix_update_policy('tiktok_accounts');
SELECT fix_update_policy('tiktok_campaigns');
SELECT fix_update_policy('tiktok_metrics');

-- Cleanup
DROP FUNCTION IF EXISTS fix_update_policy(TEXT);

-- =============================================
-- Resumo das alterações
-- =============================================
-- Todas as policies de UPDATE agora têm:
-- - USING: verifica se registro pertence à org do usuário
-- - WITH CHECK: garante que o novo valor de organization_id é da org do usuário
-- 
-- Isso previne o ataque onde um usuário tenta:
-- UPDATE tabela SET organization_id = 'outra_org' WHERE id = 'meu_registro'
-- =============================================
