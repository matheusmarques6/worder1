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


class RlsNotEnforced(RuntimeError):
    """A conexão enxerga o banco inteiro: a RLS não vale para ela."""


async def assert_rls_enforced(conn: psycopg.AsyncConnection) -> None:
    """Recusa uma conexão que a RLS não alcança. Morre alto, nunca degrada.

    `rolbypassrls` é a pergunta decisiva, não `rolsuper`: no Supabase o dono do
    DSN (`postgres`) não é superuser e mesmo assim ignora toda policy. Uma guarda
    que olhasse só para superuser passaria batido no caso real.
    """
    row = await (
        await conn.execute(
            """
            select current_user,
                   coalesce((select rolsuper from pg_roles
                              where rolname = current_user), false),
                   coalesce((select rolbypassrls from pg_roles
                              where rolname = current_user), false)
            """
        )
    ).fetchone()

    role, is_super, bypasses = row
    if not (is_super or bypasses):
        return

    raise RlsNotEnforced(
        f"o runtime conectou como '{role}', que "
        f"{'é superuser' if is_super else 'tem BYPASSRLS'} — toda leitura sem "
        "`where organization_id` vira leitura cross-org. Defina "
        "AGENTS_WORKER_SET_ROLE=worker_role e AGENTS_SENDER_SET_ROLE=sender_role "
        "(worker_role/sender_role são NOLOGIN: SET ROLE é o único caminho)."
    )


async def scope_to_organization(conn: psycopg.AsyncConnection, organization_id: UUID) -> None:
    """Escopo de tenant local à transação — a disciplina `SET LOCAL` do ADR-11."""
    await conn.execute(
        "select set_config('app.organization_id', %s, true)", (str(organization_id),)
    )
