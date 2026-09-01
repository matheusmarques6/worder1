"""obs/ — o contrato do log estruturado e o cinto de PII da telemetria.

O que se prova aqui é barato e permanente: cada linha de log é JSON parseável
(o collector não tem parser custom), campos extra atravessam, e NENHUM atributo
fora do vocabulário chega a um span — a lista SAFE_ATTRIBUTES é a primeira
linha de defesa de PII e vive como teste, não como intenção.
"""

import json
import logging

from agents_runtime.obs import SAFE_ATTRIBUTES, configure_logging, logfire_setup, span
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
        # Chaves do vocabulário permitido (item 28) — não são valores livres.
        line = _format(_record(queue="q_inbound", provider="openai"))
        assert line["queue"] == "q_inbound"
        assert line["provider"] == "openai"

    def test_a_value_json_cannot_carry_becomes_repr(self) -> None:
        class Opaque:
            def __repr__(self) -> str:
                return "<opaque>"

        line = _format(_record(provider=Opaque()))
        assert line["provider"] == "<opaque>"

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


class TestTheLogAllowlist:
    """Item 28: o log de stdout ganha o mesmo cinto do span (SAFE_ATTRIBUTES),
    somado aos campos operacionais que só o log carrega."""

    def test_a_forbidden_key_does_not_appear_in_the_log_line(self) -> None:
        line = _format(_record(secret_token="abc123"))
        assert "secret_token" not in line

    def test_the_omission_leaves_a_trace_not_silence(self) -> None:
        line = _format(_record(secret_token="abc123"))
        assert line["_omitted_keys"] == ["secret_token"]

    def test_a_legitimate_key_keeps_passing(self) -> None:
        line = _format(_record(organization_id="org-1"))
        assert line["organization_id"] == "org-1"
        assert "_omitted_keys" not in line

    def test_a_dict_under_a_forbidden_key_is_dropped_whole(self) -> None:
        # "context" não está no vocabulário: o valor inteiro (com o que tiver
        # dentro) some da linha, não só a chave de topo. Isto NÃO é o caso de
        # contrabando que o brief do item 28 pediu — a chave de topo já era
        # barrada por si só; ver test_a_forbidden_field_nested_under_an_
        # allowed_key_is_a_known_gap logo abaixo para o caso real.
        raw = JsonFormatter().format(_record(context={"secret_token": "abc123"}))
        assert "secret_token" not in raw
        assert "abc123" not in raw
        line = json.loads(raw)
        assert "context" not in line
        assert line["_omitted_keys"] == ["context"]

    def test_a_forbidden_field_nested_under_an_allowed_key_is_a_known_gap(self) -> None:
        # O contrabando real do brief: um campo proibido não sob uma chave
        # barrada, mas DENTRO do valor de uma chave PERMITIDA. O allowlist
        # filtra o NOME da chave de topo de `extra`, não o conteúdo do valor
        # — hoje isso passa direto, sem marcador de omissão.
        #
        # Aceito, não corrigido: sanitização recursiva teria que andar por
        # `queues` também (obs/logging.py, _LOG_ONLY_FIELDS) — lá as chaves
        # internas são nomes de fila DINÂMICOS, não o vocabulário fixo, então
        # aplicar o mesmo allowlist recursivamente apagaria dado legítimo.
        # Essa troca não foi feita (ruling do controlador no item 28: sem
        # sanitização recursiva nesta rodada). Se este teste falhar um dia,
        # é porque alguém fechou a lacuna — atualize-o para refletir a
        # decisão nova, registrada em algum lugar citável.
        line = _format(_record(organization_id={"id": "org-1", "secret_token": "abc123"}))
        assert line["organization_id"] == {"id": "org-1", "secret_token": "abc123"}
        assert "_omitted_keys" not in line


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

    def test_the_turn_vocabulary_of_9_1_is_in(self) -> None:
        # Adendo §B 9.1: os IDs que tornam a conversa navegável no Logfire.
        for attribute in (
            "mission_version_id", "node_ref", "grant_id", "moment_ids", "contact_id"
        ):
            assert attribute in SAFE_ATTRIBUTES

    def test_the_new_ids_cross_the_belt(self, monkeypatch) -> None:
        recorder = _SpanRecorder()
        monkeypatch.setattr(telemetry_module, "_tracer", recorder)

        with span(
            "turn",
            mission_version_id="mv-1",
            grant_id="g-1",
            moment_ids="m-1,m-2",
            contact_id="c-1",
            node_ref="flow:node",
        ):
            pass

        ((_, attributes),) = recorder.calls
        assert attributes == {
            "mission_version_id": "mv-1",
            "grant_id": "g-1",
            "moment_ids": "m-1,m-2",
            "contact_id": "c-1",
            "node_ref": "flow:node",
        }

    def test_without_endpoint_configure_declines(self, monkeypatch) -> None:
        monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
        assert telemetry_module.configure_telemetry() is False


