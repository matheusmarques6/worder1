"""`get_customer_context` — who the agent is talking to.

Takes no arguments at all, and that is a security property rather than a
simplification: a tool that accepted a contact id would be a tool the model
could be talked into pointing somewhere else. The conversation is the one the
job is about, and the scope is the tenant the job belongs to.

The answer is name, language, opt status, since when, how many conversations —
and, since E3, the order-based context of RF-010 from the `shopify_orders`
mirror. `purchases` is None when the org has no store connected (decision 81b:
no mirror means nothing to claim — inventing zeros would be worse than
absence).
"""

from collections.abc import Mapping
from typing import Any

import psycopg

from agents_runtime.repository import contacts as contacts_repo
from agents_runtime.repository import orders as orders_repo
from agents_runtime.repository.scope import scope_to_organization
from agents_runtime.tools.base import ToolContext, ToolResult


class GetCustomerContext:
    name = "get_customer_context"

    async def __call__(
        self,
        conn: psycopg.AsyncConnection,
        context: ToolContext,
        arguments: Mapping[str, Any],
    ) -> ToolResult:
        async with conn.transaction():
            await scope_to_organization(conn, context.organization_id)
            facts = await contacts_repo.load_customer_facts(
                conn, conversation_id=context.conversation_id
            )
            purchases = (
                await orders_repo.load_purchase_history(
                    conn,
                    organization_id=context.organization_id,
                    contact_id=facts.contact_id,
                )
                if facts is not None
                else None
            )

        if facts is None:
            # Not ours. Say so plainly instead of returning an empty customer,
            # which the model would read as "a customer we know nothing about".
            return ToolResult(
                tool=self.name,
                success=False,
                error="conversation not found for this tenant",
            )

        return ToolResult(
            tool=self.name,
            success=True,
            output={
                "name": facts.name,
                "language": facts.language,
                "opt_status": facts.opt_status,
                "customer_since": facts.first_seen_at.isoformat(),
                "last_message_at": (
                    facts.last_message_at.isoformat() if facts.last_message_at else None
                ),
                "conversations": facts.conversations,
                "purchases": (
                    None
                    if purchases is None
                    else {
                        "total_orders": purchases.total_orders,
                        "total_spent": str(purchases.total_spent),
                        "currency": purchases.currency,
                        "first_order_at": (
                            purchases.first_order_at.isoformat()
                            if purchases.first_order_at
                            else None
                        ),
                        "last_order_at": (
                            purchases.last_order_at.isoformat()
                            if purchases.last_order_at
                            else None
                        ),
                    }
                ),
            },
        )
