"""O merge dos momentos sobrepostos (§3.3.4): fatos SOMAM, postura é UMA.

Duas promoções ao mesmo tempo não viram duas posturas promocionais — a de
maior prioridade fala; as outras existem como fatos (a IA não pode contradizer
uma promo vigente nem quando não a está promovendo). E a frase pública só
entra quando a MISSÃO do turno pode promover (`promote_moment`): missão de
suporte não vira panfleto, mas também não mente sobre o frete grátis.
"""

from collections.abc import Mapping
from dataclasses import dataclass, replace
from uuid import UUID

from agents_runtime.agent_core.mission_resolver import ResolvedMission


@dataclass(frozen=True, slots=True)
class Moment:
    """Uma linha de commercial_moments, já materializada (repository lê)."""

    id: UUID
    name: str
    #: A frase que a IA PODE afirmar — fora dela, momento não vira promessa.
    public_claim: str | None
    #: {kind, value, coupon_code?, auto_apply} — o benefício do momento.
    offer: Mapping
    #: Verdades que só valem na janela.
    temp_facts: tuple[str, ...]
    forbidden: tuple[str, ...]
    priority: int
    #: Por canal; o preflight do sender re-checa a cada envio.
    template_readiness: Mapping


@dataclass(frozen=True, slots=True)
class MomentView:
    """O que do(s) momento(s) chega ao turno — já arbitrado."""

    moment_ids: tuple[UUID, ...]
    #: Todas as verdades da janela, de todos os momentos ativos.
    facts: tuple[str, ...]
    #: A frase promocional — só a do momento de maior prioridade, e só quando
    #: a missão promove. None = nenhum panfleto neste turno.
    public_claim: str | None
    #: O momento dono da postura (e da oferta), para trilha e grants.
    claim_moment_id: UUID | None
    #: Restrições somadas de todos os ativos (restrição acumula, §3.4-5).
    forbidden: tuple[str, ...]


EMPTY_VIEW = MomentView(
    moment_ids=(), facts=(), public_claim=None, claim_moment_id=None, forbidden=()
)


def resolve_moments(moments: tuple[Moment, ...], *, promote: bool) -> MomentView:
    """`moments` já vem por prioridade (repository); o primeiro é a postura."""
    if not moments:
        return EMPTY_VIEW

    facts: list[str] = []
    forbidden: list[str] = []
    for moment in moments:
        facts.extend(moment.temp_facts)
        forbidden.extend(item for item in moment.forbidden if item not in forbidden)

    leader = moments[0]
    claim = leader.public_claim if promote else None
    return MomentView(
        moment_ids=tuple(moment.id for moment in moments),
        facts=tuple(facts),
        public_claim=claim,
        claim_moment_id=leader.id if claim else None,
        forbidden=tuple(forbidden),
    )


def apply_moment_restrictions(mission: ResolvedMission, view: MomentView) -> ResolvedMission:
    """Restrição acumula (§3.4-5): o que o momento proíbe entra no turno junto
    com o que a missão proíbe — nunca o contrário."""
    if not view.forbidden:
        return mission
    merged = mission.forbidden + tuple(
        item for item in view.forbidden if item not in mission.forbidden
    )
    return replace(mission, forbidden=merged)
