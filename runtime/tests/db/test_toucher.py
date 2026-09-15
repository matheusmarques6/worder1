"""O toque de missão — F1 de ponta a ponta no nível do turno.

O toucher é o responder do caso "ninguém escreveu": o que se prova aqui é o
que muda em relação ao turno de resposta — a família re-resolvida na hora do
consumo (alerta e silêncio quando saiu do ar), o delta do nó DENTRO do frame,
o benefício materializado ANTES da geração (cupom como fato no prompt), e o
run_touch concluindo com kind='funnel_touch' + moment_ids + a missão virando
DONA da conversa na mesma transação do conclude.
"""

import json
import uuid
from dataclasses import replace
from unittest.mock import AsyncMock

import httpx
import psycopg
import pytest

from agents_runtime import server
from agents_runtime.agent_core import responder as responder_module
from agents_runtime.agent_core import toucher as toucher_module
from agents_runtime.agent_core.llm import EMBEDDING_MODEL
from agents_runtime.agent_core.toucher import TouchDraft, build_toucher
from agents_runtime.clock import SystemClock
from agents_runtime.config import QueueingConfig
from agents_runtime.judges.pre_send import JudgeContext as RealJudgeContext
from agents_runtime.queueing.jobs import InboundJob, MissionTouchJob
from agents_runtime.queueing.worker import TurnResult, run_touch
from agents_runtime.repository import agent as agent_repo
from tests.db.factories import (
    create_agent_version,
    create_knowledge_chunk,
    create_message,
    create_mission,
    create_moment,
    create_store,
    create_tenant,
    create_thread,
)
from tests.support.database import as_runtime_worker
from tests.support.embedding import embed_text
from tests.support.llm import ScriptedLlm

FAMILY = "cart.abandoned"


