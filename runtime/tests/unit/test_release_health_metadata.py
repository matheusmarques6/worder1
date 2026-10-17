"""Release probes must identify the runtime tested, not merely a healthy old worker."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from agents_runtime.server import _healthz


async def test_candidate_health_identifies_exact_commit_and_environment(monkeypatch):
    monkeypatch.setenv("RENDER_GIT_COMMIT", "a" * 40)
    monkeypatch.setenv("DEPLOY_ENV", "staging")
    health = SimpleNamespace(
        beat_age_seconds=AsyncMock(return_value=1.25), finish_probe=Mock(), expire=Mock(),
    )
    response = await _healthz(health, max_age_s=30)
    body = json.loads(response.split(b"\r\n\r\n", 1)[1])
    assert body["status"] == "ok"
    assert body["beat_age_s"] == 1.25
    assert body.get("commit") == "a" * 40
    assert body.get("environment") == "staging"


async def test_invalid_revision_cannot_be_presented_as_release_evidence(monkeypatch):
    monkeypatch.setenv("RENDER_GIT_COMMIT", "not-a-commit")
    monkeypatch.delenv("AGENTS_COMMIT_SHA", raising=False)
    health = SimpleNamespace(
        beat_age_seconds=AsyncMock(return_value=0.1), finish_probe=Mock(), expire=Mock(),
    )
    response = await _healthz(health, max_age_s=30)
    body = json.loads(response.split(b"\r\n\r\n", 1)[1])
    assert body.get("commit") is None
