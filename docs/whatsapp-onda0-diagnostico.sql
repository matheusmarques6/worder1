-- =============================================================================
-- Worder WhatsApp — Onda 0 Fase A: DIAGNÓSTICO (read-only)
-- =============================================================================
--
-- Como rodar:
--   1. Supabase → SQL Editor → New query
--   2. Cole TODAS as 5 queries de uma vez
--   3. Clica em "Run"
--   4. Manda pra mim o output de cada bloco (copia o resultado da grid)
--
-- Nenhuma query abaixo ALTERA dados. Tudo é SELECT. Pode rodar tranquilo.
--
-- Depois do output: eu te entrego o Fase B (backup) + Fase D (hotfix InnovaBay)
-- adaptado ao que o banco realmente tem.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- A.1 — Quantas linhas em cada tabela paralela
-- -----------------------------------------------------------------------------
-- Esperado: muitas linhas em configs/instances/conversations/messages;
-- zero ou poucas em business_accounts/cloud_conversations/cloud_messages.
-- Isso confirma o gap entre as tabelas paralelas.

SELECT 'whatsapp_accounts'             AS tabela, count(*) AS linhas FROM whatsapp_accounts
UNION ALL SELECT 'whatsapp_configs',             count(*) FROM whatsapp_configs
UNION ALL SELECT 'whatsapp_instances',           count(*) FROM whatsapp_instances
UNION ALL SELECT 'whatsapp_business_accounts',   count(*) FROM whatsapp_business_accounts
UNION ALL SELECT 'whatsapp_conversations',       count(*) FROM whatsapp_conversations
UNION ALL SELECT 'whatsapp_cloud_conversations', count(*) FROM whatsapp_cloud_conversations
UNION ALL SELECT 'whatsapp_messages',            count(*) FROM whatsapp_messages
UNION ALL SELECT 'whatsapp_cloud_messages',      count(*) FROM whatsapp_cloud_messages
UNION ALL SELECT 'whatsapp_templates',           count(*) FROM whatsapp_templates
UNION ALL SELECT 'whatsapp_webhook_events',      count(*) FROM whatsapp_webhook_events
ORDER BY 1;


-- -----------------------------------------------------------------------------
-- A.2 — Schema REAL de whatsapp_messages
-- -----------------------------------------------------------------------------
-- Confirma qual coluna do wamid existe: `wamid`, `wa_message_id` ou
-- `message_id` + `external_id`. Disso depende se precisamos criar coluna
-- nova ou se o caminho /cloud/webhook já cobre 100%.

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'whatsapp_messages'
  AND table_schema = 'public'
ORDER BY ordinal_position;


-- -----------------------------------------------------------------------------
-- A.3 — Schema REAL de whatsapp_business_accounts
-- -----------------------------------------------------------------------------
-- Se retornar VAZIO, significa que a migration 01-migration-cloud-api-schema
-- não rodou ainda e precisa rodar antes do hotfix do InnovaBay.

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'whatsapp_business_accounts'
  AND table_schema = 'public'
ORDER BY ordinal_position;


-- -----------------------------------------------------------------------------
-- A.4 — InnovaBay especificamente — em quais tabelas a conexão existe?
-- -----------------------------------------------------------------------------
-- Vai mostrar 1 linha por tabela em que o phone_number_id aparece.
-- Aposta: aparece em `configs` e `instances`, NÃO aparece em `business_accounts`.
-- Esse é o gap exato que está impedindo o envio.

SELECT 'configs' AS source,
       organization_id,
       phone_number_id,
       waba_id,
       (access_token IS NOT NULL) AS has_token,
       is_active,
       webhook_verified
FROM whatsapp_configs
WHERE phone_number_id = '1163643483491728'

UNION ALL

SELECT 'instances',
       organization_id,
       phone_number_id,
       waba_id,
       (access_token IS NOT NULL),
       (status IN ('connected','ACTIVE')),
       webhook_verified
FROM whatsapp_instances
WHERE phone_number_id = '1163643483491728'

UNION ALL

SELECT 'business_accounts',
       organization_id,
       phone_number_id,
       waba_id,
       (access_token IS NOT NULL),
       (status = 'active'),
       webhook_configured
FROM whatsapp_business_accounts
WHERE phone_number_id = '1163643483491728';


-- -----------------------------------------------------------------------------
-- A.5 — RLS status de cada tabela whatsapp_*
-- -----------------------------------------------------------------------------
-- Onde rowsecurity = false OU policy_count = 0, temos risco multi-tenant.
-- Vai virar a base do Plano 2 Fase F.3 (RLS uniforme).

SELECT tablename,
       rowsecurity                                                                     AS rls_on,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = t.tablename)            AS policy_count
FROM pg_tables t
WHERE schemaname = 'public'
  AND tablename LIKE 'whatsapp_%'
ORDER BY tablename;
