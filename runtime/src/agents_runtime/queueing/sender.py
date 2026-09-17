"""One sender pass: claim a batch, preflight each, deliver, record each outcome.

The pass opens with the unknown sweeps and then claims. Between claim and
channel comes the preflight (decisão H): a SECURITY DEFINER function decides
opt-out → janela 24h → fallback de template, and the sender EXECUTES the
verdict — the rule lives in SQL, in one place, and a Python copy would drift.
Suppressions are terminal (`failed` with the verdict in last_error): silently
requeueing an opted-out send would retry a message that must never leave.

The channel port may raise; the classification rules of unidade 4 decide
between requeue-with-backoff and giving up. The delay is computed HERE, with
the injected randomness — the SQL applies it but never recalculates the
ladder, because a second copy of the canonical numbers is a divergence
waiting to happen.

After a delivery is recorded, the send is mirrored into the inbox tables
(`whatsapp_cloud_messages`) so the operator's screen stays alive without the
UI knowing the runtime exists. Mirror failures are swallowed by design: the
canonical record (outbox + messages) is already safe, and no mirror is worth
a crashed pass between `sent` and the next claim.

`unknown` — the process dying between the provider accepting and us recording
it — is deliberately not handled here. That transition needs the reconciler
of cenários C, where it has tests; a hand-rolled version now would be the
blind resend ADR-8 forbids.
"""

import logging
import uuid
from dataclasses import replace
from datetime import timedelta

import psycopg

from agents_runtime.channels.humanize import compute_pacing, split_into_bubbles
from agents_runtime.channels.port import ChannelPort, before_the_provider
from agents_runtime.channels.template_components import TemplateParametersMissing
from agents_runtime.clock import Clock, SystemClock
from agents_runtime.config import QueueingConfig
from agents_runtime.obs.telemetry import annotate, span
from agents_runtime.queueing.backoff import delay_for
from agents_runtime.queueing.failures import Failure, classify, is_rate_limited
from agents_runtime.randomness import Randomness
from agents_runtime.repository import engine
from agents_runtime.repository.outbox import ClaimedSend
from agents_runtime.repository.scope import scope_to_organization

logger = logging.getLogger(__name__)

#: A voz do `BLOCK_MESSAGES` do TS (`send-guard.ts:67-70`), porque é a mesma
#: pausa vista do mesmo lado — o operador que lê o inbox não deveria aprender
#: duas redações para o mesmo acontecimento. O prazo é acrescentado pelo
#: chamador: "pausado" sem dizer até quando é metade do recado.
_HOLD_DETAIL = {
    "circuit_open": "Envio pausado: muitas falhas seguidas nesta conta do WhatsApp",
    "throttled": "Envio pausado: a Meta sinalizou excesso de envios nesta conta",
}


async def _report_to_guard(
    conn: psycopg.AsyncConnection, send: ClaimedSend, error: BaseException | None
) -> None:
    """O desfecho de UMA chamada ao Graph volta para o breaker do número.

    Fail-open como o resto do guard (ruling D): um relato que não grava custa
    reação mais lenta; uma exceção aqui custaria o envio que já saiu.
    """
    if send.channel_type != "whatsapp" or not send.channel_external_id:
        return
    if error is not None and before_the_provider(error):
        # Ruling U(a): a falha morreu antes de qualquer contato com a Meta —
        # credencial que não abre, payload malformado. É bug nosso, e contá-lo
        # aqui abriria o circuito de uma conta perfeitamente saudável: cinco
        # payloads ruins e a loja fica 30 s muda por nossa causa. A escada de
        # retentativa continua tratando a mensagem; só o NÚMERO fica de fora.
        return
    try:
        await engine.send_guard_report(
            conn,
            send.channel_external_id,
            success=error is None,
            rate_limited=error is not None and is_rate_limited(error),
        )
    except psycopg.Error:
        logger.warning("send-guard: desfecho não registrado", exc_info=True)


