"""The generation loop shared by reactive and proactive turns."""

from collections.abc import Awaitable, Callable

from agents_runtime.agent_core.llm import ChatRequest, LlmPort, Message, ToolCall, ToolSpec

# Per generation attempt; the final request forces a text ending without tools.
MAX_TOOL_ROUNDS = 3


async def generate_with_tools(
    chat: LlmPort,
    *,
    model: str,
    messages: tuple[Message, ...],
    tools: tuple[ToolSpec, ...],
    execute: Callable[[ToolCall], Awaitable[str]],
    think: bool = False,
) -> str:
    history = list(messages)
    for _ in range(MAX_TOOL_ROUNDS):
        answer = await chat.chat(
            ChatRequest(model=model, messages=tuple(history), think=think, tools=tools)
        )
        if not answer.tool_calls:
            return answer.text
        history.append(
            Message(role="assistant", content=answer.text, tool_calls=answer.tool_calls)
        )
        for call in answer.tool_calls:
            history.append(
                Message(role="tool", content=await execute(call), tool_call_id=call.id)
            )
    answer = await chat.chat(ChatRequest(model=model, messages=tuple(history), think=think))
    return answer.text
