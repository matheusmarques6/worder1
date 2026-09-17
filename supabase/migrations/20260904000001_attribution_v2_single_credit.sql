-- =============================================================
-- ATRIBUIÇÃO DE RECEITA v2 — crédito único e receita separada
--
-- Substitui o motor v1 (migrations-archive/20260513_multi_channel_
-- attribution.sql), que tinha três defeitos estruturais:
--
--   1. cada canal creditava o valor CHEIO do mesmo pedido, então a
--      soma dos canais podia passar de 100% do faturamento;
--   2. a janela era medida a partir de NOW() em vez da data do
--      pedido, então pedido processado com atraso nunca atribuía;
--   3. só existia UM número ("receita atribuída"), sem separar o
--      faturamento de quem apenas recebeu mensagem.
--
-- O modelo aqui copia o de Omnisend e Klaviyo:
--
--   • CRÉDITO ÚNICO POR PEDIDO. Um livro-razão (order_attribution)
--     com chave primária (organization_id, order_id) torna a dupla
--     contagem impossível por construção — não por disciplina de
--     código. Os três canais disputam e um só ganha.
--
--   • DUAS RECEITAS, como no relatório da Omnisend:
--       - classification='attributed' → houve engajamento dentro da
--         janela. Alimenta "receita atribuída" (attributedRevenue).
--       - classification='recipient'  → o contato recebeu mensagem na
--         janela mas não engajou. Alimenta só "receita dos
--         destinatários" (totalRevenue).
--     Por definição totalRevenue ⊇ attributedRevenue, igual à
--     Omnisend ("counted regardless of attribution classification").
--
--   • RECEITA LÍQUIDA: o valor guardado desconta reembolsos, e um
--     reembolso posterior ajusta o razão em vez de deixar o número
--     inflado para sempre.
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Colunas que faltavam nas tabelas de envio e de agregação
-- -------------------------------------------------------------

-- store_id nos envios: sem isso um envio não sabe de que loja é, e um
-- pedido da loja A podia ser creditado a um envio da loja B (o contato
-- é compartilhado pela organização inteira).
ALTER TABLE email_sends     ADD COLUMN IF NOT EXISTS store_id uuid;
ALTER TABLE whatsapp_sends  ADD COLUMN IF NOT EXISTS store_id uuid;
ALTER TABLE sms_sends       ADD COLUMN IF NOT EXISTS store_id uuid;

CREATE INDEX IF NOT EXISTS idx_email_sends_store     ON email_sends(store_id)     WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_sends_store  ON whatsapp_sends(store_id)  WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sms_sends_store       ON sms_sends(store_id)       WHERE store_id IS NOT NULL;

-- Backfill do store_id a partir da automação que gerou o envio.
UPDATE email_sends es SET store_id = a.store_id
  FROM automations a WHERE es.automation_id = a.id AND es.store_id IS NULL AND a.store_id IS NOT NULL;
UPDATE whatsapp_sends ws SET store_id = a.store_id
  FROM automations a WHERE ws.automation_id = a.id AND ws.store_id IS NULL AND a.store_id IS NOT NULL;
UPDATE sms_sends ss SET store_id = a.store_id
  FROM automations a WHERE ss.automation_id = a.id AND ss.store_id IS NULL AND a.store_id IS NOT NULL;
UPDATE email_sends es SET store_id = c.store_id
  FROM email_campaigns c WHERE es.campaign_id = c.id AND es.store_id IS NULL AND c.store_id IS NOT NULL;

-- Agregados por entidade. O painel lia colunas que ninguém escrevia:
-- automations não tinha attributed_revenue nem conversions, e
-- sms_campaigns não tinha receita nenhuma.
ALTER TABLE automations    ADD COLUMN IF NOT EXISTS attributed_revenue numeric DEFAULT 0;
ALTER TABLE automations    ADD COLUMN IF NOT EXISTS recipient_revenue  numeric DEFAULT 0;
ALTER TABLE automations    ADD COLUMN IF NOT EXISTS conversions        integer DEFAULT 0;
ALTER TABLE email_campaigns    ADD COLUMN IF NOT EXISTS recipient_revenue numeric DEFAULT 0;
ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS attributed_revenue numeric DEFAULT 0;
ALTER TABLE whatsapp_campaigns ADD COLUMN IF NOT EXISTS recipient_revenue  numeric DEFAULT 0;
ALTER TABLE sms_campaigns  ADD COLUMN IF NOT EXISTS attributed_revenue numeric DEFAULT 0;
ALTER TABLE sms_campaigns  ADD COLUMN IF NOT EXISTS recipient_revenue  numeric DEFAULT 0;
ALTER TABLE sms_campaigns  ADD COLUMN IF NOT EXISTS revenue            numeric DEFAULT 0;
ALTER TABLE sms_campaigns  ADD COLUMN IF NOT EXISTS conversions        integer DEFAULT 0;

