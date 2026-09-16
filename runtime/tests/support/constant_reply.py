"""The E1 constant reply, as an explicit `AGENTS_RESPONDER` factory.

The engine scenarios answer with a constant on purpose: while the reply is
fixed, every difference they observe belongs to the engine. That was never in
question — what changed is that they used to get the constant by INHERITING a
production default, and the production default is exactly what let a runtime
with no `AGENTS_RESPONDER` answer real customers without passing Judge 1.

So the harness names this the way it already names the fake channel. Same
scenarios, same behaviour, one fewer way for production to reach the constant.

`fixed_responder` cannot be pointed at directly: the factory contract is
`callable(dsn)` and its first parameter is the reply TEXT, so a spec of
`...:fixed_responder` would make every scenario answer with the database URL.
"""

import psycopg

from agents_runtime.agent_core.responder import FIXED_REPLY, Responder
from agents_runtime.agent_core.toucher import FIXED_TOUCH, TouchDraft
from agents_runtime.agent_core.trace import AttemptTraceCapture, ReplyDraft


async def draft_for(dsn: str, job, content: dict | None) -> ReplyDraft:
    """Test-only identity setup; canonical writes still enforce tenant ownership."""
    if content is None:
        return ReplyDraft(None, None)
    async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
        async with conn.transaction():
            await conn.execute("select id from public.organizations where id=%s for update",
                               (job.organization_id,))
            cursor = await conn.execute(
                "select id from public.ai_agents where organization_id=%s order by id limit 1",
                (job.organization_id,),
            )
            row = await cursor.fetchone()
            if row is None:
                cursor = await conn.execute(
                    "insert into public.ai_agents (organization_id,name,system_prompt)"
                    " values (%s,'test constant','Test fixture') returning id",
                    (job.organization_id,),
                )
                row = await cursor.fetchone()
    return ReplyDraft(content, AttemptTraceCapture().build(
        agent_id=row[0], input_text="", output_text=content["text"], selected_attempt=None,
    ))


def create_responder(dsn: str) -> Responder:
    async def respond(job):
        return await draft_for(dsn, job, {"text": FIXED_REPLY})
    return respond


def create_toucher(dsn: str):
    async def touch(job):
        draft = await draft_for(dsn, job, {"text": FIXED_TOUCH})
        return TouchDraft(draft.content, (), None, draft.trace)
    return touch
