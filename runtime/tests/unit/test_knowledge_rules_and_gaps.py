"""Regras no prompt, busca por agente e lacunas (alteração 2026-10-15-11).

- `compile_prompt(rules=...)` renderiza o bloco KNOWLEDGE_RULES antes do
  KNOWLEDGE, e só quando há regra.
- `normalize_question` é a chave barata de agrupamento.
- `record_gap` recusa desfecho fora do vocabulário.
- `_record_gap` nunca derruba o turno.
- `TransferToHuman` com motivo `no_knowledge` registra a lacuna com a pergunta.
- `SearchKnowledge` repassa o agente para a busca.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from agents_runtime.agent_core import responder
from agents_runtime.queueing.jobs import InboundJob
from agents_runtime.repository import knowledge as knowledge_repo
from agents_runtime.tools import builtin
from agents_runtime.tools.base import ToolContext
from agents_runtime.tools.knowledge import SearchKnowledge
from tests.unit.test_prompt_compiler_blocks import full_compile


class _Txn:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


def _conn():
    return SimpleNamespace(transaction=lambda: _Txn(), execute=AsyncMock())


class TestRulesBlock:
    def test_rules_come_before_knowledge_and_only_when_present(self) -> None:
        compiled = full_compile(knowledge=("Frete em 3 dias",), rules=("Nunca prometer prazo.",))
        kinds = [b.kind for b in compiled.blocks]
        assert kinds[-2:] == ["KNOWLEDGE_RULES", "KNOWLEDGE"]
        rules = next(b for b in compiled.blocks if b.kind == "KNOWLEDGE_RULES")
        assert rules.text == "# REGRAS DA LOJA (obrigatórias)\n- Nunca prometer prazo."

        without = full_compile()
        assert "KNOWLEDGE_RULES" not in [b.kind for b in without.blocks]


class TestGapKey:
    @pytest.mark.parametrize(
        ("raw", "key"),
        [("  Tem FRETE   grátis? ", "tem frete grátis"), ("Aceita pix!!", "aceita pix"), ("", "")],
    )
    def test_normalize(self, raw: str, key: str) -> None:
        assert knowledge_repo.normalize_question(raw) == key

    async def test_unknown_outcome_is_refused(self) -> None:
        with pytest.raises(ValueError):
            await knowledge_repo.record_gap(
                _conn(), organization_id=uuid4(), question="x", outcome="shrug",
                agent_id=None, conversation_id=None,
            )


class TestRecordGapNeverBreaksTheTurn:
    async def test_a_failing_write_is_swallowed(self, monkeypatch) -> None:
        monkeypatch.setattr(responder, "scope_to_organization", AsyncMock())
        monkeypatch.setattr(
            responder.knowledge_repo, "record_gap", AsyncMock(side_effect=RuntimeError("db"))
        )
        job = InboundJob(uuid4(), 1, 1, uuid4())
        await responder._record_gap(_conn(), job, "tem frete?", "blocked", uuid4())

    async def test_empty_question_writes_nothing(self, monkeypatch) -> None:
        record = AsyncMock()
        monkeypatch.setattr(responder.knowledge_repo, "record_gap", record)
        job = InboundJob(uuid4(), 1, 1, uuid4())
        await responder._record_gap(_conn(), job, " ", "blocked", None)
        record.assert_not_awaited()


class TestTransferWithoutKnowledgeIsAGap:
    async def test_it_records_the_question(self, monkeypatch) -> None:
        monkeypatch.setattr(builtin, "transfer_to_human", AsyncMock(return_value=True))
        monkeypatch.setattr(builtin, "scope_to_organization", AsyncMock())
        monkeypatch.setattr(builtin.crm_repo, "add_activity", AsyncMock())
        record = AsyncMock()
        monkeypatch.setattr(builtin.knowledge_repo, "record_gap", record)
        agent = uuid4()
        context = ToolContext(
            organization_id=uuid4(), conversation_id=uuid4(), agent_id=agent,
            last_question="Vocês têm loja em Curitiba?",
        )
        result = await builtin.TransferToHuman()(_conn(), context, {"reason": "no_knowledge"})
        assert result.success
        kwargs = record.await_args.kwargs
        assert kwargs["question"] == "Vocês têm loja em Curitiba?"
        assert kwargs["outcome"] == "transferred" and kwargs["agent_id"] == agent

    async def test_other_reasons_are_not_gaps(self, monkeypatch) -> None:
        monkeypatch.setattr(builtin, "transfer_to_human", AsyncMock(return_value=True))
        record = AsyncMock()
        monkeypatch.setattr(builtin.knowledge_repo, "record_gap", record)
        context = ToolContext(organization_id=uuid4(), conversation_id=uuid4(), last_question="x")
        await builtin.TransferToHuman()(_conn(), context, {"reason": "asked_human"})
        record.assert_not_awaited()


class TestSearchByAgent:
    async def test_the_tool_passes_its_agent_to_the_search(self, monkeypatch) -> None:
        agent = uuid4()
        search = AsyncMock(return_value=())
        monkeypatch.setattr(
            "agents_runtime.tools.knowledge.knowledge_repo.search_knowledge", search
        )
        monkeypatch.setattr("agents_runtime.tools.knowledge.scope_to_organization", AsyncMock())
        embedder = SimpleNamespace(embed=AsyncMock(return_value=SimpleNamespace(vectors=[[0.1]])))
        await SearchKnowledge(embedder, agent_id=agent)(
            _conn(),
            ToolContext(organization_id=uuid4(), conversation_id=uuid4()),
            {"query": "frete"},
        )
        assert search.await_args.kwargs["agent_id"] == agent
