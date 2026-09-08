import copy
import json
import os
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from tests.support import disposable_executor as ex

REPO = Path(__file__).resolve().parents[3]
PROJECT = "worder-audit-" + "a" * 32


def test_config_changes_only_closed_fields():
    source = (REPO / "supabase/config.toml").read_text(encoding="utf-8")
    rendered = ex.config_text(source, PROJECT, False, source=True)
    assert f'project_id = "{PROJECT}"' in rendered
    assert "port = 55322" in rendered
    assert ex.tomllib.loads(rendered)["db"]["migrations"]["enabled"] is False
    assert ex.tomllib.loads(ex.config_text(rendered, PROJECT, True))["db"]["seed"][
        "enabled"
    ] is False


@pytest.mark.parametrize(
    "mutate",
    [
        lambda s: s.replace("port = 54322", "port = 54322\nport = 54323"),
        lambda s: s.replace("[db.migrations]", "[db.other]"),
        lambda s: s + "\n[db.seed]\nenabled = true\n",
        lambda s: s.replace("schema_paths = []", 'schema_paths = ["../outside.sql"]'),
    ],
)
def test_config_rejects_ambiguous_or_extra_sources(mutate):
    source = (REPO / "supabase/config.toml").read_text(encoding="utf-8")
    with pytest.raises((ValueError, ex.tomllib.TOMLDecodeError)):
        ex.config_text(mutate(source), PROJECT, False, source=True)


@pytest.mark.parametrize(
    ("original", "replacement"),
    [
        ("major_version = 17", "major_version = 17.0"),
        ("enabled = true", "enabled = 1"),
    ],
)
def test_config_rejects_equal_values_with_different_toml_types(original, replacement):
    source = (REPO / "supabase/config.toml").read_text(encoding="utf-8")
    with pytest.raises(ValueError):
        ex.config_text(source.replace(original, replacement, 1), PROJECT, False, source=True)


@pytest.mark.parametrize("enabled", [0, 1])
def test_config_requires_boolean_migrations_flag(enabled):
    source = (REPO / "supabase/config.toml").read_text(encoding="utf-8")
    with pytest.raises(ValueError):
        ex.config_text(source, PROJECT, enabled, source=True)


def test_inventory_hashes_migrations_in_ascii_filename_order(tmp_path):
    files = {
        "20250701_Z.sql": (
            b"select 1;\n",
            "4A45092CCF992EA92250053A80B931B787924BA61648F420555511B84F10AB6C",
        ),
        "20260812000002_a.sql": (
            b"select 2;\n",
            "AC4396CDEE0295DB27F816DC31134189999D0071663E618F4957BC23EDB584D7",
        ),
        "20260812000003_z.sql": (
            b"select 3;\n",
            "8B8A0860D9B183EFE119246B8D010F32B1030C93FA12275792B5847FD4FE929F",
        ),
    }
    for name, (content, _) in files.items():
        (tmp_path / name).write_bytes(content)

    rows = ex.inventory(tmp_path)

    assert rows == [
        {
            "filename": name,
            "version": name.split("_", 1)[0],
            "sha256": files[name][1],
        }
        for name in sorted(files)
    ]


def test_inventory_returns_only_through_existing_14_digit_version(tmp_path):
    for name in (
        "20260812000001_a.sql",
        "20260812000002_b.sql",
        "20260812000003_c.sql",
    ):
        (tmp_path / name).write_text(name, encoding="ascii")

    rows = ex.inventory(tmp_path, through="20260812000002")

    assert [row["version"] for row in rows] == ["20260812000001", "20260812000002"]
    with pytest.raises(ValueError):
        ex.inventory(tmp_path, through="20260812000004")


@pytest.mark.parametrize(
    "names",
    [
        [],
        ["README.md"],
        ["20260812000001_a.sql", "20260812000001_b.sql"],
    ],
)
def test_inventory_rejects_empty_unexpected_or_duplicate_entries(tmp_path, names):
    for name in names:
        (tmp_path / name).write_text("select 1;", encoding="ascii")
    with pytest.raises(ValueError):
        ex.inventory(tmp_path)


def test_prospective_is_suffix_only_and_does_not_mutate_approved():
    first = {
        "filename": "20260812000001_a.sql",
        "version": "20260812000001",
        "sha256": "A" * 64,
    }
    second = {
        "filename": "20260812000002_b.sql",
        "version": "20260812000002",
        "sha256": "B" * 64,
    }
    old = [first]
    result = ex.prospective(old, [first, second])
    assert result == [first, second]
    assert result is not old and result[0] is not first
    changed = copy.deepcopy(first)
    changed["sha256"] = "C" * 64
    for bad in ([changed, second], [second], []):
        with pytest.raises(ValueError):
            ex.prospective(old, bad)
    assert old == [first]


def test_safe_run_accepts_only_direct_nonce_child(tmp_path):
    root = tmp_path / ".superpowers/sdd/auditoria-ia-disposable"
    valid = root / ("a" * 32)
    assert ex.safe_run(tmp_path, valid) == valid
    for bad in (Path("relative"), root, root / ("g" * 32), root / ("a" * 32) / "nested"):
        with pytest.raises(ValueError):
            ex.safe_run(tmp_path, bad)


def test_safe_run_rejects_linked_run_root(tmp_path):
    repo = tmp_path / "repo"
    outside = tmp_path / "outside"
    outside.mkdir()
    root = repo / ".superpowers/sdd/auditoria-ia-disposable"
    root.parent.mkdir(parents=True)
    if os.name == "nt":
        import _winapi

        _winapi.CreateJunction(str(outside), str(root))
    else:
        root.symlink_to(outside, target_is_directory=True)

    with pytest.raises(ValueError, match="linked path refused"):
        ex.safe_run(repo, outside / ("a" * 32))


def test_json_round_trip_is_ascii_and_replaces_temp_file(tmp_path):
    path = tmp_path / "state.json"
    value = {"label": "ação", "rows": [1, 2]}

    ex.write_json(path, value)

    assert ex.read_json(path) == value
    assert path.read_bytes().endswith(b"\n")
    assert all(byte < 128 for byte in path.read_bytes())
    assert not path.with_name("state.json.tmp").exists()
    assert json.loads(path.read_text(encoding="utf-8")) == value


@pytest.mark.parametrize(
    "target",
    [
        "--collect-only",
        "tests/db/../unit/x.py",
        "tests/db/x.py\n--help",
        "tests/db/x.py::test_x;whoami",
        "tests/db/x.py::test_x$(whoami)",
    ],
)
def test_target_is_not_shell_or_pytest_options(target):
    with pytest.raises(ValueError):
        ex.targets(REPO, [target])


def test_targets_accept_existing_test_node_without_rewriting_it():
    values = ["tests/unit/test_disposable_db_guard.py::test_accepts_explicit_disposable_loopback"]
    assert ex.targets(REPO, values) == values


def container_record():
    return {
        "Id": "a" * 64,
        "Name": "/supabase_db_" + PROJECT,
        "Image": "sha256:" + "b" * 64,
        "State": {"Running": True},
        "Config": {
            "Image": "public.ecr.aws/supabase/postgres:17.6.1.054",
            "Labels": {"com.supabase.cli.project": PROJECT},
        },
        "NetworkSettings": {
            "Ports": {"5432/tcp": [{"HostPort": "55322", "HostIp": "127.0.0.1"}]}
        },
        "Mounts": [
            {
                "Type": "volume",
                "Destination": "/var/lib/postgresql/data",
                "Name": "supabase_db_" + PROJECT,
            }
        ],
    }


