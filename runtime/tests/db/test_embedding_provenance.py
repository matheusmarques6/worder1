"""Todo chunk diz em que espaço vetorial ele foi escrito.

O TS gravava com `text-embedding-ada-002` e o Python buscava com
`text-embedding-3-small`. Os dois modelos têm 1536 dimensões, então o
`vector(1536)` aceita ambos, a distância cosseno calcula normalmente e a busca
devolve **vizinhos errados sem erro nenhum** — a falha mais silenciosa da
auditoria inteira.

Sem uma coluna de proveniência não dá para saber o que foi escrito com quê, nem
detectar uma base meio-a-meio, nem verificar uma reindexação. O
`hub-runtime-parity.test.ts` já dizia isso: *"a migration do B precisa criar
essa coluna ANTES de trocar o modelo"*.

`not null` e não anulável-com-default porque a tabela está **vazia em produção**
(0 chunks, 0 fontes, medido em 28/08) — este é o único momento em que exigir sai
de graça. Chunk sem procedência passa a ser impossível por schema, e não por
disciplina de quem escreve.

O valor carimbado qualifica o PROVEDOR junto do modelo
(`openai:text-embedding-3-small`): quem grava passa pela OpenAI direta com a
chave da org, quem busca passa pela OpenRouter com a chave de plataforma. Se um
dia a OpenRouter deixar de ser passagem pura, é esta coluna que diz o que
precisa ser reindexado.
"""

import uuid

import psycopg
import pytest

from agents_runtime.repository import knowledge as knowledge_repo
from tests.db.factories import an_embedding, create_agent, create_knowledge_chunk, create_tenant
from tests.support.database import as_worker
from tests.support.embedding import embed_text


@pytest.fixture
def tenant(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    yield organization_id
    with admin.cursor() as cur:
        cur.execute("delete from public.organizations where id = %s", (organization_id,))


def _literal(values) -> str:
    """`embed_text` devolve floats; a factory espera o literal que o pgvector lê."""
    return "[" + ",".join(repr(float(v)) for v in values) + "]"


def _a_source(
    conn: psycopg.Connection, organization_id: uuid.UUID, agent_id: uuid.UUID
) -> uuid.UUID:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.ai_agent_sources
                (organization_id, agent_id, source_type, name, status)
            values (%s, %s, 'text', 'faq', 'ready')
            returning id
            """,
            (organization_id, agent_id),
        )
        (source_id,) = cur.fetchone()
    return source_id


class TestProvenanceIsRequiredBySchema:
    def test_a_chunk_with_a_vector_and_no_space_is_refused(
        self, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """A promessa só vale se o banco a cobrar — disciplina não é garantia."""
        agent_id = create_agent(admin, tenant)
        source_id = _a_source(admin, tenant, agent_id)

        with pytest.raises(psycopg.errors.CheckViolation):
            with admin.cursor() as cur:
                cur.execute(
                    """
                    insert into public.ai_agent_chunks
                        (organization_id, agent_id, source_id, content, embedding)
                    values (%s, %s, %s, 'sem procedência', %s::vector)
                    """,
                    (tenant, agent_id, source_id, an_embedding()),
                )

    def test_a_chunk_that_declares_its_space_is_accepted_and_readable(
        self, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        agent_id = create_agent(admin, tenant)
        source_id = _a_source(admin, tenant, agent_id)

        with admin.cursor() as cur:
            cur.execute(
                """
                insert into public.ai_agent_chunks
                    (organization_id, agent_id, source_id, content, embedding, embedding_model)
                values (%s, %s, %s, 'com procedência', %s::vector, %s)
                returning embedding_model
                """,
                (tenant, agent_id, source_id, an_embedding(), "openai:text-embedding-3-small"),
            )
            (stamped,) = cur.fetchone()

        assert stamped == "openai:text-embedding-3-small"

    def test_a_chunk_still_waiting_for_its_vector_declares_no_space(
        self, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """Um upload ainda não embedado não está em espaço nenhum.

        `not null` puro obrigaria esse chunk a MENTIR uma procedência que ele
        não tem. A invariante certa é o par: procedência existe exatamente
        quando o vetor existe.
        """
        agent_id = create_agent(admin, tenant)
        source_id = _a_source(admin, tenant, agent_id)

        with admin.cursor() as cur:
            cur.execute(
                """
                insert into public.ai_agent_chunks
                    (organization_id, agent_id, source_id, content, embedding, embedding_model)
                values (%s, %s, %s, 'aguardando embedding', null, null)
                returning id
                """,
                (tenant, agent_id, source_id),
            )
            assert cur.fetchone() is not None

    def test_provenance_without_a_vector_is_a_lie_and_is_refused(
        self, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """O outro lado do par: dizer o espaço sem ter vetor não significa nada."""
        agent_id = create_agent(admin, tenant)
        source_id = _a_source(admin, tenant, agent_id)

        with pytest.raises(psycopg.errors.CheckViolation):
            with admin.cursor() as cur:
                cur.execute(
                    """
                    insert into public.ai_agent_chunks
                        (organization_id, agent_id, source_id, content, embedding, embedding_model)
                    values (%s, %s, %s, 'procedência sem vetor', null, %s)
                    """,
                    (tenant, agent_id, source_id, "openai:text-embedding-3-small"),
                )


class TestTheSearchOnlyReadsSpacesItUnderstands:
    """Um chunk de outro espaço vetorial não é vizinho distante: é um número
    sem relação com a query. A distância cosseno o rankeia igual, sem erro, e foi
    exatamente assim que a divergência ada-002 contra 3-small passou despercebida.
    """

    async def test_a_chunk_from_a_foreign_space_never_comes_back(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        conteudo = "Entregamos em todo o Brasil em até 5 dias."
        create_knowledge_chunk(
            admin,
            tenant,
            content=conteudo,
            embedding=_literal(embed_text(conteudo)),
            embedding_space="openai:text-embedding-ada-002",
        )

        async with as_worker(dsn, tenant) as conn:
            found = await knowledge_repo.search_knowledge(
                conn, embedding=embed_text(conteudo), limit=5
            )

        # O vetor é IDÊNTICO ao da query: sem o filtro isto voltaria em primeiro
        # lugar com similaridade 1.0. O que o exclui é só a procedência.
        assert found == ()

    async def test_a_chunk_from_a_space_the_search_reads_comes_back(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        conteudo = "Trocas em até 30 dias com a nota."
        create_knowledge_chunk(
            admin,
            tenant,
            content=conteudo,
            embedding=_literal(embed_text(conteudo)),
            embedding_space="openai:text-embedding-3-small",
        )

        async with as_worker(dsn, tenant) as conn:
            found = await knowledge_repo.search_knowledge(
                conn, embedding=embed_text(conteudo), limit=5
            )

        assert [c.content for c in found] == [conteudo]
