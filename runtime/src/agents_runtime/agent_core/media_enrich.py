"""Áudio vira texto e imagem vira anexo — antes de o turno decidir o que dizer.

Alteração 2026-10-15-03 (runtime/docs/alteracoes). Até aqui o runtime fazia a
"degradação honesta" (`media.py`): áudio sem legenda e imagem sem legenda
viravam um pedido de texto. O caminho legado transcrevia (Whisper pela chave
da org) e enxergava (imagem em base64 no chat). Este módulo fecha a
divergência (FORK.md item 11) sem tocar na regra de degradação: o que NÃO
der para ler continua caindo em `speechless_media` como antes.

A função é pura no sentido útil: recebe callables para buscar bytes,
transcrever e saber se o provedor enxerga; o responder entrega as versões que
falam com banco, rede e trilha de custo. Assim o comportamento inteiro
(ordem, o que muda em cada mensagem, o que fica igual) tem teste unitário.
"""

import base64
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, replace

from agents_runtime.agent_core.llm import ImageAttachment
from agents_runtime.agent_core.media_fetch import FetchedMedia, MediaRef
from agents_runtime.agent_core.think_gate import PendingMessage

#: Provedores cujos modelos de chat aceitam imagem inline — `media/router.ts:22`.
VISION_PROVIDERS = frozenset({"openai", "anthropic", "gemini", "google", "openrouter"})


def provider_supports_vision(provider: str | None) -> bool:
    return (provider or "").lower() in VISION_PROVIDERS


Fetch = Callable[[MediaRef], Awaitable[FetchedMedia | None]]
Transcribe = Callable[[bytes, str], Awaitable[str | None]]
Persist = Callable[[PendingMessage, str], Awaitable[None]]
Step = Callable[[str, str], Awaitable[None]]


@dataclass(frozen=True, slots=True)
class EnrichmentReport:
    transcribed: int = 0
    images_attached: int = 0
    failed: int = 0


async def enrich_pending_media(
    pending: tuple[PendingMessage, ...],
    *,
    fetch: Fetch | None,
    transcribe: Transcribe | None,
    vision: bool,
    persist_transcript: Persist | None = None,
    note_step: Step | None = None,
) -> tuple[tuple[PendingMessage, ...], EnrichmentReport]:
    """Devolve a janela com áudio transcrito e imagem anexada onde deu.

    - áudio: `fetch` + `transcribe`; com texto, a mensagem passa a ser o
      transcrito (`media_kind=None`, como se o cliente tivesse escrito) e
      `persist_transcript` grava para a próxima leitura não pagar de novo;
    - imagem: `fetch`; com `vision`, a imagem vira `ImageAttachment` na
      mensagem (o texto continua o marcador/legenda) e `media_kind` zera,
      porque agora o modelo VÊ o que o cliente mandou;
    - sem `fetch`, sem chave de STT ou sem visão: nada muda, e a mensagem
      segue para a degradação honesta de sempre.
    """
    if fetch is None:
        return pending, EnrichmentReport()

    out: list[PendingMessage] = []
    report = EnrichmentReport()
    for message in pending:
        if message.author != "contact" or message.media_kind not in ("audio", "image"):
            out.append(message)
            continue
        ref = MediaRef(
            provider_message_id=message.provider_message_id,
            media_id=message.media_id,
            mime_type=message.mime_type,
        )
        if message.media_kind == "audio" and transcribe is not None:
            if note_step is not None:
                await note_step("transcribing", "Transcrevendo o áudio do cliente")
            fetched = await fetch(ref)
            text = await transcribe(fetched.data, fetched.mime_type) if fetched else None
            if text:
                enriched = replace(message, text=text, media_kind=None)
                out.append(enriched)
                report = replace(report, transcribed=report.transcribed + 1)
                if persist_transcript is not None:
                    await persist_transcript(message, text)
                continue
            report = replace(report, failed=report.failed + 1)
            out.append(message)
            continue
        if message.media_kind == "image" and vision:
            if note_step is not None:
                await note_step("analyzing_image", "Analisando a imagem do cliente")
            fetched = await fetch(ref)
            if fetched is not None and fetched.data:
                attachment = ImageAttachment(
                    mime_type=fetched.mime_type or message.mime_type or "image/jpeg",
                    data_base64=base64.b64encode(fetched.data).decode("ascii"),
                )
                out.append(replace(message, image=attachment, media_kind=None))
                report = replace(report, images_attached=report.images_attached + 1)
                continue
            report = replace(report, failed=report.failed + 1)
        out.append(message)
    return tuple(out), report
