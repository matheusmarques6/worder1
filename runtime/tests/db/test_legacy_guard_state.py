"""A ponte canônica → espelho legado que alimenta os guards do item 30.

A decisão dos guards é pura e mora em `agent_core/guards.py`, provada em
`tests/unit/test_behavior_guards.py`. O que SÓ o banco prova é o caminho até o
dado: `public.conversations` → `channel_identities` → `whatsapp_cloud_*`, dois
saltos sem FK nenhuma entre eles. Um join errado aqui não quebra nada — devolve
estado zerado, e todo guard passa a deixar passar em silêncio. É exatamente a
falha que este arquivo existe para pegar.

Também é aqui que o escopo por org se prova: as tabelas legadas estão com RLS
DESLIGADA, então quem escopa é a própria função (por isso ela é SECURITY
DEFINER e recebe `p_organization_id`).
"""

import uuid

import psycopg
import pytest

from agents_runtime.repository import agent as agent_repo
from tests.db.conftest import TwoTenants
from tests.db.factories import (
    contact_phone,
    create_cloud_mirror,
    create_thread,
)

pytestmark = pytest.mark.db


def link_whatsapp_identity(
    conn: psycopg.Connection, organization_id: uuid.UUID, contact_id: uuid.UUID, phone: str
) -> None:
    """O que o `ingest_inbound_message` grava no vivo — e o primeiro salto do join."""
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.channel_identities
                (organization_id, contact_id, channel, external_id)
            values (%s, %s, 'whatsapp', %s)
            on conflict do nothing
            """,
            (organization_id, contact_id, phone),
        )


def mirror_message(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    mirror,
    *,
    sent_by_bot: bool = False,
    sender: str = "ai",
    seconds_ago: int = 0,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.whatsapp_cloud_messages
                (organization_id, waba_id, conversation_id, message_id, direction,
                 message_type, text_body, sent_by_bot, sender, "timestamp")
            values (%s, %s, %s, %s, 'outbound', 'text', 'oi', %s, %s,
                    now() - make_interval(secs => %s))
            """,
            (
                organization_id,
                mirror.waba_id,
                mirror.conversation_id,
                f"wamid-{uuid.uuid4().hex[:12]}",
                sent_by_bot,
                sender,
                seconds_ago,
            ),
        )


@pytest.fixture
def wired(admin: psycopg.Connection, two_tenants: TwoTenants):
    """Conversa canônica com identidade WhatsApp e espelho legado — o vivo."""
    organization_id = two_tenants.a.id
    thread = create_thread(admin, organization_id)
    phone = contact_phone(admin, thread.contact_id)
    link_whatsapp_identity(admin, organization_id, thread.contact_id, phone)
    mirror = create_cloud_mirror(admin, organization_id, thread.channel_account_id, phone)
    admin.commit()
    return organization_id, thread, mirror


async def read(dsn: str, organization_id: uuid.UUID, conversation_id: uuid.UUID):
    async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
        await conn.execute("set role worker_role")
        return await agent_repo.load_legacy_guard_state(
            conn, organization_id=organization_id, conversation_id=conversation_id
        )


