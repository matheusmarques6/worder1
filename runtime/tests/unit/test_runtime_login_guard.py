"""Reject a privileged session even after SET ROLE hides its authority."""

from unittest.mock import AsyncMock

import pytest

from agents_runtime.repository.scope import RlsNotEnforced, assert_rls_enforced


@pytest.mark.parametrize(
    "session,roles,elevated,owns,admin,direct_acl,can_login",
    [
        ("postgres", ["postgres", "worker_role"], True, True, False, False, True),
        ("runtime_worker_login", ["runtime_worker_login", "worker_role", "owner"],
         True, False, False, False, True),
        ("runtime_worker_login", ["runtime_worker_login", "worker_role", "sender_role"],
         False, False, False, False, True),
        ("runtime_worker_login", ["runtime_worker_login", "worker_role"],
         False, True, False, False, True),
        ("runtime_worker_login", ["runtime_worker_login", "worker_role"],
         False, False, True, False, True),
        ("runtime_worker_login", ["runtime_worker_login", "worker_role"],
         False, False, False, True, True),
    ],
)
async def test_production_rejects_escalation_after_set_role(
    monkeypatch, session, roles, elevated, owns, admin, direct_acl, can_login,
):
    monkeypatch.setenv("DEPLOY_ENV", "production")
    cursor = AsyncMock()
    cursor.fetchone.side_effect = [
        ("worker_role", False, False),
        (session, roles, elevated, owns, admin, direct_acl, can_login),
    ]
    conn = AsyncMock()
    conn.execute.return_value = cursor
    with pytest.raises(RlsNotEnforced, match="session_user"):
        await assert_rls_enforced(conn, "worker_role")


@pytest.mark.parametrize("kind", ["worker", "sender"])
async def test_production_accepts_only_narrow_login(monkeypatch, kind):
    monkeypatch.setenv("DEPLOY_ENV", "production")
    role, login = f"{kind}_role", f"runtime_{kind}_login"
    cursor = AsyncMock()
    cursor.fetchone.side_effect = [
        (role, False, False),
        (login, [login, role], False, False, False, False, True),
    ]
    conn = AsyncMock()
    conn.execute.return_value = cursor
    await assert_rls_enforced(conn, role)


async def test_development_keeps_disposable_owner_set_role_compatibility(monkeypatch):
    monkeypatch.setenv("DEPLOY_ENV", "development")
    conn = AsyncMock()
    conn.execute.return_value.fetchone.return_value = ("worker_role", False, False)
    await assert_rls_enforced(conn, "worker_role")
