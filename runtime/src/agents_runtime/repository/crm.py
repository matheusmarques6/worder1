"""CRM do lojista para as ferramentas do agente (alteração 2026-10-15-06).

Tudo o que `save_customer`, `save_interests`, `timeline` e `transfer_to_human`
leem ou escrevem: `contacts`, `contact_activities`, `whatsapp_product_interests`.
Escopo por org vem da conexão (`scope_to_organization`) e das políticas de
`worker_role`; mesmo assim cada SQL repete `organization_id = %s` — a mesma
cinta dupla que `orders.py` já usa.
"""

from dataclasses import dataclass
from typing import Any
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

ACTIVITY_TYPES = frozenset(
    {"note", "whatsapp", "order", "email", "call", "meeting", "visit", "custom", "agent_assigned"}
)


@dataclass(frozen=True, slots=True)
class ContactRow:
    id: UUID
    phone: str | None
    email: str | None
    tags: tuple[str, ...]
    custom_fields: dict


@dataclass(frozen=True, slots=True)
class ActivityRow:
    type: str
    title: str
    description: str | None
    created_at: Any


def _contact(row: tuple) -> ContactRow:
    return ContactRow(
        id=row[0],
        phone=row[1],
        email=row[2],
        tags=tuple(row[3] or ()),
        custom_fields=dict(row[4] or {}),
    )


_CONTACT_COLUMNS = "id, phone, email, tags, custom_fields"


async def find_contact(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    contact_id: UUID | None = None,
    phone: str | None = None,
    email: str | None = None,
) -> ContactRow | None:
    """Por id, senão por telefone, senão por e-mail — a ordem do TS
    (`save_customer.ts:55-80`), que existe por causa do unique (org, email)."""
    if contact_id is not None:
        cursor = await conn.execute(
            f"select {_CONTACT_COLUMNS} from public.contacts"
            " where id = %s and organization_id = %s",
            (contact_id, organization_id),
        )
        row = await cursor.fetchone()
        if row is not None:
            return _contact(row)
    if phone:
        cursor = await conn.execute(
            f"select {_CONTACT_COLUMNS} from public.contacts"
            " where organization_id = %s and phone = %s limit 1",
            (organization_id, phone),
        )
        row = await cursor.fetchone()
        if row is not None:
            return _contact(row)
    if email:
        cursor = await conn.execute(
            f"select {_CONTACT_COLUMNS} from public.contacts"
            " where organization_id = %s and lower(email) = lower(%s) limit 1",
            (organization_id, email),
        )
        row = await cursor.fetchone()
        if row is not None:
            return _contact(row)
    return None


async def update_contact(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    contact_id: UUID,
    first_name: str | None,
    email: str | None,
    tags: tuple[str, ...] | None,
    custom_fields: dict | None,
) -> None:
    await conn.execute(
        """
        update public.contacts
           set first_name = coalesce(%s, first_name),
               email = coalesce(%s, email),
               tags = coalesce(%s, tags),
               custom_fields = coalesce(%s, custom_fields),
               updated_at = now()
         where id = %s and organization_id = %s
        """,
        (
            first_name,
            email,
            list(tags) if tags is not None else None,
            Jsonb(custom_fields) if custom_fields is not None else None,
            contact_id,
            organization_id,
        ),
    )


async def insert_contact(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    phone: str | None,
    first_name: str | None,
    email: str | None,
    tags: tuple[str, ...],
    custom_fields: dict,
) -> UUID:
    cursor = await conn.execute(
        """
        insert into public.contacts
            (organization_id, phone, first_name, email, tags, custom_fields, source,
             created_at, updated_at)
        values (%s, %s, %s, %s, %s, %s, 'ai_agent', now(), now())
        returning id
        """,
        (organization_id, phone, first_name, email, list(tags), Jsonb(custom_fields)),
    )
    return (await cursor.fetchone())[0]


async def recent_activities(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    contact_id: UUID,
    limit: int = 10,
) -> tuple[ActivityRow, ...]:
    cursor = await conn.execute(
        """
        select type, title, description, created_at
          from public.contact_activities
         where organization_id = %s and contact_id = %s
         order by created_at desc
         limit %s
        """,
        (organization_id, contact_id, limit),
    )
    return tuple(ActivityRow(*row) for row in await cursor.fetchall())


async def add_activity(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    contact_id: UUID,
    conversation_id: UUID | None,
    type: str,
    title: str,
    description: str | None,
    metadata: dict,
) -> UUID:
    cursor = await conn.execute(
        """
        insert into public.contact_activities
            (organization_id, contact_id, conversation_id, type, title, description, metadata,
             created_by_name, created_by_type, source)
        values (%s, %s, %s, %s, %s, %s, %s, 'AI Agent', 'ai_agent', 'ai_agent')
        returning id
        """,
        (
            organization_id,
            contact_id,
            conversation_id,
            type if type in ACTIVITY_TYPES else "note",
            title,
            description,
            Jsonb(metadata),
        ),
    )
    return (await cursor.fetchone())[0]


async def product_interest_exists(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    contact_id: UUID,
    product_id: str,
) -> bool:
    cursor = await conn.execute(
        """
        select exists (
          select 1 from public.whatsapp_product_interests
           where organization_id = %s and contact_id = %s and product_id = %s
             and variant_id is null
        )
        """,
        (organization_id, contact_id, product_id),
    )
    return bool((await cursor.fetchone())[0])


async def add_product_interest(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    contact_id: UUID,
    phone: str | None,
    product_id: str,
    product_title: str | None,
) -> None:
    await conn.execute(
        """
        insert into public.whatsapp_product_interests
            (organization_id, contact_id, phone, product_id, product_title)
        values (%s, %s, %s, %s, %s)
        """,
        (organization_id, contact_id, phone, product_id, product_title),
    )
