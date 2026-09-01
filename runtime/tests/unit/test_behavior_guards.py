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
    is_within_schedule,
    resolve_blocked_topic,
    resolve_handoff,
    schedule_silence,
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


class TestStopOnHumanReply:
    """`behavior.stop_on_human_reply` — cloud-runner.ts:550-560."""

    def test_default_is_on(self) -> None:
        """Sem a chave, o guard VALE (`!== false` no TS). Um default invertido
        aqui devolveria em silêncio o takeover que dura uma mensagem."""
        silence = evaluate_inbound_guards(
            {}, state(has_human_reply=True), agent_id=AGENT, now=NOW
        )

        assert silence is not None
        assert silence.reason == "stop_on_human"

    def test_explicit_false_turns_it_off(self) -> None:
        assert (
            evaluate_inbound_guards(
                {"behavior": {"stop_on_human_reply": False}},
                state(has_human_reply=True),
                agent_id=AGENT,
                now=NOW,
            )
            is None
        )

    def test_without_a_human_reply_the_agent_answers(self) -> None:
        assert (
            evaluate_inbound_guards(
                {"behavior": {"stop_on_human_reply": True}},
                state(has_human_reply=False),
                agent_id=AGENT,
                now=NOW,
            )
            is None
        )

    def test_the_guard_is_permanent_for_the_conversation(self) -> None:
        """Uma única resposta manual no passado silencia o agente para sempre
        NESTA conversa — não há janela que a expire, e não é o ai_enabled que
        barra (a flag pode estar true; quem barra é este guard)."""
        long_ago = NOW - timedelta(days=90)
        silence = evaluate_inbound_guards(
            {},
            state(has_human_reply=True, last_bot_message_at=long_ago),
            agent_id=AGENT,
            now=NOW,
        )

        assert silence is not None
        assert silence.reason == "stop_on_human"

    def test_the_ceiling_is_checked_before_the_human_reply(self) -> None:
        silence = evaluate_inbound_guards(
            {"behavior": {"max_messages_per_conversation": 1}},
            state(bot_message_count=1, has_human_reply=True),
            agent_id=AGENT,
            now=NOW,
        )

        assert silence is not None
        assert silence.reason == "max_messages"


HANDOFF_SETTINGS = {
    "safety": {
        "handoff_keywords": ["atendente", "falar com humano"],
        "handoff_confirmation_message": "  Já estou te passando para alguém.  ",
    }
}


class TestHandoffKeywords:
    """`safety.handoff_keywords` — cloud-runner.ts:98-167 + guards.ts:25-37."""

    def test_the_keyword_transfers(self) -> None:
        handoff = resolve_handoff(HANDOFF_SETTINGS, ("quero um atendente agora",))

        assert handoff is not None
        assert handoff.keyword == "atendente"

    def test_a_conversation_without_the_keyword_does_not_transfer(self) -> None:
        assert resolve_handoff(HANDOFF_SETTINGS, ("quanto custa o frete?",)) is None

    def test_matching_ignores_case_and_accents(self) -> None:
        """pt-BR no celular: "ATENDENTE", "atêndente" e "atendente" são a
        mesma palavra. guards.ts:normalizeForMatch usa NFD por isso."""
        for text in ("ATENDENTE", "atêndente", "Atendente,"):
            assert resolve_handoff(HANDOFF_SETTINGS, (text,)) is not None

    def test_matching_is_by_substring(self) -> None:
        """Substring, não palavra inteira — é o que o TS faz, e mudar isso
        faria a mesma frase transferir num motor e não no outro."""
        assert resolve_handoff(HANDOFF_SETTINGS, ("atendenteeee",)) is not None

    def test_the_keyword_comes_back_in_the_configured_form(self) -> None:
        handoff = resolve_handoff(
            {"safety": {"handoff_keywords": ["Atendênte"]}}, ("quero atendente",)
        )

        assert handoff is not None
        assert handoff.keyword == "Atendênte"

    def test_the_confirmation_message_is_trimmed(self) -> None:
        handoff = resolve_handoff(HANDOFF_SETTINGS, ("atendente",))

        assert handoff is not None
        assert handoff.confirmation == "Já estou te passando para alguém."

    def test_without_a_confirmation_message_it_still_transfers(self) -> None:
        handoff = resolve_handoff(
            {"safety": {"handoff_keywords": ["atendente"]}}, ("atendente",)
        )

        assert handoff is not None
        assert handoff.confirmation == ""

    def test_no_keywords_configured_never_transfers(self) -> None:
        for settings in (None, {}, {"safety": {}}, {"safety": {"handoff_keywords": []}}):
            assert resolve_handoff(settings, ("quero um atendente",)) is None

    def test_any_message_of_the_burst_can_ask_for_a_human(self) -> None:
        """A janela do debounce entrega a rajada inteira; o pedido pode estar em
        qualquer uma delas."""
        handoff = resolve_handoff(HANDOFF_SETTINGS, ("oi", "tudo bem?", "quero atendente"))

        assert handoff is not None


