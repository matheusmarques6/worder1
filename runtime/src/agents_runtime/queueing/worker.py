"""The inbound turn — claim, respond, conclude, in the three-phase shape of ADR-6.

Phase 1 and phase 3 are each their own short transaction with the tenant scope
set inside them. Phase 2 — the responder — runs outside any transaction, which
is the whole point of the lease: an LLM call must never hold a connection's
transaction open.

While phase 2 lasts, a keepalive renews both leases the turn holds: the
conversation lease (so no second worker assumes a turn that is merely slow)
and the queue message's visibility (so pgmq never redelivers it). The two
expire independently and both matter — cenário 6 is the proof by
non-happening: a long turn with the keepalive breathing ends with read_ct 1.
"""

import asyncio
import logging
import uuid
from dataclasses import replace
from enum import Enum

import psycopg

from agents_runtime.clock import Clock
from agents_runtime.config import QueueingConfig
from agents_runtime.obs import carrier
from agents_runtime.obs.telemetry import annotate, span
from agents_runtime.queueing.jobs import InboundJob, MissionTouchJob
from agents_runtime.repository import engine, whatsapp_accounts
from agents_runtime.repository.queue import PgmqQueue
from agents_runtime.repository.scope import abort_connection

LOGGER = logging.getLogger(__name__)
_DRAINING_TASKS: set[asyncio.Task] = set()


class TurnResult(Enum):
    """What the loop should do with the queue message afterwards."""

    DONE = "done"  # archive: the reply is queued for sending
    BUSY = "busy"  # set_vt short: someone else holds the conversation
    STALE = "stale"  # archive: this job was already answered
    SUPERSEDED = "superseded"  # archive: the CAS refused; a newer job exists


async def _keepalive(
    conn: psycopg.AsyncConnection,
    job: InboundJob | MissionTouchJob,
    token: uuid.UUID,
    *,
    stop: asyncio.Event,
    config: QueueingConfig,
    clock: Clock,
    queue: PgmqQueue | None,
    message_id: int | None,
) -> None:
    # The FIRST beat is immediate, not one interval away. Between the pgmq
    # read and this task starting there is already a gap (parse, slots, the
    # claim transaction); adding a full heartbeat interval on top made the
    # keepalive lose the race against a short VT under load — seen as a flaky
    # cenário 6 before this line existed. Beating first shrinks the unguarded
    # window to milliseconds, and an extra renewal is idempotent.
    while not stop.is_set():
        async with conn.transaction():
            await engine.scope_to_organization(conn, job.organization_id)
            # The result is deliberately ignored: if the lease was lost, the
            # CAS at conclusion is the authority that refuses — one judge,
            # not two half-judges.
            await engine.renew_lease(
                conn, job.conversation_id, token, lease=config.conversation_lease
            )
        if queue is not None and message_id is not None:
            await engine.set_visibility(
                queue.connection, queue.name, message_id, config.visibility_timeout
            )
        sleep = asyncio.create_task(clock.sleep(config.heartbeat_every.total_seconds()))
        stopped = asyncio.create_task(stop.wait())
        done: set[asyncio.Task] = set()
        try:
            done, _ = await asyncio.wait(
                {sleep, stopped}, return_when=asyncio.FIRST_COMPLETED
            )
        finally:
            for task in (sleep, stopped):
                if not task.done():
                    task.cancel()
            await asyncio.gather(sleep, stopped, return_exceptions=True)
        if sleep in done:
            await sleep


def _log_secondary_task_failure(
    task: asyncio.Task, *, label: str, primary: BaseException | None
) -> None:
    if task.cancelled():
        return
    error = task.exception()
    if error is not None and error is not primary:
        LOGGER.error(
            "%s falhou durante cleanup do turno",
            label,
            exc_info=(type(error), error, error.__traceback__),
        )


