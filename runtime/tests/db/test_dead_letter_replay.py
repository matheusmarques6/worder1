"""A DLQ only retries a known transient business action, once."""

import uuid

import psycopg
import pytest
from psycopg import sql
from psycopg.types.json import Jsonb

DLQ = "q_domain_events_dlq"
ORIGIN = "q_domain_events"


def _send(conn: psycopg.Connection, queue: str, payload: dict) -> int:
    row = conn.execute("select pgmq.send(%s, %s)", (queue, Jsonb(payload))).fetchone()
    assert row is not None
    return int(row[0])


def _messages(conn: psycopg.Connection, queue: str) -> list[tuple[int, dict]]:
    return conn.execute(
        sql.SQL("select msg_id, message from pgmq.{} order by msg_id").format(
            sql.Identifier(f"q_{queue}")
        )
    ).fetchall()


def _reprocess(
    conn: psycopg.Connection,
    dead_letter_queue: str = DLQ,
    origin_queue: str = ORIGIN,
    limit: int = 50,
) -> int:
    row = conn.execute(
        "select internal.reprocess_dead_letters(%s, %s, %s)",
        (dead_letter_queue, origin_queue, limit),
    ).fetchone()
    assert row is not None
    return int(row[0])


def _worker(dsn: str) -> psycopg.Connection:
    conn = psycopg.connect(dsn)
    conn.execute("set role worker_role")
    return conn


def test_replays_a_transient_message_once_and_preserves_touch_identity(dsn: str) -> None:
    touch_id = str(uuid.uuid4())
    payload = {
        "kind": "mission_touch",
        "touch_id": touch_id,
        "failure_kind": "transient",
        "replay_count": 0,
        "error_class": "ConnectionError",
        "last_error": "provider blinked",
    }

    with _worker(dsn) as conn:
        source_id = _send(conn, DLQ, payload)

        assert _reprocess(conn) == 1
        replayed = _messages(conn, ORIGIN)

        assert len(replayed) == 1
        assert replayed[0][1] == {
            "kind": "mission_touch",
            "touch_id": touch_id,
            "failure_kind": "transient",
            "replay_count": 1,
        }
        assert _messages(conn, DLQ) == []
        archived = conn.execute(
            "select exists (select 1 from pgmq.a_q_domain_events_dlq where msg_id = %s)",
            (source_id,),
        ).fetchone()
        assert archived == (True,)

        conn.rollback()


@pytest.mark.parametrize("failure_kind", ["permanent", "unknown", None])
def test_does_not_replay_a_non_transient_failure(
    dsn: str, failure_kind: str | None
) -> None:
    payload = {"failure_kind": failure_kind, "replay_count": 0}

    with _worker(dsn) as conn:
        source_id = _send(conn, "q_inbound_dlq", payload)

        assert _reprocess(conn, "q_inbound_dlq", "q_inbound") == 0
        assert [row[0] for row in _messages(conn, "q_inbound_dlq")] == [source_id]
        assert _messages(conn, "q_inbound") == []

        conn.rollback()


def test_does_not_replay_when_failure_kind_is_missing(dsn: str) -> None:
    with _worker(dsn) as conn:
        source_id = _send(conn, "q_inbound_dlq", {"replay_count": 0})

        assert _reprocess(conn, "q_inbound_dlq", "q_inbound") == 0
        assert [row[0] for row in _messages(conn, "q_inbound_dlq")] == [source_id]

        conn.rollback()


@pytest.mark.parametrize(
    "replay_count",
    [None, "zero", "0", True, -1, 0.5, 2_147_483_648, 1],
)
def test_does_not_replay_an_invalid_or_exhausted_counter(dsn: str, replay_count) -> None:
    with _worker(dsn) as conn:
        source_id = _send(
            conn,
            "q_scheduled_dlq",
            {"failure_kind": "transient", "replay_count": replay_count},
        )

        assert _reprocess(conn, "q_scheduled_dlq", "q_scheduled") == 0
        assert [row[0] for row in _messages(conn, "q_scheduled_dlq")] == [source_id]
        assert _messages(conn, "q_scheduled") == []

        conn.rollback()


def test_does_not_replay_when_counter_is_missing(dsn: str) -> None:
    with _worker(dsn) as conn:
        source_id = _send(conn, "q_evals_dlq", {"failure_kind": "transient"})

        assert _reprocess(conn, "q_evals_dlq", "q_evals") == 0
        assert [row[0] for row in _messages(conn, "q_evals_dlq")] == [source_id]

        conn.rollback()


def test_does_not_replay_a_mission_touch_without_touch_id(dsn: str) -> None:
    with _worker(dsn) as conn:
        source_id = _send(
            conn,
            DLQ,
            {"kind": "mission_touch", "failure_kind": "transient", "replay_count": 0},
        )

        assert _reprocess(conn) == 0
        assert [row[0] for row in _messages(conn, DLQ)] == [source_id]

        conn.rollback()


@pytest.mark.parametrize(
    ("dead_letter_queue", "origin_queue", "limit"),
    [
        ("q_inbound_dlq", "q_domain_events", 50),
        ("not_a_queue", "q_inbound", 50),
        ("q_inbound_dlq", "q_inbound", 0),
        ("q_inbound_dlq", "q_inbound", 51),
    ],
)
def test_rejects_unknown_queue_pairs_and_invalid_limits(
    dsn: str, dead_letter_queue: str, origin_queue: str, limit: int
) -> None:
    with _worker(dsn) as conn:
        with pytest.raises(psycopg.Error):
            _reprocess(conn, dead_letter_queue, origin_queue, limit)

        conn.rollback()


@pytest.mark.parametrize("role", ["anon", "authenticated", "service_role"])
def test_only_the_worker_can_reprocess_dead_letters(dsn: str, role: str) -> None:
    with psycopg.connect(dsn) as conn:
        conn.execute(sql.SQL("set role {}").format(sql.Identifier(role)))

        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            _reprocess(conn, "q_inbound_dlq", "q_inbound")

        conn.rollback()


def test_source_is_not_archived_when_the_replay_transaction_rolls_back(
    dsn: str, admin: psycopg.Connection
) -> None:
    marker = str(uuid.uuid4())
    source_id = _send(
        admin,
        "q_evals_dlq",
        {"marker": marker, "failure_kind": "transient", "replay_count": 0},
    )

    conn = _worker(dsn)
    try:
        assert _reprocess(conn, "q_evals_dlq", "q_evals") == 1
        conn.rollback()

        assert admin.execute(
            "select exists (select 1 from pgmq.q_q_evals_dlq where msg_id = %s)",
            (source_id,),
        ).fetchone() == (True,)
        assert admin.execute(
            "select count(*) from pgmq.q_q_evals where message ->> 'marker' = %s",
            (marker,),
        ).fetchone() == (0,)
    finally:
        conn.close()
        admin.execute("delete from pgmq.q_q_evals_dlq where msg_id = %s", (source_id,))
