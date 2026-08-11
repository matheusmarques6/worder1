"""9.3a — o dinheiro no turno inbound: o que o agente SABE sobre benefício.

O buraco que o adendo aponta: no toque outbound o benefício entra no prompt
(o toucher acabou de emitir), mas no inbound o agente respondia cego — cliente
com cupom vigente pedia desconto e o agente nem sabia que o cupom existia.

Aqui o contrato: grant vigente COM código chega ao bloco de ESTADO como linha
de cupom; grant morto (vencido, consumido, esgotado) ou sem código (janela de
crash entre grant e provedor — prometer sem cupom seria mentira) fica de fora;
o histórico do ledger entra como memória ("pediu ontem, foi negado").
"""

import uuid
from datetime import UTC, datetime, timedelta

import psycopg
import pytest

from agents_runtime.agent_core.responder import build_responder
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


@pytest.fixture
def tenant(admin: psycopg.Connection) -> tuple[uuid.UUID, uuid.UUID]:
    organization_id = create_tenant(admin)
    create_agent_version(admin, organization_id, status="active")
    mission = create_mission(
        admin, organization_id, event_type="whatsapp.received", status="active"
    )
    yield organization_id, mission
    with admin.cursor() as cur:
        cur.execute("delete from public.organizations where id = %s", (organization_id,))


def grant_for(
    admin: psycopg.Connection,
    tenant: tuple[uuid.UUID, uuid.UUID],
    thread: Thread,
    *,
    coupon_code: str | None = "WD-VIVO123",
    status: str = "issued",
    uses: int = 0,
    max_uses: int = 1,
    hours_left: float = 24,
) -> uuid.UUID:
    organization_id, mission = tenant
    (grant_id,) = admin.execute(
        """
        insert into public.incentive_grants
            (organization_id, contact_id, object_kind, object_ref, source,
             mission_version_id, kind, value, validity_until, max_uses, uses,
             status, coupon_code, idempotency_key)
        values (%s, %s, 'cart', 'cart-1', 'mission', %s, 'percent', 10,
                %s, %s, %s, %s, %s, %s)
        returning id
        """,
        (
            organization_id, thread.contact_id, mission,
            datetime.now(UTC) + timedelta(hours=hours_left),
            max_uses, uses, status, coupon_code, unique_id("idem"),
        ),
    ).fetchone()
    return grant_id


async def _turn_system_prompt(
    dsn: str, admin: psycopg.Connection, tenant: tuple[uuid.UUID, uuid.UUID], thread: Thread
) -> str:
    organization_id, _ = tenant
    create_message(
        admin, organization_id, thread, direction="inbound", seq=1, text="tem desconto?"
    )
    llm = ScriptedLlm()
    responder = build_responder(dsn, llm=llm, set_role="worker_role")
    result = await responder(
        InboundJob(
            conversation_id=thread.conversation_id,
            generation=1,
            target_seq=1,
            organization_id=organization_id,
        )
    )
    assert result is not None
    agent_calls = [r for r in llm.asked if not r.model.startswith("openai/")]
    return agent_calls[0].messages[0].content


async def test_a_standing_coupon_reaches_the_prompt(
    dsn: str, admin: psycopg.Connection, tenant: tuple[uuid.UUID, uuid.UUID]
) -> None:
    thread = create_thread(admin, tenant[0])
    grant_for(admin, tenant, thread, coupon_code="WD-VIVO123")

    system = await _turn_system_prompt(dsn, admin, tenant, thread)

    assert "WD-VIVO123" in system
    assert "Cupom vigente" in system


async def test_dead_grants_stay_out(
    dsn: str, admin: psycopg.Connection, tenant: tuple[uuid.UUID, uuid.UUID]
) -> None:
    thread = create_thread(admin, tenant[0])
    grant_for(admin, tenant, thread, coupon_code="WD-VENCIDO", hours_left=-1)
    grant_for(admin, tenant, thread, coupon_code="WD-CONSUMIDO", status="consumed")
    grant_for(admin, tenant, thread, coupon_code="WD-ESGOTADO", uses=1, max_uses=1)

    system = await _turn_system_prompt(dsn, admin, tenant, thread)

    assert "Cupom vigente" not in system
    assert "WD-" not in system


async def test_a_grant_without_code_is_not_promised(
    dsn: str, admin: psycopg.Connection, tenant: tuple[uuid.UUID, uuid.UUID]
) -> None:
    thread = create_thread(admin, tenant[0])
    grant_for(admin, tenant, thread, coupon_code=None)

    system = await _turn_system_prompt(dsn, admin, tenant, thread)

    assert "Cupom vigente" not in system


async def test_the_ledger_history_is_memory(
    dsn: str, admin: psycopg.Connection, tenant: tuple[uuid.UUID, uuid.UUID]
) -> None:
    thread = create_thread(admin, tenant[0])
    admin.execute(
        """
        insert into public.incentive_ledger
            (organization_id, contact_id, entry_kind, reason)
        values (%s, %s, 'denied', 'fora do momento comercial')
        """,
        (tenant[0], thread.contact_id),
    )

    system = await _turn_system_prompt(dsn, admin, tenant, thread)

    assert "Histórico de incentivo" in system
    assert "fora do momento comercial" in system


async def test_the_money_state_is_scoped_to_the_contact(
    dsn: str, admin: psycopg.Connection, tenant: tuple[uuid.UUID, uuid.UUID]
) -> None:
    thread = create_thread(admin, tenant[0])
    other = create_thread(admin, tenant[0])
    grant_for(admin, tenant, other, coupon_code="WD-DOOUTRO")

    system = await _turn_system_prompt(dsn, admin, tenant, thread)

    assert "WD-DOOUTRO" not in system
