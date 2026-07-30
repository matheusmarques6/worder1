-- =====================================================================
-- AS DUAS MIGRATIONS QUE O BLOCO 3 ACUSOU COMO NAO APLICADAS
--
--   20260617_ai_sources_bucket.sql   -> BLOCO 1. Seguro, rode direto.
--   PARTE3_rls_e_dados.sql           -> NAO RODE O ARQUIVO ORIGINAL.
--                                       Leia o BLOCO 2, rode o BLOCO 3.
--
-- POR QUE O PARTE3 ORIGINAL NAO PODE SER RODADO COMO ESTA
--
-- Ele liga RLS em 24 tabelas e cria policy para apenas 3 (as de help,
-- que sao leitura publica). As outras 21 ficam RLS_SEM_POLICY, que no
-- Postgres significa negar tudo para anon e authenticated.
--
-- O autor assumiu que essas 21 so sao lidas com service_role. Isso e
-- falso neste codigo. Conferido arquivo por arquivo:
--
--   getAuthClient() em src/lib/api-utils.ts:34 devolve um cliente com
--   ANON_KEY + token do usuario. O proprio comentario da funcao diz
--   "RETORNA CLIENTE QUE RESPEITA RLS". Ou seja: RLS SE APLICA.
--
--   E esse cliente que le, hoje, em producao:
--     credentials              5 rotas  (src/app/api/credentials/*,
--                                        automations/[id]/execute,
--                                        automations/connections)
--     google_ads_accounts      src/app/api/analytics/google-ads/route.ts:38
--     google_ads_campaigns     mesma rota, linha 60
--     google_ads_metrics       mesma rota, linha 67
--     google_ads_keywords      mesma rota, linha 84
--     google_ads_search_terms  mesma rota, linha 95
--     google_ads_products      mesma rota, linha 103
--     notifications            src/app/api/notifications/read-all/route.ts
--
-- Rodar o PARTE3 original derruba as integracoes, o analytics do Google
-- Ads e as notificacoes — todas passariam a devolver vazio, sem erro.
--
-- O BLOCO 3 faz o que o PARTE3 queria fazer (fechar o buraco) sem
-- quebrar nada: liga a RLS E escreve as policies que faltaram.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOCO 1 - 20260617_ai_sources_bucket.sql
--
-- Seguro e isolado: cria um bucket privado, acesso so por service-role,
-- ON CONFLICT DO NOTHING. Nao mexe em permissao de nada existente.
-- Sem ele, o upload de fontes dos Agentes IA cai no fallback silencioso
-- "processa sem storage" (src/app/api/ai/agents/[id]/sources/upload).
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ai-sources',
  'ai-sources',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

SELECT id, public, file_size_limit
FROM storage.buckets WHERE id = 'ai-sources';
-- Esperado: 1 linha, public = false. Se vier vazio, o INSERT falhou.


-- ---------------------------------------------------------------------
-- BLOCO 2 - Diagnostico antes de mexer em RLS  (SOMENTE LEITURA)
--
-- 2a. Estado real de cada uma das 24 tabelas do PARTE3.
--     A verificacao anterior era binaria (18 de 18). Aqui voce ve
--     exatamente quais ja tem RLS e quais nao tem — pode ser que parte
--     do PARTE3 tenha rodado.
-- ---------------------------------------------------------------------
SELECT
  t.tabela,
  CASE WHEN c.oid IS NULL          THEN 'TABELA NAO EXISTE'
       WHEN NOT c.relrowsecurity   THEN 'SEM RLS  <-- exposta'
       WHEN p.n = 0                THEN 'RLS SEM POLICY  <-- nega tudo'
       ELSE 'RLS + ' || p.n || ' policy(s)'
  END AS estado,
  t.grupo
FROM (VALUES
  ('credentials','A: lida com chave do usuario — PRECISA de policy'),
  ('notifications','A: lida com chave do usuario — PRECISA de policy'),
  ('google_ads_accounts','A: lida com chave do usuario — PRECISA de policy'),
  ('google_ads_campaigns','A: lida com chave do usuario — PRECISA de policy'),
  ('google_ads_ad_groups','A: elo da cadeia de keywords — PRECISA de policy'),
  ('google_ads_keywords','A: lida com chave do usuario — PRECISA de policy'),
  ('google_ads_metrics','A: lida com chave do usuario — PRECISA de policy'),
  ('google_ads_search_terms','A: lida com chave do usuario — PRECISA de policy'),
  ('google_ads_products','A: lida com chave do usuario — PRECISA de policy'),
  ('help_categories','B: leitura publica'),
  ('help_articles','B: leitura publica'),
  ('faq_items','B: leitura publica'),
  ('google_ads_product_metrics','C: so service_role — deny-all serve'),
  ('meta_ads_accounts','C: so service_role — deny-all serve'),
  ('meta_ads_campaigns','C: so service_role — deny-all serve'),
  ('meta_ads_adsets','C: so service_role — deny-all serve'),
  ('meta_ads_ads','C: so service_role — deny-all serve'),
  ('meta_ads_metrics','C: so service_role — deny-all serve'),
  ('tiktok_ads_accounts','C: so service_role — deny-all serve'),
  ('tiktok_ads_campaigns','C: so service_role — deny-all serve'),
  ('tiktok_ads_adgroups','C: so service_role — deny-all serve'),
  ('tiktok_ads_metrics','C: so service_role — deny-all serve'),
  ('orders','C: so service_role — deny-all serve'),
  ('abandoned_carts','C: so service_role — deny-all serve')
) AS t(tabela, grupo)
LEFT JOIN pg_class c
  ON c.relname = t.tabela
 AND c.relnamespace = 'public'::regnamespace
 AND c.relkind = 'r'
LEFT JOIN LATERAL (
  SELECT count(*) AS n FROM pg_policy WHERE polrelid = c.oid
) p ON true
ORDER BY t.grupo, t.tabela;


-- 2b. credentials esta mesmo exposta? Este e o teste de urgencia.
--
-- RLS desligada so vira vazamento se anon/authenticated tiverem GRANT.
-- No Supabase o default e ter. Se as duas condicoes baterem, qualquer
-- pessoa com a anon key (que e publica, vai no bundle do front) le os
-- tokens de integracao de TODAS as organizacoes.
SELECT
  (SELECT relrowsecurity FROM pg_class
    WHERE relname='credentials' AND relnamespace='public'::regnamespace) AS rls_ligada,
  (SELECT string_agg(DISTINCT grantee, ', ') FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='credentials'
      AND grantee IN ('anon','authenticated')
      AND privilege_type='SELECT') AS quem_pode_ler,
  (SELECT count(*) FROM credentials) AS linhas_na_tabela;
-- rls_ligada = false E quem_pode_ler nao vazio  ->  vazamento ativo.
-- Nesse caso o BLOCO 3 e urgente, nao opcional.


-- ---------------------------------------------------------------------
-- BLOCO 3 - PARTE3 corrigida: liga a RLS **com** as policies que faltaram
--
-- Idempotente (DROP POLICY IF EXISTS antes de cada CREATE) e transacional:
-- se qualquer linha falhar, nada e aplicado. Foi assim que a 001 deixou
-- o banco meio-aplicado — aqui isso nao acontece.
-- ---------------------------------------------------------------------
BEGIN;

-- 3a. Resolver a organizacao do usuario logado.
--
-- A 001_enable_rls.sql tentou criar auth.organization_id() e abortou:
-- o role do projeto nao pode criar funcao no schema `auth`. Por isso
-- nenhuma policy dela existe. Aqui a funcao vive em `public`, que o
-- projeto pode escrever.
--
-- SECURITY DEFINER de proposito: sem isso a leitura de profiles dentro
-- da policy passaria pela RLS de profiles e poderia recursar.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.current_org_id() FROM public;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, service_role;


-- 3b. GRUPO A - tabelas lidas com a chave do usuario.
--     RLS + policy de isolamento por organizacao.

ALTER TABLE credentials         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_ad_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_metrics  ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_search_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ads_products ENABLE ROW LEVEL SECURITY;

-- Isolamento direto: a tabela tem organization_id.
DROP POLICY IF EXISTS org_isolation ON credentials;
CREATE POLICY org_isolation ON credentials
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

DROP POLICY IF EXISTS org_isolation ON notifications;
CREATE POLICY org_isolation ON notifications
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

DROP POLICY IF EXISTS org_isolation ON google_ads_accounts;
CREATE POLICY org_isolation ON google_ads_accounts
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

DROP POLICY IF EXISTS org_isolation ON google_ads_campaigns;
CREATE POLICY org_isolation ON google_ads_campaigns
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

DROP POLICY IF EXISTS org_isolation ON google_ads_metrics;
CREATE POLICY org_isolation ON google_ads_metrics
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

DROP POLICY IF EXISTS org_isolation ON google_ads_products;
CREATE POLICY org_isolation ON google_ads_products
  FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

-- Isolamento por cadeia: estas duas NAO tem organization_id.
-- google_ads_ad_groups so tem campaign_id; google_ads_keywords so tem
-- ad_group_id; google_ads_search_terms so tem campaign_id.
--
-- As subconsultas abaixo nao filtram organizacao explicitamente e nao
-- precisam: a policy roda com as permissoes de quem consulta, entao o
-- SELECT interno ja passa pela policy da tabela pai. Cada elo herda o
-- isolamento do anterior. Por isso google_ads_ad_groups PRECISA de
-- policy mesmo nao sendo lida direto pelo app — sem ela a cadeia de
-- keywords quebra e o usuario nao ve as proprias keywords.
DROP POLICY IF EXISTS org_isolation ON google_ads_ad_groups;
CREATE POLICY org_isolation ON google_ads_ad_groups
  FOR ALL TO authenticated
  USING (campaign_id IN (SELECT id FROM google_ads_campaigns))
  WITH CHECK (campaign_id IN (SELECT id FROM google_ads_campaigns));

DROP POLICY IF EXISTS org_isolation ON google_ads_keywords;
CREATE POLICY org_isolation ON google_ads_keywords
  FOR ALL TO authenticated
  USING (ad_group_id IN (SELECT id FROM google_ads_ad_groups))
  WITH CHECK (ad_group_id IN (SELECT id FROM google_ads_ad_groups));

DROP POLICY IF EXISTS org_isolation ON google_ads_search_terms;
CREATE POLICY org_isolation ON google_ads_search_terms
  FOR ALL TO authenticated
  USING (campaign_id IN (SELECT id FROM google_ads_campaigns))
  WITH CHECK (campaign_id IN (SELECT id FROM google_ads_campaigns));


-- 3c. GRUPO B - conteudo de ajuda, leitura publica.
--     Identico ao PARTE3 original, so com DROP IF EXISTS na frente.

ALTER TABLE help_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_articles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_items       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_help_categories" ON help_categories;
CREATE POLICY "public_read_help_categories" ON help_categories
  FOR SELECT TO public USING (is_active = true);

DROP POLICY IF EXISTS "public_read_help_articles" ON help_articles;
CREATE POLICY "public_read_help_articles" ON help_articles
  FOR SELECT TO public USING (status = 'published');

DROP POLICY IF EXISTS "public_read_faqs" ON faq_items;
CREATE POLICY "public_read_faqs" ON faq_items
  FOR SELECT TO public USING (is_active = true);

COMMIT;


-- ---------------------------------------------------------------------
-- BLOCO 3d - GRUPO C: deny-all nas tabelas que so o service_role usa
--
-- SEPARADO DE PROPOSITO, em transacao propria. Estas 12 nao aparecem em
-- nenhum `.from(...)` do src/ com chave de usuario, entao RLS sem policy
-- fecha o acesso sem quebrar nada. Mas "nao aparece no grep" e mais
-- fraco que "conferi a rota": se alguma for lida por RPC ou SQL cru que
-- o grep nao pega, ela para de responder.
--
-- Rode depois de confirmar que o BLOCO 3 nao quebrou nada. Se algo
-- quebrar, o rollback e uma linha: ALTER TABLE x DISABLE ROW LEVEL SECURITY.
-- ---------------------------------------------------------------------
BEGIN;

ALTER TABLE google_ads_product_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_campaigns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_adsets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_ads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads_metrics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_ads_accounts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_ads_campaigns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_ads_adgroups   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_ads_metrics    ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE abandoned_carts       ENABLE ROW LEVEL SECURITY;

COMMIT;


-- ---------------------------------------------------------------------
-- BLOCO 4 - Verificacao pos-aplicacao  (SOMENTE LEITURA)
--
-- Rode o BLOCO 2a de novo: nenhuma linha do grupo A pode continuar
-- 'SEM RLS' nem virar 'RLS SEM POLICY'. E confira a funcao:
-- ---------------------------------------------------------------------
SELECT
  'current_org_id existe' AS check,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='current_org_id') AS ok
UNION ALL
SELECT 'policies do grupo A criadas (esperado 9)',
  (SELECT count(*) FROM pg_policy pol
   JOIN pg_class c ON c.oid=pol.polrelid
   WHERE pol.polname='org_isolation'
     AND c.relname IN ('credentials','notifications','google_ads_accounts',
       'google_ads_campaigns','google_ads_ad_groups','google_ads_keywords',
       'google_ads_metrics','google_ads_search_terms','google_ads_products')) = 9;

-- TESTE FUNCIONAL, que e o que importa de verdade:
-- entre na app com um usuario comum e confira, nesta ordem:
--   1. Configuracoes > Integracoes  (le credentials)
--   2. Analytics > Google Ads       (le as 6 tabelas google_ads_*)
--   3. o sino de notificacoes       (le notifications)
-- Se as tres carregarem, as policies estao certas. Se alguma vier
-- vazia, o culpado provavel e profiles.organization_id nulo para esse
-- usuario — confira com:
--   SELECT id, organization_id FROM profiles WHERE id = '<uuid do user>';
