"""Humanização no sender REAL (8.3): claim → preflight → bolhas → espelho.

O que só o caminho inteiro prova: as bolhas saem pelo canal com a MESMA
idempotency_key (uma linha de outbox, um envio lógico), o wamid da linha é o
da PRIMEIRA bolha (paridade com o legado), e o espelho ganha uma linha POR
bolha na ordem — com o preview da conversa terminando na última.

Delays desligados (config): teste de regra não mede ritmo.
"""

from contextlib import asynccontextmanager

import psycopg
import pytest

from agents_runtime.config import QueueingConfig
from agents_runtime.queueing.sender import sender_pass
from agents_runtime.randomness import SystemRandomness
from tests.db.conftest import TwoTenants
from tests.db.factories import (
    contact_phone,
    create_cloud_mirror,
    create_outbox_item,
    create_thread,
    open_window,
)
from tests.support.fake_channel import SCHEMA_SQL, FakeChannel

NO_DELAYS = QueueingConfig(humanize_delays=False)

THREE_PARAGRAPHS = (
    "Oi Joana! Vi que ficou um tênis no seu carrinho.\n\n"
    "Ele ainda está reservado, e o frete continua grátis.\n\n"
    "Quer que eu te mande o link para fechar?"
)


@asynccontextmanager
async def as_sender(dsn: str):
    async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
        await conn.execute("set role sender_role")
        yield conn


@pytest.fixture
def fake_channel(dsn: str, admin: psycopg.Connection) -> FakeChannel:
    admin.execute(SCHEMA_SQL)
    admin.execute("truncate testing.fake_channel_sends, testing.fake_channel_directives")
    return FakeChannel(dsn)


async def test_a_long_reply_leaves_as_bubbles_and_mirrors_each(
    dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel: FakeChannel
) -> None:
    org = two_tenants.a.id
    thread = create_thread(admin, org)
    phone = contact_phone(admin, thread.contact_id)
    open_window(admin, thread.conversation_id)
    create_cloud_mirror(admin, org, thread.channel_account_id, phone)
    outbox_id = create_outbox_item(admin, org, thread, text=THREE_PARAGRAPHS)

    async with as_sender(dsn) as conn:
        await sender_pass(conn, fake_channel, config=NO_DELAYS, randomness=SystemRandomness())

    sends = admin.execute(
        "select payload ->> 'text', idempotency_key from testing.fake_channel_sends"
        " where outbox_id = %s order by sent_at",
        (outbox_id,),
    ).fetchall()
    assert [row[0] for row in sends] == [
        "Oi Joana! Vi que ficou um tênis no seu carrinho.",
        "Ele ainda está reservado, e o frete continua grátis.",
        "Quer que eu te mande o link para fechar?",
    ]
    assert len({row[1] for row in sends}) == 1  # um envio lógico, uma chave

    status, wamid = admin.execute(
        "select status, provider_message_id from internal.message_outbox where id = %s",
        (outbox_id,),
    ).fetchone()
    assert status == "sent"
    assert wamid.endswith("-1")  # o wamid da linha é o da PRIMEIRA bolha

    mirrored = admin.execute(
        """
        select m.text_body from public.whatsapp_cloud_messages m
         where m.organization_id = %s and m.direction = 'outbound'
         order by m.created_at
        """,
        (org,),
    ).fetchall()
    assert [row[0] for row in mirrored] == [row[0] for row in sends]

    (preview,) = admin.execute(
        "select last_message_preview from public.whatsapp_cloud_conversations"
        " where organization_id = %s",
        (org,),
    ).fetchone()
    assert preview.startswith("Quer que eu te mande")  # a última bolha fecha


async def test_a_short_reply_stays_one_bubble(
    dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel: FakeChannel
) -> None:
    org = two_tenants.a.id
    thread = create_thread(admin, org)
    open_window(admin, thread.conversation_id)
    outbox_id = create_outbox_item(admin, org, thread, text="Tem sim! 3 cores.")

    async with as_sender(dsn) as conn:
        await sender_pass(conn, fake_channel, config=NO_DELAYS, randomness=SystemRandomness())

    (count,) = admin.execute(
        "select count(*) from testing.fake_channel_sends where outbox_id = %s",
        (outbox_id,),
    ).fetchone()
    assert count == 1


async def test_a_failing_first_bubble_takes_the_normal_retry_ladder(
    dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel: FakeChannel
) -> None:
    org = two_tenants.a.id
    thread = create_thread(admin, org)
    open_window(admin, thread.conversation_id)
    outbox_id = create_outbox_item(admin, org, thread, text=THREE_PARAGRAPHS)
    (key,) = admin.execute(
        "select idempotency_key from internal.message_outbox where id = %s", (outbox_id,)
    ).fetchone()
    admin.execute(
        "insert into testing.fake_channel_directives (idempotency_key, behavior)"
        " values (%s, 'fail_transient')",
        (key,),
    )

    async with as_sender(dsn) as conn:
        await sender_pass(conn, fake_channel, config=NO_DELAYS, randomness=SystemRandomness())

    status, error = admin.execute(
        "select status, last_error from internal.message_outbox where id = %s",
        (outbox_id,),
    ).fetchone()
    # 1ª bolha falhou = nada saiu = retry transitório normal (pending de novo).
    assert status == "pending"
    assert "503" in error
    (count,) = admin.execute(
        "select count(*) from testing.fake_channel_sends where outbox_id = %s",
        (outbox_id,),
    ).fetchone()
    assert count == 0
