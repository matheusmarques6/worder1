"""A linha reivindicada da outbox — o formato que o banco devolve ao sender.

Mora aqui, e não em `channels.port`, porque é um DADO DO BANCO: `ClaimedSend` é
exatamente uma linha de `internal.claim_outbox_batch`, montada em
`repository.engine` e só então entregue a um canal. O canal a consome; não a
produz.

A trava de fronteira encontrou isso duas vezes. Na primeira (S9), `engine`
importava `channels.port` para tipar o retorno do claim, então qualquer módulo
que importasse `engine` alcançava `channels` por tabela; o conserto de então
moveu `scope_to_organization` para `repository.scope` — tratou o sintoma, e o
import de `engine` para `channels` continuou de pé. Na segunda (28/08), o
responder passou a importar `engine` para os chips de progresso e a mesma
cadeia reprovou de novo: `agent_core.responder -> repository.engine ->
channels.port`. O contrato ficou vermelho em 15 execuções seguidas do CI.

Desta vez a seta foi invertida na origem: o dado vive no repository, e
`channels` importa dele. Um canal precisa conhecer a linha que vai enviar;
o banco não precisa conhecer canal nenhum.
"""

from dataclasses import dataclass
from typing import Any
from uuid import UUID


@dataclass(frozen=True, slots=True)
class ClaimedSend:
    """One row from `claim_outbox_batch` — everything a send needs, no second query."""

    outbox_id: UUID
    organization_id: UUID
    channel_type: str
    channel_external_id: str
    to_phone_e164: str
    payload: dict[str, Any]
    idempotency_key: str
    attempt_count: int
    # Alimenta o preflight: janela fechada suprime um 'reply' mas rebaixa um
    # toque de funil para template. Default para os construtores pré-preflight.
    kind: str = "reply"
    # Toque de momento: o preflight re-checa vida + template_readiness de cada
    # um a cada envio (§3.3.4). Vazio = envio sem momento.
    moment_ids: tuple[UUID, ...] = ()
    # Carrier W3C do turno que gerou a linha (9.1b): o sender retoma o trace
    # como PARENT — turno e envio são a mesma história no Logfire.
    otel: dict[str, Any] | None = None
