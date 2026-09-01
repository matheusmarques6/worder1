"""The channel port — the one door out of the platform.

Everything the engine knows about WhatsApp fits in this file: a claimed send
goes in, a provider message id comes out. The real adapters (Cloud API,
Evolution) implement this in E1's final stretch; the pipeline suite implements
it with a fake that records into the database.

Nothing outside `channels` may call a provider API — that is the import-linter
contract, and this protocol is why nobody needs to.

`ClaimedSend` mora em `repository.outbox`: é a linha que o banco devolve, e o
canal apenas a consome. O import aponta para lá, nunca o contrário — ver a
docstring de `repository/outbox.py` para as duas vezes que a seta invertida
reprovou no CI.

`conn` (auditoria 2026-08-28, item 20): a credencial por conta mora no banco
agora, então `send` recebe a MESMA conexão scoped/role'd que `sender_pass` já
abre (`agents_runtime.app._connect`), em vez de o canal abrir a sua própria —
"só o repository fala com psycopg" (pyproject `[tool.importlinter]`) proíbe um
canal de conectar por conta própria, e reabrir uma conexão por envio seria uma
segunda cópia da checagem de RLS que `assert_rls_enforced` já faz uma vez, no
único lugar onde o processo nasce.
"""

from typing import Protocol

import psycopg

from agents_runtime.repository.outbox import ClaimedSend


class ChannelPort(Protocol):
    """Deliver one message; return the provider's id for it.

    Raise to signal failure — the sender classifies the exception (transient
    versus permanent, unidade 4) and decides between retry and giving up. The
    port itself never retries: retrying here would stack on top of the
    sender's backoff and multiply attempts invisibly.
    """

    async def send(self, conn: psycopg.AsyncConnection, send: ClaimedSend) -> str: ...