def _drained(task: asyncio.Task, *, label: str, primary: BaseException | None) -> None:
    _DRAINING_TASKS.discard(task)
    _log_secondary_task_failure(task, label=label, primary=primary)


async def _cleanup_phase_two(
    conn: psycopg.AsyncConnection,
    job: InboundJob | MissionTouchJob,
    token: uuid.UUID,
    producer: asyncio.Task,
    beat: asyncio.Task,
    *,
    beat_stop: asyncio.Event,
    clock: Clock,
    cause: BaseException | None,
    timeout_seconds: float,
) -> None:
    loop = asyncio.get_running_loop()
    if not producer.done():
        producer.cancel()
    beat_stop.set()
    settled = asyncio.gather(producer, beat, return_exceptions=True)
    releasing = False
    expired = False
    try:
        try:
            async with asyncio.timeout(None) as budget:
                def expire() -> None:
                    nonlocal expired
                    expired = True
                    if releasing or not beat.done():
                        try:
                            abort_connection(conn)
                            LOGGER.error(
                                "cleanup expirou durante release; conexão do worker "
                                "invalidada e o processo deve reconectar"
                            )
                        except Exception:
                            LOGGER.exception("falha ao invalidar conexão expirada do worker")
                    budget.reschedule(0)

                timer = loop.call_later(timeout_seconds, expire)
                try:
                    while not settled.done():
                        try:
                            await asyncio.shield(settled)
                        except asyncio.CancelledError as cancelled:
                            if budget.expired():
                                raise
                            producer.cancel()
                            cause = cancelled

                    if expired:
                        raise TimeoutError

                    beat_error = None if beat.cancelled() else beat.exception()
                    if cause is None and beat_error is not None:
                        cause = beat_error

                    if cause is not None:
                        releasing = True
                        try:
                            async with conn.transaction():
                                await engine.scope_to_organization(conn, job.organization_id)
                                await engine.release_lease(conn, job.conversation_id, token)
                        except asyncio.CancelledError as cancelled:
                            if budget.expired():
                                raise
                            raise cancelled from cause
                        except Exception:
                            LOGGER.exception(
                                "release da lease falhou; preservando causa original"
                            )
                        finally:
                            releasing = False
                finally:
                    timer.cancel()
        except TimeoutError as cleanup_error:
            if cause is None:
                cause = cleanup_error
            else:
                LOGGER.exception(
                    "cleanup do turno falhou: prazo excedido; preservando causa original"
                )
    finally:
        if not settled.done():
            settled.cancel()
            settled.add_done_callback(
                lambda done: None if done.cancelled() else done.exception()
            )
        if not producer.done():
            producer.cancel()
        if not beat.done():
            beat.cancel()
        for task, label in ((producer, "producer"), (beat, "keepalive")):
            if task.done():
                _log_secondary_task_failure(task, label=label, primary=cause)
            else:
                _DRAINING_TASKS.add(task)
                task.add_done_callback(
                    lambda done, label=label, primary=cause: _drained(
                        done, label=label, primary=primary
                    )
                )

    if cause is not None:
        raise cause


async def run_turn(
    conn: psycopg.AsyncConnection,
    job: InboundJob,
    respond,
    *,
    config: QueueingConfig,
    clock: Clock,
    queue: PgmqQueue | None = None,
    message_id: int | None = None,
) -> TurnResult:
    # O span do turno (9.1b): trace próprio, com LINK de volta ao passe do
    # coalescer que criou o job (o otel do payload pgmq).
    with span(
        "turn",
        remote=job.otel,
        remote_role="link",
        organization_id=job.organization_id,
        conversation_id=job.conversation_id,
    ):
        result = await _turn(
            conn, job, respond, config=config, clock=clock, queue=queue, message_id=message_id
        )
        annotate(outcome=result.name.lower())
        return result