def valid_identity():
    return {
        "projectId": PROJECT,
        "containerId": "a" * 64,
        "imageId": "sha256:" + "b" * 64,
        "volumeName": "supabase_db_" + PROJECT,
        "port": 55322,
        "systemIdentifier": "123456",
        "sentinel": "c" * 64,
    }


def valid_gate():
    return {
        "commit": None,
        "scope": "setup",
        "state": "preparing",
        "commands": [],
        "exitCodes": [],
        "collectedRls": 0,
        "stage": "preflight",
        "failure": None,
    }


def executor_run(tmp_path):
    run = tmp_path / ("a" * 32)
    config = run / "supabase/config.toml"
    config.parent.mkdir(parents=True)
    source = (REPO / "supabase/config.toml").read_text(encoding="utf-8")
    config.write_text(ex.config_text(source, PROJECT, True, source=True), encoding="utf-8")
    return run


def test_run_process_missing_executable_returns_127_without_starting(monkeypatch):
    monkeypatch.setattr(ex.shutil, "which", lambda _: None)

    def unexpected_popen(*args, **kwargs):
        raise AssertionError("Popen must not be called")

    monkeypatch.setattr(ex.subprocess, "Popen", unexpected_popen)

    result = ex.run_process(["missing", "arg"], cwd=REPO, env={})

    assert result.args == ["missing", "arg"]
    assert result.returncode == 127
    assert result.stdout == result.stderr == ""


def test_run_process_success_preserves_process_contract(monkeypatch, tmp_path):
    observed = {}

    class Process:
        returncode = 0

        def communicate(self, *, input, timeout):
            observed["communicate"] = (input, timeout)
            return "out", "err"

        def wait(self):
            observed["waited"] = True

    def popen(argv, **kwargs):
        observed["argv"] = argv
        observed["kwargs"] = kwargs
        return Process()

    executable = str(tmp_path / "tool.exe")
    def which(name):
        observed["which"] = name
        return executable

    monkeypatch.setattr(ex.shutil, "which", which)
    monkeypatch.setattr(ex.subprocess, "Popen", popen)
    env = {"PATH": "safe"}

    result = ex.run_process(
        ["tool", "--flag"], cwd=tmp_path, env=env, input="sql", timeout=17
    )

    assert result.args == ["tool", "--flag"]
    assert (result.returncode, result.stdout, result.stderr) == (0, "out", "err")
    assert observed["argv"] == [executable, "--flag"]
    assert observed["which"] == ("tool.exe" if os.name == "nt" else "tool")
    assert observed["communicate"] == ("sql", 17)
    assert observed["waited"] is True
    assert observed["kwargs"] == {
        "cwd": tmp_path,
        "env": env,
        "shell": False,
        "stdin": ex.subprocess.PIPE,
        "stdout": ex.subprocess.PIPE,
        "stderr": ex.subprocess.PIPE,
        "text": True,
        "encoding": "utf-8",
        "errors": "replace",
        "start_new_session": os.name != "nt",
        "creationflags": ex.subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
    }


def test_run_process_rejects_script_shim_without_starting(monkeypatch):
    monkeypatch.setattr(ex.shutil, "which", lambda _: "C:/bin/tool.cmd")
    monkeypatch.setattr(
        ex.subprocess,
        "Popen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("Popen called")),
    )
    assert ex.run_process(["tool"], cwd=REPO, env={}).returncode == 127


def test_run_process_normalizes_signal_return_code(monkeypatch):
    class Process:
        returncode = -9

        def communicate(self, *, input, timeout):
            return "", ""

        def wait(self):
            return None

    monkeypatch.setattr(ex.shutil, "which", lambda _: "C:/bin/tool.exe")
    monkeypatch.setattr(ex.subprocess, "Popen", lambda *_args, **_kwargs: Process())

    assert ex.run_process(["tool"], cwd=REPO, env={}).returncode == 137


@pytest.mark.skipif(os.name != "nt", reason="Windows taskkill fallback")
@pytest.mark.parametrize(
    ("initial_error", "helper_error", "expected_code"),
    [
        (ex.subprocess.TimeoutExpired("tool", 1), OSError("taskkill missing"), 124),
        (
            KeyboardInterrupt(),
            ex.subprocess.TimeoutExpired("taskkill", 30),
            130,
        ),
    ],
)
def test_run_process_reaps_after_windows_taskkill_failure(
    monkeypatch, initial_error, helper_error, expected_code
):
    events = []

    class Process:
        pid = 321

        def communicate(self, *, input=None, timeout=None):
            events.append(("communicate", input, timeout))
            if len(events) == 1:
                raise initial_error
            return "after", "cleanup"

        def kill(self):
            events.append(("kill",))

        def wait(self):
            events.append(("wait",))

    def taskkill(argv, **kwargs):
        events.append(("taskkill", argv, kwargs))
        raise helper_error

    monkeypatch.setattr(ex.shutil, "which", lambda _: "C:/bin/tool.exe")
    monkeypatch.setattr(ex.subprocess, "Popen", lambda *_args, **_kwargs: Process())
    monkeypatch.setattr(ex.subprocess, "run", taskkill)

    result = ex.run_process(["tool"], cwd=REPO, env={}, input="sql", timeout=1)

    assert (result.returncode, result.stdout, result.stderr) == (
        expected_code,
        "after",
        "cleanup",
    )
    assert events == [
        ("communicate", "sql", 1),
        (
            "taskkill",
            ["taskkill.exe", "/PID", "321", "/T", "/F"],
            {"capture_output": True, "check": False, "timeout": 30, "shell": False},
        ),
        ("kill",),
        ("communicate", None, None),
        ("wait",),
    ]


def test_child_env_is_allowlisted_and_does_not_mutate_parent(monkeypatch):
    parent = {
        "Path": "bin",
        "TEMP": "temp",
        "PGHOSTADDR": "remote",
        "SUPABASE_WORKDIR": "unsafe",
        "PYTEST_ADDOPTS": "--pdb",
        "OPENAI_API_KEY": "secret",
    }
    before = parent.copy()
    monkeypatch.setattr(ex.os, "environ", parent)

    child = ex.child_env(valid_identity())

    assert parent == before
    assert child == {
        "Path": "bin",
        "TEMP": "temp",
        "PYTHONUTF8": "1",
        "NO_COLOR": "1",
        "SUPABASE_DB_URL": ex.DSN,
        "WORDER_TEST_DB_SYSTEM_IDENTIFIER": "123456",
        "WORDER_TEST_DB_SENTINEL": "c" * 64,
    }
    assert ex.child_env() == {
        "Path": "bin",
        "TEMP": "temp",
        "PYTHONUTF8": "1",
        "NO_COLOR": "1",
    }


@pytest.mark.parametrize(
    "mutation",
    [
        lambda d: d.update(Id="short"),
        lambda d: d.update(Name="/another"),
        lambda d: d["State"].update(Running=False),
        lambda d: d["Config"]["Labels"].update({"com.supabase.cli.project": "existing"}),
        lambda d: d["Config"].update(Image="postgres:17"),
        lambda d: d.update(Image="sha256:short"),
        lambda d: d["NetworkSettings"]["Ports"]["5432/tcp"][0].update(HostPort="54322"),
        lambda d: d["NetworkSettings"]["Ports"]["5432/tcp"][0].update(HostIp="10.0.0.1"),
        lambda d: d["NetworkSettings"]["Ports"]["5432/tcp"].append(
            {"HostPort": "55322", "HostIp": "::"}
        ),
        lambda d: d["Mounts"][0].update(Type="bind"),
        lambda d: d["Mounts"][0].update(Destination="/elsewhere"),
        lambda d: d["Mounts"].append(copy.deepcopy(d["Mounts"][0])),
    ],
)
def test_each_physical_identity_guard_rejects(mutation):
    data = container_record()
    mutation(data)
    with pytest.raises(ValueError):
        ex.inspect_record([data], PROJECT, [])


