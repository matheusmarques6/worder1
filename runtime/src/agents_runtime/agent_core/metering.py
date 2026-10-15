"""The meter — every completed LLM call leaves a row of cost, and nothing else.

It wraps the port instead of living inside the adapter so the trail survives a
second adapter: whatever speaks to a model is wrapped here, and
`internal.llm_calls` is written by one code path for the agent, the judge and
the embeddings.

Three rules, each of them a decision of S5:

  * **Latency comes from the injected clock.** The fitness function of E0-06
    forbids reading the wall clock outside `clock.py`, and a clock a test can
    move is what makes latency an assertion instead of a range.
  * **A failed call leaves no row.** `llm_calls` (§6.4) has no error column: a
    row for a call that produced nothing would be a cost that never existed.
    Failures belong to the outbox and to `alerts`, not to the invoice.
  * **Content never enters a record.** Prompt, reply and phone number stay in
    Postgres; what leaves for the telemetry of S10 is cost, latency and ids.

Who writes the row is the caller's business: `record` is a port, and the
short transaction with `SET LOCAL app.organization_id` around
`repository.llm_calls.record_llm_call` is opened where a connection exists.
Opening one here would mean a transaction living across an LLM call, which is
exactly what ADR-6 forbids.

Auditoria item 41 — o teto de custo por turno mora aqui, e em nenhum outro
lugar (ruling B): este é o único código por onde passa TODA chamada de LLM de
um turno — `agent_reply`, `judge_pre` e `embedding`, três finalidades, três
instâncias de `MeteredLlm`, mas um `TurnBudget` só, compartilhado por
referência entre elas na composição (`responder.py`). Contar em cada call site
seria um teto que diverge de si mesmo assim que alguém acrescentar uma quarta
finalidade e esquecer de somá-la. `reserve()` roda ANTES da chamada de rede —
a chamada que estouraria o teto nunca sai, então "para de escalar" (ruling C)
é literal: não é uma chamada que falha, é uma chamada que não acontece.

Divergência deliberada do TS (item 41, ver `runtime/FORK.md`): o produto TS
bloqueia por orçamento em vários pontos de entrada (`checkAiBudget`, chamado
de `engine.ts`, `evals.ts`, `proposals.ts`, `test-runner.ts`); o runtime tem
um teto de CHAMADAS por turno, neste ponto único, porque é o ponto único que
existe — não há framework de orçamento por organização aqui (YAGNI).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from agents_runtime.agent_core.llm import ChatRequest, ChatResult, EmbeddingResult, LlmPort
from agents_runtime.clock import Clock
from agents_runtime.obs.telemetry import annotate, span

#: An embedding is an embedding whatever the meter was built for — the purpose
#: of a chat call is the composition's choice, this one is not.
EMBEDDING_PURPOSE = "embedding"

#: Item 41 — teto de chamadas de LLM por turno (chat + embedding, TODAS as
#: finalidades somadas). O pior caso do desenho é 16 chamadas (12 gerações do
#: agente + 3 do juiz + 1 embedding — `runtime/FORK.md` tem a conta). Este
#: default não é o pior caso: é o gasto de um turno NORMAL (1-2 chamadas do
#: agente + 1 do juiz + até 1 embedding = 2 a 4 chamadas, ver
#: `tests/db/test_responder_tool_loop.py` para o formato de um turno com uma
#: rodada de tool) com folga para absorver uma regeneração inteira do Judge 1
#: sem disparar — e ainda parar bem antes do teto de desenho.
DEFAULT_TURN_LLM_CALL_LIMIT = 8

#: Variável de ambiente que sobrescreve o default acima (ruling D — nada de
#: número chumbado sem constante nomeada, e configurável por ambiente).
TURN_LLM_CALL_LIMIT_VARIABLE = "AGENTS_TURN_LLM_CALL_LIMIT"


class TurnBudgetExceeded(Exception):
    """O teto de chamadas do turno (item 41) foi atingido: o medidor recusou
    ABRIR mais uma chamada — isto não é uma reprovação do juiz nem um erro de
    rede, é o freio de custo. Quem chama decide o que fazer (ruling C:
    `guarded_reply`, em `judges/pre_send.py`, entrega o melhor rascunho que já
    tinha; só falha se não houver nenhum)."""

    def __init__(self, *, limit: int, purpose: str) -> None:
        super().__init__(f"turn LLM call budget ({limit}) exceeded at purpose={purpose!r}")
        self.limit = limit
        self.purpose = purpose


@dataclass
class TurnBudget:
    """Quantas chamadas de LLM um turno ainda pode fazer. UMA instância por
    turno, passada por referência às três instâncias de `MeteredLlm` do turno
    (agent_reply, judge_pre, embedding) — o contador é do TURNO, não da
    finalidade, e por isso não pode viver dentro de `MeteredLlm` mesmo."""

    limit: int
    used: int = 0

    def reserve(self, purpose: str) -> None:
        """Reserva uma chamada, ou recusa. Chamado ANTES do request de rede —
        a chamada recusada nunca é feita, nunca custa nada e nunca aparece em
        `internal.llm_calls`.

        Sem rollback (Minor #2 da review do item 41): `used` incrementa aqui,
        e uma chamada que FALHA depois (exceção de rede, timeout, HTTP 500 em
        `MeteredLlm.chat`/`.embed`) não devolve o slot — o teto conta
        TENTATIVAS de chamada, não só as que tiveram sucesso. É a escolha
        certa para o que o item 41 protege (a escalada de custo de um turno
        preso tentando de novo), mas o efeito prático é que um provedor
        instável pode fazer um turno bater no teto com MENOS respostas úteis
        do que `limit` sugere — a proteção continua funcionando (menos
        chamadas saem, não mais), só o número de rascunhos que ela permite
        pode ser menor que `limit` quando há falhas no meio."""
        if self.used >= self.limit:
            raise TurnBudgetExceeded(limit=self.limit, purpose=purpose)
        self.used += 1


#: Preço por 1M de tokens (entrada, saída) em USD — porte de
#: `src/lib/ai/cost-tracker.ts::PRICING` (alteração 2026-10-15-04). Só vale
#: para chamadas em que o provedor NÃO devolve custo (chave direta); a
#: OpenRouter devolve o cobrado e ele vence. Chave: `provedor/modelo`.
PRICE_TABLE: dict[str, tuple[float, float]] = {
    "openai/gpt-4o": (2.50, 10.00),
    "openai/gpt-4o-mini": (0.15, 0.60),
    "openai/gpt-4.1": (2.00, 8.00),
    "openai/gpt-4.1-mini": (0.40, 1.60),
    "openai/gpt-4-turbo": (10.00, 30.00),
    "openai/gpt-3.5-turbo": (0.50, 1.50),
    "openai/o1-preview": (15.00, 60.00),
    "openai/o1-mini": (3.00, 12.00),
    "openai/text-embedding-3-small": (0.02, 0.0),
    "anthropic/claude-opus-4-6": (15.00, 75.00),
    "anthropic/claude-sonnet-4-6": (3.00, 15.00),
    "anthropic/claude-haiku-4-5": (0.80, 4.00),
    "anthropic/claude-haiku-4.5": (0.80, 4.00),
    "anthropic/claude-3-5-sonnet": (3.00, 15.00),
    "anthropic/claude-3-5-haiku": (1.00, 5.00),
    "anthropic/claude-3-opus": (15.00, 75.00),
    "google/gemini-2.0-flash": (0.10, 0.40),
    "gemini/gemini-2.0-flash": (0.10, 0.40),
    "google/gemini-1.5-pro": (1.25, 5.00),
    "gemini/gemini-1.5-pro": (1.25, 5.00),
    "google/gemini-1.5-flash": (0.075, 0.30),
    "gemini/gemini-1.5-flash": (0.075, 0.30),
}


def estimate_cost_usd(
    provider: str, model: str, input_tokens: int | None, output_tokens: int | None
) -> float | None:
    """Custo pela tabela quando o provedor não disse; `None` se o modelo não
    está na tabela ou os tokens são desconhecidos — nunca 0 (0 é "grátis")."""
    if input_tokens is None or output_tokens is None:
        return None
    key = model if "/" in model else f"{provider}/{model}"
    price = PRICE_TABLE.get(key) or PRICE_TABLE.get(key.lower())
    if price is None:
        return None
    return (input_tokens / 1_000_000) * price[0] + (output_tokens / 1_000_000) * price[1]


@dataclass(frozen=True, slots=True)
class MonthlyBlock:
    """Por que o turno não pode gastar: `scope` é 'org' ou 'agent'."""

    scope: str
    spent_usd: float
    limit_usd: float

    @property
    def detail(self) -> str:
        quem = "da loja" if self.scope == "org" else "do agente"
        return (
            f"Teto mensal de IA {quem} atingido "
            f"(US$ {self.spent_usd:.2f} de US$ {self.limit_usd:.2f}) — nada respondido"
        )


def monthly_block(
    *,
    org_spent_usd: float,
    org_limit_usd: float,
    agent_spent_usd: float,
    agent_cap_usd: float | None,
) -> MonthlyBlock | None:
    """Pura: a org estourou? senão, o agente estourou o seu teto próprio?
    Custo desconhecido NÃO bloqueia (diferente do TS): uma linha sem preço
    calar o agente da loja inteira seria pior que a imprecisão — ela fica
    visível na tela de uso, que é o lugar dela."""
    if org_limit_usd > 0 and org_spent_usd >= org_limit_usd:
        return MonthlyBlock("org", org_spent_usd, org_limit_usd)
    if agent_cap_usd is not None and agent_cap_usd > 0 and agent_spent_usd >= agent_cap_usd:
        return MonthlyBlock("agent", agent_spent_usd, agent_cap_usd)
    return None


@dataclass(frozen=True, slots=True)
class CallRecord:
    """One line of the invoice. Every field is a number or an identifier."""

    purpose: str
    provider: str
    model: str
    input_tokens: int | None
    output_tokens: int | None
    cost_usd: float | None
    latency_ms: int


class Recorder(Protocol):
    async def __call__(self, record: CallRecord) -> None: ...


class MeteredLlm:
    """An `LlmPort` that bills. `purpose` separates the agent's spend from the
    gate's on the cost screen, so it is fixed when the meter is built.

    `budget` (item 41) is optional and, when given, shared by reference with
    the OTHER `MeteredLlm` instances of the same turn — see the module
    docstring. `None` (the default) keeps every existing caller and test
    unmetered-for-count, exactly as before this item.
    """

    def __init__(
        self,
        inner: LlmPort,
        *,
        clock: Clock,
        record: Recorder,
        purpose: str,
        budget: TurnBudget | None = None,
    ) -> None:
        self._inner = inner
        self._clock = clock
        self._record = record
        self._purpose = purpose
        self._budget = budget

    async def chat(self, request: ChatRequest) -> ChatResult:
        if self._budget is not None:
            self._budget.reserve(self._purpose)
        # Alteração 2026-10-15-01: um span por chamada, filho do `turn`. Só
        # rótulos (finalidade, provedor, modelo): o conteúdo fica no Postgres.
        with span("llm_call", kind=self._purpose, model=request.model):
            started = self._clock.now()
            result = await self._inner.chat(request)
            annotate(provider=result.provider, model=result.model)
        await self._bill(self._purpose, result.provider, result.model, result, started)
        return result

    async def embed(self, texts: Sequence[str], *, model: str) -> EmbeddingResult:
        if self._budget is not None:
            self._budget.reserve(EMBEDDING_PURPOSE)
        with span("llm_call", kind=EMBEDDING_PURPOSE, model=model):
            started = self._clock.now()
            result = await self._inner.embed(texts, model=model)
            annotate(provider=result.provider, model=result.model)
        await self._bill(EMBEDDING_PURPOSE, result.provider, result.model, result, started)
        return result

    async def _bill(
        self,
        purpose: str,
        provider: str,
        model: str,
        result: ChatResult | EmbeddingResult,
        started: datetime,
    ) -> None:
        cost = result.usage.cost_usd
        if cost is None:
            # Alteração 2026-10-15-04: chave direta não devolve custo; a tabela
            # estima para o teto mensal ter com o que contar. Modelo fora da
            # tabela continua `None` (desconhecido, visível na tela de uso).
            cost = estimate_cost_usd(
                provider, model, result.usage.input_tokens, result.usage.output_tokens
            )
        await self._record(
            CallRecord(
                purpose=purpose,
                provider=provider,
                model=model,
                input_tokens=result.usage.input_tokens,
                output_tokens=result.usage.output_tokens,
                cost_usd=cost,
                latency_ms=_elapsed_ms(started, self._clock.now()),
            )
        )


def _elapsed_ms(started: datetime, finished: datetime) -> int:
    return int((finished - started).total_seconds() * 1000)