async def _turn(
    conn: psycopg.AsyncConnection,
    job: InboundJob,
    respond,
    *,
    config: QueueingConfig,
    clock: Clock,
    queue: PgmqQueue | None = None,
    message_id: int | None = None,
) -> TurnResult:
    token = uuid.uuid4()

    # FASE 1 — claim, short transaction, commit immediately.
    async with conn.transaction():
        await engine.scope_to_organization(conn, job.organization_id)
        if not await engine.runtime_rollout_is_enabled(conn, job.organization_id):
            return TurnResult.SUPERSEDED
        job = replace(job, channel_account_id=await whatsapp_accounts.resolve_account_id(
            conn, organization_id=job.organization_id, conversation_id=job.conversation_id,
            channel_account_id=job.channel_account_id,
        ))
        claimed = await engine.claim_conversation(
            conn, job.conversation_id, token, lease=config.conversation_lease
        )

    if claimed is None:
        return TurnResult.BUSY

    # Dedup is validation, not a queue feature (ADR-7): a redelivered job whose
    # target was already processed is archived without a second generation.
    if job.target_seq <= claimed.last_processed_seq:
        async with conn.transaction():
            await engine.scope_to_organization(conn, job.organization_id)
            await engine.release_lease(conn, job.conversation_id, token)
        return TurnResult.STALE

    # FASE 2 — work, outside any transaction, with the keepalive breathing.
    beat_stop = asyncio.Event()
    beat = asyncio.create_task(
        _keepalive(
            conn,
            job,
            token,
            stop=beat_stop,
            config=config,
            clock=clock,
            queue=queue,
            message_id=message_id,
        )
    )
    producer = asyncio.create_task(respond(job))
    try:
        async with asyncio.timeout(config.turn_timeout.total_seconds()):
            content = await asyncio.shield(producer)
    except BaseException as error:
        await _cleanup_phase_two(
            conn,
            job,
            token,
            producer,
            beat,
            beat_stop=beat_stop,
            clock=clock,
            cause=error,
            timeout_seconds=config.cleanup_timeout.total_seconds(),
        )
        raise
    else:
        await _cleanup_phase_two(
            conn,
            job,
            token,
            producer,
            beat,
            beat_stop=beat_stop,
            clock=clock,
            cause=None,
            timeout_seconds=config.cleanup_timeout.total_seconds(),
        )

    # FASE 3 — the extended CAS. If it refuses, the draft dies here: releasing
    # the lease (only if still ours) is the ONLY side effect allowed.
    async with conn.transaction():
        await engine.scope_to_organization(conn, job.organization_id)
        outcome = await engine.conclude_turn(
            conn,
            conversation_id=job.conversation_id,
            token=token,
            expected_version=claimed.version,
            generation=job.generation,
            target_seq=job.target_seq,
            content=content,
            idempotency_key=f"reply-{job.conversation_id}-{job.generation}",
            # O carrier do TURNO (span corrente); sem tracer, o do passe do
            # coalescer segue viagem — o sender retoma o que houver.
            otel=carrier.inject() or job.otel,
            require_runtime=True,
            channel_account_id=job.channel_account_id,
        )

    if outcome.committed:
        return TurnResult.DONE

    async with conn.transaction():
        await engine.scope_to_organization(conn, job.organization_id)
        await engine.release_lease(conn, job.conversation_id, token)
    return TurnResult.SUPERSEDED


async def run_touch(
    conn: psycopg.AsyncConnection,
    job: MissionTouchJob,
    toucher,
    *,
    config: QueueingConfig,
    clock: Clock,
    queue: PgmqQueue | None = None,
    message_id: int | None = None,
) -> TurnResult:
    """O turno do TOQUE — as mesmas três fases do run_turn, sem inbound.

    O CAS conclui contra o estado corrente (generation/next_inbound_seq lidos
    na fase 1): qualquer inbound durante a geração bumpa o alvo e o rascunho
    morre — o turno de RESPOSTA assume, com a missão já dona da conversa se um
    toque anterior saiu. Dedup por outbox: a reentrega do pgmq encontra a
    idempotency_key já escrita e arquiva sem segunda geração.
    """
    with span(
        "mission_touch",
        remote=job.otel,
        remote_role="link",
        organization_id=job.organization_id,
        conversation_id=job.conversation_id,
        node_ref=job.node_ref,
    ):
        result = await _touch(
            conn, job, toucher, config=config, clock=clock, queue=queue, message_id=message_id
        )
        annotate(outcome=result.name.lower())
        return result


