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
-- DUAS CORRECOES ACUMULADAS AQUI, as duas vindas de erro em producao:
--
-- 1) 40P01 deadlock detected.
--    A versao original agrupava as 9 tabelas do grupo A em um unico
--    BEGIN/COMMIT. ENABLE ROW LEVEL SECURITY exige AccessExclusiveLock e,
--    numa transacao unica, o lock da primeira tabela fica retido ate o
--    commit da ultima. O vercel.json tem 35 crons, 11 deles "* * * * *",
--    entao sempre ha job lendo alguma dessas tabelas: basta ele segurar a
--    tabela 5 enquanto esta transacao segura a 2 e quer a 5, e ele querer
--    a 2. O deadlock foi o desfecho BOM — sem ele o ALTER ficaria na fila,
--    e ALTER na fila bloqueia toda leitura posterior na mesma tabela: a
--    app cairia esperando, por fila e nao por erro.
--    -> Cada tabela virou uma unidade propria com lock_timeout de 3s.
--       Nenhuma segura mais de um lock, entao nao ha ciclo possivel.
--
-- 2) 42P01 relation "help_articles" does not exist.
--    O PARTE3 original pressupoe as tabelas criadas pelo PARTE1 e PARTE2.
--    Se esses nunca rodaram, parte das 24 tabelas nao existe — e um
--    ALTER TABLE em tabela inexistente aborta tudo dali para a frente.
--    -> Cada tabela agora e um DO block que confere to_regclass antes.
--       O que nao existe e PULADO com um NOTICE, e o resto segue.
--
-- Cada DO block e uma unica instrucao, logo sua propria transacao: as
-- duas propriedades (lock curto, falha isolada) valem por tabela.
-- RLS e policy da mesma tabela continuam juntas no mesmo bloco — separar
-- abriria uma janela de deny-all em producao.
--
-- ACOMPANHE OS NOTICES. Cada tabela imprime 'ok <nome>' ou
-- 'PULADA <nome>: ...'. As puladas nao sao erro deste arquivo: sao
-- migrations anteriores que faltam. Descubra quais com o BLOCO 2a e com
-- 2026-07-30_migrations_aplicadas.sql.
--
-- Idempotente: rodar de novo nao refaz o que ja passou. Se algo falhar
-- por lock_timeout, rode outra vez ate o BLOCO 4 dar faltando=0.
-- ---------------------------------------------------------------------

-- 3a. Resolver a organizacao do usuario logado.
--
-- A 001_enable_rls.sql tentou criar auth.organization_id() e abortou: o
-- role do projeto nao pode criar funcao no schema `auth`. Por isso
-- nenhuma policy dela existe. Aqui a funcao vive em `public`, onde o
-- projeto pode escrever.
--
-- SECURITY DEFINER de proposito: sem isso a leitura de profiles dentro
-- da policy passaria pela RLS de profiles e poderia recursar.
--
-- Nao pega lock em tabela nenhuma, entao vai solta.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$fn$;

REVOKE ALL ON FUNCTION public.current_org_id() FROM public;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, service_role;


-- 3b. GRUPO A - tabelas lidas com a chave do usuario (getAuthClient).
--     Pais antes de filhas: a cadeia campaigns -> ad_groups -> keywords
--     nunca pode ter um elo sem policy enquanto o filho ja tem RLS.
--
--     As tres da cadeia nao tem organization_id proprio. A subconsulta
--     nao filtra organizacao e nao precisa: policy roda com as permissoes
--     de quem consulta, entao o SELECT interno ja passa pela policy da
--     tabela pai. Por isso google_ads_ad_groups precisa de policy mesmo o
--     app nunca a lendo direto — sem ela a cadeia quebra e o usuario nao
--     ve as proprias keywords. E por isso o bloco dela checa a dependencia.

