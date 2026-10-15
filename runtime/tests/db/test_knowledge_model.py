"""Conhecimento da loja (20261016000010, plano IA M3 passo 18).

A fonte deixa de pertencer a um agente: `ai_sources` com pastas, callouts e
links, lida por N agentes via `ai_source_agents`. O nome antigo
(`ai_agent_sources`) sobrevive como view atualizável por um release; a RPC
`search_agent_knowledge` filtra pela M:N (ou pelo vínculo antigo) e dá peso
1,3 ao callout "resposta"; `ai_knowledge_gaps` nasce trancada por org.
"""

import uuid

import psycopg
import pytest

from tests.db.factories import (
    an_embedding,
    create_agent,
    create_knowledge_chunk,
    create_source,
    create_tenant,
)
from tests.support.database import as_worker


@pytest.fixture
def tenant(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    yield organization_id
    with admin.cursor() as cur:
        cur.execute("delete from public.organizations where id = %s", (organization_id,))


class TestTheOldNameStillWorks:
    def test_the_view_accepts_the_old_insert_and_links_the_agent(self, admin, tenant) -> None:
        agent = create_agent(admin, tenant)
        (source_id,) = admin.execute(
            """
            insert into public.ai_agent_sources
                (organization_id, agent_id, source_type, name, status)
            values (%s, %s, 'text', 'FAQ', 'ready')
            returning id
            """,
            (tenant, agent),
        ).fetchone()
        row = admin.execute(
            "select kind, folder, read_only from public.ai_sources where id = %s", (source_id,)
        ).fetchone()
        assert row == ("note", "geral", False)
        readers = admin.execute(
            "select agent_id from public.ai_source_agents where source_id = %s", (source_id,)
        ).fetchall()
        assert readers == [(agent,)]

    def test_a_source_without_an_agent_is_allowed_now(self, admin, tenant) -> None:
        source_id = create_source(admin, tenant)
        (agent_id,) = admin.execute(
            "select agent_id from public.ai_sources where id = %s", (source_id,)
        ).fetchone()
        assert agent_id is None

    def test_kind_outside_the_vocabulary_is_refused(self, admin, tenant) -> None:
        with pytest.raises(psycopg.errors.CheckViolation):
            create_source(admin, tenant, kind="video")


class TestChunkKinds:
    def test_a_callout_kind_is_stored_and_the_vocabulary_is_closed(self, admin, tenant) -> None:
        chunk = create_knowledge_chunk(admin, tenant, chunk_kind="regra")
        (kind,) = admin.execute(
            "select chunk_kind from public.ai_agent_chunks where id = %s", (chunk,)
        ).fetchone()
        assert kind == "regra"
        with pytest.raises(psycopg.errors.CheckViolation):
            create_knowledge_chunk(admin, tenant, chunk_kind="gif")


class TestSearchByReader:
    def test_only_sources_the_agent_reads_come_back(self, admin, tenant) -> None:
        reader = create_agent(admin, tenant, status="active")
        other = create_agent(admin, tenant, status="active")
        mine = create_source(admin, tenant, name="Trocas", readers=(reader,))
        theirs = create_source(admin, tenant, name="Frete", readers=(other,))
        create_knowledge_chunk(admin, tenant, source_id=mine, agent_id=None, content="trocas")
        create_knowledge_chunk(admin, tenant, source_id=theirs, agent_id=None, content="frete")

        rows = admin.execute(
            "select content from public.search_agent_knowledge(%s, %s, %s::vector, 0.0, 10)",
            (reader, tenant, an_embedding()),
        ).fetchall()
        assert [r[0] for r in rows] == ["trocas"]

    def test_the_legacy_link_by_chunk_agent_id_still_counts(self, admin, tenant) -> None:
        agent = create_agent(admin, tenant, status="active")
        create_knowledge_chunk(admin, tenant, agent_id=agent, content="antigo")
        rows = admin.execute(
            "select content from public.search_agent_knowledge(%s, %s, %s::vector, 0.0, 10)",
            (agent, tenant, an_embedding()),
        ).fetchall()
        assert [r[0] for r in rows] == ["antigo"]

    def test_a_ready_answer_outranks_plain_text_at_equal_distance(self, admin, tenant) -> None:
        agent = create_agent(admin, tenant, status="active")
        source = create_source(admin, tenant, readers=(agent,))
        create_knowledge_chunk(admin, tenant, source_id=source, content="texto", chunk_kind="text")
        create_knowledge_chunk(
            admin, tenant, source_id=source, content="resposta pronta", chunk_kind="resposta"
        )
        rows = admin.execute(
            "select content, metadata->>'chunk_kind'"
            " from public.search_agent_knowledge(%s, %s, %s::vector, 0.0, 10)",
            (agent, tenant, an_embedding()),
        ).fetchall()
        assert rows[0] == ("resposta pronta", "resposta")

    def test_another_tenants_chunk_is_not_there(self, admin, tenant) -> None:
        other = create_tenant(admin)
        try:
            agent = create_agent(admin, tenant, status="active")
            foreign_agent = create_agent(admin, other, status="active")
            create_knowledge_chunk(admin, other, agent_id=foreign_agent, content="alheio")
            rows = admin.execute(
                "select content from public.search_agent_knowledge(%s, %s, %s::vector, 0.0, 10)",
                (agent, tenant, an_embedding()),
            ).fetchall()
            assert rows == []
        finally:
            admin.execute("delete from public.organizations where id = %s", (other,))


class TestGaps:
    async def test_the_worker_writes_and_reads_only_its_org(self, dsn, admin, tenant) -> None:
        other = create_tenant(admin)
        try:
            admin.execute(
                "insert into public.ai_knowledge_gaps (organization_id, question)"
                " values (%s, 'tem frete gratis?')",
                (other,),
            )
            async with as_worker(dsn, tenant) as conn:
                await conn.execute(
                    "insert into public.ai_knowledge_gaps (organization_id, question, outcome)"
                    " values (%s, 'aceita pix?', 'transferred')",
                    (tenant,),
                )
                rows = await (await conn.execute(
                    "select question from public.ai_knowledge_gaps"
                )).fetchall()
            assert rows == [("aceita pix?",)]
        finally:
            admin.execute("delete from public.organizations where id = %s", (other,))

    async def test_the_worker_cannot_plant_a_gap_in_another_org(self, dsn, admin, tenant) -> None:
        other = create_tenant(admin)
        try:
            async with as_worker(dsn, tenant) as conn:
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    await conn.execute(
                        "insert into public.ai_knowledge_gaps (organization_id, question)"
                        " values (%s, 'x')",
                        (other,),
                    )
        finally:
            admin.execute("delete from public.organizations where id = %s", (other,))

    def test_outcome_and_status_vocabularies_are_closed(self, admin, tenant) -> None:
        with pytest.raises(psycopg.errors.CheckViolation):
            admin.execute(
                "insert into public.ai_knowledge_gaps (organization_id, question, outcome)"
                " values (%s, 'x', 'shrug')",
                (tenant,),
            )
