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
from agents_runtime.channels.port import ChannelPort, ClaimedSend
from agents_runtime.clock import Clock, SystemClock
from agents_runtime.config import QueueingConfig
from agents_runtime.obs.telemetry import annotate, span
from agents_runtime.queueing.backoff import delay_for
from agents_runtime.queueing.failures import Failure, classify
from agents_runtime.randomness import Randomness
from agents_runtime.repository import engine

logger = logging.getLogger(__name__)


async def send_humanized(
    channel: ChannelPort,
    send: ClaimedSend,
    *,
    humanize_delays: bool,
    clock: Clock,
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
    bubbles = split_into_bubbles(text) if isinstance(text, str) else []
    if len(bubbles) <= 1:
        # Template, payload não-texto ou bolha única: um envio, como sempre.
        wamid = await channel.send(send)
        body = bubbles[0] if bubbles else None
        return [(wamid, body)] if body is not None else [(wamid, "")]

    pacing = compute_pacing(bubbles, enabled=humanize_delays)
    delivered: list[tuple[str, str]] = []
    for index, bubble in enumerate(bubbles):
        delay_ms = pacing.delays_ms[index]
        if delay_ms:
            await clock.sleep(delay_ms / 1000)
        try:
            wamid = await channel.send(replace(send, payload={"text": bubble}))
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
    # House-keeping before claiming: a dead sender's 'sending' rows become
    # unknown (state only, NEVER a resend), and unknowns past the review
    # window go to a human. Running here covers the startup case for free —
    # the first pass of a fresh process is the sweep-at-boot.
    await engine.sweep_outbox_unknown(conn)
    await engine.review_stale_unknown(conn, review_after=config.unknown_review_after)
    await engine.expire_incentive_grants(conn)

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
                await engine.mark_outbox_failed(
                    conn,
                    send.outbox_id,
                    token,
                    transient=False,
                    error=f"preflight: {preflight.verdict}",
                    retry_in=timedelta(0),
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
                )
            except psycopg.Error:
                pass

        try:
            delivered = await send_humanized(
                channel, send, humanize_delays=config.humanize_delays, clock=clock
            )
        except Exception as error:  # the classifier is the policy
            failure = classify(error)
            await engine.mark_outbox_failed(
                conn,
                send.outbox_id,
                token,
                transient=failure is not Failure.PERMANENT,
                error=str(error)[:500],
                retry_in=delay_for(
                    send.attempt_count, config=config, randomness=randomness
                ),
            )
            annotate(outcome="failed")
            if send.channel_type == "whatsapp" and failure is Failure.PERMANENT:
                try:
                    await engine.emit_ai_run_step(
                        conn,
                        organization_id=send.organization_id,
                        run_id=uuid.uuid4(),
                        step="failed",
                        detail="Falha no envio da resposta",
                        phone=send.to_phone_e164,
                    )
                except psycopg.Error:
                    pass
            return

        # O wamid da linha é o da 1ª bolha — paridade com o legado, e é
        # ele que o webhook de status correlaciona primeiro.
        await engine.mark_outbox_sent(conn, send.outbox_id, token, delivered[0][0])
        annotate(outcome="sent")
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
