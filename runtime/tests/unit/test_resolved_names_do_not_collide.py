"""Fitness function — o retorno de `resolve_agent_llm` não empresta um nome já vivo.

`resolve_agent_llm` devolve `ResolvedAgentLlm(NamedTuple)`, que tem **dois**
atributos: `port` e `built_here` (`providers.py`). Quem o chama já tem, no mesmo
escopo, a `ResolvedMission` — um objeto com `tools`, `mission_version_id`,
`promote_moment` e mais. Os dois são "o resolvido" em português, e foi assim que
o defeito entrou: o item 52 ligou o retorno da cascata a `resolved`, que já era a
missão, e o restante da função continuou lendo `resolved.tools`.

O ramo só executa com `agent_llm_from_org_keys=True`, que é **exatamente** o que
a fábrica de produção passa (`build_responder`, e o gêmeo em `build_toucher`).
Em produção, portanto, todo turno que chegasse à cascata morreria com
`AttributeError: 'ResolvedAgentLlm' object has no attribute 'tools'`. Nenhum
tier pegou: `agent_llm_from_org_keys` não aparece em `runtime/tests/` — é o vão
que o próprio item 52 registrou para o item 63, e é ele que deixou isto passar.

A trava é por AST e não por texto porque o nome do alvo pode mudar: o que ela
afirma é a **propriedade**, não a grafia. Para cada função que chama
`resolve_agent_llm`, o nome ligado ao retorno só pode ser usado com `.port` e
`.built_here` — qualquer outro atributo significa que o nome está sendo confundido
com outro objeto. Um `mypy` pegaria isto de graça; enquanto ele não existe aqui
(ver o item que pede o type checker), esta função faz o papel dele nesta porta.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

import agents_runtime

_SOURCE_ROOT = Path(agents_runtime.__file__).parent
_RESOLVER = "resolve_agent_llm"
_ALLOWED = frozenset({"port", "built_here"})

_CALLERS = sorted(
    path
    for path in _SOURCE_ROOT.rglob("*.py")
    if _RESOLVER in path.read_text(encoding="utf-8")
    and path.name != "providers.py"
)


def _bound_names(function: ast.AST) -> set[str]:
    """Nomes ligados ao retorno de `resolve_agent_llm` dentro desta função."""
    names: set[str] = set()
    for node in ast.walk(function):
        if not isinstance(node, ast.Assign):
            continue
        call = node.value
        if not isinstance(call, ast.Call):
            continue
        callee = call.func
        name = callee.attr if isinstance(callee, ast.Attribute) else getattr(callee, "id", None)
        if name != _RESOLVER:
            continue
        for target in node.targets:
            if isinstance(target, ast.Name):
                names.add(target.id)
    return names


def _foreign_attributes(function: ast.AST, bound: set[str]) -> list[str]:
    """Atributos lidos desses nomes que `ResolvedAgentLlm` não tem."""
    return sorted(
        f"{node.value.id}.{node.attr}"
        for node in ast.walk(function)
        if isinstance(node, ast.Attribute)
        and isinstance(node.value, ast.Name)
        and node.value.id in bound
        and node.attr not in _ALLOWED
    )


@pytest.mark.unit
@pytest.mark.parametrize("path", _CALLERS, ids=lambda p: p.name)
def test_the_cascade_result_is_not_confused_with_another_object(path: Path) -> None:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    culpados: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        bound = _bound_names(node)
        if not bound:
            continue
        culpados.extend(_foreign_attributes(node, bound))

    assert not culpados, (
        f"{path.name}: o retorno de {_RESOLVER}() só tem {sorted(_ALLOWED)}, "
        f"e o nome que o recebe é lido com {culpados}. O nome está sendo "
        f"confundido com outro objeto do mesmo escopo — em produção isso é "
        f"AttributeError no turno inteiro."
    )


@pytest.mark.unit
def test_the_guard_has_someone_to_guard() -> None:
    """Sem chamador, a trava acima passa vazia e não prova nada."""
    assert _CALLERS, "nenhum chamador de resolve_agent_llm encontrado em src/"
