"""Observability: spans, metrics and structured logs.

Instrumentation is born with the code, never retrofitted. PII (message content,
names, raw phone numbers) never leaves Postgres into telemetry.
"""

from agents_runtime.obs.logfire_setup import configure_logfire
from agents_runtime.obs.logging import JsonFormatter, configure_logging
from agents_runtime.obs.telemetry import SAFE_ATTRIBUTES, configure_telemetry, span

__all__ = [
    "SAFE_ATTRIBUTES",
    "JsonFormatter",
    "configure_logfire",
    "configure_logging",
    "configure_telemetry",
    "span",
]
