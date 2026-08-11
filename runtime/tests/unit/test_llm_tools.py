"""9.3b — a porta LLM aprende tools, nos três adapters, sem trair o formato.

O tool-loop do responder só funciona se a MESMA gramática (ToolSpec pedido,
ToolCall devolvido, resultado como mensagem role="tool") atravessar OpenRouter
(OpenAI-compatível), chave direta OpenAI-compatível e Anthropic nativo. Cada
adapter traduz para o dialeto do provedor; quem chama nunca sabe qual é.

MockTransport: nada aqui abre socket. O lado do provedor de verdade é a suíte
`contract`.
"""

import json

import httpx

from agents_runtime.agent_core.direct_providers import AnthropicLlm, OpenAICompatibleLlm
from agents_runtime.agent_core.llm import ChatRequest, Message, ToolCall, ToolSpec
from agents_runtime.agent_core.openrouter import OpenRouterLlm

COUPON_TOOL = ToolSpec(
    name="create_coupon",
    description="Pede um benefício ao offer engine — quem decide é ele.",
    parameters={
        "type": "object",
        "properties": {
            "object_kind": {"type": "string"},
            "object_ref": {"type": "string"},
        },
        "required": ["object_kind", "object_ref"],
    },
)

ASKING = ChatRequest(
    model="claude-sonnet-5",
    messages=(
        Message(role="system", content="Você é o atendente."),
        Message(role="user", content="tem desconto?"),
    ),
    tools=(COUPON_TOOL,),
)

A_CALL = ToolCall(
    id="call_1",
    name="create_coupon",
    arguments={"object_kind": "cart", "object_ref": "cart-1"},
)

#: A volta completa: o modelo pediu a tool, a tool respondeu, o modelo conclui.
ROUND_TRIP = ChatRequest(
    model="claude-sonnet-5",
    messages=(
        Message(role="system", content="Você é o atendente."),
        Message(role="user", content="tem desconto?"),
        Message(role="assistant", content="", tool_calls=(A_CALL,)),
        Message(
            role="tool",
            content='{"decision": "reused", "coupon_code": "WD-ABC123"}',
            tool_call_id="call_1",
        ),
    ),
    tools=(COUPON_TOOL,),
)

OPENAI_TOOL_REPLY = {
    "model": "openai/gpt-4o",
    "choices": [
        {
            "message": {
                "content": None,
                "tool_calls": [
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {
                            "name": "create_coupon",
                            "arguments": '{"object_kind": "cart", "object_ref": "cart-1"}',
                        },
                    }
                ],
            }
        }
    ],
    "usage": {"prompt_tokens": 10, "completion_tokens": 5},
}


def capturing(seen: dict, payload: dict):
    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=payload)

    return handler


class TestOpenRouter:
    async def test_tools_go_out_in_the_openai_shape(self) -> None:
        seen: dict = {}
        llm = OpenRouterLlm(
            "sk-x", transport=httpx.MockTransport(capturing(seen, OPENAI_TOOL_REPLY))
        )

        result = await llm.chat(ASKING)

        assert seen["body"]["tools"] == [
            {
                "type": "function",
                "function": {
                    "name": "create_coupon",
                    "description": COUPON_TOOL.description,
                    "parameters": dict(COUPON_TOOL.parameters),
                },
            }
        ]
        assert result.tool_calls == (A_CALL,)
        assert result.text == ""

    async def test_the_round_trip_serializes_back(self) -> None:
        seen: dict = {}
        payload = {
            "model": "openai/gpt-4o",
            "choices": [{"message": {"content": "Seu cupom é WD-ABC123!"}}],
            "usage": {},
        }
        llm = OpenRouterLlm("sk-x", transport=httpx.MockTransport(capturing(seen, payload)))

        result = await llm.chat(ROUND_TRIP)

        assistant = seen["body"]["messages"][2]
        assert assistant["tool_calls"] == [
            {
                "id": "call_1",
                "type": "function",
                "function": {
                    "name": "create_coupon",
                    "arguments": '{"object_kind": "cart", "object_ref": "cart-1"}',
                },
            }
        ]
        tool = seen["body"]["messages"][3]
        assert tool["role"] == "tool"
        assert tool["tool_call_id"] == "call_1"
        assert result.text == "Seu cupom é WD-ABC123!"
        assert result.tool_calls == ()

    async def test_without_tools_the_body_stays_clean(self) -> None:
        seen: dict = {}
        payload = {
            "model": "m",
            "choices": [{"message": {"content": "oi"}}],
            "usage": {},
        }
        llm = OpenRouterLlm("sk-x", transport=httpx.MockTransport(capturing(seen, payload)))

        await llm.chat(ChatRequest(model="m", messages=(Message(role="user", content="oi"),)))

        assert "tools" not in seen["body"]


class TestOpenAICompatible:
    async def test_a_tool_call_only_reply_is_usable(self) -> None:
        seen: dict = {}
        llm = OpenAICompatibleLlm(
            "sk-x", transport=httpx.MockTransport(capturing(seen, OPENAI_TOOL_REPLY))
        )

        result = await llm.chat(ASKING)

        assert seen["body"]["tools"][0]["function"]["name"] == "create_coupon"
        assert result.tool_calls == (A_CALL,)


class TestAnthropic:
    async def test_tools_become_input_schema_and_tool_use_comes_back(self) -> None:
        seen: dict = {}
        payload = {
            "model": "claude-sonnet-5",
            "content": [
                {
                    "type": "tool_use",
                    "id": "toolu_1",
                    "name": "create_coupon",
                    "input": {"object_kind": "cart", "object_ref": "cart-1"},
                }
            ],
            "usage": {"input_tokens": 10, "output_tokens": 5},
        }
        llm = AnthropicLlm("sk-x", transport=httpx.MockTransport(capturing(seen, payload)))

        result = await llm.chat(ASKING)

        assert seen["body"]["tools"] == [
            {
                "name": "create_coupon",
                "description": COUPON_TOOL.description,
                "input_schema": dict(COUPON_TOOL.parameters),
            }
        ]
        assert result.tool_calls == (
            ToolCall(
                id="toolu_1",
                name="create_coupon",
                arguments={"object_kind": "cart", "object_ref": "cart-1"},
            ),
        )

    async def test_the_round_trip_becomes_content_blocks(self) -> None:
        seen: dict = {}
        payload = {
            "model": "claude-sonnet-5",
            "content": [{"type": "text", "text": "Seu cupom é WD-ABC123!"}],
            "usage": {},
        }
        llm = AnthropicLlm("sk-x", transport=httpx.MockTransport(capturing(seen, payload)))

        result = await llm.chat(ROUND_TRIP)

        turns = seen["body"]["messages"]
        assert turns[1]["role"] == "assistant"
        assert turns[1]["content"] == [
            {
                "type": "tool_use",
                "id": "call_1",
                "name": "create_coupon",
                "input": {"object_kind": "cart", "object_ref": "cart-1"},
            }
        ]
        assert turns[2] == {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": "call_1",
                    "content": '{"decision": "reused", "coupon_code": "WD-ABC123"}',
                }
            ],
        }
        assert result.text == "Seu cupom é WD-ABC123!"
