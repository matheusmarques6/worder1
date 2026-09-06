"""Task 9 — an already-queued inbound job must obey a rollout flip-back."""

import uuid

import psycopg
import pytest

from agents_runtime.clock import SystemClock
from agents_runtime.config import QueueingConfig
from agents_runtime.queueing import INBOUND
from agents_runtime.queueing.jobs import InboundJob
from agents_runtime.queueing.worker import TurnResult, run_turn
from tests.db.conftest import TwoTenants
from tests.db.factories import create_thread, make_due, set_runtime_mode
from tests.support.database import as_runtime_worker


@pytest.fixture(autouse=True)
def empty_inbound(admin: psycopg.Connection):
    admin.execute("select pgmq.purge_queue(%s)", (INBOUND,))
    yield
    admin.execute("select pgmq.purge_queue(%s)", (INBOUND,))


def coalesce_job(admin: psycopg.Connection, organization_id: uuid.UUID) -> InboundJob:
    (conversation_id, generation, target_seq, job_org, otel) = admin.execute(
        "select * from internal.coalesce_due_conversations(%s, %s)", (INBOUND, 1)
    ).fetchone()
    assert job_org == organization_id
    return InboundJob(
        conversation_id=conversation_id,
        generation=generation,
        target_seq=target_seq,
        organization_id=job_org,
        otel=otel,
    )


def effects(admin: psycopg.Connection, conversation_id: uuid.UUID) -> tuple[int, int, object]:
    outbound = admin.execute(
        "select count(*) from public.messages"
        " where conversation_id = %s and direction = 'outbound'",
        (conversation_id,),
    ).fetchone()[0]
    outbox = admin.execute(
        "select count(*) from internal.message_outbox where conversation_id = %s",
        (conversation_id,),
    ).fetchone()[0]
    token = admin.execute(
        "select processing_token from public.conversations where id = %s", (conversation_id,)
    ).fetchone()[0]
    return outbound, outbox, token


async def run_coalesced_turn(dsn: str, job: InboundJob, responder) -> TurnResult:
    async with as_runtime_worker(dsn) as conn:
        return await run_turn(
            conn, job, responder, config=QueueingConfig(), clock=SystemClock()
        )


class TestInboundRolloutRevocation:
    async def test_legacy_flip_before_the_turn_archives_without_calling_the_responder(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        organization_id = two_tenants.a.id
        set_runtime_mode(admin, organization_id, "runtime")
        thread = create_thread(admin, organization_id)
        make_due(admin, thread.conversation_id, last_inbound_seq=1)
        job = coalesce_job(admin, organization_id)
        set_runtime_mode(admin, organization_id, "legacy")
        calls = 0

        async def responder(_: InboundJob) -> dict[str, str]:
            nonlocal calls
            calls += 1
            return {"text": "rascunho revogado"}

        result = await run_coalesced_turn(dsn, job, responder)

        assert result is TurnResult.SUPERSEDED
        assert calls == 0
        assert effects(admin, thread.conversation_id) == (0, 0, None)

    async def test_legacy_flip_during_the_turn_rejects_the_draft_in_the_conclusion_cas(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        organization_id = two_tenants.a.id
        set_runtime_mode(admin, organization_id, "runtime")
        thread = create_thread(admin, organization_id)
        make_due(admin, thread.conversation_id, last_inbound_seq=1)
        job = coalesce_job(admin, organization_id)
        calls = 0

        async def responder(_: InboundJob) -> dict[str, str]:
            nonlocal calls
            calls += 1
            set_runtime_mode(admin, organization_id, "legacy")
            return {"text": "rascunho que nao pode concluir"}

        result = await run_coalesced_turn(dsn, job, responder)

        assert result is TurnResult.SUPERSEDED
        assert calls == 1
        assert effects(admin, thread.conversation_id) == (0, 0, None)

    async def test_runtime_tenant_still_concludes_the_real_coalesced_job(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        organization_id = two_tenants.a.id
        set_runtime_mode(admin, organization_id, "runtime")
        thread = create_thread(admin, organization_id)
        make_due(admin, thread.conversation_id, last_inbound_seq=1)
        job = coalesce_job(admin, organization_id)
        calls = 0

        async def responder(_: InboundJob) -> dict[str, str]:
            nonlocal calls
            calls += 1
            return {"text": "controle runtime"}

        result = await run_coalesced_turn(dsn, job, responder)

        assert result is TurnResult.DONE
        assert calls == 1
        assert effects(admin, thread.conversation_id) == (1, 1, None)
