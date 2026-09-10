"""Auth signup provisioning requires the canonical database trigger.

These are real-PostgreSQL tests. Task 7 runs their RED/GREEN behavior gate;
this task only proves they collect and keeps the expectations reviewable.
"""

import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import psycopg
import pytest

from tests.db.conftest import as_authenticated_user

MIGRATION_PATH = (
    Path(__file__).resolve().parents[3]
    / "supabase/migrations/20260910000000_auth_user_created_trigger.sql"
)


def _insert_auth_user(admin, user_id, email, metadata):
    admin.execute(
        """insert into auth.users
              (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data)
           values (%s, '00000000-0000-0000-0000-000000000000', 'authenticated',
                   'authenticated', %s, '', %s::jsonb)""",
        (user_id, email, json.dumps(metadata)),
    )


def _cleanup_signup(admin, user_id, organization_id=None):
    row = admin.execute(
        "select organization_id from public.profiles where id=%s", (user_id,)
    ).fetchone()
    admin.execute("delete from auth.users where id=%s", (user_id,))
    organization_ids = {organization_id, row[0] if row else None} - {None}
    for org_id in organization_ids:
        admin.execute("delete from public.organizations where id=%s", (org_id,))
    assert admin.execute(
        "select count(*) from auth.users where id=%s", (user_id,)
    ).fetchone()[0] == 0
    for org_id in organization_ids:
        assert admin.execute(
            "select count(*) from public.organizations where id=%s", (org_id,)
        ).fetchone()[0] == 0


def test_auth_insert_provisions_one_owner_membership_pipeline_and_six_stages(admin):
    user_id = uuid.uuid4()
    email = f"signup-{user_id}@example.test"

    try:
        _insert_auth_user(admin, user_id, email, {})
        profile = admin.execute(
            "select organization_id, role::text from public.profiles where id=%s", (user_id,)
        ).fetchone()
        assert profile is not None
        organization_id, role = profile
        assert role == "owner"
        assert admin.execute(
            """select count(*) from public.organization_members
                 where organization_id=%s and user_id=%s and role='owner' and status='active'""",
            (organization_id, user_id),
        ).fetchone()[0] == 1
        pipeline = admin.execute(
            """select id from public.pipelines
                 where organization_id=%s and is_default""",
            (organization_id,),
        ).fetchall()
        assert len(pipeline) == 1
        assert admin.execute(
            """select array_agg(position order by position) from public.pipeline_stages
                 where pipeline_id=%s""",
            (pipeline[0][0],),
        ).fetchone()[0] == [0, 1, 2, 3, 4, 5]
    finally:
        _cleanup_signup(admin, user_id)


@pytest.mark.parametrize(
    "invalid", (None, "missing", "email", "status", "consumed", "role", "tenant"),
)
def test_invitation_requires_persisted_authority_and_uses_database_role(
        admin, two_tenants, invalid):
    user_id = uuid.uuid4()
    organization_id = uuid.UUID(str(two_tenants.a.id))
    email = f"invite-{user_id}@example.test"
    with admin.transaction(force_rollback=True):
        admin.execute(
            "update public.profiles set role=%s::user_role where id=%s",
            ("member" if invalid == "role" else "owner", two_tenants.a.user_id),
        )
        membership = None
        if invalid != "missing":
            membership = admin.execute(
                """insert into public.organization_members
                      (organization_id, user_id, role, email, status, invited_by)
                   values (%s, %s, 'member', %s, %s, %s) returning id""",
                (organization_id, two_tenants.b.user_id if invalid == "consumed" else None,
                 "wrong@example.test" if invalid == "email" else email.upper(),
                 "active" if invalid == "status" else "invited",
                 two_tenants.b.user_id if invalid == "tenant" else two_tenants.a.user_id),
            ).fetchone()[0]
        counts_query = (
            "select count(*), "
            "(select count(*) from public.pipelines where organization_id=%s) "
            "from public.organizations"
        )
        before = admin.execute(counts_query, (organization_id,)).fetchone()
        _insert_auth_user(
            admin, user_id, email,
            {"invited_org_id": str(organization_id), "invited_role": "admin"},
        )
        profile = admin.execute(
            "select organization_id, role::text from public.profiles where id=%s", (user_id,)
        ).fetchone()
        if invalid is None:
            assert admin.execute(counts_query, (organization_id,)).fetchone() == before
            assert profile == (organization_id, "member")
            assert admin.execute(
                "select user_id, role::text, status from public.organization_members where id=%s",
                (membership,),
            ).fetchone() == (user_id, "member", "active")
        else:
            assert profile[0] != organization_id
            assert profile[1] == "owner"
            assert admin.execute(
                "select count(*) from public.organization_members "
                "where organization_id=%s and user_id=%s",
                (organization_id, user_id),
            ).fetchone()[0] == 0


