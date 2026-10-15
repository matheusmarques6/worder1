"""Busca por agente, regras e lacunas lidas e escritas pelo worker
(alteração 2026-10-15-11, plano IA M3 passo 20)."""

import uuid

import psycopg
import pytest

from agents_runtime.repository import knowledge as knowledge_repo
from tests.db.factories import create_agent, create_knowledge_chunk, create_source, create_tenant
from tests.support.database import as_worker
from tests.support.embedding import embed_text


@pytest.fixture
def tenant(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    yield organization_id
    with admin.cursor() as cur:
        cur.execute("delete from public.organizations where id = %s", (organization_id,))


def _vec(text: str) -> str:
    return "[" + ",".join(repr(v) for v in embed_text(text)) + "]"


class TestSearchByAgent:
    async def test_only_the_readers_sources_come_back(self, dsn, admin, tenant) -> None:
        sales = create_agent(admin, tenant, status="active")
        support = create_agent(admin, tenant, status="active")
        mine = create_source(admin, tenant, readers=(sales,))
        theirs = create_source(admin, tenant, readers=(support,))
        create_knowledge_chunk(admin, tenant, source_id=mine, agent_id=None,
                               content="frete grátis", embedding=_vec("frete grátis"))
        create_knowledge_chunk(admin, tenant, source_id=theirs, agent_id=None,
                               content="frete grátis no sul", embedding=_vec("frete grátis"))

        async with as_worker(dsn, tenant) as conn:
            for_sales = await knowledge_repo.search_knowledge(
                conn, embedding=embed_text("frete grátis"), threshold=0.0, agent_id=sales
            )
            for_all = await knowledge_repo.search_knowledge(
                conn, embedding=embed_text("frete grátis"), threshold=0.0
            )
        assert [c.content for c in for_sales] == ["frete grátis"]
        assert len(for_all) == 2


class TestRules:
    async def test_rules_of_the_agents_notes_only(self, dsn, admin, tenant) -> None:
        sales = create_agent(admin, tenant, status="active")
        other = create_agent(admin, tenant, status="active")
        mine = create_source(admin, tenant, readers=(sales,))
        theirs = create_source(admin, tenant, readers=(other,))
        create_knowledge_chunk(admin, tenant, source_id=mine, agent_id=None,
                               content="Regra: nunca prometer prazo", chunk_kind="regra")
        create_knowledge_chunk(admin, tenant, source_id=mine, agent_id=None,
                               content="texto comum", chunk_kind="text")
        create_knowledge_chunk(admin, tenant, source_id=theirs, agent_id=None,
                               content="Regra alheia", chunk_kind="regra")
        async with as_worker(dsn, tenant) as conn:
            rules = await knowledge_repo.load_rules(conn, agent_id=sales)
        assert rules == ("Regra: nunca prometer prazo",)


class TestGaps:
    async def test_the_same_open_question_accumulates(self, dsn, admin, tenant) -> None:
        a = create_agent(admin, tenant, status="active")
        b = create_agent(admin, tenant, status="active")
        async with as_worker(dsn, tenant) as conn:
            async with conn.transaction():
                first = await knowledge_repo.record_gap(
                    conn, organization_id=tenant, question="Tem frete grátis?",
                    outcome="answered_without_source", agent_id=a, conversation_id=None,
                )
                second = await knowledge_repo.record_gap(
                    conn, organization_id=tenant, question="  tem FRETE grátis ",
                    outcome="transferred", agent_id=b, conversation_id=None,
                )
        assert first == second
        row = admin.execute(
            "select count, outcome, agent_ids, jsonb_array_length(examples)"
            " from public.ai_knowledge_gaps where id = %s",
            (first,),
        ).fetchone()
        assert row[0] == 2 and row[1] == "transferred"
        assert set(row[2]) == {a, b} and row[3] == 2
