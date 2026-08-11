"""10.4 — o runtime LÊ presentation_mode e client_adaptation do agente.

A UI da radial escreve as duas colunas (migration 0014); aqui se prova que o
turno real as respeita: o modo de apresentação escolhido muda a linha de
apresentação do bloco AGENTE, os toggles de adaptação viram as linhas do
vocabulário do compiler (emoji_if_client → emoji), e a linha fixa de IA
continua presente em QUALQUER modo — ela é do compilador, não da config.
"""

import uuid

import psycopg
import pytest

from agents_runtime.agent_core.prompt_compiler import AI_DISCLOSURE_LINE
from agents_runtime.agent_core.responder import build_responder
from agents_runtime.queueing.jobs import InboundJob
from tests.db.factories import (
    create_agent_version,
    create_message,
    create_mission,
    create_tenant,
    create_thread,
)
from tests.support.llm import ScriptedLlm


@pytest.fixture
def tenant(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    create_mission(admin, organization_id, event_type="whatsapp.received", status="active")
    yield organization_id
    with admin.cursor() as cur:
        cur.execute("delete from public.organizations where id = %s", (organization_id,))


async def _system_prompt(dsn: str, admin: psycopg.Connection, tenant: uuid.UUID) -> str:
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
    return llm.asked[0].messages[0].content


async def test_the_chosen_presentation_reaches_the_prompt(
    dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
) -> None:
    create_agent_version(admin, tenant, status="active")
    admin.execute(
        "update public.ai_agents set presentation_mode = 'transparente',"
        " client_adaptation = '{\"mirror_tone\": true, \"emoji_if_client\": true,"
        " \"mirror_length\": false}'::jsonb"
        " where organization_id = %s",
        (tenant,),
    )

    system = await _system_prompt(dsn, admin, tenant)

    assert "Apresente-se como a assistente virtual da loja." in system
    assert "Espelhe o tom do cliente" in system
    assert "Use emoji só se o cliente usar primeiro." in system
    assert "Espelhe o tamanho das mensagens" not in system
    assert AI_DISCLOSURE_LINE in system


async def test_the_default_stays_nome_funcao_with_no_adaptation(
    dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
) -> None:
    create_agent_version(admin, tenant, status="active")

    system = await _system_prompt(dsn, admin, tenant)

    assert "Apresente-se pelo nome e pelo time" in system
    assert "Espelhe o tom do cliente" not in system
    assert AI_DISCLOSURE_LINE in system