async def _mark_read_and_typing(
    channel: ChannelPort, conn: psycopg.AsyncConnection, send: ClaimedSend
) -> None:
    """Item 38: leitura + "digitando" antes de UMA bolha — mesmo POST que o
    TS dispara em `cloud-sender.ts:257-283`, cada vez com o wamid do último
    inbound (`send.last_inbound_wamid`).

    Ruling D: sem wamid não sai nada — nem read nem typing. A linha proibida
    em `humanize.py` (nada de typing falso) continua de pé; isto só dispara
    quando há um wamid real para se apoiar.

    Ruling C: adereço, nunca causa de morte do turno — mesmo padrão de
    `note_step`/`_recorder` em `agent_core/responder.py` (try/except com
    `logger.debug(..., exc_info=True)`, nunca propaga).
    """
    if send.channel_type != "whatsapp" or not send.last_inbound_wamid:
        return
    try:
        await channel.mark_read_and_typing(conn, send)
    except Exception as error:
        await _report_to_guard(conn, send, error)
        logger.debug("mark-read/typing falhou", exc_info=True)
    else:
        await _report_to_guard(conn, send, None)


async def _send_reporting(
    channel: ChannelPort, conn: psycopg.AsyncConnection, send: ClaimedSend
) -> str:
    """Uma chamada ao Graph, um relato (ruling N).

    Por CHAMADA e não por linha porque é a chamada que a Meta conta e é ela que
    falha: com três bolhas, a 2ª recusada deixa a linha `sent` — o que saiu
    vale — e ainda assim a conta acabou de recusar, coisa que um relato por
    linha não veria.
    """
    try:
        wamid = await channel.send(conn, send)
    except BaseException as error:
        await _report_to_guard(conn, send, error)
        raise
    await _report_to_guard(conn, send, None)
    return wamid


async def send_humanized(
    channel: ChannelPort,
    conn: psycopg.AsyncConnection,
    send: ClaimedSend,
    *,
    humanize_delays: bool,
    clock: Clock,
    split: bool = True,
) -> list[tuple[str, str]]:
    """Entrega UMA linha da outbox como bolhas (8.3/D10). Devolve os pares
    (wamid, texto) que SAÍRAM, na ordem.

    A semântica de falha é a do legado, que já era ADR-8 avant la lettre:
    a 1ª bolha falhou = nada saiu = a exceção sobe e a escada normal decide
    retry; uma bolha SEGUINTE falhou = o que saiu VALE — aborta o resto e
    nunca re-tenta, porque re-entregar a linha repetiria as bolhas 1..k na
    tela do cliente.
    """
    text = send.payload.get("text")
    if isinstance(text, str) and not split:
        # Knob da loja desligado (settings.delivery): uma bolha só, inteira.
        bubbles = [text.strip()] if text.strip() else []
    else:
        bubbles = split_into_bubbles(text) if isinstance(text, str) else []

    # Fix round 1 (review do item 38, Minor 1 e 2) — dois pontos onde o
    # runtime divergia do TS em silêncio, agora alinhados:
    #   1. `sendHumanizedReply` (`cloud-sender.ts`) só existe para resposta
    #      TEXTUAL de IA — template sai por rota TS própria que nunca chama
    #      `sendTyping`. `bubbles` vazio é exatamente "não é bolha de
    #      texto" (template ou payload sem `text`), então o gate exclui esse
    #      ramo do disparo.
    #   2. `cloud-sender.ts:257` dispara typing sob `!skipDelays &&
    #      inboundMessageId` — o mesmo knob que desliga o ritmo desliga o
    #      typing junto. `humanize_delays` é esse knob aqui.
    # Alinhado ao TS nos dois pontos; não é "melhor" nem YAGNI — é paridade.
    fire_presence = bool(bubbles) and humanize_delays

    if len(bubbles) <= 1:
        # Template, payload não-texto ou bolha única: um envio, como sempre.
        if fire_presence:
            await _mark_read_and_typing(channel, conn, send)
        wamid = await _send_reporting(channel, conn, send)
        body = bubbles[0] if bubbles else None
        return [(wamid, body)] if body is not None else [(wamid, "")]

    pacing = compute_pacing(bubbles, enabled=humanize_delays)
    delivered: list[tuple[str, str]] = []
    for index, bubble in enumerate(bubbles):
        delay_ms = pacing.delays_ms[index]
        if delay_ms:
            await clock.sleep(delay_ms / 1000)
        if fire_presence:
            await _mark_read_and_typing(channel, conn, send)
        try:
            wamid = await _send_reporting(channel, conn, replace(send, payload={"text": bubble}))
        except Exception:
            if index == 0:
                raise
            logger.warning(
                "bolha falhou no meio; o que saiu vale, sem re-envio",
                extra={
                    "outbox_id": str(send.outbox_id),
                    "delivered": len(delivered),
                    "of": len(bubbles),
                },
            )
            break
        delivered.append((wamid, bubble))
    return delivered


