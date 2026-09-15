"""The shared loop correlates tool replies and forces text after its round limit."""

from unittest.mock import AsyncMock

import pytest

from agents_runtime.agent_core.llm import Message, ToolCall, ToolSpec
from agents_runtime.agent_core.tool_loop import MAX_TOOL_ROUNDS, generate_with_tools
from tests.support.llm import ScriptedLlm

STOCK = ToolSpec("stock", "consulta", {"type": "object"})
ASK_STOCK = ToolCall("call-1", "stock", {})


@pytest.mark.parametrize("think", [False, True])
async def test_tool_result_reaches_the_next_request_with_its_call_id(think):
    llm = ScriptedLlm(tool_rounds=[(ASK_STOCK,)], reply="Há duas unidades")
    execute = AsyncMock(return_value='{"stock":2}')
    messages = (Message(role="user", content="Tem estoque?"),)

    result = await generate_with_tools(
        llm, model="agent", messages=messages, tools=(STOCK,), execute=execute, think=think,
    )

    assert result == "Há duas unidades"
    execute.assert_awaited_once_with(ASK_STOCK)
    assert len(llm.asked) == 2
    assert llm.asked[-1].messages == (
        *messages,
        Message(role="assistant", content="", tool_calls=(ASK_STOCK,)),
        Message(role="tool", content='{"stock":2}', tool_call_id="call-1"),
    )
    assert all(request.think is think for request in llm.asked)


async def test_continuous_tool_requests_end_with_a_final_request_without_tools():
    llm = ScriptedLlm(tool_rounds=[(ASK_STOCK,)] * 8, reply="Há duas unidades")
    execute = AsyncMock(return_value='{"stock":2}')

    result = await generate_with_tools(
        llm, model="agent", messages=(), tools=(STOCK,), execute=execute,
    )

    assert result == "Há duas unidades"
    assert execute.await_count == MAX_TOOL_ROUNDS == 3
    assert len(llm.asked) == 4
    assert all(request.tools == (STOCK,) for request in llm.asked[:-1])
    assert llm.asked[-1].tools == ()
    assert len([m for m in llm.asked[-1].messages if m.role == "tool"]) == 3
    assert all(request.think is False for request in llm.asked)
