"""A verdade comercial com validade (§3.3.4 `commercial_moments`).

"Ativo" é computado AQUI, a cada leitura, contra o relógio do banco — nunca
gravado (invariante §3.4-2). Um momento aprovado cuja janela passou simplesmente
não volta desta query, e um kill switch (`killed_at`) vence a janela mesmo com
`ends_at` no futuro.

Escopo por RLS: a conexão do worker está trancada na org do turno, então não
há `where organization_id` aqui — a policy é o filtro (CLAUDE.md).
"""

import psycopg

from agents_runtime.commerce.moments import Moment


async def load_active_moments(conn: psycopg.AsyncConnection) -> tuple[Moment, ...]:
    """Os momentos ativos AGORA, maior prioridade primeiro.

    A ordem importa: sobrepostos somam fatos, mas a postura promocional
    (claim/offer) é a do PRIMEIRO desta lista (§3.3.4).
    """
    cursor = await conn.execute(
        """
        select id, name, public_claim, offer, temp_facts, forbidden,
               priority, template_readiness
          from public.commercial_moments
         where status = 'approved'
           and killed_at is null
           and now() between starts_at and ends_at
         order by priority desc, starts_at
        """
    )
    rows = await cursor.fetchall()
    return tuple(
        Moment(
            id=row[0],
            name=row[1],
            public_claim=row[2],
            offer=row[3] or {},
            temp_facts=tuple(str(fact) for fact in (row[4] or ())),
            forbidden=tuple(row[5] or ()),
            priority=row[6],
            template_readiness=row[7] or {},
        )
        for row in rows
    )