@pytest.fixture
def org(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    create_agent_version(admin, organization_id, status="active")
    yield organization_id
    admin.execute("delete from public.organizations where id = %s", (organization_id,))


def _job(org: uuid.UUID, thread, **kwargs) -> MissionTouchJob:
    node_ref = kwargs.get("node_ref", "flow-1:node-2")
    return MissionTouchJob(
        organization_id=org,
        contact_id=thread.contact_id,
        conversation_id=thread.conversation_id,
        touch_id=kwargs.get(
            "touch_id",
            uuid.uuid5(thread.conversation_id, f"test-toucher:{node_ref}"),
        ),
        event_family=FAMILY,
        node_ref=node_ref,
        delta=kwargs.get("delta"),
        concession_request=kwargs.get("concession_request"),
    )


def _toucher(dsn: str, llm: ScriptedLlm, **kwargs):
    return build_toucher(dsn, llm=llm, set_role="worker_role", **kwargs)


@pytest.fixture
def knowledge_turn(admin, org, monkeypatch):
    admin.execute(
        "update public.ai_agent_versions set settings = %s where organization_id = %s",
        (psycopg.types.json.Jsonb({"tools": {"enabled": ["search_knowledge"]}}), org),
    )
    create_mission(
        admin, org, event_type=FAMILY, status="active",
        objective="Retomar o carrinho abandonado.", enabled_tools=["search_knowledge"],
    )
    create_knowledge_chunk(
        admin, org, content="Frete em 3 dias", embedding=json.dumps(embed_text("frete")),
    )
    stranger = create_tenant(admin)
    create_knowledge_chunk(
        admin, stranger, content="Segredo exclusivo da loja B",
        embedding=json.dumps(embed_text("frete")),
    )
    contexts = []

    def capture_context(**kwargs):
        context = RealJudgeContext(**kwargs)
        contexts.append(context)
        return context

    monkeypatch.setattr(toucher_module, "JudgeContext", capture_context)
    llm = ScriptedLlm()
    monkeypatch.setattr(llm, "embed", AsyncMock(wraps=llm.embed))
    try:
        yield llm, contexts, create_thread(admin, org)
    finally:
        admin.execute("delete from public.organizations where id = %s", (stranger,))


class TestKnowledgeContext:
    @pytest.mark.parametrize(
        ("history", "delta", "query"),
        [
            (None, None, "Retomar o carrinho abandonado."),
            ("Quero trocar o tamanho antigo.", None, "Retomar o carrinho abandonado."),
            (
                "Quero trocar o tamanho antigo.",
                {"objective": "Confirmar disponibilidade do item reservado."},
                "Confirmar disponibilidade do item reservado.",
            ),
        ],
        ids=["cold-contact", "old-transcript", "node-delta"],
    )
    async def test_objective_retrieval_is_shared_and_metered_once(
        self, dsn, admin, org, knowledge_turn, history, delta, query,
    ):
        llm, contexts, thread = knowledge_turn
        if history:
            create_message(admin, org, thread, text=history)

        draft = await _toucher(dsn, llm)(_job(org, thread, delta=delta))

        assert draft.content is not None
        llm.embed.assert_awaited_once_with([query], model=EMBEDDING_MODEL)
        assert contexts[0].knowledge == ("Frete em 3 dias",)
        system = llm.asked[0].messages[0].content
        assert system.count("# CONHECIMENTO") == 1
        assert system.count("- Frete em 3 dias") == 1
        assert "Segredo exclusivo da loja B" not in system
        assert admin.execute(
            "select input, success from internal.tool_calls"
            " where conversation_id = %s and tool_name = 'search_knowledge'",
            (thread.conversation_id,),
        ).fetchall() == [({"query": query}, True)]
        assert admin.execute(
            "select input_tokens, cost_usd from internal.llm_calls"
            " where conversation_id = %s and purpose = 'embedding'",
            (thread.conversation_id,),
        ).fetchall() == [(1, 0)]

    @pytest.mark.parametrize("delta", [{"enabled_tools": []}, {"objective": " \n "}])
    async def test_disabled_or_empty_query_does_no_retrieval(
        self, dsn, admin, org, knowledge_turn, delta,
    ):
        llm, contexts, thread = knowledge_turn

        draft = await _toucher(dsn, llm)(_job(org, thread, delta=delta))

        assert draft.content is not None
        llm.embed.assert_not_awaited()
        assert contexts[0].knowledge == ()
        assert "# CONHECIMENTO" not in llm.asked[0].messages[0].content
        assert admin.execute(
            "select count(*) from internal.tool_calls where conversation_id = %s",
            (thread.conversation_id,),
        ).fetchone() == (0,)
        assert admin.execute(
            "select count(*) from internal.llm_calls"
            " where conversation_id = %s and purpose = 'embedding'",
            (thread.conversation_id,),
        ).fetchone() == (0,)

    async def test_embedding_spends_the_same_turn_budget_as_agent_and_judge(
        self, dsn, admin, org, knowledge_turn,
    ):
        llm, _contexts, thread = knowledge_turn

        await _toucher(dsn, llm, turn_llm_call_limit=2)(_job(org, thread))

        llm.embed.assert_awaited_once()
        assert len(llm.asked) == 1
        assert admin.execute(
            "select purpose from internal.llm_calls where conversation_id = %s order by purpose",
            (thread.conversation_id,),
        ).fetchall() == [("agent_reply",), ("embedding",)]

    async def test_reactive_query_keeps_all_pending_contact_messages(
        self, dsn, admin, org, knowledge_turn,
    ):
        llm, _contexts, thread = knowledge_turn
        create_mission(
            admin, org, event_type="whatsapp.received", status="active",
            enabled_tools=["search_knowledge"],
        )
        create_message(admin, org, thread, seq=1, text="frete")
        create_message(admin, org, thread, seq=2, direction="outbound", text="fala da loja")
        create_message(admin, org, thread, seq=3, text="do carrinho")

        result = await responder_module.build_responder(dsn, llm=llm, set_role="worker_role")(
            InboundJob(thread.conversation_id, 1, 3, org),
        )

        assert result is not None
        llm.embed.assert_awaited_once_with(["frete do carrinho"], model=EMBEDDING_MODEL)
        assert llm.asked[0].messages[0].content.count("- Frete em 3 dias") == 1

    async def test_preview_declares_missing_state_without_retrieval_or_metering(
        self, dsn, admin, org, knowledge_turn,
    ):
        response = await server._preview(
            dsn, set_role="worker_role",
            body={"organization_id": str(org), "event_type": FAMILY,
                  "transcript": [["contact", "frete do carrinho"]]},
        )

        assert response.startswith(b"HTTP/1.1 200")
        payload = json.loads(response.split(b"\r\n\r\n", 1)[1])
        assert next(b for b in payload["blocks"] if b["kind"] == "STATE")["ghost"] is True
        assert all(b["kind"] != "KNOWLEDGE" for b in payload["blocks"])
        assert "Frete em 3 dias" not in payload["text"]
        assert admin.execute(
            "select count(*) from internal.tool_calls where organization_id = %s", (org,),
        ).fetchone() == (0,)
        assert admin.execute(
            "select count(*) from internal.llm_calls where organization_id = %s", (org,),
        ).fetchone() == (0,)


@pytest.mark.parametrize("configured", [True, False])
async def test_toucher_never_say_ai_reaches_judge(
    dsn: str,
    admin: psycopg.Connection,
    org: uuid.UUID,
    monkeypatch: pytest.MonkeyPatch,
    configured: bool,
) -> None:
    real_load = agent_repo.load_tenant_policy
    seen: list[bool] = []

    async def load_policy(conn, *, organization_id):
        policy = await real_load(conn, organization_id=organization_id)
        assert policy.never_say_ai is True
        return replace(policy, policy=replace(policy.policy, never_say_ai=configured))

    def capture_context(**kwargs):
        context = RealJudgeContext(**kwargs)
        seen.append(context.never_say_ai)
        return context

    monkeypatch.setattr(agent_repo, "load_tenant_policy", load_policy)
    monkeypatch.setattr(toucher_module, "JudgeContext", capture_context)
    thread = create_thread(admin, org)
    create_mission(admin, org, event_type=FAMILY, status="active")

    await _toucher(dsn, ScriptedLlm())(_job(org, thread))

    assert seen == [configured]


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

        # Item 44: o `humanize` entrou aqui — o toque passou a carregar as flags
        # de entrega da loja, como o responder já fazia (a forma é a mesma de
        # `test_responder_tool_loop.py`). A igualdade exata fica de propósito:
        # é ela que percebe uma chave a mais ou a menos indo para a outbox.
        assert draft.content == {
            "text": "Oi Joana! Vi que ficou um tênis no seu carrinho.",
            "humanize": {"split": True, "rhythm": True},
        }
        assert draft.mission_version_id is not None
        system = llm.asked[0].messages[0].content
        assert "lembrar do frete grátis de hoje" in system  # o delta venceu
        assert "# MISSÃO" in system  # o bloco existe, não-fantasma

    async def test_the_media_in_the_history_reaches_the_touch_prompt(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        """Item 31, no SEGUNDO produtor de fala. O toucher lê o mesmo
        `load_recent_transcript` do turno de resposta, então a mídia que virava
        linha em branco virava linha em branco aqui também — e aqui é pior:
        ninguém escreveu nada, então o histórico é TODO o contexto que o
        modelo tem para decidir o tom do toque.

        O toque não degrada (não há rajada de inbound para degradar); o que ele
        precisa é não ler um turno em branco no meio da conversa."""
        thread = create_thread(admin, org)
        create_mission(admin, org, event_type=FAMILY, status="active")
        create_message(admin, org, thread, direction="inbound", seq=1, text="esse aqui serve?")
        create_message(
            admin, org, thread, direction="inbound", seq=2,
            content={"type": "image", "text": None, "media_id": "wamid.i", "caption": None},
        )
        llm = ScriptedLlm(reply="Oi! Ficou alguma dúvida sobre a foto que você mandou?")

        await _toucher(dsn, llm)(_job(org, thread))

        assert any(
            message.role == "user" and "[Cliente enviou uma imagem]" in message.content
            for message in llm.asked[0].messages
        )

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

    async def test_byo_without_org_keys_stays_silent_and_alerts(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        create_mission(admin, org, event_type=FAMILY, status="active")
        llm = ScriptedLlm()

        draft = await _toucher(dsn, llm, agent_llm_from_org_keys=True)(
            _job(org, thread)
        )

        assert draft.content is None
        assert llm.asked == []
        row = admin.execute(
            "select count(*) from public.alerts where organization_id=%s and type=%s",
            (org, "no_org_llm_key"),
        ).fetchone()
        assert row == (1,)

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
        assert row[2] == f"touch-{thread.conversation_id}-{job.touch_id}"

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
                message_id=8,
            )

        assert (first, second) == (TurnResult.DONE, TurnResult.STALE)
        assert len(llm.asked) == calls_after_first  # sem segunda geração
        (count,) = admin.execute(
            "select count(*) from internal.message_outbox where conversation_id = %s",
            (thread.conversation_id,),
        ).fetchone()
        assert count == 1

    async def test_distinct_touch_ids_remain_distinct_business_actions(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        thread = create_thread(admin, org)
        create_mission(admin, org, event_type=FAMILY, status="active")
        first_job = _job(org, thread)
        second_job = _job(org, thread, touch_id=uuid.uuid4())
        llm = ScriptedLlm()
        toucher = _toucher(dsn, llm)

        async with as_runtime_worker(dsn) as conn:
            first = await run_touch(
                conn,
                first_job,
                toucher,
                config=QueueingConfig(),
                clock=SystemClock(),
                message_id=7,
            )
            calls_after_first = len(llm.asked)
            second = await run_touch(
                conn,
                second_job,
                toucher,
                config=QueueingConfig(),
                clock=SystemClock(),
                message_id=8,
            )

        assert (first, second) == (TurnResult.DONE, TurnResult.DONE)
        assert len(llm.asked) > calls_after_first
        (count,) = admin.execute(
            "select count(*) from internal.message_outbox where conversation_id = %s",
            (thread.conversation_id,),
        ).fetchone()
        assert count == 2

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
