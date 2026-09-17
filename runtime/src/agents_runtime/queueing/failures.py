"""Transitório e permanente — a decisão entre insistir e desistir.

Errar para o lado transitório queima cinco tentativas num payload que nunca vai
funcionar. Errar para o permanente joga fora uma mensagem que só precisava
esperar o 429 passar. Por isso a classificação é explícita e testada, e o que
não está mapeado é marcado como tal em vez de adivinhado.
"""

import re
from enum import Enum

import httpx


class Failure(Enum):
    """O que fazer com o erro."""

    TRANSIENT = "transient"
    PERMANENT = "permanent"
    # Repete como transitório, MAS o limite de tentativas continua valendo —
    # sem ele, "transitório" viraria "para sempre" e a DLQ, letra morta. Existir
    # separado é o que permite alertar quando a tabela abaixo envelhecer.
    UNKNOWN = "unknown"


_STATUS = re.compile(r"\b(?:HTTP\s*)?([1-5]\d{2})\b")

# O que o provedor respondeu vale mais que o tipo da exceção: um 400 embrulhado
# em RuntimeError é permanente, e um 500 no mesmo tipo é transitório.
_TRANSIENT_STATUS = {408, 425, 429, 500, 502, 503, 504}

_TRANSIENT_TYPES = (TimeoutError, ConnectionError, httpx.TransportError)
_PERMANENT_TYPES = (ValueError, PermissionError, LookupError)

_TRANSIENT_TEXT = ("deadlock", "timeout", "temporarily unavailable")
_PERMANENT_TEXT = ("credencial revogada", "payload inválido", "tenant inexistente")

# Os códigos de excesso da Meta, verbatim do TS (`rate-limiter.ts:605`) — dois
# motores que discordam do que é "excesso" no MESMO número é a doença que o
# item 32 trata. '429' está na lista porque a Meta o usa como `code`, além do
# status HTTP que `_STATUS` já pega.
_RATE_LIMIT_CODES = frozenset({"4", "429", "80007", "130429", "131048", "131049", "131056"})

# A aspa antes de `code` não é decoração: `"error_subcode"` termina em `code"`,
# e um casamento sem ela leria o subcode como código de erro — um subcode 4 ou
# 429 (valores comuns) throttlaria o número por um erro que não é de limite.
_META_CODE = re.compile(r'"code"\s*:\s*(\d+)')

#: A etiqueta que o canal põe na FRENTE da mensagem, lida do corpo INTEIRO
#: antes de qualquer truncagem. Formato próprio de propósito: `"code":N` também
#: aparece no corpo truncado que viaja atrás, e a truncagem pode ter partido um
#: número lá (`"code":470` virando `"code":4`). Quando a etiqueta existe, ela é
#: a palavra final; sem ela não há como saber, e aí vale o que dá para ler.
_TAGGED_CODE = re.compile(r"\bmeta_code=(\d+)\b")


def meta_error_code(body: str) -> str | None:
    """O `code` do erro da Meta, lido do corpo COMPLETO. `None` se não houver.

    Mora aqui, e não no canal, porque a regex é a mesma que `is_rate_limited`
    usa — duas cópias divergiriam no dia em que alguém ajustasse uma delas.
    """
    match = _META_CODE.search(body)
    return match.group(1) if match else None


def is_rate_limited(error: BaseException) -> bool:
    """A Meta sinalizou EXCESSO neste número?

    Pergunta diferente de `classify`, que decide o destino da MENSAGEM: um 503
    é transitório e não é excesso, e throttlar o número por um outage do Graph
    calaria a loja por dez minutos por um erro que não foi dela.
    """
    text = str(error)
    status = _STATUS.search(text)
    if status is not None and status.group(1) == "429":
        return True
    tagged = _TAGGED_CODE.search(text)
    if tagged is not None:
        # Etiquetado: o canal já leu o corpo inteiro, e o que ele leu decide —
        # sem cair no corpo truncado que vem atrás e pode mentir nos dois
        # sentidos (código enterrado além do corte, ou número partido no meio).
        return tagged.group(1) in _RATE_LIMIT_CODES
    return any(code in _RATE_LIMIT_CODES for code in _META_CODE.findall(text))


def classify(error: BaseException) -> Failure:
    # Item 32, ruling S: excesso é transitório, ANTES do teste de status. Os
    # códigos de excesso da Meta chegam como HTTP 400 — que é permanente pelo
    # status —, então sem esta linha o erro que arma o cooldown do número
    # descartaria a própria mensagem que o causou. O número protegido e a
    # mensagem morta é meia proteção; a mensagem só precisa esperar o número
    # voltar, que é a definição de transitório.
    if is_rate_limited(error):
        return Failure.TRANSIENT

    status = _STATUS.search(str(error))
    if status is not None:
        code = int(status.group(1))
        return Failure.TRANSIENT if code in _TRANSIENT_STATUS else Failure.PERMANENT

    if isinstance(error, _TRANSIENT_TYPES):
        return Failure.TRANSIENT
    if isinstance(error, _PERMANENT_TYPES):
        return Failure.PERMANENT

    message = str(error).lower()
    if any(term in message for term in _TRANSIENT_TEXT):
        return Failure.TRANSIENT
    if any(term in message for term in _PERMANENT_TEXT):
        return Failure.PERMANENT

    return Failure.UNKNOWN
