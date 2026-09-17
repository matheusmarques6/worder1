"""Residual RLS checks for profiles and persisted invitations."""

import json
import uuid
from datetime import UTC, datetime

import psycopg
import pytest

from tests.db.conftest import as_authenticated_user

pytestmark = pytest.mark.rls


def _insert_auth_user(admin, user_id, email, metadata=None):
    admin.execute(
        """insert into auth.users
              (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data)
           values (%s, '00000000-0000-0000-0000-000000000000', 'authenticated',
                   'authenticated', %s, '', %s::jsonb)""",
        (user_id, email, json.dumps(metadata or {})),
    )


def test_authenticated_user_updates_own_password_flag_and_timestamp(dsn, two_tenants):
    changed_at = datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)
    with as_authenticated_user(dsn, two_tenants.a.user_id) as authenticated:
        with authenticated.transaction(force_rollback=True):
            row = authenticated.execute(
                """update public.profiles
                      set must_change_password=true, updated_at=%s
                    where id=%s
                returning must_change_password, updated_at""",
                (changed_at, two_tenants.a.user_id),
            ).fetchone()

    assert row == (True, changed_at)


def test_authenticated_user_cannot_update_sibling_profile_in_same_org(
    dsn, admin, two_tenants
):
    sibling_id = uuid.uuid4()
    email = f"sibling-{sibling_id}@example.test"
    sibling_org = None
    try:
        _insert_auth_user(admin, sibling_id, email)
        sibling_org = admin.execute(
            "select organization_id from public.profiles where id=%s", (sibling_id,)
        ).fetchone()[0]
        admin.execute(
            "update public.organization_members set organization_id=%s where user_id=%s",
            (two_tenants.a.id, sibling_id),
        )
        admin.execute(
            "update public.profiles set organization_id=%s where id=%s",
            (two_tenants.a.id, sibling_id),
        )
        before = admin.execute(
            "select must_change_password, updated_at from public.profiles where id=%s",
            (sibling_id,),
        ).fetchone()

        with as_authenticated_user(dsn, two_tenants.a.user_id) as authenticated:
            affected = authenticated.execute(
                """update public.profiles
                      set must_change_password=not must_change_password, updated_at=now()
                    where id=%s""",
                (sibling_id,),
            ).rowcount

        after = admin.execute(
            "select must_change_password, updated_at from public.profiles where id=%s",
            (sibling_id,),
        ).fetchone()
        assert affected == 0
        assert after == before
    finally:
        admin.execute("delete from auth.users where id=%s", (sibling_id,))
        if sibling_org is not None:
            admin.execute("delete from public.organizations where id=%s", (sibling_org,))


def test_authenticated_user_cannot_update_cross_tenant_profile(dsn, admin, two_tenants):
    before = admin.execute(
        "select must_change_password, updated_at from public.profiles where id=%s",
        (two_tenants.b.user_id,),
    ).fetchone()

    with as_authenticated_user(dsn, two_tenants.a.user_id) as authenticated:
        affected = authenticated.execute(
            """update public.profiles
                  set must_change_password=not must_change_password, updated_at=now()
                where id=%s""",
            (two_tenants.b.user_id,),
        ).rowcount

    assert affected == 0
    assert admin.execute(
        "select must_change_password, updated_at from public.profiles where id=%s",
        (two_tenants.b.user_id,),
    ).fetchone() == before


def test_anon_cannot_read_memberships(dsn, two_tenants):
    with psycopg.connect(dsn) as anonymous:
        anonymous.execute("set role anon")
        rows = anonymous.execute(
            "select id from public.organization_members where organization_id=any(%s)",
            ([two_tenants.a.id, two_tenants.b.id],),
        ).fetchall()

    assert rows == []


def test_authenticated_user_cannot_read_other_tenant_membership(dsn, two_tenants):
    with as_authenticated_user(dsn, two_tenants.a.user_id) as authenticated:
        rows = authenticated.execute(
            "select id from public.organization_members where organization_id=%s",
            (two_tenants.b.id,),
        ).fetchall()

    assert rows == []


def test_service_role_creates_invite_consumed_with_persisted_role(dsn, admin, two_tenants):
    invited_user = uuid.uuid4()
    email = f"invited-{invited_user}@example.test"
    membership = None
    unexpected_org = None
    try:
        with psycopg.connect(dsn) as service:
            service.execute("set role service_role")
            membership = service.execute(
                """insert into public.organization_members
                          (organization_id, role, email, status, invited_by)
                   values (%s, 'member', %s, 'invited', %s)
                returning id""",
                (two_tenants.a.id, email, two_tenants.a.user_id),
            ).fetchone()[0]

        _insert_auth_user(
            admin,
            invited_user,
            email,
            {"invited_org_id": str(two_tenants.a.id), "invited_role": "admin"},
        )

        assert admin.execute(
            "select organization_id, role::text from public.profiles where id=%s",
            (invited_user,),
        ).fetchone() == (two_tenants.a.id, "member")
        assert admin.execute(
            """select user_id, role::text, status, invited_by
                 from public.organization_members where id=%s""",
            (membership,),
        ).fetchone() == (invited_user, "member", "active", two_tenants.a.user_id)
    finally:
        row = admin.execute(
            "select organization_id from public.profiles where id=%s", (invited_user,)
        ).fetchone()
        if row is not None and row[0] not in (two_tenants.a.id, two_tenants.b.id):
            unexpected_org = row[0]
        admin.execute("delete from auth.users where id=%s", (invited_user,))
        if membership is not None:
            admin.execute("delete from public.organization_members where id=%s", (membership,))
        if unexpected_org is not None:
            admin.execute("delete from public.organizations where id=%s", (unexpected_org,))
