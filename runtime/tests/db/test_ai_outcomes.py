"""Desfechos, eventos e atribuição de pedido (20261016000013, plano IA M5 passo 27)."""

import uuid

import psycopg
import pytest

from tests.db.factories import create_agent, create_tenant, create_thread


@pytest.fixture
def tenant(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    yield organization_id
    with admin.cursor() as cur:
        cur.execute("delete from public.organizations where id = %s", (organization_id,))


def _attribute(admin, org, contact, order="1001", value=199.9, days=7):
    (conv,) = admin.execute(
        "select public.attribute_ai_conversation(%s, %s, %s, %s, %s)",
        (org, contact, order, value, days),
    ).fetchone()
    return conv


class TestAttribution:
    def test_the_order_credits_the_agents_conversation_once(self, admin, tenant) -> None:
        agent = create_agent(admin, tenant, status="active")
        thread = create_thread(admin, tenant)
        admin.execute(
            "update public.conversations set agent_id = %s where id = %s",
            (agent, thread.conversation_id),
        )
        assert _attribute(admin, tenant, thread.contact_id) == thread.conversation_id
        assert _attribute(admin, tenant, thread.contact_id) == thread.conversation_id

        row = admin.execute(
            "select agent_id, order_id, revenue from public.ai_conversation_outcomes"
            " where conversation_id = %s",
            (thread.conversation_id,),
        ).fetchone()
        assert row == (agent, "1001", pytest.approx(199.9))
        (sales,) = admin.execute(
            "select count(*) from public.ai_activity_events"
            " where organization_id = %s and kind = 'sale'",
            (tenant,),
        ).fetchone()
        assert sales == 1

    def test_a_conversation_without_agent_gets_nothing(self, admin, tenant) -> None:
        thread = create_thread(admin, tenant)
        assert _attribute(admin, tenant, thread.contact_id) is None

    def test_outside_the_window_gets_nothing(self, admin, tenant) -> None:
        agent = create_agent(admin, tenant, status="active")
        thread = create_thread(admin, tenant)
        admin.execute(
            "update public.conversations set agent_id = %s,"
            " last_inbound_at = now() - interval '30 days', created_at = now() - interval '30 days'"
            " where id = %s",
            (agent, thread.conversation_id),
        )
        assert _attribute(admin, tenant, thread.contact_id, days=7) is None


class TestVocabulary:
    def test_event_kind_is_closed(self, admin, tenant) -> None:
        with pytest.raises(psycopg.errors.CheckViolation):
            admin.execute(
                "insert into public.ai_activity_events (organization_id, kind)"
                " values (%s, 'party')",
                (tenant,),
            )


class TestClosing:
    def test_an_idle_conversation_closes_as_solved_unless_transferred(self, admin, tenant) -> None:
        agent = create_agent(admin, tenant, status="active")
        solved = create_thread(admin, tenant)
        handed = create_thread(admin, tenant)
        for thread, transferred in ((solved, False), (handed, True)):
            admin.execute(
                "update public.conversations set agent_id = %s,"
                " last_inbound_at = now() - interval '2 days' where id = %s",
                (agent, thread.conversation_id),
            )
            admin.execute(
                "insert into public.ai_conversation_outcomes"
                " (conversation_id, organization_id, agent_id, transferred, updated_at)"
                " values (%s, %s, %s, %s, now() - interval '2 days')",
                (thread.conversation_id, tenant, agent, transferred),
            )

        rows = admin.execute(
            "select conversation_id, transferred from public.close_idle_ai_conversations(24, 500)"
            " where organization_id = %s",
            (tenant,),
        ).fetchall()
        assert dict(rows) == {solved.conversation_id: False, handed.conversation_id: True}

        flags = dict(admin.execute(
            "select conversation_id, resolved_without_human from public.ai_conversation_outcomes"
            " where organization_id = %s",
            (tenant,),
        ).fetchall())
        assert flags == {solved.conversation_id: True, handed.conversation_id: False}
        (events,) = admin.execute(
            "select count(*) from public.ai_activity_events"
            " where organization_id = %s and kind = 'solved'",
            (tenant,),
        ).fetchone()
        assert events == 1
        # Já fechadas não fecham de novo.
        again = admin.execute(
            "select count(*) from public.close_idle_ai_conversations(24, 500)"
            " where organization_id = %s",
            (tenant,),
        ).fetchone()
        assert again == (0,)
