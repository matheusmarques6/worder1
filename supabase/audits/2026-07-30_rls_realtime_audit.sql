-- =====================================================================
-- AUDITORIA: RLS das tabelas do inbox + autorizacao do Realtime
--
-- Responde tres perguntas em aberto do catalogo de 30/07/2026:
--   C2/O2  Quais policies realmente isolam uma organizacao da outra?
--          (001_enable_rls.sql abortou; as policies que existem tem
--          origem desconhecida e nunca foram lidas)
--   O1     Por que o canal de Realtime de MENSAGENS nao entrega,
--          enquanto o de conversas entrega?
--   A3     Confirmar/derrubar a afirmacao dos comentarios de que as
--          policies usam auth.organization_id().
--
-- SOMENTE LEITURA ate a secao 6. A secao 6 escreve dentro de uma
-- transacao que termina em ROLLBACK — nada e persistido.
--
-- Como rodar: cole no SQL Editor do Supabase (role `postgres`) e execute
-- bloco a bloco, de cima para baixo. Cada bloco imprime um resultado.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. A 001_enable_rls.sql chegou a rodar? Ate onde?
--
-- A hipotese e que ela aborta na PRIMEIRA instrucao (CREATE FUNCTION no
-- schema `auth`, negado para o role do projeto). Se for isso, NENHUM dos
-- objetos abaixo existe. Se `create_org_policies` existir mas
-- `auth.organization_id` nao, a hipotese esta errada e o arquivo foi
-- executado em partes — o que muda o diagnostico inteiro.
-- ---------------------------------------------------------------------
SELECT
  obj.rotina,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = obj.schema_name AND p.proname = obj.proc_name
  ) AS existe
FROM (VALUES
  ('auth.organization_id()  [001 parte 1]', 'auth',   'organization_id'),
  ('auth.is_org_admin()     [001 parte 1]', 'auth',   'is_org_admin'),
  ('public.create_org_policies() [001 parte 4]', 'public', 'create_org_policies'),
  ('public.set_organization_id() [001 parte 7]', 'public', 'set_organization_id'),
  ('public.fix_update_policy()   [002]',         'public', 'fix_update_policy')
) AS obj(rotina, schema_name, proc_name);


-- ---------------------------------------------------------------------
-- 2. O conteudo das policies das duas tabelas do inbox
--
-- Esta e a consulta que faltou. "6 policies em cada" foi o que se sabia
-- ate agora — contagem nao diz nada sobre o que cada uma permite.
-- Leia `qual` (USING) e `with_check` linha por linha.
-- ---------------------------------------------------------------------
SELECT
  tablename,
  policyname,
  cmd,
  permissive,
  roles::text            AS aplicada_aos_roles,
  qual                   AS using_expr,
  with_check             AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('whatsapp_cloud_conversations', 'whatsapp_cloud_messages')
ORDER BY tablename, cmd, policyname;


-- ---------------------------------------------------------------------
-- 3. As policies de SELECT das duas tabelas sao equivalentes?
--
-- O Realtime autoriza cada evento rodando a policy de SELECT da tabela.
-- Se a de `whatsapp_cloud_messages` for mais restritiva (ou erro em
-- runtime), o canal de mensagens cala e o de conversas continua vivo —
-- exatamente o sintoma do O1.
--
-- A hipotese de "RLS assimetrica" foi dada como refutada com base em
-- metadados (RLS ligada nas duas, 6 policies, na publication,
-- replica_identity=f). Nenhum desses campos compara EXPRESSAO. Ate este
-- SELECT rodar, a hipotese continua viva.
-- ---------------------------------------------------------------------
SELECT
  policyname,
  string_agg(DISTINCT tablename, ' | ' ORDER BY tablename) AS presente_em,
  count(*)                                                 AS n_tabelas,
  string_agg(DISTINCT coalesce(qual, '(sem USING)'), E'\n--- vs ---\n') AS expressoes
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('whatsapp_cloud_conversations', 'whatsapp_cloud_messages')
  AND cmd IN ('SELECT', 'ALL')
GROUP BY policyname
ORDER BY n_tabelas, policyname;
-- Leitura: qualquer linha com n_tabelas = 1 e uma policy que existe numa
-- tabela e nao na outra. Linhas com n_tabelas = 2 e mais de uma expressao
-- em `expressoes` sao policies de mesmo nome com corpo DIFERENTE.


-- ---------------------------------------------------------------------
-- 4. Alguma policy do banco chama uma funcao que nao existe?
--
-- Uma policy que referencia auth.organization_id() nao falha ao ser
-- criada se a funcao existia na epoca — mas hoje, em avaliacao, levanta
-- 42883 e o Postgres nega a linha. No Realtime isso vira silencio.
-- ---------------------------------------------------------------------
SELECT
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual ILIKE '%organization_id()%' OR with_check ILIKE '%organization_id()%')
ORDER BY tablename, policyname;
-- Se a secao 1 disse que auth.organization_id() NAO existe e esta query
-- retornar linhas, cada linha e uma tabela hoje inacessivel via RLS.


