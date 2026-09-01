"""Os guards de comportamento que o lojista configura na órbita do agente.

Porte de `src/lib/ai/guards.ts` + do bloco de `src/lib/ai/cloud-runner.ts` a
partir de `:462` (auditoria 2026-08-28, item 30). Até aqui a loja migrada para
o runtime continuava vendo os controles na tela — ativação manual, cooldown,
teto de respostas, handoff por palavra, tópicos proibidos, horário — e salvando
configuração que não decidia nada. Configuração que não faz nada é pior que
ausência.

**Puro de propósito.** Zero I/O, relógio recebido: o estado que estes guards
leem (o espelho legado do inbox) chega pronto do `repository/`, e a decisão
mora aqui, num lugar só, testável sem banco — o mesmo desenho do TS.

**Paridade de semântica, não de código.** Onde o TS documenta um detalhe em
comentário, o detalhe é contrato e está repetido aqui com o mesmo efeito:
`stop_on_human_reply` vale por default e é permanente na conversa;
`ai_transferred_at` não é limpo quando um humano religa a IA, e o cooldown vale
mesmo assim; keyword casa por substring, sem caixa e sem acento (pt-BR);
`activate_on: manual` só roda na conversa a que ESTE agente foi atribuído.
Divergência entre os dois motores é a doença, não o remédio — se uma regra do
TS parecer errada, ela continua sendo a regra até que alguém a mude nos dois.
"""

import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, time
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

#: `COOLDOWN_MS` de cloud-runner.ts:49 — o agente não responde duas vezes
#: dentro desta janela, por mais rápido que o cliente escreva.
RECENT_REPLY_COOLDOWN_SECONDS = 5.0

#: Default de `behavior.cooldown_after_transfer` (guards.ts:63). Em SEGUNDOS.
DEFAULT_TRANSFER_COOLDOWN_SECONDS = 300.0

#: Defaults de `settings.schedule` (engine.ts:330-345).
DEFAULT_SCHEDULE_TIMEZONE = "America/Sao_Paulo"
DEFAULT_SCHEDULE_START = "08:00"
DEFAULT_SCHEDULE_END = "18:00"
DEFAULT_SCHEDULE_DAYS = ("mon", "tue", "wed", "thu", "fri")

#: `Intl.DateTimeFormat(..., { weekday: 'short' })` em en-US, minúsculo — a
#: gramática que a UI grava em `schedule.days`.
_WEEKDAY_NAMES = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


@dataclass(frozen=True, slots=True)
class GuardState:
    """O que o espelho legado do inbox sabe desta conversa.

    Vem de `repository/agent.load_legacy_guard_state`. Conversa que ainda não
    existe no espelho chega com tudo zerado/None — o que é a verdade, não um
    default otimista: ninguém transferiu, o bot não respondeu, nenhum humano
    falou.

    `ai_enabled` é o único campo cujo "nada aconteceu" é True: ninguém desligar
    o bot significa bot ligado (a coluna legada é `not null default true`, e o
    TS testa `=== false`). Inverter isso calaria toda conversa sem espelho.
    """

    ai_enabled: bool = True
    ai_agent_id: UUID | None = None
    ai_transferred_at: datetime | None = None
    bot_message_count: int = 0
    last_bot_message_at: datetime | None = None
    has_human_reply: bool = False


@dataclass(frozen=True, slots=True)
class Silence:
    """Um guard calou o turno, e disse por quê.

    `reason` é o vocabulário do TS (`cloud-runner.ts`, campo `skipped`) — o
    mesmo que o badge do inbox já conhece. `detail` é o texto pt-BR que vai
    para o passo `skipped` do run: um agente mudo sem motivo legível é o
    defeito, não a feature.
    """

    reason: str
    detail: str


def normalize_for_match(text: str | None) -> str:
    """Normaliza para casar sem caixa e sem acento (NFD derruba diacríticos).

    Porte de `guards.ts:normalizeForMatch`. "ATENDENTE", "atendente" e
    "atêndente" são a mesma palavra para um cliente com pressa no celular.
    """
    decomposed = unicodedata.normalize("NFD", text or "")
    without_marks = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return without_marks.casefold().strip()


def match_handoff_keyword(
    text: str | None, keywords: Sequence[str] | None
) -> str | None:
    """A keyword configurada (na forma ORIGINAL) que aparece no texto, ou None.

    Substring, não palavra inteira — é o que `guards.ts:matchHandoffKeyword`
    faz, e mudar isso aqui faria a mesma frase transferir num motor e não no
    outro.
    """
    if not keywords:
        return None
    haystack = normalize_for_match(text)
    if not haystack:
        return None
    for keyword in keywords:
        if not isinstance(keyword, str):
            continue
        needle = normalize_for_match(keyword)
        if needle and needle in haystack:
            return keyword
    return None


def find_blocked_topic(
    response: str | None, blocked_topics: Sequence[str] | None
) -> str | None:
    """O tópico proibido presente na RESPOSTA do modelo, ou None.

    Mesma régua do handoff, reuso direto — é o que `guards.ts:findBlockedTopic`
    faz. Moderação mínima e local: sem API externa (YAGNI do TS, mantido).
    """
    return match_handoff_keyword(response, blocked_topics)


