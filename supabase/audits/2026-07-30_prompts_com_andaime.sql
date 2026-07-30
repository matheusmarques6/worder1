-- =====================================================================
-- AUDITORIA: system_prompts ja gravados com residuo de andaime (E1-E4 / O6)
--
-- Corrigir generatePromptFromTemplate conserta agentes NOVOS. O prompt de
-- um agente e materializado em ai_agents.system_prompt no momento da
-- criacao e nunca mais e regenerado — quem ja foi criado continua com o
-- texto quebrado. Esta query encontra quem.
--
-- SOMENTE LEITURA.
-- =====================================================================

SELECT
  a.id,
  a.organization_id,
  a.name,
  a.is_active,
  a.created_at,
  -- Cada flag corresponde a um item do catalogo
  (a.system_prompt ~ 'Você é\s*,')                                AS e1_nome_vazio,
  (a.system_prompt ILIKE '%Defina o tom de voz ideal para seu negócio%')
                                                                  AS e2_dica_de_formulario,
  (a.system_prompt ~ '\{\{[^}]+\}\}')                             AS e3_variavel_literal,
  (a.system_prompt ~ '(?m)^##[^\n]*\n\s*(##|$)')                  AS e4_secao_vazia,
  length(a.system_prompt)                                         AS tamanho,
  left(a.system_prompt, 400)                                      AS inicio_do_prompt
FROM ai_agents a
WHERE a.system_prompt IS NOT NULL
  AND (
       a.system_prompt ~ 'Você é\s*,'
    OR a.system_prompt ILIKE '%Defina o tom de voz ideal para seu negócio%'
    OR a.system_prompt ~ '\{\{[^}]+\}\}'
    OR a.system_prompt ~ '(?m)^##[^\n]*\n\s*(##|$)'
  )
ORDER BY a.is_active DESC, a.created_at DESC;


-- ---------------------------------------------------------------------
-- Resumo por organizacao — para dimensionar o reparo antes de comecar
-- ---------------------------------------------------------------------
SELECT
  organization_id,
  count(*)                                    AS agentes_afetados,
  count(*) FILTER (WHERE is_active)           AS ativos_agora
FROM ai_agents
WHERE system_prompt IS NOT NULL
  AND (
       system_prompt ~ 'Você é\s*,'
    OR system_prompt ILIKE '%Defina o tom de voz ideal para seu negócio%'
    OR system_prompt ~ '\{\{[^}]+\}\}'
    OR system_prompt ~ '(?m)^##[^\n]*\n\s*(##|$)'
  )
GROUP BY organization_id
ORDER BY ativos_agora DESC;


-- =====================================================================
-- REPARO
--
-- Deliberadamente NAO ha UPDATE automatico aqui. Os dois defeitos de
-- conteudo nao tem conserto mecanico:
--   e1_nome_vazio        -> da para derivar ("Você é ," -> "Você é Assistente,")
--   e4_secao_vazia       -> da para remover o cabecalho orfao
--   e2_dica_de_formulario-> exige decidir QUAL e o tom de voz do negocio.
--                           Substituir por outro texto generico so troca um
--                           placeholder por outro.
--   e3_variavel_literal  -> exige saber o valor que deveria estar la.
--
-- Caminho recomendado, por agente afetado:
--   1. Abrir o agente na UI e reescrever o system_prompt a mao, ou
--   2. Refazer o wizard (o codigo corrigido gera o prompt certo agora).
--
-- Para os dois casos mecanicos, se a lista for grande, este UPDATE resolve
-- e1 e e4 sem tocar no resto. Rode primeiro o SELECT acima e confira o
-- resultado em `inicio_do_prompt` antes de descomentar.
--
-- UPDATE ai_agents
-- SET system_prompt = regexp_replace(system_prompt, 'Você é\s*,', 'Você é Assistente,', 'g'),
--     updated_at = now()
-- WHERE system_prompt ~ 'Você é\s*,';
-- =====================================================================
