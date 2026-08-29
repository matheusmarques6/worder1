"""Fitness function — o listener HTTP abre conexão num lugar só, e guardado.

`server.py` é o único módulo do runtime que abre conexão FORA do `app._connect`:
o `/healthz` e o `/internal/preview-prompt` atendem requisições avulsas, sem
pool. Foi ali que a guarda de role vazou duas vezes.

Na primeira, `_healthz` e `_preview` tinham cada um o seu
`psycopg.AsyncConnection.connect` + `if set_role:` — dois lugares, o mesmo
padrão copiado, nenhum verificado. Sem a env, o preview chamava
`scope_to_organization` sobre uma conexão do dono do DSN, onde escopo por
organização não significa nada.

O conserto foi colapsar os dois no `_connection`, com `assert_rls_enforced`
dentro. Mas isso era garantia ESTRUTURAL, não afirmada: um terceiro handler
copiando o padrão antigo reabria o buraco sem quebrar teste nenhum — que é
exatamente como ele nasceu.

`_healthz` engole toda exceção em 503, então nem um teste de comportamento
pegaria a regressão por lá. Por isso a asserção é sobre a FORMA do módulo, no
mesmo espírito das outras fitness deste diretório: a detecção é por AST, então
um comentário citando `connect(` não é violação.
"""

import ast
from pathlib import Path

import agents_runtime

_SERVER = Path(agents_runtime.__file__).parent / "server.py"


def _functions(tree: ast.Module) -> list[ast.AsyncFunctionDef | ast.FunctionDef]:
    return [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.AsyncFunctionDef | ast.FunctionDef)
    ]


def _calls(function: ast.AST, name: str) -> bool:
    """Se `name` é chamado em qualquer lugar do corpo — atributo ou nome nu."""
    for node in ast.walk(function):
        if not isinstance(node, ast.Call):
            continue
        target = node.func
        if isinstance(target, ast.Attribute) and target.attr == name:
            return True
        if isinstance(target, ast.Name) and target.id == name:
            return True
    return False


class TestTheListenerHasOneDoorToTheDatabase:
    def test_only_one_function_opens_a_connection(self) -> None:
        tree = ast.parse(_SERVER.read_text(encoding="utf-8"))
        openers = [fn.name for fn in _functions(tree) if _calls(fn, "connect")]

        assert openers == ["_connection"], (
            "server.py voltou a abrir conexão em mais de um lugar: "
            f"{openers}. Todo handler tem que passar por `_connection`, que é "
            "onde a guarda de role mora."
        )

    def test_that_one_function_proves_the_role(self) -> None:
        tree = ast.parse(_SERVER.read_text(encoding="utf-8"))
        (connection,) = [fn for fn in _functions(tree) if fn.name == "_connection"]

        assert _calls(connection, "assert_rls_enforced"), (
            "`_connection` deixou de provar o role. Sem isso o listener volta a "
            "atender sobre uma conexão que a RLS não alcança — e o `_healthz` "
            "engole a exceção em 503, então nada mais denuncia."
        )
