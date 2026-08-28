-- =====================================================
-- Phase 0 / 0D — Recipient idempotency foundations
-- =====================================================
-- Adiciona o status intermediário 'sending' e a coluna sending_at em
-- whatsapp_campaign_recipients. O pre-mark otimista pending|queued -> sending
-- (recipient-claim.ts) fecha a janela de double-send entre a chamada à Meta
-- (que NÃO tem idempotency key) e a escrita 'sent'. Um cron de quarentena
-- depois flipa linhas 'sending' presas (>10min) para 'failed'.
--
-- A tabela whatsapp_campaign_recipients vem de supabase/campaigns-schema.sql
-- onde `status VARCHAR(20) DEFAULT 'pending'` NÃO possui CHECK no schema base.
-- Ambientes podem ter recebido um CHECK fora de banda; por isso o ALTER é
-- idempotente (DROP IF EXISTS + ADD) e guardado por to_regclass.
--
-- Os TRÊS passos vivem DENTRO do bloco guardado. O índice do passo 3 ficou de
-- fora até 28/08 e derrubava `supabase start` num banco limpo com 42P01: o
-- `IF NOT EXISTS` fala sobre o índice, nunca sobre a tabela. Como
-- campaigns-schema.sql não é migration, a tabela não existe no stack do CI —
-- e o job tests-db (a suíte db/rls/pipeline inteira) nunca chegou a rodar.
-- =====================================================

DO $phase0$
BEGIN
  IF to_regclass('public.whatsapp_campaign_recipients') IS NULL THEN
    RAISE NOTICE 'whatsapp_campaign_recipients ausente — pulando migração 0D';
    RETURN;
  END IF;

  -- 1) Coluna sending_at (timestamp do pre-mark otimista).
  ALTER TABLE whatsapp_campaign_recipients
    ADD COLUMN IF NOT EXISTS sending_at TIMESTAMPTZ;

  -- 2) CHECK de status incluindo 'sending'. Recriado idempotentemente.
  --    Conjunto de status alinhado ao uso atual no código
  --    (pending, queued, sending, sent, delivered, read, clicked, replied,
  --     failed, skipped) — superset seguro; não restringe valores já gravados.
  ALTER TABLE whatsapp_campaign_recipients
    DROP CONSTRAINT IF EXISTS whatsapp_campaign_recipients_status_check;
  ALTER TABLE whatsapp_campaign_recipients
    ADD CONSTRAINT whatsapp_campaign_recipients_status_check
    CHECK (status IN (
      'pending',
      'queued',
      'sending',
      'sent',
      'delivered',
      'read',
      'clicked',
      'replied',
      'failed',
      'skipped'
    ));

  -- 3) Índice parcial para o sweep de quarentena (linhas 'sending' antigas).
  --    Mantém o flip O(janela) barato e o re-read pending|queued seletivo.
  CREATE INDEX IF NOT EXISTS idx_recipients_sending_at
    ON whatsapp_campaign_recipients(sending_at)
    WHERE status = 'sending';
END
$phase0$;
