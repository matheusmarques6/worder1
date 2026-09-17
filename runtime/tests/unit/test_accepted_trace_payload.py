"""Accepted traces describe only the selected attempt, with bounded safe tools."""

import json
from copy import deepcopy
from dataclasses import FrozenInstanceError
from uuid import UUID

import pytest

from agents_runtime.agent_core import trace
from agents_runtime.agent_core.metering import CallRecord

AGENT = UUID("00000000-0000-0000-0000-000000000001")


def record(**overrides):
    return CallRecord(**{
        "purpose": "agent_reply", "provider": "real-provider", "model": "real-model",
        "input_tokens": 10, "output_tokens": 2, "cost_usd": 0.1, "latency_ms": 20,
        **overrides,
    })


def build(capture, selected_attempt=0):
    return capture.build(
        agent_id=AGENT, input_text="selected input", output_text="accepted output",
        selected_attempt=selected_attempt,
    )


def tools(payloads, *, known_secrets=()):
    capture = trace.AttemptTraceCapture(known_secrets=known_secrets)
    for payload in payloads:
        capture.record_tool(0, payload)
    return build(capture).tool_calls


def test_attempt_zero_is_selected_even_after_two_later_attempts():
    capture = trace.AttemptTraceCapture()
    for attempt in range(3):
        capture.record_call(attempt, record(input_tokens=10 + attempt))
        capture.record_tool(attempt, {"name": f"tool-{attempt}", "result": attempt})
    capture.record_call(0, record(input_tokens=3, output_tokens=4, latency_ms=7))
    payload = build(capture)
    assert (payload.agent_id, payload.input_text, payload.output_text) == (
        AGENT, "selected input", "accepted output",
    )
    assert payload.selected_attempt == 0
    assert payload.tool_calls == ({"name": "tool-0", "result": 0},)
    assert (payload.provider, payload.model, payload.tokens, payload.latency_ms) == (
        "real-provider", "real-model", 19, 27,
    )
    assert build(capture, 2).tokens == 14


def test_only_agent_reply_records_supply_product_metrics():
    capture = trace.AttemptTraceCapture()
    capture.record_call(0, record())
    for purpose in ("embedding", "judge_pre", "judge_post", "other"):
        capture.record_call(0, record(
            purpose=purpose, provider="excluded", model="excluded", input_tokens=999,
        ))
    payload = build(capture)
    assert (payload.provider, payload.model, payload.tokens, payload.latency_ms) == (
        "real-provider", "real-model", 12, 20,
    )


def test_provider_and_model_describe_the_final_agent_reply_call():
    capture = trace.AttemptTraceCapture()
    capture.record_call(0, record())
    capture.record_call(0, record(provider="fallback", model="billed-model"))
    payload = build(capture)
    assert (payload.provider, payload.model, payload.tokens, payload.latency_ms) == (
        "fallback", "billed-model", 24, 40,
    )


def test_deterministic_output_does_not_borrow_an_attempt_or_metrics():
    capture = trace.AttemptTraceCapture()
    capture.record_call(0, record())
    capture.record_tool(0, {"name": "unselected"})
    payload = build(capture, None)
    assert payload.selected_attempt is None
    assert payload.tool_calls == ()
    assert (payload.provider, payload.model, payload.tokens, payload.latency_ms) == (
        None, None, None, None,
    )
    assert build(trace.AttemptTraceCapture(), None) == payload
    with pytest.raises(FrozenInstanceError):
        payload.output_text = "changed"
    draft = trace.ReplyDraft(content={"text": "accepted output"}, trace=payload)
    assert draft.trace is payload
    assert trace.ReplyDraft(content=None, trace=None).content is None
    with pytest.raises(FrozenInstanceError):
        draft.trace = None
    assert not hasattr(payload, "__dict__") and not hasattr(draft, "__dict__")


def test_missing_selected_attempt_and_separate_capture_never_fall_back():
    capture = trace.AttemptTraceCapture()
    capture.record_call(2, record())
    for selected in (0, 1, 3):
        with pytest.raises(ValueError, match="attempt"):
            build(capture, selected)
    with pytest.raises(ValueError, match="attempt"):
        build(trace.AttemptTraceCapture(), 2)


@pytest.mark.parametrize("missing", ["input_tokens", "output_tokens"])
def test_incomplete_token_usage_is_unknown_not_a_partial_total(missing):
    capture = trace.AttemptTraceCapture()
    capture.record_call(0, record())
    capture.record_call(0, record(**{missing: None}))
    assert build(capture).tokens is None


def test_known_zero_usage_is_not_unknown():
    capture = trace.AttemptTraceCapture()
    capture.record_call(0, record(input_tokens=0, output_tokens=0, latency_ms=0))
    assert (build(capture).tokens, build(capture).latency_ms) == (0, 0)


def test_tool_only_attempt_has_no_invented_llm_metrics():
    capture = trace.AttemptTraceCapture()
    capture.record_tool(0, {"result": "deterministic"})
    payload = build(capture)
    assert (payload.provider, payload.model, payload.tokens, payload.latency_ms) == (
        None, None, None, None,
    )


