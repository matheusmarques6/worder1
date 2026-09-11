"""The process replays eligible dead letters for queues it actually serves."""

import asyncio
import time

import psycopg
from psycopg.types.json import Jsonb

from agents_runtime.app import run
from agents_runtime.config import QueueingConfig

DEADLINE = 15
REPLAYED = ("q_inbound", "q_domain_events")
MANUAL_ONLY = ("q_scheduled", "q_evals")


async def _eventually(check, note: str) -> None:
    deadline = time.monotonic() + DEADLINE
    while time.monotonic() < deadline:
        if await check():
            return
        await asyncio.sleep(0.05)
    raise TimeoutError(f"never became true: {note}")


async def _length(conn: psycopg.AsyncConnection, queue: str) -> int:
    row = await (
        await conn.execute("select queue_length from pgmq.metrics(%s)", (queue,))
    ).fetchone()
    assert row is not None
    return int(row[0])


async def test_process_replays_supported_transient_dead_letters_automatically(
    dsn: str,
    admin: psycopg.AsyncConnection,
    tiny_config: QueueingConfig,
) -> None:
    for queue in (*REPLAYED, *MANUAL_ONLY):
        await admin.execute(
            "select pgmq.send(%s, %s)",
            (
                f"{queue}_dlq",
                Jsonb(
                    {
                        "marker": queue,
                        "failure_kind": "transient",
                        "replay_count": 0,
                    }
                ),
            ),
        )

    stop = asyncio.Event()
    running = asyncio.create_task(
        run(
            dsn,
            stop=stop,
            config=tiny_config,
            workers=0,
            worker_set_role="worker_role",
        )
    )
    try:

        async def supported_are_replayed() -> bool:
            return all([await _length(admin, queue) == 1 for queue in REPLAYED])

        await _eventually(supported_are_replayed, "supported DLQs replayed")

        for queue in REPLAYED:
            payload = await (
                await admin.execute(
                    f"select message from pgmq.q_{queue} order by msg_id desc limit 1"
                )
            ).fetchone()
            assert payload is not None
            assert payload[0]["marker"] == queue
            assert payload[0]["replay_count"] == 1
            assert await _length(admin, f"{queue}_dlq") == 0

        for queue in MANUAL_ONLY:
            assert await _length(admin, queue) == 0
            assert await _length(admin, f"{queue}_dlq") == 1
    finally:
        stop.set()
        await asyncio.wait_for(running, DEADLINE)
