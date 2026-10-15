# 2026-10-15-05 · Conhecimento: limiar de relevância, proveniência e busca sem depender da tool

Plano de implementação IA, M1 passo 8. Fecha os itens 30 e 32 do `FORK.md`.

## O que mudou

1. A busca vetorial só devolve chunks com similaridade ≥ 0,7 (o mesmo piso
   do motor legado, `rag.ts`). Antes devolvia sempre os 5 mais próximos,
   relevantes ou não.
2. Cada chunk devolvido pela tool `search_knowledge` carrega `source_id` e
   `chunk_id`. Como toda execução de tool fica em `internal.tool_calls`
   (argumentos e saída), a tela "uso por nota" do novo Conhecimento pode ser
   calculada a partir dessa trilha, sem tabela nova.
3. A base é consultada sempre que a loja tem chunks consultáveis, não só
   quando `search_knowledge` está em `settings.tools.enabled`. O agente
   piloto tinha a lista de tools vazia e, por isso, nunca lia a base.

## Como

- `repository/knowledge.py`: `DEFAULT_SIMILARITY_THRESHOLD = 0.7`,
  parâmetro `threshold` em `search_knowledge` (filtro no SQL, antes do
  `limit`), coluna `source_id` no SELECT e no `KnowledgeChunk`; nova
  `has_knowledge(conn)` (um `exists` no espaço vetorial consultável da org
  escopada).
- `tools/knowledge.py`: `source_id` e `chunk_id` no output.
- `responder.py`: `has_knowledge` lido na transação curta de leitura do
  turno e passado a `_knowledge(..., has_knowledge=)`; a condição de
  busca vira "tool ligada OU base existente". O toucher continua com o
  comportamento anterior (só com a tool) até o M3.

## Testes

Os contratos puros de `_knowledge` continuam em
`tests/unit/test_knowledge_query_contract.py` (o default
`has_knowledge=False` preserva os casos existentes). O limiar e a
proveniência são SQL: caso de db pendente, junto com o do passo 7.

## Efeito colateral a conhecer

Uma loja com base pequena e perguntas fora dela passa a não injetar nada no
prompt (antes injetava os 5 chunks menos distantes). É o comportamento
desejado: o modelo responde com o que sabe e, no M3, isso vira lacuna.
