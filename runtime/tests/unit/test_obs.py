"""obs/ — o contrato do log estruturado e o cinto de PII da telemetria.

O que se prova aqui é barato e permanente: cada linha de log é JSON parseável
(o collector não tem parser custom), campos extra atravessam, e NENHUM atributo
fora do vocabulário chega a um span — a lista SAFE_ATTRIBUTES é a primeira
linha de defesa de PII e vive como teste, não como intenção.
"""

import json
import logging

from agents_runtime.obs import SAFE_ATTRIBUTES, configure_logging, span
from agents_runtime.obs import telemetry as telemetry_module
from agents_runtime.obs.logging import JsonFormatter


def _format(record: logging.LogRecord) -> dict:
    return json.loads(JsonFormatter().format(record))


def _record(msg: str = "algo aconteceu", **extra) -> logging.LogRecord:
    record = logging.LogRecord("worder.test", logging.INFO, __file__, 1, msg, (), None)
    for key, value in extra.items():
        setattr(record, key, value)
    return record


class TestJsonLines:
    def test_a_line_is_json_with_the_stable_contract(self) -> None:
        line = _format(_record())
        assert line["level"] == "info"
        assert line["logger"] == "worder.test"
        assert line["msg"] == "algo aconteceu"
        assert line["ts"].endswith("+00:00")

    def test_extra_fields_pass_through(self) -> None:
        line = _format(_record(queue="q_inbound", depth=7))
        assert line["queue"] == "q_inbound"
        assert line["depth"] == 7

    def test_a_value_json_cannot_carry_becomes_repr(self) -> None:
        class Opaque:
            def __repr__(self) -> str:
                return "<opaque>"

        line = _format(_record(thing=Opaque()))
        assert line["thing"] == "<opaque>"

    def test_an_exception_carries_error_and_stack(self) -> None:
        try:
            raise RuntimeError("a causa")
        except RuntimeError:
            import sys

            record = _record()
            record.exc_info = sys.exc_info()
        line = _format(record)
        assert "a causa" in line["error"]
        assert "RuntimeError" in line["stack"]

    def test_configure_twice_keeps_one_handler(self) -> None:
        configure_logging("INFO")
        configure_logging("INFO")
        assert len(logging.getLogger().handlers) == 1


class _SpanRecorder:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    def start_as_current_span(self, name: str, attributes: dict):
        self.calls.append((name, attributes))
        import contextlib

        @contextlib.contextmanager
        def cm():
            yield "span"

        return cm()


class TestTheAttributeBelt:
    def test_without_a_tracer_span_is_a_noop(self) -> None:
        with span("turn", organization_id="abc") as current:
            assert current is None

    def test_only_the_vocabulary_reaches_the_tracer(self, monkeypatch) -> None:
        recorder = _SpanRecorder()
        monkeypatch.setattr(telemetry_module, "_tracer", recorder)

        with span(
            "turn",
            organization_id="org-1",
            outcome="replied",
            content="oi, meu telefone é 5511...",  # PII: NUNCA atravessa
            phone="+5511999999999",
        ):
            pass

        ((name, attributes),) = recorder.calls
        assert name == "turn"
        assert attributes == {"organization_id": "org-1", "outcome": "replied"}

    def test_the_vocabulary_is_ids_and_labels_only(self) -> None:
        # O teste que faz um novo atributo ser uma DECISÃO: quem adicionar
        # `content` aqui vai ter que explicar o porquê no review.
        assert "content" not in SAFE_ATTRIBUTES
        assert "phone" not in SAFE_ATTRIBUTES
        assert "text" not in SAFE_ATTRIBUTES

    def test_without_endpoint_configure_declines(self, monkeypatch) -> None:
        monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
        assert telemetry_module.configure_telemetry() is False
