-- ============================================================
-- WORDER — Fase 7: Queries de Métricas Estratégicas
--
-- Queries para dashboard de decisão estratégica.
-- Executar no Supabase SQL Editor ou ferramenta de BI.
--
-- Pré-requisito: schema das Fases 1–6 aplicado.
-- ============================================================


-- ============================================================
-- 1. DISTRIBUIÇÃO DE RECEITA POR SEGMENTO DE CLIENTE
-- ============================================================
-- Identifica concentração de receita e dependência de grandes contas.

SELECT
  CASE
    WHEN COALESCE(o.monthly_spend_usd, 0) >= 1000 THEN 'Enterprise (≥ USD 1000)'
    WHEN COALESCE(o.monthly_spend_usd, 0) >= 300  THEN 'Mid-Market (USD 300–999)'
    WHEN COALESCE(o.monthly_spend_usd, 0) >= 50   THEN 'SMB (USD 50–299)'
    ELSE 'Free / Trial (< USD 50)'
  END AS segmento,
  COUNT(*)                                         AS total_orgs,
  ROUND(SUM(COALESCE(o.monthly_spend_usd, 0)), 2) AS receita_total_usd,
  ROUND(AVG(COALESCE(o.monthly_spend_usd, 0)), 2) AS ticket_medio_usd,
  ROUND(
    100.0 * SUM(COALESCE(o.monthly_spend_usd, 0))
    / NULLIF(SUM(SUM(COALESCE(o.monthly_spend_usd, 0))) OVER (), 0),
    1
  )                                                 AS pct_receita
FROM organizations o
WHERE o.status = 'active'
GROUP BY 1
ORDER BY receita_total_usd DESC;


-- ============================================================
-- 2. TOP 20 CLIENTES POR GASTO META (MENSAGENS)
-- ============================================================
-- Identifica as contas que mais gastam com WhatsApp para
-- priorizar migração Cloud API e upsell.

SELECT
  o.id                        AS org_id,
  o.name                      AS org_name,
  o.plan                      AS plano,
  wba.phone_number            AS whatsapp_number,
  wba.quality_rating,
  wba.messaging_limit,
  COUNT(wcm.id)               AS msgs_enviadas_30d,
  COUNT(wcm.id) FILTER (
    WHERE wcm.status = 'delivered'
  )                           AS msgs_entregues_30d,
  ROUND(
    100.0 * COUNT(wcm.id) FILTER (WHERE wcm.status = 'delivered')
    / NULLIF(COUNT(wcm.id), 0),
    1
  )                           AS taxa_entrega_pct
FROM organizations o
JOIN whatsapp_business_accounts wba ON wba.organization_id = o.id
LEFT JOIN whatsapp_cloud_messages wcm
  ON wcm.waba_id = wba.id
  AND wcm.direction = 'outbound'
  AND wcm.created_at >= NOW() - INTERVAL '30 days'
WHERE o.status = 'active'
GROUP BY o.id, o.name, o.plan, wba.phone_number, wba.quality_rating, wba.messaging_limit
ORDER BY msgs_enviadas_30d DESC
LIMIT 20;


-- ============================================================
-- 3. CONVERSÃO SIGNUP → PAGO
-- ============================================================
-- Funil de conversão para informar decisão de self-service pricing.

WITH signups AS (
  SELECT
    DATE_TRUNC('month', created_at)  AS mes,
    COUNT(*)                         AS total_signups
  FROM organizations
  WHERE created_at >= NOW() - INTERVAL '6 months'
  GROUP BY 1
),
paid AS (
  SELECT
    DATE_TRUNC('month', o.created_at) AS mes,
    COUNT(*)                           AS total_paid
  FROM organizations o
  WHERE o.plan NOT IN ('free', 'trial')
    AND o.created_at >= NOW() - INTERVAL '6 months'
  GROUP BY 1
)
SELECT
  s.mes,
  s.total_signups,
  COALESCE(p.total_paid, 0)              AS convertidos_para_pago,
  ROUND(
    100.0 * COALESCE(p.total_paid, 0)
    / NULLIF(s.total_signups, 0),
    1
  )                                       AS taxa_conversao_pct
FROM signups s
LEFT JOIN paid p ON p.mes = s.mes
ORDER BY s.mes;


-- ============================================================
-- 4. CRESCIMENTO MRR MENSAL
-- ============================================================
-- Tracking de Monthly Recurring Revenue para investidores e decisão.

