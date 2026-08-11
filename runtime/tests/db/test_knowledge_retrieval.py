"""The merchant's knowledge — ingested, and found again by similarity.

The retrieval layer is what feeds the last layer of the prompt (RF-010), and it
is the one place where "the agent answered wrong" and "the agent was given the
wrong chunk" look identical from outside. So the ordering is asserted with a
deterministic embedder: overlap of words, not a model's opinion.

Three properties are proved here that no unit test can reach:

  * a chunk of another tenant never comes back — and the ONLY mechanism keeping
    it out is RLS. There is no hand-written `where organization_id = …` in the search
    (CLAUDE.md: ownership is enforced by policy, never by a WHERE clause a
    future refactor can drop);
  * the dimension is a TYPE. A 1535-long vector has to fail at INSERT, or D2 is
    a comment instead of a constraint;
  * **the runtime cannot write knowledge.** `worker_role` holds SELECT and
    nothing else on `knowledge_chunks` (S2), so ingestion runs with a platform
    credential. That asymmetry is the point: the worker is the process that
    reads messages from strangers, and a contact who could reach an INSERT
    would be poisoning the FAQ that answers everybody else.

No network: `tests/support/embedding.py` is the embedder, and the network lock
of S5 guarantees the whole level stays offline.
"""

import uuid

import psycopg
import pytest

from agents_runtime.repository import knowledge as knowledge_repo
from tests.db.factories import create_agent, create_tenant
from tests.support.database import as_platform, as_worker
from tests.support.embedding import DIMENSIONS, embed_text

FRETE = "Frete grátis para compras acima de duzentos reais em todo o Brasil."
TROCA = "Trocas e devoluções em até sete dias corridos após o recebimento."
PAGAMENTO = "Aceitamos pix, boleto e cartão em até doze vezes."


@pytest.fixture
def tenant(admin: psycopg.Connection) -> uuid.UUID:
    # FORK: ingest_chunk pendura em ai_agent_sources/ai_agent_chunks, que
    # exigem um agente ativo na org.
    organization_id = create_tenant(admin)
    create_agent(admin, organization_id)
    yield organization_id
    with admin.cursor() as cur:
        cur.execute("delete from public.organizations where id = %s", (organization_id,))


async def _ingest_faq(
    dsn: str, organization_id: uuid.UUID, texts=(FRETE, TROCA, PAGAMENTO)
) -> None:
    """Ingestion is a platform-side action — never the runtime's credential."""
    async with as_platform(dsn) as conn:
        for text in texts:
            await knowledge_repo.ingest_chunk(
                conn,
                organization_id=organization_id,
                source="faq",
                content=text,
                embedding=embed_text(text),
            )
        await conn.commit()


