"""Os guards de comportamento do lojista, portados do TS (auditoria item 30).

Cada guard tem o caso que CALA e o caso que DEIXA PASSAR — um guard que
ninguém viu barrar não é guard. Os detalhes de contrato que o TS documenta em
comentário (`stop_on_human_reply` default TRUE, keyword sem acento, cooldown
que vale mesmo depois de um humano religar a IA) valem aqui: divergência de
comportamento entre os dois motores é exatamente a doença que o item 30 trata.

Fonte da verdade: `src/lib/ai/guards.ts` e o bloco de `src/lib/ai/cloud-runner.ts`
a partir de `:462`.
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from agents_runtime.agent_core.guards import (
    GuardState,
    evaluate_inbound_guards,
)

pytestmark = pytest.mark.unit


AGENT = uuid4()
NOW = datetime(2026, 8, 31, 15, 0, tzinfo=UTC)


def state(**overrides) -> GuardState:
    base = {
        "ai_agent_id": AGENT,
        "ai_transferred_at": None,
        "bot_message_count": 0,
        "last_bot_message_at": None,
        "has_human_reply": False,
    }
    return GuardState(**{**base, **overrides})


class TestActivateOnManual:
    """`behavior.activate_on: 'manual'` — cloud-runner.ts:486-496."""

    def test_manual_agent_not_assigned_to_this_conversation_is_silent(self) -> None:
        silence = evaluate_inbound_guards(
            {"behavior": {"activate_on": "manual"}},
            state(ai_agent_id=uuid4()),
            agent_id=AGENT,
            now=NOW,
        )

        assert silence is not None
        assert silence.reason == "manual_activation_required"

    def test_manual_agent_assigned_to_this_conversation_answers(self) -> None:
        assert (
            evaluate_inbound_guards(
                {"behavior": {"activate_on": "manual"}},
                state(ai_agent_id=AGENT),
                agent_id=AGENT,
                now=NOW,
            )
            is None
        )

    def test_conversation_without_any_assignment_silences_a_manual_agent(self) -> None:
        """Sem linha no espelho legado o campo vem NULL — e NULL não é ESTE
        agente, então o manual continua calado (paridade com o `!==` do TS)."""
        silence = evaluate_inbound_guards(
            {"behavior": {"activate_on": "manual"}},
            state(ai_agent_id=None),
            agent_id=AGENT,
            now=NOW,
        )

        assert silence is not None
        assert silence.reason == "manual_activation_required"

    def test_automatic_agent_ignores_the_assignment(self) -> None:
        """Default (`activate_on` ausente) é automático: responde conversa nova."""
        assert (
            evaluate_inbound_guards(
                {},
                state(ai_agent_id=uuid4()),
                agent_id=AGENT,
                now=NOW,
            )
            is None
        )

    def test_silence_carries_a_readable_reason(self) -> None:
        silence = evaluate_inbound_guards(
            {"behavior": {"activate_on": "manual"}},
            state(ai_agent_id=None),
            agent_id=AGENT,
            now=NOW,
        )

        assert silence is not None
        assert silence.detail.strip()


class TestSettingsGarbageNeverSilences:
    """jsonb malformado degrada para "responde" — nunca para um mudo sem motivo."""

    @pytest.mark.parametrize("settings", [None, {}, {"behavior": None}, {"behavior": []}])
    def test_no_behavior_block_answers(self, settings) -> None:
        assert evaluate_inbound_guards(settings, state(), agent_id=AGENT, now=NOW) is None
