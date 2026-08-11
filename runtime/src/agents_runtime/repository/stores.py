"""A loja da org — via porta SECURITY DEFINER (migration 0006).

`shopify_stores` é legada, sem RLS e cheia de access_token: o worker NÃO tem
SELECT nela. A função `internal.active_shopify_store` valida que a org pedida
é a org da sessão e entrega só a linha dela — o mesmo desenho das claim
functions. O token sai como está armazenado; quem abre é o secret_box.
"""

from dataclasses import dataclass
from uuid import UUID

import psycopg


@dataclass(frozen=True, slots=True)
class StoreCredentials:
    id: UUID
    shop_domain: str
    #: Como está no banco — cifrado (v2 secret-box) ou legado em claro.
    stored_access_token: str
    currency: str


async def load_active_store(
    conn: psycopg.AsyncConnection, *, organization_id: UUID
) -> StoreCredentials | None:
    cursor = await conn.execute(
        "select id, shop_domain, access_token, currency"
        " from internal.active_shopify_store(%s)",
        (organization_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return StoreCredentials(
        id=row[0], shop_domain=row[1], stored_access_token=row[2],
        currency=row[3] or "BRL",
    )
