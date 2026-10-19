"""Deployment must select separate logins before opening any listener."""

from unittest.mock import AsyncMock

import pytest

from agents_runtime import __main__ as entrypoint
from agents_runtime.repository.scope import RlsNotEnforced


@pytest.mark.parametrize("missing", ["AGENTS_WORKER_DB_URL", "AGENTS_SENDER_DB_URL"])
async def test_production_requires_both_explicit_runtime_dsns(monkeypatch, missing):
    monkeypatch.setenv("DEPLOY_ENV", "production")
    monkeypatch.setenv("AGENTS_WORKER_DB_URL", "worker-secret")
    monkeypatch.setenv("AGENTS_SENDER_DB_URL", "sender-secret")
    monkeypatch.delenv(missing)
    monkeypatch.delenv("AGENTS_HTTP_PORT", raising=False)
    with pytest.raises(RuntimeError, match=missing):
        await entrypoint._serve("legacy-owner-secret")


async def test_sender_login_is_checked_before_http_listener(monkeypatch):
    monkeypatch.setenv("DEPLOY_ENV", "production")
    monkeypatch.setenv("AGENTS_WORKER_DB_URL", "worker-secret")
    monkeypatch.setenv("AGENTS_SENDER_DB_URL", "sender-secret")
    monkeypatch.setenv("AGENTS_HTTP_PORT", "1234")

    async def connect(dsn, *args, **kwargs):
        if dsn == "sender-secret":
            raise RlsNotEnforced("unsafe sender session_user")
        return AsyncMock()

    async def serve(*args, **kwargs):
        pytest.fail("HTTP opened before sender login verification")

    monkeypatch.setattr(entrypoint, "_connect", connect)
    monkeypatch.setattr(entrypoint.server, "serve", serve)
    with pytest.raises(RlsNotEnforced, match="sender session_user"):
        await entrypoint._serve("legacy-owner-secret")


async def test_factories_and_runtime_receive_the_matching_dsn(monkeypatch):
    monkeypatch.setenv("DEPLOY_ENV", "development")
    monkeypatch.setenv("AGENTS_WORKER_DB_URL", "worker-secret")
    monkeypatch.setenv("AGENTS_SENDER_DB_URL", "sender-secret")
    monkeypatch.delenv("AGENTS_HTTP_PORT", raising=False)
    received = {}

    def factory(variable, dsn, **kwargs):
        received[variable] = dsn
        return object()

    async def run(dsn, **kwargs):
        received["worker"] = dsn
        received["sender"] = kwargs.get("sender_dsn")

    monkeypatch.setattr(entrypoint, "_factory_from_env", factory)
    monkeypatch.setattr(entrypoint, "run", run)
    await entrypoint._serve("legacy-owner-secret")
    assert received == {
        "worker": "worker-secret", "sender": "sender-secret",
        "AGENTS_CHANNEL": "sender-secret", "AGENTS_RESPONDER": "worker-secret",
        "AGENTS_TOUCHER": "worker-secret",
    }
