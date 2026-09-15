"""Legacy payload compatibility must never mean guessing the sending account."""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from agents_runtime.agent_core.toucher import TouchDraft
from agents_runtime.clock import SystemClock
from agents_runtime.config import QueueingConfig
from agents_runtime.queueing import worker
from agents_runtime.queueing.jobs import InboundJob, MissionTouchJob
from agents_runtime.repository import whatsapp_accounts
from tests.unit.test_turn_time_limit import _Connection

ACCOUNT = UUID('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
ORG = UUID('11111111-1111-4111-8111-111111111111')
CONVERSATION = UUID('22222222-2222-4222-8222-222222222222')


def payload(kind):
    base = dict(organization_id=str(ORG), conversation_id=str(CONVERSATION))
    if kind == 'inbound':
        return base | dict(generation=1, target_seq=1)
    return base | dict(
        kind='mission_touch', contact_id=str(CONVERSATION), touch_id=str(ACCOUNT),
        event_family='cart.abandoned',
    )


def parse(kind, raw):
    return (InboundJob if kind == 'inbound' else MissionTouchJob).from_payload(raw)


@pytest.mark.parametrize('kind', ['inbound', 'touch'])
def test_old_payload_remains_parseable_and_new_payload_preserves_account(kind):
    assert parse(kind, payload(kind)).channel_account_id is None
    raw = payload(kind) | {'channel_account_id': str(ACCOUNT)}
    assert parse(kind, raw).channel_account_id == ACCOUNT
    with pytest.raises(ValueError):
        parse(kind, payload(kind) | {'channel_account_id': 'invalid'})


@pytest.mark.parametrize('kind', ['inbound', 'touch'])
@pytest.mark.parametrize('identity', ['legacy', 'explicit', 'zero', 'ambiguous', 'foreign'])
async def test_account_is_resolved_before_producer_and_carried_to_cas(monkeypatch, kind, identity):
    conn = _Connection()
    events = []
    for name, value in {
        'runtime_rollout_is_enabled': True,
        'claim_conversation': SimpleNamespace(version=1, last_processed_seq=0),
        'scope_to_organization': None, 'renew_lease': True, 'release_lease': True,
        'outbox_key_exists': False, 'turn_pointers': (1, 1),
    }.items():
        monkeypatch.setattr(worker.engine, name, AsyncMock(return_value=value))
    conclude = AsyncMock(return_value=SimpleNamespace(committed=True, outbox_id=None))
    monkeypatch.setattr(worker.engine, 'conclude_turn', conclude)

    async def resolve(connection, *, organization_id, conversation_id, channel_account_id):
        assert connection is conn
        assert organization_id == ORG
        assert conversation_id == CONVERSATION
        assert channel_account_id == (ACCOUNT if identity in {'explicit', 'foreign'} else None)
        events.append('resolved')
        if identity in {'zero', 'ambiguous', 'foreign'}:
            raise ValueError('unusable WhatsApp account')
        return ACCOUNT

    monkeypatch.setattr(whatsapp_accounts, 'resolve_account_id', resolve, raising=False)

    async def produce(job):
        assert events == ['resolved']
        assert job.channel_account_id == ACCOUNT
        events.append('produced')
        return {'text': 'A'} if kind == 'inbound' else TouchDraft({'text': 'A'}, (), None)

    raw = payload(kind)
    if identity in {'explicit', 'foreign'}:
        raw['channel_account_id'] = str(ACCOUNT)
    run = worker.run_turn if kind == 'inbound' else worker.run_touch
    if identity in {'zero', 'ambiguous', 'foreign'}:
        with pytest.raises(ValueError, match='unusable WhatsApp account'):
            await run(conn, parse(kind, raw), produce, config=QueueingConfig(), clock=SystemClock())
        assert events == ['resolved']
        conclude.assert_not_called()
    else:
        assert await run(
            conn, parse(kind, raw), produce, config=QueueingConfig(), clock=SystemClock(),
        ) is worker.TurnResult.DONE
        assert events == ['resolved', 'produced']
        assert conclude.call_args.kwargs['channel_account_id'] == ACCOUNT
