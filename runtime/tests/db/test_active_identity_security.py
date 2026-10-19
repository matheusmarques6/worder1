"""Behavioral gate for verified-session, membership and MFA RLS enforcement.

Claims are installed as PostgREST would after JWT signature validation. These
tests use synthetic Auth rows in the disposable database only.
"""

import json
import uuid
from pathlib import Path

import psycopg
import pytest

pytestmark = pytest.mark.rls


@pytest.mark.parametrize(
    "state,visible",
    [
        ("active", True),
        ("removed", False),
        ("missing", False),
        ("revoked_session", False),
        ("required_aal1", False),
        ("required_aal2", True),
    ],
)
def test_org_rls_requires_active_identity(admin, two_tenants, state, visible):
    user = two_tenants.a.user_id
    org = two_tenants.a.id
    session = uuid.uuid4()
    with admin.transaction(force_rollback=True):
        admin.execute(
            "insert into auth.sessions (id, user_id, created_at, updated_at) "
            "values (%s,%s,now(),now())",
            (session, user),
        )
        if state == "removed":
            admin.execute(
                "update public.organization_members set status='removed' "
                "where user_id=%s and organization_id=%s",
                (user, org),
            )
        if state == "missing":
            admin.execute(
                "delete from public.organization_members where user_id=%s and organization_id=%s",
                (user, org),
            )
        if state == "revoked_session":
            admin.execute("delete from auth.sessions where id=%s", (session,))
        if state.startswith("required"):
            admin.execute(
                "update public.organizations set settings=coalesce(settings,'{}'::jsonb) "
                "|| '{\"require_2fa\":true}'::jsonb where id=%s",
                (org,),
            )
        claims = {
            "sub": str(user),
            "role": "authenticated",
            "session_id": str(session),
            "aal": "aal2" if state == "required_aal2" else "aal1",
        }
        admin.execute("select set_config('request.jwt.claims',%s,true)", (json.dumps(claims),))
        admin.execute("set local role authenticated")
        rows = admin.execute(
            "select id from public.pipelines where organization_id=%s", (org,)
        ).fetchall()
        assert bool(rows) is visible
        assert (
            admin.execute(
                "select id from public.pipelines where organization_id=%s", (two_tenants.b.id,)
            ).fetchall()
            == []
        )


def test_authenticated_cannot_rewrite_identity_authority(admin, two_tenants):
    user = two_tenants.a.user_id
    with admin.transaction(force_rollback=True):
        admin.execute(
            "select set_config('request.jwt.claims',%s,true)",
            (json.dumps({"sub": str(user), "role": "authenticated"}),),
        )
        admin.execute("set local role authenticated")
        for column in ("role", "organization_id", "id"):
            assert not admin.execute(
                "select has_column_privilege('authenticated','public.profiles',%s,'UPDATE')",
                (column,),
            ).fetchone()[0]
        assert not admin.execute(
            "select has_table_privilege('authenticated','public.organization_members','INSERT')"
        ).fetchone()[0]
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with admin.transaction():
                admin.execute(
                    "update public.profiles set role='owner', organization_id=%s where id=%s",
                    (two_tenants.b.id, user),
                )
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            with admin.transaction():
                admin.execute(
                    "insert into public.organization_members (user_id,organization_id,role,status) "
                    "values (%s,%s,'owner','active')",
                    (user, two_tenants.b.id),
                )


def test_legacy_backfill_preserves_agents_but_never_reopens_removed_members(admin, two_tenants):
    migration = (
        Path(__file__).resolve().parents[3]
        / "supabase/migrations/20261017050140_active_identity_security.sql"
    )
    with admin.transaction(force_rollback=True):
        admin.execute(
            "create table if not exists public.agents "
            "(id uuid primary key, user_id uuid, organization_id uuid, is_active boolean)"
        )
        admin.execute(
            "create table if not exists public.audit_logs "
            "(id uuid primary key, organization_id uuid, action text, details jsonb)"
        )
        agent_ids = []
        for label in ("legitimate", "recorded_removal", "tombstone"):
            user = uuid.uuid4()
            email = f"{label}-{user}@example.test"
            admin.execute(
                "insert into auth.users "
                "(id,instance_id,aud,role,email,encrypted_password,raw_user_meta_data) "
                "values (%s,'00000000-0000-0000-0000-000000000000',"
                "'authenticated','authenticated',%s,'','{}')",
                (user, email),
            )
            org = admin.execute(
                "select organization_id from public.profiles where id=%s", (user,)
            ).fetchone()[0]
            admin.execute("update public.profiles set role='agent' where id=%s", (user,))
            if label == "tombstone":
                admin.execute(
                    "update public.organization_members set status='removed',role='agent' "
                    "where user_id=%s",
                    (user,),
                )
            else:
                admin.execute("delete from public.organization_members where user_id=%s", (user,))
            admin.execute(
                "insert into public.agents (id,user_id,organization_id,is_active) "
                "values (%s,%s,%s,true)",
                (uuid.uuid4(), user, org),
            )
            if label == "recorded_removal":
                admin.execute(
                    "insert into public.audit_logs(id,organization_id,action,details) "
                    "values (%s,%s,'team.removed',%s::jsonb)",
                    (uuid.uuid4(), org, json.dumps({"email": email})),
                )
            agent_ids.append(user)
        admin.execute(
            "delete from public.organization_members where user_id=%s", (two_tenants.a.user_id,)
        )
        admin.execute(migration.read_text(encoding="utf-8-sig"))
        assert admin.execute(
            "select role::text,status from public.organization_members where user_id=%s",
            (two_tenants.a.user_id,),
        ).fetchone() == ("owner", "active")
        assert admin.execute(
            "select role::text,status from public.organization_members where user_id=%s",
            (agent_ids[0],),
        ).fetchone() == ("agent", "active")
        assert (
            admin.execute(
                "select status from public.organization_members where user_id=%s", (agent_ids[1],)
            ).fetchone()
            is None
        )
        assert admin.execute(
            "select status from public.organization_members where user_id=%s", (agent_ids[2],)
        ).fetchone() == ("removed",)
