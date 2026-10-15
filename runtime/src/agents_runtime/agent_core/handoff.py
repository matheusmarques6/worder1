"""Tirar a IA de cena — o único lugar que faz isso (alteração 2026-10-15-06).

Movido de `responder.py` sem mudança de comportamento para que a ferramenta
`transfer_to_human` (`tools/builtin.py`), o responder e o toucher usem a
MESMA função: a marca no espelho legado (`internal.mark_ai_handoff`), o
alerta deduplicado e o booleano que diz se a marca pegou.
"""

from typing import Any
from uuid import UUID

from agents_runtime.repository import agent as agent_repo
from agents_runtime.repository import alerts as alerts_repo
from agents_runtime.repository import outcomes as outcomes_repo
from agents_runtime.repository.scope import scope_to_organization

#: O que o passo e o título dizem quando a marca NÃO pegou. A transferência
#: mora no espelho legado, a dois saltos sem FK da canônica: conversa sem
#: identidade WhatsApp, ou sem linha no espelho, não pega a marca.
UNMIRRORED_DETAIL = " — a IA não foi desligada (conversa sem espelho no inbox)"


async def transfer_to_human(
    conn: Any,
    *,
    organization_id: UUID,
    conversation_id: UUID,
    reason: str,
    severity: str,
    title: str,
    payload: dict,
    channel_account_id: UUID | None = None,
) -> bool:
    """Tira a IA de cena e registra — devolvendo se a marca PEGOU.

    Um lugar só para os dois (três, com o toque) call sites, porque o defeito
    era justamente ninguém ler o booleano: `mark_ai_handoff` devolve false
    quando não há espelho onde escrever, e nesse caso `ai_enabled` continua
    true, o webhook não cancela nada, e a transferência não vale para os
    turnos seguintes. O alerta que dissesse "IA transferida" assim mesmo faria
    a operação acreditar numa transferência que não aconteceu.

    O alerta é deduplicado por conversa, motivo e SE A MARCA PEGOU: sem
    transferência efetiva o mesmo assunto pode reincidir a cada turno, e um
    `critical` novo por mensagem seria um alarme que ninguém consegue ler —
    mas deixar `mirrored` fora da chave fazia um `warning` ainda aberto engolir
    o `critical` "a IA não foi desligada". Dedup que suprime na direção da
    escalação está invertido, e nesse caso o alerta é o ÚNICO registro que
    sobra: o passo `transferred` não espelha pelo mesmo motivo que a marca não
    pegou.
    """
    async with conn.transaction():
        await scope_to_organization(conn, organization_id)
        # Desliga a IA no espelho legado — é o freio que o webhook já respeita
        # para org migrada, então a transferência vale para os turnos
        # seguintes, não só para este.
        marked = await agent_repo.mark_ai_handoff(
            conn,
            organization_id=organization_id,
            conversation_id=conversation_id,
            reason=reason,
            channel_account_id=channel_account_id,
        )
        await alerts_repo.open_alert(
            conn,
            organization_id=organization_id,
            type=alerts_repo.HANDOFF,
            # Marca que não pegou é sempre grave: alguém precisa desligar a IA
            # na mão, e ninguém vai saber disso por outro caminho.
            severity=severity if marked else "critical",
            title=title if marked else title + UNMIRRORED_DETAIL,
            payload={
                **payload,
                "conversation_id": str(conversation_id),
                "reason": reason,
                "mirrored": marked,
            },
            dedup_key=(
                f"handoff:{reason}:{'mirrored' if marked else 'unmirrored'}:{conversation_id}"
            ),
        )
    # Alteração 2026-10-15-14: a transferência é desfecho e é evento da
    # aba Atividade. Telemetria de produto: nunca muda o resultado acima.
    try:
        async with conn.transaction():
            await scope_to_organization(conn, organization_id)
            code = outcomes_repo.handoff_code(reason)
            await outcomes_repo.mark(
                conn, organization_id=organization_id, conversation_id=conversation_id,
                transferred_reason=code,
            )
            await outcomes_repo.record_event(
                conn, organization_id=organization_id, kind="handoff",
                conversation_id=conversation_id, text=title,
                metadata={"reason": code, "mirrored": marked},
            )
    except Exception:
        pass
    return marked
