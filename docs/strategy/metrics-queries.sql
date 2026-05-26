-- ============================================================
-- WORDER — Fase 7: Queries de Métricas Estratégicas
--
-- Queries para dashboard de decisão estratégica.
-- Executar no Supabase SQL Editor ou ferramenta de BI.
--
-- Pré-requisito: schema das Fases 1–7 aplicado.
-- Usa APENAS colunas que existem nas migrations 01-08.
-- ============================================================


-- ============================================================
-- 1. DISTRIBUIÇÃO DE RECEITA POR SEGMENTO (estimada via plano)
-- ============================================================

SELECT
  CASE o.plan
    WHEN 'starter' THEN 'Starter (R$99)'
    WHEN 'growth' THEN 'Growth (R$299)'
    WHEN 'scale' THEN 'Scale (R$799)'
    WHEN 'enterprise' THEN 'Enterprise (custom)'
    ELSE 'Trial / Free'
  END AS segmento,
  count(*) AS total_orgs,
  sum(CASE o.plan
    WHEN 'starter' THEN 99
    WHEN 'growth' THEN 299
    WHEN 'scale' THEN 799
    WHEN 'enterprise' THEN 5000
    ELSE 0
  END) AS mrr_estimado_brl
FROM organizations o
WHERE o.plan IS NOT NULL AND o.plan != 'churned'
GROUP BY 1
ORDER BY mrr_estimado_brl DESC;


-- ============================================================
-- 2. TOP 20 CLIENTES POR GASTO META (MENSAGENS)
-- ============================================================

SELECT
  o.id AS org_id,
  o.name AS org_name,
  o.plan,
  wba.phone_number,
  wba.quality_rating,
  wba.messaging_limit,
  count(*) FILTER (WHERE wcm.direction = 'outbound') AS msgs_outbound_30d,
  count(*) FILTER (WHERE wcm.pricing_billable = true) AS billable_30d,
  round(sum(CASE wcm.pricing_category
    WHEN 'marketing' THEN 0.0625
    WHEN 'utility' THEN 0.008
    WHEN 'authentication' THEN 0.0315
    ELSE 0
  END) FILTER (WHERE wcm.pricing_billable = true), 2) AS gasto_meta_usd,
  round(sum(CASE wcm.pricing_category
    WHEN 'marketing' THEN 0.0625
    WHEN 'utility' THEN 0.008
    WHEN 'authentication' THEN 0.0315
    ELSE 0
  END) FILTER (WHERE wcm.pricing_billable = true) * 5.0, 2) AS gasto_meta_brl_est
FROM organizations o
JOIN whatsapp_business_accounts wba ON wba.organization_id = o.id AND wba.status = 'active'
LEFT JOIN whatsapp_cloud_messages wcm
  ON wcm.waba_id = wba.id
  AND wcm.timestamp >= now() - interval '30 days'
GROUP BY o.id, o.name, o.plan, wba.phone_number, wba.quality_rating, wba.messaging_limit
ORDER BY billable_30d DESC
LIMIT 20;


-- ============================================================
-- 3. CONVERSÃO SIGNUP → PAGO (últimos 6 meses)
-- ============================================================

SELECT
  date_trunc('month', o.created_at) AS mes,
  count(*) AS signups,
  count(*) FILTER (WHERE o.plan IN ('starter', 'growth', 'scale', 'enterprise')) AS convertidos,
  round(100.0 * count(*) FILTER (WHERE o.plan IN ('starter', 'growth', 'scale', 'enterprise'))
    / nullif(count(*), 0), 1) AS taxa_conversao_pct
FROM organizations o
WHERE o.created_at >= now() - interval '6 months'
GROUP BY 1
ORDER BY 1;


-- ============================================================
-- 4. CRESCIMENTO MRR MENSAL
-- ============================================================

