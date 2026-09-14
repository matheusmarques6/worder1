import json
from datetime import datetime
from pathlib import Path
from uuid import UUID

import pytest

from agents_runtime.agent_core.guards import (
    GuardState,
    evaluate_inbound_guards,
    is_within_schedule,
)

CONTRACT = json.loads(
    (Path(__file__).resolve().parents[3] / "fixtures/ai-guard-contract.json").read_text(
        encoding="utf-8"
    )
)
CASES = CONTRACT["schedules"]
STATE_CASES = CONTRACT["state_cases"]
AGENT = UUID("11111111-1111-1111-1111-111111111111")
OTHER_AGENT = UUID("22222222-2222-2222-2222-222222222222")


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["id"])
def test_shared_schedule(case):
    assert is_within_schedule(
        {"schedule": case["schedule"]}, now=datetime.fromisoformat(case["now"])
    ) is case["expected"]


@pytest.mark.parametrize("case", STATE_CASES, ids=lambda case: case["id"])
def test_shared_guard_state(case):
    raw = case["state"]
    assignment = raw.get("assignment")
    ai_agent_id = (
        AGENT if assignment == "self" else OTHER_AGENT if assignment == "other" else None
    )
    silence = evaluate_inbound_guards(
        case["settings"],
        GuardState(
            ai_enabled=raw.get("ai_enabled", True),
            ai_agent_id=ai_agent_id,
            ai_transferred_at=(
                datetime.fromisoformat(raw["transferred_at"])
                if raw.get("transferred_at")
                else None
            ),
            bot_message_count=raw.get("bot_message_count", 0),
            last_bot_message_at=(
                datetime.fromisoformat(raw["last_bot_message_at"])
                if raw.get("last_bot_message_at")
                else None
            ),
            has_human_reply=raw.get("has_human_reply", False),
        ),
        agent_id=AGENT,
        now=datetime.fromisoformat(case["now"]),
    )
    assert (silence.reason if silence else None) == case["expected"]