class TestTheBridgeToTheMirror:
    async def test_it_finds_the_mirror_row_through_the_identity(
        self, dsn: str, admin: psycopg.Connection, wired
    ) -> None:
        organization_id, thread, mirror = wired
        agent_id = uuid.uuid4()
        with admin.cursor() as cur:
            cur.execute(
                """
                update public.whatsapp_cloud_conversations
                   set ai_agent_id = %s, ai_transferred_at = now()
                 where id = %s
                """,
                (agent_id, mirror.conversation_id),
            )
        admin.commit()

        state = await read(dsn, organization_id, thread.conversation_id)

        assert state.ai_agent_id == agent_id
        assert state.ai_transferred_at is not None

    async def test_the_bot_turned_off_travels_to_the_guards(
        self, dsn: str, admin: psycopg.Connection, wired
    ) -> None:
        """`ai_enabled = false` é o freio da transferência e do botão do inbox;
        se ele não chegar até aqui, o toque de missão desfaz a transferência."""
        organization_id, thread, mirror = wired
        with admin.cursor() as cur:
            cur.execute(
                "update public.whatsapp_cloud_conversations set ai_enabled = false"
                " where id = %s",
                (mirror.conversation_id,),
            )
        admin.commit()

        state = await read(dsn, organization_id, thread.conversation_id)

        assert state.ai_enabled is False

    async def test_it_counts_only_the_bot_messages_of_this_conversation(
        self, dsn: str, admin: psycopg.Connection, wired
    ) -> None:
        organization_id, thread, mirror = wired
        mirror_message(admin, organization_id, mirror, sent_by_bot=True, seconds_ago=90)
        mirror_message(admin, organization_id, mirror, sent_by_bot=True, seconds_ago=10)
        mirror_message(admin, organization_id, mirror, sent_by_bot=False, sender="human")
        admin.commit()

        state = await read(dsn, organization_id, thread.conversation_id)

        assert state.bot_message_count == 2
        assert state.last_bot_message_at is not None
        assert state.has_human_reply is True

    async def test_without_a_human_message_the_flag_is_false(
        self, dsn: str, admin: psycopg.Connection, wired
    ) -> None:
        organization_id, thread, mirror = wired
        mirror_message(admin, organization_id, mirror, sent_by_bot=True)
        admin.commit()

        state = await read(dsn, organization_id, thread.conversation_id)

        assert state.has_human_reply is False

    async def test_a_conversation_with_no_mirror_reads_as_untouched(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """Sem espelho não há default otimista inventado: ninguém transferiu,
        o bot não respondeu, nenhum humano falou."""
        organization_id = two_tenants.a.id
        thread = create_thread(admin, organization_id)
        admin.commit()

        state = await read(dsn, organization_id, thread.conversation_id)

        assert state.ai_enabled is True
        assert state.ai_agent_id is None
        assert state.ai_transferred_at is None
        assert state.bot_message_count == 0
        assert state.has_human_reply is False

    async def test_another_tenant_reads_nothing(
        self, dsn: str, admin: psycopg.Connection, wired, two_tenants: TwoTenants
    ) -> None:
        """RLS está desligada nas tabelas legadas — quem escopa é a função."""
        _, thread, mirror = wired
        mirror_message(admin, two_tenants.a.id, mirror, sent_by_bot=True)
        admin.commit()

        state = await read(dsn, two_tenants.b.id, thread.conversation_id)

        assert state.bot_message_count == 0
        assert state.ai_transferred_at is None


class TestTheHandoffWrite:
    async def test_it_disables_the_ai_and_marks_the_transfer(
        self, dsn: str, admin: psycopg.Connection, wired
    ) -> None:
        organization_id, thread, mirror = wired

        async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
            await conn.execute("set role worker_role")
            marked = await agent_repo.mark_ai_handoff(
                conn,
                organization_id=organization_id,
                conversation_id=thread.conversation_id,
                reason="handoff_keyword",
            )

        assert marked is True
        with admin.cursor() as cur:
            cur.execute(
                """
                select ai_enabled, ai_disabled_reason, ai_transferred_at
                  from public.whatsapp_cloud_conversations where id = %s
                """,
                (mirror.conversation_id,),
            )
            enabled, reason, transferred_at = cur.fetchone()

        # ai_enabled = false é o freio que o webhook já respeita para org
        # migrada: a transferência vale para os turnos SEGUINTES, não só este.
        assert enabled is False
        assert reason == "handoff_keyword"
        assert transferred_at is not None

    async def test_another_tenant_cannot_disable_this_conversation(
        self, dsn: str, admin: psycopg.Connection, wired, two_tenants: TwoTenants
    ) -> None:
        _, thread, mirror = wired

        async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
            await conn.execute("set role worker_role")
            marked = await agent_repo.mark_ai_handoff(
                conn,
                organization_id=two_tenants.b.id,
                conversation_id=thread.conversation_id,
                reason="handoff_keyword",
            )

        assert marked is False
        with admin.cursor() as cur:
            cur.execute(
                "select ai_enabled from public.whatsapp_cloud_conversations where id = %s",
                (mirror.conversation_id,),
            )
            (enabled,) = cur.fetchone()
        assert enabled is True
