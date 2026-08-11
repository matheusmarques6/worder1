"""O engine contra o banco real: emite, reusa, nega — e a corrida.

O que nenhum teste puro alcança: o ON CONFLICT devolvendo o grant do primeiro
fluxo, o ledger crescendo na MESMA transação, e o RLS segurando o worker na
própria org enquanto ele escreve dinheiro."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import psycopg
import pytest

from agents_runtime.agent_core.mission_resolver import ResolvedMission
from agents_runtime.clock import SystemClock
from agents_runtime.commerce import offer_engine
from agents_runtime.commerce.offer_engine import OfferRequest
from agents_runtime.repository import incentives as incentives_repo
from tests.db.factories import create_contact, create_mission, create_moment, create_tenant
from tests.support.database import as_worker


@pytest.fixture
def org(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    yield organization_id
    admin.execute("delete from public.organizations where id = %s", (organization_id,))


def _mission(org_mission_id: uuid.UUID, concession: dict) -> ResolvedMission:
    return ResolvedMission(
        mission_version_id=str(org_mission_id),
        event_type="cart.abandoned",
        situation="",
        objective="recuperar",
        success_criteria=(),
        failure_criteria=(),
        tone=None,
        context_fields=(),
        context={},
        tools=(),
        forbidden=(),
        max_turns=3,
        topic_change_policy="cede",
        promote_moment=False,
        concession=concession,
        node_ref=None,
    )


def _request(org: uuid.UUID, contact: uuid.UUID, ref: str = "cart-77") -> OfferRequest:
    return OfferRequest(
        organization_id=org,
        contact_id=contact,
        conversation_id=None,
        object_kind="cart",
        object_ref=ref,
        requested_value=Decimal("10"),
    )


async def _process(dsn, org, request, mission, moment=None):
    async with as_worker(dsn, org) as conn:
        async with conn.transaction():
            outcome = await offer_engine.process(
                conn, request, mission=mission, moment=moment, clock=SystemClock()
            )
        await conn.commit()
        return outcome


class TestTheThreeAnswers:
    async def test_an_issue_writes_grant_and_ledger_together(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        contact = create_contact(admin, org)
        mission_id = create_mission(admin, org, status="active")
        outcome = await _process(
            dsn, org, _request(org, contact),
            _mission(mission_id, {"kind": "percent", "max_value": 15}),
        )

        assert outcome.decision == "issued"
        assert outcome.grant.value == Decimal("10")
        assert outcome.grant.source == "mission"

        (entry,) = admin.execute(
            "select entry_kind, grant_id from public.incentive_ledger where contact_id = %s",
            (contact,),
        ).fetchall()
        assert entry == ("issued", outcome.grant.id)

    async def test_the_second_ask_for_the_same_object_reuses(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        contact = create_contact(admin, org)
        mission_id = create_mission(admin, org, status="active")
        mission = _mission(mission_id, {"kind": "percent", "max_value": 15})

        first = await _process(dsn, org, _request(org, contact), mission)
        second = await _process(dsn, org, _request(org, contact), mission)

        assert second.decision == "reused"
        assert second.grant.id == first.grant.id
        kinds = [row[0] for row in admin.execute(
            "select entry_kind from public.incentive_ledger where contact_id = %s"
            " order by created_at", (contact,),
        ).fetchall()]
        assert kinds == ["issued", "reused"]
        (count,) = admin.execute(
            "select count(*) from public.incentive_grants where contact_id = %s", (contact,)
        ).fetchone()
        assert count == 1

    async def test_a_denial_is_ledger_not_silence(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        contact = create_contact(admin, org)
        mission_id = create_mission(admin, org, status="active")
        outcome = await _process(
            dsn, org, _request(org, contact), _mission(mission_id, {"kind": "none"})
        )

        assert outcome.decision == "denied"
        assert outcome.grant is None
        (entry,) = admin.execute(
            "select entry_kind, grant_id, reason from public.incentive_ledger"
            " where contact_id = %s", (contact,),
        ).fetchall()
        assert entry[0] == "denied"
        assert entry[1] is None
        assert "não autoriza" in entry[2]

    async def test_a_moment_offer_issues_with_the_moment_as_source(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        from agents_runtime.repository import moments as moments_repo

        contact = create_contact(admin, org)
        mission_id = create_mission(admin, org, status="active")
        create_moment(admin, org, offer={"kind": "percent", "value": 20})
        async with as_worker(dsn, org) as conn:
            (moment,) = await moments_repo.load_active_moments(conn)

        outcome = await _process(
            dsn, org, _request(org, contact),
            _mission(mission_id, {"kind": "none"}), moment=moment,
        )
        assert outcome.decision == "issued"
        assert outcome.grant.source == "moment"
        assert outcome.grant.moment_id == moment.id
        assert outcome.grant.value == Decimal("20")


class TestTheRace:
    async def test_the_second_insert_receives_the_grant_of_the_first(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        contact = create_contact(admin, org)
        mission_id = create_mission(admin, org, status="active")

        async def insert_once(conn):
            return await incentives_repo.insert_grant(
                conn,
                organization_id=org, contact_id=contact, conversation_id=None,
                object_kind="cart", object_ref="cart-r", source="mission",
                mission_version_id=mission_id, moment_id=None, node_ref=None,
                kind="percent", value=Decimal("10"),
                validity_until=datetime.now(UTC) + timedelta(hours=1),
                max_uses=1,
                idempotency_key=f"{org}:{contact}:cart:cart-r:percent",
            )

        # Dois fluxos, duas conexões. O primeiro COMITA sua transação curta —
        # é isso que resolve a corrida real; um teste com as duas abertas
        # dependuraria o segundo INSERT no lock do primeiro para sempre.
        async with as_worker(dsn, org) as one:
            grant_one, created_one = await insert_once(one)
            await one.commit()
        async with as_worker(dsn, org) as two:
            grant_two, created_two = await insert_once(two)
            await two.commit()

        assert created_one is True
        assert created_two is False
        assert grant_two.id == grant_one.id
