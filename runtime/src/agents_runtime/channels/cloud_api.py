"""The real channel — WhatsApp Cloud API, rota A.

The shape of every call here was mined from worder1 (Bruno's previous
application), which ran this API in production: POST to
`{graph}/{version}/{phone_number_id}/messages` with a bearer token, wamid in
`messages[0].id`. What worder1 never used — and this adapter does — is
`biz_opaque_callback_data`: our idempotency_key travels in it so a status
webhook can resolve an `unknown` outbox row even when the sender died before
learning the wamid (ADR-8, decisão 59). Whether Meta echoes it faithfully is
exactly the pendência nº 2 of the architecture, owned by the `contract` suite.

Errors surface as `RuntimeError("HTTP {status} ...")` on purpose: the failure
classifier (unidade 4) reads the status code out of the message — 429/5xx
retry with backoff, 4xx give up. One classifier, one vocabulary.

Credentials (auditoria 2026-08-28, item 20): por CONTA, não mais uma única
`AGENTS_META_ACCESS_TOKEN` global para todo mundo — essa env foi a falha
encontrada (uma loja migrada falava com a Meta usando a credencial de outra) e
some do caminho de produção. `from_env` monta um `_load_token` que resolve a
conta ativa da org de CADA envio via `internal.active_whatsapp_business_account`
(a porta SECURITY DEFINER que recusa qualquer org que não seja a da sessão) e
`repository.whatsapp_accounts.resolve_token` (cifrado ou legado em claro, como
`getAccessToken` do TS lê). Nada de cache aqui de propósito (ruling do item
20): uma leitura por envio, e medir se isso pesa é tarefa de outro item.
"""

import os
from collections.abc import Awaitable, Callable
from uuid import UUID

import httpx
import psycopg

from agents_runtime.channels.port import ChannelPort
from agents_runtime.crypto.secret_box import base_secret_from_env
from agents_runtime.repository.outbox import ClaimedSend
from agents_runtime.repository.whatsapp_accounts import load_active_account, resolve_token

# v19.0 is the version worder1 ran in production — proven, not newest.
# Overridable per environment because Meta retires versions on a schedule.
DEFAULT_API_VERSION = "v19.0"

GRAPH_URL = "https://graph.facebook.com"

#: A assinatura do seam de token — uma função da conexão do sender + a org do
#: envio para o token JÁ decifrado. `from_env` liga a real (banco + secret_box);
#: os testes de unidade ligam uma falsa, sem tocar em Postgres.
TokenLoader = Callable[[psycopg.AsyncConnection, UUID], Awaitable[str]]


class CloudApiChannel:
    """One door out, per ADR: only senders hold an instance of this."""

    def __init__(
        self,
        *,
        load_token: TokenLoader,
        api_version: str = DEFAULT_API_VERSION,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client = httpx.AsyncClient(
            base_url=f"{GRAPH_URL}/{api_version}",
            timeout=httpx.Timeout(30.0),
            transport=transport,
        )
        self._load_token = load_token

    async def send(self, conn: psycopg.AsyncConnection, send: ClaimedSend) -> str:
        token = await self._load_token(conn, send.organization_id)
        response = await self._client.post(
            f"/{send.channel_external_id}/messages",
            json=self._payload_for(send),
            # Por-request, nunca por-client: cada conta da fila pode ter um
            # token diferente, e o client é compartilhado entre organizações.
            headers={"Authorization": f"Bearer {token}"},
        )

        if response.status_code >= 400:
            # The classifier reads the status out of this message; the body is
            # kept for the outbox's last_error forensics. NUNCA o token — só o
            # corpo que a Meta devolveu.
            raise RuntimeError(f"HTTP {response.status_code} {response.text[:300]}")

        # `or`, not a default: an empty list is present-but-useless, and the
        # 2xx-without-wamid test caught the IndexError the naive version hid.
        wamid = (response.json().get("messages") or [{}])[0].get("id")
        if not wamid:
            # A 200 without a message id is a contract violation by the
            # provider — permanent, never retried into a duplicate.
            raise ValueError(f"payload inválido: resposta 2xx sem wamid: {response.text[:200]}")
        return str(wamid)

    @staticmethod
    def _payload_for(send: ClaimedSend) -> dict:
        base = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": send.to_phone_e164,
            # One key, two worlds (decisão 59): the status webhook echoes this
            # back, and that echo is what resolves an unknown without resending.
            "biz_opaque_callback_data": send.idempotency_key,
        }

        if "template" in send.payload:
            # O preflight rebaixou um toque de janela fechada para o template
            # aprovado — o shape é o mínimo da Cloud API: nome + idioma.
            template = send.payload["template"]
            if not isinstance(template, dict) or not template.get("name"):
                raise ValueError(f"payload inválido: template sem 'name' — {template!r:.80}")
            return base | {
                "type": "template",
                "template": {
                    "name": str(template["name"]),
                    "language": {"code": str(template.get("language") or "pt_BR")},
                },
            }

        if "text" not in send.payload:
            # Media arrives with the funnels (E3). Guessing at an unknown
            # shape would send SOMETHING to a customer.
            raise ValueError(f"payload inválido: sem 'text' — chaves {sorted(send.payload)}")

        return base | {
            "type": "text",
            "text": {"body": str(send.payload["text"])},
        }

    async def aclose(self) -> None:
        await self._client.aclose()


def from_env(dsn: str) -> ChannelPort:
    """The `AGENTS_CHANNEL` factory for production and the live demo.

    `dsn` segue sem uso: a conexão de verdade chega em `send`, vinda do
    sender (ver docstring de `channels/port.py`). O que precisa existir na
    partida é `ENCRYPTION_KEY` — sem ela nenhuma conta cifrada abre, e o canal
    morreria calado no primeiro envio em vez de na partida, onde um humano
    está olhando (decisão 67: um canal recusa se configurar sem meio de
    autenticar).
    """
    base_secret = base_secret_from_env()

    async def load_token(conn: psycopg.AsyncConnection, organization_id: UUID) -> str:
        account = await load_active_account(conn, organization_id=organization_id)
        if account is None:
            raise RuntimeError(
                f"organização {organization_id} não tem conta WhatsApp Cloud ativa"
            )
        return resolve_token(account, base_secret=base_secret)

    return CloudApiChannel(
        load_token=load_token,
        api_version=os.environ.get("AGENTS_META_API_VERSION", DEFAULT_API_VERSION),
    )
