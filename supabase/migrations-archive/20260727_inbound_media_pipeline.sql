-- ============================================================
-- Inbound media pipeline (2026-07-27)
--
-- 1. Versiona as colunas de mídia de whatsapp_cloud_messages
--    (produção já tem parte delas via hotfix manual — idempotente).
-- 2. Adiciona media_download_status para o pipeline assíncrono
--    de download de mídia inbound (pending | done | failed).
-- 3. Recria a view whatsapp_inbox_messages expondo media_url /
--    media_filename / media_mime_type / media_storage_path REAIS
--    (antes eram NULL::TEXT fixos nos dois branches — bug que fazia
--    toda mídia, inclusive enviada, sumir no reload do inbox).
-- ============================================================

-- 1. Colunas de mídia (cloud)
ALTER TABLE whatsapp_cloud_messages
  ADD COLUMN IF NOT EXISTS media_url             TEXT,
  ADD COLUMN IF NOT EXISTS media_filename        TEXT,
  ADD COLUMN IF NOT EXISTS media_mime_type       TEXT,
  ADD COLUMN IF NOT EXISTS media_storage_path    TEXT,
  ADD COLUMN IF NOT EXISTS media_download_status TEXT;

COMMENT ON COLUMN whatsapp_cloud_messages.media_download_status IS
  'Pipeline de mídia inbound: pending (aguardando worker) | done | failed. NULL = mensagem sem mídia ou outbound.';

-- 1b. Defensivo: colunas do plano 2026-07-27-delivery-read-receipts.
--     No-op se aquele plano já rodou. Garante que as DUAS migrações
--     produzam a MESMA view superset, independente da ordem de execução.
ALTER TABLE whatsapp_cloud_messages
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at      TIMESTAMPTZ;

-- 2. Colunas de mídia (legacy) — inbox-schema.sql já as adiciona em
--    alguns ambientes; garantimos aqui de forma idempotente.
DO $$ BEGIN
  ALTER TABLE whatsapp_messages
    ADD COLUMN IF NOT EXISTS media_url       TEXT,
    ADD COLUMN IF NOT EXISTS media_mime_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS media_filename  VARCHAR(255);
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'whatsapp_messages does not exist — skipping media columns';
END $$;

-- 3. Recria a view. DROP + CREATE (não OR REPLACE) porque adicionamos
--    a coluna media_storage_path no meio da lista.
DROP VIEW IF EXISTS whatsapp_inbox_messages;

CREATE VIEW whatsapp_inbox_messages AS

-- Cloud API messages
SELECT
  m.id,
  m.organization_id,
  'cloud'::TEXT                          AS provider,
  m.conversation_id,
  m.message_id,
  m.message_id                           AS wa_message_id,
  m.direction,
  m.message_type,
  m.content,
  m.text_body,
  m.caption,
  m.media_id,
  m.media_url,
  m.media_filename,
  m.media_mime_type,
  m.media_storage_path,
  m.template_name,
  m.status,
  m.error_code,
  m.error_message,
  FALSE                                   AS sent_by_bot,
  m.delivered_at,
  m.read_at,
  m.timestamp                            AS sent_at,
  m.created_at
FROM whatsapp_cloud_messages m

UNION ALL

-- Legacy Evolution messages (JOIN to get organization_id)
SELECT
  lm.id,
  lc.organization_id,
  'evolution'::TEXT                       AS provider,
  lm.conversation_id,
  lm.id::TEXT                            AS message_id,
  lm.id::TEXT                            AS wa_message_id,
  'inbound'::TEXT                        AS direction,
  'text'::TEXT                           AS message_type,
  lm.content::JSONB                      AS content,
  CASE
    WHEN lm.content IS NOT NULL THEN lm.content::TEXT
    ELSE ''
  END                                    AS text_body,
  NULL::TEXT                              AS caption,
  NULL::TEXT                              AS media_id,
  lm.media_url,
  lm.media_filename::TEXT                AS media_filename,
  lm.media_mime_type::TEXT               AS media_mime_type,
  NULL::TEXT                              AS media_storage_path,
  NULL::TEXT                              AS template_name,
  'sent'::TEXT                           AS status,
  NULL::TEXT                              AS error_code,
  NULL::TEXT                              AS error_message,
  FALSE                                   AS sent_by_bot,
  NULL::TIMESTAMPTZ                       AS delivered_at,
  NULL::TIMESTAMPTZ                       AS read_at,
  lm.created_at                          AS sent_at,
  lm.created_at
FROM whatsapp_messages lm
JOIN whatsapp_conversations lc ON lc.id = lm.conversation_id;

SELECT 'Inbound media pipeline migration applied' AS resultado;
