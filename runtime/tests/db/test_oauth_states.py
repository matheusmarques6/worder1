"""OAuth nonce persistence and service-only access on the real disposable database."""

import json
import uuid
from pathlib import Path

import psycopg
import pytest
from psycopg import sql
from psycopg.types.json import Jsonb

pytestmark = pytest.mark.rls

MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase/migrations/20260910010100_oauth_states_service_only.sql"
)
COLUMNS = [
    ("id", "uuid", False, "gen_random_uuid()"),
    ("state", "character varying(64)", False, None),
    ("organization_id", "text", False, None),
    ("provider", "character varying(50)", False, "'shopify'::character varying"),
    ("metadata", "jsonb", True, "'{}'::jsonb"),
    ("expires_at", "timestamp with time zone", False, None),
    ("created_at", "timestamp with time zone", True, "now()"),
]


def _body():
    migration = MIGRATION.read_text(encoding="utf-8").strip()
    assert migration.startswith("begin;") and migration.endswith("commit;")
    return migration.removeprefix("begin;").removesuffix("commit;")


def _columns(admin):
    return admin.execute(
        """select a.attname, format_type(a.atttypid, a.atttypmod), not a.attnotnull,
                  pg_get_expr(d.adbin, d.adrelid)
             from pg_attribute a left join pg_attrdef d
               on d.adrelid=a.attrelid and d.adnum=a.attnum
            where a.attrelid='public.oauth_states'::regclass
              and a.attnum>0 and not a.attisdropped order by a.attnum"""
    ).fetchall()


def _snapshot(admin):
    """Capture rows and catalog independently of the migration's predicates."""
    return (
        _columns(admin),
        admin.execute(
            """select row_to_json(t)::text from public.oauth_states t
                order by row_to_json(t)::text"""
        ).fetchall(),
        admin.execute(
            """select relkind, relowner, relrowsecurity, relforcerowsecurity, relacl
                 from pg_class where oid='public.oauth_states'::regclass"""
        ).fetchall(),
        admin.execute(
            """select attname, attacl from pg_attribute
                where attrelid='public.oauth_states'::regclass
                  and attnum>0 and not attisdropped order by attnum"""
        ).fetchall(),
        admin.execute(
            """select conname, pg_get_constraintdef(oid, true) from pg_constraint
                where conrelid='public.oauth_states'::regclass order by conname"""
        ).fetchall(),
        admin.execute(
            """select indexname, indexdef from pg_indexes
                where schemaname='public' and tablename='oauth_states' order by indexname"""
        ).fetchall(),
        admin.execute(
            """select policyname, permissive, roles, cmd, qual, with_check from pg_policies
                where schemaname='public' and tablename='oauth_states' order by policyname"""
        ).fetchall(),
    )


def _seed(admin, organization="text-organization", *, state=None):
    row_id = uuid.uuid4()
    metadata = {"user_id": str(uuid.uuid4()), "nested": {"secret": "test-only", "ids": [1, 2]}}
    admin.execute(
        """insert into public.oauth_states
             (id, state, organization_id, provider, metadata, expires_at, created_at)
           values (%s, %s, %s, 'shopify_manual_oauth', %s,
                   '2030-01-02 03:04:05+00', '2026-01-02 03:04:05+00')""",
        (row_id, state or uuid.uuid4().hex, organization, Jsonb(metadata)),
    )
    return row_id


def _role(admin, role):
    admin.execute(sql.SQL("set local role {}").format(sql.Identifier(role)))
    assert admin.execute("select current_user").fetchone() == (role,)