DO $do$
BEGIN
  IF to_regclass('public.credentials') IS NULL THEN
    RAISE NOTICE 'PULADA credentials: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY$sql$;
    EXECUTE $sql$DROP POLICY IF EXISTS org_isolation ON public.credentials$sql$;
    EXECUTE $sql$CREATE POLICY org_isolation ON public.credentials
               FOR ALL TO authenticated
               USING (organization_id = public.current_org_id())
               WITH CHECK (organization_id = public.current_org_id())$sql$;
    RAISE NOTICE 'ok credentials';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE NOTICE 'PULADA notifications: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY$sql$;
    EXECUTE $sql$DROP POLICY IF EXISTS org_isolation ON public.notifications$sql$;
    EXECUTE $sql$CREATE POLICY org_isolation ON public.notifications
               FOR ALL TO authenticated
               USING (organization_id = public.current_org_id())
               WITH CHECK (organization_id = public.current_org_id())$sql$;
    RAISE NOTICE 'ok notifications';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.google_ads_accounts') IS NULL THEN
    RAISE NOTICE 'PULADA google_ads_accounts: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.google_ads_accounts ENABLE ROW LEVEL SECURITY$sql$;
    EXECUTE $sql$DROP POLICY IF EXISTS org_isolation ON public.google_ads_accounts$sql$;
    EXECUTE $sql$CREATE POLICY org_isolation ON public.google_ads_accounts
               FOR ALL TO authenticated
               USING (organization_id = public.current_org_id())
               WITH CHECK (organization_id = public.current_org_id())$sql$;
    RAISE NOTICE 'ok google_ads_accounts';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.google_ads_campaigns') IS NULL THEN
    RAISE NOTICE 'PULADA google_ads_campaigns: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.google_ads_campaigns ENABLE ROW LEVEL SECURITY$sql$;
    EXECUTE $sql$DROP POLICY IF EXISTS org_isolation ON public.google_ads_campaigns$sql$;
    EXECUTE $sql$CREATE POLICY org_isolation ON public.google_ads_campaigns
               FOR ALL TO authenticated
               USING (organization_id = public.current_org_id())
               WITH CHECK (organization_id = public.current_org_id())$sql$;
    RAISE NOTICE 'ok google_ads_campaigns';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.google_ads_ad_groups') IS NULL THEN
    RAISE NOTICE 'PULADA google_ads_ad_groups: a tabela nao existe neste banco';
  ELSIF to_regclass('public.google_ads_campaigns') IS NULL THEN
    RAISE NOTICE 'PULADA google_ads_ad_groups: depende de google_ads_campaigns, que nao existe';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.google_ads_ad_groups ENABLE ROW LEVEL SECURITY$sql$;
    EXECUTE $sql$DROP POLICY IF EXISTS org_isolation ON public.google_ads_ad_groups$sql$;
    EXECUTE $sql$CREATE POLICY org_isolation ON public.google_ads_ad_groups
               FOR ALL TO authenticated
               USING (campaign_id IN (SELECT id FROM public.google_ads_campaigns))
               WITH CHECK (campaign_id IN (SELECT id FROM public.google_ads_campaigns))$sql$;
    RAISE NOTICE 'ok google_ads_ad_groups';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.google_ads_keywords') IS NULL THEN
    RAISE NOTICE 'PULADA google_ads_keywords: a tabela nao existe neste banco';
  ELSIF to_regclass('public.google_ads_ad_groups') IS NULL THEN
    RAISE NOTICE 'PULADA google_ads_keywords: depende de google_ads_ad_groups, que nao existe';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.google_ads_keywords ENABLE ROW LEVEL SECURITY$sql$;
    EXECUTE $sql$DROP POLICY IF EXISTS org_isolation ON public.google_ads_keywords$sql$;
    EXECUTE $sql$CREATE POLICY org_isolation ON public.google_ads_keywords
               FOR ALL TO authenticated
               USING (ad_group_id IN (SELECT id FROM public.google_ads_ad_groups))
               WITH CHECK (ad_group_id IN (SELECT id FROM public.google_ads_ad_groups))$sql$;
    RAISE NOTICE 'ok google_ads_keywords';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.google_ads_search_terms') IS NULL THEN
    RAISE NOTICE 'PULADA google_ads_search_terms: a tabela nao existe neste banco';
  ELSIF to_regclass('public.google_ads_campaigns') IS NULL THEN
    RAISE NOTICE 'PULADA google_ads_search_terms: depende de google_ads_campaigns, que nao existe';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.google_ads_search_terms ENABLE ROW LEVEL SECURITY$sql$;
    EXECUTE $sql$DROP POLICY IF EXISTS org_isolation ON public.google_ads_search_terms$sql$;
    EXECUTE $sql$CREATE POLICY org_isolation ON public.google_ads_search_terms
               FOR ALL TO authenticated
               USING (campaign_id IN (SELECT id FROM public.google_ads_campaigns))
               WITH CHECK (campaign_id IN (SELECT id FROM public.google_ads_campaigns))$sql$;
    RAISE NOTICE 'ok google_ads_search_terms';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.google_ads_metrics') IS NULL THEN
    RAISE NOTICE 'PULADA google_ads_metrics: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.google_ads_metrics ENABLE ROW LEVEL SECURITY$sql$;
    EXECUTE $sql$DROP POLICY IF EXISTS org_isolation ON public.google_ads_metrics$sql$;
    EXECUTE $sql$CREATE POLICY org_isolation ON public.google_ads_metrics
               FOR ALL TO authenticated
               USING (organization_id = public.current_org_id())
               WITH CHECK (organization_id = public.current_org_id())$sql$;
    RAISE NOTICE 'ok google_ads_metrics';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.google_ads_products') IS NULL THEN
    RAISE NOTICE 'PULADA google_ads_products: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.google_ads_products ENABLE ROW LEVEL SECURITY$sql$;
    EXECUTE $sql$DROP POLICY IF EXISTS org_isolation ON public.google_ads_products$sql$;
    EXECUTE $sql$CREATE POLICY org_isolation ON public.google_ads_products
               FOR ALL TO authenticated
               USING (organization_id = public.current_org_id())
               WITH CHECK (organization_id = public.current_org_id())$sql$;
    RAISE NOTICE 'ok google_ads_products';
  END IF;
