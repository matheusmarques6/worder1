"""A cascata de chaves D4 — BYO-only (PENDENTE-1 resolvido pelo usuário).

Ordem: direta do provider do agente → OpenRouter da org → plataforma ATRÁS de
flag (desligada por default). Sem chave utilizável, o agente NÃO responde —
`NoOrgLlmKey` vira alerta `no_org_llm_key` no responder, nunca silêncio.
"""

import pytest

from agents_runtime.agent_core.direct_providers import (
    DEEPSEEK_BASE_URL,
    GEMINI_OPENAI_BASE_URL,
    GROQ_BASE_URL,
    OPENAI_BASE_URL,
    AnthropicLlm,
    OpenAICompatibleLlm,
)
from agents_runtime.agent_core.openrouter import OpenRouterLlm
from agents_runtime.agent_core.providers import (
    NoOrgLlmKey,
    ProviderChoice,
    client_for,
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


def _base_url(port: OpenAICompatibleLlm) -> str:
    # httpx normaliza com "/" no fim; comparamos sem ele.
    return str(port._client.base_url).rstrip("/")


class TestDefaultBaseUrls:
    """Item 36 — cada provider novo prova DUAS coisas: a classe certa e a
    URL montada certa (ruling F). Sem rede real: só inspeciona o base_url
    configurado no client, nunca faz `.chat()`."""

    def test_groq_gets_the_compatible_adapter_and_its_default_url(self) -> None:
        port = client_for(ProviderChoice("groq", "gsk-x", None))
        assert isinstance(port, OpenAICompatibleLlm)
        assert _base_url(port) == GROQ_BASE_URL

    def test_deepseek_gets_the_compatible_adapter_and_its_default_url(self) -> None:
        port = client_for(ProviderChoice("deepseek", "sk-x", None))
        assert isinstance(port, OpenAICompatibleLlm)
        assert _base_url(port) == DEEPSEEK_BASE_URL

    def test_gemini_gets_the_compatible_adapter_and_the_openai_compat_endpoint(
        self,
    ) -> None:
        # ruling C: sem adapter nativo — o mesmo OpenAICompatibleLlm, contra
        # o endpoint OpenAI-compatível do Google (verificado por POST real,
        # ver task-36-report.md), não o `:generateContent` que o TS usa.
        port = client_for(ProviderChoice("gemini", "AIza-x", None))
        assert isinstance(port, OpenAICompatibleLlm)
        assert _base_url(port) == GEMINI_OPENAI_BASE_URL

    def test_google_is_an_alias_of_gemini(self) -> None:
        # ruling D — o TS trata as duas strings no mesmo `case` (ai-providers.ts:426-427).
        port = client_for(ProviderChoice("google", "AIza-x", None))
        assert isinstance(port, OpenAICompatibleLlm)
        assert _base_url(port) == GEMINI_OPENAI_BASE_URL

    def test_a_stored_base_url_still_wins_over_the_provider_default(self) -> None:
        # Org que configurou proxy próprio não é atropelada pelo default (ruling B).
        port = client_for(ProviderChoice("groq", "gsk-x", "http://localhost:9999/v1"))
        assert _base_url(port) == "http://localhost:9999/v1"

    def test_an_unknown_provider_without_a_default_falls_back_to_openai(self) -> None:
        # Comportamento anterior ao item 36, inalterado: provider sem entrada
        # no mapa e sem base_url própria continua indo para a OpenAI.
        port = client_for(ProviderChoice("mistral", "sk-x", None))
        assert _base_url(port) == OPENAI_BASE_URL