def test_oauth_states_catalog(admin):
    assert admin.execute("select to_regclass('public.oauth_states')").fetchone()[0] is not None, (
        "oauth_states is absent from the active migration history"
    )
    assert _columns(admin) == COLUMNS
    assert admin.execute(
        """select relkind, pg_get_userbyid(relowner), relrowsecurity, relforcerowsecurity
             from pg_class where oid='public.oauth_states'::regclass"""
    ).fetchone() == ("r", "postgres", True, False)
    assert admin.execute(
        """select pg_get_constraintdef(oid, true) from pg_constraint
            where conrelid='public.oauth_states'::regclass and contype='p'"""
    ).fetchall() == [("PRIMARY KEY (id)",)]
    assert admin.execute(
        """select count(*) from pg_index i join pg_attribute a
               on a.attrelid=i.indrelid and a.attnum=i.indkey[0]
            where i.indrelid='public.oauth_states'::regclass and a.attname='state'
              and i.indisunique and i.indisvalid and i.indisready and i.indimmediate
              and i.indnkeyatts=1 and i.indnatts=1
              and i.indpred is null and i.indexprs is null"""
    ).fetchone()[0] == 1
    assert admin.execute(
        "select count(*) from pg_policies where schemaname='public' and tablename='oauth_states'"
    ).fetchone() == (0,)
    for role in ("anon", "authenticated", "service_role", "worker_role", "sender_role"):
        for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE",
                          "REFERENCES", "TRIGGER", "MAINTAIN"):
            expected = role == "service_role" and privilege in ("SELECT", "INSERT", "DELETE")
            assert admin.execute(
                "select has_table_privilege(%s, 'public.oauth_states', %s)",
                (role, privilege),
            ).fetchone()[0] == expected, (role, privilege)
        for column, *_ in COLUMNS:
            for privilege in ("SELECT", "INSERT", "UPDATE", "REFERENCES"):
                expected = role == "service_role" and privilege in ("SELECT", "INSERT")
                assert admin.execute(
                    "select has_column_privilege(%s, 'public.oauth_states', %s, %s)",
                    (role, column, privilege),
                ).fetchone()[0] == expected, (role, column, privilege)
    assert admin.execute(
        """select rolname, rolsuper, rolbypassrls from pg_roles
            where rolname in ('anon','authenticated','service_role','worker_role','sender_role')
            order by rolname"""
    ).fetchall() == [("anon", False, False), ("authenticated", False, False),
                    ("sender_role", False, False), ("service_role", False, True),
                    ("worker_role", False, False)]


def test_service_role_stores_reads_and_deletes_state(admin):
    state = "nonce:" + uuid.uuid4().hex
    with admin.transaction(force_rollback=True):
        _role(admin, "service_role")
        row = admin.execute(
            """insert into public.oauth_states (state, organization_id, expires_at)
               values (%s, 'non-uuid-organization', '2030-01-01 00:00:00+00')
               returning id, provider, metadata, created_at""", (state,),
        ).fetchone()
        assert isinstance(row[0], uuid.UUID)
        assert row[1:3] == ("shopify", {})
        assert row[3] is not None
        assert admin.execute(
            "select organization_id from public.oauth_states where state=%s", (state,),
        ).fetchone() == ("non-uuid-organization",)
        assert admin.execute(
            "delete from public.oauth_states where state=%s returning id", (state,),
        ).fetchone() == (row[0],)


def test_duplicate_state_rejects_a_second_consumer(admin):
    state = "nonce:" + uuid.uuid4().hex
    with admin.transaction(force_rollback=True):
        _role(admin, "service_role")
        admin.execute(
            """insert into public.oauth_states (state, organization_id, expires_at)
               values (%s, 'org-a', now())""", (state,),
        )
        with pytest.raises(psycopg.errors.UniqueViolation):
            with admin.transaction():
                admin.execute(
                    """insert into public.oauth_states
                         (state, organization_id, provider, expires_at)
                       values (%s, 'org-b', 'tiktok', now())""", (state,),
                )
        assert admin.execute(
            "select organization_id from public.oauth_states where state=%s", (state,),
        ).fetchall() == [("org-a",)]


@pytest.mark.parametrize("role", ("anon", "authenticated"))
@pytest.mark.parametrize("operation", (
    "select metadata from public.oauth_states",
    "insert into public.oauth_states (state,organization_id,expires_at) "
    "values ('attack','org',now())",
    "update public.oauth_states set metadata='{}'",
    "delete from public.oauth_states",
), ids=("select", "insert", "update", "delete"))
def test_browser_roles_cannot_access_even_own_organization(admin, two_tenants, role, operation):
    with admin.transaction(force_rollback=True):
        _seed(admin, str(two_tenants.a.id))
        admin.execute(
            "select set_config('request.jwt.claims', %s, true)",
            (json.dumps({"sub": str(two_tenants.a.user_id), "role": "authenticated"}),),
        )
        _role(admin, role)
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with admin.transaction():
                admin.execute(operation)


@pytest.mark.parametrize("operation", (
    "update public.oauth_states set metadata='{}'",
    "truncate public.oauth_states",
), ids=("update", "truncate"))
def test_service_role_cannot_update_or_truncate(admin, operation):
    with admin.transaction(force_rollback=True):
        _seed(admin)
        _role(admin, "service_role")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with admin.transaction():
                admin.execute(operation)


