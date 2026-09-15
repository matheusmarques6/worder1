import asyncio
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import psycopg
import pytest
from psycopg.pq import ConnStatus, TransactionStatus

from agents_runtime.agent_core.toucher import TouchDraft
from agents_runtime.clock import SystemClock
from agents_runtime.config import QueueingConfig, config_from_env
from agents_runtime.queueing import worker
from agents_runtime.queueing.jobs import InboundJob, MissionTouchJob
from agents_runtime.queueing.worker import TurnResult
from agents_runtime.repository import scope as db_scope


class _Transaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None


class _Connection:
    def __init__(self) -> None:
        self.pgconn = SimpleNamespace(
            socket=1,
            transaction_status=TransactionStatus.ACTIVE,
            finished=False,
        )
        self.pgconn.finish = self._finish

    def _finish(self) -> None:
        self.pgconn.finished = True
        self.pgconn.transaction_status = TransactionStatus.UNKNOWN

    @property
    def closed(self) -> bool:
        return self.pgconn.finished

    def transaction(self):
        return _Transaction()


class _RealTransactionConnection(_Connection):
    transaction = psycopg.AsyncConnection.transaction

    def __init__(self) -> None:
        super().__init__()
        self.pgconn.status = ConnStatus.OK
        self.pgconn.transaction_status = TransactionStatus.IDLE
        self.lock = asyncio.Lock()
        self._pipeline = None
        self._num_transactions = 0
        self.commands = []
        self._begins = 0
        self.heartbeat_started = asyncio.Event()

    def _get_tx_start_command(self):
        return b"BEGIN"

    def _exec_command(self, command):
        yield command

    async def wait(self, commands):
        for command in commands:
            self.commands.append(command)
            if command == b"BEGIN":
                self._begins += 1
                self.pgconn.transaction_status = TransactionStatus.INTRANS
                if self._begins == 2:
                    self.heartbeat_started.set()
            await asyncio.sleep(0)
            if command == b"COMMIT":
                self.pgconn.transaction_status = TransactionStatus.IDLE


