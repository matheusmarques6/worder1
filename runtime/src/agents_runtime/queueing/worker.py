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
import contextlib
import uuid
from enum import Enum

import psycopg

from agents_runtime.clock import Clock
from agents_runtime.config import QueueingConfig
from agents_runtime.obs import carrier
from agents_runtime.obs.telemetry import annotate, span
from agents_runtime.queueing.jobs import InboundJob, MissionTouchJob
from agents_runtime.repository import engine
from agents_runtime.repository.queue import PgmqQueue


class TurnResult(Enum):
    """What the loop should do with the queue message afterwards."""

    DONE = "done"  # archive: the reply is queued for sending
    BUSY = "busy"  # set_vt short: someone else holds the conversation
    STALE = "stale"  # archive: this job was already answered
    SUPERSEDED = "superseded"  # archive: the CAS refused; a newer job exists


async def _keepalive(
    conn: psycopg.AsyncConnection,
    job: InboundJob,
    token: uuid.UUID,
    *,
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
    while True:
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
        await clock.sleep(config.heartbeat_every.total_seconds())


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
    beat = asyncio.create_task(
        _keepalive(
            conn, job, token, config=config, clock=clock, queue=queue, message_id=message_id
        )
    )
    try:
        try:
            content = await respond(job)
        finally:
            # The beat dies FIRST, whatever happens: releasing the lease while
            # the keepalive still shares the connection made two transactions
            # race, and the resulting error MASKED the poison — the job that
            # should have gone to the DLQ retried forever instead.
            beat.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await beat
    except BaseException:
        # The draft never existed, so the lease must not outlive the attempt.
        # Without this release, a poisoned job reached the DLQ but left the
        # conversation LOCKED for the whole lease — and the reprocessed job
        # came back to BUSY until the lease expired (cenário 7, both halves).
        async with conn.transaction():
            await engine.scope_to_organization(conn, job.organization_id)
            await engine.release_lease(conn, job.conversation_id, token)
        raise

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
    idempotency_key = f"touch-{job.conversation_id}-{message_id}"

    # FASE 1 — claim + alvos do CAS, uma transação curta.
    async with conn.transaction():
        await engine.scope_to_organization(conn, job.organization_id)
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
    beat = asyncio.create_task(
        _keepalive(
            conn, job, token, config=config, clock=clock, queue=queue, message_id=message_id
        )
    )
    try:
        try:
            draft = await toucher(job)
        finally:
            beat.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await beat
    except BaseException:
        async with conn.transaction():
            await engine.scope_to_organization(conn, job.organization_id)
            await engine.release_lease(conn, job.conversation_id, token)
        raise

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
