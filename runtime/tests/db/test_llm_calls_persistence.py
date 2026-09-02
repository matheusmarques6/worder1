"""The cost trail — one row per completed LLM call, written by `worker_role`.

The credential matters as much as the row: writing as a superuser would hide a
missing GRANT and a missing policy, and the first thing to break in production
would be a privilege this suite never exercised (decisão 21).

What is asserted here and nowhere else: that `internal.llm_calls` (§6.4)
accepts what the meter produces, that a call can be attributed to a conversation
or to nothing at all (an embedding has no conversation), and that a worker
scoped to tenant A cannot write a row that says tenant B spent the money.
"""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import psycopg
import pytest

from agents_runtime.repository import llm_calls as llm_repo
from tests.db.factories import create_agent, create_tenant, create_thread


@asynccontextmanager
async def as_worker(dsn: str, organization_id: uuid.UUID) -> AsyncIterator[psycopg.AsyncConnection]:
    """The runtime's own credential, scoped the way a unit of work scopes it."""
    async with await psycopg.AsyncConnection.connect(dsn) as conn:
        await conn.execute(
            "select set_config('app.organization_id', %s, true)", (str(organization_id),)
        )
        await conn.execute("set role worker_role")
        yield conn


@pytest.fixture
def tenant(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    yield organization_id
    with admin.cursor() as cur:
        cur.execute("delete from public.organizations where id = %s", (organization_id,))


class TestTheRow:
    async def test_a_completed_call_is_the_row_the_cost_screen_reads(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        async with as_worker(dsn, tenant) as conn:
            call_id = await llm_repo.record_llm_call(
                conn,
                organization_id=tenant,
                purpose="agent_reply",
                provider="openrouter",
                model="anthropic/claude-sonnet-5",
                input_tokens=120,
                output_tokens=40,
                cost_usd=0.00018,
                latency_ms=900,
            )
            await conn.commit()

        with admin.cursor() as cur:
            cur.execute(
                """
                select organization_id, purpose, provider, model, input_tokens, output_tokens,
                       cost_usd, latency_ms, conversation_id
                  from internal.llm_calls where id = %s
                """,
                (call_id,),
            )
            row = cur.fetchone()

        assert row[0] == tenant
        assert row[1] == "agent_reply"
        # D1: both are recorded because the route is fixed and the model is not.
        assert row[2] == "openrouter"
        assert row[3] == "anthropic/claude-sonnet-5"
        assert (row[4], row[5]) == (120, 40)
        assert float(row[6]) == pytest.approx(0.00018)
        assert row[7] == 900
        assert row[8] is None

    async def test_a_reply_call_is_attributed_to_its_conversation(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """Without this link, "which conversation cost R$ 4 today" has no answer."""
        thread = create_thread(admin, tenant)

        async with as_worker(dsn, tenant) as conn:
            call_id = await llm_repo.record_llm_call(
                conn,
                organization_id=tenant,
                purpose="agent_reply",
                provider="openrouter",
                model="anthropic/claude-sonnet-5",
                conversation_id=thread.conversation_id,
                input_tokens=10,
                output_tokens=5,
                cost_usd=0.00001,
                latency_ms=120,
            )
            await conn.commit()

        with admin.cursor() as cur:
            cur.execute("select conversation_id from internal.llm_calls where id = %s", (call_id,))
            (conversation_id,) = cur.fetchone()

        assert conversation_id == thread.conversation_id

    async def test_an_embedding_belongs_to_no_conversation(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """Ingesting the knowledge base (S6) happens outside any conversation —
        the trail still has to hold the spend."""
        async with as_worker(dsn, tenant) as conn:
            call_id = await llm_repo.record_llm_call(
                conn,
                organization_id=tenant,
                purpose="embedding",
                provider="openrouter",
                model="openai/text-embedding-3-small",
                input_tokens=8,
                cost_usd=0.000002,
                latency_ms=40,
            )
            await conn.commit()

        with admin.cursor() as cur:
            cur.execute(
                "select purpose, output_tokens from internal.llm_calls where id = %s", (call_id,)
            )
            purpose, output_tokens = cur.fetchone()

        assert purpose == "embedding"
        assert output_tokens is None


class TestTheUsageLogsMirror:
    """Auditoria item 37: a linha em `internal.llm_calls` é o gatilho, não o
    destino final para o painel de custo e o teto de gasto do lojista — os
    dois leem `public.ai_usage_logs`."""

    async def test_a_completed_call_mirrors_into_ai_usage_logs(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        agent_id = create_agent(admin, tenant)
        admin.commit()

        async with as_worker(dsn, tenant) as conn:
            call_id = await llm_repo.record_llm_call(
                conn,
                organization_id=tenant,
                purpose="agent_reply",
                provider="openrouter",
                model="anthropic/claude-sonnet-5",
                agent_id=agent_id,
                input_tokens=120,
                output_tokens=40,
                cost_usd=0.00018,
                latency_ms=900,
            )
            await conn.commit()

        with admin.cursor() as cur:
            cur.execute(
                """
                select organization_id, provider, model, feature, agent_id, conversation_id,
                       prompt_tokens, completion_tokens, cost_usd, duration_ms, success
                  from public.ai_usage_logs
                 where organization_id = %s
                """,
                (tenant,),
            )
            row = cur.fetchone()

        assert row is not None, f"llm_calls row {call_id} did not mirror into ai_usage_logs"
        (
            organization_id,
            provider,
            model,
            feature,
            mirrored_agent_id,
            conversation_id,
            prompt_tokens,
            completion_tokens,
            cost_usd,
            duration_ms,
            success,
        ) = row
        assert organization_id == tenant
        assert provider == "openrouter"
        assert model == "anthropic/claude-sonnet-5"
        # Vocabulário próprio (ruling B, item 37) — não é o `feature` do TS.
        assert feature == "runtime_agent_reply"
        assert mirrored_agent_id == agent_id
        assert conversation_id is None
        assert (prompt_tokens, completion_tokens) == (120, 40)
        assert float(cost_usd) == pytest.approx(0.00018)
        assert duration_ms == 900
        # `llm_calls` só recebe linha de chamada CONCLUÍDA (metering.py) —
        # todo espelho é, por definição, sucesso.
        assert success is True

    async def test_a_purpose_without_a_mapped_feature_fails_loud(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """Se o CHECK de `purpose` um dia ganhar um valor novo sem o mapa
        acompanhar (o que `tests/unit/test_ai_usage_logs_bridge.py` já trava
        sem banco), o trigger tem de recusar alto — não gravar `feature`
        inventado. Aqui a mesma garantia é provada com o mecanismo real: um
        purpose fora do CHECK nem chega a inserir em `llm_calls`."""
        async with as_worker(dsn, tenant) as conn:
            with pytest.raises(psycopg.errors.CheckViolation):
                await llm_repo.record_llm_call(
                    conn,
                    organization_id=tenant,
                    purpose="not_a_real_purpose",
                    provider="openrouter",
                    model="anthropic/claude-sonnet-5",
                    input_tokens=1,
                    output_tokens=1,
                    cost_usd=0.1,
                    latency_ms=1,
                )


class TestTheBoundary:
    async def test_a_worker_cannot_bill_another_tenant(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """The WITH CHECK half of the policy: a worker scoped to A writing a row
        that says B spent the money is how a cost screen starts lying."""
        stranger = create_tenant(admin)

        try:
            async with as_worker(dsn, tenant) as conn:
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    await llm_repo.record_llm_call(
                        conn,
                        organization_id=stranger,
                        purpose="agent_reply",
                        provider="openrouter",
                        model="anthropic/claude-sonnet-5",
                        input_tokens=1,
                        output_tokens=1,
                        cost_usd=0.1,
                        latency_ms=1,
                    )
        finally:
            with admin.cursor() as cur:
                cur.execute("delete from public.organizations where id = %s", (stranger,))

    def test_the_table_has_nowhere_to_put_content(self, admin: psycopg.Connection) -> None:
        """The PII law as a schema fact: cost, ids and timings — no prompt, no
        reply, no phone. A future column named `prompt` fails here first.

        `agent_id` (auditoria item 37, `20260902000001_ai_usage_logs_bridge.sql`)
        joined this set on purpose: it is an identifier, like `conversation_id`,
        added only so the DB-side trigger can mirror the row into
        `public.ai_usage_logs`. It does not carry content either.
        """
        with admin.cursor() as cur:
            cur.execute(
                """
                select column_name from information_schema.columns
                 where table_schema = 'internal' and table_name = 'llm_calls'
                """
            )
            columns = {row[0] for row in cur.fetchall()}

        assert columns == {
            "id",
            "organization_id",
            "purpose",
            "conversation_id",
            "eval_run_id",
            "provider",
            "model",
            "input_tokens",
            "output_tokens",
            "cost_usd",
            "latency_ms",
            "agent_id",
            "created_at",
        }
