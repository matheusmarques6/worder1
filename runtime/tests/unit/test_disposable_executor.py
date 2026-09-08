import copy
import json
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
