"""Real producers select one attempt while every model call remains metered."""

from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from agents_runtime.agent_core import responder, toucher
from agents_runtime.agent_core.guards import GuardState
from agents_runtime.agent_core.llm import ChatResult, ToolCall, Usage
from agents_runtime.agent_core.mission_resolver import MissionVersion
from agents_runtime.agent_core.think_gate import PendingMessage
from agents_runtime.judges.pre_send import FAIL, PASS, Judgement, RubricVerdict
from agents_runtime.queueing.jobs import InboundJob, MissionTouchJob
from agents_runtime.repository.agent import (
    ActiveVersion,
    AgentConfig,
    ConversationState,
    TenantPolicy,
    TenantSettings,
)
from tests.support.clock import FrozenClock


@pytest.fixture(params=[responder, toucher], ids=["inbound", "touch"])
def producer_env(request, monkeypatch):
    module = request.param
    org, conversation, contact, agent = (uuid4() for _ in range(4))
    clock = FrozenClock(datetime(2026, 8, 3, 12, tzinfo=UTC))

    @asynccontextmanager
    async def transaction():
        yield

    connection = SimpleNamespace(transaction=transaction, execute=AsyncMock())

    @asynccontextmanager
    async def connected():
        yield connection

    monkeypatch.setattr(module.psycopg.AsyncConnection, "connect",
                        AsyncMock(side_effect=lambda *_, **__: connected()))
    for name in ("scope_to_organization", "set_statement_timeout", "assert_rls_enforced"):
        monkeypatch.setattr(module, name, AsyncMock())
    monkeypatch.setattr(responder, "scope_to_organization", AsyncMock())
    version = ActiveVersion(uuid4(), AgentConfig("test/model", "PRIVATE SYSTEM"), agent_id=agent)
    mission = MissionVersion(str(uuid4()), "whatsapp.received", None, "PRIVATE MISSION",
                             None, None, (), (), (), 5, "stay", False, {}, None)
    reads = {
        "load_tenant_policy": TenantSettings(TenantPolicy("pt-BR", True)),
        "load_active_version": version,
        "load_conversation_view": ConversationState("open", "whatsapp", None, contact,
                                                     "PRIVATE CONTACT", 0, clock.now()),
        "load_pending_messages": (PendingMessage("contact", "question"),),
        "load_recent_transcript": (PendingMessage("agent", "previous reply"),),
        "load_legacy_guard_state": GuardState(),
    }
    for name, value in reads.items():
        monkeypatch.setattr(module.agent_repo, name, AsyncMock(return_value=value))
    for repo, name, value in (
        (module.missions_repo, "load_active_mission", mission),
        (module.moments_repo, "load_active_moments", ()),
        (module.orders_repo, "load_purchase_history", None),
        (module.custom_tools_repo, "load_enabled_custom_tools", ()),
        (responder.incentives_repo, "valid_grants_for_contact", ()),
        (responder.incentives_repo, "recent_ledger_lines", ()),
        (module.engine_repo, "emit_ai_run_step", None),
        (module.scores_repo, "record_pre_send_score", None),
        (module.alerts_repo, "open_alert", None),
    ):
        monkeypatch.setattr(repo, name, AsyncMock(return_value=value))
    metered = []

    async def record(_conn, **values):
        metered.append(values)

    monkeypatch.setattr(responder.llm_repo, "record_llm_call", record)
    job = (InboundJob(conversation, 1, 1, org) if module is responder else
           MissionTouchJob(org, contact, conversation, uuid4(), "cart.abandoned"))
    return SimpleNamespace(module=module, job=job, clock=clock, version=version,
                           metered=metered, monkeypatch=monkeypatch)


@pytest.mark.parametrize("selected", [0, 1, 2])
async def test_selected_attempt_includes_only_its_calls_and_tools(producer_env, selected):
    env = producer_env

    class Model:
        calls = 0

        async def chat(self, request):
            attempt, round_number = divmod(self.calls, 2)
            self.calls += 1
            env.clock.advance(timedelta(milliseconds=10 + attempt))
            return ChatResult(
                text=f"answer {attempt}", model=f"billed-{attempt}", provider="test",
                usage=Usage(10 + attempt, 2, 0),
                tool_calls=(() if round_number else
                            (ToolCall(f"call-{attempt}", "unknown", {"attempt": attempt}),)),
            )

    async def judge(draft, context):
        attempt = int(draft[-1])
        return Judgement(FAIL, 0.9 if attempt == selected else 0.1,
                         (RubricVerdict("quality", FAIL, 0.5, ("refine",)),))

    env.monkeypatch.setattr(env.module, "PreSendJudge", lambda *_: judge)
    factory = env.module.build_responder if env.module is responder else env.module.build_toucher
    draft = await factory("unused", llm=Model(), clock=env.clock,
                          turn_llm_call_limit=20)(env.job)

    assert draft.content == {"text": f"answer {selected}",
                             "humanize": {"split": True, "rhythm": True}}
    trace = draft.trace
    assert trace.agent_id == env.version.agent_id
    assert trace.selected_attempt == selected
    assert trace.provider == "test" and trace.model == f"billed-{selected}"
    assert trace.tokens == (24, 26, 28)[selected]
    assert trace.latency_ms == (20, 22, 24)[selected]
    assert trace.output_text == f"answer {selected}"
    assert trace.input_text == ("assistant: previous reply\nuser: question"
                                if env.module is responder else "assistant: previous reply")
    assert len(trace.tool_calls) == 1
    assert trace.tool_calls[0]["arguments"] == {"attempt": selected}
    assert trace.tool_calls[0]["result"] == {"error": "tool desconhecida: unknown"}
    assert len(env.metered) == 6
    assert [c["model"] for c in env.metered] == (
        ["billed-0"] * 2 + ["billed-1"] * 2 + ["billed-2"] * 2
    )


