"""Os guards de comportamento do lojista, portados do TS (auditoria item 30).

Cada guard tem o caso que CALA e o caso que DEIXA PASSAR — um guard que
ninguém viu barrar não é guard. Os detalhes de contrato que o TS documenta em
comentário (`stop_on_human_reply` default TRUE, keyword sem acento, cooldown
que vale mesmo depois de um humano religar a IA) valem aqui: divergência de
comportamento entre os dois motores é exatamente a doença que o item 30 trata.

Fonte da verdade: `src/lib/ai/guards.ts` e o bloco de `src/lib/ai/cloud-runner.ts`
a partir de `:462`.
"""

from datetime import UTC, datetime, timedelta
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


class TestTransferCooldown:
    """`behavior.cooldown_after_transfer` — cloud-runner.ts:500-513 + guards.ts:61-69."""

    def test_inside_the_cooldown_is_silent(self) -> None:
        silence = evaluate_inbound_guards(
            {"behavior": {"cooldown_after_transfer": 300}},
            state(ai_transferred_at=NOW - timedelta(seconds=299)),
            agent_id=AGENT,
            now=NOW,
        )

        assert silence is not None
        assert silence.reason == "transfer_cooldown"

    def test_after_the_cooldown_answers(self) -> None:
        assert (
            evaluate_inbound_guards(
                {"behavior": {"cooldown_after_transfer": 300}},
                state(ai_transferred_at=NOW - timedelta(seconds=301)),
                agent_id=AGENT,
                now=NOW,
            )
            is None
        )

    def test_default_is_three_hundred_seconds(self) -> None:
        """Sem a chave configurada o TS usa 300s (guards.ts:63)."""
        assert (
            evaluate_inbound_guards(
                {}, state(ai_transferred_at=NOW - timedelta(seconds=299)),
                agent_id=AGENT, now=NOW,
            )
            is not None
        )
        assert (
            evaluate_inbound_guards(
                {}, state(ai_transferred_at=NOW - timedelta(seconds=301)),
                agent_id=AGENT, now=NOW,
            )
            is None
        )

    def test_zero_or_negative_turns_the_cooldown_off(self) -> None:
        for value in (0, -1):
            assert (
                evaluate_inbound_guards(
                    {"behavior": {"cooldown_after_transfer": value}},
                    state(ai_transferred_at=NOW),
                    agent_id=AGENT,
                    now=NOW,
                )
                is None
            )

    def test_garbage_turns_the_cooldown_off(self) -> None:
        """`Number('abc')` é NaN, e o TS trata NaN como desligado."""
        assert (
            evaluate_inbound_guards(
                {"behavior": {"cooldown_after_transfer": "abc"}},
                state(ai_transferred_at=NOW),
                agent_id=AGENT,
                now=NOW,
            )
            is None
        )

    def test_never_transferred_answers(self) -> None:
        assert (
            evaluate_inbound_guards(
                {"behavior": {"cooldown_after_transfer": 300}},
                state(ai_transferred_at=None),
                agent_id=AGENT,
                now=NOW,
            )
            is None
        )

    def test_the_cooldown_survives_a_human_turning_the_ai_back_on(self) -> None:
        """Contrato documentado no TS (cloud-runner.ts:502-504): ai_transferred_at
        NÃO é limpo na reativação manual, então o cooldown vale mesmo depois de
        um humano religar a IA. Religar não é pedir para falar por cima."""
        silence = evaluate_inbound_guards(
            {"behavior": {"cooldown_after_transfer": 300}},
            # ai_enabled voltou a true (não é lido aqui); a marca da
            # transferência continua onde estava.
            state(ai_transferred_at=NOW - timedelta(seconds=10)),
            agent_id=AGENT,
            now=NOW,
        )

        assert silence is not None
        assert silence.reason == "transfer_cooldown"

    def test_manual_activation_wins_over_the_cooldown(self) -> None:
        """A ordem do TS decide o motivo que o lojista lê."""
        silence = evaluate_inbound_guards(
            {"behavior": {"activate_on": "manual", "cooldown_after_transfer": 300}},
            state(ai_agent_id=None, ai_transferred_at=NOW),
            agent_id=AGENT,
            now=NOW,
        )

        assert silence is not None
        assert silence.reason == "manual_activation_required"


class TestRecentReplyCooldown:
    """O cooldown curto de cloud-runner.ts:515-535 (constante COOLDOWN_MS = 5000).

    Não é knob de loja: é o anti-loop de quem responde duas vezes à mesma
    rajada. Por ser transiente e sumir sozinho, o badge do inbox o ignora de
    propósito (conversation-ai-status.ts:110-113) — mas o turno, não.
    """

    def test_the_agent_that_just_answered_is_silent(self) -> None:
        silence = evaluate_inbound_guards(
            {},
            state(last_bot_message_at=NOW - timedelta(seconds=4)),
            agent_id=AGENT,
            now=NOW,
        )

        assert silence is not None
        assert silence.reason == "cooldown"

    def test_five_seconds_later_answers(self) -> None:
        assert (
            evaluate_inbound_guards(
                {},
                state(last_bot_message_at=NOW - timedelta(seconds=6)),
                agent_id=AGENT,
                now=NOW,
            )
            is None
        )

    def test_an_agent_that_never_answered_here_is_not_in_cooldown(self) -> None:
        assert (
            evaluate_inbound_guards(
                {}, state(last_bot_message_at=None), agent_id=AGENT, now=NOW
            )
            is None
        )

    def test_the_transfer_cooldown_wins(self) -> None:
        silence = evaluate_inbound_guards(
            {},
            state(
                ai_transferred_at=NOW - timedelta(seconds=10),
                last_bot_message_at=NOW - timedelta(seconds=1),
            ),
            agent_id=AGENT,
            now=NOW,
        )

        assert silence is not None
        assert silence.reason == "transfer_cooldown"


class TestMaxMessagesPerConversation:
    """`behavior.max_messages_per_conversation` — cloud-runner.ts:537-548."""

    def test_at_the_ceiling_is_silent(self) -> None:
        silence = evaluate_inbound_guards(
            {"behavior": {"max_messages_per_conversation": 3}},
            state(bot_message_count=3),
            agent_id=AGENT,
            now=NOW,
        )

        assert silence is not None
        assert silence.reason == "max_messages"

    def test_below_the_ceiling_answers(self) -> None:
        assert (
            evaluate_inbound_guards(
                {"behavior": {"max_messages_per_conversation": 3}},
                state(bot_message_count=2),
                agent_id=AGENT,
                now=NOW,
            )
            is None
        )

    def test_zero_means_no_ceiling(self) -> None:
        """`Number(x || 0)` e `if (maxMessages > 0)`: só um positivo liga o guard."""
        assert (
            evaluate_inbound_guards(
                {"behavior": {"max_messages_per_conversation": 0}},
                state(bot_message_count=99),
                agent_id=AGENT,
                now=NOW,
            )
            is None
        )

    def test_the_detail_names_the_configured_ceiling(self) -> None:
        silence = evaluate_inbound_guards(
            {"behavior": {"max_messages_per_conversation": 3}},
            state(bot_message_count=5),
            agent_id=AGENT,
            now=NOW,
        )

        assert silence is not None
        assert "3" in silence.detail


class TestSettingsGarbageNeverSilences:
    """jsonb malformado degrada para "responde" — nunca para um mudo sem motivo."""

    @pytest.mark.parametrize("settings", [None, {}, {"behavior": None}, {"behavior": []}])
    def test_no_behavior_block_answers(self, settings) -> None:
        assert evaluate_inbound_guards(settings, state(), agent_id=AGENT, now=NOW) is None