@dataclass(frozen=True, slots=True)
class Handoff:
    """O cliente pediu um humano, com todas as palavras.

    `keyword` volta na forma ORIGINAL configurada (é o que o lojista reconhece
    no alerta); `confirmation` é a mensagem opcional que o agente manda antes
    de sair de cena — vazia quer dizer "transfere calado".
    """

    keyword: str
    confirmation: str


def _block(settings: Any, name: str) -> Mapping[str, Any]:
    """Um sub-bloco de `ai_agents.settings`; lixo em jsonb vira bloco vazio."""
    if not isinstance(settings, Mapping):
        return {}
    value = settings.get(name)
    return value if isinstance(value, Mapping) else {}


def behavior_of(settings: Any) -> Mapping[str, Any]:
    return _block(settings, "behavior")


def safety_of(settings: Any) -> Mapping[str, Any]:
    return _block(settings, "safety")


def handoff_keywords(settings: Any) -> tuple[str, ...]:
    raw = safety_of(settings).get("handoff_keywords")
    return tuple(item for item in raw if isinstance(item, str)) if isinstance(raw, list) else ()


def handoff_confirmation_message(settings: Any) -> str:
    raw = safety_of(settings).get("handoff_confirmation_message")
    return raw.strip() if isinstance(raw, str) else ""


def blocked_topics(settings: Any) -> tuple[str, ...]:
    raw = safety_of(settings).get("blocked_topics")
    return tuple(item for item in raw if isinstance(item, str)) if isinstance(raw, list) else ()


def _number(value: Any, default: float | None = None) -> float | None:
    """`Number(x ?? default)` do TS: None cai no default; lixo vira None (NaN).

    O TS trata NaN como "guard desligado" em todos os call sites, e é isso que
    None significa para quem chama aqui.
    """
    if value is None:
        value = default
    if isinstance(value, bool) or value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def is_transfer_cooldown_active(
    transferred_at: datetime | None,
    cooldown_seconds: Any,
    *,
    now: datetime,
) -> bool:
    """Ainda estamos dentro do cooldown pós-transferência para humano?

    Porte de `guards.ts:isTransferCooldownActive`. `ai_transferred_at` NÃO é
    limpo quando um humano religa a IA — logo o cooldown configurado continua
    valendo depois da religada, de propósito: quem transferiu quis silêncio
    pelos segundos que configurou, e o botão de religar não é um pedido para
    falar por cima do atendente.
    """
    if transferred_at is None:
        return False
    seconds = _number(cooldown_seconds, DEFAULT_TRANSFER_COOLDOWN_SECONDS)
    if seconds is None or seconds <= 0:
        return False
    return (now - transferred_at).total_seconds() < seconds


def _hhmm(value: Any, default: str) -> time | None:
    if not isinstance(value, str):
        value = default
    try:
        hours, _, minutes = value.partition(":")
        return time(int(hours), int(minutes))
    except (TypeError, ValueError):
        return None


def is_within_schedule(settings: Any, *, now: datetime) -> bool:
    """Estamos dentro do horário de atendimento configurado (`settings.schedule`)?

    Porte de `engine.ts:checkSchedule` — que o caminho Cloud aplica de fato:
    `cloud-runner.ts:805` chama `createAgentEngine`, e o `processMessage` lança
    "Fora do horário de atendimento" (`engine.ts:86`), que o
    `failure-classifier.ts:15-18` classifica como `skip`. Não é caminho morto.

    Sem bloco, ou com `always_active`, atende sempre. Timezone que o sistema
    não conhece devolve True: silenciar a loja inteira por causa de um typo na
    tela seria pior que o guard não valer nesse caso.
    """
    schedule = _block(settings, "schedule")
    if not schedule or schedule.get("always_active"):
        return True

    try:
        zone = ZoneInfo(str(schedule.get("timezone") or DEFAULT_SCHEDULE_TIMEZONE))
    except (ZoneInfoNotFoundError, ValueError):
        return True

    local = now.astimezone(zone)

    hours = schedule.get("hours") if isinstance(schedule.get("hours"), Mapping) else {}
    start = _hhmm(hours.get("start"), DEFAULT_SCHEDULE_START)
    end = _hhmm(hours.get("end"), DEFAULT_SCHEDULE_END)
    if start is None or end is None:
        return True
    if not (start <= local.time().replace(second=0, microsecond=0) <= end):
        return False

    raw_days = schedule.get("days")
    days = (
        tuple(day.lower() for day in raw_days if isinstance(day, str))
        if isinstance(raw_days, list)
        else DEFAULT_SCHEDULE_DAYS
    )
    return _WEEKDAY_NAMES[local.weekday()] in days