async def sender_pass(
    conn: psycopg.AsyncConnection,
    channel: ChannelPort,
    *,
    config: QueueingConfig,
    randomness: Randomness,
    clock: Clock | None = None,
    limit: int = 50,
) -> int:
    """Returns how many sends were attempted — the pass's only observable."""
    clock = clock or SystemClock()
    token = uuid.uuid4()
    batch = await engine.claim_outbox_batch(
        conn, token, lease=config.send_lease, limit=limit
    )

    async def deliver(send: ClaimedSend) -> None:
        # Preflight só para WhatsApp: opt-out e janela de 24h são regras desse
        # canal. Os adapters de email/instagram chegam com as suas próprias.
        if send.channel_type == "whatsapp":
            preflight = await engine.sender_preflight(
                conn,
                send.organization_id,
                send.to_phone_e164,
                send.kind,
                moment_ids=send.moment_ids,
            )
            if preflight.suppressed:
                recorded = await engine.mark_outbox_failed(
                    conn,
                    send.outbox_id,
                    token,
                    transient=False,
                    error=f"preflight: {preflight.verdict}",
                    retry_in=timedelta(0),
                )
                if not recorded:
                    # Item 47. `false` aqui NÃO é a supressão que falhou em
                    # segurar a mensagem — supressão é decisão, e ela já foi
                    # tomada acima: nada sai deste `deliver()` de qualquer
                    # jeito. O que se perde é o MOTIVO: o `failed` com
                    # `preflight: {verdict}` não entrou. Onde a linha ficou, o
                    # booleano não diz — só diz que ela já NÃO está 'sending'
                    # com o nosso token, e nenhum escritor a deixaria assim
                    # (o claim só sai de 'pending'), então ela está em
                    # 'unknown', 'manual_review', 'sent' ou 'failed', com o
                    # `last_error` de quem chegou antes de nós. Em qualquer um
                    # deles, quem abrir o painel lê outra coisa no lugar de
                    # "opt-out" ou "fora da janela de 24h", e vai investigar
                    # uma mensagem que o sistema decidiu não mandar, de
                    # propósito. `warning`, não `error`: nenhuma entrega se
                    # perde, só a explicação dela.
                    logger.warning(
                        "supressão do preflight não registrada; o motivo se perde",
                        extra={
                            "outbox_id": str(send.outbox_id),
                            "verdict": preflight.verdict,
                        },
                    )
                if preflight.moment_failure:
                    # §3.3.4: falha de momento é "alerta + supressão" — o
                    # lojista precisa saber que o toque dele não está saindo.
                    await engine.alert_moment_suppression(
                        conn,
                        organization_id=send.organization_id,
                        outbox_id=send.outbox_id,
                        verdict=preflight.verdict,
                        moment_ids=send.moment_ids,
                    )
                annotate(outcome=f"suppressed:{preflight.verdict}")
                return
            if preflight.verdict == "template":
                # Janela fechada + toque de funil: o que sai é o template
                # aprovado da org, nunca o texto livre que o payload carregava.
                send = replace(
                    send,
                    payload={
                        "template": {
                            "name": preflight.template_name,
                            "language": preflight.template_language,
                        }
                    },
                )

        # Send-guard (item 32), DEPOIS do preflight e ANTES de qualquer envio.
        # Depois porque as supressões do preflight são terminais e devem morrer
        # em vez de voltar para a fila; e porque o rebaixamento para template já
        # aconteceu — um template é um envio como outro qualquer, e segurá-lo
        # também é o ponto.
        #
        # UMA checagem por LINHA (ruling N), não por bolha: checar entre bolhas
        # abriria o caso de bloquear no meio de uma mensagem já parcialmente
        # entregue, e aí ou repetimos bolha ou engolimos o resto. Parar na
        # fronteira da linha para a tempestade do mesmo jeito.
        if send.channel_type == "whatsapp" and send.channel_external_id:
            hold = None
            try:
                hold = await engine.send_guard_check(conn, send.channel_external_id)
            except psycopg.Error:
                # Fail-open (ruling D, `send-guard.ts:21`): indisponibilidade da
                # infra do guard PERMITE o envio e loga. O breaker aberto é
                # decisão tomada; isto aqui é ausência de resposta, e ausência
                # nunca pode calar a loja.
                logger.warning("send-guard indisponível; envio liberado", exc_info=True)
            if hold is not None:
                held_for = round(hold.retry_after.total_seconds())
                requeued = await engine.mark_outbox_failed(
                    conn,
                    send.outbox_id,
                    token,
                    # Transitório: a linha VOLTA para a fila, e volta quando o
                    # número voltar — o atraso é o da janela do guard, não o da
                    # escada de backoff, que é sobre outra coisa.
                    transient=True,
                    # Requisito 2: quem opera precisa distinguir "a Meta
                    # recusou" de "nós seguramos".
                    error=(
                        f"send-guard: {hold.reason} — nós seguramos o envio por"
                        f" {held_for}s (não foi recusa da Meta)"
                    ),
                    retry_in=hold.retry_after,
                )
                if not requeued:
                    # Item 47, o pior dos quatro: PERDA SILENCIOSA DE MENSAGEM.
                    # O `transient=True` acima é o que devolve a linha para a
                    # fila — `status='pending'` mais o `next_attempt_at` da
                    # janela do guard. Com `false`, nada disso foi gravado, e a
                    # linha já não está 'sending' com o nosso token — os
                    # estados que sobram para ela são 'unknown',
                    # 'manual_review', 'sent' ou 'failed', e NENHUM deles volta
                    # para 'pending'. Isso não é dedução sobre um percurso: dos
                    # treze `update internal.message_outbox` das migrations, o
                    # único que escreve 'pending' é o ramo transitório desta
                    # mesma função — o que acabou de falhar.
                    # E aqui, diferente do carimbo de sucesso, não há webhook
                    # de resgate possível: nós SEGURAMOS o envio, a mensagem
                    # nunca chegou à Meta nesta tentativa, logo não existe
                    # status para correlacionar. O lojista vê uma resposta que
                    # ele acha enfileirada e que simplesmente nunca sai, e o
                    # chip do inbox logo abaixo passa a dizer isso em vez de
                    # prometer retomada. `error` é o único nível honesto aqui.
                    logger.error(
                        "envio segurado não voltou para a fila; a mensagem morre aqui",
                        extra={
                            "outbox_id": str(send.outbox_id),
                            "reason": hold.reason,
                            "held_for_s": held_for,
                        },
                    )
                # Ruling V: um envio segurado por dez minutos não pode ser
                # invisível no painel — isto é atraso, não silêncio, e é o
                # mesmo precedente que o item 31 abriu para a degradação de
                # mídia. Adereço de UI, nunca motivo de falha.
                #
                # Item 47, fix round 2: o passo depende do `requeued`, e esta é
                # a mentira que MAIS custa das que o item achou. As outras eram
                # de span — `annotate` é no-op sem SDK OTel, e o Logfire está
                # desligado no piloto, então elas são latentes. Esta grava no
                # banco (`whatsapp_ai_run_steps`) e o inbox a lê por Realtime:
                # é a única coisa que a pessoa que atende vê sobre esta linha.
                # `started` é NÃO-terminal e promete que a linha VAI sair
                # quando a janela passar; com o reagendamento recusado ela não
                # vai, e o painel some sozinho em 2 min (`AgentActivity.tsx`,
                # STALE_AFTER_MS) deixando o silêncio que o item 47 descreve.
                # `failed` é terminal, pinta de vermelho e FICA — que é o
                # recado certo: ninguém vai retomar isto sozinho. É o mesmo
                # `step` que a falha permanente do canal emite no fim desta
                # mesma função, e reusá-lo não é economia de vocabulário: é o
                # que faz o conserto funcionar. `isTerminalAiRunStep`
                # (`run-steps-shared.ts:50-56`) trata passo DESCONHECIDO como
                # não-terminal de propósito, então um valor novo — `held`,
                # `stuck`, o que for — cairia no mesmo buraco de 2 min que
                # estamos fechando aqui. Quem for "simplificar" isto de volta
                # para um `step` fixo: é essa linha que você vai reabrir.
                paused = _HOLD_DETAIL.get(hold.reason, "Envio pausado")
                try:
                    await engine.emit_ai_run_step(
                        conn,
                        organization_id=send.organization_id,
                        run_id=uuid.uuid4(),
                        step="started" if requeued else "failed",
                        detail=(
                            f"{paused} — retomando em {held_for}s"
                            if requeued
                            else f"{paused} — e o reagendamento não foi"
                            " registrado: esta resposta não sai sozinha"
                        ),
                        phone=send.to_phone_e164,
                        channel_account_id=send.channel_account_id,
                    )
                except psycopg.Error:
                    pass
                # `held:` é uma promessa de NÃO-terminalidade: "pausado, volta
                # quando a janela passar". Com `requeued` falso essa promessa é
                # exatamente a mentira que o `outcome="sent"` incondicional era,
                # só que sobre o caso grave em vez do benigno — o span diria
                # "atraso" sobre a linha que morre. O `suppressed:{verdict}` do
                # preflight e o `failed` seco do classificador não precisam do
                # mesmo cuidado: eles descrevem o que o SENDER fez, e continuam
                # verdadeiros tenha o banco registrado ou não. Este descreve o
                # que a linha VAI fazer, e é o registro que decide isso.
                annotate(
                    outcome=f"held:{hold.reason}" if requeued
                    else f"held:{hold.reason}:not_requeued"
                )
                return

        # Chip de progresso no chat (pedido 17/08) — adereço de UI, nunca
        # motivo de falha do envio.
        if send.channel_type == "whatsapp":
            try:
                await engine.emit_ai_run_step(
                    conn,
                    organization_id=send.organization_id,
                    run_id=uuid.uuid4(),
                    step="sending",
                    detail="Enviando resposta",
                    phone=send.to_phone_e164,
                    channel_account_id=send.channel_account_id,
                )
            except psycopg.Error:
                pass

        flags = send.payload.get("humanize")
        flags = flags if isinstance(flags, dict) else {}
        try:
            delivered = await send_humanized(
                channel,
                conn,
                send,
                humanize_delays=config.humanize_delays and flags.get("rhythm") is not False,
                clock=clock,
                split=flags.get("split") is not False,
            )
        except Exception as error:  # the classifier is the policy
            failure = classify(error)
            transient = failure is not Failure.PERMANENT
            recorded = await engine.mark_outbox_failed(
                conn,
                send.outbox_id,
                token,
                transient=transient,
                error=str(error)[:500],
                retry_in=delay_for(
                    send.attempt_count, config=config, randomness=randomness
                ),
            )
            if not recorded and transient:
                # Item 47: mesmo mecanismo do hold do guard — sem o `pending`
                # e o `next_attempt_at`, a retentativa que esta falha pedia
                # deixa de existir e ninguém a retoma. A diferença com o
                # `:292` é que aqui a 1ª bolha CHEGOU a ser tentada, então
                # existe a chance de um webhook de status da Meta correlacionar
                # a linha mais tarde — chance, não garantia, e só se o POST
                # tiver saído. `error` porque o caso provável continua sendo
                # uma resposta que nunca é reentregue.
                logger.error(
                    "falha transitória não registrada; a retentativa se perde",
                    extra={"outbox_id": str(send.outbox_id), "attempt": send.attempt_count},
                )
            elif not recorded:
                # Falha permanente: a linha não fica 'failed' com o motivo, e
                # o operador perde a única frase que explicava ao lojista por
                # que a resposta não saiu. Não há entrega em jogo (a falha é
                # definitiva de qualquer modo), então `warning`.
                logger.warning(
                    "falha permanente não registrada; o motivo se perde",
                    extra={"outbox_id": str(send.outbox_id)},
                )
            # `outcome="failed"` continua verdadeiro nos dois ramos: ele
            # descreve a TENTATIVA, que falhou de fato. O que o `false` acima
            # nega é o registro dela, e isso agora está no log — não no span.
            annotate(outcome="failed")
            if isinstance(error, TemplateParametersMissing):
                # Item 34, ruling B: a recusa não pode ser um sumiço. O
                # `failed` abaixo diz "falha no envio" e nada mais — que é o
                # certo para a Meta caindo, e o errado para um fallback que a
                # PRÓPRIA loja configurou pedindo uma variável que ninguém
                # preenche. Esse conserto é dela, e o alerta é como ela fica
                # sabendo. Mesmo lugar e mesmo espírito do alerta de supressão
                # de momento, alguns blocos acima.
                try:
                    await engine.alert_template_not_fillable(
                        conn,
                        organization_id=send.organization_id,
                        outbox_id=send.outbox_id,
                        template_name=str(send.payload.get("template", {}).get("name") or "?"),
                        reason=str(error)[:500],
                    )
                except psycopg.Error:
                    logger.warning("alerta de template não registrado", exc_info=True)
            if send.channel_type == "whatsapp" and failure is Failure.PERMANENT:
                try:
                    await engine.emit_ai_run_step(
                        conn,
                        organization_id=send.organization_id,
                        run_id=uuid.uuid4(),
                        step="failed",
                        detail="Falha no envio da resposta",
                        phone=send.to_phone_e164,
                        channel_account_id=send.channel_account_id,
                    )
                except psycopg.Error:
                    pass
            return

        # O wamid da linha é o da 1ª bolha — paridade com o legado, e é
        # ele que o webhook de status correlaciona primeiro.
        recorded = await engine.mark_outbox_sent(conn, send.outbox_id, token, delivered[0][0])
        if not recorded:
            async with conn.transaction():
                await scope_to_organization(conn, send.organization_id)
                recorded = await engine.confirm_sender_delivery(
                    conn, send.outbox_id, token, delivered[0][0]
                )
        if not recorded:
            # Item 47. Tudo o que este booleano sabe: a linha já não estava
            # 'sending' com o NOSSO token. Quem a mudou, ele não diz — e não
            # dá para deduzir daqui sem um `select` extra. As possibilidades,
            # sem afirmar qual ocorreu: o webhook de status (item 10) já
            # gravou 'sent' enquanto as bolhas 2..4 ainda eram ritmadas; o
            # mesmo webhook gravou 'failed' porque a Meta recusou a 1ª bolha;
            # a sweep de lease vencida gravou 'unknown'; ou a revisão desses
            # 'unknown' já escalou para 'manual_review'.
            #
            # `info` pelo DANO de cada caminho, não pela frequência deles —
            # que ninguém aqui mediu. Em três dos quatro a linha ficou com uma
            # verdade melhor do que a nossa: 'sent'/'failed' gravados por quem
            # viu a evidência da Meta, ou 'unknown', que é o estado honesto do
            # ADR-8 e que o webhook resgata. Só o quarto é perda, e ele tem
            # item próprio no checklist. `error` em todo envio para alarmar
            # sobre estados corretos seria o alarme falso que o item 47 quase
            # criou. Mesma decisão que `webhook-processor.ts:779-788` tomou
            # para o gêmeo deste booleano do lado TS — a diferença que impede
            # copiar a classificação sem pensar é que lá `false` NUNCA é perda
            # e aqui um dos ramos é.
            #
            # Isto é revisável: contar quantos `false` caem em cada estado num
            # banco vivo é o que diria se o nível certo é `debug` (se o caminho
            # benigno domina) ou se o item 79 é rotina e não cauda.
            logger.info(
                "outbox já não estava 'sending' com o nosso token; o estado é de outro escritor",
                extra={"outbox_id": str(send.outbox_id), "bubbles": len(delivered)},
            )
        # O span tem de dizer o que o BANCO registrou. Até aqui isto disparava
        # sem guarda na linha seguinte ao carimbo, então `outcome="sent"`
        # SUPERCONTA: afirmava sucesso mesmo quando o banco recusou.
        annotate(outcome="sent" if recorded else "sent:not_recorded")
        # Espelho no inbox: CADA bolha vira uma linha, na ordem — só
        # texto (um template não tem corpo renderizado aqui, e espelhar
        # um chute mentiria para o operador).
        if send.channel_type == "whatsapp" and "text" in send.payload:
            for wamid, bubble in delivered:
                if not bubble:
                    continue
                try:
                    await engine.mirror_outbound_to_inbox(
                        conn,
                        send.organization_id,
                        send.to_phone_e164,
                        wamid,
                        bubble,
                        channel_account_id=send.channel_account_id,
                    )
                except psycopg.Error:
                    # O canônico já registrou o envio; o espelho se
                    # recupera no próximo inbound (sync webhook → inbox).
                    pass
        if send.channel_type == "whatsapp":
            try:
                await engine.emit_ai_run_step(
                    conn,
                    organization_id=send.organization_id,
                    run_id=uuid.uuid4(),
                    step="sent",
                    detail="Resposta enviada",
                    phone=send.to_phone_e164,
                    channel_account_id=send.channel_account_id,
                )
            except psycopg.Error:
                pass

    for send in batch:
        # O span do envio RETOMA o trace do turno (otel da linha de outbox,
        # 9.1b): turno e envio são a mesma história, da fila ao wamid.
        with span(
            "send",
            remote=send.otel,
            remote_role="parent",
            organization_id=send.organization_id,
            channel=send.channel_type,
            kind=send.kind,
        ):
            await deliver(send)

    return len(batch)
