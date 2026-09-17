"""Humanização 8.3 — a paridade com o legado é PROVADA, não declarada.

Os vetores de `bubble_vectors.json` foram gerados pelo `splitIntoBubbles` do
TS de verdade (gen-bubble-vectors.test.ts): cada caso compara o porte Python
byte a byte com o que o legado cortaria. O pacing prova os três contratos do
adendo (proporcional ao tamanho · teto curto por bolha · orçamento agregado),
e `send_humanized` prova a semântica de falha que é ADR-8: primeira bolha
falhou = nada saiu (retry ok); bolha do meio falhou = o que saiu VALE.
"""

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest

from agents_runtime.channels.humanize import (
    DEFAULT_REPLY_DELAY_MS,
    MAX_HUMANIZE_BUDGET_MS,
    MAX_INTER_BUBBLE_MS,
    MIN_INTER_BUBBLE_MS,
    Pacing,
    compute_pacing,
    split_into_bubbles,
)
from agents_runtime.clock import SystemClock
from agents_runtime.queueing.sender import send_humanized
from agents_runtime.repository.outbox import ClaimedSend
from tests.support.clock import FrozenClock
from tests.support.fake_conn import RecordingConnection

#: Item 38, fix round 1: os testes de `TestReadAndTyping` precisam de
#: `humanize_delays=True` para provar o disparo (Minor 2: o knob desliga os
#: dois juntos, como o TS) — `FrozenClock.sleep` avança o relógio sem esperar
#: de verdade, então isso não deixa a suíte lenta.
_FROZEN = FrozenClock(datetime(2026, 9, 2, 12, 0, tzinfo=UTC))

VECTORS = json.loads(
    (Path(__file__).parent / "fixtures" / "bubble_vectors.json").read_text(encoding="utf-8")
)["vectors"]


@pytest.mark.parametrize("vector", VECTORS, ids=[v["name"] for v in VECTORS])
def test_the_python_split_matches_the_legacy_ts(vector: dict) -> None:
    assert split_into_bubbles(vector["text"]) == vector["bubbles"]


class TestPacing:
    def test_a_single_bubble_only_thinks_before_speaking(self) -> None:
        pacing = compute_pacing(["oi"])
        assert pacing == Pacing((DEFAULT_REPLY_DELAY_MS,))

    def test_disabled_means_zero_everywhere(self) -> None:
        pacing = compute_pacing(["a", "b", "c"], enabled=False)
        assert pacing.delays_ms == (0, 0, 0)

    def test_the_delay_is_proportional_with_floor_and_cap(self) -> None:
        short = "oi"                # 2 chars * 20ms = 40ms → piso 700
        long = "x" * 500            # 10.000ms → teto 2.000
        pacing = compute_pacing(["primeira", short, long], reply_delay_ms=0)
        assert pacing.delays_ms == (0, MIN_INTER_BUBBLE_MS, MAX_INTER_BUBBLE_MS)

    def test_the_aggregate_budget_scales_everything_down(self) -> None:
        bubbles = ["primeira", "x" * 500, "x" * 500, "x" * 500]
        pacing = compute_pacing(bubbles)
        # 1500 + 3x2000 = 7500 <= 8000: sem escala. Força estourar:
        pacing = compute_pacing(bubbles, reply_delay_ms=4_000)
        assert pacing.total_ms <= MAX_HUMANIZE_BUDGET_MS
        # A proporção sobrevive à escala: o reply segue o maior delay.
        assert pacing.delays_ms[0] > pacing.delays_ms[1]


class _StubChannel:
    """Um canal que grava o que enviou e falha onde mandarem."""

    def __init__(self, fail_at: int | None = None, presence_fails: bool = False) -> None:
        self.sent: list[dict] = []
        self.presence_calls: list[str | None] = []
        self._fail_at = fail_at
        self._presence_fails = presence_fails

    async def send(self, conn, send: ClaimedSend) -> str:
        if self._fail_at is not None and len(self.sent) == self._fail_at:
            raise ConnectionError("provedor caiu nesta bolha")
        self.sent.append(dict(send.payload))
        return f"wamid-{len(self.sent)}"

    async def mark_read_and_typing(self, conn, send: ClaimedSend) -> None:
        self.presence_calls.append(send.last_inbound_wamid)
        if self._presence_fails:
            raise ConnectionError("a Meta recusou o mark-read/typing")


