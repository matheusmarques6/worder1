"""Unidade 4 — transitório e permanente.

A classificação é o que decide entre "tenta de novo" e "vai para a DLQ". Errar
para o lado transitório queima cinco tentativas num payload que nunca vai
funcionar; errar para o permanente joga fora uma mensagem que só precisava
esperar o 429 passar.

O caso não mapeado tem decisão explícita, e ela está registrada no módulo: erro
desconhecido é tratado como transitório **mas o limite de tentativas continua
valendo**. Sem o limite, "transitório" viraria "para sempre" e a DLQ, letra
morta.
"""

import pytest

from agents_runtime.queueing.failures import Failure, classify, is_rate_limited


class ApiTimeout(TimeoutError):
    pass


@pytest.mark.parametrize(
    "error",
    [
        ApiTimeout("o provedor não respondeu"),
        ConnectionError("conexão caiu"),
        # 429 e 5xx chegam como erro de status do adaptador do canal.
        RuntimeError("HTTP 429 Too Many Requests"),
        RuntimeError("HTTP 503 Service Unavailable"),
        RuntimeError("deadlock detected"),
    ],
)
def test_what_may_work_next_time_is_transient(error: Exception) -> None:
    assert classify(error) is Failure.TRANSIENT


@pytest.mark.parametrize(
    "error",
    [
        ValueError("payload inválido: falta o campo 'from'"),
        PermissionError("credencial revogada"),
        LookupError("tenant inexistente"),
        RuntimeError("HTTP 400 Bad Request"),
        RuntimeError("HTTP 401 Unauthorized"),
    ],
)
def test_what_will_never_work_is_permanent(error: Exception) -> None:
    assert classify(error) is Failure.PERMANENT


def test_an_unmapped_error_is_flagged_rather_than_guessed() -> None:
    # UNKNOWN não é um terceiro comportamento: ele repete como transitório e
    # morre no limite. O valor de tê-lo separado é que a métrica de UNKNOWN
    # subindo diz que a tabela de classificação envelheceu.
    class SomethingNew(Exception):
        pass

    assert classify(SomethingNew("nunca vi isso")) is Failure.UNKNOWN


def test_the_status_code_wins_over_the_exception_type() -> None:
    # Um 400 embrulhado em RuntimeError é permanente, e um 500 no mesmo tipo é
    # transitório — o que decide é o que o provedor respondeu.
    assert classify(RuntimeError("HTTP 500")) is Failure.TRANSIENT
    assert classify(RuntimeError("HTTP 422 Unprocessable Entity")) is Failure.PERMANENT


class TestTheRateLimitSignal:
    """Item 32 · unidade 1 — quem alimenta o cooldown de throttle.

    `classify` decide o que fazer com A MENSAGEM; este reconhecedor decide se o
    NÚMERO levou um sinal de excesso da Meta. São perguntas diferentes e a
    diferença importa: um 503 é transitório e NÃO é excesso — throttlar o
    número por causa de um outage do Graph calaria a loja por dez minutos por
    um erro que não foi dela.

    A lista de códigos é a do TS (`rate-limiter.ts:605`), verbatim, porque dois
    motores que discordam do que é "excesso" no mesmo número é a doença que o
    item trata.
    """

    @pytest.mark.parametrize(
        "error",
        [
            # O 429 do próprio status HTTP.
            RuntimeError("HTTP 429 Too Many Requests"),
            # Os códigos da Meta, no corpo que o canal preserva em last_error.
            RuntimeError('HTTP 400 {"error":{"message":"limite","code":4}}'),
            RuntimeError('HTTP 400 {"error":{"code":80007}}'),
            RuntimeError('HTTP 400 {"error":{"code":130429}}'),
            RuntimeError('HTTP 400 {"error":{"code":131048}}'),
            RuntimeError('HTTP 400 {"error":{"code":131049}}'),
            RuntimeError('HTTP 400 {"error":{"code":131056}}'),
            RuntimeError('HTTP 400 {"error": {"code" : 131048}}'),
        ],
    )
    def test_the_meta_excess_signals_are_recognized(self, error: Exception) -> None:
        assert is_rate_limited(error) is True

    @pytest.mark.parametrize(
        "error",
        [
            # Transitório, mas NÃO excesso: o número não fez nada de errado.
            RuntimeError("HTTP 503 Service Unavailable"),
            RuntimeError("HTTP 500"),
            ConnectionError("conexão caiu"),
            # Erro da Meta que não é limite: janela de reengajamento fechada.
            RuntimeError('HTTP 400 {"error":{"code":131047}}'),
            # Nossos próprios erros de payload.
            ValueError("payload inválido: sem 'text' — chaves ['image']"),
        ],
    )
    def test_what_is_not_excess_never_throttles_the_number(self, error: Exception) -> None:
        assert is_rate_limited(error) is False

    def test_error_subcode_is_not_code(self) -> None:
        r"""A metade que a leitura ingênua perde.

        A Meta manda `error_subcode` ao lado de `code`, e um casamento por
        `code"\s*:` acerta os dois — bastaria um subcode 4 ou 429 (valores
        comuns) para throttlar o número por um erro que não é de limite. A
        aspa antes de `code` é o que separa os dois campos.
        """
        assert is_rate_limited(RuntimeError('HTTP 400 {"error":{"code":131047,'
                                            '"error_subcode":429}}')) is False
        assert is_rate_limited(RuntimeError('HTTP 400 {"error":{"code":131047,'
                                            '"error_subcode":4}}')) is False
        # E o inverso continua valendo: o `code` de verdade ainda é lido.
        assert is_rate_limited(RuntimeError('HTTP 400 {"error":{"code":131048,'
                                            '"error_subcode":2494055}}')) is True
