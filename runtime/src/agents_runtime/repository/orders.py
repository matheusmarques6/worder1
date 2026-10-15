"""O espelho de pedidos — o que este contato JÁ comprou (E3, plano 12/08).

`shopify_orders` é legada e sem RLS: o escopo por org é EXPLÍCITO em cada
query, como em repository/agent.py. O elo primário é o `contact_id` que o app
grava ao ingerir o pedido; e-mail exato (case-insensitive) cobre pedidos
antigos do bulk que nasceram sem o elo. Telefone NÃO entra: cauda de dígitos
colide entre clientes e o custo aqui seria afirmar no prompt a compra de
OUTRA pessoa.

decisão 81b — "sem registro" ≠ "sem histórico":
  * org sem loja conectada → None (o prompt não afirma nada);
  * loja conectada e zero pedidos → histórico ZERADO (o prompt diz que este
    contato ainda não comprou).
`history_lines` é a projeção textual dessa distinção: None → nenhuma linha;
zero → uma linha explícita; N → resumo + últimos pedidos.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from uuid import UUID

import psycopg


@dataclass(frozen=True, slots=True)
class OrderSummary:
    label: str
    """Como a loja chama o pedido — `name` ("#1001"), senão o número/id."""
    placed_at: datetime | None
    total: Decimal
    currency: str
    financial_status: str | None
    fulfillment_status: str | None
    items: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class PurchaseHistory:
    total_orders: int
    total_spent: Decimal
    """Soma de total_price - total_refunded: o que de fato ficou pago."""
    currency: str
    last_order_at: datetime | None
    recent: tuple[OrderSummary, ...]


# O elo: contact_id que o sync gravou, OU e-mail exato. Sempre dentro da org.
_LINKED = """
        o.organization_id = %(organization_id)s
        and (
            o.contact_id = %(contact_id)s
            or (%(email)s::text is not null and o.email is not null
                and lower(o.email) = lower(%(email)s::text))
        )
