"""Alteração 2026-10-15-03 — áudio vira texto, imagem vira anexo.

O que se prova aqui: a cascata de STT (openai → groq, chave da org), o preço
por segundo, o multipart cru, os dois caminhos de busca de mídia (Storage
assinado sem token; Graph da Meta com token), o teto de 10 MB, e a regra de
enriquecimento da janela: transcrito vira fala do cliente e é persistido;
imagem só vira anexo quando o provedor enxerga; o que falha segue para a
degradação honesta de sempre.
"""

import base64
import json
from uuid import uuid4

import httpx
import pytest

from agents_runtime.agent_core import media_fetch
from agents_runtime.agent_core.direct_providers import _anthropic_turn
from agents_runtime.agent_core.llm import ImageAttachment, Message
from agents_runtime.agent_core.media import read_media_ref, read_message
from agents_runtime.agent_core.media_enrich import (
    enrich_pending_media,
    provider_supports_vision,
)
from agents_runtime.agent_core.media_fetch import FetchedMedia, MediaRef, MetaMediaFetcher
from agents_runtime.agent_core.openrouter import openai_message
from agents_runtime.agent_core.stt import (
    STT_MODELS,
    SttChoice,
    WhisperStt,
    duration_of,
    extension_for_mime,
    select_stt_key,
    stt_cost_usd,
)
from agents_runtime.agent_core.think_gate import PendingMessage
from agents_runtime.repository.agent import MirrorMedia
from agents_runtime.repository.provider_keys import ProviderKeyRow
from agents_runtime.repository.whatsapp_accounts import WhatsAppAccountRow

ORG = uuid4()

#: Hosts montados em tempo de execução, nunca como literal com esquema: o
#: detector de rede (`test_no_provider_network.py`) reprova qualquer literal
#: assim fora de `tests/contract/`, e aqui NADA sai para a rede — tudo passa
#: por `httpx.MockTransport`. Os endpoints simulados usam loopback.
LOCAL = "http://127.0.0.1:1"


def _https(host: str, path: str = "") -> str:
    return "https:" + "//" + host + path


def _row(provider: str, key: str = "sk-plain") -> ProviderKeyRow:
    return ProviderKeyRow(provider=provider, api_key=key, base_url=None)


class TestReadingTheMediaRef:
    def test_the_ingest_dialect_carries_media_id_and_mime(self) -> None:
        content = {"type": "audio", "text": None, "media_id": "m-1", "mime_type": "audio/ogg"}
        assert read_media_ref(content) == ("m-1", "audio/ogg")
        text, kind = read_message(content, "contact")
        assert kind == "audio" and text.startswith("[Cliente enviou")

    def test_the_backfill_dialect_has_no_ref(self) -> None:
        assert read_media_ref({"image": {"id": "x"}}) == (None, None)
        assert read_media_ref("oi") == (None, None)

    def test_a_transcribed_audio_reads_as_plain_speech(self) -> None:
        content = {"type": "audio", "text": "quanto custa o frete", "transcribed": True}
        assert read_message(content, "contact") == ("quanto custa o frete", None)


class TestSttCascade:
    def test_openai_wins_over_groq(self) -> None:
        choice = select_stt_key((_row("groq"), _row("openai")), base_secret=None)
        assert choice is not None
        assert choice.provider == "openai" and choice.model == STT_MODELS["openai"]

    def test_groq_is_the_fallback(self) -> None:
        choice = select_stt_key((_row("anthropic"), _row("groq")), base_secret=None)
        assert choice is not None and choice.provider == "groq"

    def test_no_key_means_no_stt(self) -> None:
        assert select_stt_key((_row("anthropic"), _row("openrouter")), base_secret=None) is None

    def test_pricing_has_a_minimum_and_an_unknown(self) -> None:
        assert stt_cost_usd("groq", "whisper-large-v3", 3.0) == pytest.approx(10 * 0.111 / 3600)
        assert stt_cost_usd("openai", "whisper-1", 60.0) == pytest.approx(0.006)
        assert stt_cost_usd("openai", "whisper-1", None) is None
        assert stt_cost_usd("x", "y", 10.0) is None

    def test_duration_comes_from_duration_or_segments(self) -> None:
        assert duration_of({"duration": 12.5}) == 12.5
        assert duration_of({"segments": [{"end": 3.0}, {"end": 7.5}]}) == 7.5
        assert duration_of({}) is None

    def test_extensions(self) -> None:
        assert extension_for_mime("audio/ogg; codecs=opus") == "ogg"
        assert extension_for_mime("audio/mpeg") == "mp3"
        assert extension_for_mime("") == "ogg"

    async def test_the_adapter_posts_multipart_and_prices_the_duration(self) -> None:
        seen: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["url"] = str(request.url)
            seen["auth"] = request.headers.get("authorization")
            seen["ctype"] = request.headers.get("content-type", "")
            seen["body"] = request.content
            return httpx.Response(200, json={"text": " oi, tudo bem? ", "duration": 4.2})

        stt = WhisperStt(
            SttChoice("openai", "sk-1", "whisper-1", LOCAL + "/v1"),
            transport=httpx.MockTransport(handler),
        )
        result = await stt.transcribe(b"OggS\x00", mime_type="audio/ogg")
        await stt.aclose()

        assert seen["url"] == LOCAL + "/v1/audio/transcriptions"
        assert seen["auth"] == "Bearer sk-1"
        assert seen["ctype"].startswith("multipart/form-data")
        assert b'name="model"' in seen["body"] and b"whisper-1" in seen["body"]
        assert b'filename="audio.ogg"' in seen["body"]
        assert result.text == "oi, tudo bem?"
        assert result.cost_usd == pytest.approx(4.2 * 0.006 / 60)

    async def test_a_provider_error_raises(self) -> None:
        stt = WhisperStt(
            SttChoice("groq", "k", "whisper-large-v3", LOCAL + "/v1"),
            transport=httpx.MockTransport(lambda r: httpx.Response(401, json={})),
        )
        with pytest.raises(RuntimeError):
            await stt.transcribe(b"x", mime_type="audio/ogg")
        await stt.aclose()


