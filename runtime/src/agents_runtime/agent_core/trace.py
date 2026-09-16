"""Pure, per-attempt snapshots for an already-selected reply."""

import json
import math
import re
from collections.abc import Iterable, Mapping
from copy import deepcopy
from dataclasses import dataclass
from itertools import islice
from typing import Any
from uuid import UUID

from agents_runtime.agent_core.metering import CallRecord


@dataclass(frozen=True, slots=True)
class AcceptedTracePayload:
    agent_id: UUID
    input_text: str
    output_text: str
    selected_attempt: int | None
    provider: str | None
    model: str | None
    tool_calls: tuple[dict[str, Any], ...]
    tokens: int | None
    latency_ms: int | None


@dataclass(frozen=True, slots=True)
class ReplyDraft:
    content: dict[str, Any] | None
    trace: AcceptedTracePayload | None


def _sanitize(value: Any, secrets: tuple[str, ...], depth: int = 2) -> Any:
    if isinstance(value, str):
        if any(secret in value for secret in secrets):
            return "[REDACTED]"
        marker = "[TRUNCATED]"
        return value if len(value) <= 4096 else value[:4096 - len(marker)] + marker
    if value is None or isinstance(value, (bool, int)):
        return value
    if isinstance(value, float) and math.isfinite(value):
        return value
    if depth >= 6:
        return {"_truncated": "depth"}
    if isinstance(value, Mapping):
        result = {}
        truncated = len(value) > 50
        for key, item in islice(value.items(), 49 if truncated else 50):
            if not isinstance(key, str):
                return {"_truncated": "non_json_key"}
            safe_key = _sanitize(key, secrets)
            if safe_key in result:
                return {"_truncated": "key_collision"}
            normalized = re.sub(r"[^a-z0-9]", "", key.lower())
            sensitive = normalized.endswith((
                "authorization", "cookie", "cookies", "apikey", "apitoken",
                "accesstoken", "refreshtoken", "clientsecret", "secret", "password", "token",
            ))
            result[safe_key] = "[REDACTED]" if sensitive else _sanitize(item, secrets, depth + 1)
        if truncated:
            result["_truncated"] = "items"
        return result
    if isinstance(value, (list, tuple)):
        truncated = len(value) > 50
        result = [_sanitize(item, secrets, depth + 1)
                  for item in value[:49 if truncated else 50]]
        if truncated:
            result.append({"_truncated": "items"})
        return result
    return {"_truncated": "non_json_value"}


class AttemptTraceCapture:
    """One instance per turn; input and output selection belongs to the caller.

    The final agent_reply call identifies the billed provider/model. Tokens
    cover every agent_reply call in that attempt, or stay unknown if any usage
    component is absent. Latency is their sum, never judge or embedding time.
    """

    def __init__(self, *, known_secrets: Iterable[str] = ()) -> None:
        self._secrets = tuple(secret for secret in known_secrets if secret)
        self._calls: dict[int, list[CallRecord]] = {}
        self._tools: dict[int, list[dict[str, Any]]] = {}
        self._truncated: dict[int, str] = {}

    def record_call(self, attempt: int, record: CallRecord) -> None:
        if record.purpose == "agent_reply":
            self._calls.setdefault(attempt, []).append(record)

    def record_tool(self, attempt: int, payload: dict[str, Any]) -> None:
        """Copy and sanitize at capture; neither caller can mutate the other's data.

        Limits count their markers; depth includes the outer tool_calls array.
        Serialized size uses json.dumps defaults
        (ASCII escaping and spaces), also bounding compact UTF-8 serialization.
        Once a prefix is cut, subsequent tools remain omitted explicitly.
        """
        calls = self._tools.setdefault(attempt, [])
        if attempt in self._truncated:
            return
        if len(calls) == 32:
            calls[-1] = {"_truncated": "tool_calls"}
            self._truncated[attempt] = "tool_calls"
        else:
            calls.append(_sanitize(payload, self._secrets))
        if len(json.dumps(calls).encode("utf-8")) > 64 * 1024:
            marker = {"_truncated": "bytes"}
            calls.pop()
            while len(json.dumps([*calls, marker]).encode("utf-8")) > 64 * 1024:
                calls.pop()
            calls.append(marker)
            self._truncated[attempt] = "bytes"

    def build(
        self,
        *,
        agent_id: UUID,
        input_text: str,
        output_text: str,
        selected_attempt: int | None,
    ) -> AcceptedTracePayload:
        if (
            selected_attempt is not None
            and selected_attempt not in self._calls
            and selected_attempt not in self._tools
        ):
            raise ValueError(f"selected attempt {selected_attempt} was not captured")
        calls = self._calls.get(selected_attempt, []) if selected_attempt is not None else []
        tools = self._tools.get(selected_attempt, []) if selected_attempt is not None else []
        usage = [token for call in calls for token in (call.input_tokens, call.output_tokens)]
        return AcceptedTracePayload(
            agent_id=agent_id,
            input_text=input_text,
            output_text=output_text,
            selected_attempt=selected_attempt,
            provider=calls[-1].provider if calls else None,
            model=calls[-1].model if calls else None,
            tool_calls=tuple(deepcopy(tools)),
            tokens=sum(usage) if usage and all(token is not None for token in usage) else None,
            latency_ms=sum(call.latency_ms for call in calls) if calls else None,
        )
