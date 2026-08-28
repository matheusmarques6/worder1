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
"""

from typing import Protocol

from agents_runtime.repository.outbox import ClaimedSend


class ChannelPort(Protocol):
    """Deliver one message; return the provider's id for it.

    Raise to signal failure — the sender classifies the exception (transient
    versus permanent, unidade 4) and decides between retry and giving up. The
    port itself never retries: retrying here would stack on top of the
    sender's backoff and multiply attempts invisibly.
    """

    async def send(self, send: ClaimedSend) -> str: ...
