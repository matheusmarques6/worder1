import copy
import io
import json
import os
import re
import tomllib
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from tests.support import disposable_executor as ex

REPO = Path(__file__).resolve().parents[3]
PROJECT = "worder-audit-" + "a" * 32


def test_config_changes_only_closed_fields():
    source = (REPO / "supabase/config.toml").read_text(encoding="utf-8")
    rendered = ex.config_text(source, PROJECT, False, source=True)
    assert f'project_id = "{PROJECT}"' in rendered
    config = tomllib.loads(rendered)
    assert (config["db"]["shadow_port"], config["api"]["port"], config["db"]["port"]) == (
        45320, 45321, 45322,
    )
    assert config["db"]["migrations"]["enabled"] is False
    assert ex.tomllib.loads(ex.config_text(rendered, PROJECT, True))["db"]["seed"][
        "enabled"
    ] is False


@pytest.mark.parametrize("port", [45320, 45321, 45322])
def test_config_rejects_retired_disposable_ports(port):
    source = (REPO / "supabase/config.toml").read_text(encoding="utf-8")
    rendered = ex.config_text(source, PROJECT, False, source=True)
    retired = rendered.replace(str(port), str(port + 10000))

    with pytest.raises(ValueError, match="unexpected config schema or value"):
        ex.config_text(retired, PROJECT, True)


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


@pytest.mark.parametrize("dangling", [False, True])
@pytest.mark.parametrize("supplied", ["inside", "outside"])
def test_safe_run_rejects_linked_run_root(tmp_path, dangling, supplied):
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
    if dangling:
        outside.rmdir()
        assert not root.exists()

    with pytest.raises(ValueError, match="linked path refused"):
        ex.safe_run(repo, (root if supplied == "inside" else outside) / ("a" * 32))


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
            "Ports": {"5432/tcp": [{"HostPort": "45322", "HostIp": "127.0.0.1"}]}
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
        "port": 45322,
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


def test_container_mapping_matches_persisted_disposable_port():
    physical = ex.inspect_record([container_record()], PROJECT, [])
    assert physical["port"] == 45322
    identity = {**physical, "systemIdentifier": "123456", "sentinel": "c" * 64}
    assert ex.identity_shape(identity, PROJECT) == valid_identity()


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

        def wait(self, *, timeout):
            assert timeout == 30
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

        def wait(self, *, timeout):
            assert timeout == 30
            return None

    monkeypatch.setattr(ex.shutil, "which", lambda _: "C:/bin/tool.exe")
    monkeypatch.setattr(ex.subprocess, "Popen", lambda *_args, **_kwargs: Process())

    assert ex.run_process(["tool"], cwd=REPO, env={}).returncode == 137


