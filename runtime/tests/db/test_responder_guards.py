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
from datetime import UTC, datetime

import psycopg
import pytest

from agents_runtime.agent_core.responder import (
    NoActiveVersion,
    build_responder,
    transfer_to_human,
)
from agents_runtime.agent_core.toucher import build_toucher
from agents_runtime.queueing.jobs import InboundJob, MissionTouchJob
from tests.db.factories import (
    contact_phone,
    create_agent_version,
    create_cloud_mirror,
    create_message,
    create_mission,
    create_tenant,
    create_thread,
)
from tests.support.clock import FrozenClock
from tests.support.llm import ScriptedLlm

#: A família de evento do toque proativo — a mesma de `tests/db/test_toucher.py`.
FAMILY = "cart.abandoned"


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


def toucher(dsn: str, llm: ScriptedLlm | None = None, **kwargs):
    return build_toucher(dsn, llm=llm or ScriptedLlm(), set_role="worker_role", **kwargs)


def a_touch(
    organization_id: uuid.UUID,
    thread,
    *,
    touch_id: uuid.UUID | None = None,
) -> MissionTouchJob:
    return MissionTouchJob(
        organization_id=organization_id,
        contact_id=thread.contact_id,
        conversation_id=thread.conversation_id,
        touch_id=touch_id
        if touch_id is not None
        else uuid.uuid5(
            thread.conversation_id,
            "test-responder-guards:flow-1:node-2",
        ),
        event_family=FAMILY,
        node_ref="flow-1:node-2",
        delta=None,
        concession_request=None,
    )


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

    assert (await responder(dsn)(a_job(tenant, thread.conversation_id))).content is None


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

    assert (await responder(dsn)(a_job(tenant, thread.conversation_id))).content is None

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

    assert draft.content is not None and draft.content.get("text")


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

        assert (await responder(dsn)(a_job(tenant, thread.conversation_id))).content is None

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
                    "handoff_confirmation_message": "Vou chamar um humano.",
                    "blocked_topics": ["humano"],
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

        assert draft.content is not None
        assert draft.content["text"] == "Vou chamar um humano."
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

    async def test_an_empty_handoff_confirmation_transfers_silently(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type="whatsapp.received", status="active")
        configure(admin, tenant, {"safety": {"handoff_keywords": ["humano"]}})
        thread = create_thread(admin, tenant)
        mirror = mirrored(admin, tenant, thread)
        create_message(admin, tenant, thread, direction="inbound", seq=1, text="quero um humano")
        llm = ScriptedLlm(reply="não deve gerar confirmação")

        assert (await responder(dsn, llm)(a_job(tenant, thread.conversation_id))).content is None
        assert llm.asked == []
        (enabled,) = admin.execute(
            "select ai_enabled from public.whatsapp_cloud_conversations where id = %s",
            (mirror.conversation_id,),
        ).fetchone()
        assert enabled is False

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

        assert draft.content is not None and draft.content.get("text")


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
        assert draft.content is not None
        assert draft.content["text"] == "Já vou chamar alguém do time!"
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
        configure(admin, tenant, {"safety": {"blocked_topics": ["humano"]}})
        thread = create_thread(admin, tenant)
        create_message(admin, tenant, thread, direction="inbound", seq=1, text="e aí")
        llm = ScriptedLlm(reply="Vou chamar um humano.")

        assert (await responder(dsn, llm)(a_job(tenant, thread.conversation_id))).content is None
        assert (await responder(dsn, llm)(a_job(tenant, thread.conversation_id))).content is None

        (alerts,) = admin.execute(
            "select count(*) from public.alerts"
            " where organization_id = %s and type = 'handoff'",
            (tenant,),
        ).fetchone()
        assert alerts == 1


