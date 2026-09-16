"""A trace is part of accepting an outbound, including rollback and retries."""

from dataclasses import replace
from types import SimpleNamespace
from uuid import uuid4

import psycopg
import pytest

from agents_runtime.agent_core.responder import build_responder, fixed_responder
from agents_runtime.agent_core.toucher import build_toucher, fixed_toucher
from agents_runtime.agent_core.trace import ReplyDraft
from agents_runtime.clock import SystemClock
from agents_runtime.config import QueueingConfig
from agents_runtime.queueing.jobs import InboundJob, MissionTouchJob
from agents_runtime.queueing.worker import TurnResult, run_touch, run_turn
from tests.db.conftest import as_app_role
from tests.db.factories import (
    create_agent_version,
    create_message,
    create_mission,
    create_thread,
    set_runtime_mode,
)
from tests.db.test_agent_trace_schema import accepted_fixture, record
from tests.support.database import as_runtime_worker
from tests.support.llm import ScriptedLlm


@pytest.fixture(params=["inbound", "touch"])
def accepted_case(request, admin, two_tenants, dsn):
    org = two_tenants.a.id
    set_runtime_mode(admin, org, "runtime")
    create_agent_version(admin, org, status="active")
    thread = create_thread(admin, org)
    create_message(admin, org, thread, text="customer window")
    admin.execute(
        "update public.conversations set processing_generation=3,next_inbound_seq=1 where id=%s",
        (thread.conversation_id,),
    )
    touch = request.param == "touch"
    mission = create_mission(
        admin, org, event_type="cart.abandoned" if touch else "whatsapp.received", status="active",
    )
    job = (
        MissionTouchJob(org, thread.contact_id, thread.conversation_id, uuid4(), "cart.abandoned",
                        channel_account_id=thread.channel_account_id)
        if touch else InboundJob(thread.conversation_id, 3, 1, org,
                                channel_account_id=thread.channel_account_id)
    )
    producer = (build_toucher if touch else build_responder)(
        dsn, llm=ScriptedLlm(reply="accepted output"), set_role="worker_role",
    )
    return SimpleNamespace(org=org, thread=thread, job=job, producer=producer,
                           run=run_touch if touch else run_turn, mission=mission, touch=touch)


async def run_case(dsn, case, producer=None):
    async with as_runtime_worker(dsn) as conn:
        return await case.run(conn, case.job, producer or case.producer,
                              config=QueueingConfig(), clock=SystemClock())


def effects(admin, case):
    return admin.execute(
        """select version,last_processed_seq,owner_mission_version_id,
             (select count(*) from public.messages
               where conversation_id=c.id and direction='outbound'),
             (select count(*) from internal.message_outbox where conversation_id=c.id),
             (select count(*) from public.agent_traces where conversation_id=c.id)
           from public.conversations c where id=%s""", (case.thread.conversation_id,),
    ).fetchone()


async def test_acceptance_concordance_and_committed_redelivery(dsn, admin, accepted_case):
    case = accepted_case
    assert await run_case(dsn, case) is TurnResult.DONE
    assert await run_case(dsn, case) is TurnResult.STALE
    rows = admin.execute(
        """select t.organization_id,t.conversation_id,t.channel_account_id,t.agent_id,
                  t.generation,t.target_seq,t.output,t.trace_source,t.selected_attempt,
                  o.organization_id,o.conversation_id,o.channel_account_id,o.payload->>'text',
                  a.organization_id,t.input,o.status
             from public.agent_traces t join internal.message_outbox o on o.id=t.outbox_id
             join public.ai_agents a on a.id=t.agent_id where t.conversation_id=%s""",
        (case.thread.conversation_id,),
    ).fetchall()
    assert len(rows) == 1
    row = rows[0]
    assert row[:3] == (case.org, case.thread.conversation_id, case.thread.channel_account_id)
    assert row[4:9] == (3, 1, "accepted output", "runtime_accepted", 0)
    assert row[9:14] == (case.org, case.thread.conversation_id,
                         case.thread.channel_account_id, "accepted output", case.org)
    assert row[14] == "user: customer window"
    assert row[15] == "pending"
    assert effects(admin, case)[3:] == (1, 1, 1)


async def test_real_writer_failure_rolls_back_every_effect_then_retry_once(
    dsn, admin, accepted_case,
):
    case = accepted_case
    before = effects(admin, case)
    admin.execute("""create function public.test_reject_accepted_trace() returns trigger
        language plpgsql as $$ begin raise exception 'trace storage unavailable'; end $$""")
    admin.execute("""create trigger test_reject_accepted_trace before insert on public.agent_traces
        for each row execute function public.test_reject_accepted_trace()""")
    try:
        with pytest.raises(psycopg.errors.RaiseException, match="trace storage unavailable"):
            await run_case(dsn, case)
        assert effects(admin, case) == before
    finally:
        admin.execute("drop trigger test_reject_accepted_trace on public.agent_traces")
        admin.execute("drop function public.test_reject_accepted_trace()")
    # Phase 1's lease survives rollback of phase 3; emulate ordinary lease expiry.
    admin.execute("update public.conversations set processing_until=now()-interval '1 second' "
                  "where id=%s", (case.thread.conversation_id,))
    assert await run_case(dsn, case) is TurnResult.DONE
    assert await run_case(dsn, case) is TurnResult.STALE
    after = effects(admin, case)
    assert after[0] == before[0] + 1
    assert after[1] == 1
    assert after[2] == (case.mission if case.touch else None)
    assert after[3:] == (1, 1, 1)


