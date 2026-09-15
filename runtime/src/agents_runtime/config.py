"""Os valores canônicos, num lugar só.

A tabela do `CLAUDE.md` é a fonte; isto é a transcrição dela em código, e a
composição (`app.py`) é quem lê. Um número dessa tabela escrito num call site é
um número que vai divergir do documento na primeira vez que alguém mudar um dos
dois — e ninguém vai notar, porque os dois "funcionam".

Tudo é `frozen` e recebido por parâmetro em vez de importado onde se usa: é o
que deixa a suíte de `pipeline` rodar com um debounce de 20ms em vez de esperar
dez segundos de verdade, sem que a regra saiba que está sendo testada.
"""

from dataclasses import dataclass, field
from datetime import timedelta

from agents_runtime.queueing import DOMAIN_EVENTS, EVALS, INBOUND

_PG_INT_MAX = 2_147_483_647


def _weights() -> dict[str, int]:
    """8 : 4 : 1 — sem slots para a fila scheduled reservada (Wave 4)."""
    return {INBOUND: 8, DOMAIN_EVENTS: 4, EVALS: 1}


def _retry_limits() -> dict[str, int]:
    """Quantas vezes cada fila insiste antes da DLQ."""
    return {INBOUND: 5, DOMAIN_EVENTS: 5, EVALS: 2}


@dataclass(frozen=True)
class QueueingConfig:
    """Filas, esperas e prazos."""

    # Limites operacionais (Wave 3): o turno cobre só a fase 2; cleanup,
    # conexão, statements e health têm orçamentos próprios.
    turn_timeout: timedelta = timedelta(seconds=90)
    connect_timeout_seconds: int = 3
    statement_timeout_ms: int = 15_000
    probe_timeout: timedelta = timedelta(seconds=4)
    cleanup_timeout: timedelta = timedelta(seconds=10)

    # Visibilidade e sinal de vida: o heartbeat renova antes do VT vencer, com
    # folga de 15s para uma rede ruim não custar uma reentrega.
    visibility_timeout: timedelta = timedelta(seconds=60)
    heartbeat_every: timedelta = timedelta(seconds=45)

    # A lease da conversa (ADR-6): renovável pelo heartbeat acima enquanto a
    # FASE 2 durar. Vencida, é lease livre — é assim que o trabalho de um
    # processo morto volta a ser feito.
    conversation_lease: timedelta = timedelta(minutes=2)

    # Debounce da entrada e o tique do coalescer.
    inbound_debounce: timedelta = timedelta(seconds=10)
    coalescer_tick: timedelta = timedelta(seconds=2)

    # A escada da arquitetura: 30s, 2min, 8min… O teto não morde nos limites
    # atuais (cinco tentativas param em ~34 min); existe para o dia em que um
    # limite subir sem ninguém reler esta conta.
    backoff_base: timedelta = timedelta(seconds=30)
    backoff_factor: int = 4
    backoff_cap: timedelta = timedelta(hours=1)
    # ±20% em volta da escada. Espalha o rebanho que falhou junto sem que os
    # números documentados deixem de ser o que se observa.
    jitter_ratio: float = 0.2

    weights: dict[str, int] = field(default_factory=_weights)
    retry_limits: dict[str, int] = field(default_factory=_retry_limits)

    # Promoção por idade: o custo de um evento atrasado cresce com o atraso.
    promote_domain_after: timedelta = timedelta(minutes=2)

    # Válido SÓ enquanto o runtime for um processo asyncio único (ADR-2). Ir a
    # multi-processo exige migrar isto para uma lease distribuída antes.
    tenant_concurrency: int = 3

    # --- the composition's own rhythms (E1 · PR 2a) -------------------------
    # A conversation someone else holds is retried shortly — 'shortly' because
    # the other worker usually finishes within its lease, not within ours.
    busy_retry: timedelta = timedelta(seconds=2)
    # How long a poll loop rests when every queue it serves is empty.
    idle_pause: timedelta = timedelta(seconds=1)
    sender_poll: timedelta = timedelta(seconds=1)
    # The milestone proof is 'heartbeat ≤ 3 min'; beating every 30s leaves five
    # missed beats of slack before the alert would fire.
    process_heartbeat_every: timedelta = timedelta(seconds=30)

    # The outbox claim lease. Expired mid-'sending' means the sender died with
    # the outcome unknown — the sweep turns that into state, never a resend.
    send_lease: timedelta = timedelta(seconds=60)
    # Humanização (Adendo §B 8.3): bolhas sempre; os DELAYS entre elas são
    # opt-out — a suíte desliga para não medir ritmo em teste de regra.
    humanize_delays: bool = True
    # How long an unknown may wait for correlation evidence before a human is
    # asked. DECISION, not canon: 5 minutes chosen here (status webhooks land
    # in seconds); the canonical table should absorb or veto it (pendência).
    unknown_review_after: timedelta = timedelta(minutes=5)

    def __post_init__(self) -> None:
        for name in ("turn_timeout", "probe_timeout", "cleanup_timeout"):
            value = getattr(self, name)
            if not isinstance(value, timedelta) or value <= timedelta(0):
                raise ValueError(f"{name} must be a positive duration")
        for name in ("connect_timeout_seconds", "statement_timeout_ms"):
            value = getattr(self, name)
            if (
                not isinstance(value, int)
                or isinstance(value, bool)
                or not 0 < value <= _PG_INT_MAX
            ):
                raise ValueError(f"{name} must be a positive PostgreSQL integer")


