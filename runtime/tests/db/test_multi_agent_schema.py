"""Modelo multiagente (20261016000008, plano IA M2 passo 13).

Vários agentes por loja, cada um com as suas entradas (número de WhatsApp,
toque de fluxo) e as suas missões. O que o schema em si tem de garantir:
`status` é a fonte e `is_active` o espelho (nas duas direções, por um
release); dois agentes ativos na mesma org passam a ser permitidos; uma
entrada ativa por (org, kind, ref); missão e conversa carregam `agent_id`;
a trilha `ai_runtime_activity` expõe o agente; o seed por agente é
idempotente por (org, agente, família).
"""

import psycopg
import pytest

from tests.db.conftest import as_authenticated_user
from tests.db.factories import (
    create_agent,
    create_agent_entry,
    create_channel_account,
    create_mission,
    create_thread,
)


def _agent_state(conn: psycopg.Connection, agent_id) -> tuple[str, bool]:
    return conn.execute(
        "select status, is_active from public.ai_agents where id = %s", (agent_id,)
    ).fetchone()


class TestStatusMirrorsIsActive:
    def test_an_agent_born_without_status_is_a_draft(self, admin, two_tenants) -> None:
        agent = create_agent(admin, two_tenants.a.id)
        assert _agent_state(admin, agent) == ("draft", False)

    def test_the_old_is_active_true_still_means_active(self, admin, two_tenants) -> None:
        agent = create_agent(admin, two_tenants.a.id, is_active=True)
        assert _agent_state(admin, agent) == ("active", True)

    def test_status_wins_on_insert(self, admin, two_tenants) -> None:
        agent = create_agent(admin, two_tenants.a.id, is_active=True, status="paused")
        assert _agent_state(admin, agent) == ("paused", False)

    def test_writing_status_moves_is_active(self, admin, two_tenants) -> None:
        agent = create_agent(admin, two_tenants.a.id, status="active")
        admin.execute("update public.ai_agents set status = 'paused' where id = %s", (agent,))
        assert _agent_state(admin, agent) == ("paused", False)

    def test_writing_is_active_moves_status(self, admin, two_tenants) -> None:
        agent = create_agent(admin, two_tenants.a.id)
        admin.execute("update public.ai_agents set is_active = true where id = %s", (agent,))
        assert _agent_state(admin, agent) == ("active", True)
        admin.execute("update public.ai_agents set is_active = false where id = %s", (agent,))
        assert _agent_state(admin, agent) == ("paused", False)

    def test_status_outside_the_vocabulary_is_refused(self, admin, two_tenants) -> None:
        with pytest.raises(psycopg.errors.CheckViolation):
            create_agent(admin, two_tenants.a.id, status="archived")


class TestSeveralActiveAgentsPerOrg:
    def test_two_active_agents_in_the_same_org_are_allowed(self, admin, two_tenants) -> None:
        create_agent(admin, two_tenants.a.id, status="active", role="Vendas")
        create_agent(admin, two_tenants.a.id, status="active", role="Pós-compra")
        (n,) = admin.execute(
            "select count(*) from public.ai_agents"
            " where organization_id = %s and status = 'active'",
            (two_tenants.a.id,),
        ).fetchone()
        assert n == 2


class TestEntries:
    def test_one_active_entry_per_number(self, admin, two_tenants) -> None:
        org = two_tenants.a.id
        account = create_channel_account(admin, org)
        first = create_agent(admin, org, status="active")
        second = create_agent(admin, org, status="active")
        create_agent_entry(admin, org, first, ref_id=account.id)

        with pytest.raises(psycopg.errors.UniqueViolation):
            create_agent_entry(admin, org, second, ref_id=account.id)

    def test_an_inactive_entry_frees_the_number(self, admin, two_tenants) -> None:
        org = two_tenants.a.id
        account = create_channel_account(admin, org)
        first = create_agent(admin, org, status="active")
        second = create_agent(admin, org, status="active")
        create_agent_entry(admin, org, first, ref_id=account.id, active=False)
        create_agent_entry(admin, org, second, ref_id=account.id)

    def test_the_kind_vocabulary_is_closed(self, admin, two_tenants) -> None:
        org = two_tenants.a.id
        account = create_channel_account(admin, org)
        agent = create_agent(admin, org)
        with pytest.raises(psycopg.errors.CheckViolation):
            create_agent_entry(admin, org, agent, kind="email", ref_id=account.id)

    def test_deleting_the_agent_takes_its_entries(self, admin, two_tenants) -> None:
        org = two_tenants.a.id
        account = create_channel_account(admin, org)
        agent = create_agent(admin, org)
        create_agent_entry(admin, org, agent, ref_id=account.id)
        admin.execute("delete from public.ai_agents where id = %s", (agent,))
        (n,) = admin.execute(
            "select count(*) from public.ai_agent_entries where agent_id = %s", (agent,)
        ).fetchone()
        assert n == 0

    def test_a_member_only_sees_entries_of_their_org(self, admin, two_tenants, dsn) -> None:
        account_a = create_channel_account(admin, two_tenants.a.id)
        account_b = create_channel_account(admin, two_tenants.b.id)
        agent_a = create_agent(admin, two_tenants.a.id)
        agent_b = create_agent(admin, two_tenants.b.id)
        create_agent_entry(admin, two_tenants.a.id, agent_a, ref_id=account_a.id)
        create_agent_entry(admin, two_tenants.b.id, agent_b, ref_id=account_b.id)
        admin.commit()

        with as_authenticated_user(dsn, two_tenants.a.user_id) as conn:
            rows = conn.execute("select agent_id from public.ai_agent_entries").fetchall()
        assert [r[0] for r in rows] == [agent_a]