class _FakeLogfire:
    """Um módulo logfire de mentira: grava o que foi chamado e nada mais."""

    def __init__(self, *, broken: set[str] | None = None) -> None:
        self.configured: dict | None = None
        self.instrumented: list[str] = []
        self._broken = broken or set()

    class ScrubbingOptions:
        def __init__(self, extra_patterns=None) -> None:
            self.extra_patterns = list(extra_patterns or [])

    def configure(self, **kwargs) -> None:
        self.configured = kwargs

    def __getattr__(self, name: str):
        if not name.startswith("instrument_"):
            raise AttributeError(name)

        def hook(*args, **kwargs):
            if name.removeprefix("instrument_") in self._broken:
                raise RuntimeError("instrumentação sem dependência")
            self.instrumented.append(name.removeprefix("instrument_"))

        return hook


class TestConfigureLogfire:
    def test_without_a_token_it_declines_at_zero_cost(self, monkeypatch) -> None:
        monkeypatch.delenv("AGENTS_LOGFIRE_TOKEN", raising=False)
        assert logfire_setup.configure_logfire() == ()

    def test_with_a_token_it_configures_and_instruments_the_real_stack(
        self, monkeypatch
    ) -> None:
        fake = _FakeLogfire()
        monkeypatch.setenv("AGENTS_LOGFIRE_TOKEN", "lf-token")
        monkeypatch.setenv("DEPLOY_ENV", "prod")
        monkeypatch.setattr(logfire_setup, "_import_logfire", lambda: fake)

        enabled = logfire_setup.configure_logfire()

        assert fake.configured is not None
        assert fake.configured["token"] == "lf-token"
        assert fake.configured["service_name"] == "worder-runtime"
        assert fake.configured["environment"] == "prod"
        assert fake.configured["console"] is False
        # D13, 3ª linha: o scrubbing cobre vocabulário de conteúdo GenAI.
        patterns = " ".join(fake.configured["scrubbing"].extra_patterns)
        assert "prompt" in patterns and "completion" in patterns
        # As instrumentações do runtime REAL (adapters são httpx puro):
        assert fake.instrumented == ["httpx", "psycopg", "system_metrics"]
        assert enabled == ("logfire", "httpx", "psycopg", "system_metrics")
        # instrument_openai/anthropic NÃO são chamadas (D13: a captura de
        # conteúdo delas viola a regra, e não há SDK para instrumentar —
        # divergência registrada no STATUS).
        assert "openai" not in fake.instrumented
        assert "anthropic" not in fake.instrumented

    def test_a_broken_instrumentation_never_kills_the_boot(self, monkeypatch) -> None:
        fake = _FakeLogfire(broken={"psycopg"})
        monkeypatch.setenv("AGENTS_LOGFIRE_TOKEN", "lf-token")
        monkeypatch.setattr(logfire_setup, "_import_logfire", lambda: fake)

        enabled = logfire_setup.configure_logfire()

        assert "psycopg" not in enabled
        assert "httpx" in enabled and "system_metrics" in enabled

    def test_token_without_the_package_declines_loudly(self, monkeypatch) -> None:
        monkeypatch.setenv("AGENTS_LOGFIRE_TOKEN", "lf-token")
        monkeypatch.setattr(logfire_setup, "_import_logfire", lambda: None)
        assert logfire_setup.configure_logfire() == ()
