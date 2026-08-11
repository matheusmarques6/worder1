"""The engine's SQL, in the one layer allowed to hold SQL.

Every statement the composition runs lives here — the fitness function
`test_no_sql_outside_repository` is what keeps it that way. Functions take a
connection rather than opening one: the composition owns connections and their
roles; this layer owns what is said over them.

Transactions are the caller's. `claim` and `conclude` must each be their own
short transaction with the tenant scope set inside it (`SET LOCAL` semantics),
so they take the connection mid-transaction and never commit.
"""

import math
from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from agents_runtime.channels.port import ClaimedSend

# Re-exported so every caller from E1 keeps its import. The definition moved to
# `repository.scope` because this module imports `channels.port`, and modules
# that only needed the tenant scope were reaching the channel through it — the
# boundary contract caught it the day the real responder was born (S9).
from agents_runtime.repository.scope import scope_to_organization

# --- the conversation turn ---------------------------------------------------


@dataclass(frozen=True, slots=True)
class ClaimedConversation:
    last_processed_seq: int
    version: int


async def claim_conversation(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    token: UUID,
    *,
    lease: timedelta,
) -> ClaimedConversation | None:
    cursor = await conn.execute(
        "select * from internal.claim_conversation(%s, %s, %s)",
        (conversation_id, token, lease),
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return ClaimedConversation(last_processed_seq=row[0], version=row[1])


async def release_lease(conn: psycopg.AsyncConnection, conversation_id: UUID, token: UUID) -> bool:
    cursor = await conn.execute("select internal.release_lease(%s, %s)", (conversation_id, token))
    return bool((await cursor.fetchone())[0])


async def renew_lease(
    conn: psycopg.AsyncConnection,
    conversation_id: UUID,
    token: UUID,
    *,
    lease: timedelta,
) -> bool:
    # The lease length always travels from config — the SQL default exists for
    # hand runs, and letting it win here once turned an immediate first beat
    # into a two-minute lease under a 200ms test config (cenário 5, flaky).
    cursor = await conn.execute(
        "select internal.renew_lease(%s, %s, %s)", (conversation_id, token, lease)
    )
    return bool((await cursor.fetchone())[0])


@dataclass(frozen=True, slots=True)
class TurnOutcome:
    committed: bool
    outbound_seq: int | None
    outbox_id: UUID | None


async def conclude_turn(
    conn: psycopg.AsyncConnection,
    *,
    conversation_id: UUID,
    token: UUID,
    expected_version: int,
    generation: int,
    target_seq: int,
    content: dict[str, Any] | None,
    idempotency_key: str,
    kind: str = "reply",
    moment_ids: tuple[UUID, ...] = (),
    otel: dict[str, Any] | None = None,
) -> TurnOutcome:
    """`content=None` means Judge 1 refused the draft: the turn concludes, the
    sequence advances and NOTHING goes out (S8, migration 20260803000003).
    `kind`/`moment_ids` chegam com o toque de missão: a outbox precisa deles
    para o preflight do sender (migrations 0007/0008). `otel` é o carrier do
    turno — a linha de outbox o carrega até o sender (9.1b, migration 0012)."""
    cursor = await conn.execute(
        "select * from internal.conclude_turn(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (
            conversation_id,
            token,
            expected_version,
            generation,
            target_seq,
            # SQL NULL, not `Jsonb(None)` — the latter renders the JSON value
            # `null`, which the function also refuses to send, but saying
            # "there is no content" plainly is what this call means.
            Jsonb(content) if content is not None else None,
            idempotency_key,
            kind,
            list(moment_ids),
            Jsonb(otel) if otel is not None else None,
        ),
    )
    committed, outbound_seq, outbox_id = await cursor.fetchone()
    return TurnOutcome(committed=committed, outbound_seq=outbound_seq, outbox_id=outbox_id)


# --- the mission touch --------------------------------------------------------


