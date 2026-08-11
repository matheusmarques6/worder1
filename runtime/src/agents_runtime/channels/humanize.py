"""Humanização do envio (Adendo §B, 8.3 — D10): bolhas e ritmo.

O legado (`src/lib/ai/cloud-sender.ts`) responde em até 4 bolhas com pausa
entre elas; o runtime não pode estrear com regressão no coração do produto.
Este módulo é a metade PURA do porte:

  * `split_into_bubbles` — porta fiel do `splitIntoBubbles` do TS (mesmos
    cortes; a suíte compara com fixtures GERADOS pelo próprio TS);
  * `compute_pacing` — o ritmo do adendo: delay por bolha proporcional ao
    tamanho, com teto curto por bolha e ORÇAMENTO agregado (o cap
    proporcional do legado — ninguém espera 30s por uma resposta longa).

A linha que não se cruza (D10): nada de erro de digitação proposital nem
typing falso prolongado. Typing real fica de fora por ora — a Meta só aceita
typing junto de mark-read do ÚLTIMO inbound wamid, que a outbox não carrega
(DIVERGÊNCIA v1 registrada no STATUS; o próprio legado pula sem ele).
"""

from dataclasses import dataclass

MAX_BUBBLES = 4
MAX_BUBBLE_CHARS = 600

#: Pausa "pensando" antes da 1ª bolha (o reply_delay default do legado).
DEFAULT_REPLY_DELAY_MS = 1_500
#: Ritmo proporcional: ms por caractere da bolha que VAI sair.
MS_PER_CHAR = 20
#: Piso e teto POR bolha (teto curto — adendo 8.3).
MIN_INTER_BUBBLE_MS = 700
MAX_INTER_BUBBLE_MS = 2_000
#: Orçamento agregado de TODOS os delays de um envio (cap do legado).
MAX_HUMANIZE_BUDGET_MS = 8_000


def split_into_bubbles(text: str) -> list[str]:
    """Divide como o legado divide: parágrafos (\\n{2,}) primeiro, depois
    quebra por tamanho preferindo fronteira de espaço; máximo 4 bolhas com o
    excedente concatenado na última. Paridade provada por fixtures do TS."""
    clean = (text or "").strip()
    if not clean:
        return []

    paragraphs = [p.strip() for p in _split_paragraphs(clean) if p.strip()]

    chunks: list[str] = []
    for para in paragraphs:
        if len(para) <= MAX_BUBBLE_CHARS:
            chunks.append(para)
            continue
        rest = para
        while len(rest) > MAX_BUBBLE_CHARS:
            # lastIndexOf(' ', 600) do JS: o maior índice de espaço <= 600.
            cut = rest.rfind(" ", 0, MAX_BUBBLE_CHARS + 1)
            if cut < MAX_BUBBLE_CHARS * 0.5:  # -1 (sem espaço) cai aqui também
                cut = MAX_BUBBLE_CHARS
            chunks.append(rest[:cut].strip())
            rest = rest[cut:].strip()
        if rest:
            chunks.append(rest)

    if len(chunks) <= MAX_BUBBLES:
        return chunks

    head = chunks[: MAX_BUBBLES - 1]
    tail = "\n\n".join(chunks[MAX_BUBBLES - 1 :])
    return [*head, tail]


def _split_paragraphs(text: str) -> list[str]:
    import re

    return re.split(r"\n{2,}", text)


@dataclass(frozen=True, slots=True)
class Pacing:
    """Os delays de UM envio, já orçados. Índice i = pausa ANTES da bolha i
    (a posição 0 é o reply_delay)."""

    delays_ms: tuple[int, ...]

    @property
    def total_ms(self) -> int:
        return sum(self.delays_ms)


def compute_pacing(
    bubbles: list[str],
    *,
    reply_delay_ms: int = DEFAULT_REPLY_DELAY_MS,
    enabled: bool = True,
) -> Pacing:
    if not bubbles or not enabled:
        return Pacing(tuple(0 for _ in bubbles))

    delays = [reply_delay_ms]
    for bubble in bubbles[1:]:
        wanted = len(bubble) * MS_PER_CHAR
        delays.append(max(MIN_INTER_BUBBLE_MS, min(wanted, MAX_INTER_BUBBLE_MS)))

    total = sum(delays)
    if total > MAX_HUMANIZE_BUDGET_MS:
        # O mesmo cap proporcional do legado (floor, como o TS).
        scale = MAX_HUMANIZE_BUDGET_MS / total
        delays = [int(d * scale) for d in delays]

    return Pacing(tuple(delays))
