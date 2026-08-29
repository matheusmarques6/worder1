"""Composition root — the single asyncio process of ADR-1/2, assembled.

Five kinds of task share one process and one stop event:

  · the coalescer tick — the only origin of inbound jobs;
  · N workers — each an EngineLoop consuming the queues it has handlers for;
  · the sender — drains the outbox through the channel port;
  · the heartbeat — proof 3 of the milestone, born observable.

Everything is injected: config, clock, randomness, responder, channel. The
pipeline suite runs THIS function (and the real process runs nothing else),
with tiny intervals instead of patched internals — the engine never knows it
is being tested.

Shutdown is the E0-08 property, now for every loop: stop claiming, finish
what is in hand, return. Nothing here checks the stop event mid-job.
"""

import asyncio
import logging
from collections.abc import Mapping

import psycopg

from agents_runtime.agent_core.responder import Responder, fixed_responder
from agents_runtime.agent_core.toucher import fixed_toucher
from agents_runtime.channels.port import ChannelPort
from agents_runtime.clock import Clock, SystemClock
from agents_runtime.config import QueueingConfig
from agents_runtime.obs import carrier
from agents_runtime.obs.telemetry import span
from agents_runtime.queueing import DOMAIN_EVENTS, INBOUND
from agents_runtime.queueing.engine_loop import Ack, EngineLoop, Handler
from agents_runtime.queueing.jobs import InboundJob, MissionTouchJob
from agents_runtime.queueing.sender import sender_pass
from agents_runtime.queueing.tenant_slots import TenantSlots
from agents_runtime.queueing.worker import TurnResult, run_touch, run_turn
from agents_runtime.randomness import Randomness, SystemRandomness
from agents_runtime.repository import engine
from agents_runtime.repository.queue import PgmqQueue
from agents_runtime.repository.scope import SENDER_ROLE, WORKER_ROLE, assert_rls_enforced

APPLICATION_NAME = "agents-runtime"


async def _connect(
    dsn: str, set_role: str | None, expected_role: str
) -> psycopg.AsyncConnection:
    """Abre uma conexão de pool e prova que ela é o role que o pool exige.

    `expected_role` é a CONSTANTE do pool (`WORKER_ROLE`/`SENDER_ROLE`), nunca
    o valor da env: a env é o que se aplica, a constante é o que se cobra. Com
    os dois vindo do mesmo lugar a checagem de identidade era tautológica e
    `AGENTS_WORKER_SET_ROLE=sender_role` subia aprovado, para morrer de
    `permission denied` no meio do primeiro turno.
    """
    conn = await psycopg.AsyncConnection.connect(
        dsn, autocommit=True, application_name=APPLICATION_NAME
    )
    if set_role:
        # SET ROLE é o ÚNICO caminho, aqui e em produção: worker_role e
        # sender_role são NOLOGIN de propósito (20260812000002) — senha em
        # migration seria segredo em git —, então "logar COMO o role" não
        # existe. O `if` não é mais uma porta aberta: sem role a guarda abaixo
        # recusa a conexão — ele só existe porque `set role None` não é SQL.
        await conn.execute("set role " + set_role)

    # Toda conexão de pool nasce aqui — pulse, workers e sender. A guarda recebe
    # o role esperado e cobra as três coisas: que a env exista, que o role não
    # ignore a RLS, e que a env seja a do pool certo. Sem ela o processo
    # ficava sendo o dono do DSN (BYPASSRLS no Supabase mesmo sem superuser) e a
    # camada de repositório — escrita sem `where organization_id` porque "a RLS
    # escopa" — lia cross-org calada. Falha alta na partida, antes do trabalho.
    await assert_rls_enforced(conn, expected_role)
    return conn


async def _sleep_or_stop(clock: Clock, stop: asyncio.Event, seconds: float) -> None:
    sleep = asyncio.ensure_future(clock.sleep(seconds))
    stopped = asyncio.ensure_future(stop.wait())
    _, pending = await asyncio.wait({sleep, stopped}, return_when=asyncio.FIRST_COMPLETED)
    for task in pending:
        task.cancel()