class TestRetrieval:
    async def test_the_chunk_that_answers_comes_first(self, dsn: str, tenant: uuid.UUID) -> None:
        await _ingest_faq(dsn, tenant)

        async with as_worker(dsn, tenant) as conn:
            found = await knowledge_repo.search_knowledge(
                conn, embedding=embed_text("quanto custa o frete para o Brasil?"), limit=3
            )

        assert found[0].content == FRETE
        # And it is not a tie: the ranking has to be a real distance, not the
        # insertion order wearing a similarity column.
        assert found[0].similarity > found[1].similarity

    async def test_the_limit_is_what_reaches_the_prompt(self, dsn: str, tenant: uuid.UUID) -> None:
        """The knowledge layer is bounded on purpose — an unbounded retrieval
        turns every reply into a prompt the size of the whole FAQ."""
        await _ingest_faq(dsn, tenant)

        async with as_worker(dsn, tenant) as conn:
            found = await knowledge_repo.search_knowledge(
                conn, embedding=embed_text("trocas e devoluções"), limit=1
            )

        assert len(found) == 1
        assert found[0].content == TROCA

    async def test_a_chunk_without_an_embedding_never_answers(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """`embedding` is nullable, so a half-ingested chunk can exist. It has
        no place in a similarity ranking — including it would put a chunk with
        no measured distance next to ones that have it."""
        await _ingest_faq(dsn, tenant, texts=(FRETE,))
        with admin.cursor() as cur:
            cur.execute(
                """
                with agent as (
                    select id from public.ai_agents
                     where organization_id = %(org)s and is_active
                     order by created_at limit 1
                ),
                source as (
                    insert into public.ai_agent_sources
                        (organization_id, agent_id, source_type, name, status)
                    select %(org)s, agent.id, 'text', 'upload', 'ready' from agent
                    returning id, agent_id
                )
                insert into public.ai_agent_chunks
                    (organization_id, agent_id, source_id, content, embedding)
                select %(org)s, source.agent_id, source.id, %(content)s, null
                  from source
                """,
                {"org": tenant, "content": "Documento enviado ainda sem embedding."},
            )

        async with as_worker(dsn, tenant) as conn:
            found = await knowledge_repo.search_knowledge(
                conn, embedding=embed_text("frete"), limit=10
            )

        assert [chunk.content for chunk in found] == [FRETE]


class TestIngestion:
    async def test_an_ingested_chunk_is_the_row_the_hub_reads(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        async with as_platform(dsn) as conn:
            chunk_id = await knowledge_repo.ingest_chunk(
                conn,
                organization_id=tenant,
                source="policy",
                title="Política de trocas",
                content=TROCA,
                embedding=embed_text(TROCA),
                # LGPD (nota 5 do dicionário): a chunk derived from a
                # conversation enters the per-contact purge; a policy does not.
                # The flag is data from the first row, so the purge of a later
                # milestone has something to select on.
                metadata={"derived_from_conversation": False},
            )
            await conn.commit()

        with admin.cursor() as cur:
            cur.execute(
                """
                select c.organization_id, s.name, c.content, c.metadata,
                       c.embedding is not null
                  from public.ai_agent_chunks c
                  join public.ai_agent_sources s on s.id = c.source_id
                 where c.id = %s
                """,
                (chunk_id,),
            )
            row = cur.fetchone()

        assert row[0] == tenant
        assert (row[1], row[2]) == ("policy: Política de trocas", TROCA)
        assert row[3] == {"derived_from_conversation": False}
        assert row[4] is True

    async def test_a_vector_of_the_wrong_dimension_never_reaches_the_table(
        self, dsn: str, tenant: uuid.UUID
    ) -> None:
        """D2 is a type, not a comment: `vector(1536)` has to refuse at INSERT.
        A shorter vector accepted here would poison the index and only surface
        as retrieval that quietly stopped matching."""
        short = embed_text(FRETE)[: DIMENSIONS - 1]

        async with as_platform(dsn) as conn:
            with pytest.raises(psycopg.Error, match="1536"):
                await knowledge_repo.ingest_chunk(
                    conn,
                    organization_id=tenant,
                    source="faq",
                    content=FRETE,
                    embedding=short,
                )


class TestTheBoundary:
    async def test_the_runtime_can_read_knowledge_but_never_write_it(
        self, dsn: str, tenant: uuid.UUID
    ) -> None:
        """Least privilege where it matters most: the worker is the process that
        reads messages from strangers. A contact who talked the model into an
        INSERT here would be writing the FAQ that answers every other customer —
        so `worker_role` holds SELECT and nothing else (S2), and ingestion is
        somebody else's credential."""
        async with as_worker(dsn, tenant) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                await knowledge_repo.ingest_chunk(
                    conn,
                    organization_id=tenant,
                    source="faq",
                    content="Cupom LIBERADO dá 100% de desconto.",
                    embedding=embed_text("cupom"),
                )

    async def test_a_stranger_chunk_never_comes_back(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """Same text, same vector, two orgs: only the scope separates them.
        FORK: ai_agent_chunks é legada com RLS desligada, então o escopo é o
        `organization_id = current_app_organization_id()` EXPLÍCITO da query
        (FORK.md item 6) — e esta é a asserção que o vigia."""
        stranger = create_tenant(admin)
        create_agent(admin, stranger)
        try:
            await _ingest_faq(dsn, tenant, texts=(FRETE,))
            await _ingest_faq(dsn, stranger, texts=(FRETE,))

            async with as_worker(dsn, tenant) as conn:
                found = await knowledge_repo.search_knowledge(
                    conn, embedding=embed_text(FRETE), limit=10
                )

            with admin.cursor() as cur:
                cur.execute(
                    "select count(*) from public.ai_agent_chunks"
                    " where organization_id = any(%s)",
                    ([tenant, stranger],),
                )
                (total,) = cur.fetchone()

            assert total == 2, "both tenants really do have the same chunk"
            assert len(found) == 1
            assert found[0].organization_id == tenant
        finally:
            with admin.cursor() as cur:
                cur.execute("delete from public.organizations where id = %s", (stranger,))