END $do$;


-- 3c. GRUPO B - conteudo de ajuda, leitura publica.
--     Mesmas 3 policies do PARTE3 original. Estas sao as mais provaveis
--     de serem PULADAS: dependem do PARTE2_help_e_outras_tabelas.sql.

DO $do$
BEGIN
  IF to_regclass('public.help_categories') IS NULL THEN
    RAISE NOTICE 'PULADA help_categories: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.help_categories ENABLE ROW LEVEL SECURITY$sql$;
    EXECUTE $sql$DROP POLICY IF EXISTS "public_read_help_categories" ON public.help_categories$sql$;
    EXECUTE $sql$CREATE POLICY "public_read_help_categories" ON public.help_categories FOR SELECT TO public USING (is_active = true)$sql$;
    RAISE NOTICE 'ok help_categories';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.help_articles') IS NULL THEN
    RAISE NOTICE 'PULADA help_articles: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY$sql$;
    EXECUTE $sql$DROP POLICY IF EXISTS "public_read_help_articles" ON public.help_articles$sql$;
    EXECUTE $sql$CREATE POLICY "public_read_help_articles" ON public.help_articles FOR SELECT TO public USING (status = 'published')$sql$;
    RAISE NOTICE 'ok help_articles';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.faq_items') IS NULL THEN
    RAISE NOTICE 'PULADA faq_items: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY$sql$;
    EXECUTE $sql$DROP POLICY IF EXISTS "public_read_faqs" ON public.faq_items$sql$;
    EXECUTE $sql$CREATE POLICY "public_read_faqs" ON public.faq_items FOR SELECT TO public USING (is_active = true)$sql$;
    RAISE NOTICE 'ok faq_items';
  END IF;
END $do$;


-- ---------------------------------------------------------------------
-- BLOCO 3d - GRUPO C: deny-all nas tabelas que so o service_role usa
--
-- Estas 12 nao aparecem em nenhum `.from(...)` do src/ com chave de
-- usuario, entao RLS sem policy fecha o acesso sem quebrar nada. Mas
-- "nao aparece no grep" e mais fraco que "conferi a rota": se alguma for
-- lida por RPC ou SQL cru que o grep nao pega, ela para de responder.
--
-- Rode SO depois de confirmar que o BLOCO 3 nao quebrou nada.
-- Rollback de qualquer uma: ALTER TABLE <x> DISABLE ROW LEVEL SECURITY;
--
-- orders e abandoned_carts sao as mais disputadas — varios dos crons de
-- minuto escrevem nelas. Se derem lock_timeout, rode o arquivo de novo.
-- ---------------------------------------------------------------------

