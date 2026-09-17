"""Accepted traces survive the real producer/queue/sender composition."""

from agents_runtime.agent_core.responder import build_responder
from tests.db.factories import create_channel_account, unique_phone
from tests.pipeline.test_real_responder import (
    REPLY,
    _drive,
    a_tenant_with_an_agent,
    ingest_message,
)
from tests.support.llm import ScriptedLlm


async def test_delivery_and_trace_share_the_same_accepted_outbox(
    dsn, admin, sync_admin, tiny_config,
):
    org = a_tenant_with_an_agent(sync_admin, tools=())
    account = create_channel_account(sync_admin, org)
    conversation_id = ingest_message(sync_admin, org, unique_phone(), "qual é o frete?")[0]

    async def delivered():
        cursor = await admin.execute("select count(*) from testing.fake_channel_sends")
        return (await cursor.fetchone())[0] == 1

    await _drive(dsn, tiny_config,
                 build_responder(dsn, llm=ScriptedLlm(reply=REPLY), set_role="worker_role"),
                 delivered, note="accepted reply delivered")
    rows = sync_admin.execute(
        """select t.organization_id,t.channel_account_id,t.output,t.input,t.selected_attempt,
                  t.tokens,t.provider,t.model,o.payload->>'text',o.status
             from public.agent_traces t join internal.message_outbox o on o.id=t.outbox_id
            where t.conversation_id=%s""", (conversation_id,),
    ).fetchall()
    assert len(rows) == 1
    assert rows[0][:6] == (org, account.id, REPLY, "user: qual é o frete?", 0, 160)
    assert rows[0][6] is not None and rows[0][7].startswith("stand-in/")
    assert rows[0][8:] == (REPLY, "sent")