async def run(
    dsn: str,
    *,
    stop: asyncio.Event,
    config: QueueingConfig | None = None,
    clock: Clock | None = None,
    randomness: Randomness | None = None,
    respond: Responder | None = None,
    touch=None,
    channel: ChannelPort | None = None,
    extra_handlers: Mapping[str, Handler] | None = None,
    process_name: str = APPLICATION_NAME,
    workers: int = 2,
    worker_set_role: str | None = None,
    sender_set_role: str | None = None,
) -> None:
    config = config or QueueingConfig()
    clock = clock or SystemClock()
    randomness = randomness or SystemRandomness()
    respond = respond or fixed_responder()
    touch = touch or fixed_toucher()

    # Shared across every worker loop: the cap is per tenant, per PROCESS —
    # which is only the real cap because the process is single (ADR-2).
    slots = TenantSlots(config.tenant_concurrency)

    async def inbound_handler_for(
        conn: psycopg.AsyncConnection, queues: dict[str, PgmqQueue]
    ) -> Handler:
        async def handle(queue_name: str, message) -> Ack:
            job = InboundJob.from_payload(message.payload)

            # A full tenant postpones the job — set_vt, never a drop, never an
            # in-memory queue. The other tenants keep flowing (cenário 9).
            if not slots.try_acquire(job.organization_id):
                return Ack.RETRY_SHORT
            try:
                result = await run_turn(
                    conn,
                    job,
                    respond,
                    config=config,
                    clock=clock,
                    queue=queues.get(queue_name),
                    message_id=message.id,
                )
            finally:
                slots.release(job.organization_id)
            return Ack.RETRY_SHORT if result is TurnResult.BUSY else Ack.ARCHIVE

        return handle

    def domain_handler_for(
        conn: psycopg.AsyncConnection, queues: dict[str, PgmqQueue]
    ) -> Handler:
        async def handle(queue_name: str, message) -> Ack:
            # FORK: o payload canônico é o toque de missão (emit_ai_mission_job);
            # o webhook_event do motor morreu com internal.webhook_events.
            # Payload fora do contrato = ValueError = permanente = DLQ.
            job = MissionTouchJob.from_payload(message.payload)

            # Toque é turno de LLM inteiro: o cap por tenant vale aqui também.
            if not slots.try_acquire(job.organization_id):
                return Ack.RETRY_SHORT
            try:
                result = await run_touch(
                    conn,
                    job,
                    touch,
                    config=config,
                    clock=clock,
                    queue=queues.get(queue_name),
                    message_id=message.id,
                )
            finally:
                slots.release(job.organization_id)
            return Ack.RETRY_SHORT if result is TurnResult.BUSY else Ack.ARCHIVE

        return handle

    connections: list[psycopg.AsyncConnection] = []
    tasks: list[asyncio.Task] = []
    try:
        # -- coalescer + heartbeat share one connection: both are one-statement
        # ticks, and neither may starve the other for longer than a statement.
        pulse = await _connect(dsn, worker_set_role, WORKER_ROLE)
        connections.append(pulse)

        async def coalescer() -> None:
            while not stop.is_set():
                # O passe carimba seu contexto nos jobs (9.1b): cada turno
                # nasce em trace próprio com um LINK de volta para o passe.
                with span("coalesce_pass", queue=INBOUND):
                    await engine.coalesce_due_conversations(
                        pulse, queue=INBOUND, otel=carrier.inject()
                    )
                await _sleep_or_stop(clock, stop, config.coalescer_tick.total_seconds())

        async def heartbeat() -> None:
            while not stop.is_set():
                await engine.beat(pulse, process_name)
                try:
                    depths = await engine.queue_depths(pulse)
                except Exception:
                    # Métrica é acessório: um metrics_all indisponível não pode
                    # derrubar a prova de vida.
                    logging.getLogger(__name__).debug("queue_depths indisponível")
                else:
                    logging.getLogger(__name__).info(
                        "heartbeat", extra={"process_name": process_name, "queues": depths}
                    )
                await _sleep_or_stop(clock, stop, config.process_heartbeat_every.total_seconds())

        tasks.append(asyncio.create_task(coalescer(), name="coalescer"))
        tasks.append(asyncio.create_task(heartbeat(), name="heartbeat"))

        # -- workers: one connection and one loop each, so a slow turn on one
        # never blocks a claim on another (and cenários B get real concurrency).
        for index in range(workers):
            conn = await _connect(dsn, worker_set_role, WORKER_ROLE)
            connections.append(conn)

            queue_names = {INBOUND, DOMAIN_EVENTS, *(extra_handlers or {})}
            queues = {name: PgmqQueue(conn, name) for name in queue_names}
            handlers: dict[str, Handler] = {
                INBOUND: await inbound_handler_for(conn, queues),
                DOMAIN_EVENTS: domain_handler_for(conn, queues),
            }
            if extra_handlers:
                handlers.update(extra_handlers)

            loop = EngineLoop(
                queues=queues,
                handlers=handlers,
                config=config,
                clock=clock,
                randomness=randomness,
                stop=stop,
            )
            tasks.append(asyncio.create_task(loop.run(), name=f"worker-{index}"))

        # -- sender: only when a channel exists. There is no real adapter until
        # E1's final stretch, and a sender with nowhere to send would either
        # spin or lie.
        if channel is not None:
            sender_conn = await _connect(dsn, sender_set_role, SENDER_ROLE)
            connections.append(sender_conn)

            async def sender() -> None:
                while not stop.is_set():
                    await sender_pass(
                        sender_conn, channel, config=config, randomness=randomness, clock=clock
                    )
                    await _sleep_or_stop(clock, stop, config.sender_poll.total_seconds())

            tasks.append(asyncio.create_task(sender(), name="sender"))

        await asyncio.gather(*tasks)
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        for conn in connections:
            await conn.close()
