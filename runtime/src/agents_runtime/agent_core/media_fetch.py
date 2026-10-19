"""Buscar os bytes de uma mídia inbound do WhatsApp — os dois caminhos.

Alteração 2026-10-15-03 (runtime/docs/alteracoes). O motor legado lia a
mídia do bucket `whatsapp-media` pelo `media_storage_path`, com fallback na
`media_url` (`src/lib/ai/media/fetch-media.ts`). O runtime não tem credencial
de Storage — só o DSN e, por conta, o token da Meta. Então a ordem aqui é:

  1. `whatsapp_cloud_messages.media_url` do espelho (URL assinada do Storage,
     gravada pelo pipeline de mídia do app): um GET simples, sem token — mas
     SÓ para a origem configurada, bucket e org/conversa verificada, porque
     uma linha do tenant não autoriza qualquer URL gravada nessa linha;
  2. a API Graph da Meta pelo `media_id` que o ingest guardou no `content`:
     `GET /{version}/{media_id}` devolve a URL temporária, e o segundo GET
     (com o mesmo bearer) devolve os bytes. Vale enquanto a Meta retiver a
     mídia, mesmo que o pipeline do app não tenha terminado o download.

Teto de 10 MB, como no TS: acima disso o áudio não cabe no multipart do STT
nem a imagem no base64 do prompt. Qualquer falha devolve `None` e o turno
degrada do jeito honesto de sempre (pede texto / transfere) — buscar mídia
nunca mata um turno.

Este módulo é ADAPTER para o teste de rede (nomeia o host da Meta).
"""

import os
import re
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlparse
from uuid import UUID

import httpx

from agents_runtime.repository import agent as agent_repo
from agents_runtime.repository.whatsapp_accounts import load_active_account, resolve_token

MAX_INBOUND_MEDIA_BYTES = 10 * 1024 * 1024
GRAPH_BASE_URL = "https://graph.facebook.com"
DEFAULT_API_VERSION = "v22.0"
DEFAULT_TIMEOUT_SECONDS = 30.0


@dataclass(frozen=True, slots=True)
class MediaRef:
    """O que o ingest guardou sobre a mídia — o suficiente para buscá-la."""

    provider_message_id: str | None
    media_id: str | None
    mime_type: str | None


@dataclass(frozen=True, slots=True)
class FetchedMedia:
    data: bytes
    mime_type: str


class MediaFetcher(Protocol):
    async def fetch(
        self, conn: Any, *, organization_id: UUID, ref: MediaRef
    ) -> FetchedMedia | None: ...


def is_storage_url(
    url: str,
    *,
    configured_origin: str | None,
    organization_id: UUID,
    conversation_id: UUID | None,
    storage_path: str | None,
) -> bool:
    if not configured_origin or not conversation_id or any(ord(char) <= 32 for char in url):
        return False
    try:
        parsed = urlparse(url)
        configured = urlparse(configured_origin)
        same_origin = (
            parsed.scheme,
            parsed.hostname,
            parsed.port if parsed.port is not None else 443,
        ) == (
            configured.scheme,
            configured.hostname,
            configured.port if configured.port is not None else 443,
        )
    except ValueError:
        return False
    if (
        not same_origin
        or parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or parsed.params
    ):
        return False
    prefix = f"/storage/v1/object/sign/whatsapp-media/{organization_id}/{conversation_id}/"
    if not parsed.path.startswith(prefix):
        return False
    filename = parsed.path[len(prefix) :]
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]*", filename) or ".." in filename:
        return False
    return not storage_path or storage_path == f"{organization_id}/{conversation_id}/{filename}"


def within_cap(size: int) -> bool:
    return 0 < size <= MAX_INBOUND_MEDIA_BYTES


class MetaMediaFetcher:
    def __init__(
        self,
        *,
        base_secret: str,
        api_version: str = DEFAULT_API_VERSION,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._base_secret = base_secret
        self._api_version = api_version
        self._storage_origin = os.environ.get("SUPABASE_URL") or os.environ.get(
            "NEXT_PUBLIC_SUPABASE_URL"
        )
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(timeout), transport=transport, follow_redirects=False
        )

    async def fetch(
        self, conn: Any, *, organization_id: UUID, ref: MediaRef
    ) -> FetchedMedia | None:
        mirror = None
        if ref.provider_message_id:
            try:
                mirror = await agent_repo.load_mirror_media(
                    conn,
                    organization_id=organization_id,
                    provider_message_id=ref.provider_message_id,
                )
            except Exception:
                mirror = None
        if (
            mirror is not None
            and mirror.media_url
            and is_storage_url(
                mirror.media_url,
                configured_origin=self._storage_origin,
                organization_id=organization_id,
                conversation_id=mirror.conversation_id,
                storage_path=mirror.media_storage_path,
            )
        ):
            fetched = await self._get(mirror.media_url, token=None)
            if fetched is not None:
                return FetchedMedia(
                    fetched.data, mirror.media_mime_type or fetched.mime_type or ref.mime_type or ""
                )

        if not ref.media_id:
            return None
        account = await load_active_account(conn, organization_id=organization_id)
        if account is None:
            return None
        token = resolve_token(account, base_secret=self._base_secret)
        meta = await self._client.get(
            f"{GRAPH_BASE_URL}/{self._api_version}/{ref.media_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        if meta.status_code >= 400:
            return None
        payload = meta.json()
        size = payload.get("file_size")
        if isinstance(size, int) and not within_cap(size):
            return None
        url = payload.get("url")
        if not isinstance(url, str) or not url:
            return None
        fetched = await self._get(url, token=token)
        if fetched is None:
            return None
        return FetchedMedia(
            fetched.data, payload.get("mime_type") or fetched.mime_type or ref.mime_type or ""
        )

    async def _get(self, url: str, *, token: str | None) -> FetchedMedia | None:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        try:
            response = await self._client.get(url, headers=headers)
        except httpx.HTTPError:
            return None
        if response.status_code >= 400:
            return None
        data = response.content
        if not within_cap(len(data)):
            return None
        return FetchedMedia(data, response.headers.get("content-type", ""))

    async def aclose(self) -> None:
        await self._client.aclose()


def from_env_optional(
    base_secret: str | None, *, api_version: str | None = None
) -> MediaFetcher | None:
    """Sem `ENCRYPTION_KEY` não há como abrir o token de nenhuma conta: o motor
    segue sem buscar mídia (degradação honesta), em vez de morrer."""
    if not base_secret:
        return None
    return MetaMediaFetcher(base_secret=base_secret, api_version=api_version or DEFAULT_API_VERSION)
