"""9.3b — o tool-loop do inbound: o modelo PEDE, o engine DECIDE, no turno.

O DoD do Adendo §B, executável: cliente pede desconto → o modelo chama
`create_coupon` → a missão do turno não autoriza emissão nova, MAS há grant
vigente do momento → o engine responde `reused` com o cupom existente → a
resposta menciona o cupom → a trilha (`internal.tool_calls` + ledger) mostra
o reuso. Nenhum dinheiro novo foi criado.

As grades do loop, também aqui: a tool só é OFERECIDA se a interseção
missão∩agente permitir (permissão estreita, §3.4); rodadas têm teto — esgotou,
a última chamada sai SEM tools e o modelo é obrigado a concluir em texto.
"""

import uuid
from datetime import UTC, datetime, timedelta

import psycopg
import pytest

from agents_runtime.agent_core.llm import ToolCall
from agents_runtime.agent_core.responder import MAX_TOOL_ROUNDS, build_responder
from agents_runtime.judges.pre_send import JUDGE_MODEL
from agents_runtime.queueing.jobs import InboundJob
from tests.db.factories import (
    Thread,
    create_agent_version,
    create_message,
    create_mission,
    create_tenant,
    create_thread,
    unique_id,
)
from tests.support.llm import ScriptedLlm

ASK_COUPON = ToolCall(
    id="call_1",
    name="create_coupon",
    arguments={"object_kind": "cart", "object_ref": "cart-1"},
)


