"""Avaliação automática — `internal.eval_runs`, as notas por cenário em
`internal.judge_scores` e o resultado na versão (alteração 2026-10-15-13).

Funções recebem a conexão e não abrem transação: o chamador escopa a org.
"""

from typing import Any
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb


async def start_run(
    conn: psycopg.AsyncConnection, *, organization_id: UUID, agent_version_id: UUID,
    trigger: str = "manual",
) -> UUID:
    cursor = await conn.execute(
        """
        insert into internal.eval_runs (organization_id, agent_version_id, trigger, status)
        values (%s, %s, %s, 'running')
        returning id
        """,
        (organization_id, agent_version_id, trigger),
    )
    (run_id,) = await cursor.fetchone()
    return run_id


async def finish_run(
    conn: psycopg.AsyncConnection, *, run_id: UUID, status: str,
    aggregate_score: float | None, summary: dict[str, Any],
) -> None:
    await conn.execute(
        """
        update internal.eval_runs
           set status = %s, aggregate_score = %s, summary = %s, finished_at = now()
         where id = %s
        """,
        (status, aggregate_score, Jsonb(summary), run_id),
    )


async def record_scenario_score(
    conn: psycopg.AsyncConnection, *, organization_id: UUID, run_id: UUID,
    score: float, verdict: str, rationale: str | None, judge_model: str,
) -> None:
    await conn.execute(
        """
        insert into internal.judge_scores
            (organization_id, kind, eval_run_id, judge_model, score, verdict, rationale)
        values (%s, 'post_hoc', %s, %s, %s, %s, %s)
        """,
        (organization_id, run_id, judge_model, score, verdict, rationale),
    )


async def set_version_eval(
    conn: psycopg.AsyncConnection, *, agent_version_id: UUID, score: float, grave: int
) -> None:
    await conn.execute(
        "update public.ai_agent_versions set eval_score = %s, eval_grave = %s where id = %s",
        (score, grave, agent_version_id),
    )


async def load_run(conn: psycopg.AsyncConnection, *, run_id: UUID) -> dict[str, Any] | None:
    cursor = await conn.execute(
        """
        select id, agent_version_id, status, aggregate_score, summary, started_at, finished_at
          from internal.eval_runs
         where id = %s and organization_id = public.current_app_organization_id()
        """,
        (run_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return {
        "id": str(row[0]),
        "agent_version_id": str(row[1]),
        "status": row[2],
        "aggregate_score": None if row[3] is None else float(row[3]),
        "summary": row[4] or {},
        "started_at": row[5].isoformat() if row[5] else None,
        "finished_at": row[6].isoformat() if row[6] else None,
    }
