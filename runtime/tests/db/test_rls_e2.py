"""A suíte de vazamento cross-org da trilha do agente.

Três credenciais alcançam os dados — JWT do usuário, worker_role e
sender_role — e cada uma tem que ficar confinada à sua organização.
**Qualquer linha lida ou afetada reprova a suíte.**

Nota de escopo (Adendo §A.4.6): as tabelas LEGADAS (ai_agents,
ai_agent_versions, ai_agent_chunks…) seguem com RLS desligada no banco vivo —
remediação pendente de aprovação. Por isso o RAG do runtime escopa por
organization_id EXPLÍCITO na query (desvio declarado no FORK.md), e esta
suíte afirma as tabelas NOVAS: ai_missions, alerts e a trilha internal.*.
"""

import uuid
from collections.abc import Iterator
from dataclasses import dataclass

import psycopg
import pytest

from tests.db.conftest import TwoTenants, as_app_role, as_authenticated_user
from tests.db.factories import (
    create_agent_version,
    create_alert,
    create_eval_run,
    create_judge_score,
    create_llm_call,
    create_mission,
    create_scenario,
    create_thread,
    create_tool_call,
)

pytestmark = pytest.mark.rls

MERCHANT_TABLES = ("public.ai_missions", "public.alerts")
INTERNAL_TABLES = (
    "internal.scenarios",
    "internal.eval_runs",
    "internal.judge_scores",
    "internal.tool_calls",
    "internal.llm_calls",
)
E2_TABLES = MERCHANT_TABLES + INTERNAL_TABLES

DATA_API_ROLES = ("anon", "authenticated", "service_role")


@dataclass(frozen=True)
class TenantRows:
    mission_id: uuid.UUID


@pytest.fixture
def e2_rows(admin: psycopg.Connection, two_tenants: TwoTenants) -> Iterator[dict]:
    """Uma linha de cada tabela, nas DUAS orgs.

    Popular só a vítima faria um vazamento parecer tabela vazia.
    """
    rows = {}
    for label, tenant in (("a", two_tenants.a), ("b", two_tenants.b)):
        version_id = create_agent_version(admin, tenant.id, status="active")
        mission_id = create_mission(admin, tenant.id, status="active")
        thread = create_thread(admin, tenant.id)
        create_alert(admin, tenant.id)
        create_scenario(admin, tenant.id)
        create_eval_run(admin, tenant.id, version_id)
        create_judge_score(admin, tenant.id, conversation_id=thread.conversation_id)
        create_tool_call(admin, tenant.id, thread)
        create_llm_call(admin, tenant.id)
        rows[label] = TenantRows(mission_id=mission_id)

    yield rows


def rows_of_the_other_tenant(
    conn: psycopg.Connection, table: str, organization_id: uuid.UUID
) -> list:
    """O que esta credencial consegue ler da outra org. Deve ser nada.

    Negação por privilégio conta como nada: a linha não foi alcançada.
    """
    try:
        return conn.execute(
            f"select id from {table} where organization_id = %s", (organization_id,)
        ).fetchall()
    except psycopg.errors.InsufficientPrivilege:
        return []


class TestReadIsConfinedToOneOrg:
    @pytest.mark.parametrize("table", E2_TABLES)
    @pytest.mark.parametrize("role", ["worker_role", "sender_role"])
    def test_an_app_role_of_a_cannot_read_the_rows_of_b(
        self, dsn: str, two_tenants: TwoTenants, e2_rows: dict, table: str, role: str
    ) -> None:
        with as_app_role(dsn, role, two_tenants.a.id) as conn:
            leaked = rows_of_the_other_tenant(conn, table, two_tenants.b.id)

        assert leaked == []

    @pytest.mark.parametrize("table", E2_TABLES)
    def test_the_user_of_a_cannot_read_the_rows_of_b(
        self, dsn: str, two_tenants: TwoTenants, e2_rows: dict, table: str
    ) -> None:
        with as_authenticated_user(dsn, two_tenants.a.user_id) as conn:
            leaked = rows_of_the_other_tenant(conn, table, two_tenants.b.id)

        assert leaked == []


class TestWriteIsConfinedToOneOrg:
    def test_the_worker_cannot_touch_any_mission_at_all(
        self, dsn: str, two_tenants: TwoTenants, e2_rows: dict
    ) -> None:
        # O runtime só LÊ o catálogo (o resolver); ativar/arquivar é da API.
        # Worker sem grant de UPDATE: a escrita mais nociva do marco nem compila.
        with as_app_role(dsn, "worker_role", two_tenants.a.id) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(
                    "update public.ai_missions set status = 'archived' where organization_id = %s",
                    (two_tenants.b.id,),
                )

    def test_the_worker_of_a_cannot_insert_an_alert_into_b(
        self, dsn: str, two_tenants: TwoTenants
    ) -> None:
        with as_app_role(dsn, "worker_role", two_tenants.a.id) as conn:
            with pytest.raises(
                (
                    psycopg.errors.InsufficientPrivilege,
                    psycopg.errors.CheckViolation,
                )
            ):
                create_alert(conn, two_tenants.b.id)


class TestTheLegitimatePathStillWorks:
    """Fronteira que também bloqueia o dono não é segurança, é indisponibilidade."""

    def test_the_worker_reads_its_own_active_mission(
        self, dsn: str, two_tenants: TwoTenants, e2_rows: dict
    ) -> None:
        with as_app_role(dsn, "worker_role", two_tenants.a.id) as conn:
            rows = conn.execute(
                "select id from public.ai_missions where status = 'active'"
            ).fetchall()

        assert [row[0] for row in rows] == [e2_rows["a"].mission_id]

    def test_the_user_reads_the_missions_of_their_own_org(
        self, dsn: str, two_tenants: TwoTenants, e2_rows: dict
    ) -> None:
        with as_authenticated_user(dsn, two_tenants.a.user_id) as conn:
            rows = conn.execute("select id from public.ai_missions").fetchall()

        assert [row[0] for row in rows] == [e2_rows["a"].mission_id]

    def test_the_base_pack_scenarios_are_visible_to_a_scoped_worker(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        # Pack base (org NULL) é da plataforma: qualquer worker escopado lê.
        create_scenario(admin, None)

        with as_app_role(dsn, "worker_role", two_tenants.a.id) as conn:
            rows = conn.execute(
                "select id from internal.scenarios where organization_id is null"
            ).fetchall()

        assert len(rows) >= 1


class TestTheEvaluationTablesAreOutOfTheDataApi:
    @pytest.mark.parametrize("table", INTERNAL_TABLES)
    @pytest.mark.parametrize("role", DATA_API_ROLES)
    def test_a_data_api_role_cannot_read_an_internal_table(
        self, dsn: str, role: str, table: str
    ) -> None:
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(f"set role {role}")

                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    cur.execute(f"select * from {table}")
