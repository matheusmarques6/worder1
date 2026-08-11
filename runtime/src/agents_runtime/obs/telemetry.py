"""Spans OTel — opcionais no processo, obrigatórios na disciplina.

Sem SDK instalado ou sem endpoint configurado, `span()` é um no-op de custo
zero: telemetria é acessório do processo, nunca dependência (falha de export
é log local, jamais erro de negócio — doc de observabilidade §2.1).

A parte que NÃO é opcional é a lista de atributos: só IDs e rótulos de
domínio atravessam (`SAFE_ATTRIBUTES`). Conteúdo de mensagem, nome e telefone
ficam no Postgres — o teste de unidade prova que um atributo fora da lista é
descartado antes de chegar em qualquer exporter.
"""

import logging
import os
from contextlib import contextmanager

logger = logging.getLogger(__name__)

#: O vocabulário inteiro da telemetria de domínio. Um atributo novo entra
#: aqui por decisão, não por conveniência de call site.
SAFE_ATTRIBUTES = frozenset(
    {
        "organization_id",
        "conversation_id",
        "queue",
        "outcome",
        "verdict",
        "kind",
        "channel",
        "attempt",
        "provider",
        "model",
        "event_type",
    }
)

_tracer = None


def configure_telemetry(service_name: str = "agents-runtime") -> bool:
    """Liga o tracer se (e só se) houver endpoint E SDK. Devolve o que ligou."""
    global _tracer
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip()
    if not endpoint:
        return False
    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        logger.warning(
            "OTEL_EXPORTER_OTLP_ENDPOINT definido mas o SDK OTel não está "
            "instalado — telemetria segue desligada",
        )
        return False

    resource = Resource.create(
        {
            "service.name": service_name,
            "deployment.environment": os.environ.get("DEPLOY_ENV", "dev"),
        }
    )
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint)))
    trace.set_tracer_provider(provider)
    _tracer = trace.get_tracer(service_name)
    return True


@contextmanager
def span(name: str, **attributes):
    """`with span("turn", organization_id=..., outcome=...):` — no-op sem tracer.

    Atributos fora de SAFE_ATTRIBUTES são descartados (com aviso em debug):
    a lista é o cinto de PII de primeira linha.
    """
    safe = {key: str(value) for key, value in attributes.items() if key in SAFE_ATTRIBUTES}
    dropped = set(attributes) - set(safe)
    if dropped:
        logger.debug("atributos fora do vocabulário descartados", extra={"keys": sorted(dropped)})
    if _tracer is None:
        yield None
        return
    with _tracer.start_as_current_span(name, attributes=safe) as current:
        yield current