@pytest.fixture
def engine(monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    mocked = SimpleNamespace(
        runtime_rollout_is_enabled=AsyncMock(return_value=True),
        scope_to_organization=AsyncMock(),
        claim_conversation=AsyncMock(
            return_value=SimpleNamespace(version=1, last_processed_seq=0)
        ),
        renew_lease=AsyncMock(),
        release_lease=AsyncMock(return_value=True),
        conclude_turn=AsyncMock(
            return_value=SimpleNamespace(committed=True, outbox_id=None)
        ),
        outbox_key_exists=AsyncMock(return_value=False),
        turn_pointers=AsyncMock(return_value=(1, 1)),
        set_conversation_owner=AsyncMock(),
    )
    for name, value in vars(mocked).items():
        monkeypatch.setattr(worker.engine, name, value)
    return mocked


def _job(kind: str) -> InboundJob | MissionTouchJob:
    organization_id = UUID("00000000-0000-4000-8000-000000000801")
    conversation_id = UUID("00000000-0000-4000-8000-000000000802")
    if kind == "turn":
        return InboundJob(
            organization_id=organization_id,
            conversation_id=conversation_id,
            generation=1,
            target_seq=1,
        )
    return MissionTouchJob(
        organization_id=organization_id,
        contact_id=UUID("00000000-0000-4000-8000-000000000803"),
        conversation_id=conversation_id,
        touch_id=UUID("00000000-0000-4000-8000-000000000804"),
        event_family="cart.abandoned",
    )


async def _run(kind: str, producer, *, config: QueueingConfig) -> TurnResult:
    call = worker._turn if kind == "turn" else worker._touch
    return await call(
        _Connection(),
        _job(kind),
        producer,
        config=config,
        clock=SystemClock(),
    )


def _keepalives() -> set[asyncio.Task]:
    current = asyncio.current_task()
    return {
        task
        for task in asyncio.all_tasks()
        if task is not current
        if "_keepalive" in getattr(task.get_coro(), "__qualname__", "")
    }


def _successful_result(kind: str):
    if kind == "turn":
        return {"text": "ok"}
    return TouchDraft(content={"text": "ok"}, moment_ids=(), mission_version_id=None)


def test_turn_timeout_has_the_approved_default_and_env_override() -> None:
    config = QueueingConfig()
    assert config.turn_timeout == timedelta(seconds=90)
    assert config.connect_timeout_seconds == 3
    assert config.statement_timeout_ms == 15_000
    assert config.probe_timeout == timedelta(seconds=4)
    assert config.cleanup_timeout == timedelta(seconds=10)
    assert config_from_env({"AGENTS_TURN_TIMEOUT_MS": "25"}).turn_timeout == timedelta(
        milliseconds=25
    )


@pytest.mark.parametrize(
    "raw",
    ["", " ", "0", "-1", "+1", "nan", "inf", "1.5", "1_0", str(10**30)],
)
def test_turn_timeout_rejects_non_positive_or_non_integer_overrides(raw: str) -> None:
    with pytest.raises((ValueError, OverflowError)):
        config_from_env({"AGENTS_TURN_TIMEOUT_MS": raw})


@pytest.mark.parametrize(
    "invalid",
    [
        {"turn_timeout": timedelta(0)},
        {"turn_timeout": -timedelta(microseconds=1)},
        {"turn_timeout": True},
        {"connect_timeout_seconds": 0},
        {"connect_timeout_seconds": -1},
        {"connect_timeout_seconds": True},
        {"connect_timeout_seconds": 2_147_483_648},
        {"statement_timeout_ms": 0},
        {"statement_timeout_ms": -1},
        {"statement_timeout_ms": True},
        {"statement_timeout_ms": 2_147_483_648},
        {"probe_timeout": timedelta(0)},
        {"probe_timeout": -timedelta(microseconds=1)},
        {"probe_timeout": float("nan")},
        {"cleanup_timeout": timedelta(0)},
        {"cleanup_timeout": -timedelta(microseconds=1)},
        {"cleanup_timeout": True},
    ],
)
def test_time_limits_reject_disabled_or_boolean_values(invalid: dict) -> None:
    with pytest.raises(ValueError):
        QueueingConfig(**invalid)


def test_new_parser_does_not_change_legacy_override_semantics() -> None:
    config = config_from_env({"AGENTS_VT_MS": "0", "AGENTS_BUSY_RETRY_MS": "-1"})
    assert config.visibility_timeout == timedelta(0)
    assert config.busy_retry == -timedelta(milliseconds=1)


def test_boolean_turn_timeout_override_has_a_clear_value_error() -> None:
    with pytest.raises(ValueError, match="AGENTS_TURN_TIMEOUT_MS"):
        config_from_env({"AGENTS_TURN_TIMEOUT_MS": True})


@pytest.mark.parametrize("kind", ["turn", "touch"])
async def test_a_stuck_producer_times_out_then_releases_the_lease(
    kind: str, engine: SimpleNamespace
) -> None:
    closed = asyncio.Event()

    async def stuck(_):
        try:
            await asyncio.Event().wait()
        finally:
            closed.set()

    running = asyncio.create_task(
        _run(
            kind,
            stuck,
            config=QueueingConfig(turn_timeout=timedelta(milliseconds=10)),
        )
    )
    done, _ = await asyncio.wait({running}, timeout=0.25)
    if not done:
        running.cancel()
        await asyncio.gather(running, return_exceptions=True)
        pytest.fail("o turno não aplicou seu próprio timeout")

    with pytest.raises(TimeoutError):
        await running
    assert closed.is_set()
    engine.release_lease.assert_awaited_once()
    engine.conclude_turn.assert_not_awaited()
    assert _keepalives() == set()


@pytest.mark.parametrize("kind", ["turn", "touch"])
async def test_a_producer_that_finishes_before_the_deadline_concludes(
    kind: str, engine: SimpleNamespace
) -> None:
    async def quick(_):
        if kind == "turn":
            return {"text": "ok"}
        return TouchDraft(content={"text": "ok"}, moment_ids=(), mission_version_id=None)

    assert await _run(kind, quick, config=QueueingConfig()) is TurnResult.DONE
    engine.conclude_turn.assert_awaited_once()
    engine.release_lease.assert_not_awaited()
    assert _keepalives() == set()


@pytest.mark.parametrize("kind", ["turn", "touch"])
async def test_keepalive_is_cancelled_immediately_when_producer_resists_cancellation(
    kind: str,
    engine: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    beat_started = asyncio.Event()
    beat_closed = asyncio.Event()
    stop_resisting = asyncio.Event()

    async def _fake_keepalive(*_, **__):
        beat_started.set()
        try:
            await asyncio.Event().wait()
        finally:
            beat_closed.set()

    async def resistant(_):
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            await stop_resisting.wait()

    monkeypatch.setattr(worker, "_keepalive", _fake_keepalive)
    running = asyncio.create_task(
        _run(
            kind,
            resistant,
            config=QueueingConfig(
                turn_timeout=timedelta(milliseconds=10),
                cleanup_timeout=timedelta(milliseconds=10),
            ),
        )
    )
    try:
        await asyncio.wait_for(beat_started.wait(), timeout=0.25)
        done, _ = await asyncio.wait({running}, timeout=0.25)
        if not done:
            pytest.fail("cleanup não terminou no próprio orçamento")
        with pytest.raises(TimeoutError):
            await running
        assert beat_closed.is_set()
        engine.conclude_turn.assert_not_awaited()
        assert _keepalives() == set()
    finally:
        stop_resisting.set()
        running.cancel()
        for task in _keepalives():
            task.cancel()
        await asyncio.wait({running, *_keepalives()}, timeout=0.25)


@pytest.mark.parametrize("kind", ["turn", "touch"])
async def test_secondary_producer_cleanup_error_is_logged_without_masking_timeout(
    kind: str,
    engine: SimpleNamespace,
    caplog: pytest.LogCaptureFixture,
) -> None:
    async def broken_cleanup(_):
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError as exc:
            raise RuntimeError("producer cleanup exploded") from exc

    with pytest.raises(TimeoutError):
        await _run(
            kind,
            broken_cleanup,
            config=QueueingConfig(turn_timeout=timedelta(milliseconds=10)),
        )
    assert "producer cleanup exploded" in caplog.text
    engine.release_lease.assert_awaited_once()
    engine.conclude_turn.assert_not_awaited()
    assert _keepalives() == set()


@pytest.mark.parametrize("kind", ["turn", "touch"])
async def test_keepalive_error_after_success_aborts_and_releases(
    kind: str,
    engine: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    beat_failed = asyncio.Event()

    async def _broken_keepalive(*_, **__):
        beat_failed.set()
        raise RuntimeError("keepalive exploded")

    async def successful(_):
        await beat_failed.wait()
        return _successful_result(kind)

    monkeypatch.setattr(worker, "_keepalive", _broken_keepalive)
    with pytest.raises(RuntimeError, match="keepalive exploded"):
        await _run(kind, successful, config=QueueingConfig())
    engine.release_lease.assert_awaited_once()
    engine.conclude_turn.assert_not_awaited()
    assert _keepalives() == set()


@pytest.mark.parametrize("kind", ["turn", "touch"])
async def test_keepalive_cleanup_timeout_after_success_never_concludes(
    kind: str,
    engine: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    beat_started = asyncio.Event()
    stop_resisting = asyncio.Event()

    async def _resistant_keepalive(*_, **__):
        beat_started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            await stop_resisting.wait()

    async def successful(_):
        await beat_started.wait()
        return _successful_result(kind)

    monkeypatch.setattr(worker, "_keepalive", _resistant_keepalive)
    running = asyncio.create_task(
        _run(
            kind,
            successful,
            config=QueueingConfig(cleanup_timeout=timedelta(milliseconds=10)),
        )
    )
    try:
        done, _ = await asyncio.wait({running}, timeout=0.25)
        if not done:
            pytest.fail("keepalive impediu o cleanup de respeitar o prazo")
        with pytest.raises(TimeoutError):
            await running
    finally:
        stop_resisting.set()
        running.cancel()
        for task in _keepalives():
            task.cancel()
        await asyncio.wait({running, *_keepalives()}, timeout=0.25)
    engine.release_lease.assert_not_awaited()
    engine.conclude_turn.assert_not_awaited()
    assert _keepalives() == set()


@pytest.mark.parametrize("kind", ["turn", "touch"])
async def test_external_cancellation_during_success_cleanup_uses_remaining_budget(
    kind: str,
    engine: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleanup_started = asyncio.Event()
    allow_beat_finish = asyncio.Event()

    async def _slow_keepalive(*_, stop, **__):
        await stop.wait()
        cleanup_started.set()
        await allow_beat_finish.wait()

    async def blocked_release(*_):
        await asyncio.Event().wait()

    async def successful(_):
        return _successful_result(kind)

    monkeypatch.setattr(worker, "_keepalive", _slow_keepalive)
    engine.release_lease.side_effect = blocked_release
    running = asyncio.create_task(
        _run(
            kind,
            successful,
            config=QueueingConfig(cleanup_timeout=timedelta(milliseconds=30)),
        )
    )
    await asyncio.wait_for(cleanup_started.wait(), timeout=0.25)
    started = asyncio.get_running_loop().time()
    running.cancel()
    allow_beat_finish.set()
    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(running, timeout=0.15)
    assert asyncio.get_running_loop().time() - started < 0.1
    engine.release_lease.assert_awaited_once()
    engine.conclude_turn.assert_not_awaited()
    assert _keepalives() == set()


@pytest.mark.parametrize("kind", ["turn", "touch"])
async def test_external_cancellation_stays_cancelled_and_cleans_up(
    kind: str, engine: SimpleNamespace
) -> None:
    started = asyncio.Event()
    closed = asyncio.Event()

    async def stuck(_):
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            closed.set()

    running = asyncio.create_task(_run(kind, stuck, config=QueueingConfig()))
    await asyncio.wait_for(started.wait(), timeout=0.25)
    running.cancel()

    with pytest.raises(asyncio.CancelledError):
        await running
    assert closed.is_set()
    engine.release_lease.assert_awaited_once()
    engine.conclude_turn.assert_not_awaited()
    assert _keepalives() == set()


@pytest.mark.parametrize("kind", ["turn", "touch"])
async def test_cleanup_timeout_preserves_the_original_error(
    kind: str, engine: SimpleNamespace, caplog: pytest.LogCaptureFixture
) -> None:
    never = asyncio.Event()

    async def broken(_):
        raise ValueError("causa original")

    async def blocked_release(*_):
        await never.wait()

    engine.release_lease.side_effect = blocked_release
    running = asyncio.create_task(
        _run(
            kind,
            broken,
            config=QueueingConfig(cleanup_timeout=timedelta(milliseconds=10)),
        )
    )
    done, _ = await asyncio.wait({running}, timeout=0.25)
    if not done:
        running.cancel()
        await asyncio.gather(running, return_exceptions=True)
        pytest.fail("cleanup ignorou seu orçamento independente")

    with pytest.raises(ValueError, match="causa original"):
        await running
    assert "cleanup do turno falhou" in caplog.text
    engine.release_lease.assert_awaited_once()
    engine.conclude_turn.assert_not_awaited()
    assert _keepalives() == set()


@pytest.mark.parametrize("kind", ["turn", "touch"])
async def test_release_deadline_finishes_connection_before_psycopg_cancel_wait(
    kind: str,
    engine: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    conn = _Connection()
    cancel_started = asyncio.Event()
    allow_cancel = asyncio.Event()
    waits = 0

    async def wait_async(*_, **__):
        nonlocal waits
        waits += 1
        if waits > 1:
            raise psycopg.errors.QueryCanceled("cancelled")
        await asyncio.Event().wait()

    async def slow_cancel(*_, **__):
        cancel_started.set()
        await allow_cancel.wait()

    async def blocked_release(*_):
        conn._try_cancel = slow_cancel
        await psycopg.AsyncConnection.wait(conn, iter(()))

    async def broken(_):
        raise ValueError("causa original")

    monkeypatch.setattr(psycopg.connection_async.waiting, "wait_async", wait_async)
    engine.release_lease.side_effect = blocked_release
    running = asyncio.create_task(
        (worker._turn if kind == "turn" else worker._touch)(
            conn,
            _job(kind),
            broken,
            config=QueueingConfig(cleanup_timeout=timedelta(milliseconds=10)),
            clock=SystemClock(),
        )
    )
    done, _ = await asyncio.wait({running}, timeout=0.1)
    if not done:
        allow_cancel.set()
        await asyncio.wait({running}, timeout=0.1)
        pytest.fail("release entrou na espera de cancelamento de 5s do psycopg")

    with pytest.raises(ValueError, match="causa original"):
        await running
    assert conn.pgconn.finished
    assert not cancel_started.is_set()
    engine.conclude_turn.assert_not_awaited()


@pytest.mark.parametrize("kind", ["turn", "touch"])
async def test_residual_producer_remains_owned_until_async_finalizers_finish(
    kind: str,
    engine: SimpleNamespace,
) -> None:
    first_finalizer = asyncio.Event()
    second_finalizer = asyncio.Event()
    finish_first = asyncio.Event()
    finish_second = asyncio.Event()

    async def stubborn(_):
        try:
            try:
                await asyncio.Event().wait()
            finally:
                first_finalizer.set()
                await finish_first.wait()
        finally:
            second_finalizer.set()
            await finish_second.wait()

    running = asyncio.create_task(
        _run(
            kind,
            stubborn,
            config=QueueingConfig(
                turn_timeout=timedelta(milliseconds=10),
                cleanup_timeout=timedelta(milliseconds=10),
            ),
        )
    )
    await asyncio.wait_for(first_finalizer.wait(), timeout=0.25)
    await asyncio.wait_for(second_finalizer.wait(), timeout=0.25)
    try:
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(running, timeout=0.25)

        assert len(worker._DRAINING_TASKS) == 1
        assert _keepalives() == set()
        engine.conclude_turn.assert_not_awaited()
    finally:
        finish_first.set()
        finish_second.set()
        for task in asyncio.all_tasks():
            if "stubborn" in getattr(task.get_coro(), "__qualname__", ""):
                task.cancel()
        for _ in range(10):
            if not worker._DRAINING_TASKS:
                break
            await asyncio.sleep(0)
    assert worker._DRAINING_TASKS == set()


@pytest.mark.parametrize(
    ("cause", "expected"),
    [(None, TimeoutError), (ValueError("causa original"), ValueError)],
)
async def test_cleanup_refuses_success_or_release_if_expiry_wins_the_resume_race(
    cause: BaseException | None,
    expected: type[BaseException],
    engine: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    class RecordedTimeout:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        def reschedule(self, _when):
            return None

        def expired(self):
            return False

    async def done():
        return None

    producer = asyncio.create_task(done())
    beat = asyncio.create_task(done())
    await asyncio.gather(producer, beat)
    loop = asyncio.get_running_loop()

    def expire_before_resume(delay, callback, *args):
        assert delay == pytest.approx(0.01)
        callback(*args)
        return SimpleNamespace(cancel=lambda: None)

    monkeypatch.setattr(worker.asyncio, "timeout", lambda _: RecordedTimeout())
    monkeypatch.setattr(loop, "call_later", expire_before_resume)

    with pytest.raises(expected, match="causa original" if cause else None):
        await worker._cleanup_phase_two(
            _Connection(),
            _job("turn"),
            UUID("00000000-0000-4000-8000-000000000805"),
            producer,
            beat,
            beat_stop=asyncio.Event(),
            clock=SystemClock(),
            cause=cause,
            timeout_seconds=0.01,
        )

    engine.release_lease.assert_not_awaited()
    if cause is not None:
        assert "cleanup do turno falhou" in caplog.text


@pytest.mark.parametrize("kind", ["turn", "touch"])
async def test_turn_and_touch_wait_for_real_heartbeat_transaction_commit(
    kind: str,
    engine: SimpleNamespace,
) -> None:
    conn = _RealTransactionConnection()

    async def producer(_):
        await conn.heartbeat_started.wait()
        return _successful_result(kind)

    result = await (worker._turn if kind == "turn" else worker._touch)(
        conn,
        _job(kind),
        producer,
        config=QueueingConfig(),
        clock=SystemClock(),
    )

    assert result is TurnResult.DONE
    assert conn._num_transactions == 0
    assert conn.pgconn.transaction_status == TransactionStatus.IDLE
    assert conn.commands == [b"BEGIN", b"COMMIT"] * 3
    engine.conclude_turn.assert_awaited_once()


async def test_cleanup_lets_a_real_psycopg_transaction_commit_before_connection_reuse(
    engine: SimpleNamespace,
) -> None:
    conn = _RealTransactionConnection()
    beat_stop = asyncio.Event()
    beat_inside = asyncio.Event()

    async def done():
        return None

    async def current_heartbeat():
        async with conn.transaction():
            beat_inside.set()
            await beat_stop.wait()

    producer = asyncio.create_task(done())
    beat = asyncio.create_task(current_heartbeat())
    await beat_inside.wait()

    await worker._cleanup_phase_two(
        conn,
        _job("turn"),
        UUID("00000000-0000-4000-8000-000000000806"),
        producer,
        beat,
        beat_stop=beat_stop,
        clock=SystemClock(),
        cause=None,
        timeout_seconds=0.1,
    )

    assert conn._num_transactions == 0
    assert conn.pgconn.transaction_status == TransactionStatus.IDLE
    assert conn.commands == [b"BEGIN", b"COMMIT"]
    engine.release_lease.assert_not_awaited()


async def test_abort_connection_unregisters_each_open_fd_before_finish(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = []

    class Pgconn:
        def __init__(self, fd):
            self.socket = fd
            self.finished = False

        def finish(self):
            calls.append(("finish", self.socket))
            self.finished = True

    class Connection:
        def __init__(self, fd):
            self.pgconn = Pgconn(fd)

        @property
        def closed(self):
            return self.pgconn.finished

    loop = asyncio.get_running_loop()
    monkeypatch.setattr(loop, "remove_reader", lambda fd: calls.append(("reader", fd)))
    monkeypatch.setattr(loop, "remove_writer", lambda fd: calls.append(("writer", fd)))
    first = Connection(41)
    second = Connection(42)

    db_scope.abort_connection(first)
    db_scope.abort_connection(first)
    db_scope.abort_connection(second)

    assert calls == [
        ("reader", 41),
        ("writer", 41),
        ("finish", 41),
        ("reader", 42),
        ("writer", 42),
        ("finish", 42),
    ]


async def test_cancelling_keepalive_owns_and_finishes_its_sleep_children(
    engine: SimpleNamespace,
) -> None:
    renewed = asyncio.Event()

    async def renew(*_, **__):
        renewed.set()

    engine.renew_lease.side_effect = renew
    beat = asyncio.create_task(
        worker._keepalive(
            _Connection(),
            _job("turn"),
            UUID("00000000-0000-4000-8000-000000000807"),
            stop=asyncio.Event(),
            config=QueueingConfig(),
            clock=SystemClock(),
            queue=None,
            message_id=None,
        )
    )
    await renewed.wait()

    def clock_sleeps():
        return {
            task
            for task in asyncio.all_tasks()
            if "SystemClock.sleep" in getattr(task.get_coro(), "__qualname__", "")
        }

    for _ in range(10):
        if clock_sleeps():
            break
        await asyncio.sleep(0)
    assert clock_sleeps(), "o reproducer não alcançou o sono entre heartbeats"

    beat.cancel()
    await asyncio.gather(beat, return_exceptions=True)
    leaked = clock_sleeps()
    try:
        assert leaked == set()
    finally:
        for task in leaked:
            task.cancel()
        await asyncio.gather(*leaked, return_exceptions=True)


async def test_keepalive_propagates_the_sleep_error_when_sleep_wins(
    engine: SimpleNamespace,
) -> None:
    class BrokenClock(SystemClock):
        async def sleep(self, _seconds: float) -> None:
            raise RuntimeError("clock failed")

    with pytest.raises(RuntimeError, match="clock failed"):
        await worker._keepalive(
            _Connection(),
            _job("turn"),
            UUID("00000000-0000-4000-8000-000000000808"),
            stop=asyncio.Event(),
            config=QueueingConfig(),
            clock=BrokenClock(),
            queue=None,
            message_id=None,
        )

    engine.renew_lease.assert_awaited_once()


@pytest.mark.parametrize("kind", ["turn", "touch"])
async def test_success_cleanup_has_no_cancellable_zero_sleep_window(
    kind: str,
    engine: SimpleNamespace,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class NoCleanupYieldClock(SystemClock):
        async def sleep(self, seconds: float) -> None:
            if seconds == 0:
                raise asyncio.CancelledError
            await super().sleep(seconds)

    async def cooperative_keepalive(*_, stop, **__):
        await stop.wait()

    async def successful(_):
        return _successful_result(kind)

    monkeypatch.setattr(worker, "_keepalive", cooperative_keepalive)
    result = await (worker._turn if kind == "turn" else worker._touch)(
        _Connection(),
        _job(kind),
        successful,
        config=QueueingConfig(),
        clock=NoCleanupYieldClock(),
    )

    assert result is TurnResult.DONE
    engine.conclude_turn.assert_awaited_once()
    engine.release_lease.assert_not_awaited()
