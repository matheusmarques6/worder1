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


def _create_grant(
    admin: psycopg.Connection, org: uuid.UUID, thread, **overrides
) -> uuid.UUID:
    """Grant 'issued' cru, sem passar pelo offer_engine — usado onde o teste
    quer o estado do banco direto (validação de grant, unicidade de código).

    Só cria missão nova se o chamador não passou `mission_version_id`: a
    mesma org não pode ter duas missões 'active' para o mesmo event_type
    (`ai_missions_one_active_per_family`), e mais de um grant na mesma org
    é exatamente o caso que os testes de unicidade de cupom precisam."""
    if "mission_version_id" not in overrides:
        overrides = {**overrides, "mission_version_id": create_mission(admin, org, status="active")}
    fields = {
        "organization_id": org,
        "contact_id": thread.contact_id,
        "object_kind": "cart",
        "object_ref": "cart-55",
        "validity": datetime.now(UTC) + timedelta(hours=4),
        "status": "issued",
        "uses": 0,
        "coupon_code": None,
    } | overrides
    with admin.cursor() as cur:
        cur.execute(
            """
            insert into public.incentive_grants
                (organization_id, contact_id, object_kind, object_ref, source,
                 mission_version_id, kind, value, validity_until, max_uses, uses,
                 status, coupon_code, idempotency_key)
            values (%(organization_id)s, %(contact_id)s, %(object_kind)s,
                    %(object_ref)s, 'mission', %(mission_version_id)s, 'percent', 10,
                    %(validity)s, 1, %(uses)s, %(status)s, %(coupon_code)s, %(key)s)
            returning id
            """,
            {**fields, "key": f"k-{uuid.uuid4().hex}"},
        )
        (grant_id,) = cur.fetchone()
    return grant_id


ARGS = {"object_kind": "cart", "object_ref": "cart-55"}