def test_concurrent_auth_inserts_consume_invitation_only_once(dsn, admin, two_tenants):
    first_id, second_id = uuid.uuid4(), uuid.uuid4()
    email = f"race-{first_id}@example.test"
    target = two_tenants.a.id
    metadata = {"invited_org_id": str(target), "invited_role": "admin"}
    membership, ctid = admin.execute(
        """insert into public.organization_members
             (organization_id, role, email, status, invited_by)
           values (%s, 'member', %s, 'invited', %s) returning id, ctid::text""",
        (target, email, two_tenants.a.user_id),
    ).fetchone()
    page, tuple_id = map(int, ctid.strip("()").split(","))
    try:
        with (psycopg.connect(dsn, autocommit=True, connect_timeout=5) as first,
              psycopg.connect(dsn, autocommit=True, connect_timeout=5) as second):
            for connection in (first, second):
                connection.execute("set statement_timeout='10s'")
                connection.execute("set lock_timeout='8s'")

            def consume_again():
                with second.transaction():
                    # Distinct spellings still select the same LOWER(email) invitation.
                    _insert_auth_user(second, second_id, email.upper(), metadata)

            with ThreadPoolExecutor(max_workers=1) as pool:
                with first.transaction():
                    _insert_auth_user(first, first_id, email, metadata)
                    attempt = pool.submit(consume_again)
                    deadline = time.monotonic() + 5
                    blocked_on_membership = False
                    while time.monotonic() < deadline and not attempt.done():
                        blocked_on_membership = admin.execute(
                            """select exists (
                                 select 1 from pg_locks where pid=%s and locktype='tuple'
                                   and relation='public.organization_members'::regclass
                                   and page=%s and tuple=%s and granted
                               ) and %s=any(pg_blocking_pids(%s))""",
                            (second.info.backend_pid, page, tuple_id,
                             first.info.backend_pid, second.info.backend_pid),
                        ).fetchone()[0]
                        if blocked_on_membership:
                            break
                        time.sleep(0.02)
                    if attempt.done():
                        attempt.result()
                    if not blocked_on_membership:
                        indexes = admin.execute(
                            """select schemaname, tablename, indexdef from pg_indexes
                               where (schemaname, tablename) in
                                 (('auth', 'users'), ('public', 'profiles'))
                                 and indexdef like 'CREATE UNIQUE%' order by indexname""",
                        ).fetchall()
                        pytest.fail(
                            "NEEDS_CONTEXT: second auth insert did not reach the invitation "
                            f"tuple lock; uniqueness definitions: {indexes!r}"
                        )
                # The first commit releases the row; the second must recheck the invite.
                attempt.result(timeout=10)
        profiles = {row[0]: row[1:] for row in admin.execute(
            "select id, organization_id::text, role::text from public.profiles "
            "where id=any(%s)", ([first_id, second_id],),
        )}
        assert profiles[first_id] == (str(target), "member")
        assert profiles[second_id][0] != str(target)
        assert profiles[second_id][1] == "owner"
        assert admin.execute(
            """select id, user_id, role::text, status from public.organization_members
               where organization_id=%s and lower(email)=lower(%s)""", (target, email),
        ).fetchall() == [(membership, first_id, "member", "active")]
    finally:
        own_orgs = [row[0] for row in admin.execute(
            "select organization_id from public.profiles where id=any(%s) "
            "and organization_id not in (%s, %s)",
            ([first_id, second_id], two_tenants.a.id, two_tenants.b.id),
        )]
        admin.execute("delete from auth.users where id=any(%s)", ([first_id, second_id],))
        admin.execute("delete from public.organization_members where id=%s", (membership,))
        admin.execute("delete from public.organizations where id=any(%s)", (own_orgs,))


def test_owner_invitation_aborts_auth_insert_without_orphan(admin, two_tenants):
    user_id = uuid.uuid4()
    email = f"owner-invite-{user_id}@example.test"
    with admin.transaction(force_rollback=True):
        admin.execute(
            "update public.profiles set role='owner' where id=%s", (two_tenants.a.user_id,),
        )
        admin.execute(
            """insert into public.organization_members
                 (organization_id, role, email, status, invited_by)
               values (%s, 'owner', %s, 'invited', %s)""",
            (two_tenants.a.id, email, two_tenants.a.user_id),
        )
        with pytest.raises(psycopg.errors.RaiseException, match="owner invitation"):
            with admin.transaction():
                _insert_auth_user(admin, user_id, email, {"invited_org_id": str(two_tenants.a.id)})
        assert admin.execute(
            "select count(*) from auth.users where id=%s", (user_id,),
        ).fetchone()[0] == 0