SELECT
  DATE_TRUNC('month', created_at) AS mes,
  COUNT(*) FILTER (
    WHERE plan NOT IN ('free', 'trial')
  )                               AS clientes_pagantes,
  ROUND(SUM(
    CASE
      WHEN plan = 'starter' THEN 99
      WHEN plan = 'growth'  THEN 299
      WHEN plan = 'pro'     THEN 599
      WHEN plan = 'enterprise' THEN 1500
      ELSE COALESCE(monthly_spend_usd * 5.0, 0)  -- fallback: estimativa BRL
    END
  ), 2)                           AS mrr_estimado_brl,
  ROUND(SUM(
    CASE
      WHEN plan = 'starter' THEN 99
      WHEN plan = 'growth'  THEN 299
      WHEN plan = 'pro'     THEN 599
      WHEN plan = 'enterprise' THEN 1500
      ELSE COALESCE(monthly_spend_usd * 5.0, 0)
    END
  ) - LAG(SUM(
    CASE
      WHEN plan = 'starter' THEN 99
      WHEN plan = 'growth'  THEN 299
      WHEN plan = 'pro'     THEN 599
      WHEN plan = 'enterprise' THEN 1500
      ELSE COALESCE(monthly_spend_usd * 5.0, 0)
    END
  )) OVER (ORDER BY DATE_TRUNC('month', created_at)), 2) AS delta_mrr_brl
FROM organizations
WHERE status = 'active'
GROUP BY 1
ORDER BY 1;


-- ============================================================
-- 5. TAXA DE CHURN MENSAL
-- ============================================================
-- Churn = orgs que eram ativas no mês anterior e não estão mais.

WITH monthly_active AS (
  SELECT
    DATE_TRUNC('month', d.dt)     AS mes,
    o.id                          AS org_id
  FROM organizations o
  CROSS JOIN LATERAL generate_series(
    GREATEST(o.created_at, NOW() - INTERVAL '6 months'),
    COALESCE(o.deactivated_at, NOW()),
    INTERVAL '1 month'
  ) AS d(dt)
  WHERE o.status IN ('active', 'inactive', 'churned')
),
churn_calc AS (
  SELECT
    ma.mes,
    COUNT(DISTINCT ma.org_id) AS ativas_inicio,
    COUNT(DISTINCT ma.org_id) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM monthly_active ma2
        WHERE ma2.org_id = ma.org_id
          AND ma2.mes = ma.mes + INTERVAL '1 month'
      )
    ) AS churned
  FROM monthly_active ma
  WHERE ma.mes < DATE_TRUNC('month', NOW())  -- não contar mês atual
  GROUP BY 1
)
SELECT
  mes,
  ativas_inicio,
  churned,
  ROUND(100.0 * churned / NULLIF(ativas_inicio, 0), 2) AS churn_rate_pct
FROM churn_calc
ORDER BY mes;


-- ============================================================
-- 6. NPS PROXY — RETENÇÃO EM DIAS
-- ============================================================
-- Sem pesquisa NPS formal, usamos retenção como proxy de satisfação.

SELECT
  o.id                            AS org_id,
  o.name                          AS org_name,
  o.plan,
  o.created_at,
  EXTRACT(DAY FROM NOW() - o.created_at)::INT AS dias_retido,
  CASE
    WHEN EXTRACT(DAY FROM NOW() - o.created_at) >= 365 THEN 'Promoter (1+ ano)'
    WHEN EXTRACT(DAY FROM NOW() - o.created_at) >= 90  THEN 'Passive (3–12 meses)'
    ELSE 'Detractor risk (< 3 meses)'
  END AS nps_proxy_segment,
  (
    SELECT COUNT(*)
    FROM whatsapp_cloud_messages wcm
    JOIN whatsapp_business_accounts wba ON wcm.waba_id = wba.id
    WHERE wba.organization_id = o.id
      AND wcm.created_at >= NOW() - INTERVAL '30 days'
  ) AS msgs_ultimos_30d
FROM organizations o
WHERE o.status = 'active'
ORDER BY dias_retido DESC;


-- ============================================================
-- 7. RESUMO NPS PROXY — DISTRIBUIÇÃO
-- ============================================================

SELECT
  CASE
    WHEN EXTRACT(DAY FROM NOW() - created_at) >= 365 THEN 'Promoter (1+ ano)'
    WHEN EXTRACT(DAY FROM NOW() - created_at) >= 90  THEN 'Passive (3–12 meses)'
    ELSE 'Detractor risk (< 3 meses)'
  END AS segmento,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS pct
FROM organizations
WHERE status = 'active'
GROUP BY 1
ORDER BY total DESC;


-- ============================================================
-- 8. KPIs POR VETOR ESTRATÉGICO
-- ============================================================

-- 8a. Vetor D — Self-Service Pricing
-- Mede prontidão para self-service: quantos se inscreveram sem demo?

SELECT
  'Self-Service Readiness' AS kpi,
  COUNT(*) FILTER (WHERE onboarding_source = 'self_signup')   AS signups_organicos,
  COUNT(*) FILTER (WHERE onboarding_source = 'demo')          AS signups_via_demo,
  COUNT(*) FILTER (WHERE plan = 'trial')                      AS em_trial_agora,
  ROUND(AVG(
    CASE WHEN plan = 'trial'
      THEN EXTRACT(DAY FROM NOW() - created_at)
    END
  ), 0)                                                        AS media_dias_em_trial
FROM organizations
WHERE created_at >= NOW() - INTERVAL '6 months';


-- 8b. Vetor G — Solution Partner
-- Volume de mensagens (requisito Meta para partnership).