@pytest.fixture
def tenant(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    create_agent_version(
        admin, organization_id, status="active", enabled_tools=["create_coupon"]
    )
    yield organization_id
    with admin.cursor() as cur:
        cur.execute("delete from public.organizations where id = %s", (organization_id,))


def standing_grant(
    admin: psycopg.Connection,
    organization_id: uuid.UUID,
    thread: Thread,
    mission: uuid.UUID,
    *,
    coupon_code: str = "WD-DOMOMENTO",
) -> uuid.UUID:
    (grant_id,) = admin.execute(
        """
        insert into public.incentive_grants
            (organization_id, contact_id, object_kind, object_ref, source,
             mission_version_id, kind, value, validity_until, max_uses,
             coupon_code, idempotency_key)
        values (%s, %s, 'cart', 'cart-1', 'mission', %s, 'percent', 10,
                %s, 1, %s, %s)
        returning id
        """,
        (
            organization_id, thread.contact_id, mission,
            datetime.now(UTC) + timedelta(hours=24),
            coupon_code, unique_id("idem"),
        ),
    ).fetchone()
    return grant_id


async def _respond(
    dsn: str,
    admin: psycopg.Connection,
    organization_id: uuid.UUID,
    thread: Thread,
    llm: ScriptedLlm,
):
    create_message(
        admin, organization_id, thread, direction="inbound", seq=1, text="tem desconto?"
    )
    responder = build_responder(dsn, llm=llm, set_role="worker_role")
    return await responder(
        InboundJob(
            conversation_id=thread.conversation_id,
            generation=1,
            target_seq=1,
            organization_id=organization_id,
        )
    )


def agent_calls(llm: ScriptedLlm) -> list:
    return [r for r in llm.asked if r.model != JUDGE_MODEL]


class TestTheDoD:
    async def test_denied_new_money_but_the_standing_coupon_is_reused(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        # Concessão default = none: a missão NÃO autoriza emissão nova.
        mission = create_mission(
            admin, tenant, event_type="whatsapp.received", status="active",
            enabled_tools=["create_coupon"],
        )
        thread = create_thread(admin, tenant)
        grant_id = standing_grant(admin, tenant, thread, mission)

        llm = ScriptedLlm(
            tool_rounds=[(ASK_COUPON,)],
            reply="Você já tem um cupom ativo: WD-DOMOMENTO 🧡",
        )
        result = await _respond(dsn, admin, tenant, thread, llm)

        # A resposta menciona o cupom existente.
        assert result == {"text": "Você já tem um cupom ativo: WD-DOMOMENTO 🧡"}

        # O modelo LEU o resultado da tool: a volta do loop carrega o código.
        final = agent_calls(llm)[-1]
        tool_messages = [m for m in final.messages if m.role == "tool"]
        assert tool_messages, "a rodada final não recebeu o resultado da tool"
        assert "WD-DOMOMENTO" in tool_messages[0].content
        assert tool_messages[0].tool_call_id == "call_1"

        # A trilha mostra REUSED — nenhum grant novo nasceu.
        (decision,) = admin.execute(
            "select output->>'decision' from internal.tool_calls"
            " where conversation_id = %s and tool_name = 'create_coupon'",
            (thread.conversation_id,),
        ).fetchone()
        assert decision == "reused"
        (grants,) = admin.execute(
            "select count(*) from public.incentive_grants where contact_id = %s",
            (thread.contact_id,),
        ).fetchone()
        assert grants == 1
        (entry_kind,) = admin.execute(
            "select entry_kind from public.incentive_ledger"
            " where grant_id = %s order by created_at desc limit 1",
            (grant_id,),
        ).fetchone()
        assert entry_kind == "reused"


def custom_tool(
    admin: psycopg.Connection,
    organization_id: uuid.UUID,
    *,
    enabled: bool = True,
    tested: bool = True,
) -> None:
    admin.execute(
        """
        insert into public.ai_agent_custom_tools
            (organization_id, name, label, description, when_to_use,
             endpoint, method, params, enabled, last_test_status)
        values (%s, 'frete_kangu', 'Frete Kangu', 'Consulta frete.',
                'Pedirem frete.', 'https://localhost/frete', 'GET',
                '[{"name": "cep", "type": "string", "required": true}]',
                %s, %s)
        """,
        (organization_id, enabled, "ok" if tested else None),
    )


class TestCustomTools:
    async def test_an_enabled_tested_tool_is_offered_to_the_model(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        create_mission(
            admin, tenant, event_type="whatsapp.received", status="active",
            enabled_tools=[],
        )
        thread = create_thread(admin, tenant)
        custom_tool(admin, tenant)

        llm = ScriptedLlm(reply="Já consulto!")
        result = await _respond(dsn, admin, tenant, thread, llm)

        assert result == {"text": "Já consulto!"}
        offered = [t.name for t in agent_calls(llm)[0].tools]
        assert "frete_kangu" in offered
        # A missão sem create_coupon continua sem create_coupon: a tool
        # custom (read-only) não abre a porta do dinheiro.
        assert "create_coupon" not in offered

    async def test_a_disabled_tool_stays_out(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        create_mission(
            admin, tenant, event_type="whatsapp.received", status="active",
            enabled_tools=[],
        )
        thread = create_thread(admin, tenant)
        custom_tool(admin, tenant, enabled=False, tested=False)

        llm = ScriptedLlm(reply="Sem tools.")
        await _respond(dsn, admin, tenant, thread, llm)

        assert agent_calls(llm)[0].tools == ()


class TestTheGates:
    async def test_a_mission_without_the_tool_offers_nothing(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        create_mission(
            admin, tenant, event_type="whatsapp.received", status="active",
            enabled_tools=[],
        )
        thread = create_thread(admin, tenant)

        llm = ScriptedLlm(tool_rounds=[(ASK_COUPON,)], reply="Vou verificar!")
        result = await _respond(dsn, admin, tenant, thread, llm)

        assert result == {"text": "Vou verificar!"}
        assert all(call.tools == () for call in agent_calls(llm))
        (calls,) = admin.execute(
            "select count(*) from internal.tool_calls where conversation_id = %s",
            (thread.conversation_id,),
        ).fetchone()
        assert calls == 0

    async def test_exhausted_rounds_force_a_text_ending(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        mission = create_mission(
            admin, tenant, event_type="whatsapp.received", status="active",
            enabled_tools=["create_coupon"],
        )
        thread = create_thread(admin, tenant)
        standing_grant(admin, tenant, thread, mission)

        # Um modelo obcecado: pediria a tool para sempre se deixassem.
        llm = ScriptedLlm(
            tool_rounds=[(ASK_COUPON,)] * (MAX_TOOL_ROUNDS + 5),
            reply="Fechando: seu cupom é WD-DOMOMENTO.",
        )
        result = await _respond(dsn, admin, tenant, thread, llm)

        assert result == {"text": "Fechando: seu cupom é WD-DOMOMENTO."}
        final = agent_calls(llm)[-1]
        assert final.tools == (), "a rodada de encerramento deveria sair SEM tools"