"""


def _item_lines(line_items: object) -> tuple[str, ...]:
    """Os primeiros itens do pedido, legíveis: "2x Meia", "Tênis"."""
    if not isinstance(line_items, list):
        return ()
    items: list[str] = []
    for entry in line_items[:3]:
        if not isinstance(entry, dict):
            continue
        title = entry.get("title")
        if not title:
            continue
        quantity = entry.get("quantity")
        if isinstance(quantity, (int, float)) and quantity > 1:
            items.append(f"{int(quantity)}x {title}")
        else:
            items.append(str(title))
    return tuple(items)


async def load_purchase_history(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    contact_id: UUID,
    recent_limit: int = 3,
) -> PurchaseHistory | None:
    """None quando a org não tem loja conectada — sem espelho não há o que
    afirmar. Com loja, sempre um PurchaseHistory (zerado se nunca comprou)."""
    cursor = await conn.execute(
        "select exists(select 1 from public.shopify_stores where organization_id = %s)",
        (organization_id,),
    )
    ((has_mirror,),) = [await cursor.fetchone()]
    if not has_mirror:
        return None

    cursor = await conn.execute(
        "select email from public.contacts where id = %s and organization_id = %s",
        (contact_id, organization_id),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    (email,) = row

    params = {
        "organization_id": organization_id,
        "contact_id": contact_id,
        "email": email,
    }
    cursor = await conn.execute(
        f"""
        select count(*),
               coalesce(sum(coalesce(o.total_price, 0) - coalesce(o.total_refunded, 0)), 0),
               max(coalesce(o.shopify_created_at, o.created_at))
          from public.shopify_orders o
         where {_LINKED}
        """,
        params,
    )
    total_orders, total_spent, last_at = await cursor.fetchone()

    recent: list[OrderSummary] = []
    if total_orders:
        cursor = await conn.execute(
            f"""
            select coalesce(o.name, '#' || o.order_number, o.shopify_order_id),
                   coalesce(o.shopify_created_at, o.created_at),
                   coalesce(o.total_price, 0),
                   coalesce(o.currency, 'BRL'),
                   o.financial_status,
                   o.fulfillment_status,
                   o.line_items
              from public.shopify_orders o
             where {_LINKED}
             order by coalesce(o.shopify_created_at, o.created_at) desc nulls last
             limit %(recent_limit)s
            """,
            {**params, "recent_limit": recent_limit},
        )
        for label, placed_at, total, currency, financial, fulfillment, items in (
            await cursor.fetchall()
        ):
            recent.append(
                OrderSummary(
                    label=label,
                    placed_at=placed_at,
                    total=Decimal(total),
                    currency=currency,
                    financial_status=financial,
                    fulfillment_status=fulfillment,
                    items=_item_lines(items),
                )
            )

    return PurchaseHistory(
        total_orders=int(total_orders),
        total_spent=Decimal(total_spent),
        currency=recent[0].currency if recent else "BRL",
        last_order_at=last_at,
        recent=tuple(recent),
    )


@dataclass(frozen=True, slots=True)
class OrderLookup:
    """Uma linha de `order_status` (alteração 2026-10-15-06)."""

    label: str
    financial_status: str | None
    fulfillment_status: str | None
    total: Decimal
    currency: str
    placed_at: object
    items_count: int


async def find_orders(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    contact_id: UUID | None,
    order_number: str | None,
    email: str | None,
    phone_digits: str | None,
    limit: int = 3,
) -> tuple[OrderLookup, ...]:
    """Por número do pedido; senão por e-mail; senão pelos últimos 11 dígitos
    do telefone (a régua de privacidade do TS: DDD + número completo, para
    não devolver pedido de outro cliente). Sempre dentro da org; quando há
    `contact_id`, o pedido também precisa ser do contato OU bater pelo
    identificador dado — nunca um pedido alheio por coincidência de dígitos
    curtos."""
    where = ["o.organization_id = %(organization_id)s"]
    params: dict = {"organization_id": organization_id, "limit": limit}
    if order_number:
        where.append(
            "(o.order_number = %(order_number)s or o.shopify_order_number = %(order_number)s"
            " or o.name = %(name)s)"
        )
        params["order_number"] = order_number
        params["name"] = f"#{order_number}"
    elif email:
        where.append("lower(o.email) = lower(%(email)s)")
        params["email"] = email
    elif phone_digits:
        where.append("regexp_replace(coalesce(o.phone, ''), '\\D', '', 'g') like %(phone)s")
        params["phone"] = f"%{phone_digits[-11:]}"
    else:
        return ()
    cursor = await conn.execute(
        f"""
        select coalesce(o.name, '#' || o.order_number, o.shopify_order_id),
               o.financial_status, o.fulfillment_status,
               coalesce(o.total_price, 0), coalesce(o.currency, 'BRL'),
               coalesce(o.shopify_created_at, o.created_at),
               coalesce(jsonb_array_length(case when jsonb_typeof(o.line_items) = 'array'
                                                then o.line_items else '[]'::jsonb end), 0)
          from public.shopify_orders o
         where {" and ".join(where)}
         order by coalesce(o.shopify_created_at, o.created_at) desc nulls last
         limit %(limit)s
        """,
        params,
    )
    return tuple(
        OrderLookup(
            label=row[0],
            financial_status=row[1],
            fulfillment_status=row[2],
            total=Decimal(row[3]),
            currency=row[4],
            placed_at=row[5],
            items_count=int(row[6]),
        )
        for row in await cursor.fetchall()
    )


# Vocabulário Shopify → o que o agente pode dizer em português.
_FINANCIAL = {
    "paid": "pago",
    "partially_paid": "parcialmente pago",
    "pending": "pagamento pendente",
    "authorized": "autorizado",
    "refunded": "reembolsado",
    "partially_refunded": "parcialmente reembolsado",
    "voided": "cancelado",
}
_FULFILLMENT = {
    "fulfilled": "enviado",
    "partial": "envio parcial",
    "restocked": "devolvido ao estoque",
}


def _money(value: Decimal, currency: str) -> str:
    amount = f"{value:.2f}"
    return f"R$ {amount}" if currency == "BRL" else f"{currency} {amount}"


def history_lines(history: PurchaseHistory | None) -> tuple[str, ...]:
    """As linhas do bloco ESTADO. A ausência também fala (decisão 81b):
    None → nada (sem espelho, o prompt não inventa); zero → linha explícita."""
    if history is None:
        return ()
    if history.total_orders == 0:
        return ("Compras — nenhuma compra registrada nesta loja até hoje.",)

    summary = (
        f"Compras — {history.total_orders} pedido(s),"
        f" {_money(history.total_spent, history.currency)} no total"
    )
    if history.last_order_at is not None:
        summary += f"; último em {history.last_order_at:%d/%m/%Y}"
    lines = [summary + "."]

    for order in history.recent:
        piece = f"Compras — pedido {order.label}"
        if order.placed_at is not None:
            piece += f" em {order.placed_at:%d/%m/%Y}"
        if order.items:
            piece += f": {', '.join(order.items)}"
        piece += f" — {_money(order.total, order.currency)}"
        status = [
            _FINANCIAL.get(order.financial_status or "", order.financial_status),
            _FULFILLMENT.get(order.fulfillment_status or "", order.fulfillment_status),
        ]
        described = [s for s in status if s]
        if described:
            piece += f" ({', '.join(described)})"
        lines.append(piece + ".")
    return tuple(lines)
