"""Disposable local database orchestration; never accepts a caller DSN."""

import contextlib
import copy
import hashlib
import json
import os
import re
import shutil
import signal
import stat
import subprocess
import tomllib
from pathlib import Path

import psycopg

from tests.support.disposable_db import assert_database_identity, read_system_identifier

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


def same_typed_value(actual, expected):
    if type(actual) is not type(expected):
        return False
    if isinstance(actual, dict):
        return actual.keys() == expected.keys() and all(
            same_typed_value(actual[key], expected[key]) for key in actual
        )
    if isinstance(actual, list):
        return len(actual) == len(expected) and all(
            same_typed_value(left, right) for left, right in zip(actual, expected, strict=True)
        )
    return actual == expected


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
    root = repo / ".superpowers/sdd/auditoria-ia-disposable"
    no_links(root)
    root = root.resolve()
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
    require(type(enabled) is bool, "invalid migrations flag")
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
    require(same_typed_value(actual, before), "unexpected config schema or value")
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
    require(
        same_typed_value(tomllib.loads(result), desired),
        "config edit changed unrelated fields",
    )
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


class CommandFailure(RuntimeError):
    def __init__(self, code):
        super().__init__("subprocess failed")
        self.code = code


def child_env(identity=None):
    allowed = {
        "PATH",
        "PATHEXT",
        "SYSTEMROOT",
        "WINDIR",
        "COMSPEC",
        "TEMP",
        "TMP",
        "HOME",
        "USERPROFILE",
        "LOCALAPPDATA",
        "APPDATA",
        "LANG",
        "LC_ALL",
        "CI",
    }
    result = {key: value for key, value in os.environ.items() if key.upper() in allowed}
    result["PYTHONUTF8"] = "1"
    result["NO_COLOR"] = "1"
    if identity:
        result.update(
            SUPABASE_DB_URL=DSN,
            WORDER_TEST_DB_SYSTEM_IDENTIFIER=identity["systemIdentifier"],
            WORDER_TEST_DB_SENTINEL=identity["sentinel"],
        )
    return result


def run_process(argv, *, cwd, env, input=None, timeout=600):
    executable = shutil.which(argv[0] + (".exe" if os.name == "nt" else ""))
    if not executable or Path(executable).suffix.lower() in {".cmd", ".bat", ".ps1"}:
        return subprocess.CompletedProcess(argv, 127, "", "")
    process = subprocess.Popen(
        [executable, *argv[1:]],
        cwd=cwd,
        env=env,
        shell=False,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        start_new_session=os.name != "nt",
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
    )
    try:
        stdout, stderr = process.communicate(input=input, timeout=timeout)
        code = process.returncode
    except (subprocess.TimeoutExpired, KeyboardInterrupt) as error:
        if os.name == "nt":
            subprocess.run(
                ["taskkill.exe", "/PID", str(process.pid), "/T", "/F"],
                capture_output=True,
                check=False,
                timeout=30,
                shell=False,
            )
        else:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGKILL)
        process.kill()
        stdout, stderr = process.communicate()
        code = 130 if isinstance(error, KeyboardInterrupt) else 124
    finally:
        process.wait()
    return subprocess.CompletedProcess(argv, 128 - code if code < 0 else code, stdout, stderr)


def inspect_record(data, project, before, prior=None):
    try:
        require(isinstance(data, list) and len(data) == 1, "DB container not unique")
        db = data[0]
        require(isinstance(db, dict), "invalid container record")
        require(db["Name"] == "/supabase_db_" + project, "container name mismatch")
        require(
            isinstance(db["Id"], str) and re.fullmatch(r"[0-9a-f]{64}", db["Id"]),
            "invalid container id",
        )
        require(db["State"]["Running"] is True, "DB container not running")
        require(
            db["Config"]["Labels"].get("com.supabase.cli.project") == project,
            "project label mismatch",
        )
        require(
            isinstance(db["Config"]["Image"], str)
            and re.search(r"(^|/)supabase/postgres:", db["Config"]["Image"]),
            "unexpected DB image",
        )
        require(
            isinstance(db["Image"], str)
            and re.fullmatch(r"sha256:[0-9a-f]{64}", db["Image"]),
            "invalid image id",
        )
        mapping = db["NetworkSettings"]["Ports"].get("5432/tcp")
        require(
            isinstance(mapping, list)
            and len(mapping) == 1
            and mapping[0]["HostPort"] == "55322"
            and mapping[0]["HostIp"] in {"127.0.0.1", "0.0.0.0"},
            "port mapping mismatch",
        )
        require(isinstance(db["Mounts"], list), "invalid data mounts")
        volumes = [
            mount
            for mount in db["Mounts"]
            if mount["Destination"].startswith("/var/lib/postgresql/data")
            or "/var/lib/postgresql/data".startswith(mount["Destination"].rstrip("/") + "/")
        ]
        require(
            len(volumes) == 1
            and volumes[0]["Type"] == "volume"
            and volumes[0]["Destination"] == "/var/lib/postgresql/data",
            "ambiguous data mount",
        )
        volume = volumes[0]["Name"]
        require(
            isinstance(volume, str)
            and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", volume)
            and volume not in before,
            "DB volume is not new",
        )
    except (AttributeError, IndexError, KeyError, TypeError):
        raise ValueError("invalid container record") from None
    result = {
        "projectId": project,
        "containerId": db["Id"],
        "imageId": db["Image"],
        "volumeName": volume,
        "port": 55322,
    }
    if prior is not None:
        require(
            isinstance(prior, dict)
            and all(prior.get(key) == value for key, value in result.items()),
            "physical identity changed",
        )
    return result


