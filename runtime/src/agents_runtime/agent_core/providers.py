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
from dataclasses import dataclass

from agents_runtime.agent_core import openrouter
from agents_runtime.agent_core.direct_providers import AnthropicLlm, OpenAICompatibleLlm
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
    # openai e qualquer compatível: a base_url da linha vence o default.
    return OpenAICompatibleLlm(
        choice.api_key, base_url=choice.base_url, provider_label=choice.provider
    )


def platform_enabled() -> bool:
    return os.environ.get(PLATFORM_ENABLED_VARIABLE, "").lower() in ("1", "true", "yes")


def resolve_agent_llm(
    rows: tuple[ProviderKeyRow, ...],
    *,
    agent_provider: str,
    base_secret: str | None,
    platform: LlmPort | None = None,
) -> LlmPort:
    """A cascata inteira. `platform` só entra quando o degrau (3) estiver
    ligado por config — hoje é stub desligado (BYO-only)."""
    choice = select_provider_key(rows, agent_provider=agent_provider)
    if choice is not None:
        decoded = decode_stored_key(choice.api_key, base_secret=base_secret)
        return client_for(
            ProviderChoice(choice.provider, decoded, choice.base_url)
        )

    if platform is not None and platform_enabled():
        return platform

    raise NoOrgLlmKey(
        f"org sem chave para '{agent_provider}' e sem OpenRouter próprio (BYO-only)"
    )
