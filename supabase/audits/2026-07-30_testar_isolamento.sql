-- =====================================================================
-- TESTE DE ISOLAMENTO: as policies do grupo A funcionam mesmo?
--
-- O BLOCO 4 do aplicar_faltantes so diz que as 9 policies EXISTEM. Isso
-- nao e a mesma coisa que estarem CERTAS: uma policy escrita errado
-- existe do mesmo jeito e pode negar tudo, ou permitir tudo, e nos dois
-- casos a verificacao de existencia devolve 9/9 igual.
--
-- Este arquivo assume a identidade de um usuario real e compara o que
-- ele enxerga com o que existe de fato. Nao precisa de duas contas nem
-- de abrir a app.
--
-- SOMENTE LEITURA sobre os dados. O unico objeto criado e a funcao de
-- teste, que a SECAO 4 apaga.
--
-- POR QUE UMA FUNCAO E NAO UM SCRIPT COM BEGIN/COMMIT:
--   a versao anterior usava TEMP TABLE dentro de BEGIN ... ROLLBACK e
--   morria no SQL Editor do Supabase com
--     42P01: relation "_real" does not exist
--   O editor nao mantem uma transacao entre as instrucoes coladas: cada
--   uma comita sozinha, e ai ON COMMIT DROP apaga a temp table antes da
--   proxima instrucao ler. Qualquer teste que dependa de estado entre
--   instrucoes quebra ali.
--   Dentro de uma funcao o problema nao existe: a chamada inteira e uma
--   instrucao so, logo uma transacao so. O SET LOCAL ROLE vale ate o fim
--   dela e se desfaz sozinho na saida.
--
-- COMO USAR: rode as 4 secoes na ordem, uma de cada vez.
-- =====================================================================


-- ---------------------------------------------------------------------
-- SECAO 1 - Escolher dois usuarios de organizacoes DIFERENTES
--
-- O teste so prova alguma coisa se as duas organizacoes tiverem dados.
-- Ja vem ordenado por quem tem mais.
-- ---------------------------------------------------------------------
SELECT
  p.id            AS user_id,
  p.organization_id,
  (SELECT count(*) FROM credentials c   WHERE c.organization_id = p.organization_id) AS credenciais,
  (SELECT count(*) FROM notifications n WHERE n.organization_id = p.organization_id) AS notificacoes,
  (SELECT count(*) FROM google_ads_campaigns g WHERE g.organization_id = p.organization_id) AS campanhas
FROM profiles p
WHERE p.organization_id IS NOT NULL
ORDER BY credenciais DESC, notificacoes DESC
LIMIT 10;
-- Pegue DOIS user_id com organization_id DIFERENTES entre si.
-- Se so aparecer uma organizacao, a linha 6 do teste passa por
-- construcao e nao prova nada — o proprio teste avisa quando isso ocorre.


-- ---------------------------------------------------------------------
-- SECAO 2 - Criar a funcao de teste
--
-- Cole e rode inteira, de uma vez. Nao edite nada aqui.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._teste_isolamento(p_user_a uuid, p_user_b uuid)
RETURNS TABLE(ord int, caso text, esperado text, obtido text, veredito text)
LANGUAGE plpgsql
AS $fn$
DECLARE
  org_a uuid; org_b uuid;
  e_cred bigint; e_notif bigint; e_camp bigint; e_kw bigint;
  v_cred bigint; v_notif bigint; v_camp bigint; v_kw bigint; v_org uuid;
  b_cred bigint;
  aviso  text := '';
