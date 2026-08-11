"""Decisão H — o preflight do sender e o espelho no inbox.

A regra vive em SQL (`internal.sender_preflight`) e o sender EXECUTA o
veredito: opt-out → janela 24h → fallback de template. Cada teste aqui fixa
um degrau da cascata, porque o dia em que a ordem trocar — template antes de
opt-out, por exemplo — uma mensagem sai para quem pediu para nunca mais
receber, e nenhum teste de unidade Python teria visto.

O espelho (`internal.mirror_outbound_to_inbox`) é o contrato com a UI velha:
o envio do runtime aparece em `whatsapp_cloud_messages` sem a UI saber que o
runtime existe. Dedup por wamid, e a ausência de conversa no espelho (toque
frio) é um `false` silencioso — nunca um erro que derrube o pass.
"""

import uuid
from contextlib import asynccontextmanager

import psycopg
import pytest

from agents_runtime.config import QueueingConfig
from agents_runtime.queueing.sender import sender_pass
from agents_runtime.randomness import SystemRandomness
from tests.db.conftest import TwoTenants, as_app_role
from tests.db.factories import (
    contact_phone,
    create_cloud_mirror,
    create_contact,
    create_opt_out,
    create_outbox_item,
    create_template_policy,
    create_thread,
    open_window,
    unique_id,
)
from tests.support.fake_channel import SCHEMA_SQL, FakeChannel


def preflight(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    phone: str,
    kind: str = "reply",
) -> tuple:
    return conn.execute(
        "select * from internal.sender_preflight(%s, %s, %s)",
        (organization_id, phone, kind),
    ).fetchone()