@pytest.mark.parametrize("interrupted", [False, True])
@pytest.mark.parametrize(
    "helper_failure", ["missing", "timeout", "wait-error", "kill-error", "nonzero", None],
)
@pytest.mark.parametrize("drain_failure", ["pipe-open", "wait", None])
def test_run_process_reports_unproven_reap_without_unbounded_waits(
    monkeypatch, interrupted, helper_failure, drain_failure,
):
    events = []
    expected_code = 130 if interrupted else 124
    initial_error = KeyboardInterrupt() if interrupted else ex.subprocess.TimeoutExpired("tool", 1)
    filtered_env = {"PATH": "safe-bin", "NO_COLOR": "1"}

    class Process:
        pid = 321
        stdin = stdout = stderr = SimpleNamespace(
            close=lambda: pytest.fail("closing pipes may block on live reader/writer threads"),
        )

        def communicate(self, *, input=None, timeout=None):
            events.append(("communicate", input, timeout))
            if len(events) == 1:
                raise initial_error
            if drain_failure == "pipe-open":
                raise ex.subprocess.TimeoutExpired("tool", timeout)
            return "after", "cleanup"

        def kill(self):
            events.append(("kill",))

        def wait(self, *, timeout=None):
            events.append(("wait", timeout))
            if drain_failure == "wait":
                raise ex.subprocess.TimeoutExpired("tool", timeout)

    class Helper:
        def wait(self, *, timeout=None):
            events.append(("taskkill-wait", timeout))
            assert timeout == 30, "helper wait must be bounded"
            if helper_failure in {"timeout", "kill-error"}:
                raise ex.subprocess.TimeoutExpired("taskkill", timeout)
            if helper_failure == "wait-error":
                raise OSError("taskkill wait failed")
            return 1 if helper_failure == "nonzero" else 0

        def kill(self):
            events.append(("taskkill-kill",))
            if helper_failure == "kill-error":
                raise OSError("taskkill kill failed")

    helper = Helper()

    def popen(argv, **kwargs):
        if argv[0] != "taskkill.exe":
            assert argv == ["C:/bin/tool.exe"]
            return process
        events.append(("taskkill", argv, kwargs))
        assert kwargs == {
            "cwd": REPO, "env": filtered_env, "shell": False,
            "stdin": ex.subprocess.DEVNULL, "stdout": ex.subprocess.DEVNULL,
            "stderr": ex.subprocess.DEVNULL,
        }
        if helper_failure == "missing":
            raise OSError("taskkill missing")
        return helper

    process = Process()
    monkeypatch.setattr(ex, "os", SimpleNamespace(name="nt"))
    monkeypatch.setattr(ex.subprocess, "CREATE_NEW_PROCESS_GROUP", 512, raising=False)
    monkeypatch.setattr(ex.shutil, "which", lambda _: "C:/bin/tool.exe")
    monkeypatch.setattr(ex.subprocess, "Popen", popen)

    if helper_failure or drain_failure:
        with pytest.raises(ex.CommandFailure) as failure:
            ex.run_process(["tool"], cwd=REPO, env=filtered_env, input="sql", timeout=1)
        assert type(failure.value).__name__ == "ProcessReapFailure"
        assert failure.value.code == expected_code and failure.value.process is process
        assert failure.value.helper is (None if helper_failure == "missing" else helper)
    else:
        result = ex.run_process(["tool"], cwd=REPO, env=filtered_env, input="sql", timeout=1)
        assert (result.returncode, result.stdout, result.stderr) == (
            expected_code, "after", "cleanup",
        )
    helper_events = [] if helper_failure == "missing" else [("taskkill-wait", 30)]
    if helper_failure and helper_failure != "missing":
        helper_events.append(("taskkill-kill",))
    assert events == [
        ("communicate", "sql", 1),
        (
            "taskkill",
            ["taskkill.exe", "/PID", "321", "/T", "/F"],
            {"cwd": REPO, "env": filtered_env, "shell": False,
             "stdin": ex.subprocess.DEVNULL, "stdout": ex.subprocess.DEVNULL,
             "stderr": ex.subprocess.DEVNULL},
        ),
        *helper_events,
        ("kill",),
        ("communicate", None, 30),
        ("wait", 30),
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
        "SUPABASE_DB_URL": "postgresql://postgres:postgres@127.0.0.1:45322/postgres",
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
        lambda d: d["NetworkSettings"]["Ports"]["5432/tcp"][0].update(HostPort="55322"),
        lambda d: d["NetworkSettings"]["Ports"]["5432/tcp"][0].update(HostIp="10.0.0.1"),
        lambda d: d["NetworkSettings"]["Ports"]["5432/tcp"].append(
            {"HostPort": "45322", "HostIp": "::"}
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
        lambda d: d.update(port=55322),
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

    saved = json.loads((tmp_path / "gates.json").read_text(encoding="utf-8"))
    event = json.loads((tmp_path / "events.jsonl").read_text(encoding="utf-8"))
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
    evidence = (tmp_path / "gates.json").read_text("utf-8") + (
        tmp_path / "events.jsonl"
    ).read_text("utf-8")
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


@pytest.mark.parametrize("destination", ["save", "events"])
@pytest.mark.parametrize("code,check", [(17, True), (124, False), (130, False), (0, False)])
def test_command_evidence_failure_preserves_nonzero_process_result(
    tmp_path, monkeypatch, destination, code, check
):
    executor = ex.Executor(
        REPO, tmp_path,
        runner=lambda argv, **kw: ex.subprocess.CompletedProcess(argv, code, "raw", "raw"),
    )
    evidence_error = OSError("evidence unavailable")

    def fail_save():
        raise evidence_error

    original_open = Path.open

    def open_file(path, *args, **kwargs):
        if path == tmp_path / "events.jsonl":
            raise evidence_error
        return original_open(path, *args, **kwargs)

    if destination == "save":
        monkeypatch.setattr(executor, "save", fail_save)
    else:
        monkeypatch.setattr(Path, "open", open_file)
    with pytest.raises(ex.CommandFailure if code else OSError) as failure:
        executor.command("tool", check=check)
    if code:
        assert failure.value.code == code
    else:
        assert failure.value is evidence_error
    assert executor.gate["exitCodes"] == [code]


@pytest.mark.parametrize("code", [124, 130])
@pytest.mark.parametrize("destination", ["save", "events", None])
def test_unproven_reap_survives_evidence_failure_and_blocks_commands(
    tmp_path, monkeypatch, code, destination,
):
    failure = ex.ProcessReapFailure(code, object())
    calls = []

    def runner(argv, **kwargs):
        calls.append(argv)
        raise failure

    executor = ex.Executor(REPO, tmp_path, runner=runner)
    original_open = Path.open

    def open_file(path, *args, **kwargs):
        target = "gates.json.tmp" if destination == "save" else "events.jsonl"
        if destination and path.name == target:
            raise OSError("evidence unavailable")
        return original_open(path, *args, **kwargs)

    monkeypatch.setattr(Path, "open", open_file)
    for _ in range(2):
        with pytest.raises(ex.ProcessReapFailure) as result:
            executor.command("tool", check=False)
        assert result.value is failure
    assert calls == [["tool"]]
    assert executor.gate["commands"] == [["tool"]] and executor.gate["exitCodes"] == [code]


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
    assert ex.tomllib.loads((run / "supabase/config.toml").read_text("utf-8"))["db"]["migrations"][
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
            assert ex.tomllib.loads((run / "supabase/config.toml").read_text("utf-8"))[
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
        ("0.0.0.0", 45320),
        ("0.0.0.0", 45321),
        ("0.0.0.0", 45322),
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


def lifecycle_run(tmp_path):
    repo = tmp_path / "repo"
    run = repo / ".superpowers/sdd/auditoria-ia-disposable" / ("a" * 32)
    run.mkdir(parents=True)
    ex.write_json(run / "identity.json", valid_identity())
    executor = ex.Executor(repo, run)
    executor.gate.update(commit="d" * 40, state="ready")
    executor.save()
    _, preflight = preflight_double()
    executor.runner = lambda argv, **kwargs: (
        ex.subprocess.CompletedProcess(argv, 0, "e" * 40, "")
        if argv == ["git", "rev-parse", "HEAD"] else preflight(argv, **kwargs)
    )
    return executor


@pytest.mark.parametrize("action", ["Replay", "Upgrade", "Test", "Prepare"])
def test_stopped_run_refuses_reuse_without_processes(tmp_path, action):
    executor = lifecycle_run(tmp_path)
    executor.gate["state"] = "stopped"
    executor.save()
    before = (executor.run / "gates.json").read_bytes()
    executor.runner = lambda *_a, **_k: pytest.fail("unexpected process")
    with pytest.raises(ValueError):
        executor.execute(action)
    assert (executor.run / "gates.json").read_bytes() == before
    assert executor.execute("Stop") == 0


@pytest.mark.parametrize("action,values,through", [
    ("Other", [], None), ("Replay", ["tests/db/x.py"], None),
    ("Test", [], "20260812000001"), ("Upgrade", [], "20260621"),
    ("Test", "tests/db/x.py", None),
])
def test_lifecycle_rejects_parameters_without_processes(tmp_path, action, values, through):
    executor = lifecycle_run(tmp_path)
    executor.runner = lambda *_a, **_k: pytest.fail("unexpected process")
    with pytest.raises(ValueError):
        executor.execute(action, values, through)


@pytest.mark.parametrize("action_code,cleanup_code,expected", [
    (0, 0, 0), (9, 0, 9), (9, 18, 9), (0, 18, 18), (130, 18, 130),
])
def test_test_finally_stops_preserving_original_failure(
    tmp_path, monkeypatch, action_code, cleanup_code, expected
):
    executor = lifecycle_run(tmp_path)
    events = []
    before = dict(os.environ)
    monkeypatch.setattr(executor, "source", lambda focal: [])
    monkeypatch.setattr(executor, "clean_commit", lambda commit: None)

    def test_action(values):
        assert values == []
        executor.gate["stage"] = "db"
        events.append("test")
        if action_code == 130:
            raise KeyboardInterrupt()
        if action_code:
            raise ex.CommandFailure(action_code)

    def stop_action():
        events.append("stop")
        if cleanup_code:
            raise ex.CommandFailure(cleanup_code)
        executor.gate["state"] = "stopped"

    monkeypatch.setattr(executor, "test", test_action)
    monkeypatch.setattr(executor, "stop", stop_action)
    assert executor.execute("Test") == expected
    assert events == ["test", "stop"]
    gate = ex.read_json(executor.run / "gates.json")
    assert gate["state"] == ("failed" if cleanup_code else "stopped")
    assert gate["failure"] == (
        {"stage": "db" if action_code else "stop",
         "kind": "KeyboardInterrupt" if action_code == 130 else "CommandFailure",
         "exitCode": expected} if expected else None
    )
    assert dict(os.environ) == before
    assert not (executor.run.parent / ".executor.lock").exists()


def test_cleanup_evidence_write_failure_does_not_replace_action_failure(tmp_path, monkeypatch):
    executor = lifecycle_run(tmp_path)
    real_save = executor.save
    monkeypatch.setattr(executor, "source", lambda focal: [])
    monkeypatch.setattr(executor, "clean_commit", lambda commit: None)

    def fail_test(values):
        executor.gate["stage"] = "db"
        raise ex.CommandFailure(17)

    def fail_save():
        raise OSError("evidence write failed")

    def stop():
        assert executor.gate["failure"]["exitCode"] == 17
        real_save()
        monkeypatch.setattr(executor, "save", fail_save)
        fail_save()

    monkeypatch.setattr(executor, "test", fail_test)
    monkeypatch.setattr(executor, "stop", stop)
    assert executor.execute("Test") == 17
    assert executor.gate["failure"] == {
        "stage": "db", "kind": "CommandFailure", "exitCode": 17,
    }
    assert not (executor.run.parent / ".executor.lock").exists()


@pytest.mark.parametrize("action,state,method,next_state", [
    ("Replay", "prepared", "replay", "ready"),
    ("Upgrade", "ready", "upgrade", "ready"),
    ("Stop", "failed", "stop", "stopped"),
])
def test_lifecycle_dispatches_valid_actions_under_exclusive_lock(
    tmp_path, monkeypatch, action, state, method, next_state
):
    executor = lifecycle_run(tmp_path)
    executor.gate["state"] = state
    executor.save()
    calls = []

    def operation(*args):
        calls.append(args)
        assert (executor.run.parent / ".executor.lock").read_text("utf-8") == str(os.getpid())
        executor.gate["state"] = next_state

    monkeypatch.setattr(executor, method, operation)
    assert executor.execute(action) == 0
    assert calls == ([(None,)] if action == "Upgrade" else [()])
    assert ex.read_json(executor.run / "gates.json")["state"] == next_state
    assert not (executor.run.parent / ".executor.lock").exists()


def test_existing_lock_is_never_removed_or_used(tmp_path):
    executor = lifecycle_run(tmp_path)
    lock = executor.run.parent / ".executor.lock"
    lock.write_text("another-owner", encoding="utf-8")
    executor.runner = lambda *_a, **_k: pytest.fail("unexpected process")
    with pytest.raises(FileExistsError):
        executor.execute("Test")
    assert lock.read_text("utf-8") == "another-owner"


@pytest.mark.parametrize("code", [0, 17, 124, 130])
@pytest.mark.parametrize("release_step", ["no_links", "unlink"])
def test_lock_release_failure_preserves_nonzero_result(
    tmp_path, monkeypatch, code, release_step
):
    executor = lifecycle_run(tmp_path)
    lock = executor.run.parent / ".executor.lock"
    monkeypatch.setattr(executor, "source", lambda focal: [])
    monkeypatch.setattr(executor, "clean_commit", lambda commit: None)
    release_error = OSError("release refused")

    def action(values):
        executor.gate["stage"] = "db"
        if code:
            raise ex.CommandFailure(code)

    def stop():
        executor.gate["state"] = "stopped"
        # Arm the release error after the action, leaving setup guards intact.
        if release_step == "no_links":
            original_no_links = ex.no_links

            def no_links(path):
                if path == lock:
                    raise release_error
                return original_no_links(path)

            monkeypatch.setattr(ex, "no_links", no_links)
        else:
            original_unlink = Path.unlink

            def unlink(path, *args, **kwargs):
                if path == lock:
                    raise release_error
                return original_unlink(path, *args, **kwargs)

            monkeypatch.setattr(Path, "unlink", unlink)

    monkeypatch.setattr(executor, "test", action)
    monkeypatch.setattr(executor, "stop", stop)
    if code:
        assert executor.execute("Test") == code
        assert executor.gate["failure"] == {
            "stage": "db", "kind": "CommandFailure", "exitCode": code,
        }
    else:
        with pytest.raises(OSError) as failure:
            executor.execute("Test")
        assert failure.value is release_error
    assert lock.read_text("utf-8") == str(os.getpid())


def test_lock_release_failure_preserves_propagating_exception(tmp_path, monkeypatch):
    executor = lifecycle_run(tmp_path)
    executor.gate["state"] = "stopped"
    executor.save()
    lock = executor.run.parent / ".executor.lock"
    original_unlink = Path.unlink

    def unlink(path, *args, **kwargs):
        if path == lock:
            raise OSError("release refused")
        return original_unlink(path, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", unlink)
    with pytest.raises(ValueError, match="invalid transition"):
        executor.execute("Test")
    assert lock.read_text("utf-8") == str(os.getpid())


def test_persisted_gate_is_read_only_after_lock_acquisition(tmp_path, monkeypatch):
    executor = lifecycle_run(tmp_path)
    executor.gate["state"] = "stopped"
    executor.save()
    original_read = ex.read_json
    reads = []

    def read_json(path):
        if path == executor.run / "gates.json":
            assert (executor.run.parent / ".executor.lock").read_text("utf-8") == str(os.getpid())
            reads.append(path)
        return original_read(path)

    monkeypatch.setattr(ex, "read_json", read_json)
    assert executor.execute("Stop") == 0
    assert reads == [executor.run / "gates.json"]


def test_lock_write_failure_releases_only_owned_lock(tmp_path, monkeypatch):
    executor = lifecycle_run(tmp_path)
    lock = executor.run.parent / ".executor.lock"
    original_open = Path.open

    class BrokenWriter:
        def __enter__(self):
            return self

        def write(self, text):
            raise OSError("PID write failed")

        def __exit__(self, *args):
            return None

    def open_file(path, *args, **kwargs):
        handle = original_open(path, *args, **kwargs)
        if path == lock:
            handle.close()
            return BrokenWriter()
        return handle

    monkeypatch.setattr(Path, "open", open_file)
    executor.runner = lambda *_a, **_k: pytest.fail("unexpected process")
    with pytest.raises(OSError, match="PID write failed"):
        executor.execute("Test")
    assert not lock.exists()


@pytest.mark.parametrize("failed_check", ["source", "clean_commit"])
def test_full_precheck_failure_never_relabels_commit_or_runs_tests(
    tmp_path, monkeypatch, failed_check
):
    executor = lifecycle_run(tmp_path)
    monkeypatch.setattr(executor, "source", lambda focal: [])
    monkeypatch.setattr(executor, "clean_commit", lambda commit: None)
    monkeypatch.setattr(executor, "test", lambda *_a: pytest.fail("tests before full proof"))
    monkeypatch.setattr(executor, "stop", lambda: executor.gate.update(state="stopped"))

    def refused(*args):
        raise ValueError("unapproved checkout")

    monkeypatch.setattr(executor, failed_check, refused)
    assert executor.execute("Test") == 2
    saved = ex.read_json(executor.run / "gates.json")
    assert saved["commit"] == "d" * 40
    assert saved["state"] == "stopped"
    assert saved["failure"]["stage"] == "preflight"


def test_prepare_failure_without_persisted_identity_records_only_unproven(
    tmp_path, monkeypatch
):
    repo = tmp_path / "repo"
    run = repo / ".superpowers/sdd/auditoria-ia-disposable" / ("a" * 32)
    calls = []
    preflight_calls, preflight = preflight_double()

    def runner(argv, **kwargs):
        calls.append(argv)
        if argv[0] != "git" and argv[:2] != ["docker", "ps"]:
            return preflight(argv, **kwargs)
        output = "e" * 40 if argv[0] == "git" else "a" * 64 + "\nraw secret\n"
        return ex.subprocess.CompletedProcess(argv, 0, output, "")

    executor = ex.Executor(repo, run, runner=runner)

    def prepare(through):
        assert through == "20260812000001"
        executor.preflight()
        executor.gate["stage"] = "prepare-identity"
        # In-memory proof cannot authorize cleanup if identity persistence failed.
        executor.identity = valid_identity()
        raise ex.CommandFailure(17)

    monkeypatch.setattr(executor, "prepare", prepare)
    assert executor.execute("Prepare", through="20260812000001") == 17
    assert calls == [
        ["git", "rev-parse", "HEAD"],
        *preflight_calls,
        ["docker", "ps", "-a", "--no-trunc", "--filter",
         "label=com.supabase.cli.project=" + PROJECT, "--format", "{{.ID}}"],
    ]
    assert ex.read_json(run / "unproven.json") == {
        "projectId": PROJECT, "containerIds": ["a" * 64],
    }
    assert ex.read_json(run / "gates.json")["state"] == "unproven"
    assert not (run.parent / ".executor.lock").exists()


@pytest.mark.parametrize("payload", [
    '<testsuite><testcase name="ok"/><testcase><failure>secret</failure></testcase>'
    '<testcase><error message="secret"/></testcase><testcase><skipped/></testcase></testsuite>',
    '<invalid>postgresql://secret',
])
def test_sanitize_report_removes_raw_content_including_invalid_xml(tmp_path, payload):
    path = tmp_path / "report.xml"
    sentinel = "c" * 64
    payload = payload.replace('name="ok"', f'name="{sentinel} postgresql://secret"')
    path.write_text(payload, encoding="utf-8")
    if payload.startswith("<invalid>"):
        with pytest.raises(ValueError):
            ex.sanitize_report(path, sentinel)
    else:
        assert ex.sanitize_report(path, sentinel) == {
            "tests": 4, "skipped": 1, "failures": 1, "errors": 1,
        }
    sanitized = path.read_text(encoding="utf-8")
    assert all(secret not in sanitized for secret in ("secret", "postgresql://", sentinel))


def test_sanitize_report_missing_file_writes_safe_error_report(tmp_path):
    path = tmp_path / "missing.xml"
    with pytest.raises(ValueError, match="missing or invalid"):
        ex.sanitize_report(path, "c" * 64)
    root = ex.ET.parse(path).getroot()
    suite = root.find("testsuite")
    assert suite.attrib == {
        "name": "disposable", "tests": "0", "skipped": "0", "failures": "0", "errors": "1",
    }
    assert list(suite) == []


def test_sanitize_report_keeps_only_allowlisted_case_attributes_and_outcomes(tmp_path):
    path = tmp_path / "raw.xml"
    path.write_text(
        '<testsuite hostname="private"><properties><property name="secret"/></properties>'
        '<testcase name="one" classname="Case" file="tests/db/test_case.py" line="9" '
        'time="0.25" secret="private"><properties><property value="private"/></properties>'
        '<failure message="private">private</failure><system-out>private</system-out>'
        '<system-err>private</system-err></testcase></testsuite>', encoding="utf-8",
    )
    assert ex.sanitize_report(path, "c" * 64) == {
        "tests": 1, "skipped": 0, "failures": 1, "errors": 0,
    }
    root = ex.ET.parse(path).getroot()
    case = root.find("testsuite/testcase")
    assert case.attrib == {
        "name": "one", "classname": "Case", "file": "tests/db/test_case.py",
        "line": "9", "time": "0.25",
    }
    assert [node.tag for node in root.iter()] == ["testsuites", "testsuite", "testcase", "failure"]
    assert case[0].attrib == {"message": "details omitted from disposable evidence"}
    assert case[0].text is None
    assert "private" not in path.read_text(encoding="utf-8")


@pytest.mark.parametrize("code,report,expected", [
    (17, "<broken>secret", 17), (0, "<broken>secret", 2),
    (0, "<testsuite/>", 2),
    (0, '<testsuite><testcase><skipped/></testcase></testsuite>', 2),
    (0, '<testsuite><testcase><failure/></testcase></testsuite>', 2),
    (0, '<testsuite><testcase><error/></testcase></testsuite>', 2),
    (0, '<testsuite><testcase name="one"/></testsuite>', 0),
])
def test_suite_sanitizes_before_deciding_exit_code(tmp_path, monkeypatch, code, report, expected):
    executor = lifecycle_run(tmp_path)
    executor.identity = valid_identity()

    def pytest_command(arguments, stage):
        assert stage == "db"
        path = Path(arguments[-1].removeprefix("--junitxml="))
        path.write_text(report, encoding="utf-8")
        return ex.subprocess.CompletedProcess([], code, "raw stdout", "raw stderr")

    monkeypatch.setattr(executor, "pytest_command", pytest_command)
    if expected:
        with pytest.raises((ex.CommandFailure, ValueError)) as failure:
            executor.suite(["-m", "db and not rls"], "db")
        assert getattr(failure.value, "code", 2) == expected
    else:
        assert executor.suite(["-m", "db and not rls"], "db") == 1
    text = (executor.run / "artifacts/db.xml").read_text("utf-8")
    assert "secret" not in text and "raw" not in text


def test_suite_sanitizes_even_when_pytest_raises(tmp_path, monkeypatch):
    executor = lifecycle_run(tmp_path)
    executor.identity = valid_identity()

    def interrupted(arguments, stage):
        Path(arguments[-1].removeprefix("--junitxml=")).write_text(
            "<broken>secret", encoding="utf-8",
        )
        raise KeyboardInterrupt()

    monkeypatch.setattr(executor, "pytest_command", interrupted)
    with pytest.raises(KeyboardInterrupt):
        executor.suite([], "db")
    assert "secret" not in (executor.run / "artifacts/db.xml").read_text("utf-8")


@pytest.mark.parametrize("failure,expected_stages", [
    (None, ["collect-rls", "db", "rls", "pipeline"]),
    ("collect-rls", ["collect-rls"]), ("empty", ["collect-rls"]),
    ("duplicate", ["collect-rls"]), ("db", ["collect-rls", "db"]),
    ("mismatch", ["collect-rls", "db", "rls"]),
])
def test_full_suites_are_serial_and_stop_at_first_failure(
    tmp_path, monkeypatch, failure, expected_stages
):
    executor = lifecycle_run(tmp_path)
    executor.identity = valid_identity()
    events = []
    monkeypatch.setattr(executor, "source", lambda focal: events.append(("source", focal)) or [])
    monkeypatch.setattr(executor, "clean_commit", lambda sha: events.append(("clean", sha)))
    monkeypatch.setattr(executor, "proof", lambda: events.append("proof"))
    monkeypatch.setattr(executor, "history", lambda rows: events.append("history"))
    stages = []

    def runner(argv, **kwargs):
        stage = executor.gate["stage"]
        stages.append(stage)
        assert events == [("source", False), ("clean", "d" * 40), "proof", "history"]
        events.clear()
        arguments = {
            "collect-rls": ["--collect-only", "-m", "rls", "-q"],
            "db": ["-m", "db and not rls",
                   "--junitxml=" + str(executor.run / "artifacts/db.xml")],
            "rls": ["-m", "rls", "--junitxml=" + str(executor.run / "artifacts/rls.xml")],
            "pipeline": ["-m", "pipeline",
                         "--junitxml=" + str(executor.run / "artifacts/pipeline.xml")],
        }
        assert argv == [
            "uv", "run", "--directory", str(executor.repo / "runtime"),
            "pytest", *arguments[stage],
        ]
        assert kwargs["env"]["WORDER_TEST_DB_SENTINEL"] == "c" * 64
        if stage != "collect-rls":
            if stage == "rls":
                assert "secret" not in (executor.run / "artifacts/db.xml").read_text("utf-8")
            path = Path(argv[-1].removeprefix("--junitxml="))
            cases = '<testcase name="one"><system-out>secret</system-out></testcase>'
            if stage == "rls" and failure == "mismatch":
                cases *= 2
            path.write_text("<testsuite>" + cases + "</testsuite>", encoding="utf-8")
            stdout = ""
        else:
            stdout = "tests/db/test_rls.py::test_one\n"
            if failure == "empty":
                stdout = ""
            elif failure == "duplicate":
                stdout *= 2
        return ex.subprocess.CompletedProcess(argv, 17 if stage == failure else 0, stdout, "")

    executor.runner = runner
    if failure:
        with pytest.raises((ValueError, ex.CommandFailure)):
            executor.test([])
    else:
        executor.test([])
        assert executor.gate["collectedRls"] == 1
    assert stages == expected_stages
    assert executor.gate["scope"] == "full"


def test_focal_uses_literal_targets_and_keeps_scope(tmp_path, monkeypatch):
    executor = lifecycle_run(tmp_path)
    file = executor.repo / "runtime/tests/db/test_one.py"
    file.parent.mkdir(parents=True)
    file.touch()
    selected = ["tests/db/test_one.py::test_one", "tests/db/test_one.py::test_two"]
    calls = []
    monkeypatch.setattr(executor, "suite", lambda args, name: calls.append((args, name)))
    executor.test(selected)
    assert calls == [([*selected, "-q"], "focal")]
    assert executor.gate["scope"] == "focal" and executor.gate["collectedRls"] == 0


def test_source_allows_only_exact_full_or_immutable_focal_prefix(tmp_path, monkeypatch):
    executor = lifecycle_run(tmp_path)
    folder = executor.repo / "supabase/migrations"
    folder.mkdir(parents=True)
    first = folder / "20260812000001_a.sql"
    first.write_text("select 1;", encoding="utf-8")
    approved = ex.inventory(folder)
    monkeypatch.setattr(executor, "files", lambda: approved)
    assert executor.source(False) == approved
    (folder / "20260812000002_b.sql").write_text("select 2;", encoding="utf-8")
    assert executor.source(True) == approved
    with pytest.raises(ValueError):
        executor.source(False)
    first.write_text("select 3;", encoding="utf-8")
    with pytest.raises(ValueError):
        executor.source(True)


@pytest.mark.parametrize("sha,dirty", [("e" * 40, ""), ("d" * 40, " M runtime/x.py")])
def test_clean_commit_refuses_changed_sha_or_dirty_test_inputs(tmp_path, sha, dirty):
    executor = lifecycle_run(tmp_path)
    calls = []

    def runner(argv, **kwargs):
        calls.append(argv)
        return ex.subprocess.CompletedProcess(argv, 0, sha if argv[1] == "rev-parse" else dirty, "")

    executor.runner = runner
    with pytest.raises(ValueError):
        executor.clean_commit("d" * 40)
    if dirty:
        assert calls[-1] == ["git", "status", "--porcelain=v1", "--untracked-files=all", "--",
                             "runtime", "scripts/test-disposable-db.ps1", "supabase/config.toml",
                             "supabase/migrations"]


@pytest.mark.parametrize("remaining", ["", "container", "volume", "identity-changed"])
def test_stop_reproves_persisted_identity_and_confirms_removal(tmp_path, monkeypatch, remaining):
    run = executor_run(tmp_path)
    ex.write_json(run / "volumes-before.json", [])
    ex.write_json(run / "identity.json", valid_identity() | {"sentinel": None})
    calls = []
    _, preflight = preflight_double()

    def runner(argv, **kwargs):
        calls.append(argv)
        if argv[-1] == "--help" or argv[:3] == ["docker", "context", "inspect"]:
            return preflight(argv, **kwargs)
        if argv[:2] == ["docker", "inspect"]:
            record = container_record()
            if remaining == "identity-changed":
                record["Id"] = "f" * 64
            stdout = json.dumps([record])
        elif argv[:2] == ["docker", "exec"]:
            assert kwargs["input"] == "select system_identifier::text from pg_control_system()\n"
            stdout = "123456"
        elif argv == ["supabase", "--version"]:
            stdout = "2.111.0"
        elif argv[:2] == ["supabase", "stop"]:
            assert argv == ["supabase", "stop", "--no-backup", "--workdir", str(run)]
            stdout = ""
        elif argv[:2] == ["docker", "ps"]:
            assert argv[5] == "label=com.supabase.cli.project=" + PROJECT
            stdout = "a" * 64 if remaining == "container" else ""
        elif argv[:3] == ["docker", "volume", "ls"]:
            stdout = valid_identity()["volumeName"] if remaining == "volume" else "old-volume"
        else:
            pytest.fail(f"unexpected argv: {argv}")
        return ex.subprocess.CompletedProcess(argv, 0, stdout, "")

    executor = ex.Executor(REPO, run, runner=runner)
    monkeypatch.setattr(ex, "read_system_identifier", lambda dsn: "123456")
    executor.preflight()
    calls.clear()
    if remaining:
        with pytest.raises(ValueError):
            executor.stop()
        assert executor.gate["state"] != "stopped"
    else:
        executor.stop()
        assert executor.gate["state"] == "stopped"
    if remaining == "identity-changed":
        assert not any(call[:2] == ["supabase", "stop"] for call in calls)


@pytest.mark.parametrize("payload", ["not JSON", "[]", '{"Action":"Test"}'])
def test_main_refuses_invalid_requests_without_leaking_input(monkeypatch, capsys, payload):
    monkeypatch.setattr(ex.sys, "stdin", io.StringIO(payload))
    monkeypatch.setattr(ex, "Executor", lambda *_a: pytest.fail("unexpected executor"))
    assert ex.main() == 2
    output = capsys.readouterr()
    assert output.out == "" and payload not in output.err


def test_main_transports_json_and_exact_result(monkeypatch):
    run = REPO / ".superpowers/sdd/auditoria-ia-disposable" / ("a" * 32)
    selected = ["tests/db/test_one.py::test_one", "tests/db/test_two.py::test_two"]
    request = {"Action": "Test", "RunDirectory": str(run), "TestTargets": selected,
               "MigrationThrough": None}
    observed = []

    class ExecutorDouble:
        def __init__(self, repo, directory):
            observed.append((repo, directory))

        def execute(self, action, values, through):
            observed.append((action, values, through))
            return 23

    monkeypatch.setattr(ex.sys, "stdin", io.StringIO(json.dumps(request)))
    monkeypatch.setattr(ex, "Executor", ExecutorDouble)
    assert ex.main() == 23
    assert observed == [(REPO, run), ("Test", selected, None)]


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return self.rows


class FakeConnection:
    def __init__(self, cli):
        self.cli = cli

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.cli.closed_connections += 1
        return False

    def execute(self, sql):
        if sql == "select system_identifier::text from pg_control_system()":
            return FakeCursor([(self.cli.loopback_sid or self.cli.sid,)])
        if sql == "select token from testing.disposable_identity":
            return FakeCursor([(self.cli.sentinel,)] if self.cli.sentinel else [])
        pytest.fail(f"unexpected connection SQL: {sql}")


class FakeCLI:
    """Only external boundaries are fake; manifests, guards and lifecycle remain real."""

    def __init__(self, repo, run):
        self.repo, self.run = repo, run
        self.started = False
        self.sid = "1234567890123456789"
        self.loopback_sid = None
        self.sentinel = None
        self.applied = []
        self.calls, self.pytest_calls = [], []
        self.connections = self.closed_connections = 0
        self.fail = None
        self.empty_rls = False
        self.commit = "e" * 40
        self.dirty = ""
        self.container = container_record()
        _, self.preflight = preflight_double()

    def connect(self, dsn, **kwargs):
        assert self.started
        assert dsn == "postgresql://postgres:postgres@127.0.0.1:45322/postgres"
        assert kwargs == {"connect_timeout": 3, "options": "-c statement_timeout=3000"}
        self.connections += 1
        return FakeConnection(self)

    def __call__(self, argv, *, cwd, env, input=None, timeout=600):
        self.calls.append(argv.copy())
        if cwd != self.repo or timeout not in (30, 600):
            pytest.fail("runner cwd or timeout escaped the bounded contract")
        if any(key in env for key in ("PGHOSTADDR", "PGSERVICE", "PYTEST_ADDOPTS", "API_KEY")):
            pytest.fail("ambient routing or credentials reached a child")
        output, code = "", 0
        if argv == ["git", "rev-parse", "HEAD"]:
            output = self.commit
        elif argv == [
            "git", "status", "--porcelain=v1", "--untracked-files=all", "--",
            "runtime", "scripts/test-disposable-db.ps1", "supabase/config.toml",
            "supabase/migrations",
        ]:
            output = self.dirty
        elif argv == ["supabase", "--version"] or argv[-1] == "--help" or argv[:3] == [
            "docker", "context", "inspect",
        ]:
            try:
                return self.preflight(argv)
            except KeyError:
                pytest.fail(f"unexpected preflight argv: {argv}")
        elif argv == [
            "docker", "ps", "-a", "--no-trunc", "--filter",
            "label=com.supabase.cli.project=" + PROJECT, "--format", "{{.ID}}",
        ]:
            output = self.container["Id"] if self.started else ""
        elif argv == ["docker", "volume", "ls", "--format", "{{.Name}}"]:
            output = "pre-existing\n" + ("supabase_db_" + PROJECT if self.started else "")
        elif argv == [
            "supabase", "start", "-x",
            "realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,"
            "studio,edge-runtime,logflare,vector,supavisor", "--workdir", str(self.run),
        ]:
            config = tomllib.loads((self.run / "supabase/config.toml").read_text("utf-8"))
            assert config["db"]["migrations"]["enabled"] is False
            assert config["db"]["seed"]["enabled"] is False
            assert not (self.run / "supabase/seed.sql").exists()
            self.started = True
        elif argv in (
            ["docker", "inspect", "supabase_db_" + PROJECT],
            ["docker", "inspect", "a" * 64],
        ):
            assert self.started
            output = json.dumps([self.container])
        elif argv == [
            "docker", "exec", "-i", "a" * 64, "psql", "-X", "-v", "ON_ERROR_STOP=1",
            "-U", "postgres", "-d", "postgres", "-At",
        ]:
            assert self.started
            sql = input.strip()
            if sql == "select system_identifier::text from pg_control_system()":
                output = self.sid
            elif sql == (
                "select version from supabase_migrations.schema_migrations order by version"
            ):
                output = "\n".join(self.applied)
            else:
                token = re.search(r"values \('([0-9a-f]{64})'\)", sql)
                if not token or "create table testing.disposable_identity" not in sql:
                    pytest.fail("unexpected psql input")
                assert "revoke all on schema testing" in sql
                assert "revoke all on testing.disposable_identity" in sql
                self.sentinel = token[1]
        elif argv in (
            ["supabase", "db", "reset", "--local", "--no-seed", "--workdir", str(self.run)],
            ["supabase", "migration", "up", "--local", "--workdir", str(self.run)],
        ):
            assert self.started
            config = tomllib.loads((self.run / "supabase/config.toml").read_text("utf-8"))
            assert config["db"]["migrations"]["enabled"] is True
            if self.fail == "migration-up" and argv[1] == "migration":
                code = 18
            else:
                # Model CLI filename order independently of the executor's inventory parser.
                self.applied = [
                    file.name.split("_", 1)[0]
                    for file in sorted((self.run / "supabase/migrations").iterdir())
                ]
                if argv[1] == "db":
                    self.sentinel = None
        elif argv == ["supabase", "stop", "--no-backup", "--workdir", str(self.run)]:
            assert self.started
            self.started = False
        elif argv[:5] == ["uv", "run", "--directory", str(self.repo / "runtime"), "pytest"]:
            assert self.started
            assert env["SUPABASE_DB_URL"] == (
                "postgresql://postgres:postgres@127.0.0.1:45322/postgres"
            )
            assert env["WORDER_TEST_DB_SYSTEM_IDENTIFIER"] == self.sid
            assert env["WORDER_TEST_DB_SENTINEL"] == self.sentinel
            arguments = {
                "collect-rls": ["--collect-only", "-m", "rls", "-q"],
                "db": ["-m", "db and not rls",
                       "--junitxml=" + str(self.run / "artifacts/db.xml")],
                "rls": ["-m", "rls", "--junitxml=" + str(self.run / "artifacts/rls.xml")],
                "pipeline": ["-m", "pipeline",
                             "--junitxml=" + str(self.run / "artifacts/pipeline.xml")],
                "focal": ["tests/db/test_case.py::test_one",
                          "tests/db/test_case.py::test_two[a-1]", "-q",
                          "--junitxml=" + str(self.run / "artifacts/focal.xml")],
            }
            name = next((
                stage for stage, suffix in arguments.items()
                if argv == [
                    "uv", "run", "--directory", str(self.repo / "runtime"), "pytest", *suffix,
                ]
            ), None)
            if name is None:
                pytest.fail(f"unexpected complete pytest argv: {argv}")
            if name == "collect-rls":
                output = "" if self.empty_rls else "tests/db/test_case.py::test_one\n"
            else:
                report = self.run / "artifacts" / (name + ".xml")
                report.write_text(
                    '<testsuite><testcase name="test_one" classname="tests.db.test_case">'
                    '<system-out>postgresql://redact-me ' + self.sentinel + '</system-out>'
                    '</testcase></testsuite>', encoding="utf-8",
                )
            self.pytest_calls.append(name)
            code = 17 if self.fail == name else 0
        else:
            pytest.fail(f"unexpected subprocess argv: {argv}")
        return ex.subprocess.CompletedProcess(argv, code, output, "")


def fake_environment(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    migrations = repo / "supabase/migrations"
    migrations.mkdir(parents=True)
    (repo / "supabase/config.toml").write_text(
        (REPO / "supabase/config.toml").read_text("utf-8"), encoding="utf-8",
    )
    (migrations / "20260621_phase0_foundations.sql").write_bytes(b"select 1;\n")
    (migrations / "20260812000001_a.sql").write_bytes(b"select 2;\n")
    test_file = repo / "runtime/tests/db/test_case.py"
    test_file.parent.mkdir(parents=True)
    test_file.write_text("def test_one():\n    assert True\n", encoding="utf-8")
    run = repo / ".superpowers/sdd/auditoria-ia-disposable" / ("a" * 32)
    cli = FakeCLI(repo, run)
    for name in ("PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(ex, "free_ports", lambda: None)
    monkeypatch.setattr(ex.psycopg, "connect", cli.connect)
    monkeypatch.setattr(ex.subprocess, "Popen", lambda *_a, **_k: pytest.fail("real process"))
    monkeypatch.setattr(ex.socket, "socket", lambda *_a, **_k: pytest.fail("real socket"))
    return ex.Executor(repo, run, runner=cli), cli


def test_real_legacy_migration_keeps_its_eight_digit_version():
    rows = ex.inventory(REPO / "supabase/migrations")
    assert rows[0]["filename"] == "20260621_phase0_foundations.sql"
    assert rows[0]["version"] == "20260621"
    assert rows[1]["version"] == "20260812000001"


def test_prepare_replay_full_test_and_stop_with_fake_cli(tmp_path, monkeypatch):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    monkeypatch.setenv("PYTEST_ADDOPTS", "--pdb")
    monkeypatch.setenv("API_KEY", "must-not-reach-child")
    before = dict(os.environ)
    assert executor.execute("Prepare") == 0
    assert executor.gate["state"] == "prepared" and cli.started
    prepared = json.loads((executor.run / "identity.json").read_text("utf-8"))
    assert prepared == {
        "projectId": PROJECT, "containerId": "a" * 64, "imageId": "sha256:" + "b" * 64,
        "volumeName": "supabase_db_" + PROJECT, "port": 45322,
        "systemIdentifier": "1234567890123456789", "sentinel": None,
    }
    assert json.loads((executor.run / "manifest.json").read_text("utf-8")) == [
        {"filename": "20260621_phase0_foundations.sql", "version": "20260621",
         "sha256": "4A45092CCF992EA92250053A80B931B787924BA61648F420555511B84F10AB6C"},
        {"filename": "20260812000001_a.sql", "version": "20260812000001",
         "sha256": "AC4396CDEE0295DB27F816DC31134189999D0071663E618F4957BC23EDB584D7"},
    ]
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Replay") == 0
    assert executor.gate["state"] == "ready" and cli.started
    assert cli.applied == ["20260621", "20260812000001"]
    ready = json.loads((executor.run / "identity.json").read_text("utf-8"))
    assert ready | {"sentinel": None} == prepared
    assert re.fullmatch(r"[0-9a-f]{64}", ready["sentinel"])
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Test") == 0
    assert cli.pytest_calls == ["collect-rls", "db", "rls", "pipeline"]
    assert executor.gate["collectedRls"] == 1
    assert executor.gate["scope"] == "full" and executor.gate["state"] == "stopped"
    assert executor.gate["commit"] == "e" * 40 and executor.gate["failure"] is None
    assert executor.gate["commands"] == cli.calls
    assert executor.gate["exitCodes"] == [0] * len(cli.calls)
    assert not cli.started and dict(os.environ) == before
    assert cli.connections == cli.closed_connections and cli.connections > 0
    for name in ("db", "rls", "pipeline"):
        report = (executor.run / "artifacts" / (name + ".xml")).read_text("utf-8")
        assert "postgresql://" not in report and ready["sentinel"] not in report
    operations = [c for c in cli.calls if c[0] == "supabase" and "--workdir" in c]
    assert operations == [
        ["supabase", "start", "-x",
         "realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,"
         "studio,edge-runtime,logflare,vector,supavisor", "--workdir", str(executor.run)],
        ["supabase", "db", "reset", "--local", "--no-seed", "--workdir", str(executor.run)],
        ["supabase", "stop", "--no-backup", "--workdir", str(executor.run)],
    ]
    count = len(cli.calls)
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Stop") == 0
    assert len(cli.calls) == count


@pytest.mark.parametrize("failure,expected,stages", [
    ("collect-rls", 17, ["collect-rls"]),
    ("empty-rls", 2, ["collect-rls"]),
    ("db", 17, ["collect-rls", "db"]),
    ("rls", 17, ["collect-rls", "db", "rls"]),
    ("pipeline", 17, ["collect-rls", "db", "rls", "pipeline"]),
])
def test_integrated_failure_stops_before_the_next_suite(
    tmp_path, monkeypatch, failure, expected, stages,
):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == 0
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Replay") == 0
    cli.fail, cli.empty_rls = failure, failure == "empty-rls"
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Test") == expected
    assert cli.pytest_calls == stages
    gate = json.loads((executor.run / "gates.json").read_text("utf-8"))
    assert gate["state"] == "stopped" and not cli.started
    assert gate["stage"] == "stop"
    assert gate["failure"] == {
        "stage": "collect-rls" if cli.empty_rls else failure,
        "kind": "ValueError" if cli.empty_rls else "CommandFailure", "exitCode": expected,
    }


def test_integrated_upgrade_noop_suffix_and_failure_preserve_approved_manifest(
    tmp_path, monkeypatch,
):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare", through="20260812000001") == 0
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Replay") == 0
    identity = (executor.run / "identity.json").read_bytes()
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Upgrade", through="20260812000001") == 0
    assert not any(
        c[:3] == ["supabase", "migration", "up"] and "--help" not in c for c in cli.calls
    )
    source = executor.repo / "supabase/migrations"
    (source / "20260812000002_b.sql").write_bytes(b"select 3;\n")
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Upgrade", through="20260812000002") == 0
    assert (executor.run / "identity.json").read_bytes() == identity
    assert cli.applied == ["20260621", "20260812000001", "20260812000002"]
    approved = (executor.run / "manifest.json").read_bytes()
    assert json.loads(approved)[-1] == {
        "filename": "20260812000002_b.sql", "version": "20260812000002",
        "sha256": "8B8A0860D9B183EFE119246B8D010F32B1030C93FA12275792B5847FD4FE929F",
    }
    (source / "20260812000003_c.sql").write_bytes(b"select 4;\n")
    cli.fail = "migration-up"
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Upgrade", through="20260812000003") == 18
    assert (executor.run / "manifest.json").read_bytes() == approved
    prospective = json.loads((executor.run / "manifest.prospective.json").read_text("utf-8"))
    assert prospective[:-1] == json.loads(approved)
    assert prospective[-1]["filename"] == "20260812000003_c.sql"
    assert (executor.run / "identity.json").read_bytes() == identity
    assert executor.gate["failure"] == {
        "stage": "migration-up", "kind": "CommandFailure", "exitCode": 18,
    }
    assert executor.gate["state"] == "stopped" and not cli.started
    assert sum(c[:3] == ["supabase", "db", "reset"] and "--help" not in c for c in cli.calls) == 1


@pytest.mark.parametrize("changed", ["manifest", "dirty"])
def test_new_checkout_cannot_certify_unapproved_inputs(tmp_path, monkeypatch, changed):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == 0
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Replay") == 0
    if changed == "manifest":
        (executor.repo / "supabase/migrations/20260812000002_b.sql").write_bytes(b"select 3;\n")
    else:
        cli.dirty = " M runtime/tests/db/test_case.py"
    cli.commit = "f" * 40
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Test") == 2
    assert cli.pytest_calls == []
    assert executor.gate["commit"] == "e" * 40
    assert executor.gate["state"] == "stopped" and not cli.started


def test_integrated_focal_accepts_immutable_prefix_and_literal_targets(tmp_path, monkeypatch):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == 0
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Replay") == 0
    (executor.repo / "supabase/migrations/20260812000002_b.sql").write_bytes(b"select 3;\n")
    cli.dirty = " M runtime/tests/db/test_case.py"
    selected = ["tests/db/test_case.py::test_one", "tests/db/test_case.py::test_two[a-1]"]
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Test", selected) == 0
    assert cli.pytest_calls == ["focal"]
    assert executor.gate["scope"] == "focal" and executor.gate["collectedRls"] == 0
    assert executor.gate["state"] == "stopped" and not cli.started
    assert [c for c in cli.calls if c[0] == "uv"] == [[
        "uv", "run", "--directory", str(executor.repo / "runtime"), "pytest", *selected, "-q",
        "--junitxml=" + str(executor.run / "artifacts/focal.xml"),
    ]]


def test_integrated_ambient_hostaddr_blocks_replay_before_reset_or_connection(
    tmp_path, monkeypatch,
):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == 0
    connected = cli.connections
    monkeypatch.setenv("PGHOSTADDR", "10.0.0.1")
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Replay") == 2
    assert cli.connections == connected
    assert not any(c[0] == "supabase" and "--workdir" in c and c[1] != "start" for c in cli.calls)
    assert executor.gate["failure"]["stage"] == "replay-preflight"
    assert executor.gate["state"] == "failed" and cli.started
    assert os.environ["PGHOSTADDR"] == "10.0.0.1"


def test_integrated_copy_hash_change_prevents_pytest(tmp_path, monkeypatch):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == 0
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Replay") == 0
    (executor.run / "supabase/migrations/20260812000001_a.sql").write_bytes(b"select 99;\n")
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Test") == 2
    assert cli.pytest_calls == [] and executor.gate["state"] == "stopped"
    assert not cli.started


@pytest.mark.parametrize("changed", ["sid", "container"])
def test_integrated_stop_refuses_changed_identity(tmp_path, monkeypatch, changed):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == 0
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Replay") == 0
    if changed == "sid":
        cli.sid = "9999999999999999999"
    else:
        cli.container["Id"] = "f" * 64
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    assert executor.execute("Stop") == 2
    assert not any(c[:2] == ["supabase", "stop"] and "--help" not in c for c in cli.calls)
    assert executor.gate["state"] == "failed" and cli.started


def test_integrated_unproven_prepare_records_ids_without_cleanup(tmp_path, monkeypatch):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    cli.loopback_sid = "9999999999999999999"
    assert executor.execute("Prepare") == 2
    assert executor.gate["state"] == "unproven" and cli.started
    assert json.loads((executor.run / "unproven.json").read_text("utf-8")) == {
        "projectId": PROJECT, "containerIds": ["a" * 64],
    }
    assert not (executor.run / "identity.json").exists()
    assert not any(c[:2] == ["supabase", "stop"] and "--help" not in c for c in cli.calls)
    calls = len(cli.calls)
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    with pytest.raises(ValueError, match="invalid transition"):
        executor.execute("Stop")
    assert len(cli.calls) == calls


@pytest.mark.parametrize("action", ["Prepare", "Replay", "Test", "Stop"])
def test_execute_remote_context_never_contacts_refused_daemon(tmp_path, monkeypatch, action):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    if action != "Prepare":
        assert executor.execute("Prepare") == 0
        if action == "Test":
            assert executor.execute("Replay") == 0
    calls = []
    refused = False

    def remote(argv, **kwargs):
        nonlocal refused
        if refused:
            pytest.fail("subprocess after remote context refusal")
        calls.append(argv)
        if argv[:3] == ["docker", "context", "inspect"]:
            refused = True
            return ex.subprocess.CompletedProcess(argv, 0, '"tcp://192.0.2.1:2375"', "")
        assert argv[0] != "docker", "daemon operation before local context proof"
        return cli(argv, **kwargs)

    executor.runner = remote
    assert executor.execute(action) == 2
    assert [call for call in calls if call[0] == "docker"] == [[
        "docker", "context", "inspect", "--format", "{{json .Endpoints.docker.Host}}",
    ]]
    gate = ex.read_json(executor.run / "gates.json")
    assert gate["state"] == "failed" and gate["stage"] == "preflight"
    assert gate["failure"] == {"stage": "preflight", "kind": "ValueError", "exitCode": 2}
    assert not (executor.run / "unproven.json").exists()
    assert not (executor.run.parent / ".executor.lock").exists()


def test_each_execute_discards_prior_local_context_proof_before_loading_identity(
    tmp_path, monkeypatch,
):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == 0
    ex.write_json(executor.run / "identity.json", {})
    executor.runner = lambda *_a, **_k: pytest.fail("subprocess using previous local context proof")
    assert executor.execute("Replay") == 2
    assert cli.started
    assert executor.gate["state"] == "failed" and executor.gate["stage"] == "preflight"
    assert not (executor.run / "unproven.json").exists()


@pytest.mark.parametrize("failed_check", ["git", "source", "clean_commit"])
def test_local_context_is_proved_before_test_checkout_checks(tmp_path, monkeypatch, failed_check):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == 0
    assert executor.execute("Replay") == 0
    cli.calls.clear()
    if failed_check == "source":
        (executor.repo / "supabase/migrations/20260812000002_b.sql").write_bytes(b"select 3;\n")
    elif failed_check == "clean_commit":
        cli.dirty = " M runtime/tests/db/test_case.py"

    def runner(argv, **kwargs):
        if argv[0] == "git":
            assert any(call[:3] == ["docker", "context", "inspect"] for call in cli.calls)
            if failed_check == "git":
                raise ex.CommandFailure(17)
        return cli(argv, **kwargs)

    executor = ex.Executor(executor.repo, executor.run, runner=runner)
    assert executor.execute("Test") == (17 if failed_check == "git" else 2)
    assert executor.gate["state"] == "stopped" and not cli.started
    assert cli.pytest_calls == []


@pytest.mark.parametrize("method", ["stop", "unproven"])
def test_cleanup_requires_local_context_proof_even_when_called_directly(
    tmp_path, monkeypatch, method,
):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == 0
    executor = ex.Executor(executor.repo, executor.run, runner=cli)
    calls = len(cli.calls)
    with pytest.raises(ValueError, match="local Docker context"):
        getattr(executor, method)()
    assert len(cli.calls) == calls and cli.started


@pytest.mark.parametrize("stage", ["preflight", "db", "stop"])
@pytest.mark.parametrize("interrupted", [False, True])
@pytest.mark.parametrize("unproven", ["tree", "pipe-open", "helper-timeout", None])
def test_unproven_process_reap_blocks_lifecycle_until_inspection(
    tmp_path, monkeypatch, stage, interrupted, unproven,
):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == 0
    assert executor.execute("Replay") == 0
    blocked = False
    events = []
    expected_code = 130 if interrupted else 124
    initial_error = KeyboardInterrupt() if interrupted else ex.subprocess.TimeoutExpired("tool", 1)

    class Process:
        pid = 321

        def communicate(self, *, input=None, timeout=None):
            events.append(("communicate", timeout))
            if len(events) == 1:
                raise initial_error
            if unproven == "pipe-open":
                raise ex.subprocess.TimeoutExpired("tool", timeout)
            return "", ""

        def kill(self):
            events.append(("kill",))

        def wait(self, *, timeout=None):
            events.append(("wait", timeout))

    process = Process()
    helper_events = []

    class Helper:
        def wait(self, *, timeout):
            helper_events.append(("wait", timeout))
            assert timeout == 30
            if unproven == "helper-timeout":
                raise ex.subprocess.TimeoutExpired("taskkill", timeout)
            return 1 if unproven == "tree" else 0

        def kill(self):
            helper_events.append(("kill",))

    helper = Helper()

    def runner(argv, **kwargs):
        nonlocal blocked
        if blocked:
            pytest.fail("subprocess after unproven process reap")
        if not events and executor.gate["stage"] == stage and (
            argv[0] == "uv" or argv[:2] == ["supabase", "stop"]
            or argv[:3] == ["docker", "context", "inspect"]
        ) and "--help" not in argv:
            blocked = bool(unproven)
            with monkeypatch.context() as patch:
                patch.setattr(ex, "os", SimpleNamespace(name="nt"))
                patch.setattr(ex.shutil, "which", lambda _: "tool.exe")
                patch.setattr(ex.subprocess, "CREATE_NEW_PROCESS_GROUP", 512, raising=False)
                patch.setattr(ex.subprocess, "Popen", lambda args, **kw:
                              helper if args[0] == "taskkill.exe" else process)
                return ex.run_process(argv, **kwargs)
        return cli(argv, **kwargs)

    executor = ex.Executor(executor.repo, executor.run, runner=runner)
    assert executor.execute("Test") == expected_code
    assert events == [("communicate", 30 if stage == "preflight" else 600),
                      ("kill",), ("communicate", 30), ("wait", 30)]
    assert helper_events == [("wait", 30)] + (
        [("kill",)] if unproven in {"tree", "helper-timeout"} else []
    )
    gate = ex.read_json(executor.run / "gates.json")
    assert gate["failure"] == {
        "stage": stage, "kind": "ProcessReapFailure" if unproven else "CommandFailure",
        "exitCode": expected_code,
    }
    assert gate["exitCodes"][-1] == (expected_code if unproven or stage != "db" else 0)
    assert gate["state"] == ("failed" if unproven or stage != "db" else "stopped")
    lock = executor.run.parent / ".executor.lock"
    if unproven:
        assert executor.reap_failure.helper is helper
        assert lock.read_text("utf-8") == str(os.getpid())
        assert cli.started
        assert not (executor.run / "unproven.json").exists()
        with pytest.raises(FileExistsError):
            ex.Executor(executor.repo, executor.run, runner=runner).execute("Stop")
        with pytest.raises(ex.CommandFailure) as failure:
            executor.command("docker", "ps", check=False)
        assert failure.value.code == expected_code
    else:
        assert not lock.exists()


@pytest.mark.parametrize("platform,interrupted,group_missing", [
    ("nt", False, False), ("nt", True, False),
    ("posix", False, False), ("posix", True, False), ("posix", False, True),
])
def test_run_process_timeout_and_interrupt_kill_tree_drain_and_reap(
    monkeypatch, platform, interrupted, group_missing,
):
    events = []
    initial_error = KeyboardInterrupt() if interrupted else ex.subprocess.TimeoutExpired("uv", 1)

    class Process:
        pid = 31337

        def communicate(self, *, input=None, timeout=None):
            events.append(("communicate", input, timeout))
            if len(events) == 1:
                raise initial_error
            return "drained", "diagnostic"

        def kill(self):
            events.append(("kill",))

        def wait(self, *, timeout):
            events.append(("wait", timeout))

    class Helper:
        def wait(self, *, timeout):
            assert timeout == 30
            events.append(("taskkill-wait",))
            return 0

    def popen_process(argv, **kwargs):
        if argv[0] != "taskkill.exe":
            return process
        assert platform == "nt", "POSIX must not invoke the Windows taskkill backend"
        assert argv == ["taskkill.exe", "/PID", "31337", "/T", "/F"]
        assert kwargs == {
            "cwd": REPO, "env": {}, "shell": False, "stdin": ex.subprocess.DEVNULL,
            "stdout": ex.subprocess.DEVNULL, "stderr": ex.subprocess.DEVNULL,
        }
        events.append(("taskkill",))
        return Helper()

    def killpg(pid, signal):
        assert platform == "posix", "Windows must not invoke the POSIX killpg backend"
        assert (pid, signal) == (31337, 9)
        events.append(("killpg", group_missing))
        if group_missing:
            raise ProcessLookupError()

    process = Process()
    popen = MagicMock(side_effect=popen_process)
    monkeypatch.setattr(ex, "os", SimpleNamespace(name=platform, killpg=killpg))
    monkeypatch.setattr(ex, "signal", SimpleNamespace(SIGKILL=9))
    monkeypatch.setattr(ex.shutil, "which", lambda _: "tool.exe")
    monkeypatch.setattr(ex.subprocess, "Popen", popen)
    monkeypatch.setattr(ex.subprocess, "CREATE_NEW_PROCESS_GROUP", 512, raising=False)
    result = ex.run_process(["uv", "run", "pytest"], cwd=REPO, env={}, input="sql", timeout=1)
    assert (result.returncode, result.stdout, result.stderr) == (
        130 if interrupted else 124, "drained", "diagnostic",
    )
    assert events == [
        ("communicate", "sql", 1),
        ("taskkill",) if platform == "nt" else ("killpg", group_missing),
        *([("taskkill-wait",)] if platform == "nt" else []),
        ("kill",),
        ("communicate", None, 30), ("wait", 30),
    ]
    assert popen.call_count == (2 if platform == "nt" else 1)
    main_call = popen.call_args_list[0]
    assert main_call.args == (["tool.exe", "run", "pytest"],)
    assert main_call.kwargs["shell"] is False
    assert main_call.kwargs["start_new_session"] is (platform == "posix")
    assert main_call.kwargs["creationflags"] == (512 if platform == "nt" else 0)


@pytest.mark.parametrize("bad", [
    [],
    [{"filename": "bad.sql", "sha256": "A" * 64, "version": "20260621"}],
    [{"filename": "20260812000001_a.sql", "sha256": "A" * 64, "version": "20260812000002"}],
    [{"filename": "20260812000001_a.sql", "sha256": "a" * 64, "version": "20260812000001"}],
    [{"filename": "20260812000001_a.sql", "version": "20260812000001"}],
    [
        {"filename": "20260812000001_a.sql", "sha256": "A" * 64, "version": "20260812000001"},
        {"filename": "20260812000001_b.sql", "sha256": "B" * 64, "version": "20260812000001"},
    ],
    [
        {"filename": "20260812000002_b.sql", "sha256": "B" * 64, "version": "20260812000002"},
        {"filename": "20260812000001_a.sql", "sha256": "A" * 64, "version": "20260812000001"},
    ],
    [
        {"filename": "20260621_legacy.sql", "sha256": "A" * 64, "version": "20260621"},
        {"filename": "20260621000001_a.sql", "sha256": "B" * 64, "version": "20260621000001"},
    ],
])
def test_manifest_shape_refuses_malformed_or_ambiguous_history(bad):
    with pytest.raises(ValueError):
        ex.manifest_shape(bad)


def test_launcher_transports_two_targets_and_preserves_native_exit_code(tmp_path):
    # The only real process boundary in this module; the DB backend is never imported.
    runtime = tmp_path / "a\u00e7\u00e3o \u6f22 runtime"
    support = runtime / "tests/support"
    support.mkdir(parents=True)
    (runtime / "tests/__init__.py").write_text("", encoding="utf-8")
    (support / "__init__.py").write_text("", encoding="utf-8")
    (support / "disposable_executor.py").write_text(
        "import json, os, sys\n"
        "assert sys.flags.utf8_mode == 1\n"
        "request = json.loads(sys.stdin.read())\n"
        "assert request == {\n"
        "    'Action': 'Test',\n"
        "    'RunDirectory': os.environ['LAUNCH_RUNTIME'],\n"
        "    'MigrationThrough': None,\n"
        "    'TestTargets': ['tests/db/first.py::test_one',\n"
        "                    'tests/db/second.py::test_a\\u00e7\\u00e3o'],\n"
        "}\n"
        "raise SystemExit(23)\n", encoding="utf-8",
    )
    command = r"""
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 is required' }
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    $env:LAUNCH_SCRIPT, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'parse failed' }
$unsafe = $ast.FindAll({ param($node)
    ($node -is [Management.Automation.Language.CommandAst] -and
        $node.GetCommandName() -in @('Invoke-Expression', 'iex')) -or
    ($node -is [Management.Automation.Language.StringConstantExpressionAst] -and
        $node.Value -like '*--linked*') -or
    ($node -is [Management.Automation.Language.CommandParameterAst] -and
        $node.ParameterName -eq 'linked')
}, $true)
if ($unsafe.Count) { throw 'unsafe command or linked argument' }
$dispatch = @($ast.FindAll({ param($node)
    $node -is [Management.Automation.Language.SwitchStatementAst]
}, $false))
if ($dispatch.Count -ne 1) { throw 'expected one Action switch' }
$selector = $dispatch[0].Condition.Find({ param($node)
    $node -is [Management.Automation.Language.VariableExpressionAst]
}, $true)
if ($selector.VariablePath.UserPath -ne 'Action') { throw 'wrong dispatch selector' }
if (($dispatch[0].Clauses | ForEach-Object { $_.Item1.Value }) -join ',' -ne
    'Prepare,Replay,Upgrade,Test,Stop') { throw 'missing action branch' }
foreach ($clause in $dispatch[0].Clauses) {
    $calls = @($clause.Item2.FindAll({ param($node)
        $node -is [Management.Automation.Language.CommandAst]
    }, $true))
    if ($calls.Count -ne 1 -or $calls[0].GetCommandName() -ne 'Invoke-Executor' -or
        $calls[0].CommandElements.Count -ne 2 -or
        $calls[0].CommandElements[1].Value -ne $clause.Item1.Value) {
        throw 'action dispatched to the wrong backend request'
    }
}
$definition = $ast.Find({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq 'Invoke-Executor'
}, $false)
if ($null -eq $definition) { throw 'missing transport function' }
. ([scriptblock]::Create($definition.Extent.Text))
$runtimeRoot = $env:LAUNCH_RUNTIME
$pythonPath = $env:LAUNCH_PYTHON
$RunDirectory = $env:LAUNCH_RUNTIME
$TestTargets = @('tests/db/first.py::test_one', ('tests/db/second.py::test_a' +
    [char]0x00e7 + [char]0x00e3 + 'o'))
$MigrationThrough = $null
Invoke-Executor 'Test'
"""
    env = dict(
        os.environ, LAUNCH_SCRIPT=str(REPO / "scripts/test-disposable-db.ps1"),
        LAUNCH_RUNTIME=str(runtime), LAUNCH_PYTHON=ex.sys.executable, PYTHONUTF8="0",
    )
    for name in ("PYTHONPATH", "PYTHONHOME", "PYTHONIOENCODING"):
        env.pop(name, None)
    result = ex.subprocess.run(
        ["pwsh", "-NoProfile", "-NonInteractive", "-Command", command],
        env=env, capture_output=True, text=True, encoding="utf-8", timeout=30,
        check=False, shell=False,
    )
    assert result.returncode == 23, result.stderr
