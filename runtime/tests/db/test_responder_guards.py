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

E, desde o item 30, a FIAÇÃO dos guards de comportamento. O módulo puro
(`tests/unit/test_behavior_guards.py`) prova a decisão; a ponte SQL
(`tests/db/test_legacy_guard_state.py`) prova o caminho até o dado. Nenhum dos
dois prova que o responder CHAMA alguma coisa — apagar as chamadas deixava as
duas suítes verdes. É essa classe de desfecho que se prova aqui: cala,
transfere, ou segue.
"""

import uuid

import psycopg
import pytest

from agents_runtime.agent_core.responder import NoActiveVersion, build_responder
from agents_runtime.queueing.jobs import InboundJob
from tests.db.factories import (
    contact_phone,
    create_agent_version,
    create_cloud_mirror,
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


def responder(dsn: str, llm: ScriptedLlm | None = None):
    return build_responder(dsn, llm=llm or ScriptedLlm(), set_role="worker_role")


def configure(conn: psycopg.Connection, organization_id: uuid.UUID, settings: dict) -> None:
    """A órbita do agente como o lojista salva na tela — `ai_agents.settings`.

    Vai na versão em produção porque é dela que o `load_active_version` lê
    (`coalesce(v.settings, a.settings)`).
    """
    with conn.cursor() as cur:
        cur.execute(
            "update public.ai_agent_versions set settings = %s"
            " where organization_id = %s and status = 'produção'",
            (psycopg.types.json.Jsonb(settings), organization_id),
        )


def mirrored(conn: psycopg.Connection, organization_id: uuid.UUID, thread):
    """A conversa canônica com identidade WhatsApp e linha no espelho legado.

    É o vivo de uma org migrada — e é o único arranjo em que os guards têm
    estado para ler: a canônica não tem `ai_transferred_at`, `ai_enabled` nem
    `ai_agent_id` (ver `load_legacy_guard_state`).
    """
    phone = contact_phone(conn, thread.contact_id)
    with conn.cursor() as cur:
        cur.execute(
            "insert into public.channel_identities"
            " (organization_id, contact_id, channel, external_id)"
            " values (%s, %s, 'whatsapp', %s) on conflict do nothing",
            (organization_id, thread.contact_id, phone),
        )
    return create_cloud_mirror(conn, organization_id, thread.channel_account_id, phone)


def steps(conn: psycopg.Connection, mirror) -> list[tuple]:
    with conn.cursor() as cur:
        cur.execute(
            "select step, detail from public.whatsapp_ai_run_steps"
            " where conversation_id = %s order by created_at",
            (mirror.conversation_id,),
        )
        return cur.fetchall()


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


class TestTheBehaviorGuardsAreWired:
    """Item 30: o responder consulta os guards, e o desfecho é observável.

    Três classes de desfecho, uma por teste. Apagar a chamada correspondente
    em `responder.py` derruba exatamente uma delas — que é a prova de que o
    teste morde o encanamento, e não só a decisão pura.
    """

    async def test_a_guard_silences_the_turn_and_says_why(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """Conversa transferida há pouco: o turno não sai, e o chip do inbox
        carrega o motivo — silêncio sem motivo legível é o defeito, não a
        feature."""
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type="whatsapp.received", status="active")
        thread = create_thread(admin, tenant)
        mirror = mirrored(admin, tenant, thread)
        create_message(admin, tenant, thread, direction="inbound", seq=1, text="oi")
        admin.execute(
            "update public.whatsapp_cloud_conversations set ai_transferred_at = now()"
            " where id = %s",
            (mirror.conversation_id,),
        )

        assert await responder(dsn)(a_job(tenant, thread.conversation_id)) is None

        assert ("skipped", "Em cooldown depois de uma transferência para humano") in steps(
            admin, mirror
        )

    async def test_a_handoff_keyword_transfers_the_conversation(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """"Quero falar com um atendente": sai a confirmação configurada e a IA
        fica DESLIGADA no espelho — o freio que o webhook respeita nos turnos
        seguintes."""
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type="whatsapp.received", status="active")
        configure(
            admin,
            tenant,
            {
                "safety": {
                    "handoff_keywords": ["atendente"],
                    "handoff_confirmation_message": "Já vou chamar alguém do time!",
                }
            },
        )
        thread = create_thread(admin, tenant)
        mirror = mirrored(admin, tenant, thread)
        create_message(
            admin, tenant, thread,
            direction="inbound", seq=1, text="quero falar com um ATENDENTE",
        )

        draft = await responder(dsn)(a_job(tenant, thread.conversation_id))

        assert draft is not None
        assert draft["text"] == "Já vou chamar alguém do time!"
        (enabled,) = admin.execute(
            "select ai_enabled from public.whatsapp_cloud_conversations where id = %s",
            (mirror.conversation_id,),
        ).fetchone()
        assert enabled is False
        (alert,) = admin.execute(
            "select metadata from public.alerts"
            " where organization_id = %s and type = 'handoff'",
            (tenant,),
        ).fetchone()
        assert alert["mirrored"] is True

    async def test_with_every_guard_configured_and_none_tripped_the_turn_goes_on(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """O outro lado da prova: a órbita inteira preenchida, nada disparando,
        e a resposta sai. Guard que cala sempre não é guard, é apagão."""
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type="whatsapp.received", status="active")
        configure(
            admin,
            tenant,
            {
                "behavior": {
                    "activate_on": "automatic",
                    "cooldown_after_transfer": 300,
                    "max_messages_per_conversation": 5,
                    "stop_on_human_reply": True,
                },
                "safety": {"handoff_keywords": ["atendente"], "blocked_topics": ["jurídico"]},
                "schedule": {"always_active": True},
            },
        )
        thread = create_thread(admin, tenant)
        mirrored(admin, tenant, thread)
        create_message(admin, tenant, thread, direction="inbound", seq=1, text="oi")

        draft = await responder(dsn)(a_job(tenant, thread.conversation_id))

        assert draft is not None and draft.get("text")


class TestATransferThatDoesNotStick:
    """`mark_ai_handoff` devolve false — e o registro não pode mentir sobre isso.

    A marca é escrita no espelho legado, a dois saltos sem FK da canônica
    (`conversations` -> `channel_identities` -> `whatsapp_cloud_conversations`).
    Conversa sem identidade WhatsApp, ou sem linha no espelho, não pega a
    marca: `ai_enabled` continua true, o webhook não cancela nada, e a
    transferência não vale para os turnos seguintes. Um alerta dizendo "IA
    transferida" nesse caso é pior que nenhum alerta.
    """

    async def test_the_alert_says_the_transfer_did_not_reach_the_mirror(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type="whatsapp.received", status="active")
        configure(
            admin,
            tenant,
            {
                "safety": {
                    "handoff_keywords": ["atendente"],
                    "handoff_confirmation_message": "Já vou chamar alguém do time!",
                }
            },
        )
        # Sem identidade WhatsApp e sem espelho: a marca não tem onde pegar.
        thread = create_thread(admin, tenant)
        create_message(
            admin, tenant, thread, direction="inbound", seq=1, text="quero um atendente"
        )

        draft = await responder(dsn)(a_job(tenant, thread.conversation_id))

        # A confirmação continua saindo: o cliente pediu um humano e merece
        # ouvir que foi ouvido. O que não pode é o registro mentir.
        assert draft is not None
        assert draft["text"] == "Já vou chamar alguém do time!"
        (severity, title, metadata) = admin.execute(
            "select severity, title, metadata from public.alerts"
            " where organization_id = %s and type = 'handoff'",
            (tenant,),
        ).fetchone()
        assert metadata["mirrored"] is False
        assert "não foi desligada" in title
        assert severity == "critical"

    async def test_a_recurring_blocked_topic_does_not_open_a_new_alert_every_turn(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """Sem transferência efetiva, cada turno regenera o mesmo assunto — e
        abriria um alerta `critical` novo, para sempre. O `dedup_key` que a
        tabela já tem existe exatamente para isso."""
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type="whatsapp.received", status="active")
        configure(admin, tenant, {"safety": {"blocked_topics": ["processo judicial"]}})
        thread = create_thread(admin, tenant)
        create_message(admin, tenant, thread, direction="inbound", seq=1, text="e aí")
        llm = ScriptedLlm(reply="Sobre o seu Processo Judicial, melhor conversarmos.")

        assert await responder(dsn, llm)(a_job(tenant, thread.conversation_id)) is None
        assert await responder(dsn, llm)(a_job(tenant, thread.conversation_id)) is None

        (alerts,) = admin.execute(
            "select count(*) from public.alerts"
            " where organization_id = %s and type = 'handoff'",
            (tenant,),
        ).fetchone()
        assert alerts == 1
