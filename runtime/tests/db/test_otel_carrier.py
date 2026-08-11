"""9.1b — o traceparent atravessa o banco: fila, conclude e outbox.

O Logfire só mostra "a conversa da fila ao envio" se o contexto viajar com o
trabalho: o coalescer aceita um otel e o carimba em cada job que enfileira; o
conclude grava o otel do TURNO na linha de outbox; o claim devolve ao sender.
Tudo com default null — quem chama sem otel continua funcionando byte a byte.
"""

import uuid

import psycopg
import pytest
from psycopg.types.json import Jsonb

from tests.db.conftest import TwoTenants
from tests.db.factories import create_thread, unique_id

TRACEPARENT = {"traceparent": "00-11111111111111111111111111111111-2222222222222222-01"}


@pytest.fixture
def turn(admin: psycopg.Connection, two_tenants: TwoTenants) -> dict:
    thread = create_thread(admin, two_tenants.a.id)
    admin.execute(
        "update public.conversations set processing_generation = 1, next_inbound_seq = 1"
        " where id = %s",
        (thread.conversation_id,),
    )
    token = uuid.uuid4()
    ((_, version),) = admin.execute(
        "select * from internal.claim_conversation(%s, %s)", (thread.conversation_id, token)
    ).fetchall()
    return {
        "conversation_id": thread.conversation_id,
        "token": token,
        "version": version,
    }


def conclude(admin: psycopg.Connection, turn: dict, *, otel=None) -> tuple:
    args = [
        turn["conversation_id"], turn["token"], turn["version"], 1, 1,
        Jsonb({"text": "resposta"}), unique_id("idem"), "reply", [],
    ]
    if otel is not None:
        args.append(Jsonb(otel))
        return admin.execute(
            "select * from internal.conclude_turn(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            args,
        ).fetchone()
    return admin.execute(
        "select * from internal.conclude_turn(%s, %s, %s, %s, %s, %s, %s, %s, %s)",
        args,
    ).fetchone()


class TestOutboxCarriesTheContext:
    def test_conclude_stores_it_and_claim_returns_it(
        self, admin: psycopg.Connection, turn: dict
    ) -> None:
        committed, _, outbox_id = conclude(admin, turn, otel=TRACEPARENT)
        assert committed is True

        (stored,) = admin.execute(
            "select otel from internal.message_outbox where id = %s", (outbox_id,)
        ).fetchone()
        assert stored == TRACEPARENT

        rows = admin.execute(
            "select outbox_id, otel from internal.claim_outbox_batch(%s, 50)",
            (uuid.uuid4(),),
        ).fetchall()
        by_id = {row[0]: row[1] for row in rows}
        assert by_id[outbox_id] == TRACEPARENT

    def test_the_nine_arg_call_still_works_and_stores_null(
        self, admin: psycopg.Connection, turn: dict
    ) -> None:
        committed, _, outbox_id = conclude(admin, turn)
        assert committed is True
        (stored,) = admin.execute(
            "select otel from internal.message_outbox where id = %s", (outbox_id,)
        ).fetchone()
        assert stored is None


class TestTheCoalescerStampsTheBatch:
    def test_the_queued_job_carries_the_pass_context(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        thread = create_thread(admin, two_tenants.a.id)
        admin.execute(
            "update public.conversations set pending_response_at = now() - interval '1s'"
            " where id = %s",
            (thread.conversation_id,),
        )

        admin.execute(
            "select * from internal.coalesce_due_conversations('q_inbound', 100, %s)",
            (Jsonb(TRACEPARENT),),
        )

        payload = None
        for _ in range(50):
            row = admin.execute("select msg_id, message from pgmq.pop('q_inbound')").fetchone()
            if row is None:
                break
            if row[1].get("conversation_id") == str(thread.conversation_id):
                payload = row[1]
                break
        assert payload is not None, "o job da conversa não chegou à fila"
        assert payload["otel"] == TRACEPARENT

    def test_the_two_arg_call_still_coalesces_with_null(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        thread = create_thread(admin, two_tenants.a.id)
        admin.execute(
            "update public.conversations set pending_response_at = now() - interval '1s'"
            " where id = %s",
            (thread.conversation_id,),
        )

        (count,) = admin.execute(
            "select count(*) from internal.coalesce_due_conversations('q_inbound', 100)"
        ).fetchone()
        assert count >= 1

        for _ in range(50):
            row = admin.execute("select msg_id, message from pgmq.pop('q_inbound')").fetchone()
            if row is None:
                break
            if row[1].get("conversation_id") == str(thread.conversation_id):
                assert row[1]["otel"] is None
                return
        pytest.fail("o job da conversa não chegou à fila")
