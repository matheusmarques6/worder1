"""Grants e ledger (§3.3.5/3.3.6) — o estado e a história da concessão.

Quem DECIDE é o `commerce.offer_engine`; aqui é só a materialização, na
transação curta de quem chamou. Duas regras do banco atravessam esta camada:

  * `insert_grant` usa ON CONFLICT (idempotency_key) DO NOTHING e devolve
    `(grant, created)` — a corrida entre dois fluxos termina com os dois
    segurando O MESMO grant (§3.3.5), e quem chamou sabe se emitiu ou achou;
  * o ledger só tem INSERT (append-only é trigger + privilégio; a história
    não se reescreve).

Escopo por RLS: a conexão do worker está trancada na org (sem WHERE de org).
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from uuid import UUID

import psycopg

_GRANT_COLUMNS = """
    id, organization_id, contact_id, conversation_id, object_kind, object_ref,
    source, mission_version_id, moment_id, kind, value, validity_until,
    max_uses, uses, status, coupon_code, idempotency_key
"""


@dataclass(frozen=True, slots=True)
class Grant:
    id: UUID
    organization_id: UUID
    contact_id: UUID
    conversation_id: UUID | None
    object_kind: str
    object_ref: str
    source: str
    mission_version_id: UUID | None
    moment_id: UUID | None
    kind: str
    value: Decimal
    validity_until: datetime
    max_uses: int
    uses: int
    status: str
    coupon_code: str | None
    idempotency_key: str


def _as_grant(row) -> Grant:
    return Grant(
        id=row[0], organization_id=row[1], contact_id=row[2], conversation_id=row[3],
        object_kind=row[4], object_ref=row[5], source=row[6], mission_version_id=row[7],
        moment_id=row[8], kind=row[9], value=row[10], validity_until=row[11],
        max_uses=row[12], uses=row[13], status=row[14], coupon_code=row[15],
        idempotency_key=row[16],
    )


async def insert_grant(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    contact_id: UUID,
    conversation_id: UUID | None,
    object_kind: str,
    object_ref: str,
    source: str,
    mission_version_id: UUID | None,
    moment_id: UUID | None,
    node_ref: str | None,
    kind: str,
    value: Decimal,
    validity_until: datetime,
    max_uses: int,
    idempotency_key: str,
) -> tuple[Grant, bool]:
    """Emite — ou descobre que outro fluxo emitiu primeiro. `(grant, created)`."""
    cursor = await conn.execute(
        f"""
        insert into public.incentive_grants
            (organization_id, contact_id, conversation_id, object_kind, object_ref,
             source, mission_version_id, moment_id, node_ref, kind, value,
             validity_until, max_uses, idempotency_key)
        values (%(org)s, %(contact)s, %(conversation)s, %(object_kind)s, %(object_ref)s,
                %(source)s, %(mission)s, %(moment)s, %(node_ref)s, %(kind)s, %(value)s,
                %(validity)s, %(max_uses)s, %(key)s)
        on conflict (idempotency_key) do nothing
        returning {_GRANT_COLUMNS}
        """,
        {
            "org": organization_id, "contact": contact_id, "conversation": conversation_id,
            "object_kind": object_kind, "object_ref": object_ref, "source": source,
            "mission": mission_version_id, "moment": moment_id, "node_ref": node_ref,
            "kind": kind, "value": value, "validity": validity_until,
            "max_uses": max_uses, "key": idempotency_key,
        },
    )
    row = await cursor.fetchone()
    if row is not None:
        return _as_grant(row), True

    cursor = await conn.execute(
        f"select {_GRANT_COLUMNS} from public.incentive_grants where idempotency_key = %s",
        (idempotency_key,),
    )
    existing = await cursor.fetchone()
    if existing is None:  # pragma: no cover — só se o 1º fluxo deu rollback
        raise LookupError(f"grant sumiu entre o conflito e a leitura: {idempotency_key}")
    return _as_grant(existing), False


async def load_grant(conn: psycopg.AsyncConnection, grant_id: UUID) -> Grant | None:
    cursor = await conn.execute(
        f"select {_GRANT_COLUMNS} from public.incentive_grants where id = %s",
        (grant_id,),
    )
    row = await cursor.fetchone()
    return None if row is None else _as_grant(row)


async def find_reusable_grant(
    conn: psycopg.AsyncConnection,
    *,
    contact_id: UUID,
    object_kind: str,
    object_ref: str,
    kind: str | None = None,
) -> Grant | None:
    """Um grant vigente para o MESMO benefício no MESMO objeto — reuso antes
    de emissão, sempre (o cliente que pede duas vezes não ganha dois cupons)."""
    cursor = await conn.execute(
        f"""
        select {_GRANT_COLUMNS}
          from public.incentive_grants
         where contact_id = %(contact)s
           and object_kind = %(object_kind)s
           and object_ref = %(object_ref)s
           and (%(kind)s::text is null or kind = %(kind)s)
           and status = 'issued'
           and validity_until > now()
           and uses < max_uses
         order by created_at
         limit 1
        """,
        {
            "contact": contact_id, "object_kind": object_kind,
            "object_ref": object_ref, "kind": kind,
        },
    )
    row = await cursor.fetchone()
    return None if row is None else _as_grant(row)


async def append_ledger(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    contact_id: UUID,
    entry_kind: str,
    reason: str,
    grant_id: UUID | None = None,
) -> None:
    await conn.execute(
        """
        insert into public.incentive_ledger
            (organization_id, contact_id, entry_kind, grant_id, reason)
        values (%s, %s, %s, %s, %s)
        """,
        (organization_id, contact_id, entry_kind, grant_id, reason),
    )


async def record_coupon_code(
    conn: psycopg.AsyncConnection, grant_id: UUID, coupon_code: str
) -> None:
    """O código do provedor, gravado DEPOIS da emissão — nunca sobrescreve."""
    await conn.execute(
        """
        update public.incentive_grants
           set coupon_code = %s
         where id = %s and coupon_code is null
        """,
        (coupon_code, grant_id),
    )


async def recent_ledger_lines(
    conn: psycopg.AsyncConnection, *, contact_id: UUID, limit: int = 5
) -> tuple[str, ...]:
    """As últimas entradas, humanas, para o bloco de ESTADO do prompt."""
    cursor = await conn.execute(
        """
        select entry_kind, reason, to_char(created_at, 'DD/MM')
          from public.incentive_ledger
         where contact_id = %s
         order by created_at desc
         limit %s
        """,
        (contact_id, limit),
    )
    rows = await cursor.fetchall()
    return tuple(f"{row[0]} {row[2]}: {row[1]}" for row in rows)