def config_from_env(environ: "dict[str, str]") -> QueueingConfig:
    """The canonical defaults, overridable per environment.

    This exists for exactly one consumer: the pipeline suite, which runs the
    real process with a 50ms coalescer tick instead of waiting two real
    seconds per tick. Production sets none of these and gets the CLAUDE.md
    table verbatim.
    """

    def _ms(name: str, fallback: timedelta) -> timedelta:
        raw = environ.get(name)
        return timedelta(milliseconds=int(raw)) if raw else fallback

    def _turn_ms() -> timedelta:
        if "AGENTS_TURN_TIMEOUT_MS" not in environ:
            return base.turn_timeout
        raw = environ["AGENTS_TURN_TIMEOUT_MS"]
        if (
            not isinstance(raw, str)
            or not raw.isascii()
            or not raw.isdecimal()
            or int(raw) <= 0
        ):
            raise ValueError("AGENTS_TURN_TIMEOUT_MS must be a positive integer")
        return timedelta(milliseconds=int(raw))

    base = QueueingConfig()
    return QueueingConfig(
        turn_timeout=_turn_ms(),
        visibility_timeout=_ms("AGENTS_VT_MS", base.visibility_timeout),
        heartbeat_every=_ms("AGENTS_WORK_HEARTBEAT_MS", base.heartbeat_every),
        conversation_lease=_ms("AGENTS_LEASE_MS", base.conversation_lease),
        coalescer_tick=_ms("AGENTS_COALESCER_TICK_MS", base.coalescer_tick),
        busy_retry=_ms("AGENTS_BUSY_RETRY_MS", base.busy_retry),
        idle_pause=_ms("AGENTS_IDLE_PAUSE_MS", base.idle_pause),
        sender_poll=_ms("AGENTS_SENDER_POLL_MS", base.sender_poll),
        process_heartbeat_every=_ms(
            "AGENTS_PROCESS_HEARTBEAT_MS", base.process_heartbeat_every
        ),
        send_lease=_ms("AGENTS_SEND_LEASE_MS", base.send_lease),
        humanize_delays=(
            environ.get("AGENTS_HUMANIZE_DELAYS", "").strip().lower()
            not in ("off", "0", "false")
        ),
        unknown_review_after=_ms("AGENTS_REVIEW_MS", base.unknown_review_after),
        backoff_base=_ms("AGENTS_BACKOFF_BASE_MS", base.backoff_base),
        backoff_cap=_ms("AGENTS_BACKOFF_CAP_MS", base.backoff_cap),
    )
