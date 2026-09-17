"""Explicit queries do no empty work; the compiler owns recovered knowledge."""

from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from agents_runtime.agent_core import responder
from agents_runtime.clock import SystemClock
from agents_runtime.queueing.jobs import InboundJob
from agents_runtime.server import _serialize
from agents_runtime.tools.base import ToolContext, ToolResult
from tests.unit.test_prompt_compiler_blocks import full_compile


@pytest.mark.parametrize(
    ("query", "tools"),
    [("", ("search_knowledge",)), (" \n ", ("search_knowledge",)), ("frete", ())],
)
async def test_empty_or_disabled_query_does_not_run_a_tool(monkeypatch, query, tools):
    run = AsyncMock()
    monkeypatch.setattr(responder, "run_tool", run)

    assert await responder._knowledge(
        None, None, tools, query=query, embedder=None, clock=SystemClock(), limit=5,
    ) == ()
    run.assert_not_awaited()


@pytest.mark.parametrize("success", [True, False])
async def test_explicit_query_preserves_scope_and_returns_only_successful_chunks(
    monkeypatch, success,
):
    job = InboundJob(UUID(int=1), 1, 1, UUID(int=2))
    run = AsyncMock(return_value=ToolResult(
        tool="search_knowledge", success=success,
        output={"chunks": [{"content": "Frete em 3 dias"}]},
    ))
    monkeypatch.setattr(responder, "run_tool", run)
    clock = SystemClock()

    chunks = await responder._knowledge(
        None, job, ("search_knowledge",), query="frete do carrinho",
        embedder=None, clock=clock, limit=2,
    )

    assert chunks == (("Frete em 3 dias",) if success else ())
    run.assert_awaited_once()
    assert run.await_args.args[2:] == (
        ToolContext(organization_id=job.organization_id, conversation_id=job.conversation_id),
        {"query": "frete do carrinho"},
    )
    assert run.await_args.kwargs == {"clock": clock}


def test_compiler_renders_knowledge_once_without_fabricated_source_ids():
    compiled = full_compile(knowledge=("Frete em 3 dias", "Troca em 7 dias"))

    assert [block.kind for block in compiled.blocks] == [
        "AGENT", "MISSION", "STATE", "CHANNEL", "CONVERSATION", "KNOWLEDGE",
    ]
    block = compiled.blocks[-1]
    assert block.text == "# CONHECIMENTO\n- Frete em 3 dias\n- Troca em 7 dias"
    assert compiled.text.count("Frete em 3 dias") == 1
    assert block.ghost is False
    assert block.source_ids == {}
    assert _serialize(compiled)["blocks"][-1] == {
        "kind": "KNOWLEDGE", "text": block.text, "ghost": False, "source_ids": {},
    }


@pytest.mark.parametrize("mode", ["turn", "preview"])
def test_no_chunks_produces_no_knowledge_block(mode):
    compiled = full_compile(mode=mode, knowledge=())

    assert all(block.kind != "KNOWLEDGE" for block in compiled.blocks)
    assert "# CONHECIMENTO" not in compiled.text