class TestTheHappyPath:
    async def test_coupon_cannot_read_a_foreign_conversation(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        foreign_org = create_tenant(admin)
        try:
            own = create_thread(admin, org)
            foreign = create_thread(admin, foreign_org)
            mission_id = create_mission(admin, org, status="active")
            transport, seen = _shopify_transport()
            tool = _tool(_mission(mission_id, {"kind": "none"}), transport)

            async with as_runtime_worker(dsn) as conn:
                rejected = await tool(
                    conn,
                    tools.ToolContext(
                        organization_id=org,
                        conversation_id=foreign.conversation_id,
                    ),
                    ARGS,
                )
                accepted = await tool(
                    conn,
                    tools.ToolContext(
                        organization_id=org,
                        conversation_id=own.conversation_id,
                    ),
                    ARGS,
                )

            assert rejected.success is False
            assert rejected.error == "conversa não encontrada para este tenant"
            assert rejected.output == {}
            assert accepted.success is True
            assert accepted.output["decision"] == "denied"
            assert seen == []
            assert admin.execute(
                "select count(*) from public.incentive_grants where contact_id = %s",
                (foreign.contact_id,),
            ).fetchone() == (0,)
        finally:
            admin.execute(
                "delete from public.organizations where id = %s", (foreign_org,)
            )

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
        return _create_grant(admin, org, thread, **overrides)

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

    async def test_a_legacy_short_code_is_kept_and_the_provider_is_never_called(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        """Grant em voo antes do fix (W2-T4): já tem os 8 hex antigos gravados.
        O retry tem que ler esse código do banco — nunca recomputar (o cálculo
        novo usa o UUID inteiro e daria um código DIFERENTE) e nunca chamar o
        provedor de novo para um grant que já tem cupom."""
        thread = create_thread(admin, org)
        create_store(admin, org)
        legacy_code = f"WD-{uuid.uuid4().hex[:8].upper()}"
        grant_id = await self._issued_grant(admin, org, thread, coupon_code=legacy_code)
        transport, seen = _shopify_transport()
        tool = _tool(_mission(uuid.uuid4(), {"kind": "none"}), transport)

        result = await _run(dsn, org, thread, tool, {**ARGS, "grant_id": str(grant_id)})

        assert result.success is True
        assert result.output["coupon_code"] == legacy_code
        assert seen == []  # nenhuma chamada ao provedor — o código já existia

        (stored,) = admin.execute(
            "select coupon_code from public.incentive_grants where id = %s", (grant_id,)
        ).fetchone()
        assert stored == legacy_code  # lido do banco, não recomputado por cima


class TestCouponUniqueness:
    """W2-T4: dois grants não podem compartilhar código na mesma org."""

    def test_same_code_twice_in_one_org_is_rejected(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        thread_a = create_thread(admin, two_tenants.a.id)
        thread_b = create_thread(admin, two_tenants.b.id)
        code = f"WD-{uuid.uuid4().hex.upper()}"
        # Uma missão só por org: duas 'active' do mesmo event_type na mesma
        # org violam ai_missions_one_active_per_family — sem relação com o
        # que este teste prova.
        mission_a = create_mission(admin, two_tenants.a.id, status="active")
        first = _create_grant(admin, two_tenants.a.id, thread_a, mission_version_id=mission_a)
        second = _create_grant(admin, two_tenants.a.id, thread_a, mission_version_id=mission_a)
        other_org = _create_grant(admin, two_tenants.b.id, thread_b)

        admin.execute(
            "update public.incentive_grants set coupon_code=%s where id=%s", (code, first)
        )
        with pytest.raises(psycopg.errors.UniqueViolation):
            admin.execute(
                "update public.incentive_grants set coupon_code=%s where id=%s",
                (code.lower(), second),
            )
        # A organização B prova que a unicidade é por tenant, não global.
        admin.execute(
            "update public.incentive_grants set coupon_code=%s where id=%s",
            (code, other_org),
        )

    async def test_a_permanent_conflict_opens_an_alert_and_stops_at_one_call(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        """Outro grant desta org já é dono do código que este grant geraria.
        A tool nunca devolve sucesso com o cupom de outro contato: abre
        alerta, suspende o grant, e o provedor não é chamado uma segunda vez
        quando a mesma tentativa é repetida (o grant suspenso não é 'issued')."""
        thread = create_thread(admin, org)
        mission_id = create_mission(admin, org, status="active")
        transport, seen = _shopify_transport()
        tool = _tool(_mission(mission_id, {"kind": "percent", "max_value": 15}), transport)

        # 1) Emite um grant real sem loja conectada: fica 'issued', sem código.
        no_store_result = await _run(dsn, org, thread, tool, ARGS)
        assert no_store_result.success is False
        (grant_id, existing_code) = admin.execute(
            """
            select id, coupon_code from public.incentive_grants
             where contact_id = %s and status = 'issued' and coupon_code is null
            """,
            (thread.contact_id,),
        ).fetchone()
        assert grant_id is not None
        assert existing_code is None

        # 2) Outra linha da mesma org já é dona do código que ESSE grant
        #    calcularia de forma determinística — colisão legítima, não
        #    hipotética (dado legado / corrida fora do processo).
        other = create_thread(admin, org)
        colliding_code = f"WD-{grant_id.hex.upper()}"
        # Reusa a missão já criada: duas 'active' do mesmo event_type nesta
        # org violariam ai_missions_one_active_per_family.
        other_grant_id = _create_grant(
            admin, org, other, mission_version_id=mission_id, coupon_code=colliding_code
        )

        create_store(admin, org)
        result = await _run(dsn, org, thread, tool, {**ARGS, "grant_id": str(grant_id)})

        assert result.success is False
        assert "colide" in result.error
        assert len(seen) == 2  # price rule + discount code — UMA tentativa só

        (status, code) = admin.execute(
            "select status, coupon_code from public.incentive_grants where id = %s",
            (grant_id,),
        ).fetchone()
        assert status == "revoked"  # suspenso, nunca reaberto sozinho
        assert code is None  # nunca herdou o cupom do grant do outro contato

        (alert_type, severity, dedup_key) = admin.execute(
            "select type, severity, dedup_key from public.alerts where organization_id = %s",
            (org,),
        ).fetchone()
        assert (alert_type, severity, dedup_key) == (
            "coupon_code_conflict", "critical", f"coupon-conflict:{grant_id}",
        )

        # 3) Retry: o grant está 'revoked', não 'issued' — a validação recusa
        #    ANTES do provedor. Um conflito permanente nunca vira laço.
        retry = await _run(dsn, org, thread, tool, {**ARGS, "grant_id": str(grant_id)})
        assert retry.success is False
        assert len(seen) == 2  # nenhuma chamada nova ao provedor

        # o outro grant, dono legítimo do código, nunca foi tocado
        (other_code,) = admin.execute(
            "select coupon_code from public.incentive_grants where id = %s",
            (other_grant_id,),
        ).fetchone()
        assert other_code == colliding_code


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
