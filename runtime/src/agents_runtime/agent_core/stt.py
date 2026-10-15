"""Transcrição de áudio (notas de voz do WhatsApp) com a chave da org — BYO.

Alteração 2026-10-15-03 (runtime/docs/alteracoes). Porte de
`src/lib/ai/media/transcription.ts`, com a mesma ordem de resolução, que é
INDEPENDENTE do provedor do agente:

  1. chave OpenAI ativa da org  → `whisper-1` (api.openai.com)
  2. chave Groq ativa da org    → `whisper-large-v3` (api.groq.com, dialeto OpenAI)
  3. nenhuma                    → `None` (o turno degrada como antes: pede texto)

Este módulo é um ADAPTER no sentido do teste de rede
(`tests/unit/test_no_provider_network.py`): é um dos poucos lugares que podem
nomear o host de um provedor. Tudo o que fala com ele recebe `SttPort`.

O custo é por segundo de áudio, a tabela é a mesma do TS, e quem grava a
linha em `internal.llm_calls` (purpose `stt`) é o responder — este módulo só
devolve duração e custo calculado.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

import httpx

from agents_runtime.agent_core.providers import decode_stored_key
from agents_runtime.repository.provider_keys import ProviderKeyRow

#: Ordem de preferência — a mesma de `STT_PROVIDER_PRIORITY` no TS.
STT_PROVIDER_PRIORITY: tuple[str, ...] = ("openai", "groq")

STT_MODELS: dict[str, str] = {
    "openai": "whisper-1",
    "groq": "whisper-large-v3",
}

STT_BASE_URLS: dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "groq": "https://api.groq.com/openai/v1",
}

#: (USD por segundo, mínimo cobrado em segundos). `transcription.ts:35-37`.
STT_PRICING: dict[str, tuple[float, int]] = {
    "openai/whisper-1": (0.006 / 60, 0),
    "groq/whisper-large-v3": (0.111 / 3600, 10),
}

DEFAULT_TIMEOUT_SECONDS = 60.0


@dataclass(frozen=True, slots=True)
class SttChoice:
    provider: str
    api_key: str
    model: str
    base_url: str


@dataclass(frozen=True, slots=True)
class SttResult:
    text: str
    duration_seconds: float | None
    provider: str
    model: str
    cost_usd: float | None


class SttPort(Protocol):
    provider: str
    model: str

    async def transcribe(self, audio: bytes, *, mime_type: str) -> SttResult: ...

    async def aclose(self) -> None: ...


def select_stt_key(rows: Sequence[ProviderKeyRow], *, base_secret: str | None) -> SttChoice | None:
    """Pura: a primeira chave da ordem de preferência que a org tem."""
    for provider in STT_PROVIDER_PRIORITY:
        row = next((r for r in rows if r.provider == provider and r.api_key), None)
        if row is None:
            continue
        return SttChoice(
            provider=provider,
            api_key=decode_stored_key(row.api_key, base_secret=base_secret),
            model=STT_MODELS[provider],
            base_url=row.base_url or STT_BASE_URLS[provider],
        )
    return None


def extension_for_mime(mime_type: str) -> str:
    mime = (mime_type or "").lower()
    if "ogg" in mime:
        return "ogg"
    if "mpeg" in mime or "mp3" in mime:
        return "mp3"
    if "mp4" in mime or "m4a" in mime:
        return "mp4"
    if "wav" in mime:
        return "wav"
    if "webm" in mime:
        return "webm"
    return "ogg"


def stt_cost_usd(provider: str, model: str, duration_seconds: float | None) -> float | None:
    """Mesma regra do TS: sem duração, custo desconhecido (None, nunca 0)."""
    pricing = STT_PRICING.get(f"{provider}/{model}")
    if pricing is None or duration_seconds is None:
        return None
    per_second, minimum = pricing
    return max(duration_seconds, minimum) * per_second


def duration_of(payload: dict) -> float | None:
    """`verbose_json` traz `duration`; alguns servidores só trazem `segments`."""
    duration = payload.get("duration")
    if isinstance(duration, int | float) and duration > 0:
        return float(duration)
    ends = [
        segment.get("end")
        for segment in payload.get("segments") or []
        if isinstance(segment, dict) and isinstance(segment.get("end"), int | float)
    ]
    ends = [float(end) for end in ends if end > 0]
    return max(ends) if ends else None


class WhisperStt:
    """O adapter: multipart cru para `/audio/transcriptions`, sem SDK."""

    def __init__(
        self,
        choice: SttChoice,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.provider = choice.provider
        self.model = choice.model
        self._client = httpx.AsyncClient(
            base_url=choice.base_url,
            headers={"Authorization": f"Bearer {choice.api_key}"},
            timeout=httpx.Timeout(timeout),
            transport=transport,
        )

    async def transcribe(self, audio: bytes, *, mime_type: str) -> SttResult:
        files = {
            "file": (f"audio.{extension_for_mime(mime_type)}", audio, mime_type or "audio/ogg")
        }
        data = {"model": self.model, "response_format": "verbose_json"}
        response = await self._client.post("/audio/transcriptions", data=data, files=files)
        if response.status_code >= 400:
            raise RuntimeError(f"HTTP {response.status_code} from {self.provider} stt")
        payload = response.json()
        text = str(payload.get("text") or "").strip()
        duration = duration_of(payload)
        return SttResult(
            text=text,
            duration_seconds=duration,
            provider=self.provider,
            model=self.model,
            cost_usd=stt_cost_usd(self.provider, self.model, duration),
        )

    async def aclose(self) -> None:
        await self._client.aclose()