BLOCKED_SETTINGS = {"safety": {"blocked_topics": ["processo judicial", "concorrente"]}}


class TestBlockedTopics:
    """`safety.blocked_topics` — cloud-sender.ts:129-163 + guards.ts:44-49.

    A exceção do item 30: é sobre o que o MODELO produziu, não sobre o que
    chegou, então fica do lado da saída, antes do envio — como no TS.
    """

    def test_a_forbidden_topic_in_the_draft_is_caught(self) -> None:
        assert (
            resolve_blocked_topic(
                BLOCKED_SETTINGS, "Nesse caso abra um processo judicial contra a loja."
            )
            == "processo judicial"
        )

    def test_a_clean_draft_passes(self) -> None:
        assert resolve_blocked_topic(BLOCKED_SETTINGS, "O frete sai em dois dias.") is None

    def test_matching_ignores_case_and_accents(self) -> None:
        assert (
            resolve_blocked_topic(
                {"safety": {"blocked_topics": ["jurídico"]}}, "Falo com o JURIDICO."
            )
            == "jurídico"
        )

    def test_nothing_configured_blocks_nothing(self) -> None:
        for settings in (None, {}, {"safety": {"blocked_topics": []}}):
            assert resolve_blocked_topic(settings, "qualquer coisa") is None

    def test_it_reads_the_response_not_the_inbound(self) -> None:
        """O guard de saída não olha o que o cliente escreveu: o cliente pode
        falar de qualquer assunto — quem não pode é a voz da loja."""
        assert resolve_blocked_topic(BLOCKED_SETTINGS, "") is None


SCHEDULE = {
    "schedule": {
        "always_active": False,
        "timezone": "America/Sao_Paulo",
        "hours": {"start": "08:00", "end": "18:00"},
        "days": ["mon", "tue", "wed", "thu", "fri"],
    }
}


def sao_paulo(day: int, hour: int, minute: int = 0) -> datetime:
    """UTC-3 sem horário de verão desde 2019: a hora local é a UTC menos 3.

    2026-08-31 é uma segunda-feira, então `day` anda pela semana a partir dela.
    """
    monday = datetime(2026, 8, 31, hour, minute, tzinfo=UTC)
    return monday + timedelta(days=day - 1, hours=3)


