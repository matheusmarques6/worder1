"""Historical agent RPCs cannot reopen public or cross-tenant access."""

import re
from pathlib import Path

import psycopg
import pytest

from tests.db.conftest import TwoTenants, as_authenticated_user

REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATION = REPO_ROOT / "supabase/migrations/20260910020800_restrict_legacy_agent_rpc_grants.sql"
HISTORICAL_SCRIPTS = (
    REPO_ROOT / "sql/ai-agents-rpc-functions.sql",
    REPO_ROOT / "sql/ai-agents-functions.sql",
    REPO_ROOT / "sql/ai-agents-stored-procedures.sql",
    REPO_ROOT / "sql/ai-agents-complete-migration.sql",
)
UNSAFE_HISTORICAL_DEFINITION = re.compile(
    r"create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"
    r"(?:search_agent_knowledge|get_active_agent_for_conversation|"
    r"increment_action_trigger|update_agent_stats)\b",
    re.IGNORECASE,
)

LEGACY_FUNCTIONS = """
create function public.search_agent_knowledge(uuid, vector, double precision, integer)
returns integer language sql as 'select 1';
grant execute on function public.search_agent_knowledge(uuid, vector, double precision, integer)
to authenticated, service_role;

create function public.increment_action_trigger(uuid)
returns void language sql as 'select';
grant execute on function public.increment_action_trigger(uuid)
to authenticated, service_role;

create function public.update_agent_stats(uuid, integer, integer)
returns void language sql as 'select';
grant execute on function public.update_agent_stats(uuid, integer, integer)
to authenticated, service_role;

grant execute on function public.get_active_agent_for_conversation(uuid, uuid, uuid)
to authenticated;
"""

CLEANUP = """
drop function if exists public.search_agent_knowledge(uuid, vector, double precision, integer);
drop function if exists public.increment_action_trigger(uuid);
drop function if exists public.update_agent_stats(uuid, integer, integer);
revoke execute on function public.get_active_agent_for_conversation(uuid, uuid, uuid)
from authenticated;
"""


def _grants(admin: psycopg.Connection) -> list[tuple]:
    return admin.execute(
        """
        select p.proname,
               pg_get_function_identity_arguments(p.oid),
               has_function_privilege('anon', p.oid, 'execute'),
               has_function_privilege('authenticated', p.oid, 'execute'),
               has_function_privilege('service_role', p.oid, 'execute')
          from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = any(%s)
         order by p.proname, pg_get_function_identity_arguments(p.oid)
        """,
        (
            [
                "search_agent_knowledge",
                "get_active_agent_for_conversation",
                "increment_action_trigger",
                "update_agent_stats",
            ],
        ),
    ).fetchall()


def test_historical_scripts_do_not_recreate_retired_rpcs() -> None:
    for script in HISTORICAL_SCRIPTS:
        executable = "\n".join(
            line
            for line in script.read_text(encoding="utf-8").splitlines()
            if not line.lstrip().startswith("--")
        )
        assert UNSAFE_HISTORICAL_DEFINITION.search(executable) is None, script.name


def test_the_contaminated_fixture_exposes_the_old_grants(
    admin: psycopg.Connection,
) -> None:
    admin.execute(LEGACY_FUNCTIONS)
    try:
        rows = _grants(admin)
        assert any(
            name == "search_agent_knowledge" and authenticated
            for name, _, _, authenticated, _ in rows
        )
        assert any(
            name == "get_active_agent_for_conversation" and authenticated
            for name, _, _, authenticated, _ in rows
        )
    finally:
        admin.execute(CLEANUP)


def test_the_compensation_revokes_contaminated_overloads(
    admin: psycopg.Connection,
) -> None:
    admin.execute(LEGACY_FUNCTIONS)
    try:
        admin.execute(MIGRATION.read_text(encoding="utf-8"))
        rows = _grants(admin)

        assert all(not anon and not authenticated for _, _, anon, authenticated, _ in rows)
        for name, arguments, _, _, service_role in rows:
            if name == "increment_action_trigger":
                assert not service_role
            if name == "search_agent_knowledge" and "p_organization_id" not in arguments:
                assert not service_role

        assert any(
            name == "search_agent_knowledge"
            and "p_organization_id" in arguments
            and service_role
            for name, arguments, _, _, service_role in rows
        )
        assert any(
            name == "get_active_agent_for_conversation" and service_role
            for name, _, _, _, service_role in rows
        )
        assert any(
            name == "update_agent_stats" and service_role
            for name, _, _, _, service_role in rows
        )
    finally:
        admin.execute(CLEANUP)


def test_authenticated_cannot_enumerate_another_organization_agent(
    dsn: str,
    two_tenants: TwoTenants,
) -> None:
    with as_authenticated_user(dsn, two_tenants.a.user_id) as conn:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute(
                "select * from public.get_active_agent_for_conversation(%s)",
                (two_tenants.b.id,),
            )
