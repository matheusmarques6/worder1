"""Auth signup provisioning requires the canonical database trigger.

These are real-PostgreSQL tests. Task 7 runs their RED/GREEN behavior gate;
this task only proves they collect and keeps the expectations reviewable.
"""

import json
import uuid
from pathlib import Path

import psycopg
import pytest

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


def test_invited_auth_insert_joins_inviter_and_consumes_null_user_membership(admin):
    user_id = uuid.uuid4()
    organization_id = uuid.uuid4()
    email = f"invite-{user_id}@example.test"
    label = f"invite-{organization_id.hex}"

    try:
        admin.execute(
            "insert into public.organizations (id, name, slug) values (%s, %s, %s)",
            (organization_id, label, label),
        )
        admin.execute(
            """insert into public.organization_members
                  (organization_id, user_id, role, email, name, status)
               values (%s, null, 'member', %s, 'Invited User', 'invited')""",
            (organization_id, email),
        )
        before = admin.execute(
            "select count(*), (select count(*) from public.pipelines where organization_id=%s) "
            "from public.organizations",
            (organization_id,),
        ).fetchone()
        _insert_auth_user(
            admin,
            user_id,
            email,
            {"invited_org_id": str(organization_id), "invited_role": "agent"},
        )
        assert admin.execute(
            "select organization_id, role::text from public.profiles where id=%s", (user_id,)
        ).fetchone() == (organization_id, "agent")
        assert admin.execute(
            """select user_id, role::text, status from public.organization_members
                 where organization_id=%s and lower(email)=lower(%s)""",
            (organization_id, email),
        ).fetchall() == [(user_id, "agent", "active")]
        assert admin.execute(
            "select count(*), (select count(*) from public.pipelines where organization_id=%s) "
            "from public.organizations",
            (organization_id,),
        ).fetchone() == before
    finally:
        _cleanup_signup(admin, user_id, organization_id)


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
