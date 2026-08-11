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

from agents_runtime.agent_core.llm import ChatRequest, ChatResult, Usage

OPENAI_BASE_URL = "https://api.openai.com/v1"
ANTHROPIC_BASE_URL = "https://api.anthropic.com"
ANTHROPIC_VERSION = "2023-06-01"

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
        response = await self._client.post(
            "/chat/completions",
            json={
                "model": request.model,
                "messages": [
                    {"role": message.role, "content": message.content}
                    for message in request.messages
                ],
            },
        )
        if response.status_code >= 400:
            raise RuntimeError(f"HTTP {response.status_code} from {self._provider}")

        payload = response.json()
        choices = payload.get("choices") or []
        if not choices or not (choices[0].get("message") or {}).get("content"):
            raise ValueError(f"{self._provider}: 2xx sem resposta utilizável")

        usage = payload.get("usage") or {}
        return ChatResult(
            text=choices[0]["message"]["content"],
            usage=Usage(
                input_tokens=usage.get("prompt_tokens"),
                output_tokens=usage.get("completion_tokens"),
                cost_usd=None,
            ),
            model=payload.get("model") or request.model,
            provider=self._provider,
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
            {"role": m.role, "content": m.content}
            for m in request.messages
            if m.role in ("user", "assistant")
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

        response = await self._client.post("/v1/messages", json=body)
        if response.status_code >= 400:
            raise RuntimeError(f"HTTP {response.status_code} from anthropic")

        payload = response.json()
        blocks = payload.get("content") or []
        text = "".join(
            block.get("text", "") for block in blocks if block.get("type") == "text"
        )
        if not text:
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
        )
