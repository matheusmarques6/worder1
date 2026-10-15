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

Cosine is the measure (`<=>`), matching the HNSW index on `embedding`
(`vector_cosine_ops`, migration `20260828000002_ai_agent_chunks_indexes`) and
the embedding model D2 chose. Distance is turned into similarity at the edge
so call sites never have to remember which direction is better.

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
    #: Alteração 2026-10-15-05: a proveniência que a tela de "uso por nota" lê
    #: de `internal.tool_calls`.
    source_id: UUID | None = None


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


#: Mesmo piso do motor legado (`rag.ts`, `threshold: 0.7`) — abaixo disso o
#: chunk não é vizinho, é ruído que entrava no prompt (FORK.md item 30).
DEFAULT_SIMILARITY_THRESHOLD = 0.7


async def has_knowledge(conn: psycopg.AsyncConnection) -> bool:
    """A org (escopada na conexão) tem algum chunk consultável? Barato, e
    evita pagar um embedding por turno em loja sem base (alteração
    2026-10-15-05)."""
    cursor = await conn.execute(
        """
        select exists (
          select 1 from public.ai_agent_chunks c
           where c.embedding is not null
             and c.embedding_model = any(%(spaces)s)
             and c.organization_id = public.current_app_organization_id()
        )
        """,
        {"spaces": list(SEARCHABLE_SPACES)},
    )
    row = await cursor.fetchone()
    return bool(row and row[0])


#: Peso do callout "resposta pronta" na ordenação (alteração 2026-10-15-11):
#: mesma regra da RPC `search_agent_knowledge` (20261016000010).
ANSWER_WEIGHT = 1.3

#: Teto do bloco de regras no prompt — regra é sempre lida, então é curta.
MAX_RULES = 20


async def search_knowledge(
    conn: psycopg.AsyncConnection,
    *,
    embedding: Sequence[float],
    limit: int = 5,
    threshold: float = DEFAULT_SIMILARITY_THRESHOLD,
    agent_id: UUID | None = None,
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
               1 - (c.embedding <=> %(query)s::vector) as similarity,
               c.source_id
          from public.ai_agent_chunks c
          left join public.ai_agent_sources s on s.id = c.source_id
         where c.embedding is not null
           and c.embedding_model = any(%(spaces)s)
           and c.organization_id = public.current_app_organization_id()
           and 1 - (c.embedding <=> %(query)s::vector) >= %(threshold)s
           -- Alteração 2026-10-15-11: com agente, só fontes que ELE lê (M:N
           -- ai_source_agents) ou o vínculo antigo por chunk.
           and (
                %(agent)s::uuid is null
                or c.agent_id = %(agent)s::uuid
                or exists (select 1 from public.ai_source_agents sa
                            where sa.source_id = c.source_id and sa.agent_id = %(agent)s::uuid)
           )
         order by (1 - (c.embedding <=> %(query)s::vector))
                  * (case when c.chunk_kind = 'resposta' then %(weight)s else 1.0 end) desc
         limit %(limit)s
        """,
        {
            "query": _vector_literal(embedding),
            "limit": limit,
            "threshold": threshold,
            "agent": agent_id,
            "weight": ANSWER_WEIGHT,
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
            source_id=row[6] if len(row) > 6 else None,
        )
        for row in await cursor.fetchall()
    )


async def load_rules(
    conn: psycopg.AsyncConnection, *, agent_id: UUID | None, limit: int = MAX_RULES
) -> tuple[str, ...]:
    """Os callouts `[!regra]` das fontes que o agente lê (alteração
    2026-10-15-11). Regra não depende de a pergunta ser parecida: entra
    SEMPRE no prompt, ao lado dos limites. Escopo pela conexão (policy)."""
    if agent_id is None:
        return ()
    cursor = await conn.execute(
        """
        select c.content
          from public.ai_agent_chunks c
         where c.chunk_kind = 'regra'
           and c.organization_id = public.current_app_organization_id()
           and (
                c.agent_id = %(agent)s
                or exists (select 1 from public.ai_source_agents sa
                            where sa.source_id = c.source_id and sa.agent_id = %(agent)s)
           )
         order by c.source_id, c.position nulls last, c.created_at
         limit %(limit)s
        """,
        {"agent": agent_id, "limit": limit},
    )
    return tuple(row[0] for row in await cursor.fetchall())


GAP_OUTCOMES = ("transferred", "answered_without_source", "blocked", "no_source")


def normalize_question(text: str) -> str:
    """A pergunta como chave de agrupamento barata (a rotina diária agrupa por
    embedding depois): minúsculas, espaços colapsados, sem pontuação final."""
    return " ".join(text.lower().split()).strip(" ?!.")[:500]


async def record_gap(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    question: str,
    outcome: str,
    agent_id: UUID | None,
    conversation_id: UUID | None,
) -> UUID | None:
    """Uma lacuna de conhecimento (`ai_knowledge_gaps`). A mesma pergunta
    ainda aberta soma contagem, guarda o agente e o exemplo; senão nasce.
    Chamador abre a transação e o escopo."""
    if outcome not in GAP_OUTCOMES:
        raise ValueError(f"desfecho de lacuna desconhecido: {outcome}")
    key = normalize_question(question)
    if not key:
        return None
    example = Jsonb([{
        "text": question[:500],
        "conversation_id": str(conversation_id) if conversation_id else None,
    }])
    cursor = await conn.execute(
        """
        update public.ai_knowledge_gaps
           set count = count + 1,
               last_seen = now(),
               outcome = %(outcome)s,
               agent_ids = case when %(agent)s::uuid is null or %(agent)s::uuid = any(agent_ids)
                                then agent_ids else agent_ids || %(agent)s::uuid end,
               examples = case when jsonb_array_length(examples) >= 10 then examples
                               else examples || %(example)s end
         where organization_id = %(org)s
           and status = 'open'
           and cluster_key = %(key)s
        returning id
        """,
        {
            "org": organization_id, "key": key, "outcome": outcome,
            "agent": agent_id, "example": example,
        },
    )
    row = await cursor.fetchone()
    if row is not None:
        return row[0]
    cursor = await conn.execute(
        """
        insert into public.ai_knowledge_gaps
            (organization_id, cluster_key, question, examples, outcome, agent_ids, conversation_id)
        values (%(org)s, %(key)s, %(question)s, %(example)s, %(outcome)s,
                case when %(agent)s::uuid is null then '{}'::uuid[] else array[%(agent)s::uuid] end,
                %(conv)s)
        returning id
        """,
        {
            "org": organization_id, "key": key, "question": question[:500], "example": example,
            "outcome": outcome, "agent": agent_id, "conv": conversation_id,
        },
    )
    row = await cursor.fetchone()
    return None if row is None else row[0]