def identity_shape(value, project):
    require(
        isinstance(value, dict)
        and set(value)
        == {
            "projectId",
            "containerId",
            "imageId",
            "volumeName",
            "port",
            "systemIdentifier",
            "sentinel",
        },
        "invalid identity keys",
    )
    require(
        type(value["projectId"]) is str
        and value["projectId"] == project
        and type(value["port"]) is int
        and value["port"] == 55322,
        "identity target mismatch",
    )
    require(
        type(value["containerId"]) is str
        and re.fullmatch(r"[0-9a-f]{64}", value["containerId"])
        and type(value["imageId"]) is str
        and re.fullmatch(r"sha256:[0-9a-f]{64}", value["imageId"])
        and type(value["volumeName"]) is str
        and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", value["volumeName"])
        and type(value["systemIdentifier"]) is str
        and re.fullmatch(r"[0-9]+", value["systemIdentifier"]),
        "invalid identity values",
    )
    require(
        value["sentinel"] is None
        or (
            type(value["sentinel"]) is str
            and re.fullmatch(TOKEN_RE, value["sentinel"])
        ),
        "invalid sentinel",
    )
    require("postgresql://" not in json.dumps(value), "DSN in identity")
    return value


def gate_shape(gate):
    require(
        isinstance(gate, dict)
        and set(gate)
        == {
            "commit",
            "scope",
            "state",
            "commands",
            "exitCodes",
            "collectedRls",
            "stage",
            "failure",
        },
        "invalid gates keys",
    )
    require(
        gate["commit"] is None
        or (type(gate["commit"]) is str and re.fullmatch(r"[0-9a-f]{40}", gate["commit"])),
        "invalid commit",
    )
    require(
        type(gate["scope"]) is str
        and gate["scope"] in {"setup", "focal", "full"}
        and type(gate["state"]) is str
        and gate["state"]
        in {
            "preparing",
            "prepared",
            "replaying",
            "ready",
            "upgrading",
            "testing",
            "failed",
            "unproven",
            "stopped",
        },
        "invalid gates scope or state",
    )
    require(
        gate["commit"] is not None or gate["state"] not in {"prepared", "ready"},
        "commit required for proven state",
    )
    require(
        isinstance(gate["commands"], list)
        and isinstance(gate["exitCodes"], list)
        and len(gate["commands"]) == len(gate["exitCodes"]),
        "unpaired command results",
    )
    require(
        all(
            isinstance(command, list)
            and command
            and all(type(argument) is str for argument in command)
            for command in gate["commands"]
        ),
        "invalid command argv",
    )
    require(
        all(type(code) is int for code in gate["exitCodes"])
        and type(gate["collectedRls"]) is int
        and gate["collectedRls"] >= 0,
        "invalid counts",
    )
    require(type(gate["stage"]) is str, "invalid stage")
    failure = gate["failure"]
    require(
        failure is None
        or (
            isinstance(failure, dict)
            and set(failure) == {"stage", "kind", "exitCode"}
            and type(failure["stage"]) is str
            and type(failure["kind"]) is str
            and type(failure["exitCode"]) is int
        ),
        "invalid failure",
    )
    require("postgresql://" not in json.dumps(gate), "DSN in gates")
    return gate