@pytest.mark.parametrize("blocked", [True, False])
async def test_veto_or_blocked_topic_exposes_neither_content_nor_trace(producer_env, blocked):
    env = producer_env

    class Model:
        async def chat(self, request):
            return ChatResult("blocked draft", Usage(10, 2, 0), "test/model")

    async def judge(*_):
        return Judgement(PASS if blocked else "critical", 1,
                         (RubricVerdict("quality", PASS, 1, ()),))

    env.monkeypatch.setattr(env.module, "PreSendJudge", lambda *_: judge)
    if blocked:
        env.monkeypatch.setattr(env.module, "resolve_blocked_topic", lambda *_: "topic")
        env.monkeypatch.setattr(env.module, "transfer_to_human", AsyncMock(return_value=True))
    factory = env.module.build_responder if env.module is responder else env.module.build_toucher
    draft = await factory("unused", llm=Model(), clock=env.clock)(env.job)
    assert draft.content is None and draft.trace is None


@pytest.mark.parametrize("producer_env", [responder], indirect=True)
@pytest.mark.parametrize("kind", ["handoff", "image"])
async def test_deterministic_replies_have_trace_without_llm_fields(producer_env, kind):
    from dataclasses import replace

    env = producer_env
    if kind == "handoff":
        version = replace(env.version, settings={"safety": {
            "handoff_keywords": ["question"], "handoff_confirmation_message": "Human confirmation",
        }})
        env.monkeypatch.setattr(responder.agent_repo, "load_active_version",
                                AsyncMock(return_value=version))
        env.monkeypatch.setattr(responder, "transfer_to_human", AsyncMock(return_value=True))
    else:
        env.monkeypatch.setattr(responder.agent_repo, "load_pending_messages",
                                AsyncMock(return_value=(PendingMessage(
                                    "contact", "[Cliente enviou uma imagem]", "image"),)))
    model = SimpleNamespace(chat=AsyncMock(side_effect=AssertionError("LLM must not run")))
    draft = await responder.build_responder("unused", llm=model, clock=env.clock)(env.job)
    assert draft.content["text"]
    assert draft.trace.output_text == draft.content["text"]
    assert draft.trace.agent_id == env.version.agent_id
    assert draft.trace.selected_attempt is None
    assert (draft.trace.provider, draft.trace.model, draft.trace.tokens,
            draft.trace.latency_ms, draft.trace.tool_calls) == (None, None, None, None, ())
    assert "PRIVATE" not in draft.trace.input_text


