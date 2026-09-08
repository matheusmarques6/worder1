# Disposable Database Executor E0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o executor descartável de W0-T2 com prova de identidade anterior a reset/fixtures, lifecycle fechado e testes sem Docker antes do primeiro gate real.

**Architecture:** O PowerShell expõe as cinco Actions e transporta argumentos como JSON por stdin para Python. Um helper de testes concentra TOML via `tomllib`, manifesto, subprocessos e lifecycle; a guarda compartilhada `dsn_from_env()` libera as fixtures DB/pipeline somente após conferir identidade e sentinela. Não existe caminho alternativo sem a guarda.

**Tech Stack:** PowerShell 7, Python >=3.13, biblioteca padrão, psycopg 3 e pytest já instalados, uv, Supabase CLI 2.111.0, PostgreSQL 17 e Docker local.

**Spec:** `docs/superpowers/specs/2026-09-08-auditoria-motor-ia-sdd-program-design.md`, seção 9; contrato pai: `docs/superpowers/plans/2026-09-08-auditoria-ia-wave-0-baseline.md`, W0-T2 inteiro e W0-T4.

## Global Constraints

- A branch principal e suas alterações locais permanecem intocadas.
- Nenhum teste destrutivo aponta para banco existente, pooler ou produção.
- Nenhum subagente pode fazer push, merge, deploy ou migration remota.
- Nunca há dois implementadores escrevendo no mesmo worktree ao mesmo tempo.
- Toda lógica não trivial recebe ao menos um teste de regressão executável.
- Decisões de produto antecedem implementação.
- O menor diff responsável vence; código especulativo não será criado.
- Worktree: `.worktrees/sync-remote-ai-2026-09-08`; branch: `integration/sync-remote-ai-2026-09-08`.
- Supabase CLI `2.111.0`; Python `>=3.13`; PostgreSQL `17`; API `55321`, DB `55322`, shadow `55320`.
- Diretório exclusivo: `.superpowers/sdd/auditoria-ia-disposable/<nonce>`; nonce = 32 hex minúsculos; `project_id="worder-audit-<nonce>"`; sentinela = 64 hex aleatórios independentes.
- Proibições: `--linked`, banco remoto ou pooler; `.env`, seed, dump ou credencial real; `runtime/docker-compose --profile piloto`; `mirror.ps1`; `docker system prune`, `stop --all` ou limpeza global; advisors apontados à produção para compensar ausência local.
- O guardião DB Astra opera sozinho; review Astra do código + testes puros verdes antecedem Prepare/Replay/Upgrade/Test/Stop reais.
- Test termina o projeto no `finally`; cada RED/GREEN DB usa novo nonce. Gates focais não aprovam onda.
- E0 é dependência de engenharia, não uma nova decisão de produto. Este plano não autoriza operações remotas nem resolve B0/B1 ou o baseline de schema.

---

## Mapa de arquivos e contratos

| Arquivo | Responsabilidade |
|---|---|
| Create `scripts/test-disposable-db.ps1` | Interface pública e `switch ($Action)` com cinco branches; sem montar shell text |
| Create `runtime/tests/support/disposable_db.py` | Validação libpq fechada e consultas de identidade somente leitura |
| Modify `runtime/tests/support/database.py` | Remover `DEFAULT_DSN`; exigir três envs e identidade antes de retornar a DSN |
| Create `runtime/tests/support/disposable_executor.py` | Edição TOML, manifesto, processo filho, artefatos, ações e CLI JSON privada |
| Create `runtime/tests/unit/test_disposable_db_guard.py` | Regressões de DSN/identidade/envs sem conexão |
| Create `runtime/tests/unit/test_disposable_executor.py` | Testes puros e doubles de CLI/Docker; nunca inicia serviços |
| Read `runtime/tests/db/conftest.py`, `runtime/tests/pipeline/conftest.py` | Ambos chamam `dsn_from_env`; `clean_slate` purga filas e trunca organizações |
| Read `supabase/config.toml`, `supabase/migrations/`, `.github/workflows/runtime.yml` | Fontes locais permitidas, pin e serviços excluídos |

Não alterar as fixtures neste pacote: `dsn` já precede `admin`, `_testing_schema` e `clean_slate`. A adaptação do trigger de signup pertence a W0-T3. Todos os blocos de implementação abaixo são conteúdo final: os blocos de métodos indicam explicitamente a classe em que entram; não há geração de código em runtime.

Interface pública:

```powershell
pwsh -NoProfile -File scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $runPath
pwsh -NoProfile -File scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $runPath
pwsh -NoProfile -File scripts/test-disposable-db.ps1 -Action Upgrade -RunDirectory $runPath -MigrationThrough 20260910010000
& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $runPath -TestTargets @('tests/db/test_rls_identity.py', 'tests/db/test_rls_e2.py')
pwsh -NoProfile -File scripts/test-disposable-db.ps1 -Action Stop -RunDirectory $runPath
```

`MigrationThrough` só aceita 14 dígitos e só vale em Prepare/Upgrade. Ausente = stream inteiro; presente = limite que deve existir no checkout. `TestTargets` só vale em Test; vazio = coleta RLS + DB + RLS + pipeline; não vazio = único subprocesso focal. Nodeids aceitam arquivo, função/classe e identificador parametrizado alfanumérico com `_`, `.`, `-`; outras gramáticas falham antes de pytest.

Arrays `TestTargets` são passados por chamada direta dentro do PowerShell (`& ./scripts/test-disposable-db.ps1 ... -TestTargets @('a','b')`). Não passar arrays através de `pwsh -File`: essa fronteira nativa não preserva `string[]`. Os exemplos `pwsh -File` deste plano usam somente parâmetros escalares. Um chamador que já está em PowerShell usa a chamada direta; o launcher transporta o array para Python como JSON por stdin, sem fronteira argv adicional.

Artefatos UTF-8 dentro do run:

| Arquivo | Schema exato / regra |
|---|---|
| `manifest.json` | Array ordenado não vazio de `{filename: str, sha256: str[64 uppercase hex], version: str[8 or 14 digits]}`; versões e nomes únicos; preservar `20260621_phase0_foundations.sql` exatamente |
| `manifest.prospective.json` | Mesmo schema; prefixo byte/hash/idêntico ao aprovado; só promovido após histórico e identidade verdes |
| `identity.json` | `{projectId,containerId,imageId,volumeName,port,systemIdentifier,sentinel}`; port inteiro 55322; IDs Docker completos; sentinel `null` apenas em prepared, 64 hex em ready |
| `gates.json` | `{commit,scope,state,commands,exitCodes,collectedRls,stage,failure}`; commands = arrays argv seguros; exitCodes = inteiros na mesma ordem; collectedRls = inteiro >=0; failure = null ou `{stage,kind,exitCode}` |
| `volumes-before.json` | Array de nomes capturado imediatamente antes de start |
| `unproven.json` | `{projectId,containerIds}` apenas IDs observados depois de falha sem identidade; não autoriza cleanup |
| `events.jsonl` | Objetos com stage, exitCode, SQLSTATEs e versões de migrations extraídos por gramáticas fechadas; nunca stdout/stderr cru |
| `artifacts/{db,rls,pipeline,focal}.xml` | JUnit expurgado para nomes/outcomes; sem mensagens, stdout, stderr, DSN ou sentinela |

`commit` vem de `git rev-parse HEAD` em cada ação. Em Test full ele só muda para o SHA atual depois de conferir manifesto = stream completo do checkout e ausência de alterações nos caminhos testados; essas condições são repetidas antes de cada pytest. Focal permite o prefixo exato identificado em manifest.json e mudanças TDD locais, portanto não certifica o SHA/onda como verde. `scope` é `setup`, `focal` ou `full`. `stage` é a última etapa, inclusive `stop`; `failure.stage` preserva a etapa que falhou. Exit code externo não zero é preservado; validação = 2; timeout = 124; executável ausente = 127; interrupção = 130. Falha de Stop não apaga a falha original.

Chave de ordenação de migrations: `(version, filename)` por strings ASCII, como `ORDER BY version` do histórico; não converter versão em inteiro nem completar zeros no manifesto. Limites e comparação de sufixo usam essa mesma ordem textual. A migration legada `20260621` permanece antes de `20260812000001`; novos limites `MigrationThrough` continuam exigindo 14 dígitos. Um conjunto em que essa ordem difere da ordem de filenames do CLI é recusado como ambíguo (por exemplo, versão de oito dígitos e outra de 14 no mesmo dia).

| Estado persistido | Ações admitidas | Próximo estado no sucesso |
|---|---|---|
| Diretório inexistente | Prepare | prepared |
| prepared | Replay, Stop | ready, stopped |
| ready | Upgrade, Test, Stop | ready, stopped, stopped |
| preparing, replaying, upgrading, testing, failed | Stop, se existe identidade comprovada | stopped |
| unproven | Nenhuma operação destrutiva | Evidência para guardião |
| stopped | Stop idempotente sem CLI; outras ações recusadas | stopped |

Transição inválida não inicia subprocesso operacional nem limpa projeto. Falha dentro de ação válida tenta Stop apenas se identidade persistida foi comprovada; se não, registra unproven. Lock exclusivo por execução impede processos simultâneos; lock abandonado exige inspeção do guardião, sem remoção automática.

