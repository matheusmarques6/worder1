"""public.emit_ai_mission_job — a porta do nó, e o invariante §3.4-9.

Escrita+fila é UMA transação: a conversa criada e o job na pgmq aparecem
juntos. As recusas são STATUS (o nó tem caminho de erro), nunca exceção — e
"sem missão ativa" deixa alerta, porque toque sem missão não sai jamais e o
lojista precisa saber que o fluxo dele está pedindo à toa.

A porta é do app server: EXECUTE só para service_role — worker e sender não
emitem toques, e a Data API (authenticated) muito menos.
"""

import uuid

import psycopg
import pytest
from psycopg.types.json import Jsonb

from agents_runtime.queueing.jobs import MissionTouchJob
from tests.db.conftest import TwoTenants, as_app_role
from tests.db.factories import create_contact, create_mission, create_tenant


@pytest.fixture
def org(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    admin.execute(
        "insert into public.ai_runtime_rollout (organization_id, mode)"
        " values (%s, 'runtime')",
        (organization_id,),
    )
    yield organization_id
    admin.execute("delete from public.organizations where id = %s", (organization_id,))


def emit(
    conn: psycopg.Connection,
    org: uuid.UUID,
    contact: uuid.UUID,
    family: str = "cart.abandoned",
    **kwargs,
) -> tuple:
    return conn.execute(
        """
        select * from public.emit_ai_mission_job(
            %(org)s, %(contact)s, %(family)s, %(node_ref)s, %(delta)s,
            %(concession)s, %(channel)s, %(otel)s
        )
        """,
        {
            "org": org,
            "contact": contact,
            "family": family,
            "node_ref": kwargs.get("node_ref", "flow-1:node-9"),
            "delta": Jsonb(kwargs.get("delta", {})),
            "concession": (
                Jsonb(kwargs["concession"]) if kwargs.get("concession") else None
            ),
            "channel": kwargs.get("channel", "whatsapp"),
            "otel": None,
        },
    ).fetchone()


def queued_payloads(admin: psycopg.Connection) -> list[dict]:
    rows = admin.execute("select message from pgmq.q_q_domain_events").fetchall()
    return [row[0] for row in rows]


class TestTheOneTransaction:
    def test_queued_means_conversation_and_job_together(
        self, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        contact = create_contact(admin, org)
        create_mission(admin, org, event_type="cart.abandoned", status="active")

        status, conversation_id, msg_id = emit(
            admin, org, contact,
            delta={"objective": "recuperar com urgência"},
            concession={"kind": "percent", "value": 10},
        )

        assert status == "queued"
        assert msg_id is not None

        (exists,) = admin.execute(
            "select count(*) from public.conversations where id = %s and contact_id = %s",
            (conversation_id, contact),
        ).fetchone()
        assert exists == 1

        (payload,) = [
            p for p in queued_payloads(admin) if p.get("conversation_id") == str(conversation_id)
        ]
        job = MissionTouchJob.from_payload(payload)
        assert job.event_family == "cart.abandoned"
        assert job.node_ref == "flow-1:node-9"
        assert job.delta == {"objective": "recuperar com urgência"}
        assert job.concession_request == {"kind": "percent", "value": 10}

    def test_a_second_emit_reuses_the_canonical_conversation(
        self, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        contact = create_contact(admin, org)
        create_mission(admin, org, event_type="cart.abandoned", status="active")

        (_, first_conversation, _) = emit(admin, org, contact)
        (_, second_conversation, _) = emit(admin, org, contact)

        assert first_conversation == second_conversation
        (count,) = admin.execute(
            "select count(*) from public.conversations where contact_id = %s", (contact,)
        ).fetchone()
        assert count == 1


class TestTheRefusals:
    def test_an_org_off_the_rollout_gets_no_job(self, admin: psycopg.Connection) -> None:
        org = create_tenant(admin)
        try:
            contact = create_contact(admin, org)
            create_mission(admin, org, event_type="cart.abandoned", status="active")
            status, conversation_id, msg_id = emit(admin, org, contact)
            assert (status, conversation_id, msg_id) == ("not_rolled_out", None, None)
        finally:
            admin.execute("delete from public.organizations where id = %s", (org,))

    def test_a_stranger_contact_is_refused(
        self, admin: psycopg.Connection, org: uuid.UUID, two_tenants: TwoTenants
    ) -> None:
        stranger_contact = create_contact(admin, two_tenants.b.id)
        create_mission(admin, org, event_type="cart.abandoned", status="active")

        status, _, _ = emit(admin, org, stranger_contact)
        assert status == "contact_not_found"

    def test_no_active_mission_refuses_and_alerts(
        self, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        contact = create_contact(admin, org)
        create_mission(admin, org, event_type="cart.abandoned", status="draft")

        status, _, _ = emit(admin, org, contact)

        assert status == "no_active_mission"
        (alert,) = admin.execute(
            "select type, metadata ->> 'event_family' from public.alerts"
            " where organization_id = %s",
            (org,),
        ).fetchall()
        assert alert == ("no_active_mission", "cart.abandoned")
        mine = [p for p in queued_payloads(admin) if p.get("organization_id") == str(org)]
        assert mine == []


class TestTheDoor:
    def test_worker_cannot_emit(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        contact = create_contact(admin, org)
        with as_app_role(dsn, "worker_role", org) as worker:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                emit(worker, org, contact)