def test_existing_volume_and_replaced_container_are_rejected():
    data = container_record()
    with pytest.raises(ValueError):
        ex.inspect_record([data], PROJECT, [data["Mounts"][0]["Name"]])
    identity = ex.inspect_record([data], PROJECT, [])
    data["Id"] = "c" * 64
    with pytest.raises(ValueError):
        ex.inspect_record([data], PROJECT, [], identity)
    with pytest.raises(ValueError):
        ex.inspect_record([container_record()], PROJECT, [], {})


@pytest.mark.parametrize(
    "data",
    [
        {},
        [],
        [container_record(), container_record()],
        [{"Name": "/supabase_db_" + PROJECT}],
    ],
)
def test_inspect_record_rejects_malformed_container_data(data):
    with pytest.raises(ValueError):
        ex.inspect_record(data, PROJECT, [])


@pytest.mark.parametrize(
    "mutation",
    [
        lambda d: d.update(extra="value"),
        lambda d: d.update(projectId=1),
        lambda d: d.update(containerId=True),
        lambda d: d.update(imageId=None),
        lambda d: d.update(volumeName="bad/name"),
        lambda d: d.update(port=True),
        lambda d: d.update(systemIdentifier=123456),
        lambda d: d.update(sentinel="short"),
    ],
)
def test_identity_shape_rejects_wrong_schema_or_exact_types(mutation):
    identity = valid_identity()
    mutation(identity)
    with pytest.raises(ValueError):
        ex.identity_shape(identity, PROJECT)


def test_identity_shape_rejects_dsn_even_when_project_matches():
    identity = valid_identity()
    identity["projectId"] = ex.DSN
    with pytest.raises(ValueError, match="DSN"):
        ex.identity_shape(identity, ex.DSN)


def test_identity_shape_accepts_exact_identity_with_optional_sentinel():
    identity = valid_identity()
    assert ex.identity_shape(identity, PROJECT) is identity
    identity["sentinel"] = None
    assert ex.identity_shape(identity, PROJECT) is identity


@pytest.mark.parametrize(
    "mutation",
    [
        lambda d: d.update(extra="value"),
        lambda d: d.update(commit=True),
        lambda d: d.update(scope=1),
        lambda d: d.update(state=None),
        lambda d: d.update(state=[]),
        lambda d: d.update(commands="git"),
        lambda d: d.update(commands=[["git"], []], exitCodes=[0, 0]),
        lambda d: d.update(exitCodes=[False], commands=[["git"]]),
        lambda d: d.update(collectedRls=True),
        lambda d: d.update(stage=1),
        lambda d: d.update(failure={"stage": "x", "kind": "y", "exitCode": False}),
        lambda d: d.update(stage=ex.DSN),
    ],
)
def test_gate_shape_rejects_wrong_schema_types_or_dsn(mutation):
    gate = valid_gate()
    mutation(gate)
    with pytest.raises(ValueError):
        ex.gate_shape(gate)


@pytest.mark.parametrize("state", ["prepared", "ready"])
def test_gate_cannot_claim_proven_state_without_commit(state):
    gate = valid_gate()
    gate["state"] = state
    with pytest.raises(ValueError, match="commit"):
        ex.gate_shape(gate)


def test_gate_serialization_has_no_process_output_or_dsn(tmp_path):
    def runner(argv, **kwargs):
        return ex.subprocess.CompletedProcess(
            argv,
            0,
            "ok SQLSTATE: 23505 20260812000001_first.sql " + ex.DSN,
            "20250701_second.sql",
        )

    executor = ex.Executor(REPO, tmp_path, runner=runner)
    executor.command("git", "rev-parse", "HEAD")

    saved = json.loads((tmp_path / "gates.json").read_text())
    event = json.loads((tmp_path / "events.jsonl").read_text())
    assert len(saved["commands"]) == len(saved["exitCodes"]) == 1
    assert set(saved) == {
        "commit",
        "scope",
        "state",
        "commands",
        "exitCodes",
        "collectedRls",
        "stage",
        "failure",
    }
    assert event == {
        "stage": "preflight",
        "exitCode": 0,
        "sqlstates": ["23505"],
        "migrations": ["20250701", "20260812000001"],
    }
    evidence = (tmp_path / "gates.json").read_text() + (tmp_path / "events.jsonl").read_text()
    assert ex.DSN not in evidence
    assert "stdout" not in evidence and "stderr" not in evidence


def test_command_records_oserror_and_nonchecking_failures(tmp_path):
    outcomes = iter(
        [OSError("missing"), ex.subprocess.CompletedProcess(["tool"], 9, "", "")]
    )

    def runner(argv, **kwargs):
        outcome = next(outcomes)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    executor = ex.Executor(REPO, tmp_path, runner=runner)
    with pytest.raises(ex.CommandFailure) as error:
        executor.command("tool")
    assert error.value.code == 127
    assert executor.command("tool", check=False).returncode == 9
    assert executor.gate["exitCodes"] == [127, 9]


def test_local_and_psql_build_only_fixed_commands(tmp_path):
    calls = []

    def runner(argv, **kwargs):
        calls.append((argv, kwargs))
        stdout = "2.111.0\n" if argv == ["supabase", "--version"] else " result \n"
        return ex.subprocess.CompletedProcess(argv, 0, stdout, "")

    executor = ex.Executor(REPO, tmp_path, runner=runner)
    executor.local("start", "--exclude", ex.EXCLUDED)
    result = executor.psql("a" * 64, "select 1")

    assert calls[1][0] == [
        "supabase",
        "start",
        "--exclude",
        ex.EXCLUDED,
        "--workdir",
        str(tmp_path),
    ]
    assert calls[2][0] == [
        "docker",
        "exec",
        "-i",
        "a" * 64,
        "psql",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-At",
    ]
    assert calls[2][1]["input"] == "select 1\n"
    assert calls[2][1]["timeout"] == 30
    assert ex.DSN not in calls[2][0]
    assert result == "result"


def test_local_rejects_changed_cli_version(tmp_path):
    def runner(argv, **kwargs):
        return ex.subprocess.CompletedProcess(argv, 0, "2.112.0\n", "")

    with pytest.raises(ValueError, match="version changed"):
        ex.Executor(REPO, tmp_path, runner=runner).local("start")


def test_config_and_files_reject_unapproved_inputs_and_changed_migrations(tmp_path):
    run = executor_run(tmp_path)
    executor = ex.Executor(REPO, run, runner=lambda *_args, **_kwargs: None)
    migration = run / "supabase/migrations/20260812000001_one.sql"
    migration.parent.mkdir()
    migration.write_text("select 1;\n", encoding="ascii")
    rows = ex.inventory(migration.parent)
    ex.write_json(run / "manifest.json", rows)

    executor.config(False)
    assert ex.tomllib.loads((run / "supabase/config.toml").read_text())["db"]["migrations"][
        "enabled"
    ] is False
    assert executor.files() == rows
    migration.write_text("select 2;\n", encoding="ascii")
    with pytest.raises(ValueError, match="copied migration changed"):
        executor.files(rows)
    (run / ".env").write_text("SECRET=value", encoding="ascii")
    with pytest.raises(ValueError, match="unexpected project input"):
        executor.config()


