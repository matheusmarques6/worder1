"""O toque de missão — F1 de ponta a ponta no nível do turno.

O toucher é o responder do caso "ninguém escreveu": o que se prova aqui é o
que muda em relação ao turno de resposta — a família re-resolvida na hora do
consumo (alerta e silêncio quando saiu do ar), o delta do nó DENTRO do frame,
o benefício materializado ANTES da geração (cupom como fato no prompt), e o
run_touch concluindo com kind='funnel_touch' + moment_ids + a missão virando
DONA da conversa na mesma transação do conclude.
"""

import uuid

import httpx
import psycopg
import pytest

from agents_runtime.agent_core.toucher import TouchDraft, build_toucher
from agents_runtime.clock import SystemClock
from agents_runtime.config import QueueingConfig
from agents_runtime.queueing.jobs import MissionTouchJob
from agents_runtime.queueing.worker import TurnResult, run_touch
from tests.db.factories import (
    create_agent_version,
    create_mission,
    create_moment,
    create_store,
    create_tenant,
    create_thread,
)
from tests.support.database import as_runtime_worker
from tests.support.llm import ScriptedLlm

FAMILY = "cart.abandoned"


@pytest.fixture
def org(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    create_agent_version(admin, organization_id, status="active")
    yield organization_id
    admin.execute("delete from public.organizations where id = %s", (organization_id,))


def _job(org: uuid.UUID, thread, **kwargs) -> MissionTouchJob:
    return MissionTouchJob(
        organization_id=org,
        contact_id=thread.contact_id,
        conversation_id=thread.conversation_id,
        event_family=FAMILY,
        node_ref=kwargs.get("node_ref", "flow-1:node-2"),
        delta=kwargs.get("delta"),
        concession_request=kwargs.get("concession_request"),
    )


def _toucher(dsn: str, llm: ScriptedLlm, **kwargs):
    return build_toucher(dsn, llm=llm, set_role="worker_role", **kwargs)


class TestTheDraft:
    async def test_a_touch_carries_mission_and_node_delta(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        create_mission(
            admin, org, event_type=FAMILY, status="active",
            objective="recuperar a compra sem parecer cobrança",
        )
        llm = ScriptedLlm(reply="Oi Joana! Vi que ficou um tênis no seu carrinho.")

        draft = await _toucher(dsn, llm)(
            _job(org, thread, delta={"objective": "lembrar do frete grátis de hoje"})
        )

        assert draft.content == {"text": "Oi Joana! Vi que ficou um tênis no seu carrinho."}
        assert draft.mission_version_id is not None
        system = llm.asked[0].messages[0].content
        assert "lembrar do frete grátis de hoje" in system  # o delta venceu
        assert "# MISSÃO" in system  # o bloco existe, não-fantasma

    async def test_a_family_off_the_air_alerts_and_stays_silent(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        create_mission(admin, org, event_type=FAMILY, status="draft")

        draft = await _toucher(dsn, ScriptedLlm())(_job(org, thread))

        assert draft.content is None
        (alert,) = admin.execute(
            "select type from public.alerts where organization_id = %s", (org,)
        ).fetchall()
        assert alert == ("no_active_mission",)

    async def test_without_an_active_agent_the_touch_fails_visibly(
        self, dsn: str, admin: psycopg.Connection
    ) -> None:
        organization_id = create_tenant(admin)
        try:
            thread = create_thread(admin, organization_id)
            create_mission(admin, organization_id, event_type=FAMILY, status="active")

            draft = await _toucher(dsn, ScriptedLlm())(_job(organization_id, thread))

            assert draft.content is None
            (alert,) = admin.execute(
                "select type from public.alerts where organization_id = %s",
                (organization_id,),
            ).fetchall()
            assert alert == ("mission_touch_failed",)
        finally:
            admin.execute(
                "delete from public.organizations where id = %s", (organization_id,)
            )

    async def test_a_promoting_mission_carries_the_moment_into_the_touch(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        create_mission(admin, org, event_type=FAMILY, status="active", promote_moment=True)
        moment = create_moment(admin, org, public_claim="Semana do cliente: 10% em tudo")
        llm = ScriptedLlm()

        draft = await _toucher(dsn, llm)(_job(org, thread))

        assert draft.moment_ids == (moment,)
        assert "Semana do cliente: 10% em tudo" in llm.asked[0].messages[0].content


class TestTheMoneyPath:
    async def test_the_coupon_is_a_fact_in_the_prompt_before_generation(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        create_store(admin, org)
        create_mission(admin, org, event_type=FAMILY, status="active")
        llm = ScriptedLlm()

        def shopify_ok(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/price_rules.json"):
                return httpx.Response(201, json={"price_rule": {"id": 1}})
            return httpx.Response(201, json={"discount_code": {"code": "x"}})

        toucher = _toucher(
            dsn, llm, shopify_transport=httpx.MockTransport(shopify_ok)
        )
        draft = await toucher(
            _job(
                org, thread,
                concession_request={
                    "kind": "percent", "value": 10,
                    "object_kind": "cart", "object_ref": "cart-9",
                },
            )
        )

        # O concession default da missão é {kind: none} — o pedido do nó é
        # negado pelo engine, o toque segue SEM benefício, e a negativa é ledger.
        assert draft.content is not None
        assert "Benefício autorizado" not in llm.asked[0].messages[0].content
        (entry,) = admin.execute(
            "select entry_kind from public.incentive_ledger where organization_id = %s",
            (org,),
        ).fetchall()
        assert entry == ("denied",)

    async def test_an_authorized_concession_lands_as_coupon_in_the_prompt(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        create_store(admin, org)
        create_mission(
            admin, org, event_type=FAMILY, status="active",
            concession={"kind": "percent", "max_value": 15, "validity_hours": 24},
        )
        llm = ScriptedLlm()

        def shopify_ok(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/price_rules.json"):
                return httpx.Response(201, json={"price_rule": {"id": 1}})
            return httpx.Response(201, json={"discount_code": {"code": "x"}})

        toucher = _toucher(dsn, llm, shopify_transport=httpx.MockTransport(shopify_ok))
        draft = await toucher(
            _job(
                org, thread,
                node_ref="flow-7:node-3",
                concession_request={
                    "kind": "percent", "value": 10,
                    "object_kind": "cart", "object_ref": "cart-9",
                },
            )
        )

        assert draft.content is not None
        system = llm.asked[0].messages[0].content
        assert "Benefício autorizado" in system
        assert "WD-" in system

        (grant,) = admin.execute(
            "select node_ref, value, coupon_code from public.incentive_grants"
            " where organization_id = %s",
            (org,),
        ).fetchall()
        assert grant[0] == "flow-7:node-3"
        assert grant[1] == 10
        assert grant[2].startswith("WD-")


class TestRunTouch:
    async def test_the_touch_concludes_as_funnel_touch_and_crowns_the_mission(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        mission_id = create_mission(
            admin, org, event_type=FAMILY, status="active", promote_moment=True
        )
        moment = create_moment(admin, org)
        job = _job(org, thread)
        toucher = _toucher(dsn, ScriptedLlm())

        async with as_runtime_worker(dsn) as conn:
            result = await run_touch(
                conn, job, toucher,
                config=QueueingConfig(), clock=SystemClock(), message_id=101,
            )

        assert result is TurnResult.DONE
        (row,) = admin.execute(
            "select kind, moment_ids, idempotency_key from internal.message_outbox"
            " where conversation_id = %s",
            (thread.conversation_id,),
        ).fetchall()
        assert row[0] == "funnel_touch"
        assert row[1] == [moment]
        assert row[2] == f"touch-{thread.conversation_id}-101"

        (owner,) = admin.execute(
            "select owner_mission_version_id from public.conversations where id = %s",
            (thread.conversation_id,),
        ).fetchone()
        assert owner == mission_id

    async def test_a_redelivery_finds_the_outbox_and_archives(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        create_mission(admin, org, event_type=FAMILY, status="active")
        job = _job(org, thread)
        llm = ScriptedLlm()
        toucher = _toucher(dsn, llm)

        async with as_runtime_worker(dsn) as conn:
            first = await run_touch(
                conn, job, toucher, config=QueueingConfig(), clock=SystemClock(),
                message_id=7,
            )
            calls_after_first = len(llm.asked)
            second = await run_touch(
                conn, job, toucher, config=QueueingConfig(), clock=SystemClock(),
                message_id=7,
            )

        assert (first, second) == (TurnResult.DONE, TurnResult.STALE)
        assert len(llm.asked) == calls_after_first  # sem segunda geração
        (count,) = admin.execute(
            "select count(*) from internal.message_outbox where conversation_id = %s",
            (thread.conversation_id,),
        ).fetchone()
        assert count == 1

    async def test_an_inbound_mid_generation_kills_the_draft(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        create_mission(admin, org, event_type=FAMILY, status="active")
        job = _job(org, thread)

        async def sabotaged_toucher(touch_job: MissionTouchJob) -> TouchDraft:
            # O cliente escreve DURANTE a geração: next_inbound_seq avança.
            admin.execute(
                "update public.conversations set next_inbound_seq = next_inbound_seq + 1"
                " where id = %s",
                (touch_job.conversation_id,),
            )
            return TouchDraft(
                content={"text": "rascunho que não pode sair"},
                moment_ids=(),
                mission_version_id=None,
            )

        async with as_runtime_worker(dsn) as conn:
            result = await run_touch(
                conn, job, sabotaged_toucher,
                config=QueueingConfig(), clock=SystemClock(), message_id=8,
            )

        assert result is TurnResult.SUPERSEDED
        (count,) = admin.execute(
            "select count(*) from internal.message_outbox where conversation_id = %s",
            (thread.conversation_id,),
        ).fetchone()
        assert count == 0