def _send(text: str, *, last_inbound_wamid: str | None = None) -> ClaimedSend:
    return ClaimedSend(
        outbox_id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        channel_type="whatsapp",
        channel_external_id="wa-1",
        to_phone_e164="+5511999999999",
        payload={"text": text},
        idempotency_key="idem-1",
        attempt_count=1,
        last_inbound_wamid=last_inbound_wamid,
    )


THREE_PARAGRAPHS = "Oi Joana!\n\nSeu carrinho está aqui.\n\nPosso ajudar a fechar?"


class TestSendHumanized:
    async def test_each_bubble_goes_out_in_order_with_the_same_key(self) -> None:
        channel = _StubChannel()
        delivered = await send_humanized(
            channel,
            RecordingConnection(),
            _send(THREE_PARAGRAPHS),
            humanize_delays=False,
            clock=SystemClock(),
        )

        assert [p["text"] for p in channel.sent] == [
            "Oi Joana!", "Seu carrinho está aqui.", "Posso ajudar a fechar?",
        ]
        assert [wamid for wamid, _ in delivered] == ["wamid-1", "wamid-2", "wamid-3"]

    async def test_a_template_never_splits(self) -> None:
        from dataclasses import replace as dc_replace

        channel = _StubChannel()
        send = dc_replace(_send("x"), payload={"template": {"name": "t", "language": "pt_BR"}})

        delivered = await send_humanized(
            channel, RecordingConnection(), send, humanize_delays=False, clock=SystemClock()
        )
        assert len(channel.sent) == 1
        assert channel.sent[0] == {"template": {"name": "t", "language": "pt_BR"}}
        assert len(delivered) == 1

    async def test_first_bubble_failure_raises_and_nothing_counts(self) -> None:
        channel = _StubChannel(fail_at=0)
        with pytest.raises(ConnectionError):
            await send_humanized(
                channel,
                RecordingConnection(),
                _send(THREE_PARAGRAPHS),
                humanize_delays=False,
                clock=SystemClock(),
            )
        assert channel.sent == []

    async def test_every_call_to_the_graph_is_reported_to_the_guard(self) -> None:
        """Ruling N do item 32: o alimento do breaker é por CHAMADA.

        Três bolhas são três chamadas ao Graph, e a Meta conta três — não uma
        linha de outbox. Sem isto o breaker enxergaria um terço do que a conta
        realmente fez.
        """
        conn = RecordingConnection()
        await send_humanized(
            _StubChannel(),
            conn,
            _send(THREE_PARAGRAPHS),
            humanize_delays=False,
            clock=SystemClock(),
        )

        assert conn.guard_reports() == [("wa-1", True, False)] * 3

    async def test_a_middle_failure_reports_the_refusal_too(self) -> None:
        """A metade que separa "por chamada" de "por linha": a 1ª bolha saiu e
        a 2ª foi recusada. A LINHA vale como enviada, mas a conta acabou de
        recusar — e é isso que o breaker precisa saber."""
        conn = RecordingConnection()
        await send_humanized(
            _StubChannel(fail_at=1),
            conn,
            _send(THREE_PARAGRAPHS),
            humanize_delays=False,
            clock=SystemClock(),
        )

        assert conn.guard_reports() == [("wa-1", True, False), ("wa-1", False, False)]

    async def test_a_middle_failure_keeps_what_left_and_never_retries(self) -> None:
        channel = _StubChannel(fail_at=1)
        delivered = await send_humanized(
            channel,
            RecordingConnection(),
            _send(THREE_PARAGRAPHS),
            humanize_delays=False,
            clock=SystemClock(),
        )

        assert [p["text"] for p in channel.sent] == ["Oi Joana!"]
        assert delivered == [("wamid-1", "Oi Joana!")]