BEGIN
  SELECT organization_id INTO org_a FROM profiles WHERE id = p_user_a;
  SELECT organization_id INTO org_b FROM profiles WHERE id = p_user_b;

  IF org_a IS NULL THEN
    aviso := 'USUARIO A sem organization_id: current_org_id() devolve NULL '
          || 'e ele ve TODAS as telas vazias. Problema de dado, nao de policy.';
  ELSIF org_b IS NULL THEN
    aviso := 'USUARIO B sem organization_id — mesmo caso.';
  ELSIF org_a = org_b THEN
    aviso := 'A e B sao da MESMA organizacao: a linha 6 passa por construcao '
          || 'e nao prova nada. Escolha usuarios de orgs diferentes.';
  END IF;

  -- Quanto DEVERIA ser visivel. Medido antes da troca de role, ainda com
  -- os privilegios de quem chamou, entao a RLS nao interfere.
  SELECT count(*) INTO e_cred  FROM credentials         WHERE organization_id = org_a;
  SELECT count(*) INTO e_notif FROM notifications       WHERE organization_id = org_a;
  SELECT count(*) INTO e_camp  FROM google_ads_campaigns WHERE organization_id = org_a;
  SELECT count(*) INTO e_kw    FROM google_ads_keywords k
    WHERE EXISTS (SELECT 1 FROM google_ads_ad_groups ag
                  JOIN google_ads_campaigns c ON c.id = ag.campaign_id
                  WHERE ag.id = k.ad_group_id AND c.organization_id = org_a);

  -- Vira o usuario A. auth.uid() do Supabase le request.jwt.claims->>'sub'.
  -- SET LOCAL: desfaz sozinho quando a funcao termina.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', p_user_a::text)::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO v_cred  FROM credentials;
  SELECT count(*) INTO v_notif FROM notifications;
  SELECT count(*) INTO v_camp  FROM google_ads_campaigns;
  SELECT count(*) INTO v_kw    FROM google_ads_keywords;
  v_org := public.current_org_id();

  -- Agora o usuario B, para provar que ele NAO alcanca os dados de A.
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', p_user_b::text)::text, true);
  SELECT count(*) INTO b_cred FROM credentials WHERE organization_id = org_a;

  EXECUTE 'RESET ROLE';

  RETURN QUERY
  SELECT 1, 'A: current_org_id() resolve a org certa',
         coalesce(org_a::text,'(nulo)'), coalesce(v_org::text,'(nulo)'),
         -- org nula bate com org nula, mas isso nao e aprovacao: significa
         -- usuario sem organizacao, que ve tudo vazio. Sai como ATENCAO
         -- para nao virar um PASSOU enganoso.
         CASE WHEN org_a IS NULL                     THEN 'ATENCAO'
              WHEN v_org IS NOT DISTINCT FROM org_a  THEN 'PASSOU'
              ELSE 'FALHOU' END
  UNION ALL SELECT 2, 'A: credentials visiveis',
         e_cred::text, v_cred::text,
         CASE WHEN e_cred = v_cred THEN 'PASSOU' ELSE 'FALHOU' END
  UNION ALL SELECT 3, 'A: notifications visiveis',
         e_notif::text, v_notif::text,
         CASE WHEN e_notif = v_notif THEN 'PASSOU' ELSE 'FALHOU' END
  UNION ALL SELECT 4, 'A: campanhas visiveis',
         e_camp::text, v_camp::text,
         CASE WHEN e_camp = v_camp THEN 'PASSOU' ELSE 'FALHOU' END
  UNION ALL SELECT 5, 'A: keywords visiveis (cadeia de 3 niveis)',
         e_kw::text, v_kw::text,
         CASE WHEN e_kw = v_kw THEN 'PASSOU' ELSE 'FALHOU' END
  UNION ALL SELECT 6, 'B NAO ve credenciais da org de A',
         '0', b_cred::text,
         CASE WHEN b_cred = 0 THEN 'PASSOU' ELSE 'FALHOU' END
  UNION ALL SELECT 7, 'total no banco, sem RLS (so referencia)',
         '-', (SELECT count(*)::text FROM credentials), 'INFO'
  UNION ALL SELECT 8, coalesce(nullif(aviso,''), 'sem avisos'),
         '-', '-', CASE WHEN aviso = '' THEN 'INFO' ELSE 'ATENCAO' END
  ORDER BY 1;
END
$fn$;


-- ---------------------------------------------------------------------
-- SECAO 3 - Rodar o teste
--
-- >>> TROQUE OS DOIS UUIDs PELOS DA SECAO 1 <<<
-- ---------------------------------------------------------------------
SELECT * FROM public._teste_isolamento(
  '00000000-0000-0000-0000-000000000000',   -- <<< usuario A
  '00000000-0000-0000-0000-000000000000'    -- <<< usuario B
);
-- COMO LER:
--   linhas 1-6 todas PASSOU -> as policies estao corretas: cada
--     organizacao ve o proprio dado e nao alcanca o da outra.
--   linha 8 com ATENCAO -> leia o texto antes de confiar no resto.
--
--   obtido = 0 e esperado > 0  -> policy negando demais. A tela
--     correspondente esta VAZIA agora. Reverta a tabela do caso:
--     ALTER TABLE <x> DISABLE ROW LEVEL SECURITY;
--   obtido = o total da linha 7 -> policy nao esta filtrando; o
--     vazamento entre organizacoes continua aberto.
--   linha 6 FALHOU -> VAZAMENTO CONFIRMADO: B esta lendo credencial de
--     outra organizacao. Me avise antes de qualquer outra coisa.
--   linha 5 FALHOU sozinha, com 4 passando -> o elo do meio da cadeia
--     (google_ads_ad_groups) esta sem policy.


-- ---------------------------------------------------------------------
-- SECAO 4 - Limpar
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._teste_isolamento(uuid, uuid);