def test_physical_uses_inspect_psql_and_loopback_identity_double(tmp_path, monkeypatch):
    run = executor_run(tmp_path)
    ex.write_json(run / "volumes-before.json", [])
    calls = []

    def runner(argv, **kwargs):
        calls.append((argv, kwargs))
        stdout = (
            json.dumps([container_record()])
            if argv[:2] == ["docker", "inspect"]
            else "123456\n"
        )
        return ex.subprocess.CompletedProcess(argv, 0, stdout, "")

    monkeypatch.setattr(ex, "read_system_identifier", lambda dsn: "123456")
    executor = ex.Executor(REPO, run, runner=runner)

    identity = executor.physical()

    assert identity == valid_identity() | {"sentinel": None}
    assert calls[0][0] == ["docker", "inspect", "supabase_db_" + PROJECT]
    assert calls[1][1]["input"] == ex.SID_SQL + "\n"

    executor.identity = valid_identity()
    assert executor.physical()["systemIdentifier"] == "123456"
    assert calls[2][0] == ["docker", "inspect", "a" * 64]


def test_physical_rejects_invalid_inventory_and_loopback_mismatch(tmp_path, monkeypatch):
    run = executor_run(tmp_path)
    ex.write_json(run / "volumes-before.json", [1])
    executor = ex.Executor(REPO, run, runner=lambda *_args, **_kwargs: None)
    with pytest.raises(ValueError, match="invalid volume inventory"):
        executor.physical()

    ex.write_json(run / "volumes-before.json", [])

    def runner(argv, **kwargs):
        stdout = (
            json.dumps([container_record()])
            if argv[:2] == ["docker", "inspect"]
            else "123456\n"
        )
        return ex.subprocess.CompletedProcess(argv, 0, stdout, "")

    executor.runner = runner
    monkeypatch.setattr(ex, "read_system_identifier", lambda dsn: "654321")
    with pytest.raises(ValueError, match="loopback identity mismatch"):
        executor.physical()


def test_physical_refuses_ambient_libpq_routing_without_connecting(tmp_path, monkeypatch):
    run = executor_run(tmp_path)
    ex.write_json(run / "volumes-before.json", [])

    def runner(argv, **kwargs):
        stdout = (
            json.dumps([container_record()])
            if argv[:2] == ["docker", "inspect"]
            else "123456\n"
        )
        return ex.subprocess.CompletedProcess(argv, 0, stdout, "")

    connections = []
    monkeypatch.setenv("PGHOSTADDR", "203.0.113.10")
    monkeypatch.setattr(ex.psycopg, "connect", lambda *args, **kwargs: connections.append(args))

    with pytest.raises(ValueError, match="ambient libpq routing"):
        ex.Executor(REPO, run, runner=runner).physical()

    assert connections == []
    assert os.environ["PGHOSTADDR"] == "203.0.113.10"


def test_proof_refuses_ambient_libpq_routing_before_its_connection(tmp_path, monkeypatch):
    run = executor_run(tmp_path)
    ex.write_json(run / "volumes-before.json", [])

    def runner(argv, **kwargs):
        stdout = (
            json.dumps([container_record()])
            if argv[:2] == ["docker", "inspect"]
            else "123456\n"
        )
        return ex.subprocess.CompletedProcess(argv, 0, stdout, "")

    class Context:
        def __enter__(self):
            return object()

        def __exit__(self, *exc):
            return None

    connections = []

    def connect(*args, **kwargs):
        connections.append((args, kwargs))
        return Context()

    executor = ex.Executor(REPO, run, runner=runner)
    executor.identity = valid_identity()
    monkeypatch.setenv("PGHOSTADDR", "203.0.113.10")
    monkeypatch.setattr(ex, "read_system_identifier", lambda dsn: "123456")
    monkeypatch.setattr(ex.psycopg, "connect", connect)
    monkeypatch.setattr(ex, "assert_database_identity", lambda *args, **kwargs: None)

    with pytest.raises(ValueError, match="ambient libpq routing"):
        executor.proof()

    assert connections == []
    assert os.environ["PGHOSTADDR"] == "203.0.113.10"


def test_proof_uses_bounded_psycopg_context_and_identity_assertion(tmp_path, monkeypatch):
    run = executor_run(tmp_path)
    ex.write_json(run / "volumes-before.json", [])
    executor = ex.Executor(REPO, run, runner=lambda *_args, **_kwargs: None)
    with pytest.raises(ValueError, match="sentinel proof unavailable"):
        executor.proof()

    executor.identity = valid_identity()
    observed = {}
    connection = object()

    def runner(argv, **kwargs):
        stdout = (
            json.dumps([container_record()])
            if argv[:2] == ["docker", "inspect"]
            else "123456\n"
        )
        return ex.subprocess.CompletedProcess(argv, 0, stdout, "")

    class Context:
        def __enter__(self):
            observed["entered"] = True
            return connection

        def __exit__(self, *exc):
            observed["exited"] = True

    def connect(*args, **kwargs):
        observed["connect"] = (args, kwargs)
        return Context()

    def assert_identity(conn, **kwargs):
        observed["assert"] = (conn, kwargs)

    monkeypatch.setattr(ex.psycopg, "connect", connect)
    monkeypatch.setattr(ex, "assert_database_identity", assert_identity)
    monkeypatch.setattr(ex, "read_system_identifier", lambda dsn: "123456")
    executor.runner = runner

    executor.proof()

    assert observed == {
        "entered": True,
        "exited": True,
        "connect": ((ex.DSN,), {"connect_timeout": 3, "options": "-c statement_timeout=3000"}),
        "assert": (
            connection,
            {"system_identifier": "123456", "sentinel": "c" * 64},
        ),
    }


def test_history_requires_exact_versions(tmp_path):
    def runner(argv, **kwargs):
        return ex.subprocess.CompletedProcess(argv, 0, "20250701\n20260812000001", "")

    executor = ex.Executor(REPO, tmp_path, runner=runner)
    executor.identity = valid_identity()
    expected = [{"version": "20250701"}, {"version": "20260812000001"}]

    executor.history(expected)
    for output in (
        "",
        "20250701",
        "20250701\n20260812000001\n20260812000002",
        "20250701\n20250701\n20260812000001",
    ):
        executor.psql = lambda *_args, value=output: value
        with pytest.raises(ValueError, match="migration history mismatch"):
            executor.history(expected)


def test_replay_requires_prepared_without_calling_external_tools(tmp_path):
    executor = ex.Executor(
        REPO,
        tmp_path,
        runner=lambda *_args, **_kwargs: pytest.fail("unexpected CLI"),
    )
    executor.gate["state"] = "ready"

    with pytest.raises(ValueError, match="requires prepared"):
        executor.replay()


@pytest.mark.parametrize("identity", [None, valid_identity()])
def test_replay_requires_prepared_identity_without_calling_external_tools(
    tmp_path, identity
):
    executor = ex.Executor(
        REPO,
        tmp_path,
        runner=lambda *_args, **_kwargs: pytest.fail("unexpected CLI"),
    )
    executor.gate.update(commit="d" * 40, state="prepared")
    executor.identity = identity

    with pytest.raises(ValueError, match="requires prepared identity"):
        executor.replay()


def test_replay_does_not_reset_if_physical_proof_fails(monkeypatch, tmp_path):
    run = executor_run(tmp_path)
    executor = ex.Executor(
        REPO,
        run,
        runner=lambda *_args, **_kwargs: pytest.fail("unexpected CLI"),
    )
    executor.gate.update(commit="d" * 40, state="prepared")
    executor.identity = valid_identity()
    executor.identity["sentinel"] = None
    monkeypatch.setattr(executor, "files", lambda: [])

    def fail():
        raise ValueError("loopback identity mismatch")

    monkeypatch.setattr(executor, "physical", fail)

    with pytest.raises(ValueError, match="identity mismatch"):
        executor.replay()

    assert executor.gate["commands"] == []