class TestReadAndTyping:
    """Item 38 — read + typing de carona, antes de CADA bolha (ruling E).

    `humanize_delays=True` + `_FROZEN` em toda esta classe (fix round 1,
    Minor 2): o disparo agora exige o ritmo LIGADO, como o TS
    (`!skipDelays && inboundMessageId`), e `FrozenClock.sleep` avança o
    relógio sem esperar de verdade — a suíte continua instantânea.
    """

    async def test_no_wamid_means_silence(self) -> None:
        """Ruling D: sem wamid do último inbound, nada é mandado."""
        channel = _StubChannel()
        await send_humanized(
            channel,
            RecordingConnection(),
            _send(THREE_PARAGRAPHS),  # last_inbound_wamid=None, default
            humanize_delays=True,
            clock=_FROZEN,
        )
        assert channel.presence_calls == []

    async def test_with_wamid_it_fires_before_every_bubble(self) -> None:
        """Ruling E: o TS dispara antes de cada bolha — três bolhas, três
        chamadas, todas com o MESMO wamid (é o mesmo último inbound)."""
        channel = _StubChannel()
        await send_humanized(
            channel,
            RecordingConnection(),
            _send(THREE_PARAGRAPHS, last_inbound_wamid="wamid.inbound-1"),
            humanize_delays=True,
            clock=_FROZEN,
        )
        assert channel.presence_calls == ["wamid.inbound-1"] * 3

    async def test_a_single_bubble_gets_it_too(self) -> None:
        channel = _StubChannel()
        await send_humanized(
            channel,
            RecordingConnection(),
            _send("oi", last_inbound_wamid="wamid.inbound-2"),
            humanize_delays=True,
            clock=_FROZEN,
        )
        assert channel.presence_calls == ["wamid.inbound-2"]

    async def test_a_failure_is_best_effort_and_never_blocks_the_bubble(self) -> None:
        """Ruling C: adereço nunca vira causa de morte do turno — a bolha
        sai mesmo que o read/typing tenha sido recusado pela Meta."""
        channel = _StubChannel(presence_fails=True)
        delivered = await send_humanized(
            channel,
            RecordingConnection(),
            _send("oi", last_inbound_wamid="wamid.inbound-3"),
            humanize_delays=True,
            clock=_FROZEN,
        )
        assert channel.presence_calls == ["wamid.inbound-3"]
        assert delivered == [("wamid-1", "oi")]

    async def test_humanize_delays_off_turns_presence_off_too(self) -> None:
        """Fix round 1, Minor 2: `cloud-sender.ts:257` liga o typing sob
        `!skipDelays && inboundMessageId` — o MESMO knob desliga os dois. O
        runtime divergia (typing disparava mesmo com o ritmo desligado);
        alinhado agora."""
        channel = _StubChannel()
        await send_humanized(
            channel,
            RecordingConnection(),
            _send(THREE_PARAGRAPHS, last_inbound_wamid="wamid.inbound-4"),
            humanize_delays=False,
            clock=SystemClock(),
        )
        assert channel.presence_calls == []

    async def test_a_template_never_fires_presence(self) -> None:
        """Fix round 1, Minor 1: `sendHumanizedReply` do TS é exclusivo de
        resposta TEXTUAL de IA — template sai por rota própria que nunca
        chama `sendTyping`. O runtime divergia (disparava também para
        template); alinhado agora."""
        from dataclasses import replace as dc_replace

        channel = _StubChannel()
        send = dc_replace(
            _send("x", last_inbound_wamid="wamid.inbound-5"),
            payload={"template": {"name": "t", "language": "pt_BR"}},
        )
        await send_humanized(
            channel, RecordingConnection(), send, humanize_delays=True, clock=_FROZEN
        )
        assert channel.presence_calls == []
