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

#: O cliente pediu um humano (handoff por keyword) ou o modelo tocou num
#: tópico proibido — a IA saiu de cena e alguém precisa entrar (item 30).
HANDOFF = "handoff"

#: O template de fallback da org não serve para o envio (item 34): exige
#: parâmetro que ninguém preenche. Mesmo tipo que a supressão de momento já
#: usa porque é a mesma família de problema — o template configurado não
#: entrega —, e a diferença exata está no `metadata`.
MOMENT_TEMPLATE_NOT_READY = "moment_template_not_ready"


async def open_alert(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    type: str,
    severity: str,
    title: str,
    payload: dict | None = None,
    dedup_key: str | None = None,
) -> UUID | None:
    """Abre um alerta; com `dedup_key`, o MESMO problema aberto não duplica.

    O `dedup_key` e o índice parcial que o faz valer já existiam na tabela
    (`alerts_dedup_uniq`, sobre `status = 'open'`) e não tinham escritor. Quem
    precisa dele é o alerta que um turno pode reabrir a cada mensagem — um
    tópico proibido que reincide numa conversa onde a transferência não pegou
    abriria um `critical` novo para sempre. None de volta = já havia um aberto.
    """
    cursor = await conn.execute(
        """
        insert into public.alerts
            (organization_id, type, severity, title, metadata, dedup_key)
        values (%s, %s, %s, %s, %s, %s)
        on conflict (organization_id, dedup_key)
            where dedup_key is not null and status = 'open'
            do nothing
        returning id
        """,
        (
            organization_id,
            type,
            severity,
            title,
            Jsonb(payload if payload is not None else {}),
            dedup_key,
        ),
    )
    row = await cursor.fetchone()
    return row[0] if row is not None else None
