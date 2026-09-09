"""Disposable local database orchestration; never accepts a caller DSN."""

import contextlib
import copy
import hashlib
import json
import os
import re
import secrets
import shutil
import signal
import socket
import stat
import subprocess
import sys
import tomllib
import xml.etree.ElementTree as ET
from pathlib import Path

import psycopg

from tests.support.disposable_db import (
    assert_database_identity,
    read_system_identifier,
    validate_dsn,
)

EXCLUDED = (
    "realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,"
    "studio,edge-runtime,logflare,vector,supavisor"
)
DSN = "postgresql://postgres:postgres@127.0.0.1:45322/postgres"
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
        try:
            info = item.lstat()
        except FileNotFoundError:
            continue
        require(
            not stat.S_ISLNK(info.st_mode)
            and not (getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT),
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
    desired["api"]["port"] = 45321
    desired["db"]["port"] = 45322
    desired["db"]["shadow_port"] = 45320
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
        ("api", "port"): "45321",
        ("db", "port"): "45322",
        ("db", "shadow_port"): "45320",
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


class ProcessReapFailure(CommandFailure):
    def __init__(self, code, process, helper=None):
        super().__init__(code)
        # Pipe reader/writer threads may own IO locks. Retain and abandon the
        # process rather than block in close(); the executor lock requires inspection.
        self.process = process
        self.helper = helper


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
        process.wait(timeout=30)
    except (subprocess.TimeoutExpired, KeyboardInterrupt) as error:
        code = 130 if isinstance(error, KeyboardInterrupt) else 124
        tree_killed = True
        helper = None
        try:
            if os.name == "nt":
                helper = subprocess.Popen(
                    ["taskkill.exe", "/PID", str(process.pid), "/T", "/F"],
                    cwd=cwd,
                    env=env,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    shell=False,
                )
                tree_killed = helper.wait(timeout=30) == 0
            else:
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(process.pid, signal.SIGKILL)
        except (OSError, subprocess.TimeoutExpired, KeyboardInterrupt):
            tree_killed = False
        if helper is not None and not tree_killed:
            with contextlib.suppress(OSError, KeyboardInterrupt):
                helper.kill()
        try:
            process.kill()
        except (OSError, KeyboardInterrupt):
            tree_killed = False
        try:
            try:
                stdout, stderr = process.communicate(timeout=30)
            finally:
                process.wait(timeout=30)
        except (OSError, subprocess.TimeoutExpired, KeyboardInterrupt):
            raise ProcessReapFailure(code, process, helper) from None
        if not tree_killed:
            raise ProcessReapFailure(code, process, helper) from None
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
            and mapping[0]["HostPort"] == "45322"
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
        "port": 45322,
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
        and value["port"] == 45322,
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


def free_ports():
    listeners = []
    try:
        for port in (45320, 45321, 45322):
            listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            listeners.append(listener)
            if os.name == "nt":
                listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            listener.bind(("0.0.0.0", port))
    except OSError:
        raise ValueError("disposable port occupied") from None
    finally:
        for listener in listeners:
            listener.close()


def sanitize_report(path, sentinel):
    no_links(path)
    summary = {"tests": 0, "skipped": 0, "failures": 0, "errors": 0}
    output = ET.Element("testsuites")
    suite = ET.SubElement(output, "testsuite", name="disposable")
    problem = None
    try:
        root = ET.parse(path).getroot()
        for case in root.iter("testcase"):
            summary["tests"] += 1
            attributes = {}
            for key in ("name", "classname", "file", "line", "time"):
                if key in case.attrib:
                    value = case.attrib[key].replace(sentinel, "[redacted]")
                    attributes[key] = re.sub(
                        r"[A-Za-z][A-Za-z0-9+.-]*://\S+", "[redacted]", value
                    )
            safe = ET.SubElement(suite, "testcase", attributes)
            for child, counter in (
                ("skipped", "skipped"), ("failure", "failures"), ("error", "errors")
            ):
                if case.find(child) is not None:
                    summary[counter] += 1
                    ET.SubElement(safe, child, message="details omitted from disposable evidence")
    except (OSError, ET.ParseError, ValueError, LookupError) as error:
        problem = error
        summary["errors"] += 1
    for key, value in summary.items():
        suite.set(key, str(value))
    ET.ElementTree(output).write(path, encoding="utf-8", xml_declaration=True)
    if problem:
        raise ValueError("missing or invalid pytest report") from None
    return summary


class Executor:
    def __init__(self, repo, run, *, runner=run_process):
        self.repo, self.run, self.runner = Path(repo), Path(run), runner
        self.project = "worder-audit-" + self.run.name
        self.identity = None
        self.local_context_proven = False
        self.reap_failure = None
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
        if self.reap_failure is not None:
            raise self.reap_failure
        argv = [tool, *(str(argument) for argument in arguments)]
        try:
            result = self.runner(
                argv,
                cwd=self.repo,
                env=child_env(identity),
                input=stdin,
                timeout=timeout,
            )
        except ProcessReapFailure as error:
            self.reap_failure = error
            result = subprocess.CompletedProcess(argv, error.code, "", "")
        except OSError:
            result = subprocess.CompletedProcess(argv, 127, "", "")
        self.gate["commands"].append(argv)
        self.gate["exitCodes"].append(result.returncode)
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
        try:
            self.save()
            no_links(event_path)
            with event_path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(event) + "\n")
        except (Exception, KeyboardInterrupt):
            if self.reap_failure is not None:
                raise self.reap_failure from None
            if result.returncode:
                raise CommandFailure(result.returncode) from None
            raise
        if self.reap_failure is not None:
            raise self.reap_failure
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
        validate_dsn(DSN)
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

    def preflight(self):
        self.local_context_proven = False
        self.gate["stage"] = "preflight"
        version = self.command("supabase", "--version", timeout=30).stdout.strip()
        require(version == "2.111.0", "Supabase CLI version must be 2.111.0")
        for arguments, flags in [
            (("start", "--help"), ("--exclude", "--workdir")),
            (("db", "reset", "--help"), ("--local", "--no-seed", "--workdir")),
            (("migration", "up", "--help"), ("--local", "--workdir")),
            (("stop", "--help"), ("--no-backup", "--workdir")),
        ]:
            help_text = self.command("supabase", *arguments, timeout=30).stdout
            require(all(flag in help_text for flag in flags), "CLI flags do not match pin")
        context = self.command(
            "docker",
            "context",
            "inspect",
            "--format",
            "{{json .Endpoints.docker.Host}}",
            timeout=30,
        ).stdout.strip()
        endpoint = json.loads(context)
        require(
            endpoint
            in {
                "unix:///var/run/docker.sock",
                "npipe:////./pipe/docker_engine",
                "npipe:////./pipe/dockerDesktopLinuxEngine",
            },
            "non-local Docker context",
        )
        self.local_context_proven = True

    def prepare(self, through=None):
        self.preflight()
        source_config = self.repo / "supabase/config.toml"
        no_links(source_config)
        text = config_text(
            source_config.read_text(encoding="utf-8"),
            self.project,
            False,
            source=True,
        )
        source = inventory(self.repo / "supabase/migrations", through)
        folder = self.run / "supabase/migrations"
        folder.mkdir(parents=True)
        (self.run / "supabase/config.toml").write_text(
            text, encoding="utf-8", newline="\n"
        )
        for row in source:
            shutil.copyfile(
                self.repo / "supabase/migrations" / row["filename"],
                folder / row["filename"],
            )
        copied = inventory(folder)
        require(copied == source, "migration changed while copying")
        write_json(self.run / "manifest.json", copied)
        self.files()
        free_ports()
        existing = self.command(
            "docker",
            "ps",
            "-a",
            "--no-trunc",
            "--filter",
            "label=com.supabase.cli.project=" + self.project,
            "--format",
            "{{.ID}}",
            timeout=30,
        ).stdout.strip()
        require(not existing, "nonce already owns Docker containers")
        before = self.command(
            "docker", "volume", "ls", "--format", "{{.Name}}", timeout=30
        ).stdout.splitlines()
        write_json(self.run / "volumes-before.json", before)
        self.gate["stage"] = "start"
        self.local("start", "-x", EXCLUDED)
        self.gate["stage"] = "prepare-identity"
        self.identity = self.physical()
        write_json(
            self.run / "identity.json", identity_shape(self.identity, self.project)
        )
        self.gate["state"] = "prepared"
        self.save()

    def replay(self) -> None:
        require(self.gate["state"] == "prepared", "Replay requires prepared state")
        require(
            isinstance(self.identity, dict) and self.identity.get("sentinel") is None,
            "Replay requires prepared identity",
        )
        identity_shape(self.identity, self.project)
        self.gate.update(state="replaying", stage="replay-preflight")
        approved = self.files()
        self.physical()
        self.config(True)
        self.gate["stage"] = "reset"
        self.save()
        self.local("db", "reset", "--local", "--no-seed")
        self.gate["stage"] = "replay-identity"
        self.physical()
        require(self.files() == approved, "migration set changed after reset")
        sentinel = secrets.token_hex(32)
        require(re.fullmatch(TOKEN_RE, sentinel), "invalid sentinel")
        sql = (
            "begin;\ncreate schema if not exists testing;\n"
            "create table testing.disposable_identity(token text primary key);\n"
            "revoke all on schema testing from public, anon, authenticated, service_role, "
            "worker_role, sender_role;\n"
            "revoke all on testing.disposable_identity from public, anon, authenticated, "
            "service_role, worker_role, sender_role;\n"
            f"insert into testing.disposable_identity(token) values ('{sentinel}');\ncommit;"
        )
        self.psql(self.identity["containerId"], sql)
        self.identity["sentinel"] = sentinel
        self.proof()
        self.history(approved)
        write_json(
            self.run / "identity.json", identity_shape(self.identity, self.project)
        )
        self.gate["state"] = "ready"
        self.save()

    def upgrade(self, through=None) -> None:
        require(self.gate["state"] == "ready", "Upgrade requires ready state")
        require(
            isinstance(self.identity, dict) and self.identity.get("sentinel") is not None,
            "Upgrade requires ready identity",
        )
        identity_shape(self.identity, self.project)
        self.gate.update(state="upgrading", stage="upgrade-preflight")
        old = self.files()
        self.proof()
        self.history(old)
        if through:
            require(
                through >= old[-1]["version"],
                "migration limit precedes applied history",
            )
        new = prospective(
            old, inventory(self.repo / "supabase/migrations", through)
        )
        write_json(self.run / "manifest.prospective.json", new)
        if new != old:
            for row in new[len(old) :]:
                destination = self.run / "supabase/migrations" / row["filename"]
                no_links(destination)
                require(not destination.exists(), "new migration already exists")
                shutil.copyfile(
                    self.repo / "supabase/migrations" / row["filename"], destination
                )
            self.files(new)
            self.proof()
            self.history(old)
            self.gate["stage"] = "migration-up"
            self.save()
            self.local("migration", "up", "--local")
        self.gate["stage"] = "upgrade-verification"
        self.proof()
        self.files(new)
        self.history(new)
        write_json(self.run / "manifest.json", new)
        self.gate["state"] = "ready"
        self.save()

    def source(self, focal):
        approved = self.files()
        current = inventory(self.repo / "supabase/migrations")
        if focal:
            prospective(approved, current)
        else:
            require(
                approved == current, "full gate requires the complete current checkout manifest"
            )
        return approved

    def clean_commit(self, expected):
        actual = self.command("git", "rev-parse", "HEAD", timeout=30).stdout.strip()
        require(actual == expected, "checkout commit changed during gate")
        dirty = self.command(
            "git", "status", "--porcelain=v1", "--untracked-files=all", "--",
            "runtime", "scripts/test-disposable-db.ps1", "supabase/config.toml",
            "supabase/migrations", timeout=30,
        ).stdout.strip()
        require(not dirty, "full gate requires committed runtime and migration inputs")

    def pytest_command(self, arguments, stage):
        self.gate["stage"] = stage
        approved = self.source(self.gate["scope"] == "focal")
        if self.gate["scope"] == "full":
            self.clean_commit(self.gate["commit"])
        self.proof()
        self.history(approved)
        return self.command(
            "uv", "run", "--directory", self.repo / "runtime", "pytest",
            *arguments, identity=self.identity, check=False,
        )

    def suite(self, arguments, name):
        path = self.run / "artifacts" / (name + ".xml")
        no_links(path)
        path.parent.mkdir(exist_ok=True)
        summary, problem, result = None, None, None
        try:
            result = self.pytest_command([*arguments, "--junitxml=" + str(path)], name)
        finally:
            try:
                summary = sanitize_report(path, self.identity["sentinel"])
            except (Exception, KeyboardInterrupt) as error:
                problem = error
        if result.returncode:
            raise CommandFailure(result.returncode)
        if problem:
            raise problem
        require(
            summary["tests"] > 0
            and not any(summary[key] for key in ("skipped", "failures", "errors")),
            "pytest did not execute a clean nonempty suite",
        )
        return summary["tests"]

    def test(self, test_targets):
        self.gate.update(state="testing", scope="focal" if test_targets else "full", collectedRls=0)
        selected = targets(self.repo, test_targets)
        if selected:
            self.suite([*selected, "-q"], "focal")
            return
        result = self.pytest_command(["--collect-only", "-m", "rls", "-q"], "collect-rls")
        if result.returncode:
            raise CommandFailure(result.returncode)
        nodeids = [
            line.strip() for line in result.stdout.splitlines()
            if re.fullmatch(r"tests/db/[^\s:]+\.py::.+", line.strip())
        ]
        require(
            nodeids and len(set(nodeids)) == len(nodeids), "RLS collection is empty or ambiguous"
        )
        self.gate["collectedRls"] = len(nodeids)
        self.save()
        self.suite(["-m", "db and not rls"], "db")
        executed = self.suite(["-m", "rls"], "rls")
        require(executed == self.gate["collectedRls"], "collected and executed RLS counts differ")
        self.suite(["-m", "pipeline"], "pipeline")

    def stop(self):
        require(self.local_context_proven, "local Docker context proof unavailable")
        self.gate["stage"] = "stop"
        persisted = identity_shape(read_json(self.run / "identity.json"), self.project)
        if self.identity:
            require(
                all(persisted[key] == self.identity[key] for key in persisted if key != "sentinel"),
                "persisted cleanup identity changed",
            )
        self.identity = persisted
        self.physical()
        self.local("stop", "--no-backup")
        remaining = self.command(
            "docker", "ps", "-a", "--no-trunc", "--filter",
            "label=com.supabase.cli.project=" + self.project, "--format", "{{.ID}}", timeout=30,
        ).stdout.strip()
        volumes = self.command(
            "docker", "volume", "ls", "--format", "{{.Name}}", timeout=30,
        ).stdout.splitlines()
        require(
            not remaining and self.identity["volumeName"] not in volumes,
            "Stop did not remove the approved project",
        )
        self.gate["state"] = "stopped"
        self.save()

    def unproven(self):
        require(self.local_context_proven, "local Docker context proof unavailable")
        result = self.command(
            "docker", "ps", "-a", "--no-trunc", "--filter",
            "label=com.supabase.cli.project=" + self.project, "--format", "{{.ID}}",
            timeout=30, check=False,
        )
        ids = [
            value for value in result.stdout.splitlines() if re.fullmatch(r"[0-9a-f]{64}", value)
        ]
        write_json(self.run / "unproven.json", {"projectId": self.project, "containerIds": ids})
        self.gate["state"] = "unproven"

    def execute(self, action, test_targets=None, through=None):
        self.local_context_proven = False
        test_targets = [] if test_targets is None else test_targets
        require(
            isinstance(action, str) and action in {"Prepare", "Replay", "Upgrade", "Test", "Stop"},
            "invalid Action",
        )
        require(
            isinstance(test_targets, list)
            and all(isinstance(value, str) for value in test_targets),
            "invalid TestTargets",
        )
        require(not test_targets or action == "Test", "TestTargets only applies to Test")
        require(
            through is None or (isinstance(through, str) and re.fullmatch(r"[0-9]{14}", through)),
            "invalid MigrationThrough",
        )
        require(
            through is None or action in {"Prepare", "Upgrade"},
            "MigrationThrough only applies to Prepare or Upgrade",
        )
        self.run = safe_run(self.repo, self.run)
        self.project = "worder-audit-" + self.run.name
        root = self.run.parent
        no_links(root)
        root.mkdir(parents=True, exist_ok=True)
        lock = root / ".executor.lock"
        no_links(lock)
        handle = lock.open("x", encoding="utf-8")
        code, primary_error = 0, False
        try:
            with handle:
                handle.write(str(os.getpid()))
            if action == "Prepare":
                require(not self.run.exists(), "Prepare requires a new directory")
                self.run.mkdir()
            else:
                self.gate = gate_shape(read_json(self.run / "gates.json"))
                allowed = {
                    "Replay": {"prepared"}, "Upgrade": {"ready"}, "Test": {"ready"},
                    "Stop": {"prepared", "ready", "preparing", "replaying", "upgrading",
                             "testing", "failed", "stopped"},
                }
                require(self.gate["state"] in allowed[action], "invalid transition")
                if action == "Stop" and self.gate["state"] == "stopped":
                    return 0
            self.identity = None
            try:
                self.save()
                self.gate["stage"] = "preflight"
                if action != "Prepare":
                    self.identity = identity_shape(
                        read_json(self.run / "identity.json"), self.project
                    )
                    self.preflight()
                commit = self.command("git", "rev-parse", "HEAD", timeout=30).stdout.strip()
                require(re.fullmatch(r"[0-9a-f]{40}", commit), "invalid checkout commit")
                if action == "Test":
                    self.gate["scope"] = "focal" if test_targets else "full"
                    self.source(bool(test_targets))
                    if not test_targets:
                        self.clean_commit(commit)
                self.gate["commit"] = commit
                if action == "Prepare":
                    self.prepare(through)
                elif action == "Replay":
                    self.replay()
                elif action == "Upgrade":
                    self.upgrade(through)
                elif action == "Test":
                    self.test(test_targets)
                else:
                    self.stop()
            except (Exception, KeyboardInterrupt) as error:
                code = error.code if isinstance(error, CommandFailure) else (
                    130 if isinstance(error, KeyboardInterrupt) else 2
                )
                self.gate["failure"] = {
                    "stage": self.gate["stage"], "kind": type(error).__name__, "exitCode": code,
                }
                self.gate["state"] = "failed"
            finally:
                if (
                    self.reap_failure is None and self.local_context_proven
                    and action != "Stop" and (action == "Test" or code)
                ):
                    try:
                        if self.identity and (self.run / "identity.json").is_file():
                            self.stop()
                        else:
                            self.identity = None
                            self.unproven()
                    except (Exception, KeyboardInterrupt) as cleanup:
                        cleanup_code = cleanup.code if isinstance(cleanup, CommandFailure) else (
                            130 if isinstance(cleanup, KeyboardInterrupt) else 2
                        )
                        if not code:
                            code = cleanup_code
                            self.gate["failure"] = {
                                "stage": "stop", "kind": type(cleanup).__name__, "exitCode": code,
                            }
                        self.gate["state"] = "failed" if self.identity else "unproven"
                try:
                    self.save()
                except (Exception, KeyboardInterrupt):
                    if not code:
                        raise
            return code
        except BaseException:
            primary_error = True
            raise
        finally:
            try:
                if self.reap_failure is None:
                    no_links(lock)
                    lock.unlink()
            except (Exception, KeyboardInterrupt):
                if not code and not primary_error:
                    raise


def main():
    try:
        request = json.loads(sys.stdin.read())
        require(
            isinstance(request, dict) and set(request) == {
                "Action", "RunDirectory", "TestTargets", "MigrationThrough",
            },
            "invalid executor request",
        )
        require(isinstance(request["RunDirectory"], str), "invalid RunDirectory")
        repo = Path(__file__).resolve().parents[3]
        run = safe_run(repo, request["RunDirectory"])
        return Executor(repo, run).execute(
            request["Action"], request["TestTargets"], request["MigrationThrough"],
        )
    except (Exception, KeyboardInterrupt) as error:
        sys.stderr.write("disposable executor refused request; inspect local gates evidence\n")
        return error.code if isinstance(error, CommandFailure) else (
            130 if isinstance(error, KeyboardInterrupt) else 2
        )


if __name__ == "__main__":
    raise SystemExit(main())