class TestTheTouchConsultsTheSameGuards:
    """O outro produtor de fala do runtime — item 30, correção do achado 1.

    O toque de missão nasce fora do ingest (`emit_ai_mission_job`), então nada
    do que o webhook freia vale para ele. Sem consultar os guards, ele desfazia
    pela outra porta a transferência que o próprio item construiu: o cliente
    pedia um humano e o bot voltava a falar no toque seguinte.
    """

    async def test_a_transferred_conversation_gets_no_proactive_touch(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type=FAMILY, status="active")
        thread = create_thread(admin, tenant)
        mirror = mirrored(admin, tenant, thread)
        admin.execute(
            "update public.whatsapp_cloud_conversations set ai_enabled = false where id = %s",
            (mirror.conversation_id,),
        )
        llm = ScriptedLlm()

        draft = await toucher(dsn, llm)(a_touch(tenant, thread))

        assert draft.content is None
        # Guard que cala é comportamento configurado, não anomalia: nada de
        # alerta. E nada de LLM — silenciar cedo não custa uma geração.
        assert llm.asked == []
        (alerts,) = admin.execute(
            "select count(*) from public.alerts where organization_id = %s", (tenant,)
        ).fetchone()
        assert alerts == 0

    async def test_a_touch_outside_business_hours_stays_quiet(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """Um toque às 3h numa loja 08:00-18:00 é o caso que o knob existe para
        impedir — e o toque é a hora em que ele mais importa, porque ninguém
        do outro lado pediu nada."""
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type=FAMILY, status="active")
        configure(
            admin,
            tenant,
            {
                "schedule": {
                    "timezone": "America/Sao_Paulo",
                    "hours": {"start": "08:00", "end": "18:00"},
                    "days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
                }
            },
        )
        thread = create_thread(admin, tenant)
        mirrored(admin, tenant, thread)
        # 06:00Z = 03:00 em Sao Paulo, numa segunda-feira.
        clock = FrozenClock(datetime(2026, 8, 31, 6, 0, tzinfo=UTC))

        draft = await toucher(dsn, ScriptedLlm(), clock=clock)(a_touch(tenant, thread))

        assert draft.content is None

    async def test_a_blocked_topic_in_the_touch_transfers_instead_of_speaking(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """O ruling do brief: `blocked_topics` fica do lado da SAÍDA, e o toque
        é uma saída. O Judge 1 não substitui — ele tem rubricas próprias e não
        conhece a lista deste lojista."""
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type=FAMILY, status="active")
        configure(admin, tenant, {"safety": {"blocked_topics": ["processo judicial"]}})
        thread = create_thread(admin, tenant)
        mirror = mirrored(admin, tenant, thread)
        llm = ScriptedLlm(reply="Sobre o seu Processo Judicial, melhor conversarmos.")

        draft = await toucher(dsn, llm)(a_touch(tenant, thread))

        assert draft.content is None
        (enabled,) = admin.execute(
            "select ai_enabled from public.whatsapp_cloud_conversations where id = %s",
            (mirror.conversation_id,),
        ).fetchone()
        assert enabled is False
        (metadata,) = admin.execute(
            "select metadata from public.alerts"
            " where organization_id = %s and type = 'handoff'",
            (tenant,),
        ).fetchone()
        assert metadata["topic"] == "processo judicial"
        assert metadata["mirrored"] is True

    async def test_with_nothing_tripped_the_touch_still_goes_out(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type=FAMILY, status="active")
        configure(
            admin,
            tenant,
            {
                "behavior": {"max_messages_per_conversation": 5, "stop_on_human_reply": True},
                "safety": {"blocked_topics": ["jurídico"]},
                "schedule": {"always_active": True},
            },
        )
        thread = create_thread(admin, tenant)
        mirrored(admin, tenant, thread)

        draft = await toucher(dsn, ScriptedLlm())(a_touch(tenant, thread))

        assert draft.content is not None and draft.content.get("text")


class TestASilentTouchStillLeavesATrace:
    """Defeito novo do round 1: o toque calado por guard sumia sem registro.

    O toucher nunca teve run steps — o único canal dele era `alerts`, e guard
    não é anomalia, então não abre alerta. Resultado: o nó de fluxo pedia o
    toque, recebia `queued`, e nada acontecia, sem chip e sem motivo. O
    requisito 3 do brief vale para os dois produtores: um agente que fica mudo
    sem motivo legível é o defeito. O canal é o mesmo do responder.
    """

    async def test_the_guard_that_silences_a_touch_says_why_in_a_step(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type=FAMILY, status="active")
        thread = create_thread(admin, tenant)
        mirror = mirrored(admin, tenant, thread)
        admin.execute(
            "update public.whatsapp_cloud_conversations set ai_enabled = false where id = %s",
            (mirror.conversation_id,),
        )

        draft = await toucher(dsn, ScriptedLlm())(a_touch(tenant, thread))

        assert draft.content is None
        assert ("skipped", "IA desligada nesta conversa") in steps(admin, mirror)

    async def test_a_blocked_topic_in_the_touch_leaves_the_transferred_step(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type=FAMILY, status="active")
        configure(admin, tenant, {"safety": {"blocked_topics": ["processo judicial"]}})
        thread = create_thread(admin, tenant)
        mirror = mirrored(admin, tenant, thread)
        llm = ScriptedLlm(reply="Sobre o seu Processo Judicial, melhor conversarmos.")

        await toucher(dsn, llm)(a_touch(tenant, thread))

        assert any(step == "transferred" for step, _ in steps(admin, mirror))


