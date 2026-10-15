"""Desfechos e eventos (alteração 2026-10-15-14): as regras puras e a
garantia de que telemetria nunca derruba o turno."""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from agents_runtime.queueing import worker
from agents_runtime.repository import outcomes


class TestRules:
    @pytest.mark.parametrize(
        ("reason", "code"),
        [
            ("tool:complaint", "complaint"),
            ("keyword", "keyword"),
            ("blocked_topic", "blocked_topic"),
        ],
    )
    def test_handoff_code(self, reason: str, code: str) -> None:
        assert outcomes.handoff_code(reason) == code

    def test_only_granted_coupons_are_offers(self) -> None:
        calls = (
            {"name": "create_coupon", "result": {"decision": "issued", "code": "X1"}},
            {"name": "create_coupon", "result": {"decision": "denied"}},
            {"name": "product_lookup", "result": {"decision": "issued"}},
            {"_truncated": "tool_calls"},
        )
        assert outcomes.coupon_offers(calls) == [{"decision": "issued", "code": "X1"}]

    async def test_event_kind_is_closed(self) -> None:
        with pytest.raises(ValueError):
            await outcomes.record_event(AsyncMock(), organization_id=uuid4(), kind="party")


class _Txn:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class TestWorkerHook:
    async def test_a_turn_with_a_coupon_records_turn_offer_and_event(self, monkeypatch) -> None:
        record_turn, mark, event = AsyncMock(), AsyncMock(), AsyncMock()
        monkeypatch.setattr(worker.outcomes_repo, "record_turn", record_turn)
        monkeypatch.setattr(worker.outcomes_repo, "mark", mark)
        monkeypatch.setattr(worker.outcomes_repo, "record_event", event)
        agent = uuid4()
        trace = SimpleNamespace(
            agent_id=agent, tokens=120,
            tool_calls=({"name": "create_coupon", "result": {"decision": "issued", "code": "C"}},),
        )
        conn = SimpleNamespace(transaction=lambda: _Txn())
        await worker._record_outcome(conn, uuid4(), uuid4(), trace)
        assert record_turn.await_args.kwargs["tokens"] == 120
        assert mark.await_args.kwargs["incentive_offered"] is True
        assert event.await_args.kwargs["kind"] == "incentive"

    async def test_a_failing_write_never_raises(self, monkeypatch) -> None:
        monkeypatch.setattr(
            worker.outcomes_repo, "record_turn", AsyncMock(side_effect=RuntimeError("db"))
        )
        trace = SimpleNamespace(agent_id=None, tokens=None, tool_calls=())
        conn = SimpleNamespace(transaction=lambda: _Txn())
        await worker._record_outcome(conn, uuid4(), uuid4(), trace)


class TestBlockedMetadata:
    """Alteração 2026-10-15-16: o evento `blocked` diz quais critérios reprovaram."""

    def test_keeps_reason_and_unique_criteria(self) -> None:
        meta = outcomes.blocked_metadata(
            "critical", ("sem-promessas-inventadas", "tom-da-marca", "sem-promessas-inventadas")
        )
        assert meta == {
            "blocked_by": "critical",
            "failed": ["sem-promessas-inventadas", "tom-da-marca"],
        }

    def test_without_criteria_has_only_reason(self) -> None:
        assert outcomes.blocked_metadata("judge_unusable", ()) == {"blocked_by": "judge_unusable"}

    def test_caps_at_five(self) -> None:
        meta = outcomes.blocked_metadata("critical", tuple(f"c{i}" for i in range(9)))
        assert meta["failed"] == ["c0", "c1", "c2", "c3", "c4"]
