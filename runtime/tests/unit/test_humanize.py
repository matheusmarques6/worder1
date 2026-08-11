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
from agents_runtime.channels.port import ClaimedSend
from agents_runtime.clock import SystemClock
from agents_runtime.queueing.sender import send_humanized

VECTORS = json.loads(
    (Path(__file__).parent / "fixtures" / "bubble_vectors.json").read_text()
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

    def __init__(self, fail_at: int | None = None) -> None:
        self.sent: list[dict] = []
        self._fail_at = fail_at

    async def send(self, send: ClaimedSend) -> str:
        if self._fail_at is not None and len(self.sent) == self._fail_at:
            raise ConnectionError("provedor caiu nesta bolha")
        self.sent.append(dict(send.payload))
        return f"wamid-{len(self.sent)}"


def _send(text: str) -> ClaimedSend:
    return ClaimedSend(
        outbox_id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        channel_type="whatsapp",
        channel_external_id="wa-1",
        to_phone_e164="+5511999999999",
        payload={"text": text},
        idempotency_key="idem-1",
        attempt_count=1,
    )


THREE_PARAGRAPHS = "Oi Joana!\n\nSeu carrinho está aqui.\n\nPosso ajudar a fechar?"


class TestSendHumanized:
    async def test_each_bubble_goes_out_in_order_with_the_same_key(self) -> None:
        channel = _StubChannel()
        delivered = await send_humanized(
            channel, _send(THREE_PARAGRAPHS), humanize_delays=False, clock=SystemClock()
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
            channel, send, humanize_delays=False, clock=SystemClock()
        )
        assert len(channel.sent) == 1
        assert channel.sent[0] == {"template": {"name": "t", "language": "pt_BR"}}
        assert len(delivered) == 1

    async def test_first_bubble_failure_raises_and_nothing_counts(self) -> None:
        channel = _StubChannel(fail_at=0)
        with pytest.raises(ConnectionError):
            await send_humanized(
                channel, _send(THREE_PARAGRAPHS), humanize_delays=False, clock=SystemClock()
            )
        assert channel.sent == []

    async def test_a_middle_failure_keeps_what_left_and_never_retries(self) -> None:
        channel = _StubChannel(fail_at=1)
        delivered = await send_humanized(
            channel, _send(THREE_PARAGRAPHS), humanize_delays=False, clock=SystemClock()
        )

        assert [p["text"] for p in channel.sent] == ["Oi Joana!"]
        assert delivered == [("wamid-1", "Oi Joana!")]
