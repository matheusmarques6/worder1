-- =====================================================================
-- O AGENTE DE IA ESTA RODANDO? E COMO ELE ESTA RACIOCINANDO?
--
-- Duas tabelas respondem isso, e elas guardam coisas diferentes:
--
--   whatsapp_ai_run_steps  o caminho. Um registro por passo do run, com
--                          timestamp. E daqui que sai "onde ele parou".
--   agent_traces           o conteudo. A mensagem do cliente, a resposta
--                          crua do modelo, as tool calls, modelo, tokens
--                          e latencia.
--                          ATENCAO: a coluna `input` NAO guarda o prompt
--                          de sistema. cloud-runner.ts:876 grava ali o
--                          `effectiveText`, que e o texto do cliente. O
--                          prompt montado e enviado e descartado, nao fica
--                          em lugar nenhum. Por isso `tokens` vem ~1500 e
--                          length(input) vem 2 ou 12 — nao e inconsistencia,
--                          sao coisas diferentes.
--
-- Os passos possiveis, na ordem em que acontecem (src/lib/ai/run-steps-shared.ts):
--   queued          inbound chegou, debounce agendado — o agente AINDA NAO rodou
--   started         guards passaram, agente resolvido, run comecou
--   transcribing    transcrevendo audio recebido
--   analyzing_image interpretando imagem recebida
--   generating      chamada ao LLM em andamento
--   tools           ferramentas executadas no turno
--   sending         enviando ao WhatsApp (inclui os delays humanizados)
--
-- E os quatro desfechos que encerram o run:
--   sent          respondeu
--   transferred   passou para humano
--   skipped       decidiu nao responder (guard, cooldown, opt-out)
--   failed        quebrou
--
-- SOMENTE LEITURA.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Ele esta rodando? Volume e desfecho nos ultimos 7 dias
--
-- CUIDADO COM O run_id: o passo `queued` SEMPRE tem run_id proprio,
-- diferente do run que de fato executa. Sao dois randomUUID() em lugares
-- distintos — webhook-processor.ts:461 gera um so para o queued, e
-- cloud-runner.ts:369 gera outro quando o worker roda. O proprio codigo
-- anota que o painel "encerra no passo terminal, nao por runId".
--
-- Consequencia: agrupar so por run_id faz TODO atendimento normal
-- produzir um run fantasma contendo apenas `queued`. A primeira versao
-- desta consulta reportava isso como "nunca comecou" — falso alarme em
-- 100% dos casos.
--
-- Aqui um `queued` sozinho so vira problema se NENHUM run comecou na
-- mesma conversa nos 5 minutos seguintes.
-- ---------------------------------------------------------------------
WITH runs AS (
  SELECT run_id, conversation_id,
         min(created_at) AS inicio,
         max(created_at) AS fim,
         array_agg(step ORDER BY created_at) AS passos
  FROM whatsapp_ai_run_steps
  WHERE created_at > now() - interval '7 days'
  GROUP BY run_id, conversation_id
)
SELECT
  CASE
    WHEN 'sent'        = ANY(r.passos) THEN 'sent — respondeu'
    WHEN 'transferred' = ANY(r.passos) THEN 'transferred — passou para humano'
    WHEN 'skipped'     = ANY(r.passos) THEN 'skipped — decidiu nao responder'
    WHEN 'failed'      = ANY(r.passos) THEN 'failed — quebrou'
    WHEN r.passos = ARRAY['queued'] THEN
      CASE WHEN EXISTS (
             SELECT 1 FROM runs x
             WHERE x.conversation_id = r.conversation_id
               AND 'started' = ANY(x.passos)
               AND x.inicio >= r.inicio
               AND x.inicio <= r.inicio + interval '5 minutes')
           THEN 'queued — normal, o run correspondente executou'
           ELSE 'QUEUED ORFAO — o worker nunca executou' END
    ELSE 'SEM DESFECHO — morreu no meio'
  END AS desfecho,
  count(*)                                                       AS runs,
  round(avg(extract(epoch FROM (r.fim - r.inicio)))::numeric, 1) AS seg_medio,
  max(r.fim)                                                     AS mais_recente
FROM runs r
GROUP BY 1
ORDER BY runs DESC;
-- VAZIO: nenhum run em 7 dias. O agente nao esta sendo acionado — o
--   problema esta antes dele (webhook, guard, bot desligado na conversa).
-- 'QUEUED ORFAO' em volume: o debounce agenda e o worker nao executa.
--   Olhe o cron /api/workers/whatsapp-ai-respond.
-- 'SEM DESFECHO' em volume: o run comeca e some. Tipicamente timeout do
--   serverless no meio do generating.
-- 'queued — normal': ignore. E o par de todo atendimento que funcionou.


-- ---------------------------------------------------------------------
-- 2. Os ultimos 20 runs, um por linha, com o caminho completo
--
-- E aqui que se ve o raciocinio resumido: a sequencia de passos mostra
-- se ele transcreveu audio, se chamou ferramenta, quanto tempo levou
-- em cada etapa.
-- ---------------------------------------------------------------------
SELECT
  r.run_id,
  r.conversation_id,
  to_char(r.inicio, 'DD/MM HH24:MI:SS')                       AS inicio,
  round(extract(epoch FROM (r.fim - r.inicio))::numeric, 1)   AS segundos,
  array_to_string(r.passos, ' -> ')                           AS caminho,
  r.ultimo_detail                                             AS detalhe_do_ultimo_passo
