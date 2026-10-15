"""Simulação de turno (alteração 2026-10-15-12): as regras puras do sandbox
e o caminho completo com banco e provedores de mentira — o que importa é que
a escrita NUNCA executa e que tudo é custo `playground`."""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from agents_runtime.agent_core import simulate
from agents_runtime.agent_core.simulate import (
    ContactProfile,
    apply_draft,
    as_chat,
    profile_state,
    simulated_tool_result,
)
from agents_runtime.repository.agent import ActiveVersion, AgentConfig


def _version(**over) -> ActiveVersion:
    base = dict(
        id=uuid4(),
        config=AgentConfig(
            model="openai/gpt-4o-mini", base_prompt="Atenda.", enabled_tools=("timeline",)
        ),
        agent_id=uuid4(),
        name="Duda",
        persona={"tone": "friendly", "language": "pt-BR"},
        settings={"tools": {"enabled": ["timeline"]}},
    )
    base.update(over)
    return ActiveVersion(**base)


class TestApplyDraft:
    def test_no_draft_keeps_the_version(self) -> None:
        version = _version()
        assert apply_draft(version, None) is version

    def test_draft_fields_win_and_the_rest_stays(self) -> None:
        version = _version()
        drafted = apply_draft(version, {
            "name": "Leo",
            "model": "anthropic/claude-x",
            "system_prompt": "Seja breve.",
            "persona": {"tone": "luxury"},
            "settings": {"tools": {"enabled": ["product_lookup"]}},
        })
        assert drafted.name == "Leo"
        assert drafted.config.model == "anthropic/claude-x"
        assert drafted.config.base_prompt == "Seja breve."
        assert drafted.persona == {"tone": "luxury", "language": "pt-BR"}
        assert drafted.config.enabled_tools == ("product_lookup",)
        assert drafted.agent_id == version.agent_id


class TestProfileState:
    def test_each_profile_reaches_the_state_block(self) -> None:
        assert ("cliente", "primeiro contato") in profile_state(ContactProfile()).contact_facts
        recurring = profile_state(ContactProfile(kind="recorrente", orders=5))
        assert recurring.purchase_lines == ("5 pedido(s) anteriores na loja",)
        cart = profile_state(ContactProfile(kind="carrinho", cart_value=199.9))
        assert ("carrinho aberto", "R$ 199,90") in cart.contact_facts

    def test_parse_is_forgiving(self) -> None:
        assert ContactProfile.parse({"kind": "alien"}).kind == "novo"
        assert ContactProfile.parse({"kind": "carrinho", "cart_value": "abc"}).cart_value is None
        assert ContactProfile.parse(None) == ContactProfile()


class TestChatAndWrites:
    def test_history_becomes_chat_with_the_message_last(self) -> None:
        history = [{"author": "contact", "text": "oi"}, {"author": "agent", "text": "olá"}]
        chat = as_chat(history, "tem frete?")
        assert [(m.role, m.content) for m in chat] == [
            ("user", "oi"), ("assistant", "olá"), ("user", "tem frete?"),
        ]

    def test_a_write_tool_only_says_what_it_would_do(self) -> None:
        out = simulated_tool_result("save_customer", {"email": "a@b.c"})
        assert out["simulated"] is True and out["would_call"] == "save_customer"


class _Txn:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class TestSimulateTurn:
    @pytest.fixture
    def wired(self, monkeypatch):
        version = _version(settings={"tools": {"enabled": ["save_customer"]}},
                           config=AgentConfig(model="m", base_prompt="Atenda.",
                                              enabled_tools=("save_customer",)))
        agent_id = version.agent_id
        repo = simulate.agent_repo
        monkeypatch.setattr(simulate, "scope_to_organization", AsyncMock())
        monkeypatch.setattr(repo, "load_tenant_policy", AsyncMock(
            return_value=SimpleNamespace(never_say_ai=True, primary_language="pt-BR")))
        monkeypatch.setattr(repo, "load_version_for_preview", AsyncMock(return_value=version))
        monkeypatch.setattr(
            simulate.missions_repo, "load_active_mission", AsyncMock(return_value=None)
        )
        monkeypatch.setattr(
            simulate.keys_repo, "load_org_provider_keys", AsyncMock(return_value=())
        )
        monkeypatch.setattr(simulate.knowledge_repo, "has_knowledge", AsyncMock(return_value=False))
        record = AsyncMock()
        monkeypatch.setattr(simulate.llm_repo, "record_llm_call", record)
        monkeypatch.setattr(simulate, "agent_block", lambda v, s: SimpleNamespace(language="pt-BR"))
        monkeypatch.setattr(simulate, "compile_prompt", lambda **kw: SimpleNamespace(
            text="SYSTEM", blocks=(SimpleNamespace(kind="AGENT"),)))
        save_customer = AsyncMock()
        monkeypatch.setattr(simulate, "builtin_tools_for", lambda enabled, has_store: (
            ("save_customer", save_customer, SimpleNamespace(name="save_customer")),))

        class _Scoped:
            def __init__(self, port, owns):
                self.port = port

            async def __aenter__(self):
                return self.port

            async def __aexit__(self, *exc):
                return False

        monkeypatch.setattr(simulate, "resolve_agent_llm", lambda *a, **k: SimpleNamespace(
            port=object(), built_here=False))
        monkeypatch.setattr(simulate, "scoped_agent_llm", _Scoped)

        async def fake_generate(chat, *, model, messages, tools, execute):
            await execute(SimpleNamespace(name="save_customer", arguments={"email": "a@b.c"}))
            return "Anotado!"

        monkeypatch.setattr(simulate, "generate_with_tools", fake_generate)
        monkeypatch.setattr(simulate, "load_rubrics", lambda directory: {})
        monkeypatch.setattr(simulate, "with_merchant_judges", lambda rubrics, settings: rubrics)
        monkeypatch.setattr(simulate, "PreSendJudge", lambda llm, rubrics: object())

        async def fake_guarded(generate, judge, *, context):
            draft = await generate(0, ())
            return SimpleNamespace(draft=draft, blocked_by=None, last_draft=draft, judgements=())

        monkeypatch.setattr(simulate, "guarded_reply", fake_guarded)
        return SimpleNamespace(agent_id=agent_id, save_customer=save_customer)

    async def test_writes_are_simulated_and_the_reply_comes_back(self, wired) -> None:
        conn = SimpleNamespace(transaction=lambda: _Txn())
        trace = await simulate.simulate_turn(
            conn, organization_id=uuid4(), agent_id=wired.agent_id, message="meu email é a@b.c",
            platform_llm=object(), base_secret=None,
        )
        assert trace.reply == "Anotado!" and not trace.blocked
        wired.save_customer.assert_not_awaited()
        assert trace.tools[0]["simulated"] is True
        assert trace.tools[0]["result"]["would_call"] == "save_customer"
        assert trace.prompt_blocks == ["AGENT"]

    async def test_an_unknown_agent_is_unavailable(self, wired, monkeypatch) -> None:
        monkeypatch.setattr(
            simulate.agent_repo, "load_version_for_preview", AsyncMock(return_value=None)
        )
        conn = SimpleNamespace(transaction=lambda: _Txn())
        with pytest.raises(simulate.SimulationUnavailable):
            await simulate.simulate_turn(
                conn, organization_id=uuid4(), agent_id=uuid4(), message="oi",
                platform_llm=object(), base_secret=None,
            )