class TestTheDedupKeyDoesNotSwallowTheEscalation:
    """`dedup_key` sem `mirrored` suprimia justamente o alerta grave.

    Alcançável no vivo: a transferência pega uma vez (alerta `warning` aberto),
    um humano religa o bot pelo botão do inbox sem resolver o alerta (são duas
    telas), e depois a ponte para de resolver — telefone editado, linha do
    espelho rotacionada, a assimetria do `+`. A partir daí toda transferência
    falha em silêncio, com o `critical` "a IA não foi desligada" engolido por
    um `warning` menos grave que ficou aberto. E é o único registro que
    sobrevive nesse caso: o passo `transferred` também não espelha.
    """

    async def test_the_unmirrored_critical_passes_an_open_warning(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        thread = create_thread(admin, tenant)
        mirror = mirrored(admin, tenant, thread)

        async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
            await conn.execute("set role worker_role")
            first = await transfer_to_human(
                conn,
                organization_id=tenant,
                conversation_id=thread.conversation_id,
                reason="handoff_keyword",
                severity="warning",
                title="Cliente pediu atendimento humano",
                payload={},
            )
            # A ponte para de resolver: mesma conversa, mesmo motivo, mas a
            # marca não tem mais onde pegar.
            admin.execute(
                "delete from public.whatsapp_cloud_conversations where id = %s",
                (mirror.conversation_id,),
            )
            second = await transfer_to_human(
                conn,
                organization_id=tenant,
                conversation_id=thread.conversation_id,
                reason="handoff_keyword",
                severity="warning",
                title="Cliente pediu atendimento humano",
                payload={},
            )

        assert (first, second) == (True, False)
        rows = admin.execute(
            "select severity, metadata -> 'mirrored' from public.alerts"
            " where organization_id = %s and type = 'handoff' order by severity",
            (tenant,),
        ).fetchall()
        assert rows == [("critical", False), ("warning", True)]


class TestMediaWithoutAWordDegradesHonestly:
    """Item 31: o turno de áudio/imagem parou de responder no vazio.

    Áudio e imagem NÃO são `unsupported` para o webhook — a régua de
    `media/router.ts:38-50` os inclui de propósito, porque no caminho legado
    eles têm transcrição e visão. Para org migrada o turno era agendado do
    mesmo jeito e o modelo escrevia sobre uma rajada sem texto: não é silêncio,
    é resposta no vazio, que é o pior dos dois.

    Três classes de desfecho, uma por teste — e cada uma morde um pedaço
    diferente da fiação.
    """

    async def test_an_audio_alone_answers_honestly_and_spends_no_token(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """A prova de que nenhum token é gasto está em `llm.asked`: gerar
        resposta a partir de nada é o defeito que este item fecha, então a
        chamada seria desperdício além de mentira."""
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type="whatsapp.received", status="active")
        thread = create_thread(admin, tenant)
        mirror = mirrored(admin, tenant, thread)
        create_message(
            admin, tenant, thread, direction="inbound", seq=1,
            content={"type": "audio", "text": None, "media_id": "wamid.a"},
        )
        llm = ScriptedLlm()

        draft = await responder(dsn, llm)(a_job(tenant, thread.conversation_id))

        assert draft.content is not None
        assert draft.content["text"] == (
            "Desculpe, ainda não consigo ouvir áudios por aqui. "
            "Pode me escrever em texto, por favor?"
        )
        assert llm.asked == []
        assert (
            "started",
            "Cliente enviou um áudio sem transcrição — o agente ainda não lê"
            " esse tipo e pediu o texto",
        ) in steps(admin, mirror)

    async def test_an_image_alone_has_its_own_wording(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """"Não consigo ouvir" para uma imagem seria uma segunda mentira."""
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type="whatsapp.received", status="active")
        thread = create_thread(admin, tenant)
        create_message(
            admin, tenant, thread, direction="inbound", seq=1,
            content={"type": "image", "text": None, "media_id": "wamid.i", "caption": None},
        )
        llm = ScriptedLlm()

        draft = await responder(dsn, llm)(a_job(tenant, thread.conversation_id))

        assert draft.content is not None
        assert draft.content["text"] == (
            "Desculpe, ainda não consigo ver imagens por aqui. "
            "Pode me escrever em texto, por favor?"
        )
        assert llm.asked == []

    async def test_the_store_message_wins_when_the_merchant_wrote_one(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """`settings.media_fallback.message` é o knob que o TS já lê
        (`media/router.ts:78-85`) e que não tinha leitor nenhum em Python."""
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type="whatsapp.received", status="active")
        configure(admin, tenant, {"media_fallback": {"message": "Me manda por escrito? 🧡"}})
        thread = create_thread(admin, tenant)
        create_message(
            admin, tenant, thread, direction="inbound", seq=1,
            content={"type": "audio", "text": None, "media_id": "wamid.a"},
        )

        draft = await responder(dsn)(a_job(tenant, thread.conversation_id))

        assert draft.content is not None and draft.content["text"] == "Me manda por escrito? 🧡"

    async def test_a_caption_is_the_customer_speaking_and_the_turn_is_normal(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """O outro lado da prova. Degradar com legenda seria ignorar um cliente
        que escreveu — e o prompt precisa carregar as duas coisas: o que ele
        escreveu E que existe uma imagem que o modelo não viu."""
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type="whatsapp.received", status="active")
        thread = create_thread(admin, tenant)
        create_message(
            admin, tenant, thread, direction="inbound", seq=1,
            content={
                "type": "image",
                "text": "esse ainda tem?",
                "media_id": "wamid.i",
                "caption": "esse ainda tem?",
            },
        )
        llm = ScriptedLlm(reply="Tem sim! Me diz qual é que eu confiro o estoque.")

        draft = await responder(dsn, llm)(a_job(tenant, thread.conversation_id))

        assert draft.content is not None
        assert draft.content["text"] == "Tem sim! Me diz qual é que eu confiro o estoque."
        prompts = [message.content for request in llm.asked for message in request.messages]
        assert any("[Cliente enviou uma imagem: esse ainda tem?]" in text for text in prompts)

    async def test_one_written_message_in_the_burst_keeps_the_turn_normal(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """A rajada do debounce traz várias mensagens: áudio seguido de "viu?"
        é uma pergunta que o modelo responde."""
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type="whatsapp.received", status="active")
        thread = create_thread(admin, tenant)
        create_message(
            admin, tenant, thread, direction="inbound", seq=1,
            content={"type": "audio", "text": None, "media_id": "wamid.a"},
        )
        create_message(admin, tenant, thread, direction="inbound", seq=2, text="viu?")
        llm = ScriptedLlm(reply="Vi sim!")

        draft = await responder(dsn, llm)(a_job(tenant, thread.conversation_id, target_seq=2))

        assert draft.content is not None and draft.content["text"] == "Vi sim!"

    async def test_a_guard_that_silences_still_wins_over_the_honest_line(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """Ordem: os guards decidem SE a loja fala; a mídia decide o que ela
        diz. Uma conversa transferida há pouco não volta a falar por causa de
        um áudio."""
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type="whatsapp.received", status="active")
        thread = create_thread(admin, tenant)
        mirror = mirrored(admin, tenant, thread)
        create_message(
            admin, tenant, thread, direction="inbound", seq=1,
            content={"type": "audio", "text": None, "media_id": "wamid.a"},
        )
        admin.execute(
            "update public.whatsapp_cloud_conversations set ai_transferred_at = now()"
            " where id = %s",
            (mirror.conversation_id,),
        )

        assert (await responder(dsn)(a_job(tenant, thread.conversation_id))).content is None

    async def test_the_handoff_mode_transfers_instead_of_asking_for_text(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """`media_fallback.mode: 'handoff'` — a outra metade do knob.

        No TS o modo desliga a IA, notifica a equipe e NÃO responde nada ao
        cliente (`cloud-runner.ts:210-241`): quem responde é o humano. E não é
        caminho excepcional de lá — `:657-660` manda todo áudio ao fallback
        com `no_stt_provider` quando a org não tem STT, antes de tentar. Quem
        configurou isto já vive assim no motor legado.
        """
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type="whatsapp.received", status="active")
        configure(admin, tenant, {"media_fallback": {"mode": "handoff"}})
        thread = create_thread(admin, tenant)
        mirror = mirrored(admin, tenant, thread)
        create_message(
            admin, tenant, thread, direction="inbound", seq=1,
            content={"type": "audio", "text": None, "media_id": "wamid.a"},
        )
        llm = ScriptedLlm()

        draft = await responder(dsn, llm)(a_job(tenant, thread.conversation_id))

        assert draft.content is None
        assert llm.asked == []
        (enabled,) = admin.execute(
            "select ai_enabled from public.whatsapp_cloud_conversations where id = %s",
            (mirror.conversation_id,),
        ).fetchone()
        assert enabled is False
        (reason, metadata) = admin.execute(
            "select metadata ->> 'reason', metadata from public.alerts"
            " where organization_id = %s and type = 'handoff'",
            (tenant,),
        ).fetchone()
        assert (reason, metadata["mirrored"]) == ("media_handoff", True)
        assert any(step == "transferred" for step, _ in steps(admin, mirror))

    async def test_without_the_mode_the_store_keeps_answering(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """O controle negativo do knob: `mode` ausente é `ask_text`
        (`media/router.ts:83`, `types.ts:437`), e a loja que nunca configurou
        nada não pode perder a conversa para um humano por causa de um áudio."""
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type="whatsapp.received", status="active")
        configure(admin, tenant, {"media_fallback": {"message": "me escreve, por favor"}})
        thread = create_thread(admin, tenant)
        mirror = mirrored(admin, tenant, thread)
        create_message(
            admin, tenant, thread, direction="inbound", seq=1,
            content={"type": "audio", "text": None, "media_id": "wamid.a"},
        )

        draft = await responder(dsn)(a_job(tenant, thread.conversation_id))

        assert draft.content is not None and draft.content["text"] == "me escreve, por favor"
        (enabled,) = admin.execute(
            "select ai_enabled from public.whatsapp_cloud_conversations where id = %s",
            (mirror.conversation_id,),
        ).fetchone()
        assert enabled is not False

    async def test_the_store_media_line_reaches_the_block_but_never_the_chat_array(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """O marcador da loja é uma RUBRICA, não uma fala.

        No array de chat ele viraria uma mensagem `assistant` cujo conteúdo
        inteiro é `[A loja enviou uma imagem]` — uma rubrica entre colchetes
        apresentada ao modelo como fala anterior dele mesmo, que é a superfície
        de imitação mais forte que existe. Este repositório já pagou por esse
        modo de falha exato em 17/08: entregar o JSON cru ao prompt ensinou o
        modelo a IMITÁ-LO, e a resposta saiu crua no WhatsApp.

        O ganho fica inteiro no bloco CONVERSA, que é narração em terceira
        pessoa (`agent: [A loja enviou uma imagem]`) e não convida a imitar.
        """
        create_agent_version(admin, tenant, status="active")
        create_mission(admin, tenant, event_type="whatsapp.received", status="active")
        thread = create_thread(admin, tenant)
        create_message(
            admin, tenant, thread, direction="outbound", seq=1,
            content={"image": {"id": "wamid.out", "caption": None}},
        )
        create_message(admin, tenant, thread, direction="inbound", seq=1, text="é esse mesmo?")
        llm = ScriptedLlm(reply="É esse sim!")

        await responder(dsn, llm)(a_job(tenant, thread.conversation_id))

        system, *chat = llm.asked[0].messages
        assert "[A loja enviou uma imagem]" in system.content
        assert not any("[A loja enviou" in message.content for message in chat)
        # E o que o CLIENTE disse continua no array: o corte é da rubrica, não
        # do histórico.
        assert any(message.content == "é esse mesmo?" for message in chat)
