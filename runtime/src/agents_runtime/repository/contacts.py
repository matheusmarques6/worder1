"""What is known about the person on the other side (§4 `contacts`).

Scoped by the policy, not by a WHERE: the conversation id is the one thing a
tool could be pointed at, and a stranger's conversation simply does not exist
for a connection scoped to another tenant. That is the whole guard, and
`tests/db/test_tools.py` is what watches it.

What is NOT here is as important as what is: no orders. `total_orders`,
`avg_ticket` and `first_order_at` — the fields RF-010 injects into the prompt —
come from the store mirror, and that is `repository/orders.py` (E3), which owns
the "no record" vs "no history" distinction (decisão 81b) so nobody here is
tempted to return an invented zero.
"""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import psycopg


@dataclass(frozen=True, slots=True)
class CustomerFacts:
    contact_id: UUID
    name: str | None
    language: str | None
    opt_status: str
    first_seen_at: datetime
    last_message_at: datetime | None
    #: How many conversations this contact has had with this store — the cheap
    #: answer to "is this someone we already know?".
    conversations: int


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


async def load_customer_facts(
    conn: psycopg.AsyncConnection, *, conversation_id: UUID
) -> CustomerFacts | None:
    """The contact behind a conversation, or None when it is not ours.

    FORK: os campos vêm do shape canônico do Worder — `full_name` é coluna
    gerada (first+last), idioma vive em `custom_fields` (não há coluna), e
    opt-out é a tabela `whatsapp_opt_status` (linha ausente = opted_in, a
    mesma semântica do guard do app). O "última mensagem" é o
    `last_inbound_at` da conversa em questão — a pergunta que o agente faz é
    "quando ELE me escreveu por último", não "quando tocou qualquer canal".
    """
    cursor = await conn.execute(
        """
        select contact.id,
               nullif(trim(contact.full_name), ''),
               contact.custom_fields ->> 'language',
               coalesce(
                   (select o.status
                      from public.whatsapp_opt_status o
                     where o.organization_id = contact.organization_id
                       and o.phone in (contact.whatsapp, contact.phone,
                                       ltrim(contact.whatsapp, '+'),
                                       ltrim(contact.phone, '+'))
                     order by o.updated_at desc
                     limit 1),
                   'opted_in'
               ),
               contact.created_at, conversation.last_inbound_at,
               (select count(*) from public.conversations other
                 where other.contact_id = contact.id)
          from public.conversations conversation
          join public.contacts contact on contact.id = conversation.contact_id
         where conversation.id = %s
        """,
        (conversation_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None

    return CustomerFacts(
        contact_id=row[0],
        name=row[1],
        language=row[2],
        opt_status=row[3],
        first_seen_at=row[4],
        last_message_at=row[5],
        conversations=row[6],
    )
