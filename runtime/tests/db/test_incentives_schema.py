"""A DDL da concessão auditável (§3.3.4 a 3.3.6) — os contratos que o engine assume.

Quatro propriedades que o offer_engine (commit 22) vai construir EM CIMA, então
têm que ser do banco, não do Python:

  * a corrida entre dois fluxos morre na idempotency_key UNIQUE — o segundo
    INSERT conflita (o engine transforma o conflito em "receba o grant do 1º");
  * quem autorizou existe na linha: grant de missão sem missão (ou de momento
    sem momento) não entra;
  * o ledger é append-only DE VERDADE — UPDATE morre no trigger, para qualquer
    papel (a história não se reescreve);
  * worker de A não enxerga a verdade comercial nem os grants de B (RLS).
"""

import uuid

import psycopg
import pytest

from tests.db.conftest import TwoTenants, as_app_role
from tests.db.factories import (
    create_contact,
    create_mission,
    create_moment,
    unique_id,
)


def _grant_row(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    contact_id: uuid.UUID,
    *,
    mission_id: uuid.UUID,
    key: str,
    object_ref: str = "cart-1",
) -> uuid.UUID:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into public.incentive_grants
                (organization_id, contact_id, object_kind, object_ref, source,
                 mission_version_id, kind, value, validity_until, idempotency_key)
            values (%s, %s, 'cart', %s, 'mission', %s, 'percent', 10,
                    now() + interval '48 hours', %s)
            returning id
            """,
            (organization_id, contact_id, object_ref, mission_id, key),
        )
        (grant_id,) = cur.fetchone()
    return grant_id


class TestTheGrantContract:
    def test_the_same_request_twice_is_one_grant(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        org = two_tenants.a.id
        contact = create_contact(admin, org)
        mission = create_mission(admin, org, status="active")
        key = unique_id("idem")

        _grant_row(admin, org, contact, mission_id=mission, key=key)
        with pytest.raises(psycopg.errors.UniqueViolation):
            _grant_row(admin, org, contact, mission_id=mission, key=key)

    def test_a_grant_without_its_authorizer_does_not_enter(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        org = two_tenants.a.id
        contact = create_contact(admin, org)
        with pytest.raises(psycopg.errors.CheckViolation):
            with admin.cursor() as cur:
                cur.execute(
                    """
                    insert into public.incentive_grants
                        (organization_id, contact_id, object_kind, object_ref,
                         source, kind, value, validity_until, idempotency_key)
                    values (%s, %s, 'cart', 'cart-9', 'mission', 'percent', 10,
                            now() + interval '1 hour', %s)
                    """,
                    (org, contact, unique_id("idem")),
                )

    def test_the_window_must_be_a_window(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        with pytest.raises(psycopg.errors.CheckViolation):
            create_moment(admin, two_tenants.a.id, starts_in_hours=2.0, ends_in_hours=1.0)


class TestTheLedgerIsHistory:
    def test_an_update_dies_in_the_trigger(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        org = two_tenants.a.id
        contact = create_contact(admin, org)
        with admin.cursor() as cur:
            cur.execute(
                """
                insert into public.incentive_ledger
                    (organization_id, contact_id, entry_kind, reason)
                values (%s, %s, 'denied', 'concession kind none')
                returning id
                """,
                (org, contact),
            )
            (entry_id,) = cur.fetchone()

        with pytest.raises(psycopg.errors.RaiseException, match="append-only"):
            admin.execute(
                "update public.incentive_ledger set reason = 'reescrita' where id = %s",
                (entry_id,),
            )

    def test_worker_holds_no_update_grant_either(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        # Cinto e suspensório: além do trigger, o papel nem tem o privilégio.
        with as_app_role(dsn, "worker_role", two_tenants.a.id) as worker:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                worker.execute("update public.incentive_ledger set reason = 'x'")


class TestTheBoundary:
    def test_worker_of_a_sees_no_moments_of_b(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        create_moment(admin, two_tenants.b.id, public_claim="segredo do vizinho")
        with as_app_role(dsn, "worker_role", two_tenants.a.id) as worker:
            rows = worker.execute("select * from public.commercial_moments").fetchall()
        assert rows == []

    def test_worker_of_a_sees_no_grants_of_b(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        org_b = two_tenants.b.id
        contact_b = create_contact(admin, org_b)
        mission_b = create_mission(admin, org_b, status="active")
        _grant_row(admin, org_b, contact_b, mission_id=mission_b, key=unique_id("idem"))

        with as_app_role(dsn, "worker_role", two_tenants.a.id) as worker:
            rows = worker.execute("select * from public.incentive_grants").fetchall()
        assert rows == []

    def test_worker_cannot_write_a_grant_into_the_neighbour(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        org_b = two_tenants.b.id
        contact_b = create_contact(admin, org_b)
        mission_b = create_mission(admin, org_b, status="active")

        with as_app_role(dsn, "worker_role", two_tenants.a.id) as worker:
            # "new row violates row-level security policy" chega como 42501.
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                worker.execute(
                    """
                    insert into public.incentive_grants
                        (organization_id, contact_id, object_kind, object_ref, source,
                         mission_version_id, kind, value, validity_until, idempotency_key)
                    values (%s, %s, 'cart', 'c', 'mission', %s, 'percent', 10,
                            now() + interval '1 hour', %s)
                    """,
                    (org_b, contact_b, mission_b, unique_id("idem")),
                )
