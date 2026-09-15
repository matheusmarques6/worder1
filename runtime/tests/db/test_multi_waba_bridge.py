"""Account identity survives the shared conversation."""

import uuid
from datetime import timedelta

import httpx
import psycopg
import pytest

from agents_runtime.channels import cloud_api
from agents_runtime.clock import SystemClock
from agents_runtime.config import QueueingConfig
from agents_runtime.queueing.jobs import InboundJob
from agents_runtime.queueing.sender import sender_pass
from agents_runtime.queueing.worker import TurnResult, run_turn
from agents_runtime.randomness import SystemRandomness
from agents_runtime.repository import engine
from tests.db.conftest import as_app_role
from tests.db.factories import (
    contact_phone,
    create_channel_account,
    create_cloud_mirror,
    create_thread,
    set_runtime_mode,
)
from tests.db.test_ai_run_steps import link_identity

pytestmark = pytest.mark.db


def test_shared_conversation_preserves_each_inbound_account(admin, two_tenants):
    org = two_tenants.a.id
    thread = create_thread(admin, org)
    account_b = create_channel_account(admin, org)
    phone = contact_phone(admin, thread.contact_id)
    conversations = []
    for account_id in (thread.channel_account_id, account_b.id):
        row = admin.execute(
            "select * from public.ingest_inbound_message"
            "(%s, 'whatsapp', %s, 'Contact', '{}', %s, 0, %s)",
            (org, phone, f"wamid.{uuid.uuid4()}", account_id),
        ).fetchone()
        conversations.append(row[0])
    assert conversations == [thread.conversation_id, thread.conversation_id]
    rows = admin.execute(
        "select channel_account_id from public.messages"
        " where conversation_id = %s order by seq", (thread.conversation_id,),
    ).fetchall()
    assert rows == [(thread.channel_account_id,), (account_b.id,)]


def test_bridge_operations_ignore_newer_other_account(admin, dsn, two_tenants):
    org = two_tenants.a.id
    thread = create_thread(admin, org)
    account_b = create_channel_account(admin, org)
    phone = contact_phone(admin, thread.contact_id)
    link_identity(admin, org, thread.contact_id, phone)
    mirror_a = create_cloud_mirror(admin, org, thread.channel_account_id, phone)
    mirror_b = create_cloud_mirror(admin, org, account_b.id, phone)
    admin.execute(
        "update public.whatsapp_cloud_conversations"
        " set last_message_at = now(), ai_enabled = false where id = %s",
        (mirror_b.conversation_id,),
    )
    with as_app_role(dsn, "sender_role", org) as sender:
        assert sender.execute(
            "select internal.mirror_outbound_to_inbox(%s, %s, %s, 'reply A', %s)",
            (org, phone, f"wamid.{uuid.uuid4()}", thread.channel_account_id),
        ).fetchone() == (True,)
    with as_app_role(dsn, "worker_role", org) as worker:
        assert worker.execute(
            "select internal.emit_ai_run_step(%s, %s, 'generating', null, null,"
            " null, %s, null, %s)",
            (org, uuid.uuid4(), thread.conversation_id, thread.channel_account_id),
        ).fetchone() == (True,)
        state = worker.execute(
            "select * from internal.legacy_conversation_guard_state(%s, %s, %s)",
            (org, thread.conversation_id, thread.channel_account_id),
        ).fetchone()
        assert state[0] is True
        assert state[3] == 1
        assert worker.execute(
            "select internal.mark_ai_handoff(%s, %s, 'only A', %s)",
            (org, thread.conversation_id, thread.channel_account_id),
        ).fetchone() == (True,)
    assert admin.execute(
        "select conversation_id from public.whatsapp_ai_run_steps"
        " where organization_id = %s", (org,),
    ).fetchall() == [(mirror_a.conversation_id,)]
    assert admin.execute(
        "select ai_disabled_reason from public.whatsapp_cloud_conversations where id = %s",
        (mirror_b.conversation_id,),
    ).fetchone() == (None,)


@pytest.mark.parametrize("invalid", ["foreign", "unknown", "ambiguous", "zero"])
def test_account_validation_precedes_ingest_mutation(admin, two_tenants, invalid):
    org = two_tenants.a.id
    thread = create_thread(admin, org)
    account = None
    if invalid == "foreign":
        account = create_channel_account(admin, two_tenants.b.id).id
    elif invalid == "unknown":
        account = uuid.uuid4()
    elif invalid == "ambiguous":
        create_channel_account(admin, org)
    else:
        admin.execute(
            "update public.whatsapp_business_accounts set status='inactive' where id=%s",
            (thread.channel_account_id,),
        )
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        admin.execute(
            "select * from public.ingest_inbound_message"
            "(%s, 'whatsapp', %s, 'Contact', '{}', %s, 0, %s)",
            (org, contact_phone(admin, thread.contact_id), f"wamid.{uuid.uuid4()}", account),
        )
    assert admin.execute(
        "select next_inbound_seq from public.conversations where id=%s",
        (thread.conversation_id,),
    ).fetchone() == (0,)