async def _touch(
    conn: psycopg.AsyncConnection,
    job: MissionTouchJob,
    toucher,
    *,
    config: QueueingConfig,
    clock: Clock,
    queue: PgmqQueue | None = None,
    message_id: int | None = None,
) -> TurnResult:
    token = uuid.uuid4()
    idempotency_key = f"touch-{job.conversation_id}-{job.touch_id}"

    # FASE 1 — claim + alvos do CAS, uma transação curta.
    async with conn.transaction():
        await engine.scope_to_organization(conn, job.organization_id)
        job = replace(job, channel_account_id=await whatsapp_accounts.resolve_account_id(
            conn, organization_id=job.organization_id, conversation_id=job.conversation_id,
            channel_account_id=job.channel_account_id,
        ))
        claimed = await engine.claim_conversation(
            conn, job.conversation_id, token, lease=config.conversation_lease
        )
        if claimed is not None:
            if await engine.outbox_key_exists(conn, idempotency_key):
                await engine.release_lease(conn, job.conversation_id, token)
                return TurnResult.STALE
            generation, target_seq = await engine.turn_pointers(conn, job.conversation_id)

    if claimed is None:
        return TurnResult.BUSY

    # FASE 2 — trabalho fora de transação, com o keepalive respirando.
    beat_stop = asyncio.Event()
    beat = asyncio.create_task(
        _keepalive(
            conn,
            job,
            token,
            stop=beat_stop,
            config=config,
            clock=clock,
            queue=queue,
            message_id=message_id,
        )
    )
    producer = asyncio.create_task(toucher(job))
    try:
        async with asyncio.timeout(config.turn_timeout.total_seconds()):
            draft = await asyncio.shield(producer)
    except BaseException as error:
        await _cleanup_phase_two(
            conn,
            job,
            token,
            producer,
            beat,
            beat_stop=beat_stop,
            clock=clock,
            cause=error,
            timeout_seconds=config.cleanup_timeout.total_seconds(),
        )
        raise
    else:
        await _cleanup_phase_two(
            conn,
            job,
            token,
            producer,
            beat,
            beat_stop=beat_stop,
            clock=clock,
            cause=None,
            timeout_seconds=config.cleanup_timeout.total_seconds(),
        )

    # FASE 3 — o CAS estendido, com kind e moment_ids do toque.
    async with conn.transaction():
        await engine.scope_to_organization(conn, job.organization_id)
        outcome = await engine.conclude_turn(
            conn,
            conversation_id=job.conversation_id,
            token=token,
            expected_version=claimed.version,
            generation=generation,
            target_seq=target_seq,
            content=draft.content,
            idempotency_key=idempotency_key,
            kind="funnel_touch",
            channel_account_id=job.channel_account_id,
            moment_ids=draft.moment_ids,
            otel=carrier.inject() or job.otel,
        )
        if outcome.committed and outcome.outbox_id is not None and draft.mission_version_id:
            # O toque SAIU: a missão vira dona da conversa (§3.2.2) — na mesma
            # transação do conclude, para nunca haver toque órfão de dona.
            await engine.set_conversation_owner(
                conn, job.conversation_id, draft.mission_version_id
            )

    if outcome.committed:
        return TurnResult.DONE

    async with conn.transaction():
        await engine.scope_to_organization(conn, job.organization_id)
        await engine.release_lease(conn, job.conversation_id, token)
    return TurnResult.SUPERSEDED
