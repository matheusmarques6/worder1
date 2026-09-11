"""public.emit_ai_mission_job — a porta do nó, e o invariante §3.4-9.

Escrita+fila é UMA transação: a conversa criada e o job na pgmq aparecem
juntos. As recusas são STATUS (o nó tem caminho de erro), nunca exceção — e
"sem missão ativa" deixa alerta, porque toque sem missão não sai jamais e o
lojista precisa saber que o fluxo dele está pedindo à toa.

A porta é do app server: EXECUTE só para service_role — worker e sender não
emitem toques, e a Data API (authenticated) muito menos.
"""

import uuid
from concurrent.futures import ThreadPoolExecutor

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


def create_run(
    admin: psycopg.Connection,
    organization_id: uuid.UUID,
    contact_id: uuid.UUID,
) -> uuid.UUID:
    automation_id = admin.execute(
        """
        insert into public.automations (organization_id, name, trigger_type)
        values (%s, 'mission-touch-contract', 'trigger_abandon')
        returning id
        """,
        (organization_id,),
    ).fetchone()[0]
    return admin.execute(
        """
        insert into public.automation_runs
            (automation_id, organization_id, contact_id, trigger_type,
             current_node_id, status)
        values (%s, %s, %s, 'trigger_abandon', 'trigger-1', 'running')
        returning id
        """,
        (automation_id, organization_id, contact_id),
    ).fetchone()[0]


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
            %(concession)s, %(channel)s, %(otel)s, %(run_id)s
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
            "run_id": kwargs.get("run_id"),
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
            run_id=create_run(admin, org, contact),
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
        touch_id = admin.execute(
            """
            select touch_id from internal.mission_touch_emissions
             where organization_id = %s and msg_id = %s
            """,
            (org, msg_id),
        ).fetchone()[0]
        assert job.touch_id == touch_id == uuid.UUID(payload["touch_id"])
        assert job.event_family == "cart.abandoned"
        assert job.node_ref == "flow-1:node-9"
        assert job.delta == {"objective": "recuperar com urgência"}
        assert job.concession_request == {"kind": "percent", "value": 10}

    def test_a_second_emit_reuses_the_canonical_conversation(
        self, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        contact = create_contact(admin, org)
        create_mission(admin, org, event_type="cart.abandoned", status="active")

        (_, first_conversation, _) = emit(
            admin, org, contact, run_id=create_run(admin, org, contact)
        )
        (_, second_conversation, _) = emit(
            admin, org, contact, run_id=create_run(admin, org, contact)
        )

        assert first_conversation == second_conversation
        (count,) = admin.execute(
            "select count(*) from public.conversations where contact_id = %s", (contact,)
        ).fetchone()
        assert count == 1

    def test_same_run_and_node_reuses_the_emission(
        self, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        contact = create_contact(admin, org)
        create_mission(admin, org, event_type="cart.abandoned", status="active")
        run_id = create_run(admin, org, contact)

        first = emit(admin, org, contact, run_id=run_id)
        second = emit(admin, org, contact, run_id=run_id)

        assert first == second
        assert first[0] == "queued"
        mine = [p for p in queued_payloads(admin) if p.get("organization_id") == str(org)]
        assert len(mine) == 1
        assert uuid.UUID(mine[0]["touch_id"])

    def test_concurrent_retry_reuses_one_receipt_and_queue_message(
        self,
        dsn: str,
        admin: psycopg.Connection,
        org: uuid.UUID,
    ) -> None:
        contact = create_contact(admin, org)
        create_mission(admin, org, event_type="cart.abandoned", status="active")
        run_id = create_run(admin, org, contact)

        def concurrent_emit(_: int) -> tuple:
            with psycopg.connect(dsn, autocommit=True) as conn:
                return emit(conn, org, contact, run_id=run_id)

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(concurrent_emit, range(2)))

        assert results[0] == results[1]
        mine = [p for p in queued_payloads(admin) if p.get("organization_id") == str(org)]
        assert len(mine) == 1

    def test_missing_run_identity_emits_nothing(
        self, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        contact = create_contact(admin, org)
        create_mission(admin, org, event_type="cart.abandoned", status="active")

        assert emit(admin, org, contact, run_id=None) == (
            "missing_run_identity",
            None,
            None,
        )
        mine = [p for p in queued_payloads(admin) if p.get("organization_id") == str(org)]
        assert mine == []


class TestTheRefusals:
    def test_an_org_off_the_rollout_gets_no_job(self, admin: psycopg.Connection) -> None:
        org = create_tenant(admin)
        try:
            contact = create_contact(admin, org)
            create_mission(admin, org, event_type="cart.abandoned", status="active")
            status, conversation_id, msg_id = emit(
                admin,
                org,
                contact,
                run_id=create_run(admin, org, contact),
            )
            assert (status, conversation_id, msg_id) == ("not_rolled_out", None, None)
        finally:
            admin.execute("delete from public.organizations where id = %s", (org,))

    def test_a_stranger_contact_is_refused(
        self, admin: psycopg.Connection, org: uuid.UUID, two_tenants: TwoTenants
    ) -> None:
        stranger_contact = create_contact(admin, two_tenants.b.id)
        run_contact = create_contact(admin, org)
        create_mission(admin, org, event_type="cart.abandoned", status="active")

        status, _, _ = emit(
            admin,
            org,
            stranger_contact,
            run_id=create_run(admin, org, run_contact),
        )
        assert status == "contact_not_found"

    def test_a_run_from_another_tenant_is_refused(
        self,
        admin: psycopg.Connection,
        org: uuid.UUID,
        two_tenants: TwoTenants,
    ) -> None:
        contact = create_contact(admin, org)
        foreign_contact = create_contact(admin, two_tenants.b.id)
        foreign_run = create_run(admin, two_tenants.b.id, foreign_contact)
        create_mission(admin, org, event_type="cart.abandoned", status="active")

        status, _, _ = emit(admin, org, contact, run_id=foreign_run)

        assert status == "run_not_found"
        mine = [p for p in queued_payloads(admin) if p.get("organization_id") == str(org)]
        assert mine == []

    def test_no_active_mission_refuses_and_alerts(
        self, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        contact = create_contact(admin, org)
        create_mission(admin, org, event_type="cart.abandoned", status="draft")

        status, _, _ = emit(
            admin,
            org,
            contact,
            run_id=create_run(admin, org, contact),
        )

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
        run_id = create_run(admin, org, contact)
        with as_app_role(dsn, "worker_role", org) as worker:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                emit(worker, org, contact, run_id=run_id)