def test_replay_preserves_modern_rows_ids_metadata_and_defaults(admin):
    with admin.transaction(force_rollback=True):
        _seed(admin)
        admin.execute(
            """insert into public.oauth_states
                 (state, organization_id, expires_at, metadata, created_at)
               values (%s, 'another-org', now(), null, null)""", (uuid.uuid4().hex,),
        )
        before = _snapshot(admin)
        admin.execute(_body())
        admin.execute(_body())
        assert _snapshot(admin) == before


def test_migration_removes_broad_policies_and_column_grants(admin):
    with admin.transaction(force_rollback=True):
        _seed(admin)
        rows = _snapshot(admin)[1]
        admin.execute(
            """grant all on public.oauth_states
                 to public, anon, authenticated, service_role, worker_role, sender_role;
               grant select (metadata), insert (metadata), update (metadata),
                 references (metadata) on public.oauth_states
                 to public, anon, authenticated, service_role, worker_role, sender_role;
               create policy oauth_states_user on public.oauth_states
                 for all to public using (auth.uid() is not null);
               create policy org_isolation_rls on public.oauth_states
                 for all to authenticated
                 using (organization_id=public.get_user_organization_id()::text)
                 with check (organization_id=public.get_user_organization_id()::text);
               alter table public.oauth_states disable row level security"""
        )
        admin.execute(_body())
        test_oauth_states_catalog(admin)
        assert _snapshot(admin)[1] == rows


@pytest.mark.parametrize("kind", ("constraint", "index", "missing"))
def test_state_unique_is_semantic_and_repaired_when_missing(admin, kind):
    with admin.transaction(force_rollback=True):
        _seed(admin)
        if kind == "constraint":
            admin.execute(
                "alter table public.oauth_states "
                "rename constraint oauth_states_state_key to other_name"
            )
        else:
            admin.execute("alter table public.oauth_states drop constraint oauth_states_state_key")
            if kind == "index":
                admin.execute("create unique index other_name on public.oauth_states (state)")
        before_rows = _snapshot(admin)[1]
        admin.execute(_body())
        test_oauth_states_catalog(admin)
        assert _snapshot(admin)[1] == before_rows


@pytest.mark.parametrize(("ddl", "message"), (
    ("alter table public.oauth_states alter column provider type text", "columns"),
    ("alter table public.oauth_states alter column provider drop default", "columns"),
    ("alter table public.oauth_states alter column organization_id drop not null", "columns"),
    ("alter table public.oauth_states add column state_token text", "columns"),
    ("alter table public.oauth_states drop column metadata", "columns"),
    ("alter table public.oauth_states drop constraint oauth_states_pkey", "primary_key"),
    ("alter table public.oauth_states force row level security", "relation"),
    (
        "alter table public.oauth_states drop constraint oauth_states_state_key; "
        "create index oauth_states_state_key on public.oauth_states (state)",
        "unique_index",
    ),
    (
        "alter table public.oauth_states drop constraint oauth_states_state_key; "
        "create unique index oauth_states_state_key on public.oauth_states (state) "
        "where provider='shopify'",
        "unique_index",
    ),
    (
        "alter table public.oauth_states drop constraint oauth_states_state_key; "
        "insert into public.oauth_states (state,organization_id,expires_at) "
        "select state,organization_id,expires_at from public.oauth_states",
        "duplicate_state",
    ),
    (
        "drop table public.oauth_states; create table public.oauth_states ("
        "id uuid primary key default gen_random_uuid(), state_token text not null unique, "
        "data jsonb default '{}', expires_at timestamptz not null, "
        "created_at timestamptz default now()); "
        "insert into public.oauth_states (state_token,data,expires_at) "
        "values ('legacy', '{\"organization_id\":\"legacy-org\",\"secret\":\"preserve\"}',now())",
        "columns",
    ),
    (
        "drop table public.oauth_states; create view public.oauth_states as "
        "select 1 as untouched",
        "relation",
    ),
), ids=("type", "default", "nullable", "hybrid", "missing-column", "primary-key",
        "force-rls", "index-homonym", "partial-index", "duplicates", "legacy", "view"))
def test_conflicts_abort_without_partial_changes(admin, ddl, message):
    original = _snapshot(admin)
    with admin.transaction(force_rollback=True):
        _seed(admin)
        admin.execute(ddl)
        incompatible = _snapshot(admin)
        with pytest.raises(
            psycopg.errors.RaiseException, match=f"oauth_states incompatible: {message}",
        ):
            with admin.transaction():
                admin.execute(_body())
        assert _snapshot(admin) == incompatible
    assert _snapshot(admin) == original
