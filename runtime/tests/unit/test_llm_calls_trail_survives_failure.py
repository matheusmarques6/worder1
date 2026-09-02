"""Auditoria 2026-08-28, item 37, fix round 1 — ruling D provado, não só
seguido de cabeça.

`_recorder` (`agent_core/responder.py`) grava `internal.llm_calls`, e o INSERT
dispara, na MESMA transação, o trigger que espelha para `ai_usage_logs`
(`supabase/migrations/20260902000001_ai_usage_logs_bridge.sql`). Ruling D do
item: falha de trilha se registra e segue — nunca derruba o turno. É o mesmo
padrão que `note_step` já usa (`responder.py`, "adereço nunca vira causa de
morte do turno").

Antes deste teste, a garantia existia só em comentário: nada provava que o
`except` ao redor do INSERT realmente engole a falha em vez de deixá-la subir
— `MeteredLlm._bill` (`agent_core/metering.py`) chama `self._record(...)` sem
try/except nenhum ao redor, então uma exceção não capturada aqui mataria o
turno inteiro, exatamente o que o ruling proíbe.
"""

import uuid

import pytest

from agents_runtime.agent_core import responder as responder_module
from agents_runtime.agent_core.metering import CallRecord


class _FakeTransaction:
    """`async with conn.transaction():` sem tocar em Postgres nenhum. Nunca
    engole a exceção — mesmo contrato do gerenciador real do psycopg: faz
    rollback e deixa a exceção subir para quem chamou."""

    async def __aenter__(self) -> "_FakeTransaction":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False


class _FakeConnection:
    """Só precisa parecer uma conexão o suficiente para
    `scope_to_organization` (um `execute` qualquer) e para
    `async with conn.transaction():` acima — nunca fala com um banco real."""

    def transaction(self) -> _FakeTransaction:
        return _FakeTransaction()

    async def execute(self, *args: object, **kwargs: object) -> None:
        return None


async def _boom(*args: object, **kwargs: object) -> None:
    raise RuntimeError("trigger de espelho falhou (simulado)")


def _a_call_record() -> CallRecord:
    return CallRecord(
        purpose="agent_reply",
        provider="openrouter",
        model="anthropic/claude-sonnet-5",
        input_tokens=10,
        output_tokens=5,
        cost_usd=0.0001,
        latency_ms=100,
    )


class TestTheTrailNeverKillsTheTurn:
    async def test_a_failed_write_is_swallowed_not_raised(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(responder_module.llm_repo, "record_llm_call", _boom)
        record = responder_module._recorder(
            _FakeConnection(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        )

        # Não levanta — é a garantia inteira do ruling D.
        await record(_a_call_record())

    async def test_the_failure_still_reaches_the_logger(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Silenciar sem rastro seria pior que matar o turno — ninguém saberia
        que a linha de custo sumiu."""
        monkeypatch.setattr(responder_module.llm_repo, "record_llm_call", _boom)
        caplog.set_level("DEBUG", logger=responder_module.logger.name)
        record = responder_module._recorder(
            _FakeConnection(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        )

        await record(_a_call_record())

        assert "llm_calls write failed" in caplog.text

    async def test_a_successful_write_still_calls_the_repository(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """O `except` não pode virar um `pass` disfarçado que engole tudo,
        inclusive a chamada de verdade — prova o caminho feliz ao lado do
        caminho de falha, no mesmo teste que os separa."""
        calls: list[dict[str, object]] = []

        async def _spy(conn: object, **kwargs: object) -> int:
            calls.append(kwargs)
            return 1

        monkeypatch.setattr(responder_module.llm_repo, "record_llm_call", _spy)
        organization_id, conversation_id, agent_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        record = responder_module._recorder(
            _FakeConnection(), organization_id, conversation_id, agent_id
        )

        await record(_a_call_record())

        assert len(calls) == 1
        assert calls[0]["organization_id"] == organization_id
        assert calls[0]["conversation_id"] == conversation_id
        assert calls[0]["agent_id"] == agent_id
