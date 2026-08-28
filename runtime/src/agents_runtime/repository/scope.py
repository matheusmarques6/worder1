"""O escopo de tenant — a única linha de SQL que todo módulo precisa dizer.

Mora sozinha, longe do motor, por uma razão que a trava de fronteira encontrou
sozinha no S9: `repository.engine` importava `channels.port` (a outbox
reivindicada é um `ClaimedSend`), então **qualquer** módulo que importasse
`engine` para pegar `scope_to_organization` passava a alcançar `channels` por
tabela — e o contrato "nada chama a API do WhatsApp exceto os senders" reprovou
o `agent_core` na hora em que o responder real nasceu.

O conserto não foi afrouxar o contrato: foi reconhecer que escopar um tenant não
tem nada a ver com o motor. `engine` reexporta o nome para que nenhum chamador
antigo mude.

Nota (28/08): aquele conserto tratou o sintoma — o import de `engine` para
`channels` seguiu de pé e reprovou de novo assim que o responder precisou de
`engine` para os chips de progresso. A causa foi removida movendo `ClaimedSend`
para `repository.outbox`. Este módulo continua valendo por si: escopo de tenant
não é assunto do motor.
"""

from uuid import UUID

import psycopg


async def scope_to_organization(conn: psycopg.AsyncConnection, organization_id: UUID) -> None:
    """Escopo de tenant local à transação — a disciplina `SET LOCAL` do ADR-11."""
    await conn.execute(
        "select set_config('app.organization_id', %s, true)", (str(organization_id),)
    )
