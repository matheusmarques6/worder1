"""O catálogo espelhado da Shopify, para `product_lookup` (alteração 2026-10-15-06).

`shopify_products` é escopada por `organization_id` (coluna presente no
espelho) e a política do worker filtra por ela; a busca é por título ou SKU,
parcial e sem distinção de caixa — o que `product_lookup.ts` fazia com
`ilike`, aqui com parâmetro ligado (sem montar filtro em string).
"""

from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from uuid import UUID

import psycopg


@dataclass(frozen=True, slots=True)
class ProductRow:
    title: str
    price: Decimal | None
    compare_at_price: Decimal | None
    sku: str | None
    inventory_quantity: int | None
    status: str | None
    available: bool | None
    variants: list[Any]
    image_url: str | None


async def search_products(
    conn: psycopg.AsyncConnection, *, organization_id: UUID, query: str, limit: int = 5
) -> tuple[ProductRow, ...]:
    pattern = f"%{query}%"
    cursor = await conn.execute(
        """
        select title, price, compare_at_price, sku, inventory_quantity, status, available,
               variants, image_url
          from public.shopify_products
         where organization_id = %s
           and (title ilike %s or sku ilike %s)
         order by (status = 'active') desc, title
         limit %s
        """,
        (organization_id, pattern, pattern, limit),
    )
    return tuple(
        ProductRow(
            title=row[0],
            price=row[1],
            compare_at_price=row[2],
            sku=row[3],
            inventory_quantity=row[4],
            status=row[5],
            available=row[6],
            variants=list(row[7] or []),
            image_url=row[8],
        )
        for row in await cursor.fetchall()
    )


async def has_store(conn: psycopg.AsyncConnection, *, organization_id: UUID) -> bool:
    cursor = await conn.execute(
        "select exists(select 1 from public.shopify_stores where organization_id = %s)",
        (organization_id,),
    )
    return bool((await cursor.fetchone())[0])
