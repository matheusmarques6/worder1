"""W2-T2b: housekeeping não pode morar só dentro do sender_pass.

`sweep_outbox_unknown`, `review_stale_unknown` e `expire_incentive_grants`
rodavam SÓ dentro de `sender_pass` — uma instância sem canal (`channel=None`)
nunca as executava, e uma lease vencida ou um grant vencido ficavam presos
para sempre. Mesmo formato de `test_composition.py`: `run(...)` real, sem
canal, observado por `eventually` contra o banco.
"""

import asyncio
import time
import uuid
from datetime import UTC, datetime, timedelta

import psycopg
import pytest

from agents_runtime.app import run
from agents_runtime.config import QueueingConfig
from tests.db.factories import (
    create_contact,
    create_mission,
    create_outbox_item,
    create_tenant,
    create_thread,
    set_runtime_mode,
    unique_id,
)

DEADLINE = 15


async def eventually(check, *, deadline_s: float = DEADLINE, note: str = ""):
    deadline = time.monotonic() + deadline_s
    while time.monotonic() < deadline:
        result = await check()
        if result:
            return result
        await asyncio.sleep(0.05)
    raise TimeoutError(f"never became true: {note}")


@pytest.fixture
def world(sync_admin: psycopg.Connection):
    organization_id = create_tenant(sync_admin)
    set_runtime_mode(sync_admin, organization_id, "runtime")
    thread = create_thread(sync_admin, organization_id)
    return organization_id, thread


def _expired_grant(sync_admin: psycopg.Connection, organization_id) -> uuid.UUID:
    """Um grant já vencido — mesmo molde do `_grant` de
    `test_grant_lifecycle.py`, sem fábrica própria: o único uso vive aqui."""
    contact_id = create_contact(sync_admin, organization_id)
    mission_id = create_mission(sync_admin, organization_id, status="active")
    (grant_id,) = sync_admin.execute(
        """
        insert into public.incentive_grants
            (organization_id, contact_id, object_kind, object_ref, source,
             mission_version_id, kind, value, validity_until, max_uses,
             coupon_code, idempotency_key)
        values (%s, %s, 'cart', 'cart-1', 'mission', %s, 'percent', 10,
                %s, 1, %s, %s)
        returning id
        """,
        (
            organization_id,
            contact_id,
            mission_id,
            datetime.now(UTC) - timedelta(hours=1),
            unique_id("WD"),
            unique_id("idem"),
        ),
    ).fetchone()
    return grant_id


async def test_housekeeping_runs_without_a_channel(
    dsn: str, admin: psycopg.AsyncConnection, sync_admin, world, tiny_config: QueueingConfig
) -> None:
    """W2-T2b: uma instância sem canal não entrega nada — mas continua
    obrigada a varrer lease vencido e expirar grant."""
    organization_id, thread = world
    outbox_id = create_outbox_item(sync_admin, organization_id, thread)
    sync_admin.execute(
        "update internal.message_outbox"
        "   set status='sending', locked_by='dead-worker',"
        "       locked_until = now() - interval '1 hour'"
        " where id=%s",
        (outbox_id,),
    )

    stop = asyncio.Event()
    running = asyncio.create_task(
        run(
            dsn,
            stop=stop,
            config=tiny_config,
            worker_set_role="worker_role",
            sender_set_role="sender_role",
        )
    )
    try:

        async def swept():
            cursor = await admin.execute(
                "select status from internal.message_outbox where id = %s", (outbox_id,)
            )
            row = await cursor.fetchone()
            return row if row and row[0] == "unknown" else None

        assert (await eventually(swept, note="lease vencido varrido sem canal"))[0] == "unknown"
    finally:
        stop.set()
        await running


async def test_housekeeping_expires_a_grant_without_a_channel(
    dsn: str, admin: psycopg.AsyncConnection, sync_admin, world, tiny_config: QueueingConfig
) -> None:
    """O mesmo housekeeping expira grant vencido, sem canal e sem pedido
    algum de envio — a expiração é estado, não entrega."""
    organization_id, _ = world
    grant_id = _expired_grant(sync_admin, organization_id)

    stop = asyncio.Event()
    running = asyncio.create_task(
        run(
            dsn,
            stop=stop,
            config=tiny_config,
            worker_set_role="worker_role",
            sender_set_role="sender_role",
        )
    )
    try:

        async def expired():
            cursor = await admin.execute(
                "select status from public.incentive_grants where id = %s", (grant_id,)
            )
            row = await cursor.fetchone()
            return row if row and row[0] == "expired" else None

        assert (await eventually(expired, note="grant vencido expirado sem canal"))[0] == "expired"
    finally:
        stop.set()
        await running
