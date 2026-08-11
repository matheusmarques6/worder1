"""O predicado "ativo" de commercial_moments é do relógio do banco (§3.3.4).

Ativo nunca é gravado — é computado a cada leitura. Estes testes provam a
tabela-verdade do predicado (aprovado/janela/kill) e a ordem que o merge
assume (prioridade desc). O confinamento A/B já está em
test_incentives_schema.py.
"""

import uuid

import psycopg
import pytest

from agents_runtime.repository import moments as moments_repo
from tests.db.conftest import TwoTenants
from tests.support.database import as_worker


@pytest.fixture
def org(admin: psycopg.Connection, two_tenants: TwoTenants) -> uuid.UUID:
    return two_tenants.a.id


async def _active_names(dsn: str, org: uuid.UUID) -> list[str]:
    async with as_worker(dsn, org) as conn:
        return [moment.name for moment in await moments_repo.load_active_moments(conn)]


class TestComputedActive:
    async def test_only_the_living_window_comes_back(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        from tests.db.factories import create_moment

        create_moment(admin, org, name="vigente")
        create_moment(admin, org, name="rascunho", status="draft")
        create_moment(admin, org, name="passado", starts_in_hours=-48, ends_in_hours=-24)
        create_moment(admin, org, name="futuro", starts_in_hours=24, ends_in_hours=48)
        create_moment(admin, org, name="morto", killed=True)

        assert await _active_names(dsn, org) == ["vigente"]

    async def test_the_kill_switch_beats_the_window(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        from tests.db.factories import create_moment

        # Janela aberta até amanhã — mas matou, morreu.
        create_moment(admin, org, name="assassinado", ends_in_hours=24, killed=True)
        assert await _active_names(dsn, org) == []

    async def test_priority_orders_the_posture(
        self, dsn: str, admin: psycopg.Connection, org: uuid.UUID
    ) -> None:
        from tests.db.factories import create_moment

        create_moment(admin, org, name="coadjuvante", priority=0)
        create_moment(admin, org, name="protagonista", priority=10)

        assert await _active_names(dsn, org) == ["protagonista", "coadjuvante"]