SELECT
  date_trunc('month', o.created_at) AS mes,
  count(*) FILTER (WHERE o.plan IN ('starter', 'growth', 'scale', 'enterprise')) AS clientes_pagantes,
  sum(CASE o.plan
    WHEN 'starter' THEN 99
    WHEN 'growth' THEN 299
    WHEN 'scale' THEN 799
    WHEN 'enterprise' THEN 5000
    ELSE 0
  END) AS mrr_brl
FROM organizations o
WHERE o.created_at >= now() - interval '12 months'
GROUP BY 1
ORDER BY 1;


-- ============================================================
-- 5. CHURN (proxy: orgs que pararam de enviar msgs nos últimos 30d)
-- ============================================================

SELECT
  count(*) FILTER (WHERE last_msg.last_msg_at IS NOT NULL) AS orgs_ativas_30d,
  count(*) FILTER (WHERE last_msg.last_msg_at IS NULL
    AND o.plan IN ('starter', 'growth', 'scale', 'enterprise')) AS orgs_pagantes_sem_msgs_30d,
  round(100.0 * count(*) FILTER (WHERE last_msg.last_msg_at IS NULL
    AND o.plan IN ('starter', 'growth', 'scale', 'enterprise'))
    / nullif(count(*) FILTER (WHERE o.plan IN ('starter', 'growth', 'scale', 'enterprise')), 0), 1) AS churn_proxy_pct
FROM organizations o
LEFT JOIN LATERAL (
  SELECT max(wcm.timestamp) AS last_msg_at
  FROM whatsapp_business_accounts wba
  JOIN whatsapp_cloud_messages wcm ON wcm.waba_id = wba.id
  WHERE wba.organization_id = o.id
    AND wcm.timestamp >= now() - interval '30 days'
) last_msg ON true
WHERE o.plan IS NOT NULL AND o.plan != 'churned';


-- ============================================================
-- 6. NPS PROXY — RETENÇÃO EM DIAS
-- ============================================================

SELECT
  o.plan,
  count(*) AS clientes,
  round(avg(extract(days from now() - o.created_at)), 0) AS dias_medio_retido,
  CASE
    WHEN avg(extract(days from now() - o.created_at)) >= 365 THEN 'Promoter (1+ ano)'
    WHEN avg(extract(days from now() - o.created_at)) >= 90 THEN 'Passive (3-12 meses)'
    ELSE 'Detractor risk (< 3 meses)'
  END AS nps_proxy
FROM organizations o
WHERE o.plan IN ('starter', 'growth', 'scale', 'enterprise')
GROUP BY o.plan
ORDER BY dias_medio_retido DESC;


-- ============================================================
-- 7. QUALITY SCORE DISTRIBUTION
-- ============================================================

SELECT
  wba.quality_rating,
  count(*) AS total_wabas,
  round(100.0 * count(*) / nullif(sum(count(*)) OVER (), 0), 1) AS pct
FROM whatsapp_business_accounts wba
WHERE wba.status = 'active'
GROUP BY 1
ORDER BY
  CASE wba.quality_rating
    WHEN 'GREEN' THEN 1
    WHEN 'YELLOW' THEN 2
    WHEN 'RED' THEN 3
    ELSE 4
  END;


-- ============================================================
-- 8a. KPI — Solution Partner: Volume de mensagens
-- ============================================================

SELECT
  'Solution Partner Volume' AS kpi,
  count(*) AS total_msgs_30d,
  count(*) FILTER (WHERE direction = 'outbound') AS outbound_30d,
  count(*) FILTER (WHERE direction = 'inbound') AS inbound_30d,
  count(DISTINCT wcm.waba_id) AS wabas_ativos,
  round(100.0 * count(*) FILTER (WHERE status = 'delivered')
    / nullif(count(*) FILTER (WHERE direction = 'outbound'), 0), 1) AS delivery_rate_pct
FROM whatsapp_cloud_messages wcm
WHERE wcm.timestamp >= now() - interval '30 days';


-- ============================================================
-- 8b. KPI — Flows: Adoção
-- ============================================================

