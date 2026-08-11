-- ============================================================
-- Delivery/Read receipts — timestamps reais no inbox
--
-- 1. Colunas delivered_at/read_at em whatsapp_cloud_messages
--    (alimentadas pelo processStatus a partir de statuses[].timestamp).
-- 2. Recria whatsapp_inbox_messages expondo as colunas reais no
--    branch cloud (antes fixava NULL).
--
-- COORDENACAO: o plano 2026-07-27-inbound-media-pipeline tambem
-- recria esta view. As DUAS migracoes usam DDL de view IDENTICA
-- (superset: colunas de midia + media_storage_path + delivered_at/
-- read_at reais) e ADD COLUMN IF NOT EXISTS defensivo para as
-- colunas do outro plano — qualquer ordem de execucao converge
-- para a mesma view final.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + DROP VIEW IF EXISTS +
-- CREATE VIEW. DROP+CREATE (nao OR REPLACE) porque a lista de
-- colunas muda (media_storage_path entra no meio) e OR REPLACE
-- nao permite alterar a lista de colunas.
-- ============================================================

-- 1. Novas colunas de timestamps de status
ALTER TABLE whatsapp_cloud_messages
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at      TIMESTAMPTZ;

-- 1b. Defensivo: colunas de midia do plano inbound-media-pipeline.
--     No-op se aquele plano ja rodou; garante que a view abaixo compile.
ALTER TABLE whatsapp_cloud_messages
  ADD COLUMN IF NOT EXISTS media_url          TEXT,
  ADD COLUMN IF NOT EXISTS media_filename     TEXT,
  ADD COLUMN IF NOT EXISTS media_mime_type    TEXT,
  ADD COLUMN IF NOT EXISTS media_storage_path TEXT;

-- 1c. Defensivo: colunas de midia da tabela legacy (mesmo bloco do
--     plano inbound-media-pipeline; no-op se aquele plano ja rodou).
DO $$ BEGIN
  ALTER TABLE whatsapp_messages
    ADD COLUMN IF NOT EXISTS media_url       TEXT,
    ADD COLUMN IF NOT EXISTS media_mime_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS media_filename  VARCHAR(255);
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'whatsapp_messages does not exist — skipping media columns';
END $$;

-- 2. Recriar a view unificada do inbox
--    DDL IDENTICA a do plano 2026-07-27-inbound-media-pipeline
--    (superset). Muda vs. 05A-inbox-unification.sql: cloud expoe
--    m.delivered_at/m.read_at e midia real; legacy expoe midia real;
--    media_storage_path entra logo apos media_mime_type.

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

SELECT 'delivered_at/read_at + view whatsapp_inbox_messages atualizados' AS resultado;