-- ---------------------------------------------------------------------
-- 5. Panorama de isolamento (C2 / O2)
--
-- Tres estados perigosos, em uma tabela so:
--   SEM_RLS          -> qualquer usuario autenticado le tudo de todas as orgs
--   RLS_SEM_POLICY   -> RLS ligada e zero policies = nega tudo (quebra a app,
--                       mas nao vaza; costuma estar mascarado por service_role)
--   RLS_OK           -> tem policy; ainda assim leia a expressao na secao 2
-- ---------------------------------------------------------------------
SELECT
  c.relname AS tabela,
  CASE
    WHEN NOT c.relrowsecurity THEN 'SEM_RLS'
    WHEN count(p.polname) = 0  THEN 'RLS_SEM_POLICY'
    ELSE 'RLS_OK'
  END AS estado,
  count(p.polname) AS n_policies,
  EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = c.oid AND a.attname = 'organization_id' AND a.attnum > 0
      AND NOT a.attisdropped
  ) AS tem_coluna_org
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
GROUP BY c.oid, c.relname, c.relrowsecurity
HAVING NOT c.relrowsecurity
    OR count(p.polname) = 0
ORDER BY estado, tabela;
-- Filtrado de proposito para as tabelas problematicas. Remova o HAVING
-- para ver o inventario completo.


-- ---------------------------------------------------------------------
-- 6. TESTE DECISIVO DO O1: simular o que o Realtime enxerga
--
-- O servidor de Realtime avalia RLS como o role `authenticated`, com os
-- claims do JWT que o browser mandou via realtime.setAuth(). Aqui isso e
-- reproduzido a mao: se o SELECT de mensagens voltar 0 linhas (ou erro)
-- e o de conversas voltar linhas, o O1 esta explicado e a causa e RLS.
--
-- EDITE as duas linhas abaixo antes de rodar.
-- ---------------------------------------------------------------------
-- Antes, pegue os dois ids (como postgres, fora da transacao):
--   SELECT id, organization_id FROM profiles LIMIT 5;
--   SELECT id, organization_id FROM whatsapp_cloud_conversations
--     ORDER BY updated_at DESC LIMIT 5;

BEGIN;

-- >>> EDITE OS DOIS UUIDs ABAIXO <<<
-- (set_config em vez de \set: \set e meta-comando do psql e nao existe no
--  SQL Editor do Supabase, que executa SQL puro.)
SELECT
  set_config('audit.user_id', '00000000-0000-0000-0000-000000000000', true),
  set_config('audit.conv_id', '00000000-0000-0000-0000-000000000000', true);

-- Monta os claims do JWT como o servidor de Realtime os apresenta
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub',  current_setting('audit.user_id'),
    'role', 'authenticated'
  )::text,
  true
);
SELECT set_config('request.jwt.claim.sub', current_setting('audit.user_id'), true);
SET LOCAL ROLE authenticated;

-- 6a. O canal de CONVERSAS (este funciona hoje) — esperado: > 0
SELECT 'conversations' AS canal, count(*) AS linhas_visiveis
FROM whatsapp_cloud_conversations;

-- 6b. O canal de MENSAGENS (este e o que nao entrega) — se der 0, achamos
SELECT 'messages' AS canal, count(*) AS linhas_visiveis
FROM whatsapp_cloud_messages;

-- 6c. O caso exato do canal: a mesma linha que o Realtime tentaria entregar,
--     com o mesmo filtro que o hook usa (conversation_id=eq.<id>)
SELECT 'messages (filtrado como no hook)' AS canal, count(*) AS linhas_visiveis
FROM whatsapp_cloud_messages
WHERE conversation_id = current_setting('audit.conv_id')::uuid;

-- 6d. Painel de progresso do agente (canal separado)
SELECT 'ai_run_steps' AS canal, count(*) AS linhas_visiveis
FROM whatsapp_ai_run_steps
WHERE conversation_id = current_setting('audit.conv_id')::uuid;

RESET ROLE;
ROLLBACK;  -- nada acima e persistido


-- ---------------------------------------------------------------------
-- 7. Realtime: publication e replica identity
--
-- Ja verificado em 30/07 (ambas na publication, replica_identity = f).
-- Mantido aqui para a auditoria ser autocontida e reexecutavel.
-- ---------------------------------------------------------------------
SELECT
  c.relname AS tabela,
  c.relreplident AS replica_identity,  -- 'f' = FULL, 'd' = default(PK)
  EXISTS (
    SELECT 1 FROM pg_publication_tables pt
    WHERE pt.pubname = 'supabase_realtime' AND pt.tablename = c.relname
  ) AS na_publication,
  c.relrowsecurity AS rls_ligada
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'whatsapp_cloud_conversations',
    'whatsapp_cloud_messages',
    'whatsapp_ai_run_steps'
  )
ORDER BY c.relname;


-- =====================================================================
-- O QUE FAZER COM O RESULTADO
--
-- Secao 2/3 mostra policies divergentes entre as duas tabelas
--   -> O1 e RLS. A correcao e uma policy de SELECT explicita em
--      whatsapp_cloud_messages, equivalente a de conversations.
--
-- Secao 6b/6c retorna 0 e 6a retorna > 0
--   -> mesma conclusao, com prova direta.
--
-- Secao 6a e 6b retornam ambas > 0
--   -> RLS esta OK e o O1 NAO e de banco. Proximo suspeito, na ordem:
--      (i)  o canal `cloud-inbox-msg-<id>` e recriado a cada troca de
--           conversa; um join novo no mesmo topico enquanto o anterior
--           ainda fecha e rejeitado em silencio;
--      (ii) o token de realtime.setAuth expira e o canal ja conectado
--           para de ser autorizado sem emitir CHANNEL_ERROR.
--      A telemetria para distinguir os dois ja existe: o hook agora
--      devolve `channels.messages` (useCloudInboxRealtime.ts).
--
-- Secao 4 retorna linhas E secao 1 diz que a funcao nao existe
--   -> essas tabelas estao inacessiveis para usuario comum hoje; so
--      funcionam por service_role. Corrigir antes de mover qualquer
--      leitura para o client.
-- =====================================================================