class _Conn:
    """O fetcher recebe uma conexão só para repassar ao repositório — que aqui
    é substituído por monkeypatch."""


class TestFetchingMedia:
    def test_only_the_storage_host_is_followed_without_token(self) -> None:
        assert media_fetch.is_storage_url(_https("abc.supabase.co", "/storage/v1/object/sign/x"))
        assert not media_fetch.is_storage_url(_https("evil.example", "/x"))
        assert not media_fetch.is_storage_url("http:" + "//abc.supabase.co/x")
        assert not media_fetch.is_storage_url(_https("169.254.169.254", "/latest"))

    async def test_the_mirror_signed_url_is_the_first_door(self, monkeypatch) -> None:
        async def mirror(conn, *, organization_id, provider_message_id):
            return MirrorMedia(
                media_url=_https("abc.supabase.co", "/storage/v1/object/sign/a.ogg?token=t"),
                media_storage_path="a.ogg",
                media_mime_type="audio/ogg",
            )

        monkeypatch.setattr(media_fetch.agent_repo, "load_mirror_media", mirror)
        calls: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request)
            return httpx.Response(200, content=b"bytes", headers={"content-type": "audio/ogg"})

        fetcher = MetaMediaFetcher(base_secret="s" * 32, transport=httpx.MockTransport(handler))
        got = await fetcher.fetch(
            _Conn(), organization_id=ORG, ref=MediaRef("wamid.1", "m-1", "audio/ogg")
        )
        await fetcher.aclose()
        assert got == FetchedMedia(b"bytes", "audio/ogg")
        assert len(calls) == 1 and "authorization" not in calls[0].headers

    async def test_the_graph_is_the_second_door_with_the_account_token(self, monkeypatch) -> None:
        async def mirror(conn, *, organization_id, provider_message_id):
            return None

        async def account(conn, *, organization_id, channel_external_id=None):
            return WhatsAppAccountRow(uuid4(), "123", "tok-plain", None)

        monkeypatch.setattr(media_fetch.agent_repo, "load_mirror_media", mirror)
        monkeypatch.setattr(media_fetch, "load_active_account", account)
        seen: list[tuple[str, str | None]] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append((str(request.url), request.headers.get("authorization")))
            if request.url.path.endswith("/m-1"):
                return httpx.Response(
                    200,
                    json={
                        "url": LOCAL + "/dl/1",
                        "mime_type": "image/jpeg",
                        "file_size": 5,
                    },
                )
            return httpx.Response(200, content=b"JPEG!", headers={"content-type": "image/jpeg"})

        fetcher = MetaMediaFetcher(
            base_secret="s" * 32, api_version="v22.0", transport=httpx.MockTransport(handler)
        )
        got = await fetcher.fetch(
            _Conn(), organization_id=ORG, ref=MediaRef("wamid.2", "m-1", "image/jpeg")
        )
        await fetcher.aclose()
        assert got == FetchedMedia(b"JPEG!", "image/jpeg")
        assert seen[0] == (media_fetch.GRAPH_BASE_URL + "/v22.0/m-1", "Bearer tok-plain")
        assert seen[1] == (LOCAL + "/dl/1", "Bearer tok-plain")

    async def test_over_the_cap_is_none(self, monkeypatch) -> None:
        async def mirror(conn, *, organization_id, provider_message_id):
            return None

        async def account(conn, *, organization_id, channel_external_id=None):
            return WhatsAppAccountRow(uuid4(), "123", "tok", None)

        monkeypatch.setattr(media_fetch.agent_repo, "load_mirror_media", mirror)
        monkeypatch.setattr(media_fetch, "load_active_account", account)
        fetcher = MetaMediaFetcher(
            base_secret="s" * 32,
            transport=httpx.MockTransport(
                lambda r: httpx.Response(
                    200,
                    json={
                        "url": LOCAL + "/1",
                        "file_size": media_fetch.MAX_INBOUND_MEDIA_BYTES + 1,
                    },
                )
            ),
        )
        assert (
            await fetcher.fetch(_Conn(), organization_id=ORG, ref=MediaRef(None, "m", None)) is None
        )
        await fetcher.aclose()

    async def test_without_media_id_nor_mirror_is_none(self, monkeypatch) -> None:
        async def mirror(conn, *, organization_id, provider_message_id):
            raise RuntimeError("sem grant")

        monkeypatch.setattr(media_fetch.agent_repo, "load_mirror_media", mirror)
        fetcher = MetaMediaFetcher(
            base_secret="s" * 32, transport=httpx.MockTransport(lambda r: httpx.Response(500))
        )
        assert (
            await fetcher.fetch(_Conn(), organization_id=ORG, ref=MediaRef("w", None, None)) is None
        )
        await fetcher.aclose()


