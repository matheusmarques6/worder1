import psycopg
import pytest

from agents_runtime.app import _connect
from agents_runtime.config import QueueingConfig
from agents_runtime.repository.scope import WORKER_ROLE


async def test_statement_timeout_cancels_one_transaction_and_the_next_is_healthy(
    dsn: str,
) -> None:
    conn = await _connect(
        dsn,
        WORKER_ROLE,
        WORKER_ROLE,
        config=QueueingConfig(statement_timeout_ms=20),
    )
    try:
        role = await (await conn.execute("select current_user")).fetchone()
        timeout = await (await conn.execute("show statement_timeout")).fetchone()
        assert role == (WORKER_ROLE,)
        assert timeout == ("20ms",)

        with pytest.raises(psycopg.errors.QueryCanceled):
            async with conn.transaction():
                await conn.execute("select pg_sleep(0.1)")

        async with conn.transaction():
            healthy = await (await conn.execute("select 1")).fetchone()
        assert healthy == (1,)
    finally:
        await conn.close()
