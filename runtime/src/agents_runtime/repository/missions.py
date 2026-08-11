"""O catálogo de missões, como o resolver o lê (doc §3.3.3).

Funções recebem a conexão e não abrem transação; RLS escopa a org via
`app.organization_id` (ai_missions nasceu trancada — sem WHERE de org aqui).
"""

from uuid import UUID

import psycopg

from agents_runtime.agent_core.mission_resolver import MissionVersion

_COLUMNS = """
    id, event_type, situation, objective, success_criteria, failure_criteria,
    context_fields, enabled_tools, forbidden, max_turns, topic_change_policy,
    promote_moment, concession, tone_delta
"""


def _as_mission(row) -> MissionVersion:
    context_fields = row[6] or []
    if isinstance(context_fields, dict):
        context_fields = list(context_fields)
    return MissionVersion(
        id=str(row[0]),
        event_type=row[1],
        situation=row[2],
        objective=row[3],
        success_criteria=row[4],
        failure_criteria=row[5],
        context_fields=tuple(context_fields),
        enabled_tools=tuple(row[7] or ()),
        forbidden=tuple(row[8] or ()),
        max_turns=row[9],
        topic_change_policy=row[10],
        promote_moment=row[11],
        concession=dict(row[12] or {"kind": "none"}),
        tone_delta=row[13],
    )


async def load_active_mission(
    conn: psycopg.AsyncConnection, *, event_type: str
) -> MissionVersion | None:
    """A versão ATIVA da família (org, event_type), ou None.

    None significa "esta família não responde" — nunca "improvise uma missão".
    """
    cursor = await conn.execute(
        f"""
        select {_COLUMNS}
          from public.ai_missions
         where event_type = %s
           and status = 'active'
        """,
        (event_type,),
    )
    row = await cursor.fetchone()
    return None if row is None else _as_mission(row)


async def load_mission_event_type(
    conn: psycopg.AsyncConnection, *, mission_version_id: UUID
) -> str | None:
    """A família de uma versão apontada como dona da conversa.

    O resolver resolve a FAMÍLIA → versão ativa (§3.2.2): a dona indica o
    evento; quem responde é sempre a versão ativa daquela família.
    """
    cursor = await conn.execute(
        "select event_type from public.ai_missions where id = %s",
        (mission_version_id,),
    )
    row = await cursor.fetchone()
    return None if row is None else row[0]