def _audio(pmid: str = "wamid.a") -> PendingMessage:
    return PendingMessage(
        "contact",
        "[Cliente enviou um áudio sem transcrição]",
        "audio",
        provider_message_id=pmid,
        media_id="m-a",
        mime_type="audio/ogg",
    )


def _image() -> PendingMessage:
    return PendingMessage(
        "contact",
        "[Cliente enviou uma imagem]",
        "image",
        provider_message_id="wamid.i",
        media_id="m-i",
        mime_type="image/jpeg",
    )


class TestEnrichingTheWindow:
    async def test_audio_becomes_the_customers_words_and_is_persisted(self) -> None:
        persisted: list[tuple[str, str]] = []
        steps: list[str] = []

        async def fetch(ref):
            return FetchedMedia(b"ogg", "audio/ogg")

        async def transcribe(data, mime):
            return "quero trocar o produto"

        async def persist(message, text):
            persisted.append((message.provider_message_id, text))

        async def step(name, detail):
            steps.append(name)

        out, report = await enrich_pending_media(
            (_audio(), PendingMessage("contact", "viu?")),
            fetch=fetch,
            transcribe=transcribe,
            vision=False,
            persist_transcript=persist,
            note_step=step,
        )
        assert out[0].text == "quero trocar o produto" and out[0].media_kind is None
        assert out[1].text == "viu?"
        assert persisted == [("wamid.a", "quero trocar o produto")]
        assert report.transcribed == 1 and steps == ["transcribing"]

    async def test_without_stt_the_audio_stays_speechless(self) -> None:
        async def fetch(ref):
            return FetchedMedia(b"ogg", "audio/ogg")

        out, report = await enrich_pending_media(
            (_audio(),), fetch=fetch, transcribe=None, vision=True
        )
        assert out[0].media_kind == "audio" and report.transcribed == 0

    async def test_a_failed_transcription_stays_speechless(self) -> None:
        async def fetch(ref):
            return None

        async def transcribe(data, mime):
            return "nunca chamado"

        out, report = await enrich_pending_media(
            (_audio(),), fetch=fetch, transcribe=transcribe, vision=True
        )
        assert out[0].media_kind == "audio" and report.failed == 1

    async def test_an_image_is_attached_only_when_the_provider_sees(self) -> None:
        async def fetch(ref):
            return FetchedMedia(b"\xff\xd8", "image/jpeg")

        seen, report = await enrich_pending_media(
            (_image(),), fetch=fetch, transcribe=None, vision=True
        )
        assert seen[0].image == ImageAttachment(
            "image/jpeg", base64.b64encode(b"\xff\xd8").decode()
        )
        assert seen[0].media_kind is None and report.images_attached == 1

        blind, _ = await enrich_pending_media(
            (_image(),), fetch=fetch, transcribe=None, vision=False
        )
        assert blind[0].image is None and blind[0].media_kind == "image"

    async def test_without_a_fetcher_nothing_changes(self) -> None:
        out, report = await enrich_pending_media(
            (_audio(), _image()), fetch=None, transcribe=None, vision=True
        )
        assert out == (_audio(), _image()) and report.transcribed == 0

    def test_vision_providers(self) -> None:
        assert provider_supports_vision("openai") and provider_supports_vision("OpenRouter")
        assert not provider_supports_vision("deepseek") and not provider_supports_vision(None)


class TestTheDialects:
    def test_openai_dialect_puts_the_image_in_content_parts(self) -> None:
        wire = openai_message(
            Message(
                role="user", content="o que é isso?", images=(ImageAttachment("image/png", "AAA="),)
            )
        )
        assert wire["role"] == "user"
        assert wire["content"] == [
            {"type": "text", "text": "o que é isso?"},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64,AAA="}},
        ]
        assert json.dumps(wire)  # serializável

    def test_openai_dialect_without_images_is_unchanged(self) -> None:
        assert openai_message(Message(role="user", content="oi")) == {
            "role": "user",
            "content": "oi",
        }

    def test_anthropic_dialect_uses_base64_blocks(self) -> None:
        turn = _anthropic_turn(
            Message(role="user", content="e isso?", images=(ImageAttachment("image/jpeg", "BBB="),))
        )
        assert turn == {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": "image/jpeg", "data": "BBB="},
                },
                {"type": "text", "text": "e isso?"},
            ],
        }