Documentação consultada: flags de [start](https://supabase.com/docs/reference/cli/supabase-start), [reset](https://supabase.com/docs/reference/cli/supabase-db-reset), [migration up](https://supabase.com/docs/reference/cli/supabase-migration-up) e [stop](https://supabase.com/docs/reference/cli/supabase-stop). A instalação global encontrada nesta máquina falhou até em `--version`/`--help` ao gravar telemetria em `C:\Users\Usuario\.supabase`; sua versão não foi comprovada. A implementação exige executável nativo pinado no PATH e confirma versão/flags antes de start; não corrige instalação nem ignora esse erro silenciosamente.

### Task 1: Guarda compartilhada antes de qualquer fixture

**Files:** Create `runtime/tests/support/disposable_db.py`, `runtime/tests/unit/test_disposable_db_guard.py`; Modify `runtime/tests/support/database.py::dsn_from_env` e remover `DEFAULT_DSN`.

**Interfaces:** Consome `psycopg.conninfo.conninfo_to_dict`. Produz `validate_dsn(dsn: str) -> dict[str,str]`, `read_system_identifier(dsn: str) -> str`, `assert_database_identity(conn, *, system_identifier: str, sentinel: str) -> None`; mantém `dsn_from_env() -> str`.

- [ ] **Step 1: Criar o teste RED completo**

```python
import os
from unittest.mock import Mock, patch

import pytest

from tests.support import database
from tests.support.disposable_db import assert_database_identity, validate_dsn

DSN = "postgresql://postgres:postgres@127.0.0.1:55322/postgres"
SID = "1234567890123456789"
TOKEN = "a" * 64


@pytest.mark.parametrize("dsn", [
    "postgresql://postgres:postgres@db.example.test:55322/postgres",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "host=127.0.0.1 hostaddr=10.0.0.1 port=55322 dbname=postgres",
    "host=127.0.0.1,db.example.test port=55322 dbname=postgres",
    "service=production", "host=localhost port=55322 dbname=postgres",
    "host=127.0.0.1 port=55322 dbname=other",
])
def test_rejects_unproven_target(dsn):
    with pytest.raises(ValueError):
        validate_dsn(dsn)


def test_accepts_explicit_disposable_loopback():
    assert validate_dsn(DSN)["port"] == "55322"


@pytest.mark.parametrize("rows,calls", [
    ([("wrong",)], 1), ([(SID,), []], 2),
    ([(SID,), [("b" * 64,)]], 2),
    ([(SID,), [(TOKEN,), (TOKEN,)]], 2),
])
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


@pytest.mark.parametrize("missing", [
    "SUPABASE_DB_URL", "WORDER_TEST_DB_SYSTEM_IDENTIFIER", "WORDER_TEST_DB_SENTINEL",
])
def test_missing_env_never_connects(missing):
    values = {"SUPABASE_DB_URL": DSN, "WORDER_TEST_DB_SYSTEM_IDENTIFIER": SID,
              "WORDER_TEST_DB_SENTINEL": TOKEN}
    values.pop(missing)
    with patch.dict(os.environ, values, clear=True), patch.object(database.psycopg, "connect") as c:
        with pytest.raises(KeyError):
            database.dsn_from_env()
        c.assert_not_called()
```

- [ ] **Step 2: Rodar RED**

Run: `uv run --directory runtime pytest tests/unit/test_disposable_db_guard.py -q`.
Expected: `ModuleNotFoundError: tests.support.disposable_db`.

- [ ] **Step 3: Criar o helper completo**

```python
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
    if values.get("port") != "55322" or values.get("dbname") != "postgres":
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
    if not re.fullmatch(r"[0-9]+", system_identifier) or not re.fullmatch(r"[0-9a-f]{64}", sentinel):
        raise RuntimeError("missing database identity proof")
    row = conn.execute("select system_identifier::text from pg_control_system()").fetchone()
    if row != (system_identifier,):
        raise RuntimeError("test database identity mismatch")
    rows = conn.execute("select token from testing.disposable_identity").fetchall()
    if rows != [(sentinel,)]:
        raise RuntimeError("test database sentinel mismatch")
```

- [ ] **Step 4: Substituir a constante e função, preservando helpers async**

Adicionar import em `database.py` e substituir somente `DEFAULT_DSN`/`dsn_from_env`:

```python
from tests.support.disposable_db import assert_database_identity, validate_dsn


def dsn_from_env() -> str:
    """Only the disposable executor can provide all three required proofs."""
    dsn = os.environ["SUPABASE_DB_URL"]
    system_identifier = os.environ["WORDER_TEST_DB_SYSTEM_IDENTIFIER"]
    sentinel = os.environ["WORDER_TEST_DB_SENTINEL"]
    validate_dsn(dsn)
    with psycopg.connect(dsn, connect_timeout=3, options="-c statement_timeout=3000") as conn:
        assert_database_identity(conn, system_identifier=system_identifier, sentinel=sentinel)
    return dsn
```

- [ ] **Step 5: GREEN, Ruff focal e commit**

```powershell
uv run --directory runtime pytest tests/unit/test_disposable_db_guard.py -q
uv run --directory runtime ruff check tests/support/disposable_db.py tests/support/database.py tests/unit/test_disposable_db_guard.py
git add runtime/tests/support/disposable_db.py runtime/tests/support/database.py runtime/tests/unit/test_disposable_db_guard.py
git commit -m "test: fail closed before destructive database fixtures"
```

Expected: PASS, sem conexão real. Rollback: revert deste commit apenas em conjunto com substituto equivalente da guarda; jamais voltar a usar 54322 como fallback para os gates.

### Task 2: Configuração fechada, caminhos e manifesto imutável

**Files:** Create `runtime/tests/support/disposable_executor.py`, `runtime/tests/unit/test_disposable_executor.py`.

**Interfaces:** Produz `config_text(text, project, enabled, *, source=False) -> str`, `inventory(folder, through=None) -> list[dict]`, `prospective(old, current) -> list[dict]`, `safe_run(repo, value) -> Path`, `targets(repo, values) -> list[str]`, `write_json(path, value)`, `read_json(path)`.

- [ ] **Step 1: Escrever testes RED**

```python
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
    assert 'project_id = "' + PROJECT + '"' in rendered
    assert "port = 55322" in rendered
    assert ex.tomllib.loads(rendered)["db"]["migrations"]["enabled"] is False
    assert ex.tomllib.loads(ex.config_text(rendered, PROJECT, True))["db"]["seed"]["enabled"] is False


@pytest.mark.parametrize("mutate", [
    lambda s: s.replace("port = 54322", "port = 54322\nport = 54323"),
    lambda s: s.replace("[db.migrations]", "[db.other]"),
    lambda s: s + "\n[db.seed]\nenabled = true\n",
    lambda s: s.replace("schema_paths = []", 'schema_paths = ["../outside.sql"]'),
])
def test_config_rejects_ambiguous_or_extra_sources(mutate):
    source = (REPO / "supabase/config.toml").read_text(encoding="utf-8")
    with pytest.raises((ValueError, ex.tomllib.TOMLDecodeError)):
        ex.config_text(mutate(source), PROJECT, False, source=True)


def test_prospective_is_suffix_only_and_does_not_mutate_approved():
    first = {"filename": "20260812000001_a.sql", "version": "20260812000001", "sha256": "A" * 64}
    second = {"filename": "20260812000002_b.sql", "version": "20260812000002", "sha256": "B" * 64}
    old = [first]
    assert ex.prospective(old, [first, second]) == [first, second]
    changed = copy.deepcopy(first)
    changed["sha256"] = "C" * 64
    for bad in [[changed, second], [second], []]:
        with pytest.raises(ValueError):
            ex.prospective(old, bad)
    assert old == [first]


@pytest.mark.parametrize("target", [
    "--collect-only", "tests/db/../unit/x.py", "tests/db/x.py\n--help",
    "tests/db/x.py::test_x;whoami", "tests/db/x.py::test_x$(whoami)",
])
def test_target_is_not_shell_or_pytest_options(target):
    with pytest.raises(ValueError):
        ex.targets(REPO, [target])
```

- [ ] **Step 2: Rodar RED**

Run: `uv run --directory runtime pytest tests/unit/test_disposable_executor.py -q`.
Expected: import do módulo ausente.

- [ ] **Step 3: Criar imports, constantes e helpers de arquivos completos**

```python
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

from tests.support.disposable_db import assert_database_identity, read_system_identifier

EXCLUDED = ("realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,"
            "studio,edge-runtime,logflare,vector,supavisor")
DSN = "postgresql://postgres:postgres@127.0.0.1:55322/postgres"
SID_SQL = "select system_identifier::text from pg_control_system()"
HISTORY_SQL = "select version from supabase_migrations.schema_migrations order by version"
TOKEN_RE = r"[0-9a-f]{64}"
NAME_RE = r"([0-9]{8}|[0-9]{14})_[A-Za-z0-9_]+\.sql"
EXPECTED = {
    "project_id": "worder1",
    "api": {"enabled": True, "port": 54321, "schemas": ["public", "graphql_public"],
            "extra_search_path": ["public", "extensions"], "max_rows": 1000},
    "db": {"port": 54322, "shadow_port": 54320, "major_version": 17,
           "pooler": {"enabled": False},
           "migrations": {"enabled": True, "schema_paths": []},
           "seed": {"enabled": False, "sql_paths": []}},
    "realtime": {"enabled": True}, "studio": {"enabled": False},
    "storage": {"enabled": False},
    "auth": {"enabled": True, "site_url": "http://127.0.0.1:3000", "jwt_expiry": 3600,
             "enable_signup": True, "enable_anonymous_sign_ins": False,
             "minimum_password_length": 6},
    "edge_runtime": {"enabled": False}, "analytics": {"enabled": False},
}


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def no_links(path):
    for item in (path, *path.parents):
        if item.exists() or item.is_symlink():
            info = item.lstat()
            require(not item.is_symlink() and not (
                getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
            ), "linked path refused")


def safe_run(repo, value):
    supplied = Path(value)
    require(supplied.is_absolute(), "RunDirectory must be absolute")
    no_links(supplied)
    root = (repo / ".superpowers/sdd/auditoria-ia-disposable").resolve()
    path = supplied.resolve()
    require(path.parent == root and re.fullmatch(r"[0-9a-f]{32}", path.name),
            "RunDirectory must be a direct nonce child")
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
        before["db"]["migrations"]["enabled"] = actual.get("db", {}).get("migrations", {}).get("enabled")
        require(type(before["db"]["migrations"]["enabled"]) is bool, "missing migrations flag")
    require(actual == before, "unexpected config schema or value")
    edits = {("", "project_id"): json.dumps(project), ("api", "port"): "55321",
             ("db", "port"): "55322", ("db", "shadow_port"): "55320",
             ("db.migrations", "enabled"): str(enabled).lower(),
             ("db.seed", "enabled"): "false", ("storage", "enabled"): "false"}
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
        require(isinstance(row, dict) and set(row) == {"filename", "sha256", "version"},
                "invalid manifest keys")
        require(all(isinstance(v, str) for v in row.values()), "invalid manifest values")
        match = re.fullmatch(NAME_RE, row["filename"])
        require(match and match[1] == row["version"] and
                re.fullmatch(r"[0-9A-F]{64}", row["sha256"]), "invalid migration entry")
    ordered = sorted(rows, key=lambda r: (r["version"], r["filename"]))
    require(rows == ordered, "unordered manifest")
    require(ordered == sorted(rows, key=lambda r: r["filename"]), "ambiguous legacy version order")
    require(len({r["version"] for r in rows}) == len(rows), "duplicate migration version")
    require(len({r["filename"].casefold() for r in rows}) == len(rows), "duplicate filename")
    return rows


def inventory(folder, through=None):
    no_links(folder)
    rows = []
    for file in sorted(folder.iterdir()):
        no_links(file)
        match = re.fullmatch(NAME_RE, file.name)
        require(file.is_file() and match, "unexpected migration directory entry")
        rows.append({"filename": file.name, "version": match[1],
                     "sha256": hashlib.sha256(file.read_bytes()).hexdigest().upper()})
    manifest_shape(rows)
    if through:
        require(re.fullmatch(r"[0-9]{14}", through), "invalid migration limit")
        require(through in {r["version"] for r in rows}, "unknown migration limit")
        rows = [r for r in rows if r["version"] <= through]
    return manifest_shape(rows)


def prospective(old, current):
    manifest_shape(old)
    manifest_shape(current)
    require(current[:len(old)] == old, "history is not an immutable prefix")
    require(all(r["version"] > old[-1]["version"] for r in current[len(old):]),
            "out-of-order migration")
    return copy.deepcopy(current)


def targets(repo, values):
    require(isinstance(values, list) and all(isinstance(v, str) for v in values),
            "invalid TestTargets")
    grammar = (r"tests/(unit|db|pipeline)/[A-Za-z0-9_/-]+\.py"
               r"(?:::[A-Za-z_][A-Za-z0-9_]*(?:\[[A-Za-z0-9_.-]+\])?)*")
    for value in values:
        require(re.fullmatch(grammar, value) and ".." not in value, "invalid test target")
        file = repo / "runtime" / value.split("::", 1)[0]
        no_links(file)
        require(file.is_file() and file.resolve().is_relative_to((repo / "runtime/tests").resolve()),
                "test target escaped test root")
    return values
```

- [ ] **Step 4: GREEN e commit focal**

```powershell
uv run --directory runtime pytest tests/unit/test_disposable_executor.py -q
git add runtime/tests/support/disposable_executor.py runtime/tests/unit/test_disposable_executor.py
git commit -m "test: define closed disposable config and migration manifest"
```

Imports das próximas tarefas permanecem somente durante a montagem sequencial do helper; o gate Ruff do pacote completo ocorre na Task 8. Rollback: revert do commit, nenhum banco criado.

### Task 3: Processo síncrono, evidência segura e identidade física

**Files:** Modify `runtime/tests/support/disposable_executor.py`; append testes em `runtime/tests/unit/test_disposable_executor.py`.

**Interfaces:** `run_process(argv, *, cwd, env, input=None, timeout=600) -> CompletedProcess`; `inspect_record(data, project, before, prior=None) -> dict`; classe `Executor(repo, run, *, runner=run_process)` com `command`, `save`, `physical`, `proof`, `files`, `history`, `local` e `psql`. `runner` é o único seam de processos e só é injetável por Python nos testes; a interface pública não aceita executáveis ou comandos livres.

- [ ] **Step 1: Acrescentar RED da identidade e formato de evidência**

```python
def container_record():
    return {"Id": "a" * 64, "Name": "/supabase_db_" + PROJECT,
            "Image": "sha256:" + "b" * 64,
            "State": {"Running": True},
            "Config": {"Image": "public.ecr.aws/supabase/postgres:17.6.1.054",
                       "Labels": {"com.supabase.cli.project": PROJECT}},
            "NetworkSettings": {"Ports": {"5432/tcp": [
                {"HostPort": "55322", "HostIp": "127.0.0.1"}]}},
            "Mounts": [{"Type": "volume", "Destination": "/var/lib/postgresql/data",
                        "Name": "supabase_db_" + PROJECT}]}


@pytest.mark.parametrize("mutation", [
    lambda d: d.update(Id="short"),
    lambda d: d.update(Name="/another"),
    lambda d: d["State"].update(Running=False),
    lambda d: d["Config"]["Labels"].update({"com.supabase.cli.project": "existing"}),
    lambda d: d["Config"].update(Image="postgres:17"),
    lambda d: d.update(Image="sha256:short"),
    lambda d: d["NetworkSettings"]["Ports"]["5432/tcp"][0].update(HostPort="54322"),
    lambda d: d["NetworkSettings"]["Ports"]["5432/tcp"][0].update(HostIp="10.0.0.1"),
    lambda d: d["NetworkSettings"]["Ports"]["5432/tcp"].append(
        {"HostPort": "55322", "HostIp": "::"}),
    lambda d: d["Mounts"][0].update(Type="bind"),
    lambda d: d["Mounts"][0].update(Destination="/elsewhere"),
    lambda d: d["Mounts"].append(copy.deepcopy(d["Mounts"][0])),
])
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


def test_gate_serialization_has_no_process_output_or_dsn(tmp_path):
    def runner(argv, **kw):
        return ex.subprocess.CompletedProcess(argv, 0, "ok", "")
    executor = ex.Executor(REPO, tmp_path, runner=runner)
    executor.command("git", "rev-parse", "HEAD")
    saved = json.loads((tmp_path / "gates.json").read_text())
    assert len(saved["commands"]) == len(saved["exitCodes"]) == 1
    assert set(saved) == {"commit", "scope", "state", "commands", "exitCodes",
                          "collectedRls", "stage", "failure"}
    assert "postgresql://" not in json.dumps(saved)
    assert "stdout" not in json.dumps(saved)
```

- [ ] **Step 2: Rodar RED**

Run: `uv run --directory runtime pytest tests/unit/test_disposable_executor.py -q`.
Expected: `inspect_record`/`Executor` ausentes; nenhuma CLI real é chamada pelo double.

- [ ] **Step 3: Acrescentar funções de processo e identidade após `targets`**

```python
class CommandFailure(RuntimeError):
    def __init__(self, code):
        super().__init__("subprocess failed")
        self.code = code


def child_env(identity=None):
    allowed = {"PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP",
               "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "LANG", "LC_ALL", "CI"}
    result = {k: v for k, v in os.environ.items() if k.upper() in allowed}
    result["PYTHONUTF8"] = "1"
    result["NO_COLOR"] = "1"
    if identity:
        result.update(SUPABASE_DB_URL=DSN,
                      WORDER_TEST_DB_SYSTEM_IDENTIFIER=identity["systemIdentifier"],
                      WORDER_TEST_DB_SENTINEL=identity["sentinel"])
    return result


def run_process(argv, *, cwd, env, input=None, timeout=600):
    executable = shutil.which(argv[0] + (".exe" if os.name == "nt" else ""))
    if not executable or Path(executable).suffix.lower() in {".cmd", ".bat", ".ps1"}:
        return subprocess.CompletedProcess(argv, 127, "", "")
    process = subprocess.Popen(
        [executable, *argv[1:]], cwd=cwd, env=env, shell=False,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace",
        start_new_session=os.name != "nt",
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
    )
    try:
        stdout, stderr = process.communicate(input=input, timeout=timeout)
        code = process.returncode
    except (subprocess.TimeoutExpired, KeyboardInterrupt) as error:
        if os.name == "nt":
            subprocess.run(["taskkill.exe", "/PID", str(process.pid), "/T", "/F"],
                           capture_output=True, check=False, timeout=30, shell=False)
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
    require(isinstance(data, list) and len(data) == 1, "DB container not unique")
    db = data[0]
    require(db["Name"] == "/supabase_db_" + project, "container name mismatch")
    require(re.fullmatch(r"[0-9a-f]{64}", db["Id"]), "invalid container id")
    require(db["State"]["Running"] is True, "DB container not running")
    require(db["Config"]["Labels"].get("com.supabase.cli.project") == project,
            "project label mismatch")
    require(re.search(r"(^|/)supabase/postgres:", db["Config"]["Image"]), "unexpected DB image")
    require(re.fullmatch(r"sha256:[0-9a-f]{64}", db["Image"]), "invalid image id")
    mapping = db["NetworkSettings"]["Ports"].get("5432/tcp")
    require(isinstance(mapping, list) and len(mapping) == 1 and
            mapping[0]["HostPort"] == "55322" and
            mapping[0]["HostIp"] in {"127.0.0.1", "0.0.0.0"}, "port mapping mismatch")
    volumes = [m for m in db["Mounts"] if
               m["Destination"].startswith("/var/lib/postgresql/data") or
               "/var/lib/postgresql/data".startswith(m["Destination"].rstrip("/") + "/")]
    require(len(volumes) == 1 and volumes[0]["Type"] == "volume" and
            volumes[0]["Destination"] == "/var/lib/postgresql/data", "ambiguous data mount")
    volume = volumes[0]["Name"]
    require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", volume) and volume not in before,
            "DB volume is not new")
    result = {"projectId": project, "containerId": db["Id"], "imageId": db["Image"],
              "volumeName": volume, "port": 55322}
    if prior:
        require(all(prior.get(k) == v for k, v in result.items()), "physical identity changed")
    return result


def identity_shape(value, project):
    require(isinstance(value, dict) and set(value) == {
        "projectId", "containerId", "imageId", "volumeName", "port", "systemIdentifier", "sentinel"
    }, "invalid identity keys")
    require(value["projectId"] == project and value["port"] == 55322, "identity target mismatch")
    require(re.fullmatch(r"[0-9a-f]{64}", value["containerId"]) and
            re.fullmatch(r"sha256:[0-9a-f]{64}", value["imageId"]) and
            re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", value["volumeName"]) and
            re.fullmatch(r"[0-9]+", value["systemIdentifier"]), "invalid identity values")
    require(value["sentinel"] is None or re.fullmatch(TOKEN_RE, value["sentinel"]),
            "invalid sentinel")
    return value


def gate_shape(gate):
    require(set(gate) == {"commit", "scope", "state", "commands", "exitCodes",
                          "collectedRls", "stage", "failure"}, "invalid gates keys")
    require(gate["commit"] is None or re.fullmatch(r"[0-9a-f]{40}", gate["commit"]),
            "invalid commit")
    require(gate["scope"] in {"setup", "focal", "full"} and gate["state"] in {
        "preparing", "prepared", "replaying", "ready", "upgrading", "testing",
        "failed", "unproven", "stopped"
    }, "invalid gates scope or state")
    require(isinstance(gate["commands"], list) and isinstance(gate["exitCodes"], list) and
            len(gate["commands"]) == len(gate["exitCodes"]), "unpaired command results")
    require(all(isinstance(c, list) and c and all(isinstance(a, str) for a in c)
                for c in gate["commands"]), "invalid command argv")
    require(all(type(c) is int for c in gate["exitCodes"]) and
            type(gate["collectedRls"]) is int and gate["collectedRls"] >= 0, "invalid counts")
    require(isinstance(gate["stage"], str), "invalid stage")
    failure = gate["failure"]
    require(failure is None or (isinstance(failure, dict) and
            set(failure) == {"stage", "kind", "exitCode"} and
            isinstance(failure["stage"], str) and isinstance(failure["kind"], str) and
            type(failure["exitCode"]) is int), "invalid failure")
    require("postgresql://" not in json.dumps(gate), "DSN in gates")
    return gate
```

O subprocesso usa stdin exclusivamente para SQL da sentinela; DSN nunca vira argv. `child_env()` devolve um novo dict com uma allowlist de variáveis de plataforma. Isso impede herdar `PGSERVICE`, `PGHOSTADDR`, `SUPABASE_WORKDIR`, `UV_ENV_FILE`, `PYTEST_ADDOPTS` e credenciais de provedores; o ambiente do processo pai permanece byte a byte igual e não precisa ser reatribuído no final. O processo filho recebe as três envs apenas para pytest.

- [ ] **Step 4: Acrescentar a classe e métodos básicos**

```python
class Executor:
    def __init__(self, repo, run, *, runner=run_process):
        self.repo, self.run, self.runner = Path(repo), Path(run), runner
        self.project = "worder-audit-" + self.run.name
        self.identity = None
        self.gate = {"commit": None, "scope": "setup", "state": "preparing",
                     "commands": [], "exitCodes": [], "collectedRls": 0,
                     "stage": "preflight", "failure": None}

    def save(self):
        write_json(self.run / "gates.json", gate_shape(self.gate))

    def command(self, tool, *arguments, stdin=None, identity=None, timeout=600, check=True):
        argv = [tool, *(str(a) for a in arguments)]
        try:
            result = self.runner(argv, cwd=self.repo, env=child_env(identity),
                                 input=stdin, timeout=timeout)
        except OSError:
            result = subprocess.CompletedProcess(argv, 127, "", "")
        self.gate["commands"].append(argv)
        self.gate["exitCodes"].append(result.returncode)
        self.save()
        output = (result.stdout or "") + "\n" + (result.stderr or "")
        event = {"stage": self.gate["stage"], "exitCode": result.returncode,
                 "sqlstates": sorted(set(re.findall(r"SQLSTATE[ :]+([0-9A-Z]{5})", output))),
                 "migrations": sorted(set(re.findall(r"\b([0-9]{8}|[0-9]{14})_[A-Za-z0-9_]+\.sql\b", output)))}
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
        return self.command("docker", "exec", "-i", container_id, "psql", "-X", "-v",
                            "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-At",
                            stdin=sql + "\n", timeout=30).stdout.strip()

    def config(self, enabled=None):
        path = self.run / "supabase/config.toml"
        no_links(path)
        text = path.read_text(encoding="utf-8")
        parsed = tomllib.loads(text)
        actual = parsed.get("db", {}).get("migrations", {}).get("enabled")
        checked = config_text(text, self.project, actual if enabled is None else enabled)
        if enabled is not None:
            path.write_text(checked, encoding="utf-8", newline="\n")
        for name in (".env", "supabase/.env", "supabase/seed.sql", "supabase/roles.sql",
                     "supabase/.temp/project-ref", "supabase/.branches"):
            require(not (self.run / name).exists(), "unexpected project input")

    def files(self, expected=None):
        self.config()
        approved = manifest_shape(read_json(self.run / "manifest.json")) if expected is None else expected
        require(inventory(self.run / "supabase/migrations") == approved, "copied migration changed")
        return approved

    def physical(self):
        self.config()
        before = read_json(self.run / "volumes-before.json")
        require(isinstance(before, list) and all(isinstance(v, str) for v in before),
                "invalid volume inventory")
        target = self.identity["containerId"] if self.identity else "supabase_db_" + self.project
        result = self.command("docker", "inspect", target, timeout=30)
        physical = inspect_record(json.loads(result.stdout), self.project, before, self.identity)
        direct = self.psql(physical["containerId"], SID_SQL)
        require(re.fullmatch(r"[0-9]+", direct), "invalid direct system identifier")
        require(read_system_identifier(DSN) == direct, "loopback identity mismatch")
        if self.identity:
            require(direct == self.identity["systemIdentifier"], "database system identifier changed")
        return dict(physical, systemIdentifier=direct, sentinel=None)

    def proof(self):
        require(self.identity is not None and self.identity["sentinel"] is not None,
                "sentinel proof unavailable")
        self.physical()
        with psycopg.connect(DSN, connect_timeout=3, options="-c statement_timeout=3000") as conn:
            assert_database_identity(conn, system_identifier=self.identity["systemIdentifier"],
                                     sentinel=self.identity["sentinel"])

    def history(self, expected):
        actual = self.psql(self.identity["containerId"], HISTORY_SQL).splitlines()
        require(actual == [r["version"] for r in expected], "migration history mismatch")
```

- [ ] **Step 5: GREEN e commit**

```powershell
uv run --directory runtime pytest tests/unit/test_disposable_executor.py -q
git add runtime/tests/support/disposable_executor.py runtime/tests/unit/test_disposable_executor.py
git commit -m "test: prove disposable physical identity and preserve process evidence"
```

Expected: guards negativos e JSON PASS sem Docker. `commit=null` só é válido enquanto `git rev-parse` ainda não foi comprovado ou falhou; nenhum estado prepared/ready é promovido sem SHA válido. Rollback: revert do commit, ainda sem operação real.

### Task 4: Prepare com preflight e inventário anteriores ao start

**Files:** Modify `runtime/tests/support/disposable_executor.py`, `runtime/tests/unit/test_disposable_executor.py`.

**Interfaces:** Acrescenta `Executor.prepare(through=None) -> None`, `Executor.preflight() -> None`; consome os helpers das Tasks 2–3. `prepare` só é chamado pelo lifecycle depois de criar diretório novo e capturar SHA.

- [ ] **Step 1: Acrescentar RED sem Docker**

```python
def test_prepare_rejects_wrong_cli_before_start(tmp_path):
    calls = []
    def fake(argv, **kwargs):
        calls.append(argv)
        return ex.subprocess.CompletedProcess(argv, 0, "9.9.9", "")
    run = tmp_path / ("a" * 32)
    run.mkdir()
    executor = ex.Executor(REPO, run, runner=fake)
    with pytest.raises(ValueError, match="CLI version"):
        executor.preflight()
    assert not any("start" in call for call in calls)


def test_busy_port_is_refused_without_start(monkeypatch, tmp_path):
    from unittest.mock import MagicMock
    sock = MagicMock()
    sock.bind.side_effect = OSError("in use")
    monkeypatch.setattr(ex.socket, "socket", lambda *a: sock)
    with pytest.raises(ValueError, match="disposable port occupied"):
        ex.free_ports()
```

- [ ] **Step 2: Rodar RED**

Run: `uv run --directory runtime pytest tests/unit/test_disposable_executor.py -q`.
Expected: métodos/helper ausentes.

- [ ] **Step 3: Acrescentar `free_ports` fora da classe, antes de `Executor`**

```python
def free_ports():
    listeners = []
    try:
        for port in (55320, 55321, 55322):
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
```

- [ ] **Step 4: Acrescentar os métodos abaixo dentro de `Executor`, depois de `history`**

```python
    def preflight(self):
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
        context = self.command("docker", "context", "inspect", "--format",
                               "{{json .Endpoints.docker.Host}}", timeout=30).stdout.strip()
        endpoint = json.loads(context)
        require(endpoint in {"unix:///var/run/docker.sock", "npipe:////./pipe/docker_engine",
                             "npipe:////./pipe/dockerDesktopLinuxEngine"}, "non-local Docker context")

    def prepare(self, through=None):
        self.preflight()
        source_config = self.repo / "supabase/config.toml"
        no_links(source_config)
        text = config_text(source_config.read_text(encoding="utf-8"), self.project,
                           False, source=True)
        source = inventory(self.repo / "supabase/migrations", through)
        folder = self.run / "supabase/migrations"
        folder.mkdir(parents=True)
        (self.run / "supabase/config.toml").write_text(text, encoding="utf-8", newline="\n")
        for row in source:
            shutil.copyfile(self.repo / "supabase/migrations" / row["filename"],
                            folder / row["filename"])
        copied = inventory(folder)
        require(copied == source, "migration changed while copying")
        write_json(self.run / "manifest.json", copied)
        self.files()
        free_ports()
        existing = self.command("docker", "ps", "-a", "--no-trunc", "--filter",
                                "label=com.supabase.cli.project=" + self.project,
                                "--format", "{{.ID}}", timeout=30).stdout.strip()
        require(not existing, "nonce already owns Docker containers")
        before = self.command("docker", "volume", "ls", "--format", "{{.Name}}",
                              timeout=30).stdout.splitlines()
        write_json(self.run / "volumes-before.json", before)
        self.gate["stage"] = "start"
        self.local("start", "-x", EXCLUDED)
        self.gate["stage"] = "prepare-identity"
        self.identity = self.physical()
        write_json(self.run / "identity.json", identity_shape(self.identity, self.project))
        self.gate["state"] = "prepared"
        self.save()
```

A cópia usa `shutil.copyfile` individual para cada caminho do inventário; é a tradução semântica do `Copy-Item -LiteralPath` de W0-T2. Só config e migrations são copiadas. A função não lê `.env`, não executa `supabase status`, não cria seed e não consulta credencial remota. Portas são verificadas antes de start; a prova independente da identidade detecta troca de endpoint após esse preflight.

- [ ] **Step 5: GREEN e commit**

```powershell
uv run --directory runtime pytest tests/unit/test_disposable_executor.py -q
git add runtime/tests/support/disposable_executor.py runtime/tests/unit/test_disposable_executor.py
git commit -m "test: prepare a uniquely scoped local Supabase project"
```

Rollback: parar somente via Task 7 depois que houver identity comprovada; se start falhar antes da prova, guardar os IDs observados e não inferir cleanup.

### Task 5: Replay integral, sentinela independente e histórico exato

**Files:** Modify `runtime/tests/support/disposable_executor.py`, `runtime/tests/unit/test_disposable_executor.py`.

**Interfaces:** Acrescenta `Executor.replay() -> None`. Só admite prepared; confere manifesto/identidade antes de reset e novamente depois; promove ready após sentinela/histórico.

- [ ] **Step 1: Acrescentar RED da ordem destrutiva**

```python
def test_replay_does_not_reset_if_physical_proof_fails(monkeypatch, tmp_path):
    executor = ex.Executor(REPO, tmp_path, runner=lambda *a, **k: pytest.fail("unexpected CLI"))
    monkeypatch.setattr(executor, "files", lambda: [])
    def fail():
        raise ValueError("loopback identity mismatch")
    monkeypatch.setattr(executor, "physical", fail)
    with pytest.raises(ValueError, match="identity mismatch"):
        executor.replay()


def test_history_rejects_extra_missing_and_duplicate_versions(monkeypatch, tmp_path):
    executor = ex.Executor(REPO, tmp_path)
    executor.identity = {"containerId": "a" * 64}
    expected = [{"version": "20260812000001"}]
    for output in ("", "20260812000002", "20260812000001\n20260812000001"):
        monkeypatch.setattr(executor, "psql", lambda *args, value=output: value)
        with pytest.raises(ValueError, match="history mismatch"):
            executor.history(expected)
```

- [ ] **Step 2: Rodar RED**

Run: `uv run --directory runtime pytest tests/unit/test_disposable_executor.py -q`.
Expected: `replay` ausente; caso de histórico já verde da Task 3.

- [ ] **Step 3: Acrescentar dentro de `Executor`, depois de `prepare`**

```python
    def replay(self):
        self.gate.update(state="replaying", stage="replay-preflight")
        approved = self.files()
        self.physical()
        self.config(True)
        self.gate["stage"] = "reset"
        self.save()
        self.local("db", "reset", "--local", "--no-seed")
        self.gate["stage"] = "replay-identity"
        self.physical()
        self.files()
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
        write_json(self.run / "identity.json", identity_shape(self.identity, self.project))
        self.gate["state"] = "ready"
        self.save()
```

Sentinela não integra migrations e não depende de fixtures. `SCHEMA_SQL` de fake channel e `GATE_SQL` de holdable criam somente suas tabelas, sem reabrir grants da sentinela; seus clientes usam conexão privilegiada própria. Se um papel obrigatório estiver ausente, Replay falha; não omitir o REVOKE para obter verde. A consulta do container usa seu ID completo; a leitura psycopg usa somente loopback gerado internamente. Alteração de container, imagem, volume ou system identifier depois de reset é recusa, nunca atualização silenciosa da identidade.

- [ ] **Step 4: GREEN e commit**

```powershell
uv run --directory runtime pytest tests/unit/test_disposable_executor.py -q
git add runtime/tests/support/disposable_executor.py runtime/tests/unit/test_disposable_executor.py
git commit -m "test: verify full replay before issuing database sentinel"
```

Rollback: descartar somente projeto provado via Stop. A primeira operação real pode falhar por schema legado; preservar estágio reset, SQLSTATE e versão no evento, não introduzir dumps/seed nem tentar consertar schema neste pacote.

### Task 6: Upgrade prospectivo sem reset e sem promover manifesto em falha

**Files:** Modify `runtime/tests/support/disposable_executor.py`, `runtime/tests/unit/test_disposable_executor.py`.

**Interfaces:** Acrescenta `Executor.upgrade(through=None) -> None`; consome manifest aprovado, prova e histórico. Produz manifesto prospectivo, depois manifesto aprovado somente no sucesso; noop comprovado preserva ready.

- [ ] **Step 1: Acrescentar RED de falha durante aplicação**

```python
def test_upgrade_failure_never_promotes_manifest(monkeypatch, tmp_path):
    first = {"filename": "20260812000001_a.sql", "version": "20260812000001", "sha256": "A" * 64}
    second = {"filename": "20260812000002_b.sql", "version": "20260812000002", "sha256": "B" * 64}
    ex.write_json(tmp_path / "manifest.json", [first])
    executor = ex.Executor(REPO, tmp_path)
    monkeypatch.setattr(executor, "proof", lambda: None)
    monkeypatch.setattr(executor, "files", lambda expected=None: [first] if expected is None else expected)
    monkeypatch.setattr(executor, "history", lambda rows: None)
    monkeypatch.setattr(ex, "inventory", lambda *a: [first, second])
    monkeypatch.setattr(ex.shutil, "copyfile", lambda *a: None)
    def fail(*arguments):
        assert arguments == ("migration", "up", "--local")
        raise ex.CommandFailure(17)
    monkeypatch.setattr(executor, "local", fail)
    with pytest.raises(ex.CommandFailure) as result:
        executor.upgrade("20260812000002")
    assert result.value.code == 17
    assert ex.read_json(tmp_path / "manifest.json") == [first]
    assert ex.read_json(tmp_path / "manifest.prospective.json") == [first, second]
```

- [ ] **Step 2: Rodar RED**

Run: `uv run --directory runtime pytest tests/unit/test_disposable_executor.py -q`.
Expected: `upgrade` ausente.

- [ ] **Step 3: Acrescentar dentro de `Executor`, depois de `replay`**

```python
    def upgrade(self, through=None):
        self.gate.update(state="upgrading", stage="upgrade-preflight")
        old = self.files()
        self.proof()
        self.history(old)
        if through:
            require(through >= old[-1]["version"], "migration limit precedes applied history")
        current = inventory(self.repo / "supabase/migrations", through)
        new = prospective(old, current)
        write_json(self.run / "manifest.prospective.json", new)
        if new != old:
            for row in new[len(old):]:
                destination = self.run / "supabase/migrations" / row["filename"]
                require(not destination.exists(), "new migration already exists")
                shutil.copyfile(self.repo / "supabase/migrations" / row["filename"], destination)
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
```

O prefixo exato compara nome, versão e hash de todo o checkout selecionado: edição de migration antiga, arquivo removido, nova versão abaixo da maior aplicada e rename são recusados. `--include-all`, repair e reset nunca integram o comando Upgrade. A comparação de histórico é antes e depois; a prova usa a mesma sentinela e `systemIdentifier`. O lifecycle da Task 7 registra falha e para somente o projeto aprovado, mantendo o prospectivo sem promoção.

- [ ] **Step 4: GREEN e commit**

```powershell
uv run --directory runtime pytest tests/unit/test_disposable_executor.py -q
git add runtime/tests/support/disposable_executor.py runtime/tests/unit/test_disposable_executor.py
git commit -m "test: upgrade only an immutable migration suffix"
```

Rollback: Stop do projeto e novo nonce; não desfazer DDL parcialmente aplicado, não substituir o manifesto anterior em falha, não executar repair. Preservação de dados sintéticos entre ondas é teste de W0-T3/T4 e consumirá este contrato pronto.

### Task 7: Test serial, Stop comprovado, lifecycle e dispatch PowerShell

**Files:** Modify `runtime/tests/support/disposable_executor.py`, `runtime/tests/unit/test_disposable_executor.py`; Create `scripts/test-disposable-db.ps1`.

**Interfaces:** Acrescenta `sanitize_report(path, sentinel) -> dict[str,int]`, `Executor.test(test_targets)`, `Executor.stop()`, `Executor.execute(action, test_targets=None, through=None) -> int`, `main() -> int`. Somente `main` resolve o repo real; testes injetam repo temporário e `runner` falso. PowerShell transmite JSON por stdin para `python -m tests.support.disposable_executor` no diretório runtime.

- [ ] **Step 1: Acrescentar RED de lifecycle e execução serial**

```python
def run_fixture(tmp_path):
    repo = tmp_path / "repo"
    repo.mkdir()
    run = repo / ".superpowers/sdd/auditoria-ia-disposable" / ("a" * 32)
    run.mkdir(parents=True)
    identity = dict(ex.inspect_record([container_record()], PROJECT, []),
                    systemIdentifier="1234567890123456789", sentinel="d" * 64)
    ex.write_json(run / "identity.json", identity)
    executor = ex.Executor(repo, run, runner=lambda argv, **kw:
                           ex.subprocess.CompletedProcess(argv, 0, "e" * 40, ""))
    executor.gate.update(commit="e" * 40, state="ready")
    executor.save()
    return executor


@pytest.mark.parametrize("action", ["Replay", "Upgrade", "Test"])
def test_stopped_run_rejects_reuse_without_any_process(tmp_path, action):
    executor = run_fixture(tmp_path)
    executor.gate["state"] = "stopped"
    executor.save()
    executor.runner = lambda *a, **k: pytest.fail("process started on stopped run")
    with pytest.raises(ValueError, match="invalid transition"):
        executor.execute(action)


@pytest.mark.parametrize("fails", [False, True])
def test_test_always_stops_and_preserves_failure(monkeypatch, tmp_path, fails):
    executor = run_fixture(tmp_path)
    stopped = []
    monkeypatch.setattr(executor, "preflight", lambda: None)
    monkeypatch.setattr(executor, "source", lambda focal: [])
    monkeypatch.setattr(executor, "clean_commit", lambda commit: None)
    def test_action(values):
        executor.gate["stage"] = "focal"
        if fails:
            raise ex.CommandFailure(9)
    def stop_action():
        stopped.append(True)
        executor.gate["state"] = "stopped"
    monkeypatch.setattr(executor, "test", test_action)
    monkeypatch.setattr(executor, "stop", stop_action)
    assert executor.execute("Test") == (9 if fails else 0)
    assert stopped == [True]
    gate = ex.read_json(executor.run / "gates.json")
    assert gate["state"] == "stopped"
    assert gate["failure"] == ({"stage": "focal", "kind": "CommandFailure", "exitCode": 9}
                               if fails else None)


def test_environment_is_unchanged_and_pytest_overrides_do_not_leak(monkeypatch):
    monkeypatch.setenv("SUPABASE_DB_URL", "must-not-be-inherited")
    monkeypatch.setenv("PYTEST_ADDOPTS", "--collect-only")
    monkeypatch.setenv("PGHOSTADDR", "10.0.0.1")
    before = dict(ex.os.environ)
    values = ex.child_env({"systemIdentifier": "123", "sentinel": "d" * 64})
    assert values["SUPABASE_DB_URL"] == ex.DSN
    assert "PGHOSTADDR" not in values and "PYTEST_ADDOPTS" not in values
    assert dict(ex.os.environ) == before
```

- [ ] **Step 2: Rodar RED**

Run: `uv run --directory runtime pytest tests/unit/test_disposable_executor.py -q`.
Expected: `execute` ausente.

- [ ] **Step 3: Acrescentar expurgo JUnit fora da classe, antes de `Executor`**

```python
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
                    attributes[key] = re.sub(r"[A-Za-z][A-Za-z0-9+.-]*://\S+", "[redacted]", value)
            safe = ET.SubElement(suite, "testcase", attributes)
            for child, counter in (("skipped", "skipped"), ("failure", "failures"), ("error", "errors")):
                if case.find(child) is not None:
                    summary[counter] += 1
                    ET.SubElement(safe, child, message="details omitted from disposable evidence")
    except (OSError, ET.ParseError) as error:
        problem = error
        summary["errors"] += 1
    for key, value in summary.items():
        suite.set(key, str(value))
    ET.ElementTree(output).write(path, encoding="utf-8", xml_declaration=True)
    if problem:
        raise ValueError("missing or invalid pytest report") from None
    return summary
```

- [ ] **Step 4: Acrescentar Test e Stop dentro de `Executor`, depois de `upgrade`**

```python
    def source(self, focal):
        approved = self.files()
        current = inventory(self.repo / "supabase/migrations")
        if focal:
            prospective(approved, current)
        else:
            require(approved == current, "full gate requires the complete current checkout manifest")
        return approved

    def clean_commit(self, expected):
        actual = self.command("git", "rev-parse", "HEAD", timeout=30).stdout.strip()
        require(actual == expected, "checkout commit changed during gate")
        dirty = self.command("git", "status", "--porcelain=v1", "--untracked-files=all", "--",
                             "runtime", "scripts/test-disposable-db.ps1", "supabase/config.toml",
                             "supabase/migrations", timeout=30).stdout.strip()
        require(not dirty, "full gate requires committed runtime and migration inputs")

    def pytest_command(self, arguments, stage):
        self.gate["stage"] = stage
        approved = self.source(self.gate["scope"] == "focal")
        if self.gate["scope"] == "full":
            self.clean_commit(self.gate["commit"])
        self.proof()
        self.history(approved)
        return self.command("uv", "run", "--directory", self.repo / "runtime", "pytest",
                            *arguments, identity=self.identity, check=False)

    def suite(self, arguments, name):
        path = self.run / "artifacts" / (name + ".xml")
        path.parent.mkdir(exist_ok=True)
        no_links(path)
        result = self.pytest_command([*arguments, "--junitxml=" + str(path)], name)
        summary, problem = None, None
        try:
            summary = sanitize_report(path, self.identity["sentinel"])
        except ValueError as error:
            problem = error
        if result.returncode:
            raise CommandFailure(result.returncode)
        if problem:
            raise problem
        require(summary["tests"] > 0 and not any(summary[k] for k in ("skipped", "failures", "errors")),
                "pytest did not execute a clean nonempty suite")
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
        nodeids = [line.strip() for line in result.stdout.splitlines()
                   if re.fullmatch(r"tests/db/[^\s:]+\.py::.+", line.strip())]
        require(nodeids and len(set(nodeids)) == len(nodeids), "RLS collection is empty or ambiguous")
        self.gate["collectedRls"] = len(nodeids)
        self.save()
        self.suite(["-m", "db and not rls"], "db")
        executed = self.suite(["-m", "rls"], "rls")
        require(executed == self.gate["collectedRls"], "collected and executed RLS counts differ")
        self.suite(["-m", "pipeline"], "pipeline")

    def stop(self):
        self.gate["stage"] = "stop"
        persisted = identity_shape(read_json(self.run / "identity.json"), self.project)
        if self.identity:
            require(all(persisted[k] == self.identity[k] for k in persisted if k != "sentinel"),
                    "persisted cleanup identity changed")
        self.identity = persisted
        self.physical()
        self.local("stop", "--no-backup")
        remaining = self.command("docker", "ps", "-a", "--no-trunc", "--filter",
                                 "label=com.supabase.cli.project=" + self.project,
                                 "--format", "{{.ID}}", timeout=30).stdout.strip()
        volumes = self.command("docker", "volume", "ls", "--format", "{{.Name}}",
                               timeout=30).stdout.splitlines()
        require(not remaining and self.identity["volumeName"] not in volumes,
                "Stop did not remove the approved project")
        self.gate["state"] = "stopped"
        self.save()

    def unproven(self):
        result = self.command("docker", "ps", "-a", "--no-trunc", "--filter",
                              "label=com.supabase.cli.project=" + self.project,
                              "--format", "{{.ID}}", timeout=30, check=False)
        ids = [v for v in result.stdout.splitlines() if re.fullmatch(r"[0-9a-f]{64}", v)]
        write_json(self.run / "unproven.json", {"projectId": self.project, "containerIds": ids})
        self.gate["state"] = "unproven"
```

Cada suite espera o processo anterior, expurga o XML inclusive em falha e só então decide se pode continuar. Nenhum stdout bruto é publicado. Stop exige configuração do nonce, ID/label/imagem/volume/mapping e system identifier novamente, mas não exige schema íntegro: uma migration quebrada ainda pode ser descartada com a mesma identidade física. Confirma ausência dos recursos pelo mesmo label e volume antes de marcar stopped.

- [ ] **Step 5: Acrescentar lifecycle dentro de `Executor`, depois de `unproven`**

```python
    def execute(self, action, test_targets=None, through=None):
        test_targets = [] if test_targets is None else test_targets
        require(action in {"Prepare", "Replay", "Upgrade", "Test", "Stop"}, "invalid Action")
        require(isinstance(test_targets, list) and all(isinstance(v, str) for v in test_targets),
                "invalid TestTargets")
        require(not test_targets or action == "Test", "TestTargets only applies to Test")
        require(through is None or (isinstance(through, str) and
                re.fullmatch(r"[0-9]{14}", through)), "invalid MigrationThrough")
        require(through is None or action in {"Prepare", "Upgrade"},
                "MigrationThrough only applies to Prepare or Upgrade")
        self.run = safe_run(self.repo, self.run)
        self.project = "worder-audit-" + self.run.name
        if action == "Prepare":
            require(not self.run.exists(), "Prepare requires a new directory")
        else:
            self.gate = gate_shape(read_json(self.run / "gates.json"))
            allowed = {"Replay": {"prepared"}, "Upgrade": {"ready"}, "Test": {"ready"},
                       "Stop": {"prepared", "ready", "preparing", "replaying", "upgrading",
                                "testing", "failed", "stopped"}}
            require(self.gate["state"] in allowed[action], "invalid transition")
            if action == "Stop" and self.gate["state"] == "stopped":
                return 0
        root = self.run.parent
        no_links(root)
        root.mkdir(parents=True, exist_ok=True)
        lock = root / ".executor.lock"
        no_links(lock)
        with lock.open("x", encoding="utf-8") as handle:
            handle.write(str(os.getpid()))
        try:
            if action == "Prepare":
                self.run.mkdir()
            code = 0
            try:
                self.save()
                self.gate["stage"] = "preflight"
                if action != "Prepare":
                    self.identity = identity_shape(read_json(self.run / "identity.json"), self.project)
                commit = self.command("git", "rev-parse", "HEAD", timeout=30).stdout.strip()
                require(re.fullmatch(r"[0-9a-f]{40}", commit), "invalid checkout commit")
                if action == "Test":
                    self.gate["scope"] = "focal" if test_targets else "full"
                    self.source(bool(test_targets))
                    if not test_targets:
                        self.clean_commit(commit)
                self.gate["commit"] = commit
                if action != "Prepare":
                    self.preflight()
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
                    130 if isinstance(error, KeyboardInterrupt) else 2)
                self.gate["failure"] = {"stage": self.gate["stage"],
                                        "kind": type(error).__name__, "exitCode": code}
                self.gate["state"] = "failed"
            finally:
                if action != "Stop" and (action == "Test" or code):
                    try:
                        if self.identity:
                            self.stop()
                        else:
                            self.unproven()
                    except (Exception, KeyboardInterrupt) as cleanup:
                        cleanup_code = cleanup.code if isinstance(cleanup, CommandFailure) else 2
                        if not code:
                            code = cleanup_code
                            self.gate["failure"] = {"stage": "stop", "kind": type(cleanup).__name__,
                                                    "exitCode": code}
                        self.gate["state"] = "failed" if self.identity else "unproven"
                self.save()
            return code
        finally:
            no_links(lock)
            lock.unlink()
```

O lock guarda apenas o PID e é removido pelo mesmo processo após esperar todos os filhos. Não há remoção recursiva. Erro anterior à validação do diretório/transição não toca um run existente; erro dentro de ação válida grava gates e tenta apenas cleanup comprovado. Após interrupção que mate o próprio processo sem `finally`, o run continua no estado intermediário persistido e só Stop é permitido ao guardião.

- [ ] **Step 6: Acrescentar CLI Python fora da classe, no final do arquivo**

```python
def main():
    try:
        request = json.loads(sys.stdin.read())
        require(isinstance(request, dict) and set(request) == {
            "Action", "RunDirectory", "TestTargets", "MigrationThrough"
        }, "invalid executor request")
        require(isinstance(request["RunDirectory"], str), "invalid RunDirectory")
        repo = Path(__file__).resolve().parents[3]
        run = safe_run(repo, request["RunDirectory"])
        return Executor(repo, run).execute(request["Action"], request["TestTargets"],
                                           request["MigrationThrough"])
    except (Exception, KeyboardInterrupt) as error:
        sys.stderr.write("disposable executor refused request; inspect local gates evidence\n")
        return error.code if isinstance(error, CommandFailure) else (
            130 if isinstance(error, KeyboardInterrupt) else 2)


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 7: Criar o script PowerShell completo**

```powershell
#requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('Prepare', 'Replay', 'Upgrade', 'Test', 'Stop')]
    [string]$Action,
    [Parameter(Mandatory)][string]$RunDirectory,
    [string[]]$TestTargets = @(),
    [ValidatePattern('^[0-9]{14}$')][string]$MigrationThrough
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$runtimeRoot = Join-Path $repoRoot 'runtime'
$pythonPath = if ($IsWindows) {
    Join-Path $runtimeRoot '.venv/Scripts/python.exe'
} else {
    Join-Path $runtimeRoot '.venv/bin/python'
}
if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
    throw 'Runtime venv missing: run uv sync --directory runtime --frozen before the executor'
}

