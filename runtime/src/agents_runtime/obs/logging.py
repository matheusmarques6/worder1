"""Logs estruturados — JSON por linha, stdout, e nada de PII.

O runtime roda numa VPS atrás de um collector (doc de observabilidade §2.1):
stdout JSON é o formato que Loki/Logfire ingerem sem parser custom. O contrato
de campo é pequeno e estável: `ts`, `level`, `logger`, `msg` + o que vier em
`extra` — e `extra` carrega IDs, nunca conteúdo (o mesmo princípio da
telemetria: o texto da conversa vive no Postgres, não no log).
"""

import json
import logging
import sys
from datetime import UTC, datetime

#: Chaves de LogRecord que não são "extra" — tudo que sobrar no __dict__ além
#: destas foi passado pelo chamador via `extra=` e entra no JSON.
_RECORD_FIELDS = frozenset(
    logging.LogRecord("", 0, "", 0, "", (), None).__dict__
) | {"message", "asctime", "taskName"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        line: dict = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RECORD_FIELDS:
                line[key] = value if _is_json_safe(value) else repr(value)
        if record.exc_info and record.exc_info[1] is not None:
            line["error"] = repr(record.exc_info[1])
            line["stack"] = self.formatException(record.exc_info)
        return json.dumps(line, ensure_ascii=False, default=repr)


def _is_json_safe(value) -> bool:
    return isinstance(value, (str, int, float, bool, type(None), list, dict))


def configure_logging(level: str | None = None) -> None:
    """Uma vez, no entrypoint. Idempotente: reconfigurar troca o handler em
    vez de empilhar (o teste de formatter chama mais de uma vez)."""
    root = logging.getLogger()
    root.setLevel((level or "INFO").upper())
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    for existing in list(root.handlers):
        root.removeHandler(existing)
    root.addHandler(handler)
