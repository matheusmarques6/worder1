"""create_coupon de ponta a ponta: engine → grant → provedor (dublê) → código.

O que se prova: a ordem das transações (grant comita ANTES do provedor, o
código DEPOIS), o retry idempotente (mesmo objeto = mesmo grant = mesmo
código, e o provedor não é chamado de novo), a negativa como resposta, e a
tabela-verdade da validação de grant — item a item, porque cada item é uma
forma de prometer dinheiro errado."""

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import psycopg
import pytest

from agents_runtime.agent_core.mission_resolver import ResolvedMission
from agents_runtime.tools import base as tools
from agents_runtime.tools.coupon import CreateCoupon
from tests.db.factories import create_mission, create_store, create_tenant, create_thread
from tests.support.clock import FrozenClock
from tests.support.database import as_runtime_worker
from tests.support.llm import START


@pytest.fixture
def org(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    yield organization_id
    admin.execute("delete from public.organizations where id = %s", (organization_id,))


def _mission(mission_id: uuid.UUID, concession: dict) -> ResolvedMission:
    return ResolvedMission(
        mission_version_id=str(mission_id),
        event_type="cart.abandoned",
        situation="",
        objective="recuperar",
        success_criteria=(),
        failure_criteria=(),
        tone=None,
        context_fields=(),
        context={},
        tools=("create_coupon",),
        forbidden=(),
        max_turns=3,
        topic_change_policy="cede",
        promote_moment=False,
        concession=concession,
        node_ref=None,
    )


def _shopify_transport() -> tuple[httpx.MockTransport, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path.endswith("/price_rules.json"):
            return httpx.Response(201, json={"price_rule": {"id": 7}})
        return httpx.Response(201, json={"discount_code": {"code": "x"}})

    return httpx.MockTransport(handler), seen


def _tool(mission: ResolvedMission, transport: httpx.MockTransport) -> CreateCoupon:
    return CreateCoupon(mission=mission, transport=transport, clock=FrozenClock(START))


async def _run(dsn, org, thread, tool, arguments):
    async with as_runtime_worker(dsn) as conn:
        return await tools.run_tool(
            conn,
            tool,
            tools.ToolContext(organization_id=org, conversation_id=thread.conversation_id),
            arguments,
            clock=FrozenClock(START),
        )


ARGS = {"object_kind": "cart", "object_ref": "cart-55"}


class TestTheHappyPath:
    async def test_issue_then_provider_then_code(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        create_store(admin, org)
        mission_id = create_mission(admin, org, status="active")
        transport, seen = _shopify_transport()
        tool = _tool(_mission(mission_id, {"kind": "percent", "max_value": 15}), transport)

        result = await _run(dsn, org, thread, tool, {**ARGS, "value": 10})

        assert result.success is True
        assert result.output["decision"] == "issued"
        assert result.output["coupon_code"].startswith("WD-")
        assert len(seen) == 2  # price rule + discount code

        (stored,) = admin.execute(
            "select coupon_code from public.incentive_grants where contact_id = %s",
            (thread.contact_id,),
        ).fetchone()
        assert stored == result.output["coupon_code"]

    async def test_asking_again_reuses_grant_and_skips_the_provider(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        create_store(admin, org)
        mission_id = create_mission(admin, org, status="active")
        transport, seen = _shopify_transport()
        tool = _tool(_mission(mission_id, {"kind": "percent", "max_value": 15}), transport)

        first = await _run(dsn, org, thread, tool, ARGS)
        calls_after_first = len(seen)
        second = await _run(dsn, org, thread, tool, ARGS)

        assert second.output["decision"] == "reused"
        assert second.output["coupon_code"] == first.output["coupon_code"]
        assert len(seen) == calls_after_first  # o provedor não ouviu falar do 2º pedido

    async def test_a_denial_is_an_answer_the_agent_can_read(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        mission_id = create_mission(admin, org, status="active")
        transport, seen = _shopify_transport()
        tool = _tool(_mission(mission_id, {"kind": "none"}), transport)

        result = await _run(dsn, org, thread, tool, ARGS)

        assert result.success is True
        assert result.output["decision"] == "denied"
        assert seen == []  # negativa jamais chega ao provedor

    async def test_provider_failure_leaves_the_grant_issued_for_the_retry(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        create_store(admin, org)
        mission_id = create_mission(admin, org, status="active")

        def broken(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text="down")

        tool = _tool(
            _mission(mission_id, {"kind": "percent", "max_value": 15}),
            httpx.MockTransport(broken),
        )
        result = await _run(dsn, org, thread, tool, ARGS)

        assert result.success is False
        assert "segue emitido" in result.error
        (status, code) = admin.execute(
            "select status, coupon_code from public.incentive_grants where contact_id = %s",
            (thread.contact_id,),
        ).fetchone()
        assert (status, code) == ("issued", None)

    async def test_without_a_store_the_grant_waits(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        mission_id = create_mission(admin, org, status="active")
        transport, _ = _shopify_transport()
        tool = _tool(_mission(mission_id, {"kind": "percent", "max_value": 15}), transport)

        result = await _run(dsn, org, thread, tool, ARGS)
        assert result.success is False
        assert "não tem loja conectada" in result.error


class TestGrantValidation:
    """Caminho com grant_id: a tabela-verdade, item a item."""

    async def _issued_grant(
        self, admin: psycopg.Connection, org: uuid.UUID, thread, **overrides
    ) -> uuid.UUID:
        mission_id = create_mission(admin, org, status="active")
        fields = {
            "organization_id": org,
            "contact_id": thread.contact_id,
            "object_kind": "cart",
            "object_ref": "cart-55",
            "mission_version_id": mission_id,
            "validity": datetime.now(UTC) + timedelta(hours=4),
            "status": "issued",
            "uses": 0,
        } | overrides
        with admin.cursor() as cur:
            cur.execute(
                """
                insert into public.incentive_grants
                    (organization_id, contact_id, object_kind, object_ref, source,
                     mission_version_id, kind, value, validity_until, max_uses, uses,
                     status, idempotency_key)
                values (%(organization_id)s, %(contact_id)s, %(object_kind)s,
                        %(object_ref)s, 'mission', %(mission_version_id)s, 'percent', 10,
                        %(validity)s, 1, %(uses)s, %(status)s, %(key)s)
                returning id
                """,
                {**fields, "key": f"k-{uuid.uuid4().hex}"},
            )
            (grant_id,) = cur.fetchone()
        return grant_id

    async def test_a_valid_grant_executes(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        create_store(admin, org)
        grant_id = await self._issued_grant(admin, org, thread)
        transport, _ = _shopify_transport()
        tool = _tool(_mission(uuid.uuid4(), {"kind": "none"}), transport)

        # A missão do turno NÃO autoriza nada ({kind: none}) — e mesmo assim o
        # grant executa: a validação é contra o grant, nunca contra a missão.
        result = await _run(dsn, org, thread, tool, {**ARGS, "grant_id": str(grant_id)})
        assert result.success is True
        assert result.output["grant_id"] == str(grant_id)

    async def test_someone_elses_grant_is_refused(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        other = create_thread(admin, org)
        grant_id = await self._issued_grant(admin, org, other)
        transport, _ = _shopify_transport()
        tool = _tool(_mission(uuid.uuid4(), {"kind": "none"}), transport)

        result = await _run(dsn, org, thread, tool, {**ARGS, "grant_id": str(grant_id)})
        assert result.success is False
        assert "outro contato" in result.error

    async def test_an_expired_grant_is_refused(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        # O relógio da tool é o FrozenClock(START) — expirado é ANTES de START.
        grant_id = await self._issued_grant(
            admin, org, thread, validity=START - timedelta(hours=1)
        )
        transport, _ = _shopify_transport()
        tool = _tool(_mission(uuid.uuid4(), {"kind": "none"}), transport)

        result = await _run(dsn, org, thread, tool, {**ARGS, "grant_id": str(grant_id)})
        assert result.success is False
        assert "expirou" in result.error

    async def test_a_promised_value_that_differs_from_the_grant_is_refused(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        grant_id = await self._issued_grant(admin, org, thread)
        transport, _ = _shopify_transport()
        tool = _tool(_mission(uuid.uuid4(), {"kind": "none"}), transport)

        result = await _run(
            dsn, org, thread, tool, {**ARGS, "grant_id": str(grant_id), "value": 25}
        )
        assert result.success is False
        assert "não bate" in result.error

    async def test_the_wrong_object_is_refused(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        grant_id = await self._issued_grant(admin, org, thread)
        transport, _ = _shopify_transport()
        tool = _tool(_mission(uuid.uuid4(), {"kind": "none"}), transport)

        result = await _run(
            dsn, org, thread, tool,
            {"object_kind": "cart", "object_ref": "OUTRO", "grant_id": str(grant_id)},
        )
        assert result.success is False
        assert "autoriza cart cart-55" in result.error


class TestEveryExecutionIsRecorded:
    async def test_the_denial_lands_in_tool_calls_too(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        mission_id = create_mission(admin, org, status="active")
        transport, _ = _shopify_transport()
        tool = _tool(_mission(mission_id, {"kind": "none"}), transport)

        await _run(dsn, org, thread, tool, ARGS)

        (row,) = admin.execute(
            "select tool_name, success from internal.tool_calls where conversation_id = %s",
            (thread.conversation_id,),
        ).fetchall()
        assert row == ("create_coupon", True)