def test_replay_rejects_changed_files_after_reset_before_sentinel(monkeypatch, tmp_path):
    run = executor_run(tmp_path)
    executor = ex.Executor(REPO, run)
    executor.gate.update(commit="d" * 40, state="prepared")
    executor.identity = valid_identity()
    executor.identity["sentinel"] = None
    approved = [{"version": "20260812000001"}]
    observed = iter((approved, [{"version": "20260812000002"}]))
    calls = []

    def runner(argv, **kwargs):
        calls.append(argv)
        if argv == ["supabase", "--version"]:
            stdout = "2.111.0\n"
        elif argv[:3] == ["supabase", "db", "reset"]:
            stdout = ""
        else:
            pytest.fail(f"unexpected CLI: {argv}")
        return ex.subprocess.CompletedProcess(argv, 0, stdout, "")

    monkeypatch.setattr(executor, "files", lambda: next(observed))
    monkeypatch.setattr(executor, "physical", lambda: None)
    executor.runner = runner

    with pytest.raises(ValueError, match="migration set changed after reset"):
        executor.replay()

    assert calls == [
        ["supabase", "--version"],
        [
            "supabase",
            "db",
            "reset",
            "--local",
            "--no-seed",
            "--workdir",
            str(run),
        ],
    ]


def test_replay_proves_reset_sentinel_history_before_ready(monkeypatch, tmp_path):
    run = executor_run(tmp_path)
    executor = ex.Executor(REPO, run)
    executor.gate.update(commit="d" * 40, state="prepared")
    executor.identity = valid_identity()
    executor.identity["sentinel"] = None
    prepared = copy.deepcopy(executor.identity)
    approved = [
        {
            "filename": "20260812000001_one.sql",
            "version": "20260812000001",
            "sha256": "A" * 64,
        }
    ]
    ex.write_json(run / "identity.json", executor.identity)
    executor.save()
    events = []
    calls = []
    token_sizes = []
    fixed_sentinel = "d" * 64

    def files():
        events.append("files")
        return approved

    def physical():
        events.append("physical")
        return copy.deepcopy(prepared)

    def token_hex(size):
        token_sizes.append(size)
        return fixed_sentinel

    def proof():
        events.append("proof")
        assert ex.read_json(run / "identity.json")["sentinel"] is None
        assert ex.read_json(run / "gates.json")["state"] == "replaying"

    def history(expected):
        events.append("history")
        assert expected == approved
        assert ex.read_json(run / "identity.json")["sentinel"] is None
        assert ex.read_json(run / "gates.json")["state"] == "replaying"

    def runner(argv, **kwargs):
        calls.append((argv, kwargs))
        if argv == ["supabase", "--version"]:
            stdout = "2.111.0\n"
        elif argv[:3] == ["supabase", "db", "reset"]:
            events.append("reset")
            persisted = ex.read_json(run / "gates.json")
            assert (persisted["state"], persisted["stage"]) == (
                "replaying",
                "reset",
            )
            assert ex.tomllib.loads((run / "supabase/config.toml").read_text())[
                "db"
            ]["migrations"]["enabled"] is True
            stdout = ""
        elif argv[:2] == ["docker", "exec"]:
            events.append("sentinel")
            assert ex.read_json(run / "identity.json")["sentinel"] is None
            stdout = ""
        else:
            pytest.fail(f"unexpected CLI: {argv}")
        return ex.subprocess.CompletedProcess(argv, 0, stdout, "")

    monkeypatch.setattr(executor, "files", files)
    monkeypatch.setattr(executor, "physical", physical)
    monkeypatch.setattr(executor, "proof", proof)
    monkeypatch.setattr(executor, "history", history)
    monkeypatch.setattr(ex.secrets, "token_hex", token_hex)
    executor.runner = runner

    executor.replay()

    assert token_sizes == [32]
    assert events == [
        "files",
        "physical",
        "reset",
        "physical",
        "files",
        "sentinel",
        "proof",
        "history",
    ]
    assert [call[0] for call in calls] == [
        ["supabase", "--version"],
        [
            "supabase",
            "db",
            "reset",
            "--local",
            "--no-seed",
            "--workdir",
            str(run),
        ],
        [
            "docker",
            "exec",
            "-i",
            "a" * 64,
            "psql",
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-At",
        ],
    ]
    assert calls[2][1]["input"] == (
        "begin;\ncreate schema if not exists testing;\n"
        "create table testing.disposable_identity(token text primary key);\n"
        "revoke all on schema testing from public, anon, authenticated, service_role, "
        "worker_role, sender_role;\n"
        "revoke all on testing.disposable_identity from public, anon, authenticated, "
        "service_role, worker_role, sender_role;\n"
        f"insert into testing.disposable_identity(token) values ('{fixed_sentinel}');\n"
        "commit;\n"
    )
    persisted = ex.read_json(run / "identity.json")
    assert persisted | {"sentinel": None} == prepared
    assert persisted["sentinel"] == fixed_sentinel
    assert ex.read_json(run / "gates.json")["state"] == "ready"


@pytest.mark.parametrize("failing_step", ["proof", "history"])
def test_replay_verification_failure_does_not_persist_identity_or_ready(
    monkeypatch, tmp_path, failing_step
):
    run = executor_run(tmp_path)
    executor = ex.Executor(REPO, run)
    executor.gate.update(commit="d" * 40, state="prepared")
    executor.identity = valid_identity()
    executor.identity["sentinel"] = None
    prepared = copy.deepcopy(executor.identity)
    approved = [
        {
            "filename": "20260812000001_one.sql",
            "version": "20260812000001",
            "sha256": "A" * 64,
        }
    ]
    ex.write_json(run / "identity.json", prepared)
    executor.save()

    def runner(argv, **kwargs):
        if argv == ["supabase", "--version"]:
            stdout = "2.111.0\n"
        elif argv == [
            "supabase",
            "db",
            "reset",
            "--local",
            "--no-seed",
            "--workdir",
            str(run),
        ] or argv[:2] == ["docker", "exec"]:
            stdout = ""
        else:
            pytest.fail(f"unexpected CLI: {argv}")
        return ex.subprocess.CompletedProcess(argv, 0, stdout, "")

    def verify(step):
        if step == failing_step:
            raise RuntimeError(f"{step} failed")

    monkeypatch.setattr(executor, "files", lambda: approved)
    monkeypatch.setattr(executor, "physical", lambda: None)
    monkeypatch.setattr(executor, "proof", lambda: verify("proof"))
    monkeypatch.setattr(executor, "history", lambda _expected: verify("history"))
    monkeypatch.setattr(ex.secrets, "token_hex", lambda _size: "d" * 64)
    executor.runner = runner

    with pytest.raises(RuntimeError, match=f"{failing_step} failed"):
        executor.replay()

    assert ex.read_json(run / "identity.json") == prepared
    assert ex.read_json(run / "gates.json")["state"] == "replaying"