class Executor:
    def __init__(self, repo, run, *, runner=run_process):
        self.repo, self.run, self.runner = Path(repo), Path(run), runner
        self.project = "worder-audit-" + self.run.name
        self.identity = None
        self.gate = {
            "commit": None,
            "scope": "setup",
            "state": "preparing",
            "commands": [],
            "exitCodes": [],
            "collectedRls": 0,
            "stage": "preflight",
            "failure": None,
        }

    def save(self):
        write_json(self.run / "gates.json", gate_shape(self.gate))

    def command(self, tool, *arguments, stdin=None, identity=None, timeout=600, check=True):
        argv = [tool, *(str(argument) for argument in arguments)]
        try:
            result = self.runner(
                argv,
                cwd=self.repo,
                env=child_env(identity),
                input=stdin,
                timeout=timeout,
            )
        except OSError:
            result = subprocess.CompletedProcess(argv, 127, "", "")
        self.gate["commands"].append(argv)
        self.gate["exitCodes"].append(result.returncode)
        self.save()
        output = (result.stdout or "") + "\n" + (result.stderr or "")
        event = {
            "stage": self.gate["stage"],
            "exitCode": result.returncode,
            "sqlstates": sorted(set(re.findall(r"SQLSTATE[ :]+([0-9A-Z]{5})", output))),
            "migrations": sorted(
                set(
                    re.findall(
                        r"\b([0-9]{8}|[0-9]{14})_[A-Za-z0-9_]+\.sql\b", output
                    )
                )
            ),
        }
        event_path = self.run / "events.jsonl"
        no_links(event_path)
        with event_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event) + "\n")
        if check and result.returncode:
            raise CommandFailure(result.returncode)
        return result

    def local(self, *arguments):
        version = self.command("supabase", "--version", timeout=30).stdout.strip()
        require(version == "2.111.0", "Supabase CLI version changed")
        return self.command("supabase", *arguments, "--workdir", self.run)

    def psql(self, container_id, sql):
        return self.command(
            "docker",
            "exec",
            "-i",
            container_id,
            "psql",
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-At",
            stdin=sql + "\n",
            timeout=30,
        ).stdout.strip()

    def config(self, enabled=None):
        path = self.run / "supabase/config.toml"
        no_links(path)
        text = path.read_text(encoding="utf-8")
        parsed = tomllib.loads(text)
        actual = parsed.get("db", {}).get("migrations", {}).get("enabled")
        checked = config_text(text, self.project, actual if enabled is None else enabled)
        if enabled is not None:
            path.write_text(checked, encoding="utf-8", newline="\n")
        for name in (
            ".env",
            "supabase/.env",
            "supabase/seed.sql",
            "supabase/roles.sql",
            "supabase/.temp/project-ref",
            "supabase/.branches",
        ):
            require(not (self.run / name).exists(), "unexpected project input")

    def files(self, expected=None):
        self.config()
        approved = (
            manifest_shape(read_json(self.run / "manifest.json")) if expected is None else expected
        )
        require(
            inventory(self.run / "supabase/migrations") == approved,
            "copied migration changed",
        )
        return approved

    def physical(self):
        self.config()
        before = read_json(self.run / "volumes-before.json")
        require(
            isinstance(before, list) and all(isinstance(volume, str) for volume in before),
            "invalid volume inventory",
        )
        target = self.identity["containerId"] if self.identity else "supabase_db_" + self.project
        result = self.command("docker", "inspect", target, timeout=30)
        physical = inspect_record(
            json.loads(result.stdout), self.project, before, self.identity
        )
        direct = self.psql(physical["containerId"], SID_SQL)
        require(re.fullmatch(r"[0-9]+", direct), "invalid direct system identifier")
        require(read_system_identifier(DSN) == direct, "loopback identity mismatch")
        if self.identity:
            require(
                direct == self.identity["systemIdentifier"],
                "database system identifier changed",
            )
        return dict(physical, systemIdentifier=direct, sentinel=None)

    def proof(self):
        require(
            self.identity is not None and self.identity["sentinel"] is not None,
            "sentinel proof unavailable",
        )
        self.physical()
        with psycopg.connect(
            DSN, connect_timeout=3, options="-c statement_timeout=3000"
        ) as conn:
            assert_database_identity(
                conn,
                system_identifier=self.identity["systemIdentifier"],
                sentinel=self.identity["sentinel"],
            )

    def history(self, expected):
        actual = self.psql(self.identity["containerId"], HISTORY_SQL).splitlines()
        require(actual == [row["version"] for row in expected], "migration history mismatch")