-- Um pedido só pode marcar UM envio de e-mail. WhatsApp e SMS já
-- tinham esse índice; e-mail não, e a proteção era só um SELECT —
-- dois webhooks concorrentes (orders/create + orders/paid) passavam
-- juntos e a receita da campanha era somada duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_sends_org_order
  ON email_sends(organization_id, order_id) WHERE order_id IS NOT NULL;

-- -------------------------------------------------------------
-- 2. O livro-razão: uma linha por pedido, para sempre
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_attribution (
  organization_id  uuid        NOT NULL,
  order_id         text        NOT NULL,
  store_id         uuid,
  contact_id       uuid,

  -- Canal vencedor. NULL quando classification='recipient' (recebeu
  -- mensagem mas não engajou: entra só na receita dos destinatários).
  channel          text        CHECK (channel IN ('email','sms','whatsapp')),
  send_id          uuid,
  campaign_id      uuid,
  automation_id    uuid,

  -- 'attributed' = engajou na janela | 'recipient' = só recebeu
  classification   text        NOT NULL DEFAULT 'attributed'
                               CHECK (classification IN ('attributed','recipient')),
  attribution_model text       NOT NULL DEFAULT 'last_touch'
                               CHECK (attribution_model IN ('last_touch','first_touch')),

  engaged_at       timestamptz,   -- o toque que venceu a disputa
  order_at         timestamptz    NOT NULL,
  gross_revenue    numeric        NOT NULL DEFAULT 0,
  refunded         numeric        NOT NULL DEFAULT 0,
  -- Receita líquida. Coluna gerada: nunca fica dessincronizada do par
  -- bruto/reembolso, e nunca negativa (reembolso maior que o pedido
  -- acontece com troca + frete).
  net_revenue      numeric        GENERATED ALWAYS AS (GREATEST(gross_revenue - refunded, 0)) STORED,
  currency         text           NOT NULL DEFAULT 'BRL',

  revoked_at       timestamptz,   -- cancelamento: sai das somas
  created_at       timestamptz    NOT NULL DEFAULT now(),
  updated_at       timestamptz    NOT NULL DEFAULT now(),

  -- A chave primária é a garantia estrutural do crédito único.
  PRIMARY KEY (organization_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_attr_org_date    ON order_attribution(organization_id, order_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_attr_store       ON order_attribution(store_id, order_at DESC) WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_attr_campaign    ON order_attribution(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_attr_automation  ON order_attribution(automation_id) WHERE automation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_attr_send        ON order_attribution(channel, send_id) WHERE send_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_attr_live        ON order_attribution(organization_id, classification)
  WHERE revoked_at IS NULL;

ALTER TABLE order_attribution ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_attribution' AND policyname='order_attribution_org_isolation') THEN
    CREATE POLICY order_attribution_org_isolation ON order_attribution
      FOR ALL USING (
        organization_id IN (
          SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

COMMENT ON TABLE order_attribution IS
  'Crédito único por pedido (modelo Omnisend/Klaviyo). A PK (organization_id, order_id) impede dupla contagem entre canais por construção. classification separa receita atribuída de receita dos destinatários.';

-- -------------------------------------------------------------
-- 3. Candidatos: quem disputa o crédito de um pedido
-- -------------------------------------------------------------
-- Retorna, por canal, o melhor toque dentro da janela — com a janela
-- medida a partir da DATA DO PEDIDO (não de NOW(), que era o defeito
-- do motor v1 e zerava toda atribuição de pedido processado depois).
CREATE OR REPLACE FUNCTION attribution_candidates(
  p_organization_id uuid,
  p_contact_id      uuid,
  p_order_at        timestamptz,
  p_store_id        uuid    DEFAULT NULL,
  p_email_days      integer DEFAULT 5,
  p_whatsapp_days   integer DEFAULT 2,
  p_sms_days        integer DEFAULT 2,
  p_count_opens     boolean DEFAULT true,
  p_exclude_mpp     boolean DEFAULT true,
  p_model           text    DEFAULT 'last_touch'
)
RETURNS TABLE (
  channel       text,
  send_id       uuid,
  campaign_id   uuid,
  automation_id uuid,
  engaged_at    timestamptz,
  sent_at       timestamptz,
  engaged       boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH email_c AS (
    SELECT 'email'::text AS channel, es.id, es.campaign_id, es.automation_id,
           COALESCE(es.clicked_at, es.opened_at,
                    CASE WHEN NOT p_exclude_mpp THEN es.mpp_opened_at END) AS engaged_at,
           es.sent_at,
           (es.clicked_at IS NOT NULL
             OR (p_count_opens AND es.opened_at IS NOT NULL)
             OR (p_count_opens AND NOT p_exclude_mpp AND es.mpp_opened_at IS NOT NULL)) AS engaged
    FROM email_sends es
    WHERE es.organization_id = p_organization_id
      AND es.contact_id = p_contact_id
      AND es.sent_at <= p_order_at
      AND es.sent_at >= p_order_at - (p_email_days || ' days')::interval
      -- Escopo de loja: um envio sem loja (legado/org-wide) segue
      -- elegível; um envio de OUTRA loja nunca.
      AND (p_store_id IS NULL OR es.store_id IS NULL OR es.store_id = p_store_id)
      -- Envio que voltou (bounce) ou virou denúncia de spam não pode
      -- levar crédito: a mensagem não chegou a ser lida.
      AND es.bounced_at IS NULL AND es.complained_at IS NULL
      -- O engajamento tem de ser ANTERIOR ao pedido. Sem isto, um
      -- pedido reprocessado horas depois era creditado a uma abertura
      -- que só aconteceu DEPOIS da compra.
      AND (es.clicked_at    IS NULL OR es.clicked_at    <= p_order_at)
      AND (es.opened_at     IS NULL OR es.opened_at     <= p_order_at)
  ),
  wa_c AS (
    SELECT 'whatsapp'::text, ws.id, ws.campaign_id, ws.automation_id,
           COALESCE(ws.replied_at, ws.read_at, ws.delivered_at) AS engaged_at,
           ws.sent_at,
           (ws.replied_at IS NOT NULL OR ws.read_at IS NOT NULL OR ws.delivered_at IS NOT NULL) AS engaged
    FROM whatsapp_sends ws
    WHERE ws.organization_id = p_organization_id
      AND ws.contact_id = p_contact_id
      AND ws.sent_at <= p_order_at
      AND ws.sent_at >= p_order_at - (p_whatsapp_days || ' days')::interval
      AND (p_store_id IS NULL OR ws.store_id IS NULL OR ws.store_id = p_store_id)
      AND (ws.replied_at   IS NULL OR ws.replied_at   <= p_order_at)
      AND (ws.read_at      IS NULL OR ws.read_at      <= p_order_at)
      AND (ws.delivered_at IS NULL OR ws.delivered_at <= p_order_at)
  ),
  sms_c AS (
    SELECT 'sms'::text, ss.id, ss.campaign_id, ss.automation_id,
           COALESCE(ss.clicked_at, ss.delivered_at) AS engaged_at,
           ss.sent_at,
           (ss.clicked_at IS NOT NULL OR ss.delivered_at IS NOT NULL) AS engaged
    FROM sms_sends ss
    WHERE ss.organization_id = p_organization_id
      AND ss.contact_id = p_contact_id
      AND ss.sent_at <= p_order_at
      AND ss.sent_at >= p_order_at - (p_sms_days || ' days')::interval
      AND (p_store_id IS NULL OR ss.store_id IS NULL OR ss.store_id = p_store_id)
      AND (ss.clicked_at   IS NULL OR ss.clicked_at   <= p_order_at)
      AND (ss.delivered_at IS NULL OR ss.delivered_at <= p_order_at)
  ),
  todos AS (
    SELECT * FROM email_c UNION ALL SELECT * FROM wa_c UNION ALL SELECT * FROM sms_c
  )
  SELECT channel, id, campaign_id, automation_id, engaged_at, sent_at, engaged
  FROM todos
  ORDER BY
    -- 1) quem engajou vence quem só recebeu, sempre;
    engaged DESC,
    -- 2) entre engajados: último toque (ou primeiro, se o lojista
    --    escolheu first_touch — no v1 essa opção não fazia nada);
    CASE WHEN p_model = 'first_touch' THEN COALESCE(engaged_at, sent_at) END ASC NULLS LAST,
    CASE WHEN p_model <> 'first_touch' THEN COALESCE(engaged_at, sent_at) END DESC NULLS LAST,
    -- 3) desempate estável entre canais.
    sent_at DESC, id;
$$;

-- -------------------------------------------------------------
-- 4. Atribuir um pedido (ponto de entrada único)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION attribute_order(
  p_organization_id uuid,
  p_order_id        text,
  p_contact_id      uuid,
  p_order_at        timestamptz,
  p_gross_revenue   numeric,
  p_refunded        numeric  DEFAULT 0,
  p_currency        text     DEFAULT 'BRL',
  p_store_id        uuid     DEFAULT NULL,
  p_email_days      integer  DEFAULT 5,
  p_whatsapp_days   integer  DEFAULT 2,
  p_sms_days        integer  DEFAULT 2,
  p_count_opens     boolean  DEFAULT true,
  p_exclude_mpp     boolean  DEFAULT true,
  p_model           text     DEFAULT 'last_touch'
)
RETURNS order_attribution
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cand   record;
  v_row    order_attribution;
BEGIN
  IF p_contact_id IS NULL OR p_order_id IS NULL THEN
    RETURN NULL;  -- pedido sem contato não é atribuível
  END IF;

  SELECT * INTO v_cand
  FROM attribution_candidates(
    p_organization_id, p_contact_id, p_order_at, p_store_id,
    p_email_days, p_whatsapp_days, p_sms_days,
    p_count_opens, p_exclude_mpp, p_model
  )
  LIMIT 1;

  IF v_cand IS NULL THEN
    RETURN NULL;  -- não recebeu mensagem na janela: fora do razão
  END IF;

  -- INSERT ... ON CONFLICT é o que torna a dupla contagem impossível
  -- mesmo com dois webhooks concorrentes (orders/create + orders/paid
  -- chegam juntos e o Shopify reenvia até 8x). O primeiro grava; os
  -- demais só atualizam valor/reembolso, nunca somam de novo.
  INSERT INTO order_attribution AS oa (
    organization_id, order_id, store_id, contact_id,
    channel, send_id, campaign_id, automation_id,
    classification, attribution_model, engaged_at, order_at,
    gross_revenue, refunded, currency
  ) VALUES (
    p_organization_id, p_order_id, p_store_id, p_contact_id,
    CASE WHEN v_cand.engaged THEN v_cand.channel ELSE NULL END,
    CASE WHEN v_cand.engaged THEN v_cand.send_id ELSE NULL END,
    CASE WHEN v_cand.engaged THEN v_cand.campaign_id ELSE NULL END,
    CASE WHEN v_cand.engaged THEN v_cand.automation_id ELSE NULL END,
    CASE WHEN v_cand.engaged THEN 'attributed' ELSE 'recipient' END,
    p_model, v_cand.engaged_at, p_order_at,
    COALESCE(p_gross_revenue, 0), COALESCE(p_refunded, 0), COALESCE(p_currency, 'BRL')
  )
  ON CONFLICT (organization_id, order_id) DO UPDATE SET
    gross_revenue = GREATEST(oa.gross_revenue, EXCLUDED.gross_revenue),
    refunded      = GREATEST(oa.refunded, EXCLUDED.refunded),
    store_id      = COALESCE(oa.store_id, EXCLUDED.store_id),
    -- Promoção: um pedido que entrou como 'recipient' pode virar
    -- 'attributed' se a abertura/clique chegar depois (o pixel de
    -- abertura costuma atrasar). O caminho inverso nunca acontece.
    channel        = CASE WHEN oa.classification = 'recipient' AND EXCLUDED.classification = 'attributed'
                          THEN EXCLUDED.channel ELSE oa.channel END,
    send_id        = CASE WHEN oa.classification = 'recipient' AND EXCLUDED.classification = 'attributed'
                          THEN EXCLUDED.send_id ELSE oa.send_id END,
    campaign_id    = CASE WHEN oa.classification = 'recipient' AND EXCLUDED.classification = 'attributed'
                          THEN EXCLUDED.campaign_id ELSE oa.campaign_id END,
    automation_id  = CASE WHEN oa.classification = 'recipient' AND EXCLUDED.classification = 'attributed'
                          THEN EXCLUDED.automation_id ELSE oa.automation_id END,
    engaged_at     = CASE WHEN oa.classification = 'recipient' AND EXCLUDED.classification = 'attributed'
                          THEN EXCLUDED.engaged_at ELSE oa.engaged_at END,
    classification = CASE WHEN oa.classification = 'recipient' AND EXCLUDED.classification = 'attributed'
                          THEN 'attributed' ELSE oa.classification END,
    -- revoked_at NÃO é limpo aqui. No motor v1 o revoke zerava o
    -- order_id do envio, e qualquer reentrega do webhook (o Shopify
    -- reenvia até 8x) recreditava o pedido cancelado. Uma vez
    -- revogado, só um revoke explícito reverte.
    updated_at    = now()
  RETURNING * INTO v_row;

  -- Espelha na linha do envio (as telas de campanha/automação leem daí).
  IF v_row.classification = 'attributed' AND v_row.send_id IS NOT NULL THEN
    IF v_row.channel = 'email' THEN
      UPDATE email_sends SET conversion_value = v_row.net_revenue, converted_at = COALESCE(converted_at, now()), order_id = v_row.order_id
        WHERE id = v_row.send_id;
    ELSIF v_row.channel = 'whatsapp' THEN
      UPDATE whatsapp_sends SET conversion_value = v_row.net_revenue, converted_at = COALESCE(converted_at, now()), order_id = v_row.order_id
        WHERE id = v_row.send_id;
    ELSIF v_row.channel = 'sms' THEN
      UPDATE sms_sends SET conversion_value = v_row.net_revenue, converted_at = COALESCE(converted_at, now()), order_id = v_row.order_id
        WHERE id = v_row.send_id;
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

-- -------------------------------------------------------------
-- 5. Reembolso e cancelamento
-- -------------------------------------------------------------
-- Reembolso PARCIAL ajusta o valor; total zera. Antes só o
-- cancelamento revogava, então todo reembolso deixava a receita
-- atribuída inflada para sempre.
CREATE OR REPLACE FUNCTION refund_order_attribution(
  p_organization_id uuid,
  p_order_id        text,
  p_refunded_total  numeric
)
RETURNS order_attribution
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row order_attribution;
BEGIN
  UPDATE order_attribution
     SET refunded = GREATEST(COALESCE(p_refunded_total, 0), refunded),
         updated_at = now()
   WHERE organization_id = p_organization_id AND order_id = p_order_id
  RETURNING * INTO v_row;

  IF v_row.send_id IS NOT NULL THEN
    IF v_row.channel = 'email' THEN
      UPDATE email_sends SET conversion_value = v_row.net_revenue WHERE id = v_row.send_id;
    ELSIF v_row.channel = 'whatsapp' THEN
      UPDATE whatsapp_sends SET conversion_value = v_row.net_revenue WHERE id = v_row.send_id;
    ELSIF v_row.channel = 'sms' THEN
      UPDATE sms_sends SET conversion_value = v_row.net_revenue WHERE id = v_row.send_id;
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION revoke_order_attribution(
  p_organization_id uuid,
  p_order_id        text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row order_attribution;
BEGIN
  UPDATE order_attribution SET revoked_at = now(), updated_at = now()
   WHERE organization_id = p_organization_id AND order_id = p_order_id AND revoked_at IS NULL
  RETURNING * INTO v_row;

  IF v_row.send_id IS NOT NULL THEN
    IF v_row.channel = 'email' THEN
      UPDATE email_sends SET conversion_value = 0, converted_at = NULL WHERE id = v_row.send_id;
    ELSIF v_row.channel = 'whatsapp' THEN
      UPDATE whatsapp_sends SET conversion_value = 0, converted_at = NULL WHERE id = v_row.send_id;
    ELSIF v_row.channel = 'sms' THEN
      UPDATE sms_sends SET conversion_value = 0, converted_at = NULL WHERE id = v_row.send_id;
    END IF;
  END IF;

  RETURN v_row.order_id IS NOT NULL;
END;
$$;

-- -------------------------------------------------------------
-- 6. Agregados derivados do razão (nunca incrementais)
-- -------------------------------------------------------------
-- Os contadores do v1 eram somas incrementais (revenue = revenue + x),
-- que dessincronizam a cada retry ou revogação. Aqui os totais são
-- sempre RECALCULADOS a partir do razão — a fonte única da verdade.
CREATE OR REPLACE FUNCTION refresh_attribution_totals(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE email_campaigns c SET
    attributed_revenue = t.attributed, revenue = t.attributed,
    recipient_revenue = t.recipient, conversions = t.orders
  FROM (
    SELECT campaign_id,
           SUM(net_revenue) FILTER (WHERE classification='attributed') AS attributed,
           SUM(net_revenue) AS recipient,
           COUNT(*) FILTER (WHERE classification='attributed') AS orders
    FROM order_attribution
    WHERE organization_id = p_organization_id AND revoked_at IS NULL AND campaign_id IS NOT NULL AND channel='email'
    GROUP BY campaign_id
  ) t WHERE c.id = t.campaign_id;

  UPDATE whatsapp_campaigns c SET
    attributed_revenue = t.attributed, revenue = t.attributed,
    recipient_revenue = t.recipient, conversions = t.orders
  FROM (
    SELECT campaign_id,
           SUM(net_revenue) FILTER (WHERE classification='attributed') AS attributed,
           SUM(net_revenue) AS recipient,
           COUNT(*) FILTER (WHERE classification='attributed') AS orders
    FROM order_attribution
    WHERE organization_id = p_organization_id AND revoked_at IS NULL AND campaign_id IS NOT NULL AND channel='whatsapp'
    GROUP BY campaign_id
  ) t WHERE c.id = t.campaign_id;

  UPDATE sms_campaigns c SET
    attributed_revenue = t.attributed, revenue = t.attributed,
    recipient_revenue = t.recipient, conversions = t.orders
  FROM (
    SELECT campaign_id,
           SUM(net_revenue) FILTER (WHERE classification='attributed') AS attributed,
           SUM(net_revenue) AS recipient,
           COUNT(*) FILTER (WHERE classification='attributed') AS orders
    FROM order_attribution
    WHERE organization_id = p_organization_id AND revoked_at IS NULL AND campaign_id IS NOT NULL AND channel='sms'
    GROUP BY campaign_id
  ) t WHERE c.id = t.campaign_id;

  -- Automações: as colunas existiam e NINGUÉM escrevia nelas — o card
  -- "Automações" do painel era zero permanente, mesmo com conversão.
  UPDATE automations a SET
    attributed_revenue = t.attributed, total_revenue = t.attributed,
    recipient_revenue = t.recipient, conversions = t.orders
  FROM (
    SELECT automation_id,
           SUM(net_revenue) FILTER (WHERE classification='attributed') AS attributed,
           SUM(net_revenue) AS recipient,
           COUNT(*) FILTER (WHERE classification='attributed') AS orders
    FROM order_attribution
    WHERE organization_id = p_organization_id AND revoked_at IS NULL AND automation_id IS NOT NULL
    GROUP BY automation_id
  ) t WHERE a.id = t.automation_id;
END;
$$;

-- Mantém os agregados vivos sem depender de cron.
CREATE OR REPLACE FUNCTION trg_refresh_attribution_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM refresh_attribution_totals(COALESCE(NEW.organization_id, OLD.organization_id));
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS order_attribution_totals ON order_attribution;
CREATE TRIGGER order_attribution_totals
  AFTER INSERT OR UPDATE OR DELETE ON order_attribution
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_attribution_totals();

-- -------------------------------------------------------------
-- 7. Relatório: as duas receitas lado a lado (modelo Omnisend)
-- -------------------------------------------------------------
CREATE OR REPLACE VIEW v_attribution_report AS
SELECT
  organization_id,
  store_id,
  date_trunc('day', order_at)                                        AS dia,
  COALESCE(channel, 'none')                                          AS canal,
  currency,
  -- attributedRevenue / attributedOrders
  COUNT(*) FILTER (WHERE classification = 'attributed')              AS attributed_orders,
  COALESCE(SUM(net_revenue) FILTER (WHERE classification='attributed'), 0) AS attributed_revenue,
  -- totalRevenue / totalOrders: TODO pedido de quem recebeu mensagem,
  -- engajando ou não — é a segunda métrica que Omnisend e Klaviyo
  -- mostram ao lado da atribuída, e que a Worder não tinha.
  COUNT(*)                                                           AS recipient_orders,
  COALESCE(SUM(net_revenue), 0)                                      AS recipient_revenue
FROM order_attribution
WHERE revoked_at IS NULL
GROUP BY organization_id, store_id, date_trunc('day', order_at), COALESCE(channel,'none'), currency;

COMMENT ON VIEW v_attribution_report IS
  'attributed_* = pedidos com engajamento na janela. recipient_* = todos os pedidos de quem recebeu mensagem (superconjunto), equivalente a totalRevenue/totalOrders da Omnisend.';

-- -------------------------------------------------------------
-- 8. Backfill — recuperar o histórico já perdido
-- -------------------------------------------------------------
-- Sem isto, todo envio feito antes do webhook estar ligado é receita
-- perdida para sempre. Reprocessa os pedidos de uma janela.
CREATE OR REPLACE FUNCTION backfill_order_attribution(
  p_organization_id uuid,
  p_since           timestamptz DEFAULT now() - interval '90 days',
  p_email_days      integer DEFAULT 5,
  p_whatsapp_days   integer DEFAULT 2,
  p_sms_days        integer DEFAULT 2,
  p_model           text    DEFAULT 'last_touch'
)
RETURNS TABLE (pedidos_processados integer, atribuidos integer, apenas_destinatarios integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o        record;
  v_row    order_attribution;
  n_total  integer := 0;
  n_attr   integer := 0;
  n_recip  integer := 0;
BEGIN
  FOR o IN
    SELECT id, shopify_order_id, contact_id, store_id, total_price, total_refunded,
           COALESCE(shopify_created_at, created_at) AS order_at
    FROM shopify_orders
    WHERE organization_id = p_organization_id
      AND contact_id IS NOT NULL
      AND COALESCE(shopify_created_at, created_at) >= p_since
    ORDER BY COALESCE(shopify_created_at, created_at)
  LOOP
    n_total := n_total + 1;
    v_row := attribute_order(
      p_organization_id,
      COALESCE(o.shopify_order_id::text, o.id::text),
      o.contact_id,
      o.order_at,
      COALESCE(o.total_price, 0),
      COALESCE(o.total_refunded, 0),
      'BRL',
      o.store_id,
      p_email_days, p_whatsapp_days, p_sms_days,
      true, true, p_model
    );
    IF v_row.order_id IS NOT NULL THEN
      IF v_row.classification = 'attributed' THEN n_attr := n_attr + 1;
      ELSE n_recip := n_recip + 1; END IF;
    END IF;
  END LOOP;

  PERFORM refresh_attribution_totals(p_organization_id);
  RETURN QUERY SELECT n_total, n_attr, n_recip;
END;
$$;

-- -------------------------------------------------------------
-- 9. Permissões
-- -------------------------------------------------------------
GRANT SELECT ON order_attribution   TO authenticated;
GRANT SELECT ON v_attribution_report TO authenticated;
GRANT EXECUTE ON FUNCTION attribution_candidates      TO service_role;
GRANT EXECUTE ON FUNCTION attribute_order             TO service_role;
GRANT EXECUTE ON FUNCTION refund_order_attribution    TO service_role;
GRANT EXECUTE ON FUNCTION revoke_order_attribution    TO service_role;
GRANT EXECUTE ON FUNCTION refresh_attribution_totals  TO service_role;
GRANT EXECUTE ON FUNCTION backfill_order_attribution  TO service_role;