def preflight_double(overrides=None):
    calls = []
    outputs = {
        ("supabase", "--version"): "2.111.0\n",
        ("supabase", "start", "--help"): "--exclude --workdir",
        ("supabase", "db", "reset", "--help"): "--local --no-seed --workdir",
        ("supabase", "migration", "up", "--help"): "--local --workdir",
        ("supabase", "stop", "--help"): "--no-backup --workdir",
        (
            "docker",
            "context",
            "inspect",
            "--format",
            "{{json .Endpoints.docker.Host}}",
        ): json.dumps("npipe:////./pipe/docker_engine"),
    }
    outputs.update(overrides or {})

    def runner(argv, **kwargs):
        calls.append(argv)
        return ex.subprocess.CompletedProcess(argv, 0, outputs[tuple(argv)], "")

    return calls, runner


def test_preflight_rejects_wrong_cli_before_start(tmp_path):
    calls, runner = preflight_double({("supabase", "--version"): "9.9.9"})

    executor = ex.Executor(REPO, tmp_path, runner=runner)

    with pytest.raises(ValueError, match="CLI version"):
        executor.preflight()

    assert calls == [["supabase", "--version"]]


@pytest.mark.parametrize(
    ("command", "help_text"),
    [
        (("supabase", "start", "--help"), "--workdir"),
        (("supabase", "start", "--help"), "--exclude"),
        (("supabase", "db", "reset", "--help"), "--no-seed --workdir"),
        (("supabase", "db", "reset", "--help"), "--local --workdir"),
        (("supabase", "db", "reset", "--help"), "--local --no-seed"),
        (("supabase", "migration", "up", "--help"), "--workdir"),
        (("supabase", "migration", "up", "--help"), "--local"),
        (("supabase", "stop", "--help"), "--workdir"),
        (("supabase", "stop", "--help"), "--no-backup"),
    ],
)
def test_preflight_rejects_each_missing_cli_flag_before_start(
    tmp_path, command, help_text
):
    calls, runner = preflight_double({command: help_text})

    with pytest.raises(ValueError, match="CLI flags"):
        ex.Executor(REPO, tmp_path, runner=runner).preflight()

    assert calls[-1] == list(command)


@pytest.mark.parametrize(
    "endpoint",
    [
        "unix:///var/run/docker.sock",
        "npipe:////./pipe/docker_engine",
        "npipe:////./pipe/dockerDesktopLinuxEngine",
    ],
)
def test_preflight_accepts_each_local_docker_endpoint(tmp_path, endpoint):
    command = (
        "docker",
        "context",
        "inspect",
        "--format",
        "{{json .Endpoints.docker.Host}}",
    )
    calls, runner = preflight_double({command: json.dumps(endpoint)})

    ex.Executor(REPO, tmp_path, runner=runner).preflight()

    assert calls[-1] == list(command)


def test_preflight_rejects_nonlocal_docker_endpoint(tmp_path):
    command = (
        "docker",
        "context",
        "inspect",
        "--format",
        "{{json .Endpoints.docker.Host}}",
    )
    calls, runner = preflight_double({command: json.dumps("tcp://192.0.2.1:2375")})

    with pytest.raises(ValueError, match="non-local Docker context"):
        ex.Executor(REPO, tmp_path, runner=runner).preflight()

    assert calls[-1] == list(command)


def test_free_ports_binds_and_closes_all_disposable_listeners(monkeypatch):
    listeners = [MagicMock() for _ in range(3)]
    sockets = iter(listeners)
    monkeypatch.setattr(ex.socket, "socket", lambda *_args: next(sockets))

    ex.free_ports()

    assert [listener.bind.call_args.args[0] for listener in listeners] == [
        ("0.0.0.0", 55320),
        ("0.0.0.0", 55321),
        ("0.0.0.0", 55322),
    ]
    for listener in listeners:
        listener.close.assert_called_once_with()
        if os.name == "nt":
            listener.setsockopt.assert_called_once_with(
                ex.socket.SOL_SOCKET, ex.socket.SO_EXCLUSIVEADDRUSE, 1
            )
        else:
            listener.setsockopt.assert_not_called()


def test_busy_port_is_refused_and_open_listener_is_closed(monkeypatch):
    first = MagicMock()
    second = MagicMock()
    second.bind.side_effect = OSError("in use")
    sockets = iter((first, second))
    monkeypatch.setattr(ex.socket, "socket", lambda *_args: next(sockets))

    with pytest.raises(ValueError, match="disposable port occupied"):
        ex.free_ports()

    first.close.assert_called_once_with()
    second.close.assert_called_once_with()


def test_prepare_copies_only_approved_inputs_before_guarded_start(
    monkeypatch, tmp_path
):
    repo = tmp_path / "repo"
    source = repo / "supabase"
    migrations = source / "migrations"
    migrations.mkdir(parents=True)
    source_config = (REPO / "supabase/config.toml").read_text(encoding="utf-8")
    (source / "config.toml").write_text(source_config, encoding="utf-8")
    migration = migrations / "20260812000001_one.sql"
    migration.write_text("select 1;\n", encoding="ascii")
    (repo / ".env").write_text("SECRET=remote\n", encoding="ascii")
    (source / "seed.sql").write_text("select 'forbidden';\n", encoding="ascii")

    run = tmp_path / ("a" * 32)
    run.mkdir()
    events = []
    copied = []
    real_copyfile = ex.shutil.copyfile
    real_read_text = Path.read_text
    real_read_bytes = Path.read_bytes

    def copyfile(source_path, destination_path):
        copied.append((Path(source_path), Path(destination_path)))
        return real_copyfile(source_path, destination_path)

    def guarded_read_text(path, *args, **kwargs):
        assert Path(path) not in {repo / ".env", source / "seed.sql"}
        return real_read_text(path, *args, **kwargs)

    def guarded_read_bytes(path, *args, **kwargs):
        assert Path(path) not in {repo / ".env", source / "seed.sql"}
        return real_read_bytes(path, *args, **kwargs)

    def runner(argv, **kwargs):
        events.append(argv)
        if argv == ["supabase", "--version"]:
            stdout = "2.111.0\n"
        elif argv[-1:] == ["--help"]:
            stdout = {
                ("start", "--help"): "--exclude --workdir",
                ("db", "reset", "--help"): "--local --no-seed --workdir",
                ("migration", "up", "--help"): "--local --workdir",
                ("stop", "--help"): "--no-backup --workdir",
            }[tuple(argv[1:])]
        elif argv[:3] == ["docker", "context", "inspect"]:
            stdout = json.dumps("npipe:////./pipe/docker_engine")
        elif argv[:2] == ["docker", "volume"]:
            stdout = "old-volume\n"
        elif argv[:2] == ["docker", "inspect"]:
            stdout = json.dumps([container_record()])
        elif argv[:2] == ["docker", "exec"]:
            stdout = "123456\n"
        elif argv[:2] == ["supabase", "start"]:
            assert (run / "supabase/config.toml").is_file()
            assert (run / "manifest.json").is_file()
            assert ex.read_json(run / "volumes-before.json") == ["old-volume"]
            assert not (run / ".env").exists()
            assert not (run / "supabase/seed.sql").exists()
            stdout = ""
        else:
            stdout = ""
        return ex.subprocess.CompletedProcess(argv, 0, stdout, "")

    monkeypatch.setattr(ex.shutil, "copyfile", copyfile)
    monkeypatch.setattr(Path, "read_text", guarded_read_text)
    monkeypatch.setattr(Path, "read_bytes", guarded_read_bytes)
    monkeypatch.setattr(ex, "free_ports", lambda: events.append("ports-free"))
    monkeypatch.setattr(ex, "read_system_identifier", lambda dsn: "123456")
    executor = ex.Executor(repo, run, runner=runner)
    executor.gate["commit"] = "d" * 40

    executor.prepare()

    assert events == [
        ["supabase", "--version"],
        ["supabase", "start", "--help"],
        ["supabase", "db", "reset", "--help"],
        ["supabase", "migration", "up", "--help"],
        ["supabase", "stop", "--help"],
        [
            "docker",
            "context",
            "inspect",
            "--format",
            "{{json .Endpoints.docker.Host}}",
        ],
        "ports-free",
        [
            "docker",
            "ps",
            "-a",
            "--no-trunc",
            "--filter",
            "label=com.supabase.cli.project=" + PROJECT,
            "--format",
            "{{.ID}}",
        ],
        ["docker", "volume", "ls", "--format", "{{.Name}}"],
        ["supabase", "--version"],
        [
            "supabase",
            "start",
            "-x",
            "realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,"
            "studio,edge-runtime,logflare,vector,supavisor",
            "--workdir",
            str(run),
        ],
        ["docker", "inspect", "supabase_db_" + PROJECT],
        [
            "docker",
            "exec",
            "-i",
            "a" * 64,
            "psql",
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-At",
        ],
    ]
    assert sorted(
        str(path.relative_to(run)).replace("\\", "/")
        for path in run.rglob("*")
        if path.is_file()
    ) == [
        "events.jsonl",
        "gates.json",
        "identity.json",
        "manifest.json",
        "supabase/config.toml",
        "supabase/migrations/20260812000001_one.sql",
        "volumes-before.json",
    ]
    assert ex.read_json(run / "volumes-before.json") == ["old-volume"]
    assert ex.read_json(run / "identity.json") == valid_identity() | {"sentinel": None}
    assert ex.read_json(run / "gates.json")["state"] == "prepared"
    assert copied == [
        (migration, run / "supabase/migrations/20260812000001_one.sql")
    ]


