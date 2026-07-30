-- =====================================================================
-- TESTE DE ISOLAMENTO: as policies do grupo A funcionam mesmo?
--
-- O BLOCO 4 do aplicar_faltantes so diz que as policies EXISTEM. Isso
-- nao e a mesma coisa que estarem CERTAS: uma policy escrita errado
-- existe do mesmo jeito e pode negar tudo, ou pior, permitir tudo.
--
-- Este arquivo faz o teste de verdade — assume a identidade de um
-- usuario real e compara o que ele enxerga com o que existe no banco.
-- Nao precisa de duas contas nem de abrir a app.
--
-- 100% SOMENTE LEITURA. Tudo roda dentro de BEGIN ... ROLLBACK.
--
-- COMO USAR: rode a secao 1, copie os dois UUIDs que ela devolve, cole
-- nas duas linhas marcadas da secao 2 e rode a secao 2.
-- =====================================================================


-- ---------------------------------------------------------------------
-- SECAO 1 - Escolher dois usuarios de organizacoes DIFERENTES
--
-- O teste so prova alguma coisa se as duas organizacoes tiverem dados.
-- Esta consulta ja ordena por quem tem mais credenciais.
-- ---------------------------------------------------------------------
SELECT
  p.id            AS user_id,
  p.organization_id,
  (SELECT count(*) FROM credentials c WHERE c.organization_id = p.organization_id) AS credenciais,
  (SELECT count(*) FROM notifications n WHERE n.organization_id = p.organization_id) AS notificacoes,
  (SELECT count(*) FROM google_ads_campaigns g WHERE g.organization_id = p.organization_id) AS campanhas
FROM profiles p
WHERE p.organization_id IS NOT NULL
ORDER BY credenciais DESC, notificacoes DESC
LIMIT 10;
-- Pegue DOIS user_id com organization_id DIFERENTES entre si.
-- Se so aparecer uma organizacao, o teste de vazamento cruzado nao tem
-- como rodar — nesse caso so a secao 2a faz sentido.


-- ---------------------------------------------------------------------
-- SECAO 2 - O teste
--
-- Assume a identidade de USUARIO_A e mede o que ele ve. Depois compara
-- com o total real (medido como postgres, que ignora RLS).
--
-- >>> EDITE AS DUAS LINHAS ABAIXO ANTES DE RODAR <<<
-- ---------------------------------------------------------------------
BEGIN;

SELECT
  set_config('teste.user_a', '00000000-0000-0000-0000-000000000000', true),  -- <<< EDITE
  set_config('teste.user_b', '00000000-0000-0000-0000-000000000000', true);  -- <<< EDITE

-- Guarda os numeros reais ANTES de virar usuario comum.
CREATE TEMP TABLE _real ON COMMIT DROP AS
SELECT
  (SELECT organization_id FROM profiles WHERE id = current_setting('teste.user_a')::uuid) AS org_a,
  (SELECT organization_id FROM profiles WHERE id = current_setting('teste.user_b')::uuid) AS org_b,
  (SELECT count(*) FROM credentials)   AS cred_total,
  (SELECT count(*) FROM notifications) AS notif_total,
  (SELECT count(*) FROM google_ads_campaigns) AS camp_total,
  (SELECT count(*) FROM google_ads_keywords)  AS kw_total;

-- Quanto DEVERIA ser visivel para cada um.
CREATE TEMP TABLE _esperado ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM credentials   WHERE organization_id = (SELECT org_a FROM _real)) AS cred_a,
  (SELECT count(*) FROM notifications WHERE organization_id = (SELECT org_a FROM _real)) AS notif_a,
  (SELECT count(*) FROM google_ads_campaigns WHERE organization_id = (SELECT org_a FROM _real)) AS camp_a,
  (SELECT count(*) FROM google_ads_keywords k
     WHERE EXISTS (SELECT 1 FROM google_ads_ad_groups ag
                   JOIN google_ads_campaigns c ON c.id = ag.campaign_id
                   WHERE ag.id = k.ad_group_id
                     AND c.organization_id = (SELECT org_a FROM _real))) AS kw_a;

-- Guarda a org de A numa variavel de sessao. Necessario porque, depois
-- do SET ROLE abaixo, as temp tables criadas como postgres deixam de ser
-- legiveis — e a medicao de B precisa saber qual e a org de A.
SELECT set_config('teste.org_a', coalesce((SELECT org_a::text FROM _real), ''), true);

