-- =====================================================================
-- O AGENTE DE IA ESTA RODANDO? E COMO ELE ESTA RACIOCINANDO?
--
-- Duas tabelas respondem isso, e elas guardam coisas diferentes:
--
--   whatsapp_ai_run_steps  o caminho. Um registro por passo do run, com
--                          timestamp. E daqui que sai "onde ele parou".
--   agent_traces           o conteudo. O prompt exato que foi enviado ao
--                          modelo, a resposta crua, as tool calls, o
--                          modelo usado, tokens e latencia.
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
-- Um run e identificado por run_id. Aqui cada run e classificado pelo
-- passo terminal que alcancou — ou como 'sem desfecho' se nunca chegou
-- a um, que e o sintoma de run que morreu no meio sem registrar falha.
-- ---------------------------------------------------------------------
WITH runs AS (
  SELECT run_id,
         min(created_at) AS inicio,
         max(created_at) AS fim,
         array_agg(step ORDER BY created_at) AS passos
  FROM whatsapp_ai_run_steps
  WHERE created_at > now() - interval '7 days'
  GROUP BY run_id
)
SELECT
  CASE
    WHEN 'sent'        = ANY(passos) THEN 'sent — respondeu'
    WHEN 'transferred' = ANY(passos) THEN 'transferred — passou para humano'
    WHEN 'skipped'     = ANY(passos) THEN 'skipped — decidiu nao responder'
    WHEN 'failed'      = ANY(passos) THEN 'failed — quebrou'
    WHEN 'queued'      = ANY(passos) AND NOT ('started' = ANY(passos))
                                     THEN 'PAROU EM queued — nunca comecou'
    ELSE 'SEM DESFECHO — morreu no meio'
  END AS desfecho,
  count(*)                                              AS runs,
  round(avg(extract(epoch FROM (fim - inicio)))::numeric, 1) AS seg_medio,
  max(fim)                                              AS mais_recente
FROM runs
GROUP BY 1
ORDER BY runs DESC;
-- Se voltar VAZIO: nenhum run em 7 dias. O agente nao esta sendo
-- acionado — o problema esta antes dele (webhook, guard, bot desligado
-- na conversa), nao no raciocinio.
--
-- 'PAROU EM queued' em volume: o debounce agenda mas o worker nunca
-- executa. Olhe o cron /api/workers/whatsapp-ai-respond.
--
-- 'SEM DESFECHO' em volume: o run comeca e some. Normalmente timeout do
-- serverless no meio do generating.


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
-- 4. O RACIOCINIO DE VERDADE: o que o modelo recebeu e o que devolveu
--
-- agent_traces guarda o prompt final, ja montado, e a resposta crua.
-- E a unica forma de ver o que o agente realmente "pensou", em vez de
-- inferir pelo caminho dos passos.
-- ---------------------------------------------------------------------
SELECT
  to_char(created_at, 'DD/MM HH24:MI:SS') AS quando,
  model,
  provider,
  tokens,
  latency_ms,
  length(input)  AS tam_prompt,
  length(output) AS tam_resposta,
  jsonb_array_length(coalesce(tool_calls, '[]'::jsonb)) AS n_ferramentas,
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
-- 6. O prompt ainda vaza andaime?
--
-- O fix E1-E4 (commit 0169eab0) parou o generatePromptFromTemplate de
-- deixar placeholder e secao vazia no prompt final. Aqui se confirma se
-- ele pegou em producao: estes quatro padroes NAO podem aparecer em
-- trace nenhum posterior ao deploy.
-- ---------------------------------------------------------------------
SELECT
  to_char(created_at, 'DD/MM HH24:MI') AS quando,
  CASE
    WHEN input ~ 'Você é\s*,'                                     THEN 'E1: "Você é ," com nome vazio'
    WHEN input LIKE '%Defina o tom de voz ideal para seu negócio%' THEN 'E2: placeholder de tom de voz'
    WHEN input ~ '\{\{[^}]+\}\}'                                   THEN 'E3: variavel {{...}} nao substituida'
    WHEN input ~ '(?m)^##[^\n]*\n\s*(##|$)'                        THEN 'E4: secao ## vazia'
  END AS andaime_encontrado,
  left(input, 200) AS trecho
FROM agent_traces
WHERE input ~ 'Você é\s*,'
   OR input LIKE '%Defina o tom de voz ideal para seu negócio%'
   OR input ~ '\{\{[^}]+\}\}'
   OR input ~ '(?m)^##[^\n]*\n\s*(##|$)'
ORDER BY created_at DESC
LIMIT 20;
-- VAZIO = o fix pegou, nenhum prompt vaza andaime.
-- Linhas com data ANTERIOR ao deploy = historico, esperado.
-- Linhas com data POSTERIOR ao deploy = o fix nao cobriu esse caminho.
--   Nesse caso me mande o trecho: significa que ha outro ponto montando
--   prompt sem passar pelo generatePromptFromTemplate corrigido.
