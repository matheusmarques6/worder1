"""Fitness function — SQL lives in the repository layer, nowhere else.

Import-linter already forbids domain modules from importing psycopg directly,
but a module can hold a query string and hand it to someone else to run. The
rule the architecture actually states is about the SQL, not about the import: a
query written next to a business rule escapes review, escapes RLS reasoning and
escapes the `SET LOCAL app.organization_id` discipline that goes with every statement.

Docstrings are exempt — prose quoting a query is not a query.
"""

import ast
import re
from pathlib import Path

import pytest

import agents_runtime

_SOURCE_ROOT = Path(agents_runtime.__file__).parent

# The only package allowed to contain SQL (arquitetura §3).
_REPOSITORY_LAYER = "repository"

# SET ROLE entrou aqui depois de passar verde por engano (auditoria 2026-08-28
# item 17): o regex só reconhecia `SET LOCAL`, então `"set role " + set_role`
# — o comando que a guarda de RLS do item 01 usa em toda troca de credencial —
# não era visto como SQL. `SET ROLE` é tão sensível quanto `SET LOCAL`: errar
# o papel muda em nome de quem toda query seguinte roda.
_SQL_START = re.compile(
    r"^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE|ALTER|DROP|TRUNCATE"
    r"|GRANT|REVOKE|WITH|COPY|SET\s+LOCAL|SET\s+ROLE)\b",
    re.IGNORECASE,
)


def _docstring_nodes(tree: ast.AST) -> set[int]:
    """Ids of the Constant nodes that are docstrings, so prose is not a finding."""
    ids: set[int] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        first = node.body[0] if node.body else None
        if (
            isinstance(first, ast.Expr)
            and isinstance(first.value, ast.Constant)
            and isinstance(first.value.value, str)
        ):
            ids.add(id(first.value))
    return ids


def _violations(source: str) -> list[str]:
    tree = ast.parse(source)
    docstrings = _docstring_nodes(tree)

    found: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
            continue
        if id(node) in docstrings:
            continue
        if _SQL_START.match(node.value):
            found.append(f"line {node.lineno}: {node.value.strip()[:60]!r}")
    return found


def _modules_outside_the_repository() -> list[Path]:
    return sorted(
        path
        for path in _SOURCE_ROOT.rglob("*.py")
        if path.relative_to(_SOURCE_ROOT).parts[0] != _REPOSITORY_LAYER
    )


# Auditoria 2026-08-28 item 17: o regex só reconhecia `SET LOCAL`, então `SET
# ROLE` — o comando que a guarda de RLS do item 01 usa em toda troca de
# credencial — passava verde nestes quatro pontos de entrada de conexão. É uma
# violação real da regra "SQL só em repository/": a troca de role roda ANTES
# de a conexão virar "a conexão do repository", nos quatro lugares que abrem
# uma conexão psycopg diretamente (auditoria item 16). Consertar é mudar ONDE
# a conexão é aberta — refatoração arquitetural fora do escopo desta tarefa
# (ruling do controlador, tarefa 16/17). Cada ocorrência vira exceção NOMEADA
# aqui, contada, em vez de o regex voltar a ficar cego: o dono de cada arquivo
# resolve a dívida.
_KNOWN_SET_ROLE_DEBT: dict[str, int] = {
    "agent_core/responder.py": 1,
    "agent_core/toucher.py": 1,
    "app.py": 1,
    "server.py": 1,
}


@pytest.mark.parametrize(
    "module",
    _modules_outside_the_repository(),
    ids=lambda p: p.relative_to(_SOURCE_ROOT).as_posix(),
)
def test_module_contains_no_sql(module: Path) -> None:
    rel = module.relative_to(_SOURCE_ROOT).as_posix()
    found = _violations(module.read_text(encoding="utf-8"))
    set_role_hits = [line for line in found if "set role" in line.lower()]
    other_hits = [line for line in found if line not in set_role_hits]

    expected = _KNOWN_SET_ROLE_DEBT.get(rel, 0)
    assert len(set_role_hits) == expected, (
        f"{rel}: esperava {expected} ocorrência(s) conhecida(s) de SET ROLE "
        f"(ver _KNOWN_SET_ROLE_DEBT), achou {len(set_role_hits)} "
        f"({'; '.join(set_role_hits)}). SET ROLE nova aqui: ou é a mesma dívida "
        f"(atualize _KNOWN_SET_ROLE_DEBT com justificativa) ou é SQL de verdade "
        f"fora de lugar (mova para agents_runtime/repository/)."
    )
    assert not other_hits, (
        f"{rel} contains SQL "
        f"({'; '.join(other_hits)}). Move the query into agents_runtime/repository/."
    )


class TestTheDetectorItself:
    def test_catches_a_select(self) -> None:
        assert _violations('q = "SELECT id FROM conversations"\n')

    def test_catches_a_multiline_statement(self) -> None:
        assert _violations('q = """\n    UPDATE conversations SET lease_until = %s\n"""\n')

    def test_catches_a_cte(self) -> None:
        assert _violations('q = "WITH claimed AS (SELECT 1) SELECT * FROM claimed"\n')

    def test_catches_a_set_role(self) -> None:
        # Auditoria item 17: este é o comando que o regex deixava passar —
        # exatamente o que `"set role " + role` planta nos quatro pontos de
        # entrada listados em _KNOWN_SET_ROLE_DEBT.
        assert _violations('q = "set role " + role\n')
        assert _violations('q = "SET ROLE tenant_reader"\n')

    def test_ignores_a_docstring_quoting_sql(self) -> None:
        assert not _violations('"""SELECT max(seq)+1 is forbidden — see ADR-04."""\n')

    def test_ignores_ordinary_prose(self) -> None:
        assert not _violations('label = "Selecione uma loja"\n')
