"""Config de entrega por loja (pedido 17/08, Pacote B).

A humanização deixa de ser env global do processo: cada envio carrega as
flags da LOJA no payload da outbox (`humanize`) e o sender obedece por linha.
Os knobs nascem em settings.delivery (órbita → Adaptação → Entrega); lixo em
settings degrada para o padrão ligado — entrega humanizada é o default do
produto, nunca um efeito colateral de jsonb malformado.
"""

import uuid

from agents_runtime.agent_core.responder import delivery_flags
from agents_runtime.clock import SystemClock
from agents_runtime.queueing.sender import send_humanized
from agents_runtime.repository.outbox import ClaimedSend


class FakeChannel:
    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def send(self, conn, send: ClaimedSend) -> str:
        self.sent.append(send.payload)
        return f"wamid-{len(self.sent)}"


def a_send(payload: dict) -> ClaimedSend:
    return ClaimedSend(
        outbox_id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        channel_type="whatsapp",
        channel_external_id="1163",
        to_phone_e164="+5538988887777",
        payload=payload,
        idempotency_key="k-1",
        attempt_count=0,
    )


TWO_PARAGRAPHS = "Primeiro parágrafo da resposta.\n\nSegundo parágrafo, separado."


class TestDeliveryFlags:
    def test_the_default_is_full_humanization(self) -> None:
        assert delivery_flags(None) == (True, True)
        assert delivery_flags({}) == (True, True)

    def test_each_knob_turns_off_independently(self) -> None:
        assert delivery_flags({"delivery": {"split_bubbles": False}}) == (False, True)
        assert delivery_flags({"delivery": {"typing_rhythm": False}}) == (True, False)

    def test_garbage_settings_degrade_to_the_default(self) -> None:
        assert delivery_flags({"delivery": "sim"}) == (True, True)
        assert delivery_flags({"delivery": ["x"]}) == (True, True)


class TestSendHonorsTheSplitFlag:
    async def test_split_off_delivers_one_single_bubble(self) -> None:
        channel = FakeChannel()

        delivered = await send_humanized(
            channel,
            None,
            a_send({"text": TWO_PARAGRAPHS}),
            humanize_delays=False,
            clock=SystemClock(),
            split=False,
        )

        assert len(channel.sent) == 1
        assert len(delivered) == 1
        assert delivered[0][1] == TWO_PARAGRAPHS

    async def test_split_on_still_splits_paragraphs(self) -> None:
        channel = FakeChannel()

        delivered = await send_humanized(
            channel,
            None,
            a_send({"text": TWO_PARAGRAPHS}),
            humanize_delays=False,
            clock=SystemClock(),
            split=True,
        )

        assert len(channel.sent) == 2
        assert [text for _, text in delivered] == [
            "Primeiro parágrafo da resposta.",
            "Segundo parágrafo, separado.",
        ]
