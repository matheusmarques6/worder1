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

import uuid
from dataclasses import replace
from datetime import timedelta

import psycopg

from agents_runtime.channels.port import ChannelPort
from agents_runtime.config import QueueingConfig
from agents_runtime.queueing.backoff import delay_for
from agents_runtime.queueing.failures import Failure, classify
from agents_runtime.randomness import Randomness
from agents_runtime.repository import engine


async def sender_pass(
    conn: psycopg.AsyncConnection,
    channel: ChannelPort,
    *,
    config: QueueingConfig,
    randomness: Randomness,
    limit: int = 50,
) -> int:
    """Returns how many sends were attempted — the pass's only observable."""
    # House-keeping before claiming: a dead sender's 'sending' rows become
    # unknown (state only, NEVER a resend), and unknowns past the review
    # window go to a human. Running here covers the startup case for free —
    # the first pass of a fresh process is the sweep-at-boot.
    await engine.sweep_outbox_unknown(conn)
    await engine.review_stale_unknown(conn, review_after=config.unknown_review_after)

    token = uuid.uuid4()
    batch = await engine.claim_outbox_batch(
        conn, token, lease=config.send_lease, limit=limit
    )

    for send in batch:
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
                continue
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

        try:
            provider_message_id = await channel.send(send)
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
        else:
            await engine.mark_outbox_sent(conn, send.outbox_id, token, provider_message_id)
            # Espelho no inbox: só bolhas de texto — um template não tem corpo
            # renderizado aqui, e espelhar um chute mentiria para o operador.
            if send.channel_type == "whatsapp" and "text" in send.payload:
                try:
                    await engine.mirror_outbound_to_inbox(
                        conn,
                        send.organization_id,
                        send.to_phone_e164,
                        provider_message_id,
                        str(send.payload["text"]),
                    )
                except psycopg.Error:
                    # O canônico já registrou o envio; o espelho se recupera
                    # no próximo inbound do contato (sync webhook → inbox).
                    pass

    return len(batch)
