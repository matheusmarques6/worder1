"""9.2 — o fim de vida do grant: consumo pelo pedido e expiração por relógio.

O DoD do adendo, executável: grant emitido → cupom → pedido pago com o código
→ 'consumed' no grant E no ledger; webhook reentregue → 'already' e nada muda;
grant vencido → 'expired' sem intervenção (o sweep roda no housekeeping do
sender, junto dos de outbox). Cupom que não nasceu de grant não é assunto
nosso ('not_found').
"""

import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import psycopg
import pytest

from agents_runtime.config import QueueingConfig
from agents_runtime.queueing.sender import sender_pass
from agents_runtime.randomness import SystemRandomness
from tests.db.factories import create_contact, create_mission, unique_id
from tests.support.fake_channel import SCHEMA_SQL, FakeChannel


@pytest.fixture
def org(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = admin.execute(
        "insert into public.organizations (name, slug) values ('lifecycle', %s) returning id",
        (unique_id("org"),),
    ).fetchone()[0]
    yield organization_id
    admin.execute("delete from public.organizations where id = %s", (organization_id,))


def _grant(
    admin: psycopg.Connection,
    org: uuid.UUID,
    *,
    coupon_code: str | None = "WD-TESTE01",
    max_uses: int = 1,
    hours_left: float = 24,
) -> tuple[uuid.UUID, uuid.UUID]:
    contact = create_contact(admin, org)
    mission = create_mission(admin, org, status="active")
    (grant_id,) = admin.execute(
        """
        insert into public.incentive_grants
            (organization_id, contact_id, object_kind, object_ref, source,
             mission_version_id, kind, value, validity_until, max_uses,
             coupon_code, idempotency_key)
        values (%s, %s, 'cart', 'cart-1', 'mission', %s, 'percent', 10,
                %s, %s, %s, %s)
        returning id
        """,
        (
            org, contact, mission,
            datetime.now(UTC) + timedelta(hours=hours_left),
            max_uses, coupon_code, unique_id("idem"),
        ),
    ).fetchone()
    return grant_id, contact


def consume(admin: psycopg.Connection, org: uuid.UUID, code: str, order: str) -> tuple:
    admin.execute("set role service_role")
    try:
        return admin.execute(
            "select * from public.consume_incentive_grant(%s, %s, %s)",
            (org, code, order),
        ).fetchone()
    finally:
        admin.execute("reset role")


class TestConsumption:
    def test_the_paid_order_consumes_grant_and_ledger_together(
        self, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        grant_id, _ = _grant(admin, org)

        status, returned = consume(admin, org, "WD-TESTE01", "pedido-777")

        assert (status, returned) == ("consumed", grant_id)
        uses, grant_status = admin.execute(
            "select uses, status from public.incentive_grants where id = %s", (grant_id,)
        ).fetchone()
        assert (uses, grant_status) == (1, "consumed")
        (entry,) = admin.execute(
            "select entry_kind, order_ref from public.incentive_ledger"
            " where grant_id = %s and entry_kind = 'consumed'",
            (grant_id,),
        ).fetchall()
        assert entry == ("consumed", "pedido-777")

    def test_a_redelivered_webhook_is_already_and_changes_nothing(
        self, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        grant_id, _ = _grant(admin, org)

        consume(admin, org, "WD-TESTE01", "pedido-777")
        status, returned = consume(admin, org, "WD-TESTE01", "pedido-777")

        assert (status, returned) == ("already", grant_id)
        (uses,) = admin.execute(
            "select uses from public.incentive_grants where id = %s", (grant_id,)
        ).fetchone()
        assert uses == 1

    def test_case_insensitive_echo_from_the_store(
        self, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        _grant(admin, org)
        status, _ = consume(admin, org, "wd-teste01", "pedido-1")
        assert status == "consumed"

    def test_a_handmade_coupon_is_not_ours(
        self, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        _grant(admin, org)
        status, returned = consume(admin, org, "BLACKFRIDAY", "pedido-9")
        assert (status, returned) == ("not_found", None)

    def test_multi_use_only_consumes_at_the_last_use(
        self, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        grant_id, _ = _grant(admin, org, max_uses=2)

        first, _ = consume(admin, org, "WD-TESTE01", "pedido-1")
        (mid_status,) = admin.execute(
            "select status from public.incentive_grants where id = %s", (grant_id,)
        ).fetchone()
        second, _ = consume(admin, org, "WD-TESTE01", "pedido-2")
        (end_status,) = admin.execute(
            "select status from public.incentive_grants where id = %s", (grant_id,)
        ).fetchone()

        assert (first, mid_status) == ("consumed", "issued")
        assert (second, end_status) == ("consumed", "consumed")


@asynccontextmanager
async def as_sender(dsn: str):
    async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
        await conn.execute("set role sender_role")
        yield conn


class TestExpiration:
    async def test_the_sender_housekeeping_expires_without_a_human(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        grant_id, _ = _grant(admin, org, hours_left=-1)
        admin.execute(SCHEMA_SQL)

        async with as_sender(dsn) as conn:
            await sender_pass(
                conn,
                FakeChannel(dsn),
                config=QueueingConfig(humanize_delays=False),
                randomness=SystemRandomness(),
            )

        status = admin.execute(
            "select status from public.incentive_grants where id = %s", (grant_id,)
        ).fetchone()[0]
        assert status == "expired"
        (entry,) = admin.execute(
            "select entry_kind from public.incentive_ledger where grant_id = %s",
            (grant_id,),
        ).fetchall()
        assert entry == ("expired",)

    async def test_the_second_sweep_finds_nothing(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        _grant(admin, org, hours_left=-1)
        from agents_runtime.repository import engine as engine_repo

        async with as_sender(dsn) as conn:
            first = await engine_repo.expire_incentive_grants(conn)
            second = await engine_repo.expire_incentive_grants(conn)

        assert (first, second) == (1, 0)
