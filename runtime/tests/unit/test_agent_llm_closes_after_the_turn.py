"""Fitness function — item 40 da auditoria: o cliente httpx do LLM do agente
fecha ao fim do turno.

`resolve_agent_llm`/`client_for` (`providers.py`) constroem um `httpx.AsyncClient`
novo por turno — não um por chamada (são até ~12 chamadas de agente reusando o
MESMO cliente, ver `task-40-recon.md`). Nenhum dos três adapters tinha
finalizador, e nada no runtime chamava `aclose()` em produção: o cliente e o
pool de conexões do httpcore por baixo ficavam vivos até o GC recolher o
objeto — não determinístico num loop asyncio de longa duração.

`respond()` (`build_responder`, não o `fixed_responder` trivial) é o único
lugar onde esse cliente nasce E morre (ruling C): o turno inteiro, da
cascata BYO até o envio, roda dentro de um `try/finally` que fecha o cliente
—  e só ELE, nunca o `llm` de plataforma do Judge 1 (ruling D, por processo).

Por que AST e não um teste comportamental de ponta a ponta: `respond()`
depende de uma conexão Postgres real (guards, arbitragem de missão,
conhecimento, trilha) — esses testes vivem em `tests/db` e não rodam nesta
suíte. `TestTheAdapterActuallyCloses` abaixo prova que `aclose()` fecha o
`httpx.AsyncClient` de verdade; esta classe prova, pela FORMA do módulo, que
`respond()` chama esse `aclose()` mesmo quando o turno sai por um `return`
no meio do caminho — exatamente o padrão que `test_listener_connects_in_one_
guarded_place.py` já usa para uma garantia estrutural equivalente (a guarda
de role do listener). Remover o `try/finally` ou trocar `finally` por uma
chamada solta no fim do corpo (que um `return` antecipado pularia) quebra o
`test_the_finally_covers_the_client_it_owns` abaixo.
"""

import ast
from pathlib import Path

import agents_runtime

_RESPONDER = Path(agents_runtime.__file__).parent / "agent_core" / "responder.py"


def _functions(tree: ast.Module) -> list[ast.AsyncFunctionDef | ast.FunctionDef]:
    return [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.AsyncFunctionDef | ast.FunctionDef)
    ]


def _calls(node: ast.AST, name: str) -> bool:
    """Se `name` é chamado em qualquer lugar da árvore — atributo ou nome nu."""
    for child in ast.walk(node):
        if not isinstance(child, ast.Call):
            continue
        target = child.func
        if isinstance(target, ast.Attribute) and target.attr == name:
            return True
        if isinstance(target, ast.Name) and target.id == name:
            return True
    return False


def _the_real_respond(tree: ast.Module) -> ast.AsyncFunctionDef:
    """`respond` existe duas vezes no módulo: a trivial de `fixed_responder`
    (E1, resposta fixa) e a de `build_responder`, que resolve o LLM de
    verdade. A que nos interessa é a única que chama `resolve_agent_llm`."""
    candidates = [
        fn
        for fn in _functions(tree)
        if fn.name == "respond" and _calls(fn, "resolve_agent_llm")
    ]
    assert len(candidates) == 1, (
        f"esperava uma única `respond` chamando `resolve_agent_llm`, achei "
        f"{len(candidates)} — o módulo mudou de forma e este teste precisa "
        "de ajuste, não de skip."
    )
    return candidates[0]


def _try_nodes(function: ast.AST) -> list[ast.Try]:
    return [node for node in ast.walk(function) if isinstance(node, ast.Try)]


class TestTheTurnClosesItsOwnClient:
    def test_the_finally_covers_the_client_it_owns(self) -> None:
        tree = ast.parse(_RESPONDER.read_text(encoding="utf-8"))
        respond = _the_real_respond(tree)

        closing_finally = [
            node
            for node in _try_nodes(respond)
            if any(_calls(stmt, "aclose") for stmt in node.finalbody)
        ]
        assert closing_finally, (
            "`respond()` deixou de fechar o cliente do LLM do agente num "
            "`finally` — item 40 da auditoria reabriu. O cliente que "
            "`resolve_agent_llm` constrói por turno tem de ser fechado "
            "mesmo quando o turno sai por um `return` no meio (judge "
            "reprovou, assunto bloqueado, etc.), e só um `finally` "
            "garante isso."
        )

    def test_the_platform_client_is_never_the_one_closed_unconditionally(self) -> None:
        """Ruling D: o `llm` de plataforma (Judge 1, por processo) não pode
        ser fechado a cada turno — a guarda é `if owns_agent_llm:`, não um
        `aclose()` incondicional no `finally`."""
        tree = ast.parse(_RESPONDER.read_text(encoding="utf-8"))
        respond = _the_real_respond(tree)

        for node in _try_nodes(respond):
            for stmt in node.finalbody:
                assert isinstance(stmt, ast.If), (
                    "o `finally` que fecha o cliente do LLM virou uma chamada "
                    "incondicional — sem a guarda `if owns_agent_llm:` isso "
                    "fecharia também o cliente de plataforma do Judge 1, que "
                    "é por processo (ruling D) e tem de sobreviver ao turno."
                )


class TestTheAdapterActuallyCloses:
    """O `aclose()` dos três adapters (item 40) não é decoração: fecha o
    `httpx.AsyncClient` de verdade. `MockTransport` mantém tudo em processo —
    nenhuma rede é usada (fitness `test_no_provider_network`)."""

    async def test_openrouter_llm_closes_its_client(self) -> None:
        import httpx

        from agents_runtime.agent_core.openrouter import OpenRouterLlm

        llm = OpenRouterLlm("sk-test", transport=httpx.MockTransport(lambda r: None))
        assert not llm._client.is_closed
        await llm.aclose()
        assert llm._client.is_closed

    async def test_openai_compatible_llm_closes_its_client(self) -> None:
        import httpx

        from agents_runtime.agent_core.direct_providers import OpenAICompatibleLlm

        llm = OpenAICompatibleLlm("sk-test", transport=httpx.MockTransport(lambda r: None))
        assert not llm._client.is_closed
        await llm.aclose()
        assert llm._client.is_closed

    async def test_anthropic_llm_closes_its_client(self) -> None:
        import httpx

        from agents_runtime.agent_core.direct_providers import AnthropicLlm

        llm = AnthropicLlm("sk-test", transport=httpx.MockTransport(lambda r: None))
        assert not llm._client.is_closed
        await llm.aclose()
        assert llm._client.is_closed