function Invoke-Executor([string]$SelectedAction) {
    $request = @{
        Action = $SelectedAction
        RunDirectory = $RunDirectory
        TestTargets = @($TestTargets)
        MigrationThrough = $(if ($MigrationThrough) { $MigrationThrough } else { $null })
    } | ConvertTo-Json -Depth 4 -Compress
    $previousEncoding = $OutputEncoding
    Push-Location -LiteralPath $runtimeRoot
    try {
        $OutputEncoding = [Text.UTF8Encoding]::new($false)
        $request | & $pythonPath -m tests.support.disposable_executor
        $result = $LASTEXITCODE
    } finally {
        $OutputEncoding = $previousEncoding
        Pop-Location
    }
    if ($null -eq $result) { exit 127 }
    exit ([int]$result)
}

switch ($Action) {
    'Prepare' { Invoke-Executor 'Prepare' }
    'Replay'  { Invoke-Executor 'Replay' }
    'Upgrade' { Invoke-Executor 'Upgrade' }
    'Test'    { Invoke-Executor 'Test' }
    'Stop'    { Invoke-Executor 'Stop' }
    default   { throw 'invalid Action' }
}
```

O processo Python da venv já sincronizada evita que o bootstrap `uv run` herde um `UV_ENV_FILE` antes da limpeza de ambiente. Não há `Invoke-Expression`, concatenação de comandos, interpolação de nodeids em shell ou argumento de DSN. O `switch` tem todos os branches e devolve exatamente o resultado Python; runtime Python recusa chamada direta inválida independentemente do ValidateSet.

- [ ] **Step 8: GREEN, parsing estático do PowerShell e commit**

```powershell
uv run --directory runtime pytest tests/unit/test_disposable_executor.py -q
$parseTokens = $null
$parseErrors = $null
[Management.Automation.Language.Parser]::ParseFile((Join-Path $PWD 'scripts/test-disposable-db.ps1'), [ref]$parseTokens, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count) { throw 'PowerShell parse failed' }
git add scripts/test-disposable-db.ps1 runtime/tests/support/disposable_executor.py runtime/tests/unit/test_disposable_executor.py
git commit -m "test: close disposable lifecycle and serial database gates"
```

Expected: unitários PASS e parse sem erro, sem executar o script operacional. Rollback: revert do dispatcher/helper juntos; manter a guarda da Task 1. Runs stopped nunca são reutilizados e um gate focal conserva `collectedRls=0`.

### Task 8: Regressões integradas com CLI falsa e handoff ao guardião

**Files:** Modify `runtime/tests/unit/test_disposable_executor.py`, `runtime/tests/unit/test_disposable_db_guard.py`; ajustes focais apenas nos cinco arquivos de implementação já mapeados se os testes revelarem divergência.

**Interfaces:** O double implementa o protocolo `runner(argv, cwd=Path, env=dict, input=str|None, timeout=int) -> CompletedProcess` e uma conexão psycopg falsa. Docker/CLI/DB/sockets permanecem falsos; um smoke separado executa somente PowerShell/Python reais para provar o transporte JSON e o exit code, com backend temporário que nunca conecta. O gate DB real é exclusivamente do guardião após review Astra.

- [ ] **Step 1: Acrescentar os doubles completos em `test_disposable_executor.py`**

```python
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
        return False

    def execute(self, sql):
        if sql == ex.SID_SQL:
            return FakeCursor([(self.cli.sid,)])
        assert sql == "select token from testing.disposable_identity"
        return FakeCursor([(self.cli.sentinel,)])


