"""Logs estruturados — JSON por linha, stdout, e nada de PII.

O runtime roda numa VPS atrás de um collector (doc de observabilidade §2.1):
stdout JSON é o formato que Loki/Logfire ingerem sem parser custom. O contrato
de campo é pequeno e estável: `ts`, `level`, `logger`, `msg` + o que vier em
`extra` — e `extra` carrega IDs, nunca conteúdo (o mesmo princípio da
telemetria: o texto da conversa vive no Postgres, não no log).

Isso não era código, era convenção — até o item 28 do audit: `extra` copiava
tudo que o chamador mandasse. `ALLOWED_EXTRA_KEYS`, abaixo, é o cinto: mesma
ideia de `SAFE_ATTRIBUTES` em obs/telemetry.py (só o vocabulário atravessa),
irmão daquele, não um segundo mecanismo — quem mexer aqui deve tratar os dois
juntos.
"""

import json
import logging
import sys
from datetime import UTC, datetime

from agents_runtime.obs.telemetry import SAFE_ATTRIBUTES

#: Chaves de LogRecord que não são "extra" — tudo que sobrar no __dict__ além
#: destas foi passado pelo chamador via `extra=` e entra no JSON.
_RECORD_FIELDS = frozenset(
    logging.LogRecord("", 0, "", 0, "", (), None).__dict__
) | {"message", "asctime", "taskName"}

#: Item 28 do audit: o log de stdout é irmão do cinto de telemetria
#: (SAFE_ATTRIBUTES em obs/telemetry.py), não um canal solto — antes dele,
#: `extra` passava cru, e disciplina de chamador não é código. Começa do
#: MESMO vocabulário do span (uma segunda lista que diverge é o padrão que
#: esta auditoria já corrigiu 4x) e soma o punhado de campos operacionais que
#: só o log carrega — telemetria nunca teve span de heartbeat ou porta HTTP,
#: isto é saúde de processo, não domínio, e não carrega PII.
_LOG_ONLY_FIELDS = frozenset(
    {
        "process_name",
        "queues",
        "port",
        "instrumented",
        "outbox_id",
        "delivered",
        "of",
        "keys",  # o próprio aviso de "atributos descartados" do telemetry.py
    }
)
ALLOWED_EXTRA_KEYS = SAFE_ATTRIBUTES | _LOG_ONLY_FIELDS


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        line: dict = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        omitted = []
        for key, value in record.__dict__.items():
            if key in _RECORD_FIELDS:
                continue
            if key in ALLOWED_EXTRA_KEYS:
                line[key] = value if _is_json_safe(value) else repr(value)
            else:
                # Fora do vocabulário: o valor inteiro fica de fora — inclusive
                # se for um dict aninhado, que senão contrabandearia qualquer
                # coisa por dentro. Rastro, não silêncio (requisito 4 do item 28).
                omitted.append(key)
        if omitted:
            line["_omitted_keys"] = sorted(omitted)
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
