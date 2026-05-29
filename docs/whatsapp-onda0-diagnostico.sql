-- =============================================================================
-- Worder WhatsApp — Onda 0 Fase A: DIAGNÓSTICO (read-only) — v2 defensiva
-- =============================================================================
--
-- v2: cada query roda independente, sem UNION. Se uma tabela não existe ou
-- não tem uma coluna, só essa query falha — as outras seguem.
--
-- Como rodar:
--   1. Roda UMA query por vez (selecionando o bloco e clicando Run)
--   2. Copia o output da grid e me manda
--   3. Se alguma der "table does not exist" ou "column does not exist", me avisa
--      qual e pula pra próxima.
--
-- Nenhuma query abaixo ALTERA dados.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- A.1 — Quais tabelas WhatsApp existem nesse banco?
-- -----------------------------------------------------------------------------
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'whatsapp_%'
ORDER BY tablename;


-- -----------------------------------------------------------------------------
-- A.1b — Contagem só nas tabelas que realmente existem (defensivo)
-- -----------------------------------------------------------------------------
-- Roda esta query DEPOIS de A.1. Se A.1 mostrou que uma das tabelas abaixo
-- não existe, COMENTE a linha correspondente antes de rodar.

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
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'whatsapp_messages'
  AND table_schema = 'public'
ORDER BY ordinal_position;


-- -----------------------------------------------------------------------------
-- A.3 — Schema REAL de whatsapp_business_accounts
-- -----------------------------------------------------------------------------
-- Se retornar VAZIO, a migration 01-cloud-api-schema não rodou ainda.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'whatsapp_business_accounts'
  AND table_schema = 'public'
ORDER BY ordinal_position;


-- -----------------------------------------------------------------------------
-- A.3b — Schema REAL de whatsapp_configs
-- -----------------------------------------------------------------------------
-- Precisamos saber quais colunas configs realmente tem antes do hotfix.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'whatsapp_configs'
  AND table_schema = 'public'
ORDER BY ordinal_position;


-- -----------------------------------------------------------------------------
-- A.3c — Schema REAL de whatsapp_instances
-- -----------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'whatsapp_instances'
  AND table_schema = 'public'
ORDER BY ordinal_position;


-- -----------------------------------------------------------------------------
-- A.4 — InnovaBay em CADA tabela, SEPARADAMENTE (sem UNION)
-- -----------------------------------------------------------------------------
-- Roda as 3 queries abaixo uma de cada vez. Cada uma faz SELECT * — se uma
-- tabela tiver mais ou menos colunas, ela mostra o que tiver, sem quebrar.
--
-- Se alguma retornar 0 linhas → InnovaBay não está nessa tabela.

SELECT * FROM whatsapp_configs
WHERE phone_number_id = '1163643483491728';

SELECT * FROM whatsapp_instances
WHERE phone_number_id = '1163643483491728';

SELECT * FROM whatsapp_business_accounts
WHERE phone_number_id = '1163643483491728';


-- -----------------------------------------------------------------------------
-- A.5 — RLS status de cada tabela whatsapp_*
-- -----------------------------------------------------------------------------
SELECT tablename,
       rowsecurity                                                                     AS rls_on,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = t.tablename)            AS policy_count
FROM pg_tables t
WHERE schemaname = 'public'
  AND tablename LIKE 'whatsapp_%'
ORDER BY tablename;
