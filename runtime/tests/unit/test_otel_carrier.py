"""9.1b — o carrier Python: injetar o contexto atual, retomar num span novo.

Com o SDK instalado (dependência do logfire), o teste prova o contrato de
verdade: `inject()` dentro de um span devolve um traceparent válido; um span
aberto com `remote=` como PARENT continua o MESMO trace (worker→sender); como
LINK, nasce trace novo apontando para o antigo (coalescer→turno, fan-out).
Sem span ativo — o caso do processo sem tracer — `inject()` é None e nada
quebra: telemetria é acessório, nunca dependência.
"""

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from agents_runtime.obs import carrier
from agents_runtime.obs import telemetry as telemetry_module
from agents_runtime.obs.telemetry import span


@pytest.fixture
def exporter(monkeypatch) -> InMemorySpanExporter:
    memory = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(memory))
    monkeypatch.setattr(telemetry_module, "_tracer", provider.get_tracer("test"))
    return memory


class TestInject:
    def test_without_an_active_span_it_is_none(self) -> None:
        assert carrier.inject() is None

    def test_inside_a_span_it_carries_a_valid_traceparent(self, exporter) -> None:
        with span("turn", organization_id="org-1"):
            otel = carrier.inject()
        assert otel is not None
        assert otel["traceparent"].startswith("00-")

    def test_garbage_in_is_a_plain_span_out(self, exporter) -> None:
        with span("send", remote={"traceparent": "lixo"}):
            pass
        (finished,) = exporter.get_finished_spans()
        assert finished.parent is None
        assert not finished.links


class TestResume:
    def test_as_parent_the_trace_continues(self, exporter) -> None:
        with span("turn"):
            otel = carrier.inject()
        turn = exporter.get_finished_spans()[0]

        with span("send", remote=otel, remote_role="parent"):
            pass

        send = exporter.get_finished_spans()[1]
        assert send.context.trace_id == turn.context.trace_id
        assert send.parent is not None
        assert send.parent.span_id == turn.context.span_id

    def test_as_link_a_new_trace_points_back(self, exporter) -> None:
        with span("coalesce_pass"):
            otel = carrier.inject()
        sweep = exporter.get_finished_spans()[0]

        with span("turn", remote=otel, remote_role="link"):
            pass

        turn = exporter.get_finished_spans()[1]
        assert turn.context.trace_id != sweep.context.trace_id
        (link,) = turn.links
        assert link.context.trace_id == sweep.context.trace_id

    def test_none_remote_is_just_a_span(self, exporter) -> None:
        with span("turn", remote=None):
            pass
        (finished,) = exporter.get_finished_spans()
        assert finished.parent is None
