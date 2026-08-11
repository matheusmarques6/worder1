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
    create_moment,
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
    moment_ids: list[uuid.UUID] | None = None,
) -> tuple:
    return conn.execute(
        "select * from internal.sender_preflight(%s, %s, %s, 'whatsapp', %s)",
        (organization_id, phone, kind, moment_ids or []),
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
                conn,
                fake_channel,
                config=QueueingConfig(humanize_delays=False),
                randomness=SystemRandomness(),
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
                conn,
                fake_channel,
                config=QueueingConfig(humanize_delays=False),
                randomness=SystemRandomness(),
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
                conn,
                fake_channel,
                config=QueueingConfig(humanize_delays=False),
                randomness=SystemRandomness(),
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
                conn,
                fake_channel,
                config=QueueingConfig(humanize_delays=False),
                randomness=SystemRandomness(),
            )

        assert outbox_state(admin, outbox_id) == ("failed", "preflight: window_closed")


READY = {"whatsapp": {"template_name": "toque_semana_cliente", "language": "pt_BR",
                      "status": "approved"}}


class TestMomentGate:
    """§3.3.4: vida re-checada a cada envio; template do MOMENTO, não da org."""

    def test_a_closed_window_moment_touch_uses_the_moments_template(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        open_window(admin, thread.conversation_id, hours_ago=25)
        # O default da org existe — e mesmo assim o template é o do momento.
        create_template_policy(admin, org, template_name="retorno_padrao")
        moment = create_moment(admin, org, template_readiness=READY)

        with as_app_role(dsn, "sender_role", org) as sender:
            verdict = preflight(sender, org, phone, kind="funnel_touch", moment_ids=[moment])
        assert verdict == ("template", "toque_semana_cliente", "pt_BR")

    def test_a_dead_moment_suppresses_even_with_the_window_open(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        open_window(admin, thread.conversation_id, hours_ago=1)
        moment = create_moment(admin, org, template_readiness=READY, killed=True)

        with as_app_role(dsn, "sender_role", org) as sender:
            verdict = preflight(sender, org, phone, kind="funnel_touch", moment_ids=[moment])
        assert verdict[0] == "moment_gone"

    def test_one_dead_moment_among_living_ones_still_suppresses(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        alive = create_moment(admin, org, template_readiness=READY)
        expired = create_moment(admin, org, starts_in_hours=-48, ends_in_hours=-24)

        with as_app_role(dsn, "sender_role", org) as sender:
            verdict = preflight(
                sender, org, phone, kind="funnel_touch", moment_ids=[alive, expired]
            )
        assert verdict[0] == "moment_gone"

    def test_missing_readiness_for_the_channel_is_not_ready(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        open_window(admin, thread.conversation_id, hours_ago=25)
        moment = create_moment(admin, org, template_readiness={})

        with as_app_role(dsn, "sender_role", org) as sender:
            verdict = preflight(sender, org, phone, kind="funnel_touch", moment_ids=[moment])
        assert verdict[0] == "moment_not_ready"

    def test_paused_readiness_is_not_ready_either(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        open_window(admin, thread.conversation_id, hours_ago=25)
        paused = {"whatsapp": {"template_name": "x", "language": "pt_BR", "status": "paused"}}
        moment = create_moment(admin, org, template_readiness=paused)

        with as_app_role(dsn, "sender_role", org) as sender:
            verdict = preflight(sender, org, phone, kind="funnel_touch", moment_ids=[moment])
        assert verdict[0] == "moment_not_ready"

    def test_living_moments_inside_the_window_are_free_text(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        open_window(admin, thread.conversation_id, hours_ago=1)
        moment = create_moment(admin, org, template_readiness=READY)

        with as_app_role(dsn, "sender_role", org) as sender:
            verdict = preflight(sender, org, phone, kind="funnel_touch", moment_ids=[moment])
        assert verdict[0] == "ok"


class TestMomentSuppressionAlerts:
    async def test_a_gone_moment_fails_the_row_and_alerts_the_merchant(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id, hours_ago=1)
        moment = create_moment(admin, org, template_readiness=READY, killed=True)
        outbox_id = create_outbox_item(
            admin, org, thread, kind="funnel_touch", moment_ids=[moment]
        )

        async with as_sender(dsn) as conn:
            await sender_pass(
                conn,
                fake_channel,
                config=QueueingConfig(humanize_delays=False),
                randomness=SystemRandomness(),
            )

        assert outbox_state(admin, outbox_id) == ("failed", "preflight: moment_gone")
        (alert,) = admin.execute(
            "select type, metadata ->> 'verdict' from public.alerts"
            " where organization_id = %s",
            (org,),
        ).fetchall()
        assert alert == ("moment_template_not_ready", "moment_gone")

    async def test_a_ready_moment_touch_goes_out_as_its_template(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id, hours_ago=25)
        moment = create_moment(admin, org, template_readiness=READY)
        outbox_id = create_outbox_item(
            admin, org, thread, kind="funnel_touch",
            text="texto livre que nao pode sair", moment_ids=[moment],
        )

        async with as_sender(dsn) as conn:
            await sender_pass(
                conn,
                fake_channel,
                config=QueueingConfig(humanize_delays=False),
                randomness=SystemRandomness(),
            )

        (payload,) = admin.execute(
            "select payload from testing.fake_channel_sends where outbox_id = %s",
            (outbox_id,),
        ).fetchone()
        assert payload["template"]["name"] == "toque_semana_cliente"
        assert "texto livre" not in str(payload)
