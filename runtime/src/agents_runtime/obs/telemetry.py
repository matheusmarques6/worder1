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
        # 9.1 (Adendo §B): os IDs que tornam o turno navegável no Logfire,
        # espelhando a trilha interna. IDs e rótulos — nunca conteúdo.
        "mission_version_id",
        "node_ref",
        "grant_id",
        "moment_ids",
        "contact_id",
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
def span(name: str, *, remote=None, remote_role: str = "link", **attributes):
    """`with span("turn", organization_id=..., outcome=...):` — no-op sem tracer.

    Atributos fora de SAFE_ATTRIBUTES são descartados (com aviso em debug):
    a lista é o cinto de PII de primeira linha.

    `remote` (9.1b) é um carrier `{"traceparent": ...}` vindo do campo `otel`
    de um payload/outbox; `remote_role` diz como retomar: "parent" continua o
    MESMO trace (worker→sender), "link" abre trace novo apontando para o
    antigo (coalescer→turno — fan-out não vira um trace só).

    `None` não vira atributo (ausência não é a string 'None').
    """
    safe = {
        key: str(value)
        for key, value in attributes.items()
        if key in SAFE_ATTRIBUTES and value is not None
    }
    dropped = {key for key in attributes if key not in SAFE_ATTRIBUTES}
    if dropped:
        logger.debug("atributos fora do vocabulário descartados", extra={"keys": sorted(dropped)})
    if _tracer is None:
        yield None
        return

    kwargs: dict = {"attributes": safe}
    if remote is not None:
        from agents_runtime.obs import carrier

        resumed = carrier.resume(remote)
        if resumed is not None:
            context, span_context = resumed
            if remote_role == "parent":
                kwargs["context"] = context
            else:
                from opentelemetry.trace import Link

                kwargs["links"] = [Link(span_context)]
    with _tracer.start_as_current_span(name, **kwargs) as current:
        yield current


def annotate(**attributes) -> None:
    """Anota o span CORRENTE com atributos do vocabulário — o jeito de quem
    descobre um ID no meio do turno (missão vencedora, grant, momentos) sem
    carregar o span na assinatura. Mesmo cinto do `span()`; no-op sem SDK ou
    sem span gravando. `None` não anota (ausência não vira a string 'None')."""
    safe = {
        key: str(value)
        for key, value in attributes.items()
        if key in SAFE_ATTRIBUTES and value is not None
    }
    dropped = {key for key in attributes if key not in SAFE_ATTRIBUTES}
    if dropped:
        logger.debug("atributos fora do vocabulário descartados", extra={"keys": sorted(dropped)})
    if not safe:
        return
    try:
        from opentelemetry import trace
    except ImportError:
        return
    current = trace.get_current_span()
    if not current.is_recording():
        return
    for key, value in safe.items():
        current.set_attribute(key, value)