async def turn_pointers(
    conn: psycopg.AsyncConnection, conversation_id: UUID
) -> tuple[int, int]:
    """(processing_generation, next_inbound_seq) — o alvo do CAS de um toque.

    O toque conclui contra o estado CORRENTE: qualquer inbound no meio bumpa
    next_inbound_seq e o CAS recusa o rascunho (o turno de resposta assume)."""
    cursor = await conn.execute(
        "select processing_generation, next_inbound_seq from public.conversations"
        " where id = %s",
        (conversation_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise LookupError(f"conversation {conversation_id} is not this tenant's")
    return int(row[0]), int(row[1])


async def outbox_key_exists(conn: psycopg.AsyncConnection, idempotency_key: str) -> bool:
    """O dedup do toque: reentrega do pgmq encontra a outbox já escrita."""
    cursor = await conn.execute(
        "select exists (select 1 from internal.message_outbox where idempotency_key = %s)",
        (idempotency_key,),
    )
    return bool((await cursor.fetchone())[0])


async def set_conversation_owner(
    conn: psycopg.AsyncConnection, conversation_id: UUID, mission_version_id: UUID
) -> None:
    """O toque que SAIU torna a missão dona da conversa (§3.2.2): a resposta
    do cliente engaja a família — trocada pelo resolver, nunca pelo modelo."""
    await conn.execute(
        "update public.conversations set owner_mission_version_id = %s where id = %s",
        (mission_version_id, conversation_id),
    )


# --- the coalescer -----------------------------------------------------------


async def coalesce_due_conversations(
    conn: psycopg.AsyncConnection,
    *,
    queue: str,
    limit: int = 100,
    otel: dict[str, Any] | None = None,
) -> int:
    """Returns how many jobs were created — the tick's only observable.
    `otel` carimba o contexto do passe em cada job (9.1b): o worker retoma
    como LINK, então o fan-out não vira um trace só."""
    cursor = await conn.execute(
        "select count(*) from internal.coalesce_due_conversations(%s, %s, %s)",
        (queue, limit, Jsonb(otel) if otel is not None else None),
    )
    return int((await cursor.fetchone())[0])


# --- the outbox --------------------------------------------------------------


async def claim_outbox_batch(
    conn: psycopg.AsyncConnection,
    token: UUID,
    *,
    lease: timedelta,
    limit: int = 50,
) -> list[ClaimedSend]:
    cursor = await conn.execute(
        "select * from internal.claim_outbox_batch(%s, %s, %s)", (token, limit, lease)
    )
    return [
        ClaimedSend(
            outbox_id=row[0],
            organization_id=row[1],
            channel_type=row[2],
            channel_external_id=row[3],
            to_phone_e164=row[4],
            payload=row[5],
            idempotency_key=row[6],
            attempt_count=row[7],
            kind=row[8],
            moment_ids=tuple(row[9] or ()),
            otel=row[10],
        )
        for row in await cursor.fetchall()
    ]


@dataclass(frozen=True, slots=True)
class PreflightVerdict:
    """What `internal.sender_preflight` decided — the sender executes, never recalcula."""

    verdict: str
    template_name: str | None
    template_language: str | None

    @property
    def suppressed(self) -> bool:
        return self.verdict in (
            "opt_out", "window_closed", "no_template", "moment_gone", "moment_not_ready",
        )

    @property
    def moment_failure(self) -> bool:
        """As supressões que o doc manda ALERTAR (§3.3.4): o lojista precisa
        saber que o toque do momento dele não está saindo naquele canal."""
        return self.verdict in ("moment_gone", "moment_not_ready")


async def sender_preflight(
    conn: psycopg.AsyncConnection,
    organization_id: UUID,
    to_phone: str,
    kind: str,
    *,
    channel: str = "whatsapp",
    moment_ids: tuple[UUID, ...] = (),
) -> PreflightVerdict:
    cursor = await conn.execute(
        "select * from internal.sender_preflight(%s, %s, %s, %s, %s)",
        (organization_id, to_phone, kind, channel, list(moment_ids)),
    )
    row = await cursor.fetchone()
    return PreflightVerdict(verdict=row[0], template_name=row[1], template_language=row[2])


async def expire_incentive_grants(conn: psycopg.AsyncConnection) -> int:
    """O fim de vida por relógio (9.2): grants vencidos viram 'expired' com
    entrada no ledger — no housekeeping do sender, como o sweep de outbox."""
    cursor = await conn.execute("select internal.expire_incentive_grants()")
    return int((await cursor.fetchone())[0])


async def alert_moment_suppression(
    conn: psycopg.AsyncConnection,
    *,
    organization_id: UUID,
    outbox_id: UUID,
    verdict: str,
    moment_ids: tuple[UUID, ...],
) -> None:
    """O alerta que acompanha a supressão de momento (§3.3.4).

    A conexão do sender drena todas as orgs sem escopo fixo — o escopo entra
    aqui, por operação, porque a policy de alerts exige a org da sessão."""
    async with conn.transaction():
        await scope_to_organization(conn, organization_id)
        # 'moment_template_not_ready' é o tipo que a migration de identidade
        # já previu para esta família; o veredito exato vai no metadata.
        await conn.execute(
            """
            insert into public.alerts (organization_id, type, severity, title, metadata)
            values (%s, 'moment_template_not_ready', 'warning',
                    'Toque de momento suprimido no envio', %s)
            """,
            (
                organization_id,
                Jsonb(
                    {
                        "outbox_id": str(outbox_id),
                        "verdict": verdict,
                        "moment_ids": [str(moment) for moment in moment_ids],
                    }
                ),
            ),
        )


async def mirror_outbound_to_inbox(
    conn: psycopg.AsyncConnection,
    organization_id: UUID,
    to_phone: str,
    wamid: str,
    text: str,
) -> bool:
    cursor = await conn.execute(
        "select internal.mirror_outbound_to_inbox(%s, %s, %s, %s)",
        (organization_id, to_phone, wamid, text),
    )
    return bool((await cursor.fetchone())[0])


async def mark_outbox_sent(
    conn: psycopg.AsyncConnection, outbox_id: UUID, token: UUID, provider_message_id: str
) -> bool:
    cursor = await conn.execute(
        "select internal.mark_outbox_sent(%s, %s, %s)",
        (outbox_id, token, provider_message_id),
    )
    return bool((await cursor.fetchone())[0])


async def mark_outbox_failed(
    conn: psycopg.AsyncConnection,
    outbox_id: UUID,
    token: UUID,
    *,
    transient: bool,
    error: str,
    retry_in: timedelta,
) -> bool:
    cursor = await conn.execute(
        "select internal.mark_outbox_failed(%s, %s, %s, %s, %s)",
        (outbox_id, token, transient, error, retry_in),
    )
    return bool((await cursor.fetchone())[0])


async def sweep_outbox_unknown(conn: psycopg.AsyncConnection) -> int:
    cursor = await conn.execute("select internal.sweep_outbox_unknown()")
    return int((await cursor.fetchone())[0])


async def review_stale_unknown(conn: psycopg.AsyncConnection, *, review_after: timedelta) -> int:
    cursor = await conn.execute("select internal.review_stale_unknown(%s)", (review_after,))
    return int((await cursor.fetchone())[0])


async def reprocess_dead_letters(
    conn: psycopg.AsyncConnection, dead_letter_queue: str, origin_queue: str
) -> int:
    cursor = await conn.execute(
        "select internal.reprocess_dead_letters(%s, %s)",
        (dead_letter_queue, origin_queue),
    )
    return int((await cursor.fetchone())[0])


# --- liveness ----------------------------------------------------------------


async def beat(conn: psycopg.AsyncConnection, process_name: str) -> None:
    await conn.execute(
        """
        insert into internal.runtime_heartbeats (process_name)
        values (%s)
        on conflict (process_name) do update set beat_at = now()
        """,
        (process_name,),
    )


async def queue_depths(conn: psycopg.AsyncConnection) -> dict[str, int]:
    """Profundidade por fila, lida no tick do heartbeat e emitida como log
    estruturado — a métrica de fila do doc de observabilidade sem scraper
    dedicado no v1."""
    cursor = await conn.execute("select queue_name, queue_length from pgmq.metrics_all()")
    return {row[0]: row[1] for row in await cursor.fetchall()}


async def heartbeat_age_seconds(conn: psycopg.AsyncConnection) -> float | None:
    """Idade do beat mais recente — o que o /healthz responde. None = nunca bateu."""
    cursor = await conn.execute(
        "select extract(epoch from now() - max(beat_at)) from internal.runtime_heartbeats"
    )
    row = await cursor.fetchone()
    return None if row is None or row[0] is None else float(row[0])


# --- queue plumbing shared with the loop --------------------------------------


async def set_visibility(
    conn: psycopg.AsyncConnection, queue: str, message_id: int, delay: timedelta
) -> None:
    # pgmq speaks whole seconds. Truncating would turn any sub-second delay
    # into ZERO — a message visible again immediately, which under a tiny test
    # VT showed up as read_ct = 11 on a single job. Rounding UP keeps 'hidden
    # for at least this long' true at every granularity.
    await conn.execute(
        "select pgmq.set_vt(%s, %s, %s::integer)",
        (queue, message_id, max(1, math.ceil(delay.total_seconds()))),
    )


async def send_to_queue(conn: psycopg.AsyncConnection, queue: str, payload: dict[str, Any]) -> int:
    cursor = await conn.execute("select pgmq.send(%s, %s)", (queue, Jsonb(payload)))
    return int((await cursor.fetchone())[0])
