"""The merchant's knowledge — ingestion and similarity search (§2.5).

Like the rest of this layer, functions take a connection and never open or
commit one: the caller owns the transaction and the `SET LOCAL app.organization_id`
that scopes it. In the responder that transaction is short and its own — a
retrieval must never sit inside a transaction that also spans the LLM call
(ADR-6).

**There is no `where organization_id = …` in the search, and that is deliberate.**
Ownership is enforced by the policy, never by a hand-written clause (CLAUDE.md,
trust boundaries): a WHERE can be dropped in a refactor and nothing fails,
while dropping the policy fails the leak suite. The scope arrives through the
connection, and `tests/db/test_knowledge_retrieval.py` watches the policy doing
the work.

Cosine is the measure (`<=>`), matching the HNSW index built in S2 and the
embedding model D2 chose. Distance is turned into similarity at the edge so
call sites never have to remember which direction is better.

The vector is rendered as a literal and cast rather than adapted by a driver
extension: it is five lines against a new production dependency, and the burden
of proof is on whoever wants the dependency.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from agents_runtime.agent_core.llm import EMBEDDING_SPACE, SEARCHABLE_SPACES


@dataclass(frozen=True, slots=True)
class KnowledgeChunk:
    id: UUID
    organization_id: UUID
    source: str
    title: str | None
    content: str
    #: 1.0 is identical, 0.0 is unrelated — the inverse of the cosine distance
    #: the index sorts by.
    similarity: float


def _vector_literal(embedding: Sequence[float]) -> str:
    return "[" + ",".join(repr(float(value)) for value in embedding) + "]"


async def ingest_chunk(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    source: str,
    content: str,
    embedding: Sequence[float],
    title: str | None = None,
    metadata: dict | None = None,
) -> UUID:
    """One chunk of knowledge, already split and already embedded.

    `metadata` is where the LGPD flag of the data dictionary lives (a chunk
    derived from a conversation enters the per-contact purge; a FAQ does not),
    so it is written from the first row instead of being backfilled later.
    """
    # FORK: os chunks vivem em ai_agent_chunks (a base da SourcesTab) e
    # penduram num agente + fonte da org — resolvidos/criados aqui.
    cursor = await conn.execute(
        """
        with agent as (
            select id from public.ai_agents
             where organization_id = %(org)s and is_active
             order by created_at limit 1
        ),
        source as (
            insert into public.ai_agent_sources
                (organization_id, agent_id, source_type, name, status)
            select %(org)s, agent.id, 'text', %(source)s, 'ready' from agent
            returning id, agent_id
        )
        insert into public.ai_agent_chunks
            (organization_id, agent_id, source_id, content, embedding,
             embedding_model, metadata)
        select %(org)s, source.agent_id, source.id, %(content)s,
               %(embedding)s::vector, %(space)s, %(metadata)s
          from source
        returning id
        """,
        {
            "org": organization_id,
            "source": f"{source}: {title}" if title else source,
            "content": content,
            "embedding": _vector_literal(embedding),
            # Quem escreve declara o espaço; o CHECK da 20260828000001 recusa
            # vetor sem procedência, e é essa declaração que a busca filtra.
            "space": EMBEDDING_SPACE,
            "metadata": Jsonb(metadata if metadata is not None else {}),
        },
    )
    row = await cursor.fetchone()
    if row is None:
        raise LookupError(f"org {organization_id} has no active agent to attach knowledge to")
    return row[0]


async def search_knowledge(
    conn: psycopg.AsyncConnection,
    *,
    embedding: Sequence[float],
    limit: int = 5,
) -> tuple[KnowledgeChunk, ...]:
    """The nearest chunks first, bounded — the last layer of the prompt.

    Chunks without an embedding are excluded rather than ranked last: they have
    no measured distance at all, and putting them next to ones that do would be
    inventing an order.
    """
    # FORK (desvio declarado, FORK.md item 6): ai_agent_chunks é tabela legada
    # com RLS desligada no banco vivo — o escopo por org é EXPLÍCITO na query
    # até a remediação de RLS das legadas ser aprovada.
    cursor = await conn.execute(
        """
        select c.id, c.organization_id, s.name, null::text, c.content,
               1 - (c.embedding <=> %(query)s::vector) as similarity
          from public.ai_agent_chunks c
          left join public.ai_agent_sources s on s.id = c.source_id
         where c.embedding is not null
           and c.embedding_model = any(%(spaces)s)
           and c.organization_id = public.current_app_organization_id()
         order by c.embedding <=> %(query)s::vector
         limit %(limit)s
        """,
        {
            "query": _vector_literal(embedding),
            "limit": limit,
            # Um chunk de OUTRO espaço vetorial não é um vizinho distante: é um
            # sem relação com esta query. A distância cosseno o rankeia do
            # mesmo jeito, sem erro — foi assim que a divergência
            # ada-002 contra 3-small passou despercebida.
            "spaces": list(SEARCHABLE_SPACES),
        },
    )
    return tuple(
        KnowledgeChunk(
            id=row[0],
            organization_id=row[1],
            source=row[2] or "fonte",
            title=row[3],
            content=row[4],
            similarity=float(row[5]),
        )
        for row in await cursor.fetchall()
    )
