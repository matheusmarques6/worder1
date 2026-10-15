# 2026-10-15-11 · Regras no prompt, busca por agente e lacunas

Plano de implementação IA, M3 passo 20. Sem migration nova: usa o schema da
alteração 10 (`ai_source_agents`, `chunk_kind`, `ai_knowledge_gaps`).

## O que mudou

- `repository/knowledge.py`
  - `search_knowledge(..., agent_id=None)`: com agente, só chunks de fontes
    que ele lê (`ai_source_agents`) ou com o vínculo antigo `c.agent_id`.
    Ordena por similaridade × 1,3 quando `chunk_kind = 'resposta'`
    (`ANSWER_WEIGHT`, mesma regra da RPC do app).
  - `load_rules(conn, agent_id, limit=MAX_RULES)`: os chunks `regra` das
    fontes do agente, sem busca vetorial.
  - `normalize_question`, `record_gap(...)`: grava ou acumula a lacuna
    aberta com a mesma pergunta normalizada (`cluster_key`), somando
    contagem, agentes (sem repetir) e até 10 exemplos.
- `agent_core/prompt_compiler.py`: `compile_prompt(..., rules=())` gera o
  bloco `KNOWLEDGE_RULES` ("REGRAS DA LOJA (obrigatórias)") entre
  CONVERSATION e KNOWLEDGE, só quando há regra.
- `tools/knowledge.py`: `SearchKnowledge(..., agent_id=)` repassa o agente
  (ou `context.agent_id`) para a busca.
- `tools/base.py`: `ToolContext.last_question` (a pergunta do contato no
  turno).
- `tools/builtin.py`: `transfer_to_human` com motivo `no_knowledge`
  registra lacuna `transferred` com `last_question`.
- `agent_core/responder.py`
  - lê as regras na transação de leitura (só quando a org tem base);
  - busca por agente; `knowledge_missed` = base existe, houve pergunta e
    nada passou do limiar;
  - turno aceito com `knowledge_missed` → lacuna `answered_without_source`;
  - Judge 1 reprovou por critério da rubrica `factual` (`FACTUAL_CRITERIA`)
    → lacuna `blocked`;
  - `_record_gap` engole qualquer erro (telemetria de produto nunca custa
    o turno).
- `agent_core/toucher.py`: a busca do toque também filtra pelo agente.

## Como

Regra entra no prompt sempre, porque não depende de a pergunta "parecer"
com ela — é o comportamento do protótipo ("a regra vale para toda
conversa"). O teto (`MAX_RULES = 20`) protege o tamanho do prompt.

A lacuna é agrupada por chave textual barata no momento da escrita; o
agrupamento por embedding (≥ 0,85) e a sugestão de resposta ficam na rotina
diária do passo 23.

## Por quê

Seções 10 e 11 da correlação: o callout `[!regra]` precisa valer como
limite, a nota precisa ser lida só por quem a lê, e a tela Lacunas precisa
de perguntas reais sem resposta.

## Cobertura e lacunas

- Unit: `tests/unit/test_knowledge_rules_and_gaps.py` (bloco de regras,
  chave da lacuna, vocabulário, `_record_gap` tolerante, transferência
  `no_knowledge`, agente na busca).
- db: `tests/db/test_knowledge_by_agent.py` (busca por leitor, regras do
  agente, acúmulo da lacuna). Não roda neste ambiente (sem Postgres com
  `pgmq`/`vector`); conferido por leitura e `ruff`.
- Pipeline "pergunta sem cobertura gera lacuna" fica para o executor
  descartável.
