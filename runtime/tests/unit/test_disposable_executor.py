import copy
import json
import os
from pathlib import Path

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
    with pytest.raises(ValueError, match="migration history mismatch"):
        executor.history(expected[:1])
