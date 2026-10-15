"""Quem atende, lido do banco (alteração 2026-10-15-09, plano IA M2 passo 14).

As consultas por trás de `choose_agent`: a entrada do número
(`ai_agent_entries`), a conversa já atendida (`conversations.agent_id`), o
único ativo (modelo antigo), a missão filtrada pelo agente e a gravação de
quem respondeu — tudo com a credencial do worker, sob RLS.
"""

import uuid

import psycopg
import pytest

from agents_runtime.repository import agent as agent_repo
from agents_runtime.repository import missions as missions_repo
from tests.db.factories import (
    create_agent,
    create_agent_entry,
    create_agent_version,
    create_mission,
    create_tenant,
    create_thread,
)
from tests.support.database import as_worker


@pytest.fixture
def tenant(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    yield organization_id
    with admin.cursor() as cur:
        cur.execute("delete from public.organizations where id = %s", (organization_id,))


def _active_agent(admin, tenant, *, prompt: str) -> uuid.UUID:
    agent = create_agent(admin, tenant, status="active", base_prompt=prompt)
    create_agent_version(admin, tenant, status="active", base_prompt=prompt, agent_id=agent)
    return agent


class TestResolveForTurn:
    async def test_a_single_active_agent_answers_without_entries(
        self, dsn, admin, tenant
    ) -> None:
        agent = _active_agent(admin, tenant, prompt="Único.")
        thread = create_thread(admin, tenant)

        async with as_worker(dsn, tenant) as conn:
            got = await agent_repo.resolve_agent_for_turn(
                conn, organization_id=tenant, conversation_agent_id=None,
                channel_account_id=thread.channel_account_id,
            )
        assert got.reason == "single_active" and got.version.agent_id == agent

    async def test_the_entry_of_the_number_picks_among_several(
        self, dsn, admin, tenant
    ) -> None:
        sales = _active_agent(admin, tenant, prompt="Vendas.")
        _active_agent(admin, tenant, prompt="Suporte.")
        thread = create_thread(admin, tenant)
        create_agent_entry(admin, tenant, sales, ref_id=thread.channel_account_id)

        async with as_worker(dsn, tenant) as conn:
            got = await agent_repo.resolve_agent_for_turn(
                conn, organization_id=tenant, conversation_agent_id=None,
                channel_account_id=thread.channel_account_id,
            )
        assert got.reason == "entry" and got.version.agent_id == sales

    async def test_several_actives_and_no_entry_is_ambiguous(self, dsn, admin, tenant) -> None:
        _active_agent(admin, tenant, prompt="Vendas.")
        _active_agent(admin, tenant, prompt="Suporte.")
        thread = create_thread(admin, tenant)

        async with as_worker(dsn, tenant) as conn:
            got = await agent_repo.resolve_agent_for_turn(
                conn, organization_id=tenant, conversation_agent_id=None,
                channel_account_id=thread.channel_account_id,
            )
        assert got.reason == "ambiguous" and got.version is None

    async def test_the_conversation_agent_wins_over_the_entry(self, dsn, admin, tenant) -> None:
        sales = _active_agent(admin, tenant, prompt="Vendas.")
        support = _active_agent(admin, tenant, prompt="Suporte.")
        thread = create_thread(admin, tenant)
        create_agent_entry(admin, tenant, sales, ref_id=thread.channel_account_id)

        async with as_worker(dsn, tenant) as conn:
            assert await agent_repo.assign_conversation_agent(
                conn, conversation_id=thread.conversation_id, agent_id=support
            )
            state = await agent_repo.load_conversation_view(
                conn, conversation_id=thread.conversation_id
            )
            got = await agent_repo.resolve_agent_for_turn(
                conn, organization_id=tenant, conversation_agent_id=state.agent_id,
                channel_account_id=thread.channel_account_id,
            )
        assert state.agent_id == support
        assert got.reason == "conversation" and got.version.agent_id == support

    async def test_a_paused_conversation_agent_falls_back_to_the_entry(
        self, dsn, admin, tenant
    ) -> None:
        sales = _active_agent(admin, tenant, prompt="Vendas.")
        support = _active_agent(admin, tenant, prompt="Suporte.")
        thread = create_thread(admin, tenant)
        create_agent_entry(admin, tenant, sales, ref_id=thread.channel_account_id)
        admin.execute("update public.ai_agents set status = 'paused' where id = %s", (support,))

        async with as_worker(dsn, tenant) as conn:
            got = await agent_repo.resolve_agent_for_turn(
                conn, organization_id=tenant, conversation_agent_id=support,
                channel_account_id=thread.channel_account_id,
            )
        assert got.reason == "entry" and got.version.agent_id == sales

    async def test_the_entry_of_another_tenant_is_not_seen(self, dsn, admin, tenant) -> None:
        other = create_tenant(admin)
        try:
            _active_agent(admin, tenant, prompt="A.")
            _active_agent(admin, tenant, prompt="B.")
            thread = create_thread(admin, tenant)
            foreign = create_agent(admin, other, status="active")
            # Mesmo ref_id numa org alheia: a RLS do worker nem a enxerga.
            admin.execute(
                "insert into public.ai_agent_entries (organization_id, agent_id, kind, ref_id)"
                " values (%s, %s, 'whatsapp_account', %s)",
                (other, foreign, thread.channel_account_id),
            )
            async with as_worker(dsn, tenant) as conn:
                got = await agent_repo.resolve_agent_for_turn(
                    conn, organization_id=tenant, conversation_agent_id=None,
                    channel_account_id=thread.channel_account_id,
                )
            assert got.reason == "ambiguous"
        finally:
            admin.execute("delete from public.organizations where id = %s", (other,))


class TestResolveForMission:
    async def test_the_mission_owner_speaks(self, dsn, admin, tenant) -> None:
        sales = _active_agent(admin, tenant, prompt="Vendas.")
        support = _active_agent(admin, tenant, prompt="Suporte.")
        create_mission(admin, tenant, event_type="order.fulfilled", status="active",
                       agent_id=support)

        async with as_worker(dsn, tenant) as conn:
            mission = await missions_repo.load_active_mission(conn, event_type="order.fulfilled")
            got = await agent_repo.resolve_agent_for_mission(
                conn, organization_id=tenant, mission_agent_id=uuid.UUID(mission.agent_id)
            )
        assert got.version.agent_id == support and got.version.agent_id != sales


class TestMissionsByAgent:
    async def test_another_agents_mission_is_not_mine(self, dsn, admin, tenant) -> None:
        sales = _active_agent(admin, tenant, prompt="Vendas.")
        support = _active_agent(admin, tenant, prompt="Suporte.")
        create_mission(admin, tenant, event_type="cart.abandoned", status="active", agent_id=sales)

        async with as_worker(dsn, tenant) as conn:
            mine = await missions_repo.load_active_mission(
                conn, event_type="cart.abandoned", agent_id=sales
            )
            theirs = await missions_repo.load_active_mission(
                conn, event_type="cart.abandoned", agent_id=support
            )
            anyone = await missions_repo.load_active_mission(conn, event_type="cart.abandoned")
        assert mine is not None and mine.agent_id == str(sales)
        assert theirs is None
        assert anyone is not None

    async def test_an_ownerless_mission_serves_every_agent(self, dsn, admin, tenant) -> None:
        sales = _active_agent(admin, tenant, prompt="Vendas.")
        create_mission(admin, tenant, event_type="cart.abandoned", status="active")

        async with as_worker(dsn, tenant) as conn:
            mine = await missions_repo.load_active_mission(
                conn, event_type="cart.abandoned", agent_id=sales
            )
        assert mine is not None and mine.agent_id is None


class TestAssign:
    async def test_assigning_is_idempotent_and_can_reset_the_owner(
        self, dsn, admin, tenant
    ) -> None:
        sales = _active_agent(admin, tenant, prompt="Vendas.")
        support = _active_agent(admin, tenant, prompt="Suporte.")
        thread = create_thread(admin, tenant)
        mission = create_mission(admin, tenant, event_type="cart.abandoned", status="active",
                                 agent_id=sales)
        admin.execute(
            "update public.conversations set owner_mission_version_id = %s where id = %s",
            (mission, thread.conversation_id),
        )

        async with as_worker(dsn, tenant) as conn:
            assert await agent_repo.assign_conversation_agent(
                conn, conversation_id=thread.conversation_id, agent_id=sales
            )
            assert not await agent_repo.assign_conversation_agent(
                conn, conversation_id=thread.conversation_id, agent_id=sales
            )
            assert await agent_repo.assign_conversation_agent(
                conn, conversation_id=thread.conversation_id, agent_id=support,
                reset_owner_mission=True,
            )
        row = admin.execute(
            "select agent_id, owner_mission_version_id from public.conversations where id = %s",
            (thread.conversation_id,),
        ).fetchone()
        assert row == (support, None)