-- Se um dos dois usuarios nao tem organizacao, o teste nao consegue
-- medir nada — e isso ja e o diagnostico. Sem este aviso o sintoma
-- apareceria como um erro de cast de uuid, que nao explica nada.
DO $do$
DECLARE a uuid; b uuid;
BEGIN
  SELECT org_a, org_b INTO a, b FROM _real;
  IF a IS NULL THEN
    RAISE NOTICE '!! USUARIO A nao tem organization_id em profiles.';
    RAISE NOTICE '   current_org_id() devolve NULL para ele, entao ele ve TODAS';
    RAISE NOTICE '   as telas vazias na app. Isso e um problema de dado, nao de';
    RAISE NOTICE '   policy. Corrija o profile ou escolha outro usuario.';
  END IF;
  IF b IS NULL THEN
    RAISE NOTICE '!! USUARIO B nao tem organization_id — mesmo caso.';
  END IF;
  IF a IS NOT NULL AND a = b THEN
    RAISE NOTICE '!! A e B sao da MESMA organizacao. A linha 6 vai passar por';
    RAISE NOTICE '   construcao e nao prova nada. Escolha usuarios de orgs';
    RAISE NOTICE '   diferentes na secao 1.';
  END IF;
END $do$;

-- Agora vira o usuario A. auth.uid() do Supabase le request.jwt.claims->>'sub'.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', current_setting('teste.user_a'))::text,
                  true);

CREATE TEMP TABLE _visto_a ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM credentials)          AS cred,
  (SELECT count(*) FROM notifications)        AS notif,
  (SELECT count(*) FROM google_ads_campaigns) AS camp,
  (SELECT count(*) FROM google_ads_keywords)  AS kw,
  (SELECT public.current_org_id())            AS org_resolvida;

-- E agora o usuario B, para provar que ele NAO ve os dados de A.
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', current_setting('teste.user_b'))::text,
                  true);

CREATE TEMP TABLE _visto_b ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM credentials
     WHERE organization_id = nullif(current_setting('teste.org_a'),'')::uuid) AS cred_da_org_a,
  (SELECT public.current_org_id()) AS org_resolvida;

RESET ROLE;

-- ---------------------------------------------------------------------
-- RESULTADO
-- ---------------------------------------------------------------------
SELECT caso, esperado, obtido,
       CASE WHEN esperado = obtido THEN 'PASSOU' ELSE 'FALHOU' END AS veredito
FROM (
  SELECT 1 AS ord,
         'A: current_org_id() resolve a org certa' AS caso,
         (SELECT org_a::text FROM _real) AS esperado,
         (SELECT org_resolvida::text FROM _visto_a) AS obtido
  UNION ALL
  SELECT 2, 'A: credentials visiveis',
         (SELECT cred_a::text FROM _esperado), (SELECT cred::text FROM _visto_a)
  UNION ALL
  SELECT 3, 'A: notifications visiveis',
         (SELECT notif_a::text FROM _esperado), (SELECT notif::text FROM _visto_a)
  UNION ALL
  SELECT 4, 'A: campanhas visiveis',
         (SELECT camp_a::text FROM _esperado), (SELECT camp::text FROM _visto_a)
  UNION ALL
  SELECT 5, 'A: keywords visiveis (cadeia de 3 niveis)',
         (SELECT kw_a::text FROM _esperado), (SELECT kw::text FROM _visto_a)
  UNION ALL
  SELECT 6, 'B NAO ve credenciais da org de A',
         '0', (SELECT cred_da_org_a::text FROM _visto_b)
) t
ORDER BY ord;

-- Contexto, para saber se o teste teve o que medir:
SELECT 'total no banco (sem RLS)' AS referencia,
       cred_total AS credentials, notif_total AS notifications,
       camp_total AS campanhas,  kw_total AS keywords
FROM _real;

ROLLBACK;
-- Nada foi alterado. As TEMP tables somem no ROLLBACK.
--
-- COMO LER:
--   Todas PASSOU  -> as policies estao corretas: cada organizacao ve o
--                    proprio dado e nao ve o da outra.
--   Linha 1 FALHOU com obtido vazio -> profiles.organization_id nulo
--                    para esse usuario. Ele veria tudo vazio na app.
--   Linhas 2-5 obtido = 0 e esperado > 0 -> policy negando demais. A
--                    tela correspondente esta VAZIA agora. Reverta:
--                    ALTER TABLE <x> DISABLE ROW LEVEL SECURITY;
--   Linhas 2-5 obtido = total do banco -> policy nao esta filtrando.
--                    Vazamento entre organizacoes continua aberto.
--   Linha 6 FALHOU (obtido > 0) -> VAZAMENTO. B esta lendo credencial
--                    de outra organizacao. Isso e o bug original ainda
--                    de pe; me avise antes de qualquer outra coisa.
