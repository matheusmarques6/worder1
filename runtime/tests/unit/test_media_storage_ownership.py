"""SEC17: a tenant-scoped mirror row cannot authorize a foreign Storage URL."""

from types import SimpleNamespace
from uuid import UUID

import httpx
import pytest

from agents_runtime.agent_core import media_fetch
from agents_runtime.agent_core.media_fetch import FetchedMedia, MediaRef, MetaMediaFetcher
from agents_runtime.repository.whatsapp_accounts import WhatsAppAccountRow

ORG = UUID("10000000-0000-0000-0000-000000000001")
CONVERSATION = UUID("20000000-0000-0000-0000-000000000002")
ORIGIN = "https:" + "//owned.supabase.co"
KEY = f"{ORG}/{CONVERSATION}/audio.ogg"
URL = f"{ORIGIN}/storage/v1/object/sign/whatsapp-media/{KEY}?token=signed"


@pytest.mark.parametrize(
    "url,configured,key,conversation",
    [
        (URL.replace("owned.supabase.co", "foreign.supabase.co"), ORIGIN, KEY, CONVERSATION),
        (URL.replace("owned.supabase.co", "foreign.supabase.in"), ORIGIN, KEY, CONVERSATION),
        (URL.replace("whatsapp-media", "other-bucket"), ORIGIN, KEY, CONVERSATION),
        (URL.replace(str(ORG), "foreign-org"), ORIGIN, KEY, CONVERSATION),
        (URL.replace(str(CONVERSATION), "foreign-conversation"), ORIGIN, KEY, CONVERSATION),
        (URL.replace("audio.ogg", "../audio.ogg"), ORIGIN, KEY, CONVERSATION),
        (URL.replace("audio.ogg", "%2e%2e%2faudio.ogg"), ORIGIN, KEY, CONVERSATION),
        (URL.replace("audio.ogg", "audio%252f.ogg"), ORIGIN, KEY, CONVERSATION),
        (URL.replace("audio.ogg", "a\\audio.ogg"), ORIGIN, KEY, CONVERSATION),
        (URL.replace("//owned", "//user:password@owned"), ORIGIN, KEY, CONVERSATION),
        (URL.replace(".co/", ".co:444/"), ORIGIN, KEY, CONVERSATION),
        pytest.param(URL.replace(".co/", ".co:0/"), ORIGIN, KEY, CONVERSATION, id="port-zero"),
        (URL.replace("/sign/", "/public/"), ORIGIN, KEY, CONVERSATION),
        (URL, "", KEY, CONVERSATION),
        (URL, ORIGIN, KEY.replace("audio.ogg", "different.ogg"), CONVERSATION),
        (URL, ORIGIN, KEY, None),
    ],
)
async def test_unowned_mirror_is_never_downloaded(monkeypatch, url, configured, key, conversation):
    monkeypatch.setenv("SUPABASE_URL", configured)
    monkeypatch.delenv("NEXT_PUBLIC_SUPABASE_URL", raising=False)

    async def mirror(conn, *, organization_id, provider_message_id):
        assert organization_id == ORG
        return SimpleNamespace(
            media_url=url,
            media_storage_path=key,
            media_mime_type="audio/ogg",
            conversation_id=conversation,
        )

    monkeypatch.setattr(media_fetch.agent_repo, "load_mirror_media", mirror)
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, content=b"foreign bytes")

    fetcher = MetaMediaFetcher(base_secret="s" * 32, transport=httpx.MockTransport(handler))
    try:
        result = await fetcher.fetch(None, organization_id=ORG, ref=MediaRef("w", None, None))
    finally:
        await fetcher.aclose()
    assert result is None
    assert seen == []


@pytest.mark.parametrize("storage_status", [200, 403])
@pytest.mark.parametrize("has_storage_path", [True, False])
async def test_owned_signed_download_and_expired_meta_fallback(
    monkeypatch, storage_status, has_storage_path
):
    monkeypatch.setenv("SUPABASE_URL", ORIGIN)

    async def mirror(conn, **kwargs):
        return SimpleNamespace(
            media_url=URL,
            media_storage_path=KEY if has_storage_path else None,
            media_mime_type="audio/ogg",
            conversation_id=CONVERSATION,
        )

    async def account(conn, **kwargs):
        return WhatsAppAccountRow(ORG, "phone", "meta-token", None)

    monkeypatch.setattr(media_fetch.agent_repo, "load_mirror_media", mirror)
    monkeypatch.setattr(media_fetch, "load_active_account", account)
    seen = []

    def handler(request):
        seen.append(request)
        if request.url.host == "owned.supabase.co":
            return httpx.Response(storage_status, content=b"owned")
        if request.url.host == "graph.facebook.com":
            return httpx.Response(200, json={"url": "http://127.0.0.1:1/media"})
        return httpx.Response(200, content=b"meta")

    fetcher = MetaMediaFetcher(base_secret="s" * 32, transport=httpx.MockTransport(handler))
    try:
        result = await fetcher.fetch(None, organization_id=ORG, ref=MediaRef("w", "m", "audio/ogg"))
    finally:
        await fetcher.aclose()
    assert result == FetchedMedia(b"owned" if storage_status == 200 else b"meta", "audio/ogg")
    assert "authorization" not in seen[0].headers
    assert "apikey" not in seen[0].headers
    assert len(seen) == (1 if storage_status == 200 else 3)
    for request in seen[1:]:
        assert request.headers["authorization"] == "Bearer meta-token"
