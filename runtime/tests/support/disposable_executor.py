"""Disposable local database orchestration; never accepts a caller DSN."""

import copy
import hashlib
import json
import os
import re
import stat
import tomllib
from pathlib import Path

EXCLUDED = (
    "realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,"
    "studio,edge-runtime,logflare,vector,supavisor"
)
DSN = "postgresql://postgres:postgres@127.0.0.1:55322/postgres"
SID_SQL = "select system_identifier::text from pg_control_system()"
HISTORY_SQL = "select version from supabase_migrations.schema_migrations order by version"
TOKEN_RE = r"[0-9a-f]{64}"
NAME_RE = r"([0-9]{8}|[0-9]{14})_[A-Za-z0-9_]+\.sql"
EXPECTED = {
    "project_id": "worder1",
    "api": {
        "enabled": True,
        "port": 54321,
        "schemas": ["public", "graphql_public"],
        "extra_search_path": ["public", "extensions"],
        "max_rows": 1000,
    },
    "db": {
        "port": 54322,
        "shadow_port": 54320,
        "major_version": 17,
        "pooler": {"enabled": False},
        "migrations": {"enabled": True, "schema_paths": []},
        "seed": {"enabled": False, "sql_paths": []},
    },
    "realtime": {"enabled": True},
    "studio": {"enabled": False},
    "storage": {"enabled": False},
    "auth": {
        "enabled": True,
        "site_url": "http://127.0.0.1:3000",
        "jwt_expiry": 3600,
        "enable_signup": True,
        "enable_anonymous_sign_ins": False,
        "minimum_password_length": 6,
    },
    "edge_runtime": {"enabled": False},
    "analytics": {"enabled": False},
}


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def no_links(path):
    for item in (path, *path.parents):
        if item.exists() or item.is_symlink():
            info = item.lstat()
            require(
                not item.is_symlink()
                and not (
                    getattr(info, "st_file_attributes", 0)
                    & stat.FILE_ATTRIBUTE_REPARSE_POINT
                ),
                "linked path refused",
            )


def safe_run(repo, value):
    supplied = Path(value)
    require(supplied.is_absolute(), "RunDirectory must be absolute")
    no_links(supplied)
    root = (repo / ".superpowers/sdd/auditoria-ia-disposable").resolve()
    path = supplied.resolve()
    require(
        path.parent == root and re.fullmatch(r"[0-9a-f]{32}", path.name),
        "RunDirectory must be a direct nonce child",
    )
    return path


def write_json(path, value):
    no_links(path)
    temp = path.with_name(path.name + ".tmp")
    no_links(temp)
    with temp.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=True, indent=2)
        handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())
    temp.replace(path)


def read_json(path):
    no_links(path)
    return json.loads(path.read_text(encoding="utf-8"))


def config_text(text, project, enabled, *, source=False):
    require(re.fullmatch(r"worder-audit-[0-9a-f]{32}", project), "invalid project id")
    actual = tomllib.loads(text)
    desired = copy.deepcopy(EXPECTED)
    desired["project_id"] = project
    desired["api"]["port"] = 55321
    desired["db"]["port"] = 55322
    desired["db"]["shadow_port"] = 55320
    desired["db"]["migrations"]["enabled"] = enabled
    before = copy.deepcopy(EXPECTED if source else desired)
    if not source:
        before["db"]["migrations"]["enabled"] = actual.get("db", {}).get(
            "migrations", {}
        ).get("enabled")
        require(
            type(before["db"]["migrations"]["enabled"]) is bool,
            "missing migrations flag",
        )
    require(actual == before, "unexpected config schema or value")
    edits = {
        ("", "project_id"): json.dumps(project),
        ("api", "port"): "55321",
        ("db", "port"): "55322",
        ("db", "shadow_port"): "55320",
        ("db.migrations", "enabled"): str(enabled).lower(),
        ("db.seed", "enabled"): "false",
        ("storage", "enabled"): "false",
    }
    section, seen, lines = "", set(), []
    for line in text.splitlines():
        header = re.fullmatch(r"\s*\[([a-z_]+(?:\.[a-z_]+)*)\]\s*", line)
        if header:
            section = header[1]
        key = re.match(r"^\s*([a-z_]+)\s*=", line)
        identity = (section, key[1]) if key else None
        if identity in edits:
            require(identity not in seen, "duplicate editable key")
            seen.add(identity)
            line = f"{key[1]} = {edits[identity]}"
        lines.append(line)
    require(seen == set(edits), "missing explicit section or key")
    result = "\n".join(lines) + "\n"
    require(tomllib.loads(result) == desired, "config edit changed unrelated fields")
    return result


def manifest_shape(rows):
    require(isinstance(rows, list) and bool(rows), "empty or non-array manifest")
    for row in rows:
        require(
            isinstance(row, dict) and set(row) == {"filename", "sha256", "version"},
            "invalid manifest keys",
        )
        require(all(isinstance(value, str) for value in row.values()), "invalid manifest values")
        match = re.fullmatch(NAME_RE, row["filename"])
        require(
            match
            and match[1] == row["version"]
            and re.fullmatch(r"[0-9A-F]{64}", row["sha256"]),
            "invalid migration entry",
        )
    ordered = sorted(rows, key=lambda row: (row["version"], row["filename"]))
    require(rows == ordered, "unordered manifest")
    require(
        ordered == sorted(rows, key=lambda row: row["filename"]),
        "ambiguous legacy version order",
    )
    require(len({row["version"] for row in rows}) == len(rows), "duplicate migration version")
    require(
        len({row["filename"].casefold() for row in rows}) == len(rows),
        "duplicate filename",
    )
    return rows


def inventory(folder, through=None):
    no_links(folder)
    rows = []
    for file in sorted(folder.iterdir(), key=lambda path: path.name):
        no_links(file)
        match = re.fullmatch(NAME_RE, file.name)
        require(file.is_file() and match, "unexpected migration directory entry")
        rows.append(
            {
                "filename": file.name,
                "version": match[1],
                "sha256": hashlib.sha256(file.read_bytes()).hexdigest().upper(),
            }
        )
    manifest_shape(rows)
    if through:
        require(re.fullmatch(r"[0-9]{14}", through), "invalid migration limit")
        require(through in {row["version"] for row in rows}, "unknown migration limit")
        rows = [row for row in rows if row["version"] <= through]
    return manifest_shape(rows)


def prospective(old, current):
    manifest_shape(old)
    manifest_shape(current)
    require(current[: len(old)] == old, "history is not an immutable prefix")
    require(
        all(row["version"] > old[-1]["version"] for row in current[len(old) :]),
        "out-of-order migration",
    )
    return copy.deepcopy(current)


def targets(repo, values):
    require(
        isinstance(values, list) and all(isinstance(value, str) for value in values),
        "invalid TestTargets",
    )
    grammar = (
        r"tests/(unit|db|pipeline)/[A-Za-z0-9_/-]+\.py"
        r"(?:::[A-Za-z_][A-Za-z0-9_]*(?:\[[A-Za-z0-9_.-]+\])?)*"
    )
    for value in values:
        require(re.fullmatch(grammar, value) and ".." not in value, "invalid test target")
        file = repo / "runtime" / value.split("::", 1)[0]
        no_links(file)
        require(
            file.is_file()
            and file.resolve().is_relative_to((repo / "runtime/tests").resolve()),
            "test target escaped test root",
        )
    return values
