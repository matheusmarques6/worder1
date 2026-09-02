"""Os adapters de chave DIRETA da org (cascata D4, degrau 1).

Este é um módulo-adapter: os hostnames de provedor são literais privilegiados
que SÓ podem existir aqui, em `openrouter.py` e em `channels/cloud_api.py`
(fitness `test_no_provider_network`). O resto do runtime recebe uma porta.

Dois formatos:
  * `OpenAICompatibleLlm` — /chat/completions; serve OpenAI e qualquer
    endpoint compatível (base_url da linha de organization_api_keys vence o
    default).
  * `AnthropicLlm` — /v1/messages nativo (x-api-key + anthropic-version).

Só CHAT: embeddings e Judge 1 são SEMPRE da plataforma (OpenRouter, D4).
`think` do ChatRequest é ignorado aqui no v1 — reasoning estendido por chave
direta fica para quando houver demanda (registrado no STATUS).

Erros viram `RuntimeError("HTTP {status} …")` — o classificador de falhas lê
o status da mensagem; 2xx sem resposta é `ValueError` (permanente).
"""

import httpx

from agents_runtime.agent_core.llm import ChatRequest, ChatResult, Message, ToolCall, Usage
from agents_runtime.agent_core.openrouter import (
    openai_message,
    openai_tool,
    openai_tool_calls,
)

OPENAI_BASE_URL = "https://api.openai.com/v1"
ANTHROPIC_BASE_URL = "https://api.anthropic.com"
ANTHROPIC_VERSION = "2023-06-01"

#: Item 36 da auditoria (ruling B): Groq e DeepSeek falam o mesmo dialeto
#: OpenAI que `OpenAICompatibleLlm` já implementa — é o próprio TS que prova,
#: chamando `/chat/completions` nos dois (`ai-providers.ts:284,318`). Só
#: faltava o Python saber a URL default por nome de provider; a `base_url`
#: gravada na linha de `organization_api_keys` continua vencendo o default
#: (ver `client_for` em `providers.py`) — org com proxy próprio não é atropelada.
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"

#: DIVERGÊNCIA DELIBERADA do TS (item 36 da auditoria, ruling C). O TS fala
#: com o Gemini pelo endpoint NATIVO `:generateContent` (`ai-providers.ts:246`
#: — corpo `contents`/`parts`, header `x-goog-api-key`, não é formato OpenAI).
#: Aqui usamos o endpoint OpenAI-COMPATÍVEL do Google (mesmo host, path
#: `/v1beta/openai`), verificado por POST real com chave inválida, sem gastar
#: credencial de lojista (evidência completa em
#: `.superpowers/sdd/AUDITORIA-IA-2026-08-28-CHECKLIST/task-36-report.md`):
#: (1) o endpoint EXISTE — 400 `INVALID_ARGUMENT`, não 404; (2) ACEITA
#: `Authorization: Bearer` — a mensagem muda de "Missing or invalid
#: Authorization header." (sem header) para "Please pass a valid API key"
#: (header presente, chave inválida); (3) ACEITA `tools` no formato OpenAI —
#: a mesma chamada com e sem `tools` no corpo devolve o mesmo erro de chave,
#: ou seja o corpo com `tools` não é rejeitado antes da checagem de auth.
#: Escolhido em vez de um adapter nativo porque cabe no mesmo mapa/branch do
#: Groq e DeepSeek, sem arquivo novo e sem mexer na trava de fitness
#: (`test_no_provider_network.py`). Se este endpoint um dia sair do ar ou
#: perder paridade de tools, a escolha entre adapter nativo e bloqueio na UI
#: volta a ser decisão de produto (ruling C original).
GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"

#: Provider → base_url default quando a org não gravou uma própria. "google"
#: é alias de "gemini", como no TS (`ai-providers.ts:426-427`, ruling D).
#: Qualquer provider fora deste mapa cai no `OPENAI_BASE_URL` de
#: `OpenAICompatibleLlm` (comportamento anterior, inalterado).
DEFAULT_BASE_URLS: dict[str, str] = {
    "groq": GROQ_BASE_URL,
    "deepseek": DEEPSEEK_BASE_URL,
    "gemini": GEMINI_OPENAI_BASE_URL,
    "google": GEMINI_OPENAI_BASE_URL,
}

DEFAULT_TIMEOUT_SECONDS = 60.0

#: O /v1/messages exige max_tokens; respostas de WhatsApp são curtas por
#: desenho, e o teto protege o custo de um modelo que resolve divagar.
DEFAULT_MAX_TOKENS = 1024


