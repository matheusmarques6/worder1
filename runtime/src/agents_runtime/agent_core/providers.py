"""A cascata de chaves de LLM (D4) — BYO-only por decisão do usuário.

Ordem: (1) chave DIRETA da org para o provider do agente → (2) chave
OpenRouter da org → (3) default da plataforma, ATRÁS de
`AGENTS_PLATFORM_LLM_ENABLED` e DESLIGADO por padrão (PENDENTE-1 resolvido
como BYO-only: sem chave da org o agente não ativa — alerta `no_org_llm_key`
e o toque morre; a tela Budget é informativa).

O que NUNCA passa por aqui: Judge 1 e embeddings — sempre pela chave da
plataforma (`AGENTS_OPENROUTER_API_KEY`), injetada no responder.

Valores da tabela seguem o provider-key-codec do app: secret-box v2 OU
plaintext legado (passthrough). Chave cifrada sem ENCRYPTION_KEY no ambiente
é falha alta, não silêncio.

Nenhum hostname aqui: adapters moram em direct_providers.py/openrouter.py
(fitness `test_no_provider_network`).
"""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import NamedTuple

from agents_runtime.agent_core import openrouter
from agents_runtime.agent_core.direct_providers import (
    DEFAULT_BASE_URLS,
    AnthropicLlm,
    OpenAICompatibleLlm,
)
from agents_runtime.agent_core.llm import LlmPort
from agents_runtime.crypto.secret_box import decrypt_secret, is_encrypted_secret
from agents_runtime.repository.provider_keys import ProviderKeyRow

PLATFORM_ENABLED_VARIABLE = "AGENTS_PLATFORM_LLM_ENABLED"

OPENROUTER = "openrouter"
ANTHROPIC = "anthropic"


class NoOrgLlmKey(RuntimeError):
    """BYO-only: a org não tem chave utilizável — o agente não responde."""


@dataclass(frozen=True, slots=True)
class ProviderChoice:
    provider: str
    api_key: str
    base_url: str | None


def decode_stored_key(value: str, *, base_secret: str | None) -> str:
    """provider-key-codec do app: v2 cifrado ou plaintext legado (passthrough)."""
    if not is_encrypted_secret(value):
        return value
    if not base_secret:
        raise NoOrgLlmKey(
            "chave da org está cifrada e o runtime não tem ENCRYPTION_KEY para lê-la"
        )
    return decrypt_secret(value, base_secret=base_secret)


def select_provider_key(
    rows: tuple[ProviderKeyRow, ...],
    *,
    agent_provider: str,
) -> ProviderChoice | None:
    """O degrau 1-2 da cascata, puro: direta do provider do agente vence;
    OpenRouter da org é o fallback. Sem linha utilizável → None."""
    direct = next((row for row in rows if row.provider == agent_provider), None)
    if direct is not None and direct.provider != OPENROUTER:
        return ProviderChoice(direct.provider, direct.api_key, direct.base_url)

    org_router = next((row for row in rows if row.provider == OPENROUTER), None)
    if org_router is not None:
        return ProviderChoice(OPENROUTER, org_router.api_key, org_router.base_url)

    return None


def client_for(choice: ProviderChoice) -> LlmPort:
    if choice.provider == OPENROUTER:
        return openrouter.OpenRouterLlm(choice.api_key)
    if choice.provider == ANTHROPIC:
        return AnthropicLlm(choice.api_key)
    # openai e qualquer compatível: a base_url da linha vence o default; sem
    # ela, cai no default POR PROVIDER (item 36 — groq/deepseek/gemini/google)
    # quando existe, senão no OPENAI_BASE_URL do próprio OpenAICompatibleLlm.
    return OpenAICompatibleLlm(
        choice.api_key,
        base_url=choice.base_url or DEFAULT_BASE_URLS.get(choice.provider),
        provider_label=choice.provider,
    )


def platform_enabled() -> bool:
    return os.environ.get(PLATFORM_ENABLED_VARIABLE, "").lower() in ("1", "true", "yes")


class ResolvedAgentLlm(NamedTuple):
    """O port da cascata E quem o construiu — quem decide a posse é quem a
    reporta. `built_here=True` só no degrau BYO, onde `client_for` acabou de
    construir o adapter; `False` no degrau (3), que devolve o objeto de
    plataforma que o CHAMADOR entregou. É esse booleano que vai para o
    `owns` de `scoped_agent_llm`: derivar a posse no call site seria correto
    só por procedência do argumento, e um degrau futuro que devolva objeto
    compartilhado não recebido do chamador reintroduziria o item 40."""

    port: LlmPort
    built_here: bool


def resolve_agent_llm(
    rows: tuple[ProviderKeyRow, ...],
    *,
    agent_provider: str,
    base_secret: str | None,
    platform: LlmPort | None = None,
) -> ResolvedAgentLlm:
    """A cascata inteira. O degrau (3) exige DUAS condições, não uma:
    `AGENTS_PLATFORM_LLM_ENABLED` ligada E um `platform` vindo do chamador.
    A flag é necessária e NÃO suficiente — quem governa de fato é o
    argumento, e nenhum call site de produção o passa hoje
    (`responder.py::respond`, `toucher.py::touch`), então ligar só a env não
    tem efeito nenhum. Também não é stub: o caminho por trás do degrau está
    completo (cliente `OpenRouterLlm`, credencial `AGENTS_OPENROUTER_API_KEY`,
    modelo carregado no request) — o que falta é o argumento, parado de
    propósito enquanto o BYO-only valer (item 52)."""
    choice = select_provider_key(rows, agent_provider=agent_provider)
    if choice is not None:
        decoded = decode_stored_key(choice.api_key, base_secret=base_secret)
        return ResolvedAgentLlm(
            client_for(ProviderChoice(choice.provider, decoded, choice.base_url)),
            True,
        )

    if platform is not None and platform_enabled():
        return ResolvedAgentLlm(platform, False)

    raise NoOrgLlmKey(
        f"org sem chave para '{agent_provider}' e sem OpenRouter próprio (BYO-only)"
    )


@asynccontextmanager
async def scoped_agent_llm(agent_llm: LlmPort, *, owns: bool) -> AsyncIterator[LlmPort]:
    """Item 40 da auditoria: o único ponto de fechamento do cliente httpx que
    `resolve_agent_llm` constrói por turno — usado por `respond()`
    (`agent_core/responder.py`) e por `touch()` (`agent_core/toucher.py`).

    Os dois são pontos INDEPENDENTES onde um adapter de LLM nasce e morre
    (mesma cascata BYO, chamada uma vez por turno/toque); fechar nos dois não
    é espalhar remendo — é o mesmo conserto nos dois lugares onde o defeito
    existe (fix round 1 do item 40, `task-40-report.md`).

    `owns=False` nunca fecha: é o `llm` de plataforma do Judge 1, por
    processo (ruling D) — outros turnos concorrentes ainda o usam. Só o
    cliente que a cascata BYO efetivamente construiu (`owns=True`) fecha
    aqui, e fecha sempre — saída normal, exceção ou cancelamento —, porque é
    um `finally` de verdade, não uma chamada solta que um `return`
    intermediário pularia.

    Sem pool, sem registro entre turnos (ruling B/C): isto fecha um cliente
    que já foi construído, nunca decide reusar um velho.
    """
    try:
        yield agent_llm
    finally:
        if owns:
            await agent_llm.aclose()
