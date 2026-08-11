"""As tools custom do lojista (10.7) — a leitura que o turno faz.

Só entra no turno o que está LIGADO — e ligar exige teste ok (CHECK do
schema, não boa vontade da UI). Escopo por RLS: a conexão do worker está
trancada na org.
"""

import psycopg

from agents_runtime.tools.custom_http import CustomToolRow


async def load_enabled_custom_tools(
    conn: psycopg.AsyncConnection,
) -> tuple[CustomToolRow, ...]:
    cursor = await conn.execute(
        """
        select name, label, description, when_to_use, endpoint, method,
               auth_header_name, auth_header_value, params, timeout_ms
          from public.ai_agent_custom_tools
         where enabled
         order by created_at
        """
    )
    rows = await cursor.fetchall()
    return tuple(
        CustomToolRow(
            name=row[0], label=row[1], description=row[2], when_to_use=row[3],
            endpoint=row[4], method=row[5], auth_header_name=row[6],
            auth_header_value=row[7], params=tuple(row[8] or ()),
            timeout_ms=row[9],
        )
        for row in rows
    )