@pytest.mark.parametrize("key", [
    "Authorization", "Proxy-Authorization", "Cookie", "cookies", "Set-Cookie",
    "API_KEY", "X-API-Key", "apiToken", "access-token", "refresh_token",
    "Client Secret", "SECRET", "Password", "token",
])
def test_sensitive_keys_are_normalized_in_arguments_result_and_error(key):
    original = {field: {"nested": [{key: "private", "safe": 7}]}
                for field in ("arguments", "result", "error")}
    snapshot = deepcopy(original)
    (safe,) = tools([original])
    for field in ("arguments", "result", "error"):
        assert safe[field]["nested"][0] == {key: "[REDACTED]", "safe": 7}
    assert original == snapshot


def test_known_secret_values_are_redacted_before_truncating_and_never_mutate_source():
    original = {
        "arguments": {"ordinary": "private-value"},
        "result": ["prefix private-value suffix", "public"],
        "error": "x" * 5000 + "private-value",
    }
    capture = trace.AttemptTraceCapture(known_secrets=("", "private-value"))
    capture.record_tool(0, original)
    original["result"][1] = "later operational mutation"
    safe = build(capture).tool_calls[0]
    assert safe == {
        "arguments": {"ordinary": "[REDACTED]"},
        "result": ["[REDACTED]", "public"], "error": "[REDACTED]",
    }
    safe["arguments"]["ordinary"] = "consumer mutation"
    assert build(capture).tool_calls[0]["arguments"]["ordinary"] == "[REDACTED]"
    assert original["arguments"]["ordinary"] == "private-value"


@pytest.mark.parametrize(("value", "secret"), [
    (123456, "123456"),
    (91234567, "123456"),
    (123456.75, "123456"),
    (1.23456e20, "1.23456e+20"),
])
def test_numeric_secret_occurrences_are_redacted_in_all_tool_fields(value, secret):
    original = {
        "arguments": {"ordinary": value}, "result": [value], "error": value,
    }
    snapshot = deepcopy(original)
    (safe,) = tools([original], known_secrets=(secret,))
    assert safe == {
        "arguments": {"ordinary": "[REDACTED]"},
        "result": ["[REDACTED]"], "error": "[REDACTED]",
    }
    assert secret not in json.dumps(safe)
    assert original == snapshot


def test_numeric_secret_matching_preserves_safe_numbers_booleans_and_none():
    (safe,) = tools(
        [{"result": [42, 2.5, True, False, None]}],
        known_secrets=("123456", "true", "false", "null", "1", "0"),
    )
    assert safe["result"] == [42, 2.5, True, False, None]
    assert type(safe["result"][0]) is int
    assert type(safe["result"][1]) is float
    assert safe["result"][2] is True
    assert safe["result"][3] is False
    assert safe["result"][4] is None


def test_strings_keep_the_limit_including_an_explicit_marker():
    (safe,) = tools([{"arguments": "x" * 4096, "result": "y" * 4097}])
    assert safe["arguments"] == "x" * 4096
    assert len(safe["result"]) <= 4096
    assert safe["result"].endswith("[TRUNCATED]")


def test_container_limits_include_the_truncation_marker():
    (safe,) = tools([{
        "arguments": list(range(51)), "result": {str(i): i for i in range(51)},
        "error": list(range(50)),
    }])
    assert len(safe["arguments"]) == len(safe["result"]) == 50
    assert safe["arguments"][:49] == list(range(49))
    assert safe["arguments"][-1] == {"_truncated": "items"}
    assert safe["result"]["_truncated"] == "items"
    assert safe["error"] == list(range(50))


def test_depth_is_bounded_and_cycles_are_explicitly_cut():
    nested = {"leaf": "too deep"}
    for _ in range(8):
        nested = {"nested": nested}
    cycle = []
    cycle.append(cycle)
    (safe,) = tools([{"arguments": nested, "result": cycle}])
    serialized = json.dumps(safe)
    assert '"_truncated": "depth"' in serialized
    assert "too deep" not in serialized


def test_serialized_tools_have_at_most_six_container_levels_including_markers():
    nested = {"leaf": "too deep"}
    for _ in range(8):
        nested = {"nested": nested}
    safe = tools([{"arguments": nested, "result": [[list(range(51))]]}])

    def depth(value):
        if isinstance(value, dict):
            return 1 + max((depth(item) for item in value.values()), default=0)
        if isinstance(value, (list, tuple)):
            return 1 + max((depth(item) for item in value), default=0)
        return 0

    assert depth(safe) <= 6
    assert '"_truncated": "depth"' in json.dumps(safe)


def test_call_limit_keeps_a_prefix_and_counts_its_marker():
    payloads = [{"name": str(i)} for i in range(33)]
    assert len(tools(payloads[:32])) == 32
    safe = tools(payloads)
    assert len(safe) == 32
    assert safe[:31] == tuple(payloads[:31])
    assert safe[-1] == {"_truncated": "tool_calls"}


def test_total_serialized_tools_fit_64_kib_with_explicit_deterministic_truncation():
    payloads = [{"name": str(i), "result": ["\U0001f600" * 4096] * 50} for i in range(32)]
    snapshot = deepcopy(payloads)
    safe = tools(payloads)
    assert len(json.dumps(safe).encode("utf-8")) <= 64 * 1024
    assert safe[-1] == {"_truncated": "bytes"}
    assert tools(payloads) == safe
    assert payloads == snapshot


def test_long_or_secret_keys_cannot_escape_string_and_secret_limits():
    (safe,) = tools([{"result": {"k" * 5000: "public", "private-value": "ok"}}],
                   known_secrets=("private-value",))
    assert all(len(key) <= 4096 for key in safe["result"])
    assert "private-value" not in json.dumps(safe)
    assert "[TRUNCATED]" in json.dumps(safe)
