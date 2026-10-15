"""O gasto do mês — uma leitura, para o teto mensal (alteração 2026-10-15-04).

`internal.monthly_ai_spend` é SECURITY DEFINER: o worker não precisa de
SELECT em `ai_usage_logs`/`ai_budgets`, e a soma inteira (org e agente) sai
em UMA ida ao banco, dentro da transação curta de leitura do turno.
"""

from dataclasses import dataclass
from uuid import UUID

import psycopg


@dataclass(frozen=True, slots=True)
class MonthlySpend:
    org_spent_usd: float
    org_limit_usd: float
    agent_spent_usd: float
    agent_cap_usd: float | None
    has_unknown_cost: bool


async def load_monthly_spend(
    conn: psycopg.AsyncConnection, *, organization_id: UUID, agent_id: UUID | None
) -> MonthlySpend:
    cursor = await conn.execute(
        "select * from internal.monthly_ai_spend(%s, %s)", (organization_id, agent_id)
    )
    row = await cursor.fetchone()
    if row is None:
        return MonthlySpend(0.0, 50.0, 0.0, None, False)
    return MonthlySpend(
        org_spent_usd=float(row[0] or 0),
        org_limit_usd=float(row[1] if row[1] is not None else 50),
        agent_spent_usd=float(row[2] or 0),
        agent_cap_usd=float(row[3]) if row[3] is not None else None,
        has_unknown_cost=bool(row[4]),
    )
