import uuid

import psycopg
import pytest

from agents_runtime.repository import missions as missions_repo
from tests.db.factories import create_mission, create_tenant
from tests.support.database import as_worker


@pytest.fixture
def tenant(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    yield organization_id
    with admin.cursor() as cur:
        cur.execute("delete from public.organizations where id = %s", (organization_id,))


async def test_mission_is_selected_by_event_family(
    dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
) -> None:
    discovery = create_mission(
        admin,
        tenant,
        event_type="whatsapp.received",
        status="active",
        objective="descobrir",
    )
    cart = create_mission(
        admin,
        tenant,
        event_type="cart.abandoned",
        status="active",
        objective="recuperar",
    )
    draft = create_mission(
        admin, tenant, event_type="cart.abandoned", status="draft"
    )
    other_org = create_tenant(admin)

    try:
        other_cart = create_mission(
            admin, other_org, event_type="cart.abandoned", status="active"
        )
        async with as_worker(dsn, tenant) as conn:
            selected = await missions_repo.load_active_mission(
                conn, event_type="cart.abandoned"
            )
            discovery_selected = await missions_repo.load_active_mission(
                conn, event_type="whatsapp.received"
            )

            assert selected is not None
            assert (selected.id, selected.objective) == (str(cart), "recuperar")
            assert discovery_selected is not None
            assert discovery_selected.id == str(discovery)
            assert (
                await missions_repo.load_active_mission(
                    conn, event_type="order.cancelled"
                )
                is None
            )
            assert (
                await missions_repo.load_mission_event_type(
                    conn, mission_version_id=draft
                )
                == "cart.abandoned"
            )
            assert (
                await missions_repo.load_mission_event_type(
                    conn, mission_version_id=other_cart
                )
                is None
            )
            assert (
                await missions_repo.load_mission_event_type(
                    conn, mission_version_id=uuid.uuid4()
                )
                is None
            )
    finally:
        with admin.cursor() as cur:
            cur.execute("delete from public.organizations where id = %s", (other_org,))
