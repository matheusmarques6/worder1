"""Item 47: o span não pode afirmar 'sent' quando o banco recusou o carimbo.

`internal.mark_outbox_sent` devolve boolean e `sender_pass` disparava
`annotate(outcome="sent")` na linha seguinte, sem guarda — o trace dizia
sucesso mesmo quando o `update` não casou nenhuma linha. Este teste prende
UMA coisa e só ela: `mark_outbox_sent` falso ⇒ o span não recebe `"sent"`.

O que ele deliberadamente NÃO prova, porque não há Postgres aqui: que o
`false` de fato acontece em produção, e qual dos escritores da outbox o
produziu. Isso é SQL, vive em `tests/db/test_outbox_claim.py:299-320` e
`tests/db/test_correlate_outbox_status.py:168-190`, e não roda nesta máquina.

O dublê é o módulo `engine` inteiro (`sender.py` não tem um único
`conn.execute`), e o `annotate` precisa ser interceptado por nome: o real é
no-op sem SDK OTel, então um teste contra ele passaria sempre — inclusive com
a mentira de volta. A linha usa `channel_type="email"` porque é o caminho que
não passa por preflight, send-guard nem espelho de inbox: sobra exatamente o
carimbo, que é o que está sob teste.
"""

import uuid

import pytest

from agents_runtime.config import QueueingConfig
from agents_runtime.queueing import sender as sender_module
from agents_runtime.randomness import SystemRandomness
from agents_runtime.repository import engine
from agents_runtime.repository.outbox import ClaimedSend


class FakeChannel:
    async def send(self, conn, send: ClaimedSend) -> str:
        return "wamid-1"


def _a_claimed_send() -> ClaimedSend:
    return ClaimedSend(
        outbox_id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        channel_type="email",
        channel_external_id="",
        to_phone_e164="+5538988887777",
        payload={"text": "Uma bolha só."},
        idempotency_key="k-47",
        attempt_count=0,
    )


async def _run_pass(monkeypatch: pytest.MonkeyPatch, *, recorded: bool) -> list[dict]:
    annotations: list[dict] = []
    send = _a_claimed_send()

    async def _noop(*args, **kwargs):
        return 0

    async def _claim(*args, **kwargs):
        return [send]

    async def _mark_sent(*args, **kwargs):
        return recorded

    monkeypatch.setattr(engine, "sweep_outbox_unknown", _noop)
    monkeypatch.setattr(engine, "review_stale_unknown", _noop)
    monkeypatch.setattr(engine, "expire_incentive_grants", _noop)
    monkeypatch.setattr(engine, "claim_outbox_batch", _claim)
    monkeypatch.setattr(engine, "mark_outbox_sent", _mark_sent)
    monkeypatch.setattr(sender_module, "annotate", lambda **kw: annotations.append(kw))

    attempted = await sender_module.sender_pass(
        object(),
        FakeChannel(),
        config=QueueingConfig(humanize_delays=False),
        randomness=SystemRandomness(),
    )
    assert attempted == 1
    return annotations


class TestTheSpanTellsWhatTheDatabaseRecorded:
    async def test_a_refused_stamp_is_not_annotated_as_sent(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        annotations = await _run_pass(monkeypatch, recorded=False)

        assert annotations == [{"outcome": "sent:not_recorded"}]

    async def test_the_happy_path_still_says_sent(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        annotations = await _run_pass(monkeypatch, recorded=True)

        assert annotations == [{"outcome": "sent"}]
