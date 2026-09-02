"""Item 40 da auditoria: o cliente httpx do LLM do agente fecha no fim do
turno — prova COMPORTAMENTAL, não de forma.

Fix round 1 (`task-40-report.md`): a primeira versão deste arquivo só provava
por AST que `respond()` fechava o cliente dentro de um `finally` com uma
guarda `if` — a review reproduziu essa prova E foi além: extraiu a mesma
guarda e o mesmo fechamento para uma função auxiliar (comportamento
IDÊNTICO) e as duas asserções quebraram do mesmo jeito. O teste protegia o
FORMATO SINTÁTICO do `finally`, não o fato de o cliente ser fechado — um
refactor legítimo (mover para `async with`, extrair uma função) o deixava
vermelho sem ter quebrado nada, e a reação natural de quem mexesse ali seria
afrouxar ou apagar o teste. Foi exatamente isso que aconteceu de propósito
nesta correção: o fechamento virou `agent_core.providers.scoped_agent_llm`
(um `@asynccontextmanager` compartilhado por `respond()` e por `touch()` —
ruling C, fix round 1: os dois são pontos independentes onde o adapter
nasce e morre, e fechar nos dois não é espalhar remendo).

`TestScopedAgentLlmClosesTheClientItOwns` é a prova principal agora:
comportamental, direto contra `scoped_agent_llm`, sem precisar de Postgres
(`respond()`/`touch()` inteiros dependem de conexão real — guards, missão,
conhecimento, trilha — por isso vivem em `tests/db`, que não roda nesta
suíte). Cobre os quatro casos que importam: fecha depois de todas as
chamadas do turno; fecha quando o turno levanta exceção; fecha quando o
turno é CANCELADO (`asyncio.CancelledError`, o caso que a review pediu
explicitamente); e nunca fecha o cliente de plataforma do Judge 1
(`owns=False`, ruling D).

`TestTheTurnWiresIntoTheScope` é cinto e suspensório, não a prova principal
— e por isso mesmo verifica só a FORMA: que `respond()` e `touch()` chamam
`scoped_agent_llm` em algum lugar do corpo. Não checa `finally`, não checa
`if`, não checa onde — só que a chamada existe. Isso sobrevive a qualquer
refactor legítimo de COMO o fechamento acontece (é `scoped_agent_llm` que
carrega essa responsabilidade e tem prova comportamental própria), mas
ainda pega quem remover a chamada inteira — a wiring que a prova
comportamental sozinha não alcança, porque ela testa o mecanismo, não quem
o usa.
"""

import ast
import asyncio
from pathlib import Path

import pytest

import agents_runtime
from agents_runtime.agent_core.providers import scoped_agent_llm

_RESPONDER = Path(agents_runtime.__file__).parent / "agent_core" / "responder.py"
_TOUCHER = Path(agents_runtime.__file__).parent / "agent_core" / "toucher.py"


class _RecordingLlm:
    """Um `LlmPort` falso que só registra a ORDEM dos eventos — chamadas de
    chat e o fechamento — para provar que o fechamento vem depois de todas
    as chamadas do turno, nunca antes."""

    def __init__(self) -> None:
        self.events: list[str] = []

    async def chat(self, request=None):
        self.events.append("chat")
        return None

    async def embed(self, texts=(), *, model: str = ""):
        self.events.append("embed")
        return None

    async def aclose(self) -> None:
        self.events.append("aclose")


