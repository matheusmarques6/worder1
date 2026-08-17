"""O que o responder carrega antes de gerar — e o que ele recusa carregar.

O responder real (S9) roda dentro da FASE 2, fora de qualquer transação longa:
cada leitura aqui é uma transação curta própria, com `SET LOCAL app.organization_id`
(a mesma disciplina das tools do S7). O que estes testes provam é o contrato
dessas leituras contra o banco real, com a credencial de produção.

Duas coisas valem mais que as outras:

  * **a versão ativa é o índice parcial do S2 (D6)** — não existe FK de cache em
    `tenants`, então "qual versão está rodando" é uma pergunta que só o banco
    responde, e uma conta sem versão ativa é uma conta que **não pode
    responder** (falha alta, nunca um agente improvisado);
  * **a janela de pendentes é `(last_processed_seq, target_seq]`** — nem tudo o
    que existe na conversa, nem só a última mensagem. É essa janela que o
    debounce coalesceu, e é ela que o think-gate (S4) mede.
"""

import uuid

import psycopg
import pytest

from agents_runtime.repository import agent as agent_repo
from tests.db.factories import create_agent_version, create_message, create_tenant, create_thread
from tests.support.database import as_worker


@pytest.fixture
def tenant(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    yield organization_id
    with admin.cursor() as cur:
        cur.execute("delete from public.organizations where id = %s", (organization_id,))


class TestTheActiveVersion:
    async def test_it_loads_the_version_that_is_active(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        create_agent_version(admin, tenant, status="draft", base_prompt="rascunho antigo")
        create_agent_version(
            admin,
            tenant,
            status="active",
            base_prompt="Você é o atendente da loja.",
            model="claude-sonnet-5",
        )

        async with as_worker(dsn, tenant) as conn:
            version = await agent_repo.load_active_version(conn, organization_id=tenant)

        assert version is not None
        assert version.base_prompt == "Você é o atendente da loja."
        # D1: o modelo é config do tenant e viaja como string até a porta do LLM.
        assert version.config.model == "claude-sonnet-5"

    async def test_a_tenant_without_an_active_version_cannot_answer(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """Só rascunho é conta que ninguém aprovou. Improvisar um prompt aqui
        seria responder ao cliente com algo que nenhum gate de ativação viu."""
        create_agent_version(admin, tenant, status="draft")

        async with as_worker(dsn, tenant) as conn:
            assert await agent_repo.load_active_version(conn, organization_id=tenant) is None

    async def test_it_never_loads_the_version_of_another_tenant(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        stranger = create_tenant(admin)
        try:
            create_agent_version(admin, stranger, status="active", base_prompt="prompt alheio")

            async with as_worker(dsn, tenant) as conn:
                assert await agent_repo.load_active_version(conn, organization_id=tenant) is None
        finally:
            with admin.cursor() as cur:
                cur.execute("delete from public.organizations where id = %s", (stranger,))


class TestTheTenantPolicy:
    async def test_the_policy_defaults_are_pinned(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """FORK: organizations não tem os knobs do motor; os defaults ficam
        pinados no loader (pt-BR, never_say_ai True) até a config por agente
        assumir de vez (FORK.md)."""
        async with as_worker(dsn, tenant) as conn:
            policy = await agent_repo.load_tenant_policy(conn, organization_id=tenant)

        assert policy.primary_language == "pt-BR"
        assert policy.never_say_ai is True
        assert policy.shadow_until is None


class TestTheConversation:
    async def test_it_loads_the_canonical_shape(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        thread = create_thread(admin, tenant)
        with admin.cursor() as cur:
            cur.execute(
                "update public.contacts set first_name = 'Ana' where id = %s",
                (thread.contact_id,),
            )

        async with as_worker(dsn, tenant) as conn:
            view = await agent_repo.load_conversation_view(
                conn, conversation_id=thread.conversation_id
            )

        assert view is not None
        assert view.status == "open"
        assert view.last_channel == "whatsapp"
        assert view.owner_mission_version_id is None
        assert view.contact_id == thread.contact_id
        assert view.contact_name == "Ana"
        assert view.last_processed_seq == 0

    async def test_a_conversation_of_another_tenant_is_simply_not_there(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        stranger = create_tenant(admin)
        try:
            theirs = create_thread(admin, stranger)

            async with as_worker(dsn, tenant) as conn:
                view = await agent_repo.load_conversation_view(
                    conn, conversation_id=theirs.conversation_id
                )

            assert view is None
        finally:
            with admin.cursor() as cur:
                cur.execute("delete from public.organizations where id = %s", (stranger,))


class TestThePendingWindow:
    async def test_it_is_exactly_what_the_debounce_coalesced(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """Já respondidas ficam de fora (não se responde duas vezes), e o que
        chegou DEPOIS do alvo também (aquilo é da próxima geração — responder
        agora seria a resposta constrangedora que o ADR-6 existe para impedir)."""
        thread = create_thread(admin, tenant)
        for seq, text in enumerate(["ja respondida", "oi", "meu pedido", "chegou depois"], start=1):
            create_message(admin, tenant, thread, direction="inbound", seq=seq, text=text)
        with admin.cursor() as cur:
            cur.execute(
                "update public.conversations set last_processed_seq = 1 where id = %s",
                (thread.conversation_id,),
            )

        async with as_worker(dsn, tenant) as conn:
            pending = await agent_repo.load_pending_messages(
                conn, conversation_id=thread.conversation_id, after_seq=1, target_seq=3
            )

        assert [message.text for message in pending] == ["oi", "meu pedido"]
        assert {message.author for message in pending} == {"contact"}

    async def test_only_what_the_contact_said_is_pending(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """A janela é o que falta RESPONDER. O turno anterior do próprio agente
        é histórico, não pergunta — e contá-lo faria o think-gate achar que a
        conversa está mais movimentada do que está."""
        thread = create_thread(admin, tenant)
        create_message(admin, tenant, thread, direction="inbound", seq=1, text="oi")
        create_message(admin, tenant, thread, direction="outbound", seq=1, text="olá!")

        async with as_worker(dsn, tenant) as conn:
            pending = await agent_repo.load_pending_messages(
                conn, conversation_id=thread.conversation_id, after_seq=0, target_seq=1
            )

        assert [(message.author, message.text) for message in pending] == [("contact", "oi")]


class TestTheTranscript:
    async def test_it_is_the_conversation_in_the_order_it_happened(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """As duas direções têm contadores SEPARADOS (`unique (conversation_id,
        direction, seq)`), então ordenar por `seq` embaralharia a conversa. O
        relógio do banco é quem sabe a ordem real."""
        thread = create_thread(admin, tenant)
        create_message(admin, tenant, thread, direction="inbound", seq=1, text="qual o frete?")
        create_message(admin, tenant, thread, direction="outbound", seq=1, text="R$ 20 para SP")
        create_message(admin, tenant, thread, direction="inbound", seq=2, text="e para o RJ?")

        async with as_worker(dsn, tenant) as conn:
            transcript = await agent_repo.load_recent_transcript(
                conn, conversation_id=thread.conversation_id, limit=10
            )

        assert [(message.author, message.text) for message in transcript] == [
            ("contact", "qual o frete?"),
            ("agent", "R$ 20 para SP"),
            ("contact", "e para o RJ?"),
        ]

    async def test_it_is_bounded_and_keeps_the_most_recent(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        """Conversa de meses não cabe num prompt, e a parte que importa para a
        próxima resposta é o fim dela."""
        thread = create_thread(admin, tenant)
        for seq in range(1, 6):
            create_message(admin, tenant, thread, direction="inbound", seq=seq, text=f"m{seq}")

        async with as_worker(dsn, tenant) as conn:
            transcript = await agent_repo.load_recent_transcript(
                conn, conversation_id=thread.conversation_id, limit=2
            )

        assert [message.text for message in transcript] == ["m4", "m5"]


class TestLegacyShapedHistory:
    """O backfill copiou o formato Meta ({"text": {"body": …}}) e o extrator
    entregava o JSON cru ao prompt — o modelo IMITOU o envelope e a resposta
    saiu crua no WhatsApp (visto ao vivo em 17/08). O extrator entende os dois
    formatos: objeto vira o body; string segue string."""

    def _legacy_row(
        self,
        admin: psycopg.Connection,
        tenant: uuid.UUID,
        thread,
        *,
        direction: str,
        body: str,
    ) -> None:
        admin.execute(
            """
            insert into public.messages
                (organization_id, conversation_id, direction, seq, channel,
                 author_type, content)
            values (%s, %s, %s, 1, 'whatsapp',
                    case when %s = 'inbound' then 'contact' else 'agent' end,
                    jsonb_build_object('text', jsonb_build_object('body', %s::text)))
            """,
            (tenant, thread.conversation_id, direction, direction, body),
        )

    async def test_the_transcript_flattens_the_meta_shape(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        thread = create_thread(admin, tenant)
        self._legacy_row(admin, tenant, thread, direction="outbound", body="Bom dia, tudo bem?")
        create_message(admin, tenant, thread, direction="inbound", seq=1, text="boa tarde")

        async with as_worker(dsn, tenant) as conn:
            transcript = await agent_repo.load_recent_transcript(
                conn, conversation_id=thread.conversation_id
            )

        assert [message.text for message in transcript] == ["Bom dia, tudo bem?", "boa tarde"]

    async def test_the_pending_window_flattens_too(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        thread = create_thread(admin, tenant)
        self._legacy_row(admin, tenant, thread, direction="inbound", body="qual o horário?")

        async with as_worker(dsn, tenant) as conn:
            pending = await agent_repo.load_pending_messages(
                conn, conversation_id=thread.conversation_id, after_seq=0, target_seq=1
            )

        assert [message.text for message in pending] == ["qual o horário?"]
