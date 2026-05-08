-- =============================================
-- F1 — Sync triggers para reconciliar colunas redundantes que existiam
-- antes do schema canônico:
--   * whatsapp_conversations: ai_paused (canônico) ↔ ai_enabled (legado)
--   * whatsapp_messages: message_type (canônico) ↔ type (legado)
--
-- Triggers BEFORE INSERT/UPDATE garantem que ambos os pares ficam sempre
-- consistentes mesmo quando código velho/novo escreve só uma das colunas.
-- =============================================

CREATE OR REPLACE FUNCTION public.whatsapp_conv_sync_ai_flags()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ai_paused IS NULL THEN NEW.ai_paused := false; END IF;
    IF NEW.ai_enabled IS NULL THEN
      NEW.ai_enabled := NOT NEW.ai_paused;
    ELSIF NEW.ai_enabled = NEW.ai_paused THEN
      -- ambos true ou ambos false é semanticamente inconsistente:
      -- prefere ai_paused (canônico) e re-deriva ai_enabled
      NEW.ai_enabled := NOT NEW.ai_paused;
    END IF;
  ELSE
    IF NEW.ai_paused IS DISTINCT FROM OLD.ai_paused THEN
      NEW.ai_enabled := NOT NEW.ai_paused;
    ELSIF NEW.ai_enabled IS DISTINCT FROM OLD.ai_enabled THEN
      NEW.ai_paused := NOT NEW.ai_enabled;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_messages_sync_type_columns()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- message_type é a coluna canônica do schema novo. Quando ela difere
  -- de type (que pode ter default 'text'), prevalece sobre type.
  IF NEW.message_type IS NOT NULL AND NEW.message_type IS DISTINCT FROM NEW.type THEN
    NEW.type := NEW.message_type;
  ELSIF NEW.type IS NOT NULL AND NEW.message_type IS NULL THEN
    NEW.message_type := NEW.type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_conv_sync_ai_flags ON public.whatsapp_conversations;
CREATE TRIGGER trg_whatsapp_conv_sync_ai_flags
BEFORE INSERT OR UPDATE OF ai_paused, ai_enabled ON public.whatsapp_conversations
FOR EACH ROW EXECUTE FUNCTION public.whatsapp_conv_sync_ai_flags();

DROP TRIGGER IF EXISTS trg_whatsapp_messages_sync_type ON public.whatsapp_messages;
CREATE TRIGGER trg_whatsapp_messages_sync_type
BEFORE INSERT OR UPDATE OF type, message_type ON public.whatsapp_messages
FOR EACH ROW EXECUTE FUNCTION public.whatsapp_messages_sync_type_columns();