def test_touch_emission_freezes_explicit_account_and_keeps_one_conversation(admin, two_tenants):
    from tests.db.factories import create_mission
    from tests.db.test_emit_mission_job import create_run

    org = two_tenants.a.id
    thread = create_thread(admin, org)
    account_b = create_channel_account(admin, org)
    set_runtime_mode(admin, org)
    create_mission(admin, org, status="active")
    for account in (thread.channel_account_id, account_b.id):
        run = create_run(admin, org, thread.contact_id)
        result = admin.execute(
            "select * from public.emit_ai_mission_job"
            "(%s, %s, 'cart.abandoned', 'node-1', '{}', null, 'whatsapp', null, %s, %s)",
            (org, thread.contact_id, run, account),
        ).fetchone()
        assert result[:2] == ("queued", thread.conversation_id)
        payload = admin.execute(
            "select message from pgmq.q_q_domain_events where msg_id=%s", (result[2],),
        ).fetchone()[0]
        assert payload["channel_account_id"] == str(account)


@pytest.mark.parametrize("kind", ["inbound", "touch"])
@pytest.mark.parametrize("active_count", [0, 1, 2])
async def test_old_jobs_resolve_real_account_before_generation(
    admin, dsn, two_tenants, kind, active_count,
):
    from agents_runtime.agent_core.toucher import TouchDraft
    from agents_runtime.queueing.jobs import MissionTouchJob
    from agents_runtime.queueing.worker import run_touch

    org = two_tenants.a.id
    thread = create_thread(admin, org)
    set_runtime_mode(admin, org)
    if active_count == 0:
        admin.execute(
            "update public.whatsapp_business_accounts set status='inactive' where id=%s",
            (thread.channel_account_id,),
        )
    if active_count == 2:
        create_channel_account(admin, org)
    raw = dict(organization_id=str(org), conversation_id=str(thread.conversation_id))
    if kind == "inbound":
        raw.update(generation=0, target_seq=1)
        job = InboundJob.from_payload(raw)
        run = run_turn
        admin.execute(
            "update public.conversations set next_inbound_seq=1 where id=%s",
            (thread.conversation_id,),
        )
    else:
        raw.update(kind="mission_touch", contact_id=str(thread.contact_id),
                   touch_id=str(uuid.uuid4()), event_family="cart.abandoned")
        job = MissionTouchJob.from_payload(raw)
        run = run_touch
    generated = []

    async def produce(resolved):
        generated.append(resolved.channel_account_id)
        return None if kind == "inbound" else TouchDraft(None, (), None)

    async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as worker:
        await worker.execute("set role worker_role")
        if active_count != 1:
            with pytest.raises(psycopg.errors.InvalidParameterValue):
                await run(worker, job, produce, config=QueueingConfig(), clock=SystemClock())
            assert generated == []
            assert admin.execute(
                "select processing_token, version from public.conversations where id=%s",
                (thread.conversation_id,),
            ).fetchone() == (None, 0)
        else:
            assert await run(
                worker, job, produce, config=QueueingConfig(), clock=SystemClock(),
            ) is TurnResult.DONE
            assert generated == [thread.channel_account_id]
    assert admin.execute(
        "select count(*) from internal.message_outbox where organization_id=%s", (org,),
    ).fetchone() == (0,)


def test_legacy_ingest_resolves_one_active_account(admin, two_tenants):
    org = two_tenants.a.id
    thread = create_thread(admin, org)
    row = admin.execute(
        "select * from public.ingest_inbound_message"
        "(%s, 'whatsapp', %s, 'Contact', '{}', %s)",
        (org, contact_phone(admin, thread.contact_id), f"wamid.{uuid.uuid4()}"),
    ).fetchone()
    assert admin.execute(
        "select channel_account_id from public.messages where conversation_id=%s", (row[0],),
    ).fetchone() == (thread.channel_account_id,)


def test_rpc_catalog_exposes_one_defaulted_account_signature(admin):
    for name, role in {
        "ingest_inbound_message": "service_role",
        "mirror_outbound_to_inbox": "sender_role",
        "emit_ai_run_step": "worker_role",
        "legacy_conversation_guard_state": "worker_role",
        "mark_ai_handoff": "worker_role",
    }.items():
        rows = admin.execute(
            "select p.oid, pg_get_function_arguments(p.oid)"
            " from pg_proc p join pg_namespace n on n.oid=p.pronamespace"
            " where p.proname=%s and n.nspname in ('public', 'internal')", (name,),
        ).fetchall()
        assert len(rows) == 1
        oid, arguments = rows[0]
        assert "p_waba_id uuid DEFAULT NULL::uuid" in arguments
        assert admin.execute(
            "select has_function_privilege(%s, %s, 'execute'),"
            " has_function_privilege('authenticated', %s, 'execute')", (role, oid, oid),
        ).fetchone() == (True, False)


