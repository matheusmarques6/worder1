"""Real LOGIN sessions: RESET ROLE cannot recover owner/opposite-role powers.

Run only through the canonical disposable executor (the dsn fixture proves it).
Passwords exist only in process memory for the duration of a test.
"""

import secrets
import uuid

import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import make_conninfo

from agents_runtime.app import _connect
from agents_runtime.repository.scope import RlsNotEnforced, scope_to_organization
from tests.db.factories import create_thread


@pytest.fixture(params=["worker", "sender"])
def minimum_login(request, admin, dsn, monkeypatch):
    monkeypatch.setenv("DEPLOY_ENV", "production")
    kind = request.param
    login, role = f"runtime_{kind}_login", f"{kind}_role"
    password = secrets.token_urlsafe(32)
    admin.execute(sql.SQL("alter role {} password {}").format(
        sql.Identifier(login), sql.Literal(password)
    ))
    try:
        yield make_conninfo(dsn, user=login, password=password), login, role
    finally:
        admin.execute(sql.SQL("alter role {} password null").format(sql.Identifier(login)))


async def test_owner_session_after_set_role_is_rejected(dsn, monkeypatch):
    monkeypatch.setenv("DEPLOY_ENV", "production")
    with pytest.raises(RlsNotEnforced, match="session_user"):
        await _connect(dsn, "worker_role", "worker_role")


async def test_real_login_reset_role_cannot_escalate(minimum_login):
    url, login, role = minimum_login
    conn = await _connect(url, role, role)
    try:
        assert await (await conn.execute("select session_user, current_user")).fetchone() == (
            login, role,
        )
        await conn.execute("reset role")
        assert await (await conn.execute("select current_user")).fetchone() == (login,)
        for target in ("postgres", "sender_role" if role == "worker_role" else "worker_role"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                await conn.execute(sql.SQL("set role {}").format(sql.Identifier(target)))
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            await conn.execute("alter role runtime_worker_login createrole")
    finally:
        await conn.close()


async def test_real_login_preserves_tenant_rls(minimum_login, admin, two_tenants):
    url, _, role = minimum_login
    mine = create_thread(admin, two_tenants.a.id)
    theirs = create_thread(admin, two_tenants.b.id)
    conn = await _connect(url, role, role)
    try:
        async with conn.transaction():
            await scope_to_organization(conn, two_tenants.a.id)
            rows = await (await conn.execute(
                "select id from public.conversations where id in (%s, %s)",
                (mine.conversation_id, theirs.conversation_id),
            )).fetchall()
            assert rows == [(mine.conversation_id,)]
    finally:
        await conn.close()


async def test_opposite_role_membership_is_rejected(minimum_login, admin):
    url, login, role = minimum_login
    other = "sender_role" if role == "worker_role" else "worker_role"
    admin.execute(sql.SQL("grant {} to {}").format(sql.Identifier(other), sql.Identifier(login)))
    try:
        with pytest.raises(RlsNotEnforced, match="session_user"):
            await _connect(url, role, role)
    finally:
        admin.execute(sql.SQL("revoke {} from {}").format(
            sql.Identifier(other), sql.Identifier(login)
        ))


async def test_privileged_ancestor_is_rejected(minimum_login, admin):
    url, login, role = minimum_login
    ancestor = "test_login_ancestor_" + uuid.uuid4().hex
    admin.execute(sql.SQL("create role {} nologin createrole").format(sql.Identifier(ancestor)))
    try:
        admin.execute(sql.SQL("grant {} to {}").format(
            sql.Identifier(ancestor), sql.Identifier(login)
        ))
        with pytest.raises(RlsNotEnforced, match="session_user"):
            await _connect(url, role, role)
    finally:
        admin.execute(sql.SQL("drop role {}").format(sql.Identifier(ancestor)))


async def test_login_administrative_attribute_is_rejected(minimum_login, admin):
    url, login, role = minimum_login
    admin.execute(sql.SQL("alter role {} createdb").format(sql.Identifier(login)))
    try:
        with pytest.raises(RlsNotEnforced, match="session_user"):
            await _connect(url, role, role)
    finally:
        admin.execute(sql.SQL("alter role {} nocreatedb").format(sql.Identifier(login)))


async def test_direct_login_table_grant_is_rejected(minimum_login, admin):
    url, login, role = minimum_login
    admin.execute(sql.SQL("grant select on public.conversations to {}").format(
        sql.Identifier(login)
    ))
    try:
        with pytest.raises(RlsNotEnforced, match="session_user"):
            await _connect(url, role, role)
    finally:
        admin.execute(sql.SQL("revoke select on public.conversations from {}").format(
            sql.Identifier(login)
        ))