DO $do$
BEGIN
  IF to_regclass('public.google_ads_product_metrics') IS NULL THEN
    RAISE NOTICE 'PULADA google_ads_product_metrics: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.google_ads_product_metrics ENABLE ROW LEVEL SECURITY$sql$;
    RAISE NOTICE 'ok google_ads_product_metrics';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.meta_ads_accounts') IS NULL THEN
    RAISE NOTICE 'PULADA meta_ads_accounts: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.meta_ads_accounts ENABLE ROW LEVEL SECURITY$sql$;
    RAISE NOTICE 'ok meta_ads_accounts';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.meta_ads_campaigns') IS NULL THEN
    RAISE NOTICE 'PULADA meta_ads_campaigns: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.meta_ads_campaigns ENABLE ROW LEVEL SECURITY$sql$;
    RAISE NOTICE 'ok meta_ads_campaigns';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.meta_ads_adsets') IS NULL THEN
    RAISE NOTICE 'PULADA meta_ads_adsets: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.meta_ads_adsets ENABLE ROW LEVEL SECURITY$sql$;
    RAISE NOTICE 'ok meta_ads_adsets';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.meta_ads_ads') IS NULL THEN
    RAISE NOTICE 'PULADA meta_ads_ads: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.meta_ads_ads ENABLE ROW LEVEL SECURITY$sql$;
    RAISE NOTICE 'ok meta_ads_ads';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.meta_ads_metrics') IS NULL THEN
    RAISE NOTICE 'PULADA meta_ads_metrics: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.meta_ads_metrics ENABLE ROW LEVEL SECURITY$sql$;
    RAISE NOTICE 'ok meta_ads_metrics';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.tiktok_ads_accounts') IS NULL THEN
    RAISE NOTICE 'PULADA tiktok_ads_accounts: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.tiktok_ads_accounts ENABLE ROW LEVEL SECURITY$sql$;
    RAISE NOTICE 'ok tiktok_ads_accounts';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.tiktok_ads_campaigns') IS NULL THEN
    RAISE NOTICE 'PULADA tiktok_ads_campaigns: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.tiktok_ads_campaigns ENABLE ROW LEVEL SECURITY$sql$;
    RAISE NOTICE 'ok tiktok_ads_campaigns';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.tiktok_ads_adgroups') IS NULL THEN
    RAISE NOTICE 'PULADA tiktok_ads_adgroups: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.tiktok_ads_adgroups ENABLE ROW LEVEL SECURITY$sql$;
    RAISE NOTICE 'ok tiktok_ads_adgroups';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.tiktok_ads_metrics') IS NULL THEN
    RAISE NOTICE 'PULADA tiktok_ads_metrics: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.tiktok_ads_metrics ENABLE ROW LEVEL SECURITY$sql$;
    RAISE NOTICE 'ok tiktok_ads_metrics';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE NOTICE 'PULADA orders: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY$sql$;
    RAISE NOTICE 'ok orders';
  END IF;
END $do$;

DO $do$
BEGIN
  IF to_regclass('public.abandoned_carts') IS NULL THEN
    RAISE NOTICE 'PULADA abandoned_carts: a tabela nao existe neste banco';
  ELSE
    PERFORM set_config('lock_timeout', '3s', true);
    EXECUTE $sql$ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY$sql$;
    RAISE NOTICE 'ok abandoned_carts';
  END IF;
END $do$;


-- ---------------------------------------------------------------------
-- BLOCO 4 - Verificacao pos-aplicacao  (SOMENTE LEITURA)
--
-- Como o BLOCO 3 nao e atomico, esta verificacao nao e opcional: e ela
-- que diz o que sobrou para tras, e separa os dois motivos possiveis.
-- ---------------------------------------------------------------------
WITH grupo_a(tabela) AS (VALUES
  ('credentials'),('notifications'),('google_ads_accounts'),
  ('google_ads_campaigns'),('google_ads_ad_groups'),('google_ads_keywords'),
  ('google_ads_metrics'),('google_ads_search_terms'),('google_ads_products')
), estado AS (
  SELECT g.tabela,
         c.oid IS NOT NULL                                   AS existe,
         coalesce(c.relrowsecurity, false)                    AS rls,
         pol.polname IS NOT NULL                              AS tem_policy
  FROM grupo_a g
  LEFT JOIN pg_class c
    ON c.relname = g.tabela AND c.relnamespace = 'public'::regnamespace
  LEFT JOIN pg_policy pol
    ON pol.polrelid = c.oid AND pol.polname = 'org_isolation'
)
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_org_id')      AS current_org_id_existe,
  count(*) FILTER (WHERE rls AND tem_policy)                          AS prontas,
  count(*) FILTER (WHERE NOT existe)                                  AS nao_existem,
  count(*) FILTER (WHERE existe AND NOT (rls AND tem_policy))         AS faltando,
  string_agg(tabela, ', ') FILTER (WHERE NOT existe)                  AS quais_nao_existem,
  string_agg(tabela, ', ') FILTER (WHERE existe AND NOT (rls AND tem_policy)) AS quais_faltando,
  string_agg(tabela, ', ') FILTER (WHERE rls AND NOT tem_policy)      AS PERIGO_deny_all
