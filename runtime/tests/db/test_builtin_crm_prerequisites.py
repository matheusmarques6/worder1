"""The catalog migration must replay without the old out-of-chain CRM SQL.

DDL is exercised inside rollback-only transactions on the identity-guarded
disposable database. Existing production tables must not be replaced.
"""

import json
from pathlib import Path

import psycopg
import pytest
from psycopg import sql

MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase/migrations/20261016000005_runtime_tool_grants.sql"
)
TABLES = ("contact_activities", "whatsapp_product_interests")


def _contact(conn, organization_id, phone):
    return conn.execute(
        "insert into public.contacts (organization_id, phone, first_name)"
        " values (%s, %s, 'Catalog replay') returning id",
        (organization_id, phone),
    ).fetchone()[0]


def _insert(conn, table, organization_id, contact_id):
    if table == "contact_activities":
        return conn.execute(
            "insert into public.contact_activities"
            " (organization_id, contact_id, type, title, metadata,"
            " created_by_name, created_by_type, source)"
            " values (%s, %s, 'note', 'Catalog replay', '{\"keep\":true}',"
            " 'AI Agent', 'ai_agent', 'ai_agent') returning id",
            (organization_id, contact_id),
        ).fetchone()[0]
    return conn.execute(
        "insert into public.whatsapp_product_interests"
        " (organization_id, contact_id, phone, product_id, product_title)"
        " values (%s, %s, null, 'catalog-replay', 'Kept product') returning id",
        (organization_id, contact_id),
    ).fetchone()[0]


@pytest.mark.rls
@pytest.mark.parametrize("table", TABLES)
def test_catalog_migration_bootstraps_missing_tables_and_scopes_worker(admin, two_tenants, table):
    with admin.transaction(force_rollback=True):
        admin.execute(
            "drop table if exists public.contact_activities, public.whatsapp_product_interests"
        )
        contact_a = _contact(admin, two_tenants.a.id, "5511999990001")
        contact_b = _contact(admin, two_tenants.b.id, "5511999990002")
        admin.execute(MIGRATION.read_text(encoding="utf-8"), prepare=False)
        denied_roles = ("anon", "authenticated") if table == TABLES[1] else ("anon",)
        for client_role in denied_roles:
            assert not admin.execute(
                "select has_table_privilege(%s, %s, 'SELECT')",
                (client_role, "public." + table),
            ).fetchone()[0]
        assert admin.execute(
            "select has_table_privilege('service_role', %s, 'INSERT')", ("public." + table,)
        ).fetchone()[0]
        other_id = _insert(admin, table, two_tenants.b.id, contact_b)
        if table == "contact_activities":
            admin.execute(
                "insert into public.contact_activities"
                " (organization_id, contact_id, activity_type, title)"
                " values (%s, %s, 'note_added', 'Inbox format')",
                (two_tenants.a.id, contact_a),
            )
        admin.execute("select set_config('app.organization_id', '', true)")
        admin.execute("set local role worker_role")
        select_ids = sql.SQL("select id from public.{}").format(sql.Identifier(table))
        assert admin.execute(select_ids).fetchall() == []
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with admin.transaction():
                _insert(admin, table, two_tenants.a.id, contact_a)
        admin.execute(
            "select set_config('app.organization_id', %s, true)", (str(two_tenants.a.id),)
        )
        own_id = _insert(admin, table, two_tenants.a.id, contact_a)
        visible = admin.execute(select_ids).fetchall()
        assert (own_id,) in visible
        assert (other_id,) not in visible
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with admin.transaction():
                _insert(admin, table, two_tenants.b.id, contact_b)
        for privilege in ("UPDATE", "DELETE"):
            assert not admin.execute(
                "select has_table_privilege(current_user, %s, %s)",
                ("public." + table, privilege),
            ).fetchone()[0]


@pytest.mark.parametrize("table", TABLES)
def test_catalog_migration_retry_preserves_existing_rows_and_extra_columns(
    admin, two_tenants, table
):
    with admin.transaction(force_rollback=True):
        admin.execute(MIGRATION.read_text(encoding="utf-8"), prepare=False)
        contact = _contact(admin, two_tenants.a.id, "5511999990003")
        row_id = _insert(admin, table, two_tenants.a.id, contact)
        admin.execute(
            sql.SQL("alter table public.{} add column replay_marker text").format(
                sql.Identifier(table)
            )
        )
        admin.execute(
            sql.SQL("update public.{} set replay_marker = 'preserve' where id = %s").format(
                sql.Identifier(table)
            ),
            (row_id,),
        )
        before = admin.execute(
            sql.SQL("select to_jsonb(t) from public.{} t where id = %s").format(
                sql.Identifier(table)
            ),
            (row_id,),
        ).fetchone()[0]
        admin.execute(MIGRATION.read_text(encoding="utf-8"), prepare=False)
        after = admin.execute(
            sql.SQL("select to_jsonb(t) from public.{} t where id = %s").format(
                sql.Identifier(table)
            ),
            (row_id,),
        ).fetchone()[0]
        assert after == before
        assert after["replay_marker"] == "preserve"
        if table == "whatsapp_product_interests":
            assert after["phone"] is None
            with pytest.raises(psycopg.errors.UniqueViolation):
                with admin.transaction():
                    _insert(admin, table, two_tenants.a.id, contact)


@pytest.mark.rls
def test_fresh_timeline_supports_authenticated_crm_and_inbox_without_tenant_leaks(
    admin, two_tenants
):
    with admin.transaction(force_rollback=True):
        admin.execute("drop table public.contact_activities, public.whatsapp_product_interests")
        admin.execute(MIGRATION.read_text(encoding="utf-8"), prepare=False)
        contact_a = _contact(admin, two_tenants.a.id, "5511999990004")
        contact_b = _contact(admin, two_tenants.b.id, "5511999990005")
        other_id = _insert(admin, "contact_activities", two_tenants.b.id, contact_b)
        admin.execute(
            "select set_config('request.jwt.claims', %s, true)",
            (json.dumps({
                "sub": str(two_tenants.a.user_id),
                "role": "authenticated",
                "organization_id": str(two_tenants.b.id),
            }),),
        )
        admin.execute("set local role authenticated")
        own_id = admin.execute(
            "insert into public.contact_activities"
            " (organization_id, contact_id, type, activity_type, title, occurred_at,"
            " task_id, deal_id) values (%s, %s, 'note', 'note_added', 'CRM/Inbox',"
            " now(), gen_random_uuid(), gen_random_uuid()) returning id",
            (two_tenants.a.id, contact_a),
        ).fetchone()[0]
        visible = admin.execute(
            "select id from public.contact_activities order by occurred_at"
        ).fetchall()
        assert (own_id,) in visible
        assert (other_id,) not in visible
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with admin.transaction():
                _insert(admin, "contact_activities", two_tenants.b.id, contact_b)
        admin.execute("select set_config('request.jwt.claims', '{}', true)")
        assert admin.execute("select id from public.contact_activities").fetchall() == []
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with admin.transaction():
                _insert(admin, "contact_activities", two_tenants.a.id, contact_a)
