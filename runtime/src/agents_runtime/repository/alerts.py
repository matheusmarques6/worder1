"""Alerts the merchant sees — `public.alerts` (§6.5).

Takes a connection, never opens one: the caller owns the short transaction and
the `SET LOCAL app.organization_id` inside it.

The first writer is Judge 1 (S8), and the reason is worth stating: a reply that
is blocked leaves the customer with silence, and silence is indistinguishable
from a broken agent unless somebody is told. The alert is what turns a
deliberate non-send into an event a human can look at.
"""

from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

#: The alert Judge 1 opens when a draft never left (`alerts.type` CHECK).
CRITICAL_VIOLATION = "critical_violation"

#: Inbound (ou toque) sem missão ativa para assumir o turno (§3.4 inv. 8).
NO_ACTIVE_MISSION = "no_active_mission"


async def open_alert(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    type: str,
    severity: str,
    title: str,
    payload: dict | None = None,
) -> UUID:
    cursor = await conn.execute(
        """
        insert into public.alerts (organization_id, type, severity, title, metadata)
        values (%s, %s, %s, %s, %s)
        returning id
        """,
        (organization_id, type, severity, title, Jsonb(payload if payload is not None else {})),
    )
    return (await cursor.fetchone())[0]
