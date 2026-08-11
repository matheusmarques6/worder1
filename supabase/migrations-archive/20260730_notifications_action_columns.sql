-- =============================================
-- notifications: garantir action_url / action_label.
--
-- Erro observado em producao (cron whatsapp-webhook-heartbeat, 29/07):
--   "Could not find the 'action_url' column of 'notifications' in the schema cache"
--
-- Causa: as duas definicoes da tabela vivem dentro de CREATE TABLE IF NOT
-- EXISTS (20260123_ads_and_help_tables.sql:443 e
-- PARTE2_help_e_outras_tabelas.sql:88). A tabela de producao ja existia quando
-- essas migrations rodaram, entao o IF NOT EXISTS pulou tudo em silencio e as
-- colunas nunca foram criadas. Nao existe nenhum ALTER TABLE ... ADD COLUMN
-- action_url no repo — este e o primeiro.
--
-- Impacto de nao ter: TODO insert de notificacao que passa action_url falha, e
-- o erro e engolido num wlog.warn best-effort. Ou seja, o sino nunca recebeu:
--   - whatsapp-webhook-heartbeat/route.ts:97  — webhook morto (ficou 47 dias
--     gritando a cada 30min sem ninguem ver)
--   - workers/whatsapp-ai-respond/route.ts:267 — IA desistiu de responder
--   - lib/ai/cloud-runner.ts:74 e :234         — IA desativada / handoff
--   - lib/services/integration-health/notifier.ts:103
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. Rodar de novo nao faz nada.
-- =============================================

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS action_url   TEXT,
  ADD COLUMN IF NOT EXISTS action_label TEXT;

-- O PostgREST cacheia o schema; sem recarregar, o insert continua falhando com
-- a MESMA mensagem ("schema cache") mesmo com a coluna ja criada.
NOTIFY pgrst, 'reload schema';

-- Verificacao: deve listar as duas colunas.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'notifications'
  AND column_name IN ('action_url', 'action_label')
ORDER BY column_name;