class TestBusinessHours:
    """`settings.schedule` — engine.ts:86-88 e :308-350.

    O achado citava `engine.ts` como caminho LEGADO, mas o caminho Cloud aplica
    o horário de verdade: `cloud-runner.ts:805` chama `createAgentEngine`, e
    `processMessage` lança "Fora do horário de atendimento" logo na entrada
    (`engine.ts:86`), que `failure-classifier.ts:15-18` classifica como `skip`.
    Há paridade a quebrar, então há trabalho a fazer.
    """

    def test_inside_the_window_answers(self) -> None:
        assert is_within_schedule(SCHEDULE, now=sao_paulo(1, 10)) is True

    def test_before_opening_is_silent(self) -> None:
        assert is_within_schedule(SCHEDULE, now=sao_paulo(1, 7, 59)) is False

    def test_after_closing_is_silent(self) -> None:
        assert is_within_schedule(SCHEDULE, now=sao_paulo(1, 18, 1)) is False

    def test_the_boundaries_are_inclusive(self) -> None:
        """`currentTime >= start && currentTime <= end` no TS: as pontas contam."""
        assert is_within_schedule(SCHEDULE, now=sao_paulo(1, 8)) is True
        assert is_within_schedule(SCHEDULE, now=sao_paulo(1, 18)) is True

    def test_a_day_outside_the_configured_week_is_silent(self) -> None:
        assert is_within_schedule(SCHEDULE, now=sao_paulo(6, 10)) is False  # sábado

    def test_the_timezone_is_the_configured_one_not_utc(self) -> None:
        """13:00 UTC é 10:00 em São Paulo (dentro) e 22:00 em Tóquio (fora).
        Sem o fuso configurado o guard cala a loja errada."""
        thirteen_utc = datetime(2026, 8, 31, 13, 0, tzinfo=UTC)

        assert is_within_schedule(SCHEDULE, now=thirteen_utc) is True
        assert (
            is_within_schedule(
                {"schedule": {**SCHEDULE["schedule"], "timezone": "Asia/Tokyo"}},
                now=thirteen_utc,
            )
            is False
        )

    def test_always_active_ignores_hours_and_days(self) -> None:
        assert (
            is_within_schedule(
                {"schedule": {**SCHEDULE["schedule"], "always_active": True}},
                now=sao_paulo(6, 3),
            )
            is True
        )

    def test_no_schedule_block_answers_around_the_clock(self) -> None:
        for settings in (None, {}, {"schedule": {}}):
            assert is_within_schedule(settings, now=sao_paulo(6, 3)) is True

    def test_the_defaults_are_the_ones_the_ts_hardcodes(self) -> None:
        """Bloco presente sem `hours`/`days`: 08:00-18:00, seg-sex."""
        only_tz = {"schedule": {"timezone": "America/Sao_Paulo"}}

        assert is_within_schedule(only_tz, now=sao_paulo(1, 12)) is True
        assert is_within_schedule(only_tz, now=sao_paulo(1, 20)) is False
        assert is_within_schedule(only_tz, now=sao_paulo(6, 12)) is False

    def test_an_unknown_timezone_never_silences_the_store(self) -> None:
        """Um typo no fuso não pode calar a loja inteira: aqui o guard abre
        mão, e o caminho TS morre no Intl e vira retry. Nenhum dos dois
        silencia sem motivo — é a divergência que sobra, e é a menos ruim."""
        assert (
            is_within_schedule(
                {"schedule": {**SCHEDULE["schedule"], "timezone": "Marte/Olympus"}},
                now=sao_paulo(6, 3),
            )
            is True
        )

    def test_the_guard_is_a_silence_with_a_reason(self) -> None:
        silence = schedule_silence(SCHEDULE, now=sao_paulo(6, 3))

        assert silence is not None
        assert silence.reason == "outside_business_hours"
        assert silence.detail.strip()

    def test_inside_the_window_there_is_no_silence(self) -> None:
        assert schedule_silence(SCHEDULE, now=sao_paulo(1, 10)) is None

    def test_it_is_separate_from_the_inbound_guards_on_purpose(self) -> None:
        """No TS o horário é checado DENTRO do engine (engine.ts:85-88), depois
        do handoff por keyword (cloud-runner.ts:578-585). Fundir os dois faria
        um pedido de atendente fora do horário virar silêncio em vez de
        transferência — divergência que o item 30 existe para não criar."""
        assert (
            evaluate_inbound_guards(SCHEDULE, state(), agent_id=AGENT, now=sao_paulo(6, 3))
            is None
        )


class TestSettingsGarbageNeverSilences:
    """jsonb malformado degrada para "responde" — nunca para um mudo sem motivo."""

    @pytest.mark.parametrize("settings", [None, {}, {"behavior": None}, {"behavior": []}])
    def test_no_behavior_block_answers(self, settings) -> None:
        assert evaluate_inbound_guards(settings, state(), agent_id=AGENT, now=NOW) is None
