"""Fail-closed guard for destructive test fixtures."""

import os
import re

import psycopg
from psycopg.conninfo import conninfo_to_dict


def validate_dsn(dsn: str) -> dict[str, str]:
    if any(os.environ.get(name) for name in ("PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE")):
        raise ValueError("ambient libpq routing is not allowed")
    try:
        values = conninfo_to_dict(dsn)
    except psycopg.ProgrammingError:
        raise ValueError("invalid test DSN") from None
    allowed = {"host", "port", "dbname", "user", "password", "connect_timeout"}
    if set(values) - allowed:
        raise ValueError("unsupported test DSN parameters")
    if values.get("host") != "127.0.0.1":
        raise ValueError("test database must use explicit loopback")
    if values.get("port") != "45322" or values.get("dbname") != "postgres":
        raise ValueError("test database must use the disposable port and database")
    return values


def read_system_identifier(dsn: str) -> str:
    validate_dsn(dsn)
    with psycopg.connect(dsn, connect_timeout=3, options="-c statement_timeout=3000") as conn:
        row = conn.execute("select system_identifier::text from pg_control_system()").fetchone()
        if row is None or not re.fullmatch(r"[0-9]+", row[0]):
            raise RuntimeError("invalid database identity")
        return row[0]


def assert_database_identity(conn, *, system_identifier: str, sentinel: str) -> None:
    if not re.fullmatch(r"[0-9]+", system_identifier) or not re.fullmatch(
        r"[0-9a-f]{64}", sentinel
    ):
        raise RuntimeError("missing database identity proof")
    row = conn.execute("select system_identifier::text from pg_control_system()").fetchone()
    if row != (system_identifier,):
        raise RuntimeError("test database identity mismatch")
    rows = conn.execute("select token from testing.disposable_identity").fetchall()
    if rows != [(sentinel,)]:
        raise RuntimeError("test database sentinel mismatch")
