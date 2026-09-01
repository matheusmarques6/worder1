"""Uma conexão de mentira que só anota o que lhe pediram.

Existe por causa do item 32: `send_humanized` passou a relatar ao send-guard o
desfecho de CADA chamada ao Graph, então ela fala com o banco — e os testes de
unidade dela, que antes passavam `None` no lugar da conexão, precisam de algo
que aceite um `execute`.

Anotar em vez de ignorar é de propósito: com a lista de chamadas na mão, o
nível de unidade também consegue provar que o relato é por CHAMADA e não por
linha (ruling N), sem subir até o banco.
"""

from typing import Any


class RecordingConnection:
    """Aceita `execute` e guarda `(sql, params)`. Nada mais."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple]] = []

    async def execute(self, sql: str, params: tuple = ()) -> Any:
        self.calls.append((sql, params))
        return self

    def guard_reports(self) -> list[tuple[str, bool, bool]]:
        """Só os relatos ao send-guard: `(phone_number_id, sucesso, excesso)`."""
        return [
            params for sql, params in self.calls if "internal.send_guard_report" in sql
        ]
