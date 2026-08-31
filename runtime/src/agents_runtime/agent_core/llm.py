"""The LLM port — the shape everything that talks to a model speaks.

`arquitetura §3` gives `agent_core` the LLM, so the port lives here and not in a
module of its own. What arrives at a call site is always this Protocol, never an
adapter: the eval harness (S3) drives a scripted stand-in through it, the
responder (S9) drives the real one, and neither knows the difference.

D1 (decisão 79) is written into the types:

  * `model` is a STRING carried by the request, because it is per-tenant
    configuration (`agent_versions.model`). An adapter that chose the model
    would make that column decoration;
  * chat and embedding leave through the SAME door. A second provider for
    embeddings would mean a second key, a second failure mode and a second host
    in the network lock;
  * `Usage` holds what the provider says it billed. Cost is never computed here
    — a price table in the code rots silently and the trail starts lying.

`think` comes from the think-gate (S4), already decided before this point: the
port asks for extended reasoning, it never decides that it is warranted.
"""

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Protocol

#: Everything routes through OpenRouter (D1). Recorded on every row of
#: `internal.llm_calls` next to the model, because the model varies per tenant
#: and the route does not.
PROVIDER = "openrouter"

#: D2, and platform-fixed — unlike the chat model, this one is NOT per tenant:
#: the dimension is frozen in the schema as `vector(1536)`, so a tenant able to
#: choose another embedding model would be a tenant able to break its own
#: ingestion. Confirmed against the provider by the `contract` suite.
EMBEDDING_MODEL = "openai/text-embedding-3-small"

#: O espaço vetorial que ESTE embedador produz, qualificado por provedor — é o
#: que `ai_agent_chunks.embedding_model` carimba quando o próprio runtime
#: ingere (migration 20260828000001).
EMBEDDING_SPACE = f"{PROVIDER}:{EMBEDDING_MODEL}"

#: Os espaços que a busca deste runtime sabe consultar. A lista existe porque as
#: duas pontas chegam ao MESMO modelo por rotas diferentes: o app embeda pela
#: OpenAI direta com a chave da org (`openai:text-embedding-3-small`), este
#: runtime consulta pela OpenRouter com a chave de plataforma.
#:
#: SUPOSIÇÃO — declarada aqui em vez de ficar invisível: a OpenRouter é passagem
#: pura para a OpenAI neste modelo, logo os dois rótulos nomeiam o MESMO espaço.
#: Se um dia deixar de ser, é esta linha que muda; e a coluna `embedding_model` é
#: que dirá exatamente quais chunks precisam ser reindexados. Sem a lista, uma
#: divergência de provedor voltaria a ser o bug silencioso que a coluna existe
#: para tornar visível.
SEARCHABLE_SPACES = ("openai:text-embedding-3-small", EMBEDDING_SPACE)


@dataclass(frozen=True, slots=True)
class ToolSpec:
    """Uma tool OFERECIDA ao modelo (9.3b). `parameters` é JSON Schema — o
    formato neutro; cada adapter traduz para o dialeto do provedor."""

    name: str
    description: str
    parameters: Mapping


@dataclass(frozen=True, slots=True)
class ToolCall:
    """Uma tool PEDIDA pelo modelo. `arguments` já chega parseado — o JSON em
    string é dialeto de provedor, e dialeto não atravessa a porta."""

    id: str
    name: str
    arguments: Mapping


@dataclass(frozen=True, slots=True)
class Message:
    role: str
    content: str
    #: role="assistant" pedindo tools nesta fala (a volta do loop reapresenta).
    tool_calls: tuple[ToolCall, ...] = ()
    #: role="tool" respondendo à chamada com este id.
    tool_call_id: str | None = None


@dataclass(frozen=True, slots=True)
class ChatRequest:
    model: str
    messages: tuple[Message, ...]
    think: bool = False
    #: Vazio = turno sem tools (o corpo enviado nem menciona a chave).
    tools: tuple[ToolSpec, ...] = ()


@dataclass(frozen=True, slots=True)
class Usage:
    """What the call cost, as the provider reported it. Absent stays absent —
    a zero would read as "this call was free" on the cost screen."""

    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None


@dataclass(frozen=True, slots=True)
class ChatResult:
    text: str
    usage: Usage
    #: What was BILLED — the provider's fully qualified name, which is not
    #: always the string the caller asked for.
    model: str
    provider: str = PROVIDER
    #: Não-vazio = o modelo quer tools antes de concluir; `text` pode ser "".
    tool_calls: tuple[ToolCall, ...] = ()


@dataclass(frozen=True, slots=True)
class EmbeddingResult:
    vectors: tuple[tuple[float, ...], ...]
    usage: Usage
    model: str
    provider: str = PROVIDER


class EmbedderPort(Protocol):
    """Narrower on purpose: a tool that retrieves knowledge has no business
    holding something that can also generate text."""

    async def embed(self, texts: Sequence[str], *, model: str) -> EmbeddingResult: ...


class LlmPort(EmbedderPort, Protocol):
    async def chat(self, request: ChatRequest) -> ChatResult: ...


def strip_code_fence(text: str) -> str:
    """`ChatResult.text` sem a cerca de código que o modelo põe em volta.

    Mora aqui, junto de `ChatResult`, porque é um fato sobre o que ATRAVESSA a
    porta — o modelo embrulha a saída em ```…``` mesmo quando o contrato pede
    texto puro (visto ao vivo em 17/08 nas duas pontas: o veredito do juiz e a
    resposta do agente). Dois call sites descobriram isso separadamente e cada
    um escreveu a própria regex; o fato é um só e passa a ser declarado uma vez.

    Sem cerca, devolve o texto intocado — quem chama decide o que fazer com ele.
    """
    raw = (text or "").strip()
    if not raw.startswith("```"):
        return raw
    raw = re.sub(r"^```[a-zA-Z]*\s*", "", raw)
    return re.sub(r"\s*```$", "", raw).strip()