def test_prepare_rejects_owned_nonce_before_volume_inventory_or_start(
    monkeypatch, tmp_path
):
    run = tmp_path / ("a" * 32)
    run.mkdir()
    command = (
        "docker",
        "ps",
        "-a",
        "--no-trunc",
        "--filter",
        "label=com.supabase.cli.project=" + PROJECT,
        "--format",
        "{{.ID}}",
    )
    calls, runner = preflight_double({command: "a" * 64 + "\n"})
    monkeypatch.setattr(ex, "free_ports", lambda: None)

    with pytest.raises(ValueError, match="nonce already owns Docker containers"):
        ex.Executor(REPO, run, runner=runner).prepare()

    assert calls[-1] == list(command)
    assert not any(call[:2] == ["docker", "volume"] for call in calls)
    assert not any(
        call[:2] == ["supabase", "start"] and call[-1:] != ["--help"]
        for call in calls
    )


def test_upgrade_failure_never_promotes_manifest(monkeypatch, tmp_path):
    first = {
        "filename": "20260812000001_a.sql",
        "version": "20260812000001",
        "sha256": "A" * 64,
    }
    second = {
        "filename": "20260812000002_b.sql",
        "version": "20260812000002",
        "sha256": "B" * 64,
    }
    run = executor_run(tmp_path)
    ex.write_json(run / "manifest.json", [first])
    executor = ex.Executor(REPO, run)
    executor.gate.update(commit="d" * 40, state="ready")
    executor.identity = valid_identity()
    monkeypatch.setattr(executor, "proof", lambda: None)
    monkeypatch.setattr(
        executor,
        "files",
        lambda expected=None: [first] if expected is None else expected,
    )
    monkeypatch.setattr(executor, "history", lambda rows: None)
    monkeypatch.setattr(ex, "inventory", lambda *args: [first, second])
    monkeypatch.setattr(ex.shutil, "copyfile", lambda *args: None)

    def fail(*arguments):
        assert arguments == ("migration", "up", "--local")
        raise ex.CommandFailure(17)

    monkeypatch.setattr(executor, "local", fail)

    with pytest.raises(ex.CommandFailure) as result:
        executor.upgrade("20260812000002")

    assert result.value.code == 17
    assert ex.read_json(run / "manifest.json") == [first]
    assert ex.read_json(run / "manifest.prospective.json") == [first, second]
    persisted = ex.read_json(run / "gates.json")
    assert (persisted["state"], persisted["stage"]) == (
        "upgrading",
        "migration-up",
    )


@pytest.mark.parametrize(
    ("state", "identity"),
    [
        ("prepared", valid_identity()),
        ("ready", None),
        ("ready", valid_identity() | {"sentinel": None}),
        ("ready", valid_identity() | {"sentinel": "short"}),
    ],
)
def test_upgrade_requires_ready_state_and_valid_sentinel_without_external_work(
    tmp_path, state, identity
):
    run = executor_run(tmp_path)
    executor = ex.Executor(
        REPO,
        run,
        runner=lambda *_args, **_kwargs: pytest.fail("unexpected CLI"),
    )
    executor.gate["state"] = state
    executor.identity = identity

    with pytest.raises(ValueError):
        executor.upgrade()

    assert executor.gate["state"] == state


def test_upgrade_rejects_limit_before_applied_history_before_source_inventory(
    monkeypatch, tmp_path
):
    old = [
        {
            "filename": "20260812000002_b.sql",
            "version": "20260812000002",
            "sha256": "B" * 64,
        }
    ]
    run = executor_run(tmp_path)
    executor = ex.Executor(REPO, run)
    executor.gate.update(commit="d" * 40, state="ready")
    executor.identity = valid_identity()
    events = []
    monkeypatch.setattr(executor, "files", lambda: events.append("files") or old)
    monkeypatch.setattr(executor, "proof", lambda: events.append("proof"))
    monkeypatch.setattr(
        executor, "history", lambda rows: events.append(("history", rows))
    )
    monkeypatch.setattr(
        ex,
        "inventory",
        lambda *_args: pytest.fail("source inventory considered before limit refusal"),
    )

    with pytest.raises(ValueError, match="precedes applied history"):
        executor.upgrade("20260812000001")

    assert events == ["files", "proof", ("history", old)]
    assert not (run / "manifest.prospective.json").exists()


@pytest.mark.parametrize("mutation", ["edit", "remove", "rename", "reorder", "backfill"])
def test_upgrade_rejects_any_changed_applied_prefix_before_copy(
    monkeypatch, tmp_path, mutation
):
    first = {
        "filename": "20260812000001_a.sql",
        "version": "20260812000001",
        "sha256": "A" * 64,
    }
    third = {
        "filename": "20260812000003_c.sql",
        "version": "20260812000003",
        "sha256": "C" * 64,
    }
    backfill = {
        "filename": "20260812000002_b.sql",
        "version": "20260812000002",
        "sha256": "B" * 64,
    }
    changed = {
        "edit": [first | {"sha256": "D" * 64}, third],
        "remove": [first],
        "rename": [first | {"filename": "20260812000001_renamed.sql"}, third],
        "reorder": [third, first],
        "backfill": [first, backfill, third],
    }[mutation]
    old = [first, third]
    run = executor_run(tmp_path)
    ex.write_json(run / "manifest.json", old)
    executor = ex.Executor(REPO, run)
    executor.gate.update(commit="d" * 40, state="ready")
    executor.identity = valid_identity()
    monkeypatch.setattr(executor, "files", lambda: old)
    monkeypatch.setattr(executor, "proof", lambda: None)
    monkeypatch.setattr(executor, "history", lambda rows: None)
    monkeypatch.setattr(ex, "inventory", lambda *_args: changed)
    monkeypatch.setattr(
        ex.shutil,
        "copyfile",
        lambda *_args: pytest.fail("changed prefix copied"),
    )

    with pytest.raises(ValueError):
        executor.upgrade()

    assert ex.read_json(run / "manifest.json") == old
    assert not (run / "manifest.prospective.json").exists()