class TestScopedAgentLlmClosesTheClientItOwns:
    """Prova comportamental (fix round 1): critério duplo — falha se o
    fechamento for removido, continua verde se o mecanismo for refatorado
    mantendo o fechamento."""

    async def test_it_closes_after_every_call_of_the_turn(self) -> None:
        fake = _RecordingLlm()

        async with scoped_agent_llm(fake, owns=True) as agent_llm:
            await agent_llm.chat()
            await agent_llm.chat()
            await agent_llm.chat()

        assert fake.events == ["chat", "chat", "chat", "aclose"], (
            "o cliente tem de fechar DEPOIS de todas as chamadas do turno, "
            "nunca antes e nunca em vez delas"
        )

    async def test_it_closes_even_when_the_turn_raises(self) -> None:
        fake = _RecordingLlm()

        with pytest.raises(RuntimeError, match="modelo caiu no meio do turno"):
            async with scoped_agent_llm(fake, owns=True) as agent_llm:
                await agent_llm.chat()
                raise RuntimeError("modelo caiu no meio do turno")

        assert fake.events == ["chat", "aclose"], (
            "uma exceção no meio do turno não pode deixar o cliente aberto — "
            "é exatamente o vazamento que um `finally` (real ou por trás de "
            "um `async with`) existe para evitar"
        )

    async def test_it_closes_even_when_the_turn_is_cancelled(self) -> None:
        """A review pediu este caminho explicitamente: cancelamento não é
        exceção do domínio, é o worker derrubando a tarefa (lease perdida,
        shutdown) — e o cliente não pode sobreviver a isso."""
        fake = _RecordingLlm()
        entered = asyncio.Event()

        async def turn() -> None:
            async with scoped_agent_llm(fake, owns=True) as agent_llm:
                await agent_llm.chat()
                entered.set()
                await asyncio.sleep(10)  # nunca termina — é cancelada primeiro

        task = asyncio.create_task(turn())
        await entered.wait()
        task.cancel()

        with pytest.raises(asyncio.CancelledError):
            await task

        assert fake.events == ["chat", "aclose"], (
            "o turno cancelado no meio da espera pelo modelo tem de fechar o "
            "cliente do mesmo jeito — cancelamento passa pelo `finally` "
            "como qualquer outra saída"
        )

    async def test_it_never_closes_the_platform_client(self) -> None:
        """Ruling D: `owns=False` é o cliente do Judge 1, por processo —
        outros turnos concorrentes ainda o usam depois que este termina."""
        fake = _RecordingLlm()

        async with scoped_agent_llm(fake, owns=False) as agent_llm:
            await agent_llm.chat()

        assert fake.events == ["chat"], (
            "`owns=False` fechou o cliente mesmo assim — isso derrubaria o "
            "cliente de plataforma do Judge 1 a cada turno, quebrando todo "
            "turno concorrente que ainda o usa"
        )


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


class TestTheTurnWiresIntoTheScope:
    """Cinto e suspensório — checa só a FORMA (que a chamada existe), não o
    mecanismo de fechamento (esse é `TestScopedAgentLlmClosesTheClientItOwns`,
    acima, comportamental). Não é a prova principal do item 40."""

    def test_respond_wires_into_scoped_agent_llm(self) -> None:
        tree = ast.parse(_RESPONDER.read_text(encoding="utf-8"))
        candidates = [
            fn
            for fn in _functions(tree)
            if fn.name == "respond" and _calls(fn, "resolve_agent_llm")
        ]
        assert len(candidates) == 1, (
            f"esperava uma única `respond` chamando `resolve_agent_llm`, achei "
            f"{len(candidates)} — o módulo mudou de forma, ajuste o teste."
        )
        assert _calls(candidates[0], "scoped_agent_llm"), (
            "`respond()` parou de chamar `scoped_agent_llm` — o cliente do "
            "LLM do agente voltou a não ter dono de fechamento nenhum."
        )

    def test_touch_wires_into_scoped_agent_llm(self) -> None:
        tree = ast.parse(_TOUCHER.read_text(encoding="utf-8"))
        candidates = [
            fn
            for fn in _functions(tree)
            if fn.name == "touch" and _calls(fn, "resolve_agent_llm")
        ]
        assert len(candidates) == 1, (
            f"esperava uma única `touch` chamando `resolve_agent_llm`, achei "
            f"{len(candidates)} — o módulo mudou de forma, ajuste o teste."
        )
        assert _calls(candidates[0], "scoped_agent_llm"), (
            "`touch()` parou de chamar `scoped_agent_llm` — o cliente do LLM "
            "do toque voltou a não ter dono de fechamento nenhum."
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
