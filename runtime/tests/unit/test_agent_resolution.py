"""Quem atende o turno (alteração 2026-10-15-09, plano IA M2 passo 14).

A regra pura: a conversa já atendida por um agente ativo fica com ele; senão
o agente ligado à entrada (número); senão o único ativo da org (modelo
antigo); vários ativos sem entrada é ambíguo — alerta e silêncio, nunca um
palpite; nenhum ativo é "none".
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from agents_runtime.repository.agent import (
    ActiveVersion,
    AgentConfig,
    AgentResolution,
    choose_agent,
)
from agents_runtime.tools import builtin
from agents_runtime.tools.base import ToolContext


def _version(name: str = "Vendas") -> ActiveVersion:
    return ActiveVersion(
        id=uuid4(),
        config=AgentConfig(model="openai/gpt-4o-mini", base_prompt="Atenda.", enabled_tools=()),
        agent_id=uuid4(),
        name=name,
    )


class TestChooseAgent:
    def test_the_conversation_agent_wins(self) -> None:
        mine, entry = _version("A"), _version("B")
        got = choose_agent(
            conversation_version=mine, entry_version=entry, active_versions=(mine, entry)
        )
        assert got == AgentResolution(mine, "conversation")

    def test_then_the_entry_of_the_number(self) -> None:
        entry, other = _version("B"), _version("C")
        got = choose_agent(
            conversation_version=None, entry_version=entry, active_versions=(entry, other)
        )
        assert got == AgentResolution(entry, "entry")

    def test_a_single_active_agent_is_the_old_model(self) -> None:
        only = _version()
        got = choose_agent(conversation_version=None, entry_version=None, active_versions=(only,))
        assert got == AgentResolution(only, "single_active")

    def test_several_actives_without_an_entry_is_ambiguous(self) -> None:
        got = choose_agent(
            conversation_version=None, entry_version=None,
            active_versions=(_version("A"), _version("B")),
        )
        assert got == AgentResolution(None, "ambiguous")

    def test_no_active_agent_is_none(self) -> None:
        got = choose_agent(conversation_version=None, entry_version=None, active_versions=())
        assert got == AgentResolution(None, "none")


class _Txn:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


def _conn():
    return SimpleNamespace(transaction=lambda: _Txn(), execute=AsyncMock())


@pytest.fixture
def agents(monkeypatch):
    me, sales, support = uuid4(), uuid4(), uuid4()
    rows = ((me, "Eu", None), (sales, "Vendas", "Vendas no WhatsApp"), (support, "Suporte", None))
    monkeypatch.setattr(builtin.agent_repo, "list_active_agents", AsyncMock(return_value=rows))
    assign = AsyncMock(return_value=True)
    monkeypatch.setattr(builtin.agent_repo, "assign_conversation_agent", assign)
    monkeypatch.setattr(builtin, "scope_to_organization", AsyncMock())
    monkeypatch.setattr(builtin.crm_repo, "add_activity", AsyncMock())
    return SimpleNamespace(me=me, sales=sales, support=support, assign=assign)


def _context(agent_id) -> ToolContext:
    return ToolContext(
        organization_id=uuid4(), conversation_id=uuid4(), contact_id=uuid4(), agent_id=agent_id,
    )


class TestTransferToAgent:
    async def test_it_hands_the_conversation_to_the_named_agent(self, agents) -> None:
        context = _context(agents.me)
        result = await builtin.TransferToAgent()(
            _conn(), context, {"agent": "vendas", "summary": "quer trocar o tamanho"}
        )
        assert result.success and result.output["transferred"] is True
        assert result.output["to"] == {"name": "Vendas", "role": "Vendas no WhatsApp"}
        agents.assign.assert_awaited_once()
        kwargs = agents.assign.await_args.kwargs
        assert kwargs["agent_id"] == agents.sales
        assert kwargs["conversation_id"] == context.conversation_id
        assert kwargs["reset_owner_mission"] is True

    async def test_an_unknown_name_lists_the_real_destinations(self, agents) -> None:
        result = await builtin.TransferToAgent()(
            _conn(), _context(agents.me), {"agent": "Juridico"}
        )
        assert not result.success
        assert result.output["reason"] == "unknown_agent"
        assert [a["name"] for a in result.output["available"]] == ["Vendas", "Suporte"]
        agents.assign.assert_not_awaited()

    async def test_transferring_to_itself_is_refused(self, agents) -> None:
        result = await builtin.TransferToAgent()(_conn(), _context(agents.me), {"agent": "Eu"})
        assert not result.success and result.output["reason"] == "same_agent"
        agents.assign.assert_not_awaited()

    def test_the_spec_enumerates_the_other_agents_only(self, agents) -> None:
        rows = ((agents.me, "Eu", None), (agents.sales, "Vendas", "Vendas no WhatsApp"))
        spec = builtin.transfer_to_agent_spec(rows, exclude=agents.me)
        assert spec.parameters["properties"]["agent"]["enum"] == ["Vendas"]
        assert "Vendas (Vendas no WhatsApp)" in spec.description
