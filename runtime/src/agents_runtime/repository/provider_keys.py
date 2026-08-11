"""As chaves BYO da org (organization_api_keys) — leitura para a cascata D4.

FORK (desvio declarado, FORK.md item 6): organization_api_keys é tabela
legada com RLS desligada no banco vivo, então o escopo por org é EXPLÍCITO
na query até a remediação ser aprovada.
"""

from dataclasses import dataclass
from uuid import UUID

import psycopg


@dataclass(frozen=True, slots=True)
class ProviderKeyRow:
    provider: str
    api_key: str
    base_url: str | None


async def load_org_provider_keys(
    conn: psycopg.AsyncConnection, *, organization_id: UUID
) -> tuple[ProviderKeyRow, ...]:
    cursor = await conn.execute(
        """
        select provider, api_key, base_url
          from public.organization_api_keys
         where organization_id = %s
           and coalesce(is_active, true)
         order by created_at
        """,
        (organization_id,),
    )
    return tuple(
        ProviderKeyRow(provider=row[0], api_key=row[1], base_url=row[2])
        for row in await cursor.fetchall()
    )
