"""Judge 1's live scores — `internal.judge_scores` with `kind = 'pre_send'` (§6.2).

RNF-050: every reply records the Judge 1 score. Every ATTEMPT, in fact — the
regenerations are the audit trail of why a reply ended up looking the way it
does, and of why a blocked one never existed.

`message_id` stays NULL and that is not an omission: at pre-send time the
outbound message has not been written yet (it is created inside the FASE 3
transaction), and for a blocked draft it never will be. The conversation is the
link that always exists.

The CHECK on `kind` also offers `post_hoc`, for scores an eval run would write.
Nothing writes those today: item 57 of the audit deleted the eval persistence
layer with the harness it served. This module is the table's only writer.
"""

from uuid import UUID

import psycopg

PRE_SEND = "pre_send"


async def record_pre_send_score(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    conversation_id: UUID,
    judge_model: str,
    score: float,
    verdict: str,
    rationale: str | None = None,
) -> int:
    cursor = await conn.execute(
        """
        insert into internal.judge_scores
            (organization_id, kind, conversation_id, judge_model, score, verdict, rationale)
        values (%s, %s, %s, %s, %s, %s, %s)
        returning id
        """,
        (organization_id, PRE_SEND, conversation_id, judge_model, score, verdict, rationale),
    )
    return (await cursor.fetchone())[0]