class FakeCLI:
    def __init__(self, run):
        self.run = run
        self.started = False
        self.sid = "1234567890123456789"
        self.sentinel = None
        self.applied = []
        self.calls, self.pytest_calls = [], []
        self.fail = None
        self.empty_rls = False
        self.commit = "e" * 40

    def __call__(self, argv, *, cwd, env, input=None, timeout=600):
        self.calls.append(argv)
        output, code = "", 0
        if argv[:3] == ["git", "rev-parse", "HEAD"]:
            output = self.commit
        elif argv[:2] == ["git", "status"]:
            output = ""
        elif argv[:2] == ["supabase", "--version"]:
            output = "2.111.0"
        elif argv[0] == "supabase" and "--help" in argv:
            output = "--exclude --workdir --local --no-seed --no-backup"
        elif argv[:3] == ["docker", "context", "inspect"]:
            output = json.dumps("unix:///var/run/docker.sock")
        elif argv[:2] == ["docker", "ps"]:
            output = "a" * 64 if self.started else ""
        elif argv[:3] == ["docker", "volume", "ls"]:
            output = "pre-existing\n" + ("supabase_db_" + PROJECT if self.started else "")
        elif argv[:2] == ["supabase", "start"]:
            cfg = ex.tomllib.loads((self.run / "supabase/config.toml").read_text())
            assert cfg["db"]["migrations"]["enabled"] is False
            assert cfg["db"]["seed"]["enabled"] is False
            assert not (self.run / "supabase/seed.sql").exists()
            self.started = True
        elif argv[:2] == ["docker", "inspect"]:
            assert self.started
            output = json.dumps([container_record()])
        elif argv[:2] == ["docker", "exec"]:
            assert self.started and argv[3] == "a" * 64
            sql = input.strip()
            if sql == ex.SID_SQL:
                output = self.sid
            elif sql == ex.HISTORY_SQL:
                output = "\n".join(self.applied)
            else:
                assert "create table testing.disposable_identity" in sql
                assert "revoke all" in sql
                self.sentinel = ex.re.search(r"values \('([0-9a-f]{64})'\)", sql)[1]
        elif argv[:3] in (["supabase", "db", "reset"], ["supabase", "migration", "up"]):
            assert "--local" in argv and "--workdir" in argv
            if argv[1] == "db":
                assert "--no-seed" in argv
            if self.fail == "migration-up" and argv[1] == "migration":
                code = 18
            else:
                self.applied = [r["version"] for r in ex.inventory(self.run / "supabase/migrations")]
        elif argv[:2] == ["supabase", "stop"]:
            assert "--no-backup" in argv and "--all" not in argv
            self.started = False
        elif argv[0] == "uv":
            assert argv[1] == "run" and "pytest" in argv
            assert env["SUPABASE_DB_URL"] == ex.DSN
            assert env["WORDER_TEST_DB_SYSTEM_IDENTIFIER"] == self.sid
            assert env["WORDER_TEST_DB_SENTINEL"] == self.sentinel
            if "--collect-only" in argv:
                name = "collect-rls"
                output = "" if self.empty_rls else "tests/db/test_case.py::test_one\n"
            else:
                report = Path(next(a.split("=", 1)[1] for a in argv if a.startswith("--junitxml=")))
                name = report.stem
                report.write_text(
                    '<testsuites><testsuite><testcase name="test_one" classname="tests.db.test_case">'
                    '<system-out>' + ex.DSN + '</system-out></testcase></testsuite></testsuites>',
                    encoding="utf-8",
                )
            self.pytest_calls.append(name)
            if self.fail == name:
                code = 17
        else:
            raise AssertionError("unexpected subprocess argv")
        return ex.subprocess.CompletedProcess(argv, code, output, "")


