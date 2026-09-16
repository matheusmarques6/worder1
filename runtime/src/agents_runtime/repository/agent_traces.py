"""Write the canonical accepted trace in the caller's CAS transaction."""

from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from agents_runtime.agent_core.trace import AcceptedTracePayload


async def record_accepted_trace(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    outbox_id: UUID,
    conversation_id: UUID,
    channel_account_id: UUID | None,
    generation: int,
    target_seq: int,
    trace: AcceptedTracePayload,
) -> UUID:
    cursor = await conn.execute(
        """select internal.record_accepted_trace(
            %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        (organization_id, outbox_id, conversation_id, trace.agent_id, channel_account_id,
         generation, target_seq, trace.selected_attempt, trace.provider, trace.model,
         trace.input_text, trace.output_text, Jsonb(trace.tool_calls), trace.tokens,
         trace.latency_ms),
    )
    return (await cursor.fetchone())[0]