SELECT
  'Flows Adoption' AS kpi,
  count(DISTINCT f.id) AS total_flows,
  count(DISTINCT f.id) FILTER (WHERE f.status = 'PUBLISHED') AS flows_publicados,
  count(DISTINCT fe.id) AS total_events_30d,
  count(DISTINCT fe.contact_phone) AS contatos_unicos_30d
FROM whatsapp_cloud_flows f
LEFT JOIN whatsapp_flow_events fe
  ON fe.flow_id = f.id
  AND fe.created_at >= now() - interval '30 days';


-- ============================================================
-- 8c. KPI — Cloud vs Evolution (migração)
-- ============================================================

SELECT
  'Cloud vs Evolution' AS kpi,
  count(DISTINCT o.id) FILTER (
    WHERE EXISTS (SELECT 1 FROM whatsapp_business_accounts wba WHERE wba.organization_id = o.id AND wba.status = 'active')
  ) AS orgs_cloud,
  count(DISTINCT o.id) FILTER (
    WHERE EXISTS (SELECT 1 FROM whatsapp_instances wi WHERE wi.organization_id = o.id AND wi.status IN ('connected', 'ACTIVE', 'open'))
      AND NOT EXISTS (SELECT 1 FROM whatsapp_business_accounts wba WHERE wba.organization_id = o.id AND wba.status = 'active')
  ) AS orgs_evolution_only,
  count(DISTINCT o.id) FILTER (
    WHERE EXISTS (SELECT 1 FROM whatsapp_business_accounts wba WHERE wba.organization_id = o.id AND wba.status = 'active')
      AND EXISTS (SELECT 1 FROM whatsapp_instances wi WHERE wi.organization_id = o.id AND wi.status IN ('connected', 'ACTIVE', 'open'))
  ) AS orgs_side_by_side
FROM organizations o;


-- ============================================================
-- 8d. KPI — Suite: quem usa WhatsApp + CRM
-- ============================================================

SELECT
  'Suite Readiness' AS kpi,
  count(DISTINCT o.id) AS total_orgs,
  count(DISTINCT o.id) FILTER (
    WHERE EXISTS (SELECT 1 FROM whatsapp_business_accounts wba WHERE wba.organization_id = o.id)
  ) AS usam_whatsapp,
  count(DISTINCT o.id) FILTER (
    WHERE EXISTS (SELECT 1 FROM deals d WHERE d.organization_id = o.id)
  ) AS usam_crm,
  count(DISTINCT o.id) FILTER (
    WHERE EXISTS (SELECT 1 FROM whatsapp_business_accounts wba WHERE wba.organization_id = o.id)
      AND EXISTS (SELECT 1 FROM deals d WHERE d.organization_id = o.id)
  ) AS usam_whatsapp_e_crm
FROM organizations o;


-- ============================================================
-- 9. COHORT RETENTION
-- ============================================================

WITH cohorts AS (
  SELECT
    o.id,
    date_trunc('month', o.created_at) AS cohort_month
  FROM organizations o
  WHERE o.created_at >= now() - interval '12 months'
    AND o.plan IN ('starter', 'growth', 'scale', 'enterprise')
),
activity AS (
  SELECT
    c.cohort_month,
    extract(month FROM age(date_trunc('month', wcm.timestamp), c.cohort_month))::int AS months_since,
    count(DISTINCT c.id) AS orgs_ativas
  FROM cohorts c
  JOIN whatsapp_business_accounts wba ON wba.organization_id = c.id
  JOIN whatsapp_cloud_messages wcm ON wcm.waba_id = wba.id
  GROUP BY 1, 2
)
SELECT
  cohort_month,
  months_since,
  orgs_ativas,
  round(100.0 * orgs_ativas
    / nullif(first_value(orgs_ativas) OVER (PARTITION BY cohort_month ORDER BY months_since), 0), 1) AS retention_pct
FROM activity
WHERE months_since >= 0
ORDER BY cohort_month, months_since;
