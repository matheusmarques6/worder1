"""A cascata de chaves D4 — BYO-only (PENDENTE-1 resolvido pelo usuário).

Ordem: direta do provider do agente → OpenRouter da org → plataforma ATRÁS de
flag (desligada por default). Sem chave utilizável, o agente NÃO responde —
`NoOrgLlmKey` vira alerta `no_org_llm_key` no responder, nunca silêncio.
"""

import pytest

from agents_runtime.agent_core.direct_providers import AnthropicLlm, OpenAICompatibleLlm
from agents_runtime.agent_core.openrouter import OpenRouterLlm
from agents_runtime.agent_core.providers import (
    NoOrgLlmKey,
    decode_stored_key,
    resolve_agent_llm,
    select_provider_key,
)
from agents_runtime.crypto.secret_box import encrypt_secret
from agents_runtime.repository.provider_keys import ProviderKeyRow


def row(provider: str, key: str = "sk-x", base_url: str | None = None) -> ProviderKeyRow:
    return ProviderKeyRow(provider=provider, api_key=key, base_url=base_url)


class TestSelection:
    def test_the_agents_own_provider_wins(self) -> None:
        choice = select_provider_key(
            (row("openrouter", "or-key"), row("anthropic", "ant-key")),
            agent_provider="anthropic",
        )
        assert choice is not None
        assert (choice.provider, choice.api_key) == ("anthropic", "ant-key")

    def test_without_a_direct_key_the_orgs_openrouter_answers(self) -> None:
        choice = select_provider_key(
            (row("openrouter", "or-key"),), agent_provider="openai"
        )
        assert choice is not None
        assert choice.provider == "openrouter"

    def test_a_key_of_an_unrelated_provider_never_answers(self) -> None:
        assert (
            select_provider_key((row("gemini", "g-key"),), agent_provider="openai")
            is None
        )

    def test_no_rows_means_no_choice(self) -> None:
        assert select_provider_key((), agent_provider="openai") is None


class TestDecode:
    def test_legacy_plaintext_passes_through(self) -> None:
        # provider-key-codec do app: legado é plaintext cru, não base64.
        assert decode_stored_key("sk-plaintext", base_secret=None) == "sk-plaintext"

    def test_a_v2_value_decrypts_with_the_base_secret(self) -> None:
        key = "vector-fixture-key-0123456789abcdef"
        stored = encrypt_secret("sk-cifrada", base_secret=key)
        assert decode_stored_key(stored, base_secret=key) == "sk-cifrada"

    def test_an_encrypted_value_without_the_key_fails_loud(self) -> None:
        key = "vector-fixture-key-0123456789abcdef"
        stored = encrypt_secret("sk-cifrada", base_secret=key)
        with pytest.raises(NoOrgLlmKey):
            decode_stored_key(stored, base_secret=None)


class TestResolution:
    def test_an_anthropic_key_builds_the_native_adapter(self) -> None:
        port = resolve_agent_llm(
            (row("anthropic", "ant-key"),), agent_provider="anthropic", base_secret=None
        )
        assert isinstance(port, AnthropicLlm)

    def test_an_openai_key_builds_the_compatible_adapter(self) -> None:
        port = resolve_agent_llm(
            (row("openai", "oa-key"),), agent_provider="openai", base_secret=None
        )
        assert isinstance(port, OpenAICompatibleLlm)

    def test_an_org_openrouter_key_builds_the_router(self) -> None:
        port = resolve_agent_llm(
            (row("openrouter", "or-key"),), agent_provider="openai", base_secret=None
        )
        assert isinstance(port, OpenRouterLlm)

    def test_byo_only_without_keys_dies_loud(self) -> None:
        with pytest.raises(NoOrgLlmKey):
            resolve_agent_llm((), agent_provider="openai", base_secret=None)

    def test_the_platform_step_stays_off_by_default(self) -> None:
        # Mesmo com a porta da plataforma NA MÃO, o degrau 3 não liga sozinho
        # (AGENTS_PLATFORM_LLM_ENABLED ausente = BYO-only).
        sentinel = object()
        with pytest.raises(NoOrgLlmKey):
            resolve_agent_llm(
                (), agent_provider="openai", base_secret=None, platform=sentinel
            )

    def test_the_platform_step_answers_when_explicitly_enabled(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("AGENTS_PLATFORM_LLM_ENABLED", "true")
        sentinel = object()
        port = resolve_agent_llm(
            (), agent_provider="openai", base_secret=None, platform=sentinel
        )
        assert port is sentinel