def test_authenticated_cannot_forge_invites_or_profile_authority(dsn, two_tenants):
    with as_authenticated_user(dsn, two_tenants.a.user_id) as authenticated:
        for statement in (
            "insert into public.organization_members (organization_id, role) values (%s, 'admin')",
            "update public.organization_members set role='admin' where organization_id=%s",
            "delete from public.organization_members where organization_id=%s",
            "update public.profiles set organization_id=%s where id=auth.uid()",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with authenticated.transaction():
                    authenticated.execute(statement, (two_tenants.a.id,))
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with authenticated.transaction():
                authenticated.execute("update public.profiles set role='admin' where id=auth.uid()")
        with authenticated.transaction(force_rollback=True):
            assert authenticated.execute(
                """update public.profiles set must_change_password=false, updated_at=now()
                   where id=auth.uid() returning id::text""",
            ).fetchone() == (str(two_tenants.a.user_id),)


def test_profile_and_membership_acl_preserves_only_trusted_authority_writes(admin):
    for table in ("profiles", "organization_members"):
        for role in ("anon", "authenticated", "service_role"):
            for operation in ("INSERT", "UPDATE", "DELETE"):
                assert admin.execute(
                    "select has_table_privilege(%s, %s, %s)",
                    (role, f"public.{table}", operation),
                ).fetchone()[0] == (role == "service_role")
            for operation in ("INSERT", "UPDATE"):
                columns = {
                    row[0] for row in admin.execute(
                        """select attname from pg_attribute
                           where attrelid=to_regclass(%s) and attnum>0 and not attisdropped
                             and has_column_privilege(%s, attrelid, attnum, %s)""",
                        (f"public.{table}", role, operation),
                    )
                }
                if role != "service_role":
                    expected = {"must_change_password", "updated_at"} if (
                        table == "profiles" and role == "authenticated" and operation == "UPDATE"
                    ) else set()
                    assert columns == expected


def _auth_trigger_definitions(admin):
    return tuple(admin.execute(
        """select t.tgname, pg_get_triggerdef(t.oid, true), t.tgenabled
             from pg_trigger t
             join pg_class c on c.oid=t.tgrelid
             join pg_namespace n on n.oid=c.relnamespace
            where not t.tgisinternal and n.nspname='auth' and c.relname='users'
            order by t.tgname""",
    ).fetchall())


def test_second_enabled_handle_new_user_trigger_aborts_migration_without_change(admin):
    duplicate = "task5_duplicate_handle_new_user"
    admin.execute(
        f"""create trigger {duplicate} after insert on auth.users
             for each row execute function public.handle_new_user()"""
    )
    before = _auth_trigger_definitions(admin)

    try:
        with pytest.raises(
            psycopg.errors.RaiseException,
            match="auth trigger conflict: enabled handle_new_user invocation",
        ):
            with admin.transaction():
                admin.execute(MIGRATION_PATH.read_text(encoding="utf-8"))
        assert _auth_trigger_definitions(admin) == before
    finally:
        admin.execute(f"drop trigger if exists {duplicate} on auth.users")


@pytest.mark.parametrize(
    "ddl",
    (
        """create trigger on_auth_user_created after insert on auth.users
             for each row execute function public.handle_new_user('unexpected')""",
        """create trigger on_auth_user_created after insert on auth.users
             for each row when (new.id is not null)
             execute function public.handle_new_user()""",
        """create constraint trigger on_auth_user_created after insert on auth.users
             deferrable initially immediate for each row
             execute function public.handle_new_user()""",
        """create trigger on_auth_user_created after insert on auth.users
             referencing new table as inserted for each row
             execute function public.handle_new_user()""",
    ),
    ids=("arguments", "when", "constraint", "new-table"),
)
def test_noncanonical_homonym_aborts_migration_without_change(admin, ddl):
    admin.execute("drop trigger on_auth_user_created on auth.users")
    admin.execute(ddl)
    before = _auth_trigger_definitions(admin)

    try:
        with pytest.raises(
            psycopg.errors.RaiseException,
            match="auth trigger conflict: on_auth_user_created definition",
        ):
            with admin.transaction():
                admin.execute(MIGRATION_PATH.read_text(encoding="utf-8"))
        assert _auth_trigger_definitions(admin) == before
    finally:
        admin.execute("drop trigger if exists on_auth_user_created on auth.users")
        admin.execute(
            """create trigger on_auth_user_created after insert on auth.users
                 for each row execute function public.handle_new_user()"""
        )