class OpenAICompatibleLlm:
    def __init__(
        self,
        api_key: str,
        *,
        base_url: str | None = None,
        provider_label: str = "openai",
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._provider = provider_label
        self._client = httpx.AsyncClient(
            base_url=base_url or OPENAI_BASE_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=httpx.Timeout(timeout),
            transport=transport,
        )

    async def chat(self, request: ChatRequest) -> ChatResult:
        body: dict = {
            "model": request.model,
            "messages": [openai_message(message) for message in request.messages],
        }
        if request.tools:
            body["tools"] = [openai_tool(tool) for tool in request.tools]

        response = await self._client.post("/chat/completions", json=body)
        if response.status_code >= 400:
            raise RuntimeError(f"HTTP {response.status_code} from {self._provider}")

        payload = response.json()
        choices = payload.get("choices") or []
        message = (choices[0].get("message") or {}) if choices else {}
        tool_calls = openai_tool_calls(message)
        if not tool_calls and not message.get("content"):
            raise ValueError(f"{self._provider}: 2xx sem resposta utilizável")

        usage = payload.get("usage") or {}
        return ChatResult(
            text=message.get("content") or "",
            usage=Usage(
                input_tokens=usage.get("prompt_tokens"),
                output_tokens=usage.get("completion_tokens"),
                cost_usd=None,
            ),
            model=payload.get("model") or request.model,
            provider=self._provider,
            tool_calls=tool_calls,
        )


class AnthropicLlm:
    def __init__(
        self,
        api_key: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        max_tokens: int = DEFAULT_MAX_TOKENS,
    ) -> None:
        self._max_tokens = max_tokens
        self._client = httpx.AsyncClient(
            base_url=ANTHROPIC_BASE_URL,
            headers={
                "x-api-key": api_key,
                "anthropic-version": ANTHROPIC_VERSION,
            },
            timeout=httpx.Timeout(timeout),
            transport=transport,
        )

    async def chat(self, request: ChatRequest) -> ChatResult:
        system_parts = [m.content for m in request.messages if m.role == "system"]
        turns = [
            _anthropic_turn(m)
            for m in request.messages
            if m.role in ("user", "assistant", "tool")
        ]
        if not turns:
            # A API de messages recusa conversa vazia; o frame vira o turno.
            turns = [{"role": "user", "content": "…"}]

        body: dict = {
            "model": request.model,
            "max_tokens": self._max_tokens,
            "messages": turns,
        }
        if system_parts:
            body["system"] = "\n\n".join(system_parts)
        if request.tools:
            body["tools"] = [
                {
                    "name": tool.name,
                    "description": tool.description,
                    "input_schema": dict(tool.parameters),
                }
                for tool in request.tools
            ]

        response = await self._client.post("/v1/messages", json=body)
        if response.status_code >= 400:
            raise RuntimeError(f"HTTP {response.status_code} from anthropic")

        payload = response.json()
        blocks = payload.get("content") or []
        text = "".join(
            block.get("text", "") for block in blocks if block.get("type") == "text"
        )
        tool_calls = tuple(
            ToolCall(
                id=str(block.get("id") or ""),
                name=block.get("name") or "",
                arguments=block.get("input") or {},
            )
            for block in blocks
            if block.get("type") == "tool_use"
        )
        if not text and not tool_calls:
            raise ValueError("anthropic: 2xx sem bloco de texto")

        usage = payload.get("usage") or {}
        return ChatResult(
            text=text,
            usage=Usage(
                input_tokens=usage.get("input_tokens"),
                output_tokens=usage.get("output_tokens"),
                cost_usd=None,
            ),
            model=payload.get("model") or request.model,
            provider="anthropic",
            tool_calls=tool_calls,
        )


def _anthropic_turn(message: Message) -> dict:
    """A Message da porta no dialeto /v1/messages: assistant pedindo tool vira
    blocos `tool_use`; role="tool" vira turno de USER com `tool_result` (é
    assim que a API nativa modela a volta do loop)."""
    if message.role == "assistant" and message.tool_calls:
        blocks: list[dict] = []
        if message.content:
            blocks.append({"type": "text", "text": message.content})
        blocks.extend(
            {
                "type": "tool_use",
                "id": call.id,
                "name": call.name,
                "input": dict(call.arguments),
            }
            for call in message.tool_calls
        )
        return {"role": "assistant", "content": blocks}
    if message.role == "tool":
        return {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": message.tool_call_id or "",
                    "content": message.content,
                }
            ],
        }
    return {"role": message.role, "content": message.content}