def fake_environment(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    migrations = repo / "supabase/migrations"
    migrations.mkdir(parents=True)
    (repo / "supabase/config.toml").write_text(
        (REPO / "supabase/config.toml").read_text(encoding="utf-8"), encoding="utf-8")
    (migrations / "20260621_phase0_foundations.sql").write_text("select 1;\n")
    (migrations / "20260812000001_a.sql").write_text("select 2;\n")
    test_file = repo / "runtime/tests/db/test_case.py"
    test_file.parent.mkdir(parents=True)
    test_file.write_text("def test_one():\n    assert True\n")
    run = repo / ".superpowers/sdd/auditoria-ia-disposable" / ("a" * 32)
    cli = FakeCLI(run)
    for name in ("PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(ex, "free_ports", lambda: None)
    monkeypatch.setattr(ex, "read_system_identifier", lambda dsn: cli.sid)
    monkeypatch.setattr(ex.psycopg, "connect", lambda *a, **k: FakeConnection(cli))
    return ex.Executor(repo, run, runner=cli), cli
```

- [ ] **Step 2: Acrescentar os casos de integração puros completos**

```python
def test_real_legacy_migration_keeps_its_eight_digit_version():
    rows = ex.inventory(REPO / "supabase/migrations")
    legacy = next(r for r in rows if r["filename"] == "20260621_phase0_foundations.sql")
    assert legacy["version"] == "20260621"
    assert rows[0] == legacy
    assert rows == sorted(rows, key=lambda r: (r["version"], r["filename"]))


def test_prepare_replay_full_test_and_stop_with_fake_cli(tmp_path, monkeypatch):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == 0
    assert executor.gate["state"] == "prepared" and cli.started
    assert executor.execute("Replay") == 0
    assert executor.gate["state"] == "ready" and cli.started
    before = dict(ex.os.environ)
    assert executor.execute("Test") == 0
    assert cli.pytest_calls == ["collect-rls", "db", "rls", "pipeline"]
    assert executor.gate["collectedRls"] == 1
    assert executor.gate["scope"] == "full" and executor.gate["state"] == "stopped"
    assert not cli.started and dict(ex.os.environ) == before
    assert "postgresql://" not in (executor.run / "artifacts/db.xml").read_text()
    count = len(cli.calls)
    assert executor.execute("Stop") == 0
    assert len(cli.calls) == count


@pytest.mark.parametrize("failure,expected", [("db", 17), ("empty-rls", 2)])
def test_no_suite_after_the_first_failed_gate(tmp_path, monkeypatch, failure, expected):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == executor.execute("Replay") == 0
    cli.fail, cli.empty_rls = failure, failure == "empty-rls"
    assert executor.execute("Test") == expected
    assert cli.pytest_calls == (["collect-rls"] if cli.empty_rls else ["collect-rls", "db"])
    assert executor.gate["state"] == "stopped" and not cli.started


def test_upgrade_suffix_noop_and_failure_keep_approved_manifest(tmp_path, monkeypatch):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare", through="20260812000001") == 0
    assert executor.execute("Replay") == 0
    identity = ex.read_json(executor.run / "identity.json")
    assert executor.execute("Upgrade", through="20260812000001") == 0
    assert not any(c[:3] == ["supabase", "migration", "up"] for c in cli.calls)
    new_file = executor.repo / "supabase/migrations/20260812000002_b.sql"
    new_file.write_text("select 3;\n")
    assert executor.execute("Upgrade", through="20260812000002") == 0
    assert ex.read_json(executor.run / "identity.json") == identity
    approved = ex.read_json(executor.run / "manifest.json")
    (new_file.parent / "20260812000003_c.sql").write_text("select 4;\n")
    cli.fail = "migration-up"
    assert executor.execute("Upgrade", through="20260812000003") == 18
    assert ex.read_json(executor.run / "manifest.json") == approved
    assert len(ex.read_json(executor.run / "manifest.prospective.json")) == len(approved) + 1
    assert executor.gate["failure"]["stage"] == "migration-up"
    assert executor.gate["state"] == "stopped"


def test_new_checkout_with_old_manifest_never_labels_new_sha_or_runs_pytest(tmp_path, monkeypatch):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == executor.execute("Replay") == 0
    old_commit = executor.gate["commit"]
    (executor.repo / "supabase/migrations/20260812000002_b.sql").write_text("select 3;\n")
    cli.commit = "f" * 40
    assert executor.execute("Test") == 2
    assert cli.pytest_calls == []
    assert executor.gate["commit"] == old_commit
    assert executor.gate["state"] == "stopped"


def test_focal_accepts_immutable_prefix_and_keeps_scope_focal(tmp_path, monkeypatch):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == executor.execute("Replay") == 0
    (executor.repo / "supabase/migrations/20260812000002_b.sql").write_text("select 3;\n")
    assert executor.execute("Test", ["tests/db/test_case.py::test_one"]) == 0
    assert cli.pytest_calls == ["focal"]
    assert executor.gate["scope"] == "focal" and executor.gate["collectedRls"] == 0


def test_parent_pg_hostaddr_cannot_redirect_physical_probe(tmp_path, monkeypatch):
    from unittest.mock import Mock
    from tests.support.disposable_db import read_system_identifier
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == 0
    connection = Mock()
    monkeypatch.setattr(ex.psycopg, "connect", connection)
    monkeypatch.setattr(ex, "read_system_identifier", read_system_identifier)
    monkeypatch.setenv("PGHOSTADDR", "10.0.0.1")
    with pytest.raises(ValueError, match="ambient libpq routing"):
        executor.physical()
    connection.assert_not_called()
    assert not any(c[:3] == ["supabase", "db", "reset"] for c in cli.calls)


def test_copy_hash_change_prevents_any_pytest(tmp_path, monkeypatch):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == executor.execute("Replay") == 0
    (executor.run / "supabase/migrations/20260812000001_a.sql").write_text("select 99;\n")
    assert executor.execute("Test") == 2
    assert cli.pytest_calls == [] and executor.gate["state"] == "stopped"


def test_stop_refuses_changed_physical_identity(tmp_path, monkeypatch):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == executor.execute("Replay") == 0
    cli.sid = "9999999999999999999"
    assert executor.execute("Stop") == 2
    assert not any(c[:2] == ["supabase", "stop"] for c in cli.calls)
    assert executor.gate["state"] == "failed" and cli.started


def test_unproven_prepare_records_ids_without_stop(tmp_path, monkeypatch):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    monkeypatch.setattr(ex, "read_system_identifier", lambda dsn: "different")
    assert executor.execute("Prepare") == 2
    assert executor.gate["state"] == "unproven"
    assert ex.read_json(executor.run / "unproven.json")["containerIds"] == ["a" * 64]
    assert not any(c[:2] == ["supabase", "stop"] for c in cli.calls)
```

- [ ] **Step 3: Acrescentar regressões de processos, dispatcher e formatos**

```python
def test_subprocess_timeout_kills_and_reaps_without_shell(monkeypatch):
    from unittest.mock import Mock
    process = Mock(pid=31337)
    process.communicate.side_effect = [ex.subprocess.TimeoutExpired(["uv"], 1), ("", "")]
    popen = Mock(return_value=process)
    monkeypatch.setattr(ex.shutil, "which", lambda name: name)
    monkeypatch.setattr(ex.subprocess, "Popen", popen)
    monkeypatch.setattr(ex.subprocess, "run", Mock(return_value=Mock(returncode=0)))
    monkeypatch.setattr(ex.os, "killpg", Mock(), raising=False)
    result = ex.run_process(["uv", "run", "pytest"], cwd=REPO, env={}, timeout=1)
    assert result.returncode == 124
    assert popen.call_args.kwargs["shell"] is False
    process.kill.assert_called_once()
    process.wait.assert_called_once()


@pytest.mark.parametrize("bad", [
    [], [{"filename": "bad.sql", "sha256": "A" * 64, "version": "20260621"}],
    [{"filename": "20260812000001_a.sql", "sha256": "A" * 64, "version": "20260812000002"}],
])
def test_manifest_shape_rejects_ambiguity(bad):
    with pytest.raises(ValueError):
        ex.manifest_shape(bad)


def test_duplicate_version_is_rejected():
    first = {"filename": "20260812000001_a.sql", "sha256": "A" * 64, "version": "20260812000001"}
    second = dict(first, filename="20260812000001_b.sql")
    with pytest.raises(ValueError, match="duplicate migration version"):
        ex.manifest_shape([first, second])


def test_powershell_has_all_dispatch_branches_and_no_shell_evaluation():
    script = (REPO / "scripts/test-disposable-db.ps1").read_text(encoding="utf-8")
    assert "switch ($Action)" in script
    for action in ("Prepare", "Replay", "Upgrade", "Test", "Stop"):
        assert ex.re.search("'" + action + r"'\s*\{ Invoke-Executor '" + action + "' \\}", script)
    assert "Invoke-Expression" not in script and "--linked" not in script


def test_invalid_action_parameters_do_not_start_processes(tmp_path):
    executor = run_fixture(tmp_path)
    executor.runner = lambda *a, **k: pytest.fail("unexpected subprocess")
    for action, values, through in [("Other", [], None), ("Replay", ["tests/db/x.py"], None),
                                    ("Test", [], "20260812000001"), ("Upgrade", [], "20260621")]:
        with pytest.raises(ValueError):
            executor.execute(action, values, through)
```

Ainda em `test_disposable_executor.py`, acrescentar o smoke real da fronteira PowerShell → Python. Ele extrai a função `Invoke-Executor` do script real por AST, usa o Python atual e um módulo temporário que só valida JSON. Não executa o backend de banco nem cria a venv de um projeto falso.

```python
def test_launcher_transports_two_targets_and_preserves_native_exit_code(tmp_path):
    runtime = tmp_path / "runtime"
    support = runtime / "tests/support"
    support.mkdir(parents=True)
    (runtime / "tests/__init__.py").write_text("")
    (support / "__init__.py").write_text("")
    (support / "disposable_executor.py").write_text(
        "import json, sys\n"
        "request = json.loads(sys.stdin.read())\n"
        "assert request['Action'] == 'Test'\n"
        "assert request['MigrationThrough'] is None\n"
        "assert request['TestTargets'] == ['tests/db/first.py::test_one', "
        "'tests/db/second.py::test_two']\n"
        "raise SystemExit(23)\n", encoding="utf-8")
    command = r"""
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    $env:LAUNCH_SCRIPT, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'parse failed' }
$definition = $ast.Find({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq 'Invoke-Executor'
}, $false)
. ([scriptblock]::Create($definition.Extent.Text))
$runtimeRoot = $env:LAUNCH_RUNTIME
$pythonPath = $env:LAUNCH_PYTHON
$RunDirectory = $env:LAUNCH_RUNTIME
$TestTargets = @('tests/db/first.py::test_one', 'tests/db/second.py::test_two')
$MigrationThrough = $null
Invoke-Executor 'Test'
"""
    env = dict(ex.os.environ, LAUNCH_SCRIPT=str(REPO / "scripts/test-disposable-db.ps1"),
               LAUNCH_RUNTIME=str(runtime), LAUNCH_PYTHON=ex.sys.executable)
    result = ex.subprocess.run(["pwsh", "-NoProfile", "-NonInteractive", "-Command", command],
                               env=env, capture_output=True, text=True, timeout=30, check=False,
                               shell=False)
    assert result.returncode == 23, result.stderr
```

Em `test_disposable_db_guard.py`, acrescentar a prova positiva e a recusa de roteamento herdado:

```python
def test_fixture_returns_dsn_only_after_both_proofs():
    conn = Mock()
    conn.execute.side_effect = [Mock(fetchone=Mock(return_value=(SID,))),
                                Mock(fetchall=Mock(return_value=[(TOKEN,)]))]
    values = {"SUPABASE_DB_URL": DSN, "WORDER_TEST_DB_SYSTEM_IDENTIFIER": SID,
              "WORDER_TEST_DB_SENTINEL": TOKEN}
    with patch.dict(os.environ, values, clear=True), patch.object(database.psycopg, "connect") as c:
        c.return_value.__enter__.return_value = conn
        assert database.dsn_from_env() == DSN
        assert conn.execute.call_count == 2


def test_ambient_libpq_routing_is_refused_before_connection():
    values = {"SUPABASE_DB_URL": DSN, "WORDER_TEST_DB_SYSTEM_IDENTIFIER": SID,
              "WORDER_TEST_DB_SENTINEL": TOKEN, "PGHOSTADDR": "10.0.0.1"}
    with patch.dict(os.environ, values, clear=True), patch.object(database.psycopg, "connect") as c:
        with pytest.raises(ValueError, match="ambient libpq routing"):
            database.dsn_from_env()
        c.assert_not_called()
```

- [ ] **Step 4: Executar RED/GREEN incremental e gates do pacote**

Os testes das Tasks 1–7 já estabelecem RED antes das respectivas implementações. Nesta tarefa, cada novo caso expõe uma fronteira ainda não comprovada; falha deve ser corrigida na função responsável, preservando o caso, sem reescrever expectativa para aceitar o defeito. Não é necessário fabricar falha em código já correto.

```powershell
uv run --directory runtime pytest tests/unit/test_disposable_db_guard.py tests/unit/test_disposable_executor.py -q
uv run --directory runtime ruff check tests/support/disposable_db.py tests/support/disposable_executor.py tests/support/database.py tests/unit/test_disposable_db_guard.py tests/unit/test_disposable_executor.py
uv run --directory runtime lint-imports
uv run --directory runtime pytest -m unit
```

Expected: PASS; zero processo Docker/DB nos testes. O smoke de transporte usa somente PowerShell 7 e o Python já em execução; sua ausência falha em vez de skip. Ruff pode exigir reorganizar imports/linhas dos snippets; usar somente formatação/import sorting existente, sem alterar contratos. O marcador unit já deriva de `tests/unit` no conftest do runtime. Diretórios `tmp_path` são exclusivamente fixtures de filesystem temporário; nenhum acesso a banco/rede é permitido.

- [ ] **Step 5: Commit e review Astra antes de operar**

```powershell
git add scripts/test-disposable-db.ps1 runtime/tests/support/disposable_db.py runtime/tests/support/disposable_executor.py runtime/tests/support/database.py runtime/tests/unit/test_disposable_db_guard.py runtime/tests/unit/test_disposable_executor.py
git commit -m "test: cover disposable executor failures and complete lifecycle"
```

O reviewer confere todos os guards negativos, argv real no double, restore implícito por env isolado, manifest imutável, legacy version, `scope`, SHA e Stop em falhas. Gate: `Spec PASS` e `Quality APPROVED`, sem Critical/Important. Se houver finding, corrigir no mesmo pacote e repetir somente os gates afetados.

- [ ] **Step 6: Guardião comprova Prepare/Replay real no commit aprovado**

Primeiro o guardião verifica que o PATH resolve o executável nativo `supabase` 2.111.0 e que Docker local está disponível. `uv sync --directory runtime --frozen` fornece a venv exigida pelo launcher. Esses são comandos de execução futura, não resultados desta autoria do plano.

```powershell
uv sync --directory runtime --frozen
$runPath = Join-Path $PWD ".superpowers/sdd/auditoria-ia-disposable/$([guid]::NewGuid().ToString('N'))"
./scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $runPath
if ($LASTEXITCODE -ne 0) { throw 'Prepare failed; inspect gates and unproven evidence' }
./scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $runPath
if ($LASTEXITCODE -ne 0) { throw 'Replay failed; record the first failing migration for W0-T3' }
./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $runPath
if ($LASTEXITCODE -ne 0) { throw 'Disposable full gate failed' }
```

O replay do HEAD conhecido ainda pressupõe schema legado. O resultado esperado inicial é failure de schema registrado em `events.jsonl`/`gates.json` e Stop comprovado, sem pytest; não marcar E0/W0 como gate DB verde. W0-T3 estabelece baseline e então repete o mesmo ciclo com outro nonce. Se Prepare não provar identidade, consultar `unproven.json` e interromper qualquer cleanup inferido; o guardião investiga os IDs, sem prune/stop global.

- [ ] **Step 7: Registrar handoff e rollback**

O relatório de tarefa registra commit, comandos/exit codes, resultado dos unitários/review, projectId/containerId/imageId/volumeName, `systemIdentifier`, manifest aprovado/prospectivo e estado final. Referencia os artefatos pelo caminho; não copia DSN, senha, stdout de status nem conteúdo real de clientes.

E0 encerra sua implementação quando os testes puros e review passam, e a primeira prova real distingue falha de executor de falha de baseline. O gate W0-T3/T4 permanece vermelho enquanto o stream não reproduzir do zero e DB/RLS/pipeline não passarem no mesmo commit. O executor fica pronto para os ciclos focais e upgrades das outras ondas; nenhum despacho da onda ignora uma falha operacional ainda aberta.

Rollback do código: reverter commits E0 em ordem inversa, mantendo a guarda fail-closed até existir substituto equivalente. Rollback de um run: somente `Stop` no diretório de identidade comprovada; guardar JSONs para análise. Não reutilizar nonce, remover banco existente, aplicar rollback remoto, reparar histórico ou reverter DDL em banco com dados.

## Autorrevisão de cobertura para aceite

| Requisito E0 | Implementação / regressão |
|---|---|
| Cinco Actions e transições fechadas | Task 7; stopped, parâmetros ilegais e smoke de dispatch na Task 8 |
| TOML exato, chave única, seed/storage off | Task 2; duplicação, seção ausente, schema_paths externo |
| Portas 55320/55321/55322, nonce, diretório novo | Tasks 2/4; busy port, safe_run e Prepare recusando existência |
| Copiar só config/migrations e SHA256 real | Tasks 2/4/8; hash copiado alterado impede pytest |
| Versão legada 20260621 preservada | Task 2 chave explícita; inventory real na Task 8 |
| Container/label/imagem/volume/mapping sem ambiguidade | Task 3; um caso negativo por condição |
| Identidade container versus loopback e env PGHOSTADDR | Tasks 1/3/8; nenhuma conexão redirecionada |
| Sentinela aleatória e todos os registros exatos | Tasks 1/5; token errado, ausente ou duplicado |
| Replay protegido e histórico exato | Task 5; sem reset se identidade falha; versões extra/ausente/duplicada |
| Upgrade prospectivo e no-op sem reset | Task 6/8; falha não promove, prefixo mutado rejeitado |
| Focal argv e full com RLS coletado/executado | Tasks 2/7/8; ordem, coleta vazia e interrupção após primeiro erro |
| Mesmo SHA e mesmo stream no gate completo | Task 7/8; novo checkout/manifest antigo não inicia pytest nem relabela SHA |
| Gates em falha, XML expurgado e exit code original | Tasks 3/7/8; serialização, erro DB, erro Upgrade e timeout |
| Stop no finally e somente no projeto provado | Task 7/8; sucesso/falha, identidade trocada e unproven |
| Sem dependência nova, sem código operacional fora do plano | Biblioteca padrão + psycopg/pytest existentes; este artefato contém somente Markdown |

Autoria deste documento: leitura de spec/W0, arquivos de integração e documentação oficial; inspeção estática de caminhos, interfaces, gramáticas, fences e whitespace. Os comandos de teste/commit/DB acima são instruções para implementação futura e não foram executados durante a escrita do plano.
