-- =============================================================================
-- Worder WhatsApp — Caminho B: Multi-store (schema + backfill InnovaBay)
-- =============================================================================
--
-- O QUE ESSE SQL FAZ:
--   1. Adiciona coluna store_id em whatsapp_business_accounts, _cloud_conversations
--      e _cloud_messages (todas idempotentes — IF NOT EXISTS)
--   2. Cria índices pra performance
--   3. Backfill: seta store_id da InnovaBay nas 3 tabelas
--   4. Recria a view whatsapp_inbox_conversations expondo store_id
--   5. Valida no fim
--
-- Read-write — mas tudo idempotente. Pode rodar multiplas vezes sem efeito colateral.
--
-- INSTRUCAO: Cola tudo de uma vez, clica Run.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- B.1 — Adicionar coluna store_id (3 tabelas)
-- -----------------------------------------------------------------------------
ALTER TABLE whatsapp_business_accounts   ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE whatsapp_cloud_conversations ADD COLUMN IF NOT EXISTS store_id UUID;
ALTER TABLE whatsapp_cloud_messages      ADD COLUMN IF NOT EXISTS store_id UUID;


-- -----------------------------------------------------------------------------
-- B.2 — Índices (filtros (org_id, store_id) ficam frequentes)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_wba_store
  ON whatsapp_business_accounts(store_id);

CREATE INDEX IF NOT EXISTS idx_wcc_org_store
  ON whatsapp_cloud_conversations(organization_id, store_id);

CREATE INDEX IF NOT EXISTS idx_wcm_org_store
  ON whatsapp_cloud_messages(organization_id, store_id);


-- -----------------------------------------------------------------------------
-- B.3 — Backfill InnovaBay: account
-- -----------------------------------------------------------------------------
UPDATE whatsapp_business_accounts
SET store_id   = 'd5dfd5dd-1d77-425e-a099-850338078999',
    updated_at = now()
WHERE phone_number_id = '1163643483491728'
  AND store_id IS NULL;


-- -----------------------------------------------------------------------------
-- B.4 — Backfill: conversas existentes herdam store_id do account
-- -----------------------------------------------------------------------------
UPDATE whatsapp_cloud_conversations cc
SET store_id = ba.store_id
FROM whatsapp_business_accounts ba
WHERE cc.waba_id          = ba.id
  AND cc.organization_id  = ba.organization_id
  AND cc.store_id        IS NULL
  AND ba.store_id        IS NOT NULL;


-- -----------------------------------------------------------------------------
-- B.5 — Backfill: mensagens existentes herdam store_id da conversa
-- -----------------------------------------------------------------------------
UPDATE whatsapp_cloud_messages cm
SET store_id = cc.store_id
FROM whatsapp_cloud_conversations cc
WHERE cm.conversation_id = cc.id
  AND cm.store_id       IS NULL
  AND cc.store_id       IS NOT NULL;


-- -----------------------------------------------------------------------------
-- B.6 — Recriar view whatsapp_inbox_conversations com store_id
-- -----------------------------------------------------------------------------
-- A view antiga não expunha store_id. Recreate.
-- Se a tabela legacy whatsapp_conversations não tiver store_id, esta query
-- vai dar erro — me avisa qual.

DROP VIEW IF EXISTS whatsapp_inbox_conversations;

CREATE VIEW whatsapp_inbox_conversations AS

-- Cloud API conversations
SELECT
  c.id,
  c.organization_id,
  c.store_id,
  'cloud'::TEXT                         AS provider,
  c.waba_id                             AS account_id,
  c.contact_id,
  c.wa_id                               AS phone_number,
  c.chat_id,
  c.contact_name,
  c.contact_phone,
  c.profile_picture,
  c.status,
  c.is_window_open,
  c.window_expires_at,
  c.assigned_to,
  c.unread_count,
  c.last_message_at,
  c.last_customer_message_at,
  c.last_message_preview,
  c.last_message_direction,
  c.created_at,
  c.updated_at
FROM whatsapp_cloud_conversations c

UNION ALL

-- Legacy Evolution conversations
SELECT
  lc.id,
  lc.organization_id,
  lc.store_id,
  'evolution'::TEXT                      AS provider,
  NULL::UUID                             AS account_id,
  lc.contact_id,
  lc.phone_number,
  NULL::TEXT                             AS chat_id,
  lc.contact_name,
  lc.phone_number                       AS contact_phone,
  NULL::TEXT                             AS profile_picture,
  lc.status,
  FALSE                                  AS is_window_open,
  NULL::TIMESTAMPTZ                      AS window_expires_at,
  lc.assigned_to,
  COALESCE(lc.unread_count, 0)           AS unread_count,
  lc.last_message_at,
  NULL::TIMESTAMPTZ                     AS last_customer_message_at,
  lc.last_message_preview,
  NULL::TEXT                             AS last_message_direction,
  lc.created_at,
  lc.updated_at
FROM whatsapp_conversations lc;


-- -----------------------------------------------------------------------------
-- B.7 — Validação final
-- -----------------------------------------------------------------------------
-- Esperado: 1 linha do InnovaBay com store_id='d5dfd5dd-...' e provider='cloud'

SELECT id, organization_id, store_id, provider, contact_phone,
       contact_name, last_message_at, last_message_preview, status
FROM whatsapp_inbox_conversations
WHERE organization_id = '425db1ba-99c0-4dbb-9434-27fe9cc03ec6'
ORDER BY last_message_at DESC NULLS LAST;
