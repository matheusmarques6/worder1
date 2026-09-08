import os
from unittest.mock import Mock, patch

import pytest

from tests.support import database
from tests.support.disposable_db import assert_database_identity, validate_dsn

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