FROM (
  SELECT run_id, conversation_id,
         min(created_at) AS inicio,
         max(created_at) AS fim,
         array_agg(step ORDER BY created_at) AS passos,
         (array_agg(detail ORDER BY created_at DESC))[1] AS ultimo_detail
  FROM whatsapp_ai_run_steps
  GROUP BY run_id, conversation_id
) r
ORDER BY r.inicio DESC
LIMIT 20;
-- O caminho saudavel e algo como:
--   queued -> started -> generating -> sending -> sent
-- Com ferramenta:
--   queued -> started -> generating -> tools -> generating -> sending -> sent
-- Se parar em 'generating' sem chegar a 'sending', o LLM nao devolveu.


-- ---------------------------------------------------------------------
-- 3. As falhas, com o motivo
--
-- detail e metadata sao preenchidos pelo runner justamente nos passos
-- terminais nao-felizes. E onde esta o "por que".
-- ---------------------------------------------------------------------
SELECT
  to_char(created_at, 'DD/MM HH24:MI') AS quando,
  step,
  detail,
  metadata
FROM whatsapp_ai_run_steps
WHERE step IN ('failed', 'skipped', 'transferred')
ORDER BY created_at DESC
LIMIT 30;
-- skipped com detail de guard/cooldown/opt-out e comportamento correto,
-- nao bug. failed repetido com o mesmo detail e o que importa.


-- ---------------------------------------------------------------------
-- 4. O que entrou e o que saiu de cada chamada ao modelo
--
-- Le a mensagem do cliente (`input`), a resposta crua (`output`), o
-- modelo, o custo em tokens e a latencia.
--
-- Note o que isto NAO mostra: o prompt de sistema. Ele nao e persistido.
-- Da para ver o que o agente respondeu e quanto custou, nao o que ele
-- recebeu como instrucao. A diferenca entre `tokens` e length(input)
-- mede indiretamente o tamanho do prompt invisivel.
-- ---------------------------------------------------------------------
SELECT
  to_char(created_at, 'DD/MM HH24:MI:SS') AS quando,
  model,
  provider,
  tokens,
  latency_ms,
  length(input)  AS tam_prompt,
  length(output) AS tam_resposta,
  -- tool_calls e gravado como {calls:[...], stopped_by:...}, nao como array
  -- (cloud-runner.ts:878). jsonb_array_length direto levanta erro assim que
  -- existir um trace com ferramenta.
  coalesce(jsonb_array_length(tool_calls -> 'calls'), 0) AS n_ferramentas,
  left(output, 300) AS resposta_inicio
FROM agent_traces
ORDER BY created_at DESC
LIMIT 20;
-- tokens ou latency_ms nulos em tudo: o tracking nao esta gravando.
-- n_ferramentas sempre 0 quando deveria chamar ferramenta: o agente nao
-- esta recebendo as tools, ou o modelo nao esta escolhendo usa-las.


-- ---------------------------------------------------------------------
-- 5. UM run especifico, do inicio ao fim
--
-- >>> COLE UM run_id DA CONSULTA 2 <<<
-- ---------------------------------------------------------------------
SELECT
  to_char(created_at, 'HH24:MI:SS.MS') AS hora,
  step,
  detail,
  metadata
FROM whatsapp_ai_run_steps
WHERE run_id = '00000000-0000-0000-0000-000000000000'   -- <<< EDITE
ORDER BY created_at;


-- ---------------------------------------------------------------------
-- 6. O prompt do agente tem andaime?
--
-- CORRECAO: a primeira versao desta consulta procurava os padroes de
-- andaime em agent_traces.input, e estava errada. cloud-runner.ts:876
-- grava `input: effectiveText` — a MENSAGEM DO CLIENTE, nao o prompt.
-- Por isso tam_prompt vem 2, 12, 39 caracteres enquanto tokens vem 1500:
-- os 1500 tokens sao o prompt de sistema, que NAO e persistido em lugar
-- nenhum. A consulta antiga voltaria vazia sempre e daria a impressao
-- falsa de que o fix E1-E4 foi confirmado em producao.
--
-- O que da para verificar e o TEMPLATE guardado em ai_agents.system_prompt,
-- que e a materia-prima do prompt final. Se o andaime estiver ali, ele
-- chega ao modelo; se nao estiver, o fix E1-E4 cuida da renderizacao.
-- Nao e a mesma prova, e a diferenca importa: isto verifica a origem,
-- nao o que de fato saiu.
-- ---------------------------------------------------------------------
SELECT
  id,
  name,
  CASE
    WHEN system_prompt ~ 'Você é\s*,'                                     THEN 'E1: "Você é ," com nome vazio'
    WHEN system_prompt LIKE '%Defina o tom de voz ideal para seu negócio%' THEN 'E2: placeholder de tom de voz'
    WHEN system_prompt ~ '\{\{[^}]+\}\}'                                   THEN 'E3: variavel {{...}} nao substituida'
    WHEN system_prompt ~ '(?m)^##[^\n]*\n\s*(##|$)'                        THEN 'E4: secao ## vazia'
  END AS andaime_no_template,
  length(system_prompt) AS tam_template
FROM ai_agents
WHERE system_prompt ~ 'Você é\s*,'
   OR system_prompt LIKE '%Defina o tom de voz ideal para seu negócio%'
   OR system_prompt ~ '\{\{[^}]+\}\}'
   OR system_prompt ~ '(?m)^##[^\n]*\n\s*(##|$)';
-- VAZIO = nenhum template tem andaime na origem.
-- Linhas = aquele agente carrega andaime no proprio template. O fix
--   E1-E4 remove parte disso na renderizacao, mas template sujo e
--   problema de dado e continua ali ate ser editado.
--
-- PARA PROVAR DE VERDADE o que o modelo recebe seria preciso persistir o
-- prompt renderizado — hoje ele e montado, enviado e descartado. Nao ha
-- como auditar em producao o que efetivamente foi para o LLM.