class TestPreflightCascade:
    def test_opt_out_wins_over_everything(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """Opt-out suprime até quem tem janela aberta E template aprovado."""
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        open_window(admin, thread.conversation_id)
        create_template_policy(admin, org)
        create_opt_out(admin, org, phone)

        with as_app_role(dsn, "sender_role", org) as sender:
            assert preflight(sender, org, phone) == ("opt_out", None, None)

    def test_opt_out_matches_across_plus_prefix(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """O app grava telefone sem '+'; a outbox carrega E.164. Mesmo contato."""
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        create_opt_out(admin, org, phone.lstrip("+"))

        with as_app_role(dsn, "sender_role", org) as sender:
            assert preflight(sender, org, phone)[0] == "opt_out"

    def test_open_window_is_ok(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        open_window(admin, thread.conversation_id, hours_ago=23)

        with as_app_role(dsn, "sender_role", org) as sender:
            assert preflight(sender, org, phone) == ("ok", None, None)

    def test_closed_window_suppresses_a_reply(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """25h depois do último inbound, resposta livre não sai — nem com template."""
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        open_window(admin, thread.conversation_id, hours_ago=25)
        create_template_policy(admin, org)

        with as_app_role(dsn, "sender_role", org) as sender:
            assert preflight(sender, org, phone, kind="reply")[0] == "window_closed"

    def test_never_heard_from_means_closed(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """Contato sem conversa nenhuma (toque frio) = janela fechada, não aberta."""
        org = two_tenants.a.id
        contact_id = create_contact(admin, org)
        phone = contact_phone(admin, contact_id)

        with as_app_role(dsn, "sender_role", org) as sender:
            assert preflight(sender, org, phone, kind="reply")[0] == "window_closed"

    def test_closed_window_funnel_touch_falls_to_template(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        open_window(admin, thread.conversation_id, hours_ago=25)
        create_template_policy(admin, org, template_name="volta_pra_loja", language="pt_BR")

        with as_app_role(dsn, "sender_role", org) as sender:
            assert preflight(sender, org, phone, kind="funnel_touch") == (
                "template",
                "volta_pra_loja",
                "pt_BR",
            )

    def test_paused_template_does_not_count(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        open_window(admin, thread.conversation_id, hours_ago=25)
        create_template_policy(admin, org, status="paused")

        with as_app_role(dsn, "sender_role", org) as sender:
            assert preflight(sender, org, phone, kind="funnel_touch")[0] == "no_template"

    def test_template_of_another_org_does_not_leak(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """A política é da org — o fallback jamais pega o template do vizinho."""
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        open_window(admin, thread.conversation_id, hours_ago=25)
        create_template_policy(admin, two_tenants.b.id)

        with as_app_role(dsn, "sender_role", org) as sender:
            assert preflight(sender, org, phone, kind="funnel_touch")[0] == "no_template"


class TestMirror:
    def mirror(
        self, conn: psycopg.Connection, org: uuid.UUID, phone: str, wamid: str, text: str
    ) -> bool:
        return conn.execute(
            "select internal.mirror_outbound_to_inbox(%s, %s, %s, %s)",
            (org, phone, wamid, text),
        ).fetchone()[0]

    def test_mirrors_into_cloud_messages_and_dedups_by_wamid(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        mirror = create_cloud_mirror(admin, org, thread.channel_account_id, phone)
        wamid = unique_id("wamid")

        with as_app_role(dsn, "sender_role", org) as sender:
            assert self.mirror(sender, org, phone, wamid, "chegou") is True
            assert self.mirror(sender, org, phone, wamid, "chegou") is True

        rows = admin.execute(
            """
            select direction, text_body, sent_by_bot, sender
              from public.whatsapp_cloud_messages where message_id = %s
            """,
            (wamid,),
        ).fetchall()
        assert rows == [("outbound", "chegou", True, "ai")]

        preview = admin.execute(
            """
            select last_message_preview, last_message_direction
              from public.whatsapp_cloud_conversations where id = %s
            """,
            (mirror.conversation_id,),
        ).fetchone()
        assert preview == ("chegou", "outbound")

    def test_no_mirror_conversation_is_a_quiet_false(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)

        with as_app_role(dsn, "sender_role", org) as sender:
            assert self.mirror(sender, org, phone, unique_id("wamid"), "oi") is False


@asynccontextmanager
async def as_sender(dsn: str):
    """A conexão do sender como em produção: autocommit + o papel de verdade."""
    async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
        await conn.execute("set role sender_role")
        yield conn


@pytest.fixture
def fake_channel(admin: psycopg.Connection, dsn: str) -> FakeChannel:
    admin.execute(SCHEMA_SQL)
    return FakeChannel(dsn)


def outbox_state(conn: psycopg.Connection, outbox_id: uuid.UUID) -> tuple:
    return conn.execute(
        "select status, last_error from internal.message_outbox where id = %s",
        (outbox_id,),
    ).fetchone()


class TestSenderPassExecutesTheVerdict:
    """O caminho inteiro: claim → preflight → canal → desfecho → espelho."""

    async def test_opt_out_row_dies_without_touching_the_channel(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id)
        create_opt_out(admin, org, contact_phone(admin, thread.contact_id))
        outbox_id = create_outbox_item(admin, org, thread)

        async with as_sender(dsn) as conn:
            await sender_pass(
                conn, fake_channel, config=QueueingConfig(), randomness=SystemRandomness()
            )

        assert outbox_state(admin, outbox_id) == ("failed", "preflight: opt_out")
        sends = admin.execute(
            "select count(*) from testing.fake_channel_sends where outbox_id = %s",
            (outbox_id,),
        ).fetchone()[0]
        assert sends == 0

    async def test_open_window_reply_is_sent_and_mirrored(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        open_window(admin, thread.conversation_id)
        mirror = create_cloud_mirror(admin, org, thread.channel_account_id, phone)
        outbox_id = create_outbox_item(admin, org, thread, text="tem sim, 3 cores")

        async with as_sender(dsn) as conn:
            await sender_pass(
                conn, fake_channel, config=QueueingConfig(), randomness=SystemRandomness()
            )

        status, wamid = admin.execute(
            "select status, provider_message_id from internal.message_outbox where id = %s",
            (outbox_id,),
        ).fetchone()
        assert status == "sent"

        mirrored = admin.execute(
            """
            select text_body from public.whatsapp_cloud_messages
             where conversation_id = %s and message_id = %s
            """,
            (mirror.conversation_id, wamid),
        ).fetchall()
        assert mirrored == [("tem sim, 3 cores",)]

    async def test_closed_window_funnel_touch_goes_out_as_template(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        """O texto livre da outbox NUNCA sai — o canal recebe só o template."""
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id, hours_ago=25)
        create_template_policy(admin, org, template_name="volta_pra_loja")
        outbox_id = create_outbox_item(
            admin, org, thread, kind="funnel_touch", text="texto que nao pode vazar"
        )

        async with as_sender(dsn) as conn:
            await sender_pass(
                conn, fake_channel, config=QueueingConfig(), randomness=SystemRandomness()
            )

        assert outbox_state(admin, outbox_id)[0] == "sent"
        (payload,) = admin.execute(
            "select payload from testing.fake_channel_sends where outbox_id = %s",
            (outbox_id,),
        ).fetchone()
        assert payload == {"template": {"name": "volta_pra_loja", "language": "pt_BR"}}

    async def test_closed_window_reply_never_reaches_the_channel(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id, hours_ago=25)
        create_template_policy(admin, org)
        outbox_id = create_outbox_item(admin, org, thread, kind="reply")

        async with as_sender(dsn) as conn:
            await sender_pass(
                conn, fake_channel, config=QueueingConfig(), randomness=SystemRandomness()
            )

        assert outbox_state(admin, outbox_id) == ("failed", "preflight: window_closed")
