"""9.4 — a trilha única: as views de compatibilidade que a Atividade lê.

Um universo de trace só: a UI não toca `internal.*` — lê views em `public`
(dono postgres, semântica definer) que juntam conversations + missão + custo
+ judge. O acesso é do service_role via rota autenticada; os roles da Data
API (anon/authenticated) são explicitamente revogados — os defaults do
Supabase dariam SELECT a todos, e a trilha interna não é dado de cliente.
"""

from decimal import Decimal

import psycopg
import pytest

from tests.db.conftest import TwoTenants
from tests.db.factories import create_mission, create_thread


@pytest.fixture
def runtime_conversation(admin: psycopg.Connection, two_tenants: TwoTenants) -> dict:
    organization_id = two_tenants.a.id
    mission = create_mission(
        admin, organization_id, event_type="cart.abandoned", status="active"
    )
    thread = create_thread(admin, organization_id)
    admin.execute(
        "update public.conversations set owner_mission_version_id = %s where id = %s",
        (mission, thread.conversation_id),
    )
    admin.execute(
        """
        insert into internal.llm_calls
            (organization_id, purpose, conversation_id, provider, model,
             input_tokens, output_tokens, cost_usd)
        values
            (%(org)s, 'agent_reply', %(conv)s, 'openrouter', 'sonnet', 100, 40, 0.0010),
            (%(org)s, 'judge_pre',   %(conv)s, 'openrouter', 'haiku',  80,  10, 0.0005)
        """,
        {"org": organization_id, "conv": thread.conversation_id},
    )
    admin.execute(
        """
        insert into internal.tool_calls
            (organization_id, conversation_id, tool_name, input, output, success, latency_ms)
        values (%s, %s, 'create_coupon', '{}', '{"decision": "reused"}', true, 120)
        """,
        (organization_id, thread.conversation_id),
    )
    admin.execute(
        """
        insert into internal.judge_scores
            (organization_id, kind, conversation_id, judge_model, score, verdict)
        values (%s, 'pre_send', %s, 'judge-model', 0.90, 'pass')
        """,
        (organization_id, thread.conversation_id),
    )
    return {
        "organization_id": organization_id,
        "conversation_id": thread.conversation_id,
        "mission": mission,
    }


class TestTheActivityView:
    def test_a_runtime_conversation_shows_mission_cost_and_judge(
        self, admin: psycopg.Connection, runtime_conversation: dict
    ) -> None:
        row = admin.execute(
            """
            select organization_id, mission_version_id, mission_event_type,
                   llm_calls, cost_usd, tool_calls,
                   last_judge_verdict, last_judge_score
              from public.ai_runtime_activity
             where conversation_id = %s
            """,
            (runtime_conversation["conversation_id"],),
        ).fetchone()

        assert row is not None
        org, mission_version, event_type, llm_calls, cost, tools, verdict, score = row
        assert org == runtime_conversation["organization_id"]
        assert mission_version == runtime_conversation["mission"]
        assert event_type == "cart.abandoned"
        assert llm_calls == 2
        assert cost == Decimal("0.001500")
        assert tools == 1
        assert (verdict, score) == ("pass", Decimal("0.90"))

    def test_the_detail_views_expose_calls_and_tools(
        self, admin: psycopg.Connection, runtime_conversation: dict
    ) -> None:
        calls = admin.execute(
            "select purpose, cost_usd from public.ai_runtime_activity_calls"
            " where conversation_id = %s order by id",
            (runtime_conversation["conversation_id"],),
        ).fetchall()
        assert [c[0] for c in calls] == ["agent_reply", "judge_pre"]

        ((tool, decision),) = admin.execute(
            "select tool_name, output->>'decision' from public.ai_runtime_activity_tools"
            " where conversation_id = %s",
            (runtime_conversation["conversation_id"],),
        ).fetchall()
        assert (tool, decision) == ("create_coupon", "reused")


class TestWhoMayRead:
    @pytest.mark.parametrize(
        "view",
        ["ai_runtime_activity", "ai_runtime_activity_calls", "ai_runtime_activity_tools"],
    )
    def test_the_data_api_roles_are_locked_out(
        self, admin: psycopg.Connection, runtime_conversation: dict, view: str
    ) -> None:
        admin.execute("set role authenticated")
        try:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                admin.execute(f"select * from public.{view} limit 1")
        finally:
            admin.execute("reset role")

    def test_service_role_reads(
        self, admin: psycopg.Connection, runtime_conversation: dict
    ) -> None:
        admin.execute("set role service_role")
        try:
            (count,) = admin.execute(
                "select count(*) from public.ai_runtime_activity where conversation_id = %s",
                (runtime_conversation["conversation_id"],),
            ).fetchone()
        finally:
            admin.execute("reset role")
        assert count == 1
