"""O momento dentro do turno real — o que chega ao prompt do agente.

O caminho inteiro: momento no banco → leitura na transação curta → merge →
StateBlock → frame compilado → chamada do LLM. O dublê captura o system
prompt, então o que se afirma aqui é literalmente o que o agente teria lido.

As duas pontas do gate `promote_moment` (§3.3.4): missão que promove leva a
frase pública; missão que não promove leva o FATO (não contradizer a promo)
mas nunca a frase (suporte não panfleta).
"""

import uuid

import psycopg
import pytest

from agents_runtime.agent_core.responder import build_responder
from agents_runtime.queueing.jobs import InboundJob
from tests.db.factories import (
    create_agent_version,
    create_message,
    create_mission,
    create_moment,
    create_tenant,
    create_thread,
)
from tests.support.llm import ScriptedLlm

CLAIM = "Semana do cliente: 10% em tudo com o cupom DEZ."
FACT = "frete grátis acima de R$99 vale até domingo"


@pytest.fixture
def tenant(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    create_agent_version(admin, organization_id, status="active")
    yield organization_id
    with admin.cursor() as cur:
        cur.execute("delete from public.organizations where id = %s", (organization_id,))


async def _turn_system_prompt(
    dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
) -> str:
    thread = create_thread(admin, tenant)
    create_message(admin, tenant, thread, direction="inbound", seq=1, text="oi")
    llm = ScriptedLlm()
    responder = build_responder(dsn, llm=llm, set_role="worker_role")
    result = await responder(
        InboundJob(
            conversation_id=thread.conversation_id,
            generation=1,
            target_seq=1,
            organization_id=tenant,
        )
    )
    assert result is not None
    agent_calls = [r for r in llm.asked if not r.model.startswith("openai/")]
    return agent_calls[0].messages[0].content


async def test_a_promoting_mission_carries_the_public_claim(
    dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
) -> None:
    create_mission(
        admin, tenant, event_type="whatsapp.received", status="active", promote_moment=True
    )
    create_moment(admin, tenant, public_claim=CLAIM, temp_facts=[FACT])

    system = await _turn_system_prompt(dsn, admin, tenant)
    assert CLAIM in system
    assert FACT in system


async def test_a_non_promoting_mission_gets_the_fact_but_never_the_claim(
    dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
) -> None:
    create_mission(
        admin, tenant, event_type="whatsapp.received", status="active", promote_moment=False
    )
    create_moment(admin, tenant, public_claim=CLAIM, temp_facts=[FACT])

    system = await _turn_system_prompt(dsn, admin, tenant)
    assert CLAIM not in system
    assert FACT in system


async def test_moment_forbidden_reaches_the_mission_block(
    dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
) -> None:
    create_mission(admin, tenant, event_type="whatsapp.received", status="active")
    create_moment(admin, tenant, forbidden=["prometer extensão da promo"])

    system = await _turn_system_prompt(dsn, admin, tenant)
    assert "prometer extensão da promo" in system
