"""O carrier W3C do runtime (9.1b) — o contexto viaja no campo `otel`.

Dois movimentos, sempre guardados (sem SDK ou sem span ativo = None e nada
quebra):

  * `inject()` — o span corrente vira `{"traceparent": ...}` para carimbar o
    payload pgmq (coalescer) e a linha de outbox (conclude do turno);
  * `resume(otel)` — o dicionário de volta vira contexto OTel, que o
    `telemetry.span(remote=...)` usa como PARENT (worker→sender: o mesmo
    trace) ou como LINK (coalescer→turno: fan-out não vira um trace-monstro).
"""


def inject() -> dict | None:
    """O contexto do span corrente como carrier W3C, ou None sem span/SDK."""
    try:
        from opentelemetry import trace
        from opentelemetry.trace.propagation.tracecontext import (
            TraceContextTextMapPropagator,
        )
    except ImportError:
        return None

    if not trace.get_current_span().get_span_context().is_valid:
        return None
    headers: dict = {}
    TraceContextTextMapPropagator().inject(headers)
    return headers or None


def resume(otel) -> tuple | None:
    """`(context, span_context)` extraídos de um carrier, ou None se o dado
    não presta (otel nulo, traceparent ilegível, SDK ausente)."""
    if not isinstance(otel, dict) or not otel.get("traceparent"):
        return None
    try:
        from opentelemetry import trace
        from opentelemetry.trace.propagation.tracecontext import (
            TraceContextTextMapPropagator,
        )
    except ImportError:
        return None

    context = TraceContextTextMapPropagator().extract(
        carrier={key: str(value) for key, value in otel.items()}
    )
    span_context = trace.get_current_span(context).get_span_context()
    if not span_context.is_valid:
        return None
    return context, span_context
