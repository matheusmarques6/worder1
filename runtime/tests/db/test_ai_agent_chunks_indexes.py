"""O índice vetorial e o índice de organização que faltavam em `ai_agent_chunks`.

Item 08 da auditoria de 28/08: `search_knowledge` (repository/knowledge.py)
ordena por `embedding <=> :query` e filtra por `organization_id` numa tabela
sem nenhum dos dois índices — grep por hnsw/ivfflat/vector_cosine em
`supabase/` dava zero, e o docstring do repositório afirmava casar com um
HNSW que nunca tinha sido criado. A migration
`20260828000002_ai_agent_chunks_indexes` cria:

  * um HNSW com `vector_cosine_ops` em `embedding` — a classe de operador
    que casa com `<=>`;
  * um btree em `organization_id` — o corte por tenant que a query faz.

A prova aqui é dupla: primeiro que os dois índices EXISTEM com a definição
certa (catálogo), depois que a query REAL de `search_knowledge` — copiada
abaixo verbatim, não uma aproximação — consegue ser servida por cada um.
"Consegue", não "escolhe hoje": a tabela de teste tem poucas linhas, então o
planner tem liberdade de preferir um plano mais barato quando os dois
índices cobrem o mesmo predicado (visto ao vivo: com só uma dezena de linhas
o planner prefere o btree de organização + sort a um scan HNSW). Para tirar
essa liberdade e forçar a prova de cada índice, cada teste desliga
exatamente o mecanismo alternativo que competiria com ele
(`enable_seqscan` sempre; `enable_sort` só no teste do HNSW — sem ele o
planner satisfaz o ORDER BY ordenando as poucas linhas já filtradas pelo
btree de organização, e nunca toca o índice vetorial).
"""

import uuid

import psycopg
import pytest

from tests.db.factories import an_embedding, create_knowledge_chunk, create_tenant

# A mesma SQL de agents_runtime.repository.knowledge.search_knowledge,
# copiada literalmente (não reconstruída) — se aquela query mudar, este
# literal precisa mudar junto. EXPLAIN de uma query parecida não prova nada
# sobre a real; só copiar prova.
_SEARCH_KNOWLEDGE_SQL = """
    select c.id, c.organization_id, s.name, null::text, c.content,
           1 - (c.embedding <=> %(query)s::vector) as similarity
      from public.ai_agent_chunks c
      left join public.ai_agent_sources s on s.id = c.source_id
     where c.embedding is not null
       and c.embedding_model = any(%(spaces)s)
       and c.organization_id = public.current_app_organization_id()
     order by c.embedding <=> %(query)s::vector
     limit %(limit)s
"""


@pytest.fixture
def tenant(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    yield organization_id
    with admin.cursor() as cur:
        cur.execute("delete from public.organizations where id = %s", (organization_id,))


def _explain_search_knowledge(admin: psycopg.Connection, organization_id: uuid.UUID) -> str:
    """O plano da query real de search_knowledge, escopada para `organization_id`."""
    with admin.cursor() as cur:
        # SET (não SET LOCAL): a conexão `admin` é autocommit, cada statement
        # é sua própria transação, e o escopo tem que sobreviver ao EXPLAIN
        # seguinte.
        cur.execute(
            "select set_config('app.organization_id', %s, false)", (str(organization_id),)
        )
        cur.execute(
            "explain (format text) " + _SEARCH_KNOWLEDGE_SQL,
            {
                "query": an_embedding(),
                "spaces": ["openai:text-embedding-3-small"],
                "limit": 5,
            },
        )
        return "\n".join(row[0] for row in cur.fetchall())


class TestTheIndexesExist:
    def test_the_vector_index_is_hnsw_with_cosine_ops(self, admin: psycopg.Connection) -> None:
        with admin.cursor() as cur:
            cur.execute(
                "select indexdef from pg_indexes"
                " where tablename = 'ai_agent_chunks'"
                "   and indexname = 'ai_agent_chunks_embedding_hnsw_idx'"
            )
            row = cur.fetchone()

        assert row is not None, "migration 20260828000002 não aplicada"
        indexdef = row[0]
        assert "USING hnsw" in indexdef
        assert "vector_cosine_ops" in indexdef

    def test_the_organization_index_exists(self, admin: psycopg.Connection) -> None:
        with admin.cursor() as cur:
            cur.execute(
                "select indexdef from pg_indexes"
                " where tablename = 'ai_agent_chunks'"
                "   and indexname = 'ai_agent_chunks_organization_id_idx'"
            )
            row = cur.fetchone()

        assert row is not None, "migration 20260828000002 não aplicada"
        assert "organization_id" in row[0]


class TestTheSearchKnowledgeQueryCanUseEachIndex:
    """"Pode usar", não "usa sempre" — ver o docstring do módulo."""

    def test_the_vector_index_serves_the_order_by_and_limit(
        self, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        create_knowledge_chunk(admin, tenant)

        with admin.cursor() as cur:
            cur.execute("set enable_seqscan = off")
            cur.execute("set enable_sort = off")
        try:
            plan = _explain_search_knowledge(admin, tenant)
        finally:
            with admin.cursor() as cur:
                cur.execute("reset enable_seqscan")
                cur.execute("reset enable_sort")

        assert "ai_agent_chunks_embedding_hnsw_idx" in plan

    def test_the_organization_index_serves_the_tenant_cut(
        self, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        create_knowledge_chunk(admin, tenant)

        with admin.cursor() as cur:
            cur.execute("set enable_seqscan = off")
        try:
            plan = _explain_search_knowledge(admin, tenant)
        finally:
            with admin.cursor() as cur:
                cur.execute("reset enable_seqscan")

        assert "ai_agent_chunks_organization_id_idx" in plan