@pytest.mark.parametrize("during_generation", [True, False])
async def test_new_account_supersedes_a_draft_but_never_reroutes_a_committed_send(
    admin, dsn, two_tenants, monkeypatch, during_generation,
):
    org = two_tenants.a.id
    thread = create_thread(admin, org)
    account_b = create_channel_account(admin, org, access_token="token-B")
    admin.execute(
        "update public.whatsapp_business_accounts set access_token='token-A' where id=%s",
        (thread.channel_account_id,),
    )
    phone = contact_phone(admin, thread.contact_id)
    mirror_a = create_cloud_mirror(admin, org, thread.channel_account_id, phone)
    mirror_b = create_cloud_mirror(admin, org, account_b.id, phone)
    set_runtime_mode(admin, org)
    wamid_a, wamid_b = f"wamid.A.{uuid.uuid4()}", f"wamid.B.{uuid.uuid4()}"

    def inbound(account, wamid):
        admin.execute(
            "select * from public.ingest_inbound_message"
            "(%s, 'whatsapp', %s, 'Contact', '{}', %s, 0, %s)",
            (org, phone, wamid, account),
        )
        admin.execute("select * from internal.coalesce_due_conversations()").fetchall()
        raw = admin.execute(
            "select message from pgmq.q_q_inbound"
            " where message->>'conversation_id'=%s order by msg_id desc limit 1",
            (str(thread.conversation_id),),
        ).fetchone()[0]
        return InboundJob.from_payload(raw)

    job_a = inbound(thread.channel_account_id, wamid_a)
    assert job_a.channel_account_id == thread.channel_account_id
    job_b = None

    async def produce_a(job):
        nonlocal job_b
        assert job.channel_account_id == thread.channel_account_id
        if during_generation:
            job_b = inbound(account_b.id, wamid_b)
        return {"text": "reply A", "humanize": {"split": False, "rhythm": False}}

    async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as worker:
        await worker.execute("set role worker_role")
        result = await run_turn(
            worker, job_a, produce_a, config=QueueingConfig(), clock=SystemClock(),
        )
        if during_generation:
            assert result is TurnResult.SUPERSEDED
            assert admin.execute(
                "select count(*) from internal.message_outbox where organization_id=%s",
                (org,),
            ).fetchone() == (0,)
            assert job_b.channel_account_id == account_b.id

            async def produce_b(job):
                assert job.channel_account_id == account_b.id
                return {"text": "reply B"}

            assert await run_turn(
                worker, job_b, produce_b, config=QueueingConfig(), clock=SystemClock(),
            ) is TurnResult.DONE
            assert admin.execute(
                "select channel_account_id from internal.message_outbox"
                " where organization_id=%s", (org,),
            ).fetchone() == (account_b.id,)
            return
        assert result is TurnResult.DONE

    inbound(account_b.id, wamid_b)
    seen = []

    def handler(request):
        seen.append((str(request.url), request.headers["authorization"], request.content))
        return httpx.Response(200, json={"messages": [{"id": "wamid.sent-A"}]})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        cloud_api.httpx, "AsyncClient",
        lambda **kwargs: real_client(**(kwargs | {"transport": httpx.MockTransport(handler)})),
    )
    monkeypatch.setenv("ENCRYPTION_KEY", "x" * 32)
    channel = cloud_api.from_env(dsn)
    try:
        async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as sender:
            await sender.execute("set role sender_role")
            # Inspect the real claim, then leave it pending for the full sender path.
            async with sender.transaction(force_rollback=True):
                sends = await engine.claim_outbox_batch(
                    sender, uuid.uuid4(), lease=timedelta(seconds=60),
                )
                send = next(item for item in sends if item.organization_id == org)
                assert send.channel_account_id == thread.channel_account_id
                assert send.last_inbound_wamid == wamid_a
            assert await sender_pass(
                sender, channel, config=QueueingConfig(humanize_delays=False),
                randomness=SystemRandomness(),
            ) >= 1
    finally:
        await channel.aclose()
    number_a = admin.execute(
        "select phone_number_id from public.whatsapp_business_accounts where id=%s",
        (thread.channel_account_id,),
    ).fetchone()[0]
    assert seen
    assert all(url.endswith(f"/{number_a}/messages") and token == "Bearer token-A"
               for url, token, _ in seen)
    assert all(wamid_b.encode() not in body for _, _, body in seen)
    assert admin.execute(
        "select conversation_id from public.whatsapp_cloud_messages where message_id=%s",
        ("wamid.sent-A",),
    ).fetchone() == (mirror_a.conversation_id,)
    assert admin.execute(
        "select count(*) from public.whatsapp_cloud_messages where conversation_id=%s",
        (mirror_b.conversation_id,),
    ).fetchone() == (0,)