@pytest.mark.parametrize("failure", [None, "http", "callback", "capture"])
async def test_custom_auth_is_invocation_local_and_cleared(producer_env, failure):
    import httpx

    from agents_runtime.agent_core.trace import AttemptTraceCapture
    from agents_runtime.tools.custom_http import CustomHttpTool, CustomToolRow
    from tests.support.llm import ScriptedLlm

    env = producer_env
    secret = "actual-custom-credential"
    row = CustomToolRow("lookup", "Lookup", "Read", "When asked", "https://localhost/lookup",
                        "GET", "Authorization", secret, (), 1000)
    unused = CustomToolRow("unused", "Unused", "Read", "Never", "https://localhost/unused",
                           "GET", "Authorization", "unused-secret", (), 1000)
    env.monkeypatch.setattr(env.module.custom_tools_repo, "load_enabled_custom_tools",
                            AsyncMock(return_value=(row, unused)))
    buffers, requested = [], []

    async def resolve(_):
        return ["93.184.216.34"]

    def response(request):
        requested.append(request.headers["authorization"])
        return httpx.Response(500 if failure == "http" else 200, json={"answer": "safe"})

    def tool_factory(row, *, base_secret, on_known_secrets):
        assert row.name == "lookup"
        buffers.append(on_known_secrets.__self__)

        def known(values):
            on_known_secrets(values)
            if failure == "callback":
                raise RuntimeError("callback failed")

        return CustomHttpTool(row, base_secret=base_secret, on_known_secrets=known,
                              transport=httpx.MockTransport(response), resolver=resolve)

    env.monkeypatch.setattr(env.module, "CustomHttpTool", tool_factory)
    from agents_runtime.tools import base
    env.monkeypatch.setattr(base, "scope_to_organization", AsyncMock())
    operational = []

    async def record(_conn, **values):
        operational.append(values)

    env.monkeypatch.setattr(base.tool_calls_repo, "record_tool_call", record)
    real_capture = AttemptTraceCapture.record_tool

    def capture(self, attempt, payload, *, known_secrets=()):
        assert tuple(known_secrets) == (secret,)
        if failure == "capture":
            raise RuntimeError("capture failed")
        real_capture(self, attempt, payload, known_secrets=known_secrets)

    env.monkeypatch.setattr(AttemptTraceCapture, "record_tool", capture)
    model = ScriptedLlm(tool_rounds=[(ToolCall("call", "lookup", {}),)])
    factory = env.module.build_responder if env.module is responder else env.module.build_toucher
    produce = factory("unused", llm=model, clock=env.clock)
    if failure == "capture":
        with pytest.raises(RuntimeError, match="capture failed"):
            await produce(env.job)
    else:
        if failure is None:
            import asyncio
            second = factory("unused", llm=ScriptedLlm(
                tool_rounds=[(ToolCall("second", "lookup", {}),)]), clock=env.clock)
            drafts = await asyncio.gather(produce(env.job), second(env.job))
        else:
            drafts = [await produce(env.job)]
        assert all(secret not in repr(draft) for draft in drafts)
        assert all(len(draft.trace.tool_calls) == 1 for draft in drafts)
    count = 2 if failure is None else 1
    assert buffers == [[] for _ in range(count)]
    assert len({id(buffer) for buffer in buffers}) == count
    assert requested == ([] if failure == "callback" else [secret] * count)
    assert secret not in repr(operational)
    assert secret not in repr(env.metered)


async def test_discovered_credential_is_redacted_from_later_tool_call(producer_env):
    import httpx

    from agents_runtime.tools import base
    from agents_runtime.tools.custom_http import CustomHttpTool, CustomToolRow
    from tests.support.llm import ScriptedLlm

    env = producer_env
    secret = "credential-A"
    rows = (
        CustomToolRow("a", "A", "Read", "First", "https://localhost/a", "GET",
                      "Authorization", secret, (), 1000),
        CustomToolRow("b", "B", "Read", "Next", "https://localhost/b", "GET",
                      "Authorization", None, ({"name": "query", "type": "string"},), 1000),
    )
    env.monkeypatch.setattr(env.module.custom_tools_repo, "load_enabled_custom_tools",
                            AsyncMock(return_value=rows))
    received = []

    async def resolve(_):
        return ["93.184.216.34"]

    def response(request):
        if request.url.path == "/a":
            assert request.headers["authorization"] == secret
            return httpx.Response(200, json={"value": secret})
        received.append(request.url.params["query"])
        return httpx.Response(200, json={"answer": "safe"})

    def tool_factory(row, *, base_secret, on_known_secrets):
        return CustomHttpTool(row, base_secret=base_secret, on_known_secrets=on_known_secrets,
                              transport=httpx.MockTransport(response), resolver=resolve)

    env.monkeypatch.setattr(env.module, "CustomHttpTool", tool_factory)
    env.monkeypatch.setattr(base, "scope_to_organization", AsyncMock())
    env.monkeypatch.setattr(base.tool_calls_repo, "record_tool_call", AsyncMock())
    later_arguments = {"query": secret}
    model = ScriptedLlm(tool_rounds=[(ToolCall("first", "a", {}),),
                                    (ToolCall("later", "b", later_arguments),)])
    factory = env.module.build_responder if env.module is responder else env.module.build_toucher
    draft = await factory("unused", llm=model, clock=env.clock)(env.job)

    assert received == [secret]
    assert later_arguments == {"query": secret}
    assert any(secret in message.content for request in model.asked
               for message in request.messages if message.role == "tool")
    assert len(draft.trace.tool_calls) == 2
    assert draft.trace.tool_calls[0]["result"]["body"]["value"] == "[REDACTED]"
    assert draft.trace.tool_calls[1]["arguments"]["query"] == "[REDACTED]"
    assert secret not in repr(draft.trace)


def test_per_call_credentials_combine_with_defaults_without_retention():
    from agents_runtime.agent_core.trace import AttemptTraceCapture

    capture = AttemptTraceCapture(known_secrets=("default-secret",))
    payload = {"echo": "executed-secret", "other": "default-secret", "token": "key-only"}
    capture.record_tool(0, payload, known_secrets=("executed-secret",))
    trace = capture.build(agent_id=uuid4(), input_text="", output_text="ok", selected_attempt=0)
    assert trace.tool_calls == ({"echo": "[REDACTED]", "other": "[REDACTED]",
                                 "token": "[REDACTED]"},)
    assert payload["echo"] == "executed-secret"
    assert "executed-secret" not in repr(vars(capture))