def test_upgrade_copies_only_suffix_and_promotes_after_verification(
    monkeypatch, tmp_path
):
    first = {
        "filename": "20260812000001_a.sql",
        "version": "20260812000001",
        "sha256": "A" * 64,
    }
    second = {
        "filename": "20260812000002_b.sql",
        "version": "20260812000002",
        "sha256": "B" * 64,
    }
    old, new = [first], [first, second]
    run = executor_run(tmp_path)
    ex.write_json(run / "manifest.json", old)
    executor = ex.Executor(REPO, run)
    executor.gate.update(commit="d" * 40, state="ready")
    executor.identity = valid_identity()
    events = []

    def files(expected=None):
        events.append(("files", expected))
        assert executor.gate["state"] == "upgrading"
        assert ex.read_json(run / "manifest.json") == old
        return old if expected is None else expected

    def proof():
        events.append("proof")
        assert executor.gate["state"] == "upgrading"
        assert ex.read_json(run / "manifest.json") == old

    def history(rows):
        events.append(("history", rows))
        assert executor.gate["state"] == "upgrading"
        assert ex.read_json(run / "manifest.json") == old

    def copyfile(source, destination):
        events.append(("copy", Path(source), Path(destination)))
        assert ex.read_json(run / "manifest.prospective.json") == new
        assert ex.read_json(run / "manifest.json") == old

    def local(*arguments):
        events.append(("local", arguments))
        assert arguments == ("migration", "up", "--local")
        assert ex.read_json(run / "manifest.json") == old

    monkeypatch.setattr(executor, "files", files)
    monkeypatch.setattr(executor, "proof", proof)
    monkeypatch.setattr(executor, "history", history)
    monkeypatch.setattr(
        ex,
        "inventory",
        lambda folder, through: events.append(("inventory", Path(folder), through))
        or new,
    )
    monkeypatch.setattr(ex.shutil, "copyfile", copyfile)
    monkeypatch.setattr(executor, "local", local)

    executor.upgrade("20260812000002")

    assert events == [
        ("files", None),
        "proof",
        ("history", old),
        (
            "inventory",
            REPO / "supabase/migrations",
            "20260812000002",
        ),
        (
            "copy",
            REPO / "supabase/migrations" / second["filename"],
            run / "supabase/migrations" / second["filename"],
        ),
        ("files", new),
        "proof",
        ("history", old),
        ("local", ("migration", "up", "--local")),
        "proof",
        ("files", new),
        ("history", new),
    ]
    assert ex.read_json(run / "manifest.json") == new
    assert executor.gate["state"] == "ready"


@pytest.mark.parametrize("failing_step", ["proof", "files", "history"])
def test_upgrade_final_verification_failure_never_promotes_manifest(
    monkeypatch, tmp_path, failing_step
):
    first = {
        "filename": "20260812000001_a.sql",
        "version": "20260812000001",
        "sha256": "A" * 64,
    }
    second = {
        "filename": "20260812000002_b.sql",
        "version": "20260812000002",
        "sha256": "B" * 64,
    }
    old, new = [first], [first, second]
    run = executor_run(tmp_path)
    ex.write_json(run / "manifest.json", old)
    executor = ex.Executor(REPO, run)
    executor.gate.update(commit="d" * 40, state="ready")
    executor.identity = valid_identity()
    calls = {"proof": 0, "files": 0, "history": 0}
    failure = RuntimeError(f"final {failing_step} failed")

    def verify(step):
        calls[step] += 1
        assert executor.gate["state"] == "upgrading"
        if step == failing_step and calls[step] == 3:
            raise failure

    def files(expected=None):
        verify("files")
        return old if expected is None else expected

    monkeypatch.setattr(executor, "files", files)
    monkeypatch.setattr(executor, "proof", lambda: verify("proof"))
    monkeypatch.setattr(executor, "history", lambda _rows: verify("history"))
    monkeypatch.setattr(ex, "inventory", lambda *_args: new)
    monkeypatch.setattr(ex.shutil, "copyfile", lambda *_args: None)
    monkeypatch.setattr(executor, "local", lambda *_args: None)

    with pytest.raises(RuntimeError, match=f"final {failing_step} failed") as result:
        executor.upgrade("20260812000002")

    assert result.value is failure
    assert ex.read_json(run / "manifest.json") == old
    assert ex.read_json(run / "manifest.prospective.json") == new
    assert executor.gate["state"] == "upgrading"
    assert ex.read_json(run / "gates.json")["state"] == "upgrading"


def test_upgrade_never_overwrites_existing_suffix_destination(monkeypatch, tmp_path):
    first = {
        "filename": "20260812000001_a.sql",
        "version": "20260812000001",
        "sha256": "A" * 64,
    }
    second = {
        "filename": "20260812000002_b.sql",
        "version": "20260812000002",
        "sha256": "B" * 64,
    }
    run = executor_run(tmp_path)
    destination = run / "supabase/migrations" / second["filename"]
    destination.parent.mkdir()
    destination.write_text("do not replace\n", encoding="ascii")
    ex.write_json(run / "manifest.json", [first])
    executor = ex.Executor(REPO, run)
    executor.gate.update(commit="d" * 40, state="ready")
    executor.identity = valid_identity()
    monkeypatch.setattr(
        executor, "files", lambda expected=None: [first] if expected is None else expected
    )
    monkeypatch.setattr(executor, "proof", lambda: None)
    monkeypatch.setattr(executor, "history", lambda rows: None)
    monkeypatch.setattr(ex, "inventory", lambda *_args: [first, second])
    monkeypatch.setattr(
        ex.shutil, "copyfile", lambda *_args: pytest.fail("destination overwritten")
    )

    with pytest.raises(ValueError, match="already exists"):
        executor.upgrade()

    assert destination.read_text(encoding="ascii") == "do not replace\n"
    assert ex.read_json(run / "manifest.json") == [first]


def test_upgrade_noop_reproves_and_stays_ready_without_migration(
    monkeypatch, tmp_path
):
    old = [
        {
            "filename": "20260812000001_a.sql",
            "version": "20260812000001",
            "sha256": "A" * 64,
        }
    ]
    run = executor_run(tmp_path)
    ex.write_json(run / "manifest.json", old)
    executor = ex.Executor(REPO, run)
    executor.gate.update(commit="d" * 40, state="ready")
    executor.identity = valid_identity()
    events = []
    monkeypatch.setattr(
        executor,
        "files",
        lambda expected=None: events.append(("files", expected))
        or (old if expected is None else expected),
    )
    monkeypatch.setattr(executor, "proof", lambda: events.append("proof"))
    monkeypatch.setattr(
        executor, "history", lambda rows: events.append(("history", rows))
    )
    monkeypatch.setattr(
        ex,
        "inventory",
        lambda folder, through: events.append(("inventory", Path(folder), through))
        or old,
    )
    monkeypatch.setattr(
        ex.shutil, "copyfile", lambda *_args: pytest.fail("noop copied a migration")
    )
    monkeypatch.setattr(
        executor, "local", lambda *_args: pytest.fail("noop ran migration CLI")
    )

    executor.upgrade("20260812000001")

    assert events == [
        ("files", None),
        "proof",
        ("history", old),
        ("inventory", REPO / "supabase/migrations", "20260812000001"),
        "proof",
        ("files", old),
        ("history", old),
    ]
    assert ex.read_json(run / "manifest.prospective.json") == old
    assert ex.read_json(run / "manifest.json") == old
    assert executor.gate["state"] == "ready"
