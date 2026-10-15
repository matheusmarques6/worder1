"""Desfechos por conversa e eventos de atividade (alteração 2026-10-15-14).

`public.ai_conversation_outcomes` (uma linha por conversa atendida por
agente) e `public.ai_activity_events` (o feed da aba Atividade), criadas na
20261016000013. Funções recebem a conexão; o chamador abre a transação e
escopa a org. Escrita de telemetria de produto: os chamadores tratam falha
como não fatal.
"""

from typing import Any
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

EVENT_KINDS = ("sale", "solved", "handoff", "incentive", "blocked", "gap")


async def record_turn(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    conversation_id: UUID,
    agent_id: UUID | None,
    contact_id: UUID | None = None,
    tokens: int | None = None,
) -> None:
    """Um turno aceito (a resposta saiu): soma a mensagem, os tokens, recalcula
    o custo da conversa pela trilha e grava a 1ª resposta na primeira vez."""
    await conn.execute(
        """
        with first_in as (
            select min(m.created_at) as at
              from public.messages m
             where m.conversation_id = %(conv)s and m.author_type = 'contact'
        ),
        spend as (
            select coalesce(sum(l.cost_usd), 0) as cost,
                   coalesce(bool_or(l.cost_usd is null), false) as unknown
              from internal.llm_calls l
             where l.conversation_id = %(conv)s
        )
        insert into public.ai_conversation_outcomes as o
            (conversation_id, organization_id, agent_id, contact_id, first_inbound_at,
             first_response_ms, messages_sent, tokens, cost_usd, cost_unknown)
        select %(conv)s, %(org)s, %(agent)s, %(contact)s, first_in.at,
               case when first_in.at is null then null
                    else greatest(0, (extract(epoch from now() - first_in.at) * 1000)::int) end,
               1, coalesce(%(tokens)s, 0), spend.cost, spend.unknown
          from first_in, spend
        on conflict (conversation_id) do update
           set messages_sent = o.messages_sent + 1,
               tokens = o.tokens + coalesce(%(tokens)s, 0),
               cost_usd = excluded.cost_usd,
               cost_unknown = excluded.cost_unknown,
               agent_id = coalesce(excluded.agent_id, o.agent_id),
               contact_id = coalesce(o.contact_id, excluded.contact_id),
               first_inbound_at = coalesce(o.first_inbound_at, excluded.first_inbound_at),
               first_response_ms = coalesce(o.first_response_ms, excluded.first_response_ms),
               closed_at = null,
               updated_at = now()
        """,
        {
            "conv": conversation_id, "org": organization_id, "agent": agent_id,
            "contact": contact_id, "tokens": tokens,
        },
    )


async def mark(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    conversation_id: UUID,
    transferred_reason: str | None = None,
    blocked: bool = False,
    gap: bool = False,
    incentive_offered: bool = False,
    agent_id: UUID | None = None,
) -> None:
    """Marca um fato na linha da conversa (cria a linha se ainda não houver)."""
    await conn.execute(
        """
        insert into public.ai_conversation_outcomes as o
            (conversation_id, organization_id, agent_id, transferred, handoff_reason,
             resolved_without_human, blocked_count, gap, incentives_offered)
        values (%(conv)s, %(org)s, %(agent)s, %(transferred)s, %(reason)s,
                case when %(transferred)s then false else null end,
                case when %(blocked)s then 1 else 0 end, %(gap)s,
                case when %(incentive)s then 1 else 0 end)
        on conflict (conversation_id) do update
           set transferred = o.transferred or excluded.transferred,
               handoff_reason = coalesce(excluded.handoff_reason, o.handoff_reason),
               resolved_without_human = case when excluded.transferred then false
                                             else o.resolved_without_human end,
               blocked_count = o.blocked_count + excluded.blocked_count,
               gap = o.gap or excluded.gap,
               incentives_offered = o.incentives_offered + excluded.incentives_offered,
               agent_id = coalesce(o.agent_id, excluded.agent_id),
               updated_at = now()
        """,
        {
            "conv": conversation_id, "org": organization_id, "agent": agent_id,
            "transferred": transferred_reason is not None, "reason": transferred_reason,
            "blocked": blocked, "gap": gap, "incentive": incentive_offered,
        },
    )


async def record_event(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    kind: str,
    conversation_id: UUID | None = None,
    agent_id: UUID | None = None,
    contact_id: UUID | None = None,
    text: str | None = None,
    amount: float | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    if kind not in EVENT_KINDS:
        raise ValueError(f"evento desconhecido: {kind}")
    await conn.execute(
        """
        insert into public.ai_activity_events
            (organization_id, kind, conversation_id, agent_id, contact_id, text, amount, metadata)
        values (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (organization_id, kind, conversation_id, agent_id, contact_id, text, amount,
         Jsonb(metadata or {})),
    )


def handoff_code(reason: str) -> str:
    """O motivo como a tela agrupa: `tool:complaint` → `complaint`;
    `keyword`, `blocked_topic`, `media` ficam como estão."""
    return reason.split(":", 1)[1] if reason.startswith("tool:") else reason


def coupon_offers(tool_calls: tuple[dict[str, Any], ...] | list[dict[str, Any]]) -> list[dict]:
    """As concessões de cupom aceitas no turno, lidas do trace aceito."""
    out = []
    for call in tool_calls:
        if not isinstance(call, dict) or call.get("name") != "create_coupon":
            continue
        result = call.get("result") or {}
        if isinstance(result, dict) and result.get("decision") in ("issued", "reused", "capped"):
            out.append(result)
    return out
