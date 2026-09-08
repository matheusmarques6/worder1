import os
from unittest.mock import Mock, patch

import pytest

from tests.support import database, disposable_db
from tests.support.disposable_db import (
    assert_database_identity,
    read_system_identifier,
    validate_dsn,
)

DSN = "postgresql://postgres:postgres@127.0.0.1:55322/postgres"
SID = "1234567890123456789"
TOKEN = "a" * 64


@pytest.mark.parametrize(
    "dsn",
    [
        "postgresql://postgres:postgres@db.example.test:55322/postgres",
        "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        "host=127.0.0.1 hostaddr=10.0.0.1 port=55322 dbname=postgres",
        "host=127.0.0.1,db.example.test port=55322 dbname=postgres",
        "service=production",
        "host=localhost port=55322 dbname=postgres",
        "host=127.0.0.1 port=55322 dbname=other",
    ],
)
def test_rejects_unproven_target(dsn):
    with pytest.raises(ValueError):
        validate_dsn(dsn)


def test_accepts_explicit_disposable_loopback():
    assert validate_dsn(DSN)["port"] == "55322"


@pytest.mark.parametrize(
    "rows,calls",
    [
        ([("wrong",)], 1),
        ([(SID,), []], 2),
        ([(SID,), [("b" * 64,)]], 2),
        ([(SID,), [(TOKEN,), (TOKEN,)]], 2),
    ],
)
def test_identity_guards_reject_before_fixtures(rows, calls):
    conn = Mock()
    results = []
    for index, row in enumerate(rows):
        cursor = Mock()
        if index == 0:
            cursor.fetchone.return_value = row
        else:
            cursor.fetchall.return_value = row
        results.append(cursor)
    conn.execute.side_effect = results
    with pytest.raises(RuntimeError):
        assert_database_identity(conn, system_identifier=SID, sentinel=TOKEN)
    assert conn.execute.call_count == calls


@pytest.mark.parametrize(
    "missing",
    [
        "SUPABASE_DB_URL",
        "WORDER_TEST_DB_SYSTEM_IDENTIFIER",
        "WORDER_TEST_DB_SENTINEL",
    ],
)
def test_missing_env_never_connects(missing):
    values = {
        "SUPABASE_DB_URL": DSN,
        "WORDER_TEST_DB_SYSTEM_IDENTIFIER": SID,
        "WORDER_TEST_DB_SENTINEL": TOKEN,
    }
    values.pop(missing)
    with (
        patch.dict(os.environ, values, clear=True),
        patch.object(database.psycopg, "connect") as c,
    ):
        with pytest.raises(KeyError):
            database.dsn_from_env()
        c.assert_not_called()


@pytest.mark.parametrize(
    "dsn,ambient",
    [
        ("postgresql://postgres:postgres@db.example.test:55322/postgres", {}),
        (DSN, {"PGSERVICE": "production"}),
    ],
)
def test_dsn_from_env_rejects_unproven_target_without_connecting(dsn, ambient):
    values = {
        "SUPABASE_DB_URL": dsn,
        "WORDER_TEST_DB_SYSTEM_IDENTIFIER": SID,
        "WORDER_TEST_DB_SENTINEL": TOKEN,
        **ambient,
    }
    with patch.dict(os.environ, values, clear=True), patch.object(database.psycopg, "connect") as c:
        with pytest.raises(ValueError):
            database.dsn_from_env()
        c.assert_not_called()


@pytest.mark.parametrize(
    "rows",
    [
        [("wrong",)],
        [(SID,), [("b" * 64,)]],
    ],
)
def test_dsn_from_env_propagates_identity_or_sentinel_mismatch_and_closes(rows):
    values = {
        "SUPABASE_DB_URL": DSN,
        "WORDER_TEST_DB_SYSTEM_IDENTIFIER": SID,
        "WORDER_TEST_DB_SENTINEL": TOKEN,
    }
    with patch.dict(os.environ, values, clear=True), patch.object(database.psycopg, "connect") as c:
        conn = c.return_value.__enter__.return_value
        cursors = []
        for index, row in enumerate(rows):
            cursor = Mock()
            if index == 0:
                cursor.fetchone.return_value = row
            else:
                cursor.fetchall.return_value = row
            cursors.append(cursor)
        conn.execute.side_effect = cursors

        with pytest.raises(RuntimeError):
            database.dsn_from_env()

        c.assert_called_once_with(DSN, connect_timeout=3, options="-c statement_timeout=3000")
        c.return_value.__exit__.assert_called_once()


def test_dsn_from_env_returns_only_after_valid_proof_and_closes():
    values = {
        "SUPABASE_DB_URL": DSN,
        "WORDER_TEST_DB_SYSTEM_IDENTIFIER": SID,
        "WORDER_TEST_DB_SENTINEL": TOKEN,
    }
    with patch.dict(os.environ, values, clear=True), patch.object(database.psycopg, "connect") as c:
        conn = c.return_value.__enter__.return_value
        system = Mock()
        system.fetchone.return_value = (SID,)
        sentinel = Mock()
        sentinel.fetchall.return_value = [(TOKEN,)]
        conn.execute.side_effect = [system, sentinel]

        assert database.dsn_from_env() == DSN

        c.assert_called_once_with(DSN, connect_timeout=3, options="-c statement_timeout=3000")
        assert conn.execute.call_count == 2
        c.return_value.__exit__.assert_called_once()


@pytest.mark.parametrize("row", [None, ("not-digits",)])
def test_read_system_identifier_rejects_invalid_identity_and_closes(row):
    with (
        patch.dict(os.environ, {}, clear=True),
        patch.object(disposable_db.psycopg, "connect") as c,
    ):
        conn = c.return_value.__enter__.return_value
        conn.execute.return_value.fetchone.return_value = row

        with pytest.raises(RuntimeError):
            read_system_identifier(DSN)

        c.assert_called_once_with(DSN, connect_timeout=3, options="-c statement_timeout=3000")
        c.return_value.__exit__.assert_called_once()


def test_read_system_identifier_returns_valid_identity_and_closes():
    with (
        patch.dict(os.environ, {}, clear=True),
        patch.object(disposable_db.psycopg, "connect") as c,
    ):
        conn = c.return_value.__enter__.return_value
        conn.execute.return_value.fetchone.return_value = (SID,)

        assert read_system_identifier(DSN) == SID

        c.assert_called_once_with(DSN, connect_timeout=3, options="-c statement_timeout=3000")
        c.return_value.__exit__.assert_called_once()


@pytest.mark.parametrize(
    "system_identifier,sentinel",
    [("not-digits", TOKEN), (SID, "not-hex")],
)
def test_identity_guard_rejects_malformed_proof_without_sql(system_identifier, sentinel):
    conn = Mock()
    with pytest.raises(RuntimeError):
        assert_database_identity(
            conn,
            system_identifier=system_identifier,
            sentinel=sentinel,
        )
    conn.execute.assert_not_called()