SELECT
  'Solution Partner Volume' AS kpi,
  COUNT(*)                                                    AS total_msgs_30d,
  COUNT(*) FILTER (WHERE direction = 'outbound')              AS outbound_30d,
  COUNT(*) FILTER (WHERE direction = 'inbound')               AS inbound_30d,
  COUNT(DISTINCT wcm.waba_id)                                 AS wabas_ativos,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'delivered')::NUMERIC
    / NULLIF(COUNT(*) FILTER (WHERE direction = 'outbound'), 0) * 100,
    1
  )                                                           AS delivery_rate_pct
FROM whatsapp_cloud_messages wcm
WHERE wcm.created_at >= NOW() - INTERVAL '30 days';


-- 8c. Vetor A — Flows
-- Adoção de WhatsApp Flows (Fase 6).

SELECT
  'Flows Adoption' AS kpi,
  COUNT(DISTINCT f.id)                                       AS total_flows,
  COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'published') AS flows_publicados,
  COUNT(DISTINCT fe.id)                                      AS total_flow_events_30d,
  COUNT(DISTINCT fe.contact_id)                              AS contatos_unicos_flows_30d
FROM whatsapp_cloud_flows f
LEFT JOIN whatsapp_flow_events fe
  ON fe.flow_id = f.id
  AND fe.created_at >= NOW() - INTERVAL '30 days';


-- 8d. Vetor C — Deprecação BSP
-- Quantos clientes ainda usam BSP vs Cloud API.

SELECT
  'BSP vs Cloud API' AS kpi,
  COUNT(*) FILTER (WHERE wba.api_mode = 'cloud')  AS orgs_cloud_api,
  COUNT(*) FILTER (WHERE wba.api_mode = 'bsp')    AS orgs_bsp_legado,
  COUNT(*) FILTER (WHERE wba.api_mode IS NULL)     AS orgs_sem_whatsapp,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE wba.api_mode = 'cloud')
    / NULLIF(COUNT(*), 0),
    1
  )                                                AS pct_migrados
FROM organizations o
LEFT JOIN whatsapp_business_accounts wba ON wba.organization_id = o.id
WHERE o.status = 'active';


-- 8e. Vetor B — Suite
-- Engajamento cross-channel: quem usa WhatsApp + email + CRM?

SELECT
  'Suite Readiness' AS kpi,
  COUNT(DISTINCT o.id) AS total_orgs_ativas,
  COUNT(DISTINCT o.id) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM whatsapp_business_accounts wba
      WHERE wba.organization_id = o.id
    )
  ) AS usam_whatsapp,
  COUNT(DISTINCT o.id) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM email_campaigns ec
      WHERE ec.organization_id = o.id
    )
  ) AS usam_email,
  COUNT(DISTINCT o.id) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM deals d
      WHERE d.organization_id = o.id
    )
  ) AS usam_crm,
  COUNT(DISTINCT o.id) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM whatsapp_business_accounts wba
      WHERE wba.organization_id = o.id
    )
    AND EXISTS (
      SELECT 1 FROM email_campaigns ec
      WHERE ec.organization_id = o.id
    )
    AND EXISTS (
      SELECT 1 FROM deals d
      WHERE d.organization_id = o.id
    )
  ) AS usam_todos_3
FROM organizations o
WHERE o.status = 'active';


-- ============================================================
-- 9. HEALTH CHECK — QUALITY SCORE DISTRIBUTION
-- ============================================================
-- Distribuição de quality score para monitorar saúde geral da base.

SELECT
  wba.quality_rating,
  COUNT(*) AS total_wabas,
  ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS pct
FROM whatsapp_business_accounts wba
JOIN organizations o ON o.id = wba.organization_id
WHERE o.status = 'active'
GROUP BY 1
ORDER BY
  CASE wba.quality_rating
    WHEN 'GREEN'   THEN 1
    WHEN 'YELLOW'  THEN 2
    WHEN 'RED'     THEN 3
    ELSE 4
  END;


-- ============================================================
-- 10. COHORT ANALYSIS — RETENÇÃO POR MÊS DE SIGNUP
-- ============================================================
-- Essencial para projetar LTV e informar pricing.

WITH cohorts AS (
  SELECT
    o.id,
    DATE_TRUNC('month', o.created_at) AS cohort_month
  FROM organizations o
  WHERE o.created_at >= NOW() - INTERVAL '12 months'
),
activity AS (
  SELECT
    c.cohort_month,
    EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', wcm.created_at), c.cohort_month))::INT AS months_since_signup,
    COUNT(DISTINCT c.id) AS orgs_ativas
  FROM cohorts c
  JOIN whatsapp_business_accounts wba ON wba.organization_id = c.id
  JOIN whatsapp_cloud_messages wcm ON wcm.waba_id = wba.id
  GROUP BY 1, 2
)
SELECT
  cohort_month,
  months_since_signup,
  orgs_ativas,
  ROUND(
    100.0 * orgs_ativas
    / NULLIF(FIRST_VALUE(orgs_ativas) OVER (
        PARTITION BY cohort_month ORDER BY months_since_signup
      ), 0),
    1
  ) AS retention_pct
FROM activity
WHERE months_since_signup >= 0
ORDER BY cohort_month, months_since_signup;