FROM estado;
-- Como ler:
--   prontas = 9              -> grupo A completo.
--   nao_existem > 0          -> nao e problema deste arquivo. Falta a
--                               migration que cria a tabela. Veja
--                               2026-07-30_migrations_aplicadas.sql.
--   faltando > 0             -> lock_timeout. Rode o arquivo de novo.
--   PERIGO_deny_all nao nulo -> RLS ligada sem policy: essa tabela esta
--                               negando tudo AGORA e a tela que a le
--                               esta vazia. Conserto imediato:
--                               ALTER TABLE <x> DISABLE ROW LEVEL SECURITY;

-- TESTE FUNCIONAL, que e o que importa de verdade:
-- entre na app com um usuario comum e confira, nesta ordem:
--   1. Configuracoes > Integracoes  (le credentials)
--   2. Analytics > Google Ads       (le as 6 tabelas google_ads_*)
--   3. o sino de notificacoes       (le notifications)
-- Se as tres carregarem, as policies estao certas. Se alguma vier vazia,
-- o suspeito e profiles.organization_id nulo para esse usuario:
--   SELECT id, organization_id FROM profiles WHERE id = '<uuid do user>';


-- ---------------------------------------------------------------------
-- BLOCO 5 - Orfaos: linhas que a policy tornou invisiveis
--           (SOMENTE LEITURA — rode depois do BLOCO 4 fechar)
--
-- A policy do grupo A compara organization_id com o da pessoa logada.
-- Linha com organization_id NULL nao casa com ninguem: continua no
-- banco, continua sendo lida por service_role, e some para todo usuario.
-- Antes da RLS ela aparecia para todos, entao esse tipo de linha pode
-- existir ha muito tempo sem nunca ter incomodado.
--
-- O mesmo do outro lado: perfil sem organization_id faz
-- current_org_id() devolver NULL, e ai NADA casa. Esse usuario ve todas
-- as telas vazias — primeiro suspeito se alguem reclamar.
--
-- Nenhum resultado aqui e necessariamente bug. E o inventario do que
-- mudou de visibilidade, para voce decidir o que fazer.
--
-- Em DO block com to_regclass pelo mesmo motivo do BLOCO 3: consultar
-- direto uma tabela que nao existe aborta o resto. Sai como NOTICE.
-- ---------------------------------------------------------------------
DO $do$
DECLARE
  r    record;
  n    bigint;
  tot  bigint := 0;
BEGIN
  RAISE NOTICE '--- orfaos por organization_id nula ---';
  FOR r IN
    SELECT unnest(ARRAY['profiles','credentials','notifications',
                        'google_ads_accounts','google_ads_campaigns',
                        'google_ads_metrics','google_ads_products']) AS t
  LOOP
    IF to_regclass('public.' || r.t) IS NULL THEN
      RAISE NOTICE '  % : tabela nao existe', rpad(r.t, 22);
    ELSE
      EXECUTE format('SELECT count(*) FROM public.%I WHERE organization_id IS NULL', r.t) INTO n;
      tot := tot + n;
      RAISE NOTICE '  % : % linha(s)%', rpad(r.t, 22), n,
        CASE WHEN n > 0 AND r.t = 'profiles'
             THEN '   <-- esses usuarios veem TUDO vazio' ELSE '' END;
    END IF;
  END LOOP;

  RAISE NOTICE '--- elos quebrados na cadeia do google ads ---';
  FOR r IN
    SELECT * FROM (VALUES
      ('google_ads_ad_groups',   'campaign_id', 'google_ads_campaigns'),
      ('google_ads_keywords',    'ad_group_id', 'google_ads_ad_groups'),
      ('google_ads_search_terms','campaign_id', 'google_ads_campaigns')
    ) AS v(filho, col, pai)
  LOOP
    IF to_regclass('public.' || r.filho) IS NULL OR to_regclass('public.' || r.pai) IS NULL THEN
      RAISE NOTICE '  % : tabela ausente, pulado', rpad(r.filho, 24);
    ELSE
      EXECUTE format(
        'SELECT count(*) FROM public.%I f WHERE NOT EXISTS (SELECT 1 FROM public.%I p WHERE p.id = f.%I)',
        r.filho, r.pai, r.col) INTO n;
      tot := tot + n;
      RAISE NOTICE '  % : % sem % valido', rpad(r.filho, 24), n, r.pai;
    END IF;
  END LOOP;

  IF tot = 0 THEN
    RAISE NOTICE '=> 0 orfaos. Nada mudou de visibilidade; so o isolamento foi imposto.';
  ELSE
    RAISE NOTICE '=> % linha(s) existem mas nenhum usuario as enxerga mais.', tot;
    RAISE NOTICE '   Decida por caso: atribuir organization_id, apagar, ou';
    RAISE NOTICE '   aceitar que so o backend as use.';
  END IF;
END $do$;