def resolve_handoff(settings: Any, texts: Sequence[str]) -> Handoff | None:
    """O pedido de humano nesta rajada, ou None — cloud-runner.ts:98-167.

    A janela do debounce entrega a rajada inteira e o pedido pode estar em
    qualquer uma das mensagens; o TS checa a mensagem do turno, que é a mesma
    coisa com uma mensagem só.

    Roda ANTES da cascata de chave BYO, de propósito: um cliente pedindo um
    atendente não pode depender de a loja ter uma chave de LLM válida.
    """
    keywords = handoff_keywords(settings)
    if not keywords:
        return None
    for text in texts:
        matched = match_handoff_keyword(text, keywords)
        if matched is not None:
            return Handoff(matched, handoff_confirmation_message(settings))
    return None


def schedule_silence(settings: Any, *, now: datetime) -> Silence | None:
    """O horário de atendimento como silêncio explicável, ou None.

    Separado de `evaluate_inbound_guards` de propósito: no TS o horário é
    checado DENTRO do engine (`engine.ts:85-88`), depois do handoff por
    keyword (`cloud-runner.ts:578-585`). Fundir os dois faria um pedido de
    atendente fora do horário virar silêncio em vez de transferência.
    """
    if is_within_schedule(settings, now=now):
        return None
    return Silence("outside_business_hours", "Fora do horário de atendimento configurado")


def resolve_blocked_topic(settings: Any, draft: str | None) -> str | None:
    """O tópico proibido que o modelo deixou escapar no rascunho, ou None.

    A exceção do item 30: os outros guards decidem sobre o que CHEGOU, este
    decide sobre o que o modelo PRODUZIU — então mora do lado da saída, antes
    do envio, como `cloud-sender.ts:129-163`. Não substitui o Judge 1: o juiz
    tem rubricas próprias e não conhece a lista do lojista.
    """
    return find_blocked_topic(draft, blocked_topics(settings))


def evaluate_inbound_guards(
    settings: Any,
    state: GuardState,
    *,
    agent_id: UUID | None,
    now: datetime,
) -> Silence | None:
    """O primeiro guard que cala este turno, ou None se todos deixam passar.

    A ORDEM é a de `cloud-runner.ts:486-561` e importa para o motivo que o
    lojista lê: uma conversa em cooldown de transferência E no teto de
    respostas é explicada pela transferência, nos dois motores.
    """
    behavior = behavior_of(settings)

    # ai_enabled = false — cloud-runner.ts:390-392 (`skipped: 'ai_disabled'`).
    # PRIMEIRO, como no TS: é o freio da própria transferência (e do botão do
    # inbox), e o motivo que explica o silêncio antes de qualquer knob. O
    # webhook já freia no ingest, mas o runtime tem DOIS produtores de fala —
    # com um deles saindo por fora do ingest, o freio precisa morar onde a
    # decisão mora.
    if state.ai_enabled is False:
        return Silence("ai_disabled", "IA desligada nesta conversa")

    # activate_on: 'manual' — cloud-runner.ts:486-496. O mecanismo de atribuição
    # é o botão do inbox, que grava `ai_agent_id` na conversa; um agente manual
    # só fala na conversa em que alguém o pôs.
    if behavior.get("activate_on") == "manual" and state.ai_agent_id != agent_id:
        return Silence(
            "manual_activation_required",
            "Agente é de ativação manual e não está atribuído a esta conversa",
        )

    # cooldown pós-transferência — cloud-runner.ts:500-513. Roda ANTES de
    # qualquer trabalho caro: silencia cedo, sem custo.
    if is_transfer_cooldown_active(
        state.ai_transferred_at, behavior.get("cooldown_after_transfer"), now=now
    ):
        return Silence(
            "transfer_cooldown",
            "Em cooldown depois de uma transferência para humano",
        )

    # cooldown curto — cloud-runner.ts:515-535. Constante, não knob de loja: é
    # o anti-loop de quem responderia duas vezes à mesma rajada.
    if (
        state.last_bot_message_at is not None
        and (now - state.last_bot_message_at).total_seconds() < RECENT_REPLY_COOLDOWN_SECONDS
    ):
        return Silence("cooldown", "Cooldown: o agente acabou de responder")

    # max_messages_per_conversation — cloud-runner.ts:537-548. Só um positivo
    # liga o teto (`Number(x || 0)` + `> 0`): ausente ou zero é "sem teto".
    ceiling = _number(behavior.get("max_messages_per_conversation"), 0)
    if ceiling is not None and ceiling > 0 and state.bot_message_count >= ceiling:
        return Silence(
            "max_messages",
            f"Limite de {int(ceiling)} resposta(s) por conversa atingido",
        )

    # stop_on_human_reply — cloud-runner.ts:550-560. Default LIGADO (`!== false`)
    # e PERMANENTE por conversa: uma única resposta manual no passado cala o
    # agente nela para sempre. Sem este guard o takeover durava uma mensagem —
    # o atendente respondia e o bot voltava a falar no inbound seguinte, sem
    # saber o que foi dito (ausência 29 do FORK.md, que anda junto desta).
    if behavior.get("stop_on_human_reply") is not False and state.has_human_reply:
        return Silence(
            "stop_on_human",
            "Um humano já respondeu nesta conversa (stop_on_human_reply)",
        )

    return None