async def test_superseded_generation_never_records_trace(dsn, admin, accepted_case):
    case = accepted_case

    async def superseded(job):
        draft = await case.producer(job)
        admin.execute("update public.conversations set processing_generation=4 where id=%s",
                      (case.thread.conversation_id,))
        return draft

    assert await run_case(dsn, case, superseded) is TurnResult.SUPERSEDED
    assert effects(admin, case)[3:] == (0, 0, 0)


@pytest.mark.parametrize("channel", ["email", "instagram"])
async def test_non_whatsapp_acceptance_keeps_account_null(dsn, admin, accepted_case, channel):
    case = accepted_case
    admin.execute("update public.conversations set last_channel=%s where id=%s",
                  (channel, case.thread.conversation_id))
    case.job = replace(case.job, channel_account_id=None)
    agent_id = admin.execute("select id from public.ai_agents where organization_id=%s",
                             (case.org,)).fetchone()[0]
    produce = (fixed_toucher if case.touch else fixed_responder)(
        "accepted output", agent_id=agent_id,
    )

    assert await run_case(dsn, case, produce) is TurnResult.DONE
    assert await run_case(dsn, case, produce) is TurnResult.STALE
    assert effects(admin, case)[3:] == (1, 1, 1)
    assert admin.execute(
        """select o.channel,o.channel_account_id,t.channel_account_id,m.channel_account_id,
                  t.organization_id,t.agent_id,t.generation,t.target_seq,t.output
             from internal.message_outbox o join public.agent_traces t on t.outbox_id=o.id
             join public.messages m on m.outbox_id=o.id where o.conversation_id=%s""",
        (case.thread.conversation_id,),
    ).fetchone() == (channel, None, None, None, case.org, agent_id, 3, 1, "accepted output")


@pytest.mark.parametrize("channel", ["whatsapp", "email", "instagram"])
def test_accepted_trace_rpc_rejects_account_incompatible_with_channel(
    dsn, admin, two_tenants, channel,
):
    values = accepted_fixture(admin, two_tenants.a.id)
    if channel == "whatsapp":
        values["p_channel_account_id"] = None
    else:
        admin.execute("update internal.message_outbox set channel=%s,channel_account_id=null "
                      "where id=%s", (channel, values["p_outbox_id"]))
    with as_app_role(dsn, "worker_role", two_tenants.a.id) as worker:
        with pytest.raises(psycopg.errors.InvalidParameterValue) as rejected:
            record(worker, values)
        assert rejected.value.sqlstate == "22023"


async def test_touch_outbox_without_trace_is_an_error_and_rolls_back(dsn, admin, two_tenants):
    org = two_tenants.a.id
    thread = create_thread(admin, org)
    job = MissionTouchJob(org, thread.contact_id, thread.conversation_id, uuid4(), "cart.abandoned",
                          channel_account_id=thread.channel_account_id)
    case = SimpleNamespace(thread=thread, job=job, run=run_touch)
    before = effects(admin, case)

    async def missing_trace(_):
        return SimpleNamespace(content={"text": "missing metadata"}, trace=None,
                               moment_ids=(), mission_version_id=None)

    with pytest.raises(RuntimeError, match="accepted outbound is missing trace metadata"):
        await run_case(dsn, case, missing_trace)
    assert effects(admin, case) == before


@pytest.mark.parametrize("silent", [False, True])
async def test_unconfigured_fixed_inbound_fails_closed_but_silence_commits(
    dsn, admin, two_tenants, silent,
):
    org = two_tenants.a.id
    set_runtime_mode(admin, org, "runtime")
    thread = create_thread(admin, org)
    admin.execute("update public.conversations set next_inbound_seq=1 where id=%s",
                  (thread.conversation_id,))
    job = InboundJob(thread.conversation_id, 0, 1, org,
                     channel_account_id=thread.channel_account_id)
    case = SimpleNamespace(thread=thread, job=job, run=run_turn)
    before = effects(admin, case)

    async def quiet(_):
        return ReplyDraft(None, None)

    if silent:
        assert await run_case(dsn, case, quiet) is TurnResult.DONE
        assert effects(admin, case)[1] == 1
    else:
        with pytest.raises(RuntimeError, match="accepted outbound is missing trace metadata"):
            await run_case(dsn, case, fixed_responder())
        assert effects(admin, case) == before
    assert effects(admin, case)[3:] == (0, 0, 0)
