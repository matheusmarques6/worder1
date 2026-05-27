-- ============================================================
-- WORDER — Inbox Unification Views (Fase 1)
--
-- Creates unified views that merge legacy (Evolution/QR)
-- conversations/messages with Cloud API conversations/messages.
-- The TypeScript inbox components can query a single view instead
-- of deciding which table to hit.
--
-- Objects created:
--   - whatsapp_inbox_conversations  (VIEW)
--   - whatsapp_inbox_messages       (VIEW)
--   - resolve_inbox_conversation    (RPC)
--   - "provider" column on legacy tables (idempotent)
--
-- Idempotent: uses CREATE OR REPLACE / IF NOT EXISTS.
-- ============================================================

-- ============================================================
-- 1. Add "provider" column to legacy tables
-- ============================================================
-- The unified view uses provider='evolution' vs provider='cloud'
-- to identify the source. Legacy rows default to 'evolution'.

DO $$ BEGIN
  ALTER TABLE whatsapp_conversations
    ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'evolution';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'whatsapp_conversations does not exist — skipping provider column';
  WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE whatsapp_messages
    ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'evolution';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'whatsapp_messages does not exist — skipping provider column';
  WHEN duplicate_column THEN NULL;
END $$;

-- ============================================================
-- 2. VIEW: whatsapp_inbox_conversations
-- ============================================================
-- Union of legacy whatsapp_conversations + whatsapp_cloud_conversations.
-- Both sides are coerced to a common column set.

CREATE OR REPLACE VIEW whatsapp_inbox_conversations AS

-- Cloud API conversations
SELECT
  c.id,
  c.organization_id,
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

-- ============================================================
-- 3. VIEW: whatsapp_inbox_messages
-- ============================================================
-- NOTE: Legacy whatsapp_messages does NOT have organization_id.
-- We JOIN through whatsapp_conversations to obtain it.
-- Legacy content is plain TEXT, not JSONB — we wrap it safely.

CREATE OR REPLACE VIEW whatsapp_inbox_messages AS

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
  NULL::TEXT                              AS media_url,
  NULL::TEXT                              AS media_filename,
  NULL::TEXT                              AS media_mime_type,
  m.template_name,
  m.status,
  m.error_code,
  m.error_message,
  FALSE                                   AS sent_by_bot,
  NULL::TIMESTAMPTZ                       AS delivered_at,
  NULL::TIMESTAMPTZ                       AS read_at,
  m.timestamp                            AS sent_at,
  m.created_at
FROM whatsapp_cloud_messages m

UNION ALL

-- Legacy Evolution messages (JOIN to get organization_id)
-- Uses only columns guaranteed to exist in the base whatsapp_messages table
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
  NULL::TEXT                              AS media_url,
  NULL::TEXT                              AS media_filename,
  NULL::TEXT                              AS media_mime_type,
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

-- ============================================================
-- 4. RPC: resolve_inbox_conversation
-- ============================================================
-- Sets conversation status='closed' in the correct underlying table,
-- regardless of provider. Returns the updated row count.

CREATE OR REPLACE FUNCTION resolve_inbox_conversation(
  p_conversation_id UUID,
  p_resolved_by     UUID DEFAULT NULL
)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  affected INTEGER := 0;
  cloud_found BOOLEAN;
BEGIN
  -- Try Cloud API table first
  UPDATE whatsapp_cloud_conversations
  SET status = 'closed', updated_at = now()
  WHERE id = p_conversation_id;
  GET DIAGNOSTICS affected = ROW_COUNT;

  IF affected > 0 THEN
    RETURN affected;
  END IF;

  -- Fall back to legacy table
  UPDATE whatsapp_conversations
  SET
    status      = 'closed',
    resolved_at = now(),
    resolved_by = p_resolved_by,
    updated_at  = now()
  WHERE id = p_conversation_id;
  GET DIAGNOSTICS affected = ROW_COUNT;

  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_inbox_conversation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_inbox_conversation(UUID, UUID) TO service_role;

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Inbox unification views created' AS resultado;
