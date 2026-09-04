"""What is known about the person on the other side (§4 `contacts`).

Scoped by the policy, not by a WHERE: the conversation id is the one thing a
tool could be pointed at, and a stranger's conversation simply does not exist
for a connection scoped to another tenant. That is the whole guard, and after
item 59 what exercises it is `tests/db/test_create_coupon_tool.py`, from inside
`create_coupon` — the direct "another tenant's conversation" assertion died with
`TestGetCustomerContext` (gap recorded in item 63).

What is NOT here is as important as what is: no orders. Purchase history comes
from the store mirror, and that is `repository/orders.py` (E3), which owns the
"no record" vs "no history" distinction (decisão 81b) so nobody here is tempted
to return an invented zero. `history_lines` is what reaches the model, inside
the ESTADO block — and it reads `last_order_at`. `first_order_at` was carried
alongside it with no reader at all after item 59, and item 60 deleted it: the
field, the `min(coalesce(...))` column that fed it, and the fourth name in the
unpack of `load_purchase_history`.
"""

from uuid import UUID

import psycopg


async def contact_id_of_conversation(
    conn: psycopg.AsyncConnection, *, conversation_id: UUID
) -> UUID | None:
    """Quem está do outro lado DESTA conversa — ou None quando não é nossa.

    É o elo que o create_coupon usa para amarrar grant a contato: o id vem da
    conversa do job, nunca dos argumentos do modelo."""
    cursor = await conn.execute(
        "select contact_id from public.conversations where id = %s",
        (conversation_id,),
    )
    row = await cursor.fetchone()
    return None if row is None else row[0]
