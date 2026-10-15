# 2026-10-15-10 · Conhecimento da loja (schema e fixtures)

Plano de implementação IA, M3 passo 18. Migration
`supabase/migrations/20261016000010_knowledge_model.sql`.

## O que mudou

Nada em `src/` do runtime ainda — o schema que ele lê mudou e as fixtures
dos testes db acompanharam. O passo 20 traz o runtime (regras no prompt,
busca por agente, lacunas).

- `ai_agent_sources` → `ai_sources` (rename; índices, FKs, policies e grants
  preservados). A view `ai_agent_sources` (security_invoker) mantém o nome
  antigo por um release — `repository/knowledge.py` continua funcionando
  pelas duas referências que tem (insert em `ingest_chunk`, join em
  `search_knowledge`).
- `ai_sources.agent_id` nullable; + `folder`, `tags`, `body_markdown`,
  `kind` (note | document | url | faq | catalog | site_page), `read_only`,
  `updated_by`, `links`. Backfill de `kind`/`read_only` por `source_type`.
- `ai_source_agents(source_id, agent_id)`: "lida por". Backfill a partir do
  `agent_id` antigo; trigger mantém o vínculo quando rotas antigas ainda
  gravam `agent_id`.
- `ai_agent_chunks.agent_id` nullable; + `chunk_kind` (text | regra |
  resposta | atencao) e `position`.
- `search_agent_knowledge` (mesma assinatura, `rag.ts` chama): filtra por
  fonte lida pelo agente (M:N) OU vínculo antigo por `c.agent_id`; ordena
  com peso 1,3 em `resposta`; devolve `chunk_kind` dentro de `metadata`.
- `ai_knowledge_gaps`: lacunas, RLS por org, worker insere/atualiza.

Fixtures: `create_knowledge_chunk(..., chunk_kind=, source_id=)` grava em
`ai_sources`; novo `create_source(conn, org, name=, kind=, folder=,
body_markdown=, readers=)`.

Teste novo: `tests/db/test_knowledge_model.py` (view compatível e trigger,
fonte sem agente, vocabulários, busca por leitor, vínculo antigo, peso de
resposta, isolamento entre orgs, RLS das lacunas).

## Como e por quê

Protótipo: conhecimento é da LOJA e cada nota diz quem a lê. Renomear em vez
de criar tabela nova mantém os chunks, os embeddings e as policies no lugar;
a view evita trocar 27 referências do app de uma vez (passo 21 faz isso).

## Cobertura e lacunas

- Suíte db não roda neste ambiente (sem Postgres com `pgmq`/`vector`):
  migration e teste conferidos por leitura e `ruff`.
- `search_knowledge` do runtime ainda busca por org inteira (sem filtro por
  agente) — muda no passo 20.