class TestMissionsBelongToAnAgent:
    def test_a_mission_carries_its_agent(self, admin, two_tenants) -> None:
        org = two_tenants.a.id
        agent = create_agent(admin, org, status="active")
        mission = create_mission(admin, org, agent_id=agent)
        (owner,) = admin.execute(
            "select agent_id from public.ai_missions where id = %s", (mission,)
        ).fetchone()
        assert owner == agent

    def test_the_one_active_per_family_slot_is_still_per_org(self, admin, two_tenants) -> None:
        # Dois agentes da mesma org ainda não podem ter, cada um, uma missão
        # ativa da mesma família — o resolver por agente chega no passo 14,
        # e até lá o índice antigo é o que mantém a arbitragem determinística.
        org = two_tenants.a.id
        first = create_agent(admin, org, status="active")
        second = create_agent(admin, org, status="active")
        create_mission(admin, org, event_type="cart.abandoned", status="active", agent_id=first)
        with pytest.raises(psycopg.errors.UniqueViolation):
            create_mission(
                admin, org, event_type="cart.abandoned", status="active", agent_id=second
            )

    def test_a_mission_of_another_orgs_agent_is_refused_by_seed(
        self, admin, two_tenants
    ) -> None:
        agent_b = create_agent(admin, two_tenants.b.id)
        with pytest.raises(psycopg.errors.RaiseException):
            admin.execute(
                "select public.seed_default_missions(%s, %s)", (two_tenants.a.id, agent_b)
            )


class TestSeedPerAgent:
    def test_each_agent_gets_its_own_seeds_once(self, admin, two_tenants) -> None:
        org = two_tenants.a.id
        first = create_agent(admin, org, status="active")
        second = create_agent(admin, org)

        (n1,) = admin.execute(
            "select public.seed_default_missions(%s, %s)", (org, first)
        ).fetchone()
        (again,) = admin.execute(
            "select public.seed_default_missions(%s, %s)", (org, first)
        ).fetchone()
        (n2,) = admin.execute(
            "select public.seed_default_missions(%s, %s)", (org, second)
        ).fetchone()

        assert n1 == 6 and again == 0 and n2 == 6
        owners = admin.execute(
            "select agent_id, count(*) from public.ai_missions where organization_id = %s"
            " group by agent_id order by count(*)",
            (org,),
        ).fetchall()
        assert sorted(o for o, _ in owners) == sorted([first, second])

    def test_the_one_argument_seed_picks_the_active_agent(self, admin, two_tenants) -> None:
        org = two_tenants.a.id
        create_agent(admin, org)
        active = create_agent(admin, org, status="active")
        admin.execute("select public.seed_default_missions(%s)", (org,))
        owners = admin.execute(
            "select distinct agent_id from public.ai_missions where organization_id = %s",
            (org,),
        ).fetchall()
        assert owners == [(active,)]


class TestConversationsAndActivity:
    def test_the_activity_view_shows_the_agent(self, admin, two_tenants) -> None:
        org = two_tenants.a.id
        agent = create_agent(admin, org, status="active", role="Vendas")
        thread = create_thread(admin, org)
        admin.execute(
            "update public.conversations set agent_id = %s where id = %s",
            (agent, thread.conversation_id),
        )
        row = admin.execute(
            "select agent_id, agent_name from public.ai_runtime_activity"
            " where conversation_id = %s",
            (thread.conversation_id,),
        ).fetchone()
        assert row[0] == agent and row[1]

    def test_deleting_the_agent_keeps_the_conversation(self, admin, two_tenants) -> None:
        org = two_tenants.a.id
        agent = create_agent(admin, org, status="active")
        thread = create_thread(admin, org)
        admin.execute(
            "update public.conversations set agent_id = %s where id = %s",
            (agent, thread.conversation_id),
        )
        admin.execute("delete from public.ai_agents where id = %s", (agent,))
        (owner,) = admin.execute(
            "select agent_id from public.conversations where id = %s",
            (thread.conversation_id,),
        ).fetchone()
        assert owner is None
