"""As guardas do responder — chamadas direto, sem o motor no meio.

Contra o motor rodando, cada uma destas viraria corrida entre o predicado do
teste e a conclusão do turno: o primeiro rascunho deste passo tinha um teste de
`pipeline` que **passava mesmo sabotado**, porque o sinal que ele esperava
(`read_ct >= 1`) é verdadeiro por um instante nos dois desfechos. A propriedade
é do responder, então é aqui que ela se prova — uma chamada, um desfecho.

O que cada guarda protege:

  * **sem versão ativa** → exceção. Improvisar um prompt seria falar com o
    cliente por uma conta que nenhum gate de ativação aprovou; e concluir em
    silêncio marcaria a mensagem como respondida, deixando o cliente esperando
    para sempre sem ninguém saber. Exceção é a escada até a DLQ, onde um humano
    olha;
  * **janela vazia** → conclui sem enviar. Não há o que responder, e a conversa
    precisa avançar mesmo assim ou o coalescer a recria para sempre;
  * **conversa de outro tenant** → exceção. Não é "conversa vazia": é um job
    apontando para fora do escopo, e isso é bug, não desfecho.
"""

import uuid

import psycopg
import pytest

from agents_runtime.agent_core.responder import NoActiveVersion, build_responder
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
    yield organization_id
    with admin.cursor() as cur:
        cur.execute("delete from public.organizations where id = %s", (organization_id,))


def a_job(
    organization_id: uuid.UUID, conversation_id: uuid.UUID, *, target_seq: int = 1
) -> InboundJob:
    return InboundJob(
        conversation_id=conversation_id,
        generation=1,
        target_seq=target_seq,
        organization_id=organization_id,
    )


def responder(dsn: str):
    return build_responder(dsn, llm=ScriptedLlm(), set_role="worker_role")


async def test_a_tenant_without_an_active_version_refuses_to_answer(
    dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
) -> None:
    create_agent_version(admin, tenant, status="draft")
    thread = create_thread(admin, tenant)
    create_message(admin, tenant, thread, direction="inbound", seq=1, text="oi")

    with pytest.raises(NoActiveVersion):
        await responder(dsn)(a_job(tenant, thread.conversation_id))


async def test_an_empty_window_concludes_without_sending(
    dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
) -> None:
    create_agent_version(admin, tenant, status="active")
    thread = create_thread(admin, tenant)

    assert await responder(dsn)(a_job(tenant, thread.conversation_id)) is None


async def test_a_conversation_of_another_tenant_is_a_bug_not_an_answer(
    dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
) -> None:
    create_agent_version(admin, tenant, status="active")
    stranger = create_tenant(admin)
    try:
        theirs = create_thread(admin, stranger)

        with pytest.raises(LookupError):
            await responder(dsn)(a_job(tenant, theirs.conversation_id))
    finally:
        with admin.cursor() as cur:
            cur.execute("delete from public.organizations where id = %s", (stranger,))


async def test_an_inbound_without_any_active_mission_alerts_and_stays_silent(
    dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
) -> None:
    """§3.4 inv. 8 no inbound: sem NENHUMA missão ativa (nem descoberta), o
    turno conclui sem enviar e o silêncio é observável — a linha de alerts."""
    create_agent_version(admin, tenant, status="active")
    thread = create_thread(admin, tenant)
    create_message(admin, tenant, thread, direction="inbound", seq=1, text="oi")

    assert await responder(dsn)(a_job(tenant, thread.conversation_id)) is None

    with admin.cursor() as cur:
        cur.execute(
            "select count(*) from public.alerts"
            " where organization_id = %s and type = 'no_active_mission'",
            (tenant,),
        )
        (alerts,) = cur.fetchone()
    assert alerts == 1


async def test_with_an_active_discovery_mission_the_inbound_is_answered(
    dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
) -> None:
    """O caminho feliz mínimo: descoberta ativa assume o turno e o rascunho
    aprovado volta como conteúdo."""
    create_agent_version(admin, tenant, status="active")
    create_mission(admin, tenant, event_type="whatsapp.received", status="active")
    thread = create_thread(admin, tenant)
    create_message(admin, tenant, thread, direction="inbound", seq=1, text="oi")

    draft = await responder(dsn)(a_job(tenant, thread.conversation_id))

    assert draft is not None and draft.get("text")
