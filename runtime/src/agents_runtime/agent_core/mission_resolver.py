"""A cascata resolvida ANTES do prompt (doc-fonte §1.3-1.4).

AGENTE (quem é) → MISSÃO DO EVENTO (o que há) → MISSÃO DO NÓ (onde estamos)
→ DELEGAÇÃO (autorizado — grant, resolvido pelo offer engine, não aqui).

Matriz de merge — o contrato central:
  objetivo / critério de sucesso / tom situacional → o nó SUBSTITUI o evento
  o que não fazer                                  → SOMA (união; ninguém
                                                     remove proibição de cima)
  tools                                            → INTERSEÇÃO em cada camada
  contexto e fatos                                 → SOMA

Uma missão por turno. Inbound sem dona ganha a missão DESCOBERTA
(`whatsapp.received`): classificar a intenção e promover. Família
arquivada/inexistente para um TOQUE ⇒ `MissionUnavailable` — o toque não sai
e vira linha em alerts (quem chama grava); nunca toque sem missão.

Puro de propósito: sem relógio, sem I/O, sem LLM — o mesmo frame para os
mesmos insumos, sempre. Quem carrega os dados é repository/missions.py.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field

DISCOVERY_EVENT = "whatsapp.received"


class MissionUnavailable(LookupError):
    """Nenhuma missão ativa pode assumir o turno. O toque não sai."""


@dataclass(frozen=True)
class MissionVersion:
    """Uma versão do catálogo (linha de ai_missions), como o repositório a lê."""

    id: str
    event_type: str
    situation: str | None
    objective: str
    success_criteria: str | None
    failure_criteria: str | None
    context_fields: tuple[str, ...]
    enabled_tools: tuple[str, ...]
    forbidden: tuple[str, ...]
    max_turns: int
    topic_change_policy: str
    promote_moment: bool
    concession: Mapping
    tone_delta: str | None


@dataclass(frozen=True)
class NodeDelta:
    """O delta do toque, vindo do nó do fluxo (mission_jobs.delta).

    O nó pede; nada aqui amplia poder: tools só estreitam, proibições só
    somam. A delegação (concession_request) NÃO passa por aqui — vai direto
    ao offer engine, que é quem decide dinheiro.
    """

    objective: str | None = None
    tone: str | None = None
    success_criteria: str | None = None
    forbidden: tuple[str, ...] = ()
    enabled_tools: tuple[str, ...] | None = None
    context: Mapping = field(default_factory=dict)


@dataclass(frozen=True)
class ResolvedMission:
    """O frame da missão do turno — insumo do bloco MISSION do compilador."""

    mission_version_id: str
    event_type: str
    situation: str | None
    objective: str
    success_criteria: str | None
    failure_criteria: str | None
    tone: str | None
    context_fields: tuple[str, ...]
    context: Mapping
    tools: tuple[str, ...]
    forbidden: tuple[str, ...]
    max_turns: int
    topic_change_policy: str
    promote_moment: bool
    concession: Mapping
    node_ref: str | None = None


def _union(base: tuple[str, ...], extra: tuple[str, ...]) -> tuple[str, ...]:
    merged = list(base)
    for item in extra:
        if item not in merged:
            merged.append(item)
    return tuple(merged)


def merge_mission(
    mission: MissionVersion,
    delta: NodeDelta | None,
    *,
    agent_tools: tuple[str, ...],
    node_ref: str | None = None,
) -> ResolvedMission:
    """Aplica a matriz de merge da cascata sobre UMA missão vencedora."""
    delta = delta or NodeDelta()

    tools = tuple(t for t in mission.enabled_tools if t in agent_tools)
    if delta.enabled_tools is not None:
        tools = tuple(t for t in tools if t in delta.enabled_tools)

    return ResolvedMission(
        mission_version_id=mission.id,
        event_type=mission.event_type,
        situation=mission.situation,
        objective=delta.objective or mission.objective,
        success_criteria=delta.success_criteria or mission.success_criteria,
        failure_criteria=mission.failure_criteria,
        tone=delta.tone or mission.tone_delta,
        context_fields=mission.context_fields,
        context=dict(delta.context),
        tools=tools,
        forbidden=_union(mission.forbidden, delta.forbidden),
        max_turns=mission.max_turns,
        topic_change_policy=mission.topic_change_policy,
        promote_moment=mission.promote_moment,
        concession=mission.concession,
        node_ref=node_ref,
    )


def arbitrate(
    *,
    owner: MissionVersion | None,
    discovery: MissionVersion | None,
) -> tuple[MissionVersion, tuple[MissionVersion, ...]]:
    """Uma missão vence o turno; as outras viram estado, nunca segundo objetivo.

    v1: a dona da conversa (owner_mission_version_id, posta pelo despacho do
    toque) vence; sem dona resolvível, a descoberta assume. O desempate por
    prioridade de evento (pending_defaults.EVENT_PRIORITY) entra quando dois
    toques disputarem a MESMA janela — chega com o despacho de missão.
    Sem missão nenhuma: o turno morre alto (quem chama grava o alerta).
    """
    if owner is not None:
        return owner, ()
    if discovery is not None:
        return discovery, ()
    raise MissionUnavailable("nenhuma missão ativa para assumir o turno")
