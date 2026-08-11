"""A cascata resolvida ANTES do prompt (doc §1.3-1.4) — determinística e pura.

A matriz de merge é o contrato central do produto:
  objetivo/critério/tom  → o nó SUBSTITUI o evento
  o que não fazer        → SOMA (união; ninguém remove proibição de cima)
  tools                  → INTERSEÇÃO em cada camada
  contexto               → SOMA
Uma missão por turno; inbound sem dona ganha a missão DESCOBERTA
(whatsapp.received); família arquivada/inexistente ⇒ o toque NÃO sai.
"""

import pytest

from agents_runtime.agent_core.mission_resolver import (
    DISCOVERY_EVENT,
    MissionUnavailable,
    MissionVersion,
    NodeDelta,
    arbitrate,
    merge_mission,
)


def a_mission(**overrides) -> MissionVersion:
    base = dict(
        id="00000000-0000-0000-0000-00000000aaaa",
        event_type="cart.abandoned",
        situation="Carrinho abandonado há algumas horas.",
        objective="recuperar a compra sem parecer cobrança",
        success_criteria="pessoa volta ao checkout",
        failure_criteria="pessoa pede para parar",
        context_fields=("cart_items", "cart_total"),
        enabled_tools=("search_knowledge", "get_customer_context", "create_coupon"),
        forbidden=("prometer prazo de entrega",),
        max_turns=3,
        topic_change_policy="cede",
        promote_moment=False,
        concession={"kind": "none"},
        tone_delta=None,
    )
    base.update(overrides)
    return MissionVersion(**base)


AGENT_TOOLS = ("search_knowledge", "get_customer_context", "create_coupon", "order_status")


class TestMergeReplaces:
    def test_the_node_objective_replaces_the_mission_objective(self) -> None:
        resolved = merge_mission(
            a_mission(),
            NodeDelta(objective="último toque: oferecer ajuda direta"),
            agent_tools=AGENT_TOOLS,
        )
        assert resolved.objective == "último toque: oferecer ajuda direta"

    def test_without_a_delta_the_mission_objective_stands(self) -> None:
        resolved = merge_mission(a_mission(), None, agent_tools=AGENT_TOOLS)
        assert resolved.objective == "recuperar a compra sem parecer cobrança"

    def test_the_node_tone_replaces_the_mission_tone(self) -> None:
        resolved = merge_mission(
            a_mission(tone_delta="leve"),
            NodeDelta(tone="direto e breve"),
            agent_tools=AGENT_TOOLS,
        )
        assert resolved.tone == "direto e breve"


class TestMergeAccumulates:
    def test_forbidden_is_a_union_and_nothing_is_removed(self) -> None:
        resolved = merge_mission(
            a_mission(forbidden=("prometer prazo de entrega",)),
            NodeDelta(forbidden=("mencionar concorrentes", "prometer prazo de entrega")),
            agent_tools=AGENT_TOOLS,
        )
        assert resolved.forbidden == (
            "prometer prazo de entrega",
            "mencionar concorrentes",
        )

    def test_context_sums_mission_fields_and_node_facts(self) -> None:
        resolved = merge_mission(
            a_mission(context_fields=("cart_items",)),
            NodeDelta(context={"touch_number": 3}),
            agent_tools=AGENT_TOOLS,
        )
        assert resolved.context_fields == ("cart_items",)
        assert resolved.context == {"touch_number": 3}


class TestMergeNarrows:
    def test_tools_are_the_intersection_of_agent_and_mission(self) -> None:
        resolved = merge_mission(
            a_mission(enabled_tools=("search_knowledge", "create_coupon", "ferramenta_fantasma")),
            None,
            agent_tools=AGENT_TOOLS,
        )
        assert resolved.tools == ("search_knowledge", "create_coupon")

    def test_a_node_may_narrow_but_never_add_a_tool(self) -> None:
        resolved = merge_mission(
            a_mission(enabled_tools=("search_knowledge", "create_coupon")),
            NodeDelta(enabled_tools=("create_coupon", "order_status")),
            agent_tools=AGENT_TOOLS,
        )
        # order_status não está na missão: o nó não amplia — só a delegação
        # amplia, e delegação é grant, não tool.
        assert resolved.tools == ("create_coupon",)


class TestResolvedCarriesTheMissionIdentity:
    def test_the_frame_records_which_version_decided(self) -> None:
        mission = a_mission()
        resolved = merge_mission(mission, None, agent_tools=AGENT_TOOLS)
        assert resolved.mission_version_id == mission.id
        assert resolved.event_type == "cart.abandoned"
        assert resolved.concession == {"kind": "none"}
        assert resolved.max_turns == 3


class TestArbitration:
    def test_the_owner_mission_wins_the_turn(self) -> None:
        owner = a_mission()
        discovery = a_mission(
            id="00000000-0000-0000-0000-00000000dddd", event_type=DISCOVERY_EVENT
        )
        winner, losers = arbitrate(owner=owner, discovery=discovery)
        assert winner is owner
        assert losers == ()

    def test_without_an_owner_the_discovery_mission_takes_the_turn(self) -> None:
        discovery = a_mission(
            id="00000000-0000-0000-0000-00000000dddd", event_type=DISCOVERY_EVENT
        )
        winner, losers = arbitrate(owner=None, discovery=discovery)
        assert winner is discovery
        assert losers == ()

    def test_an_archived_owner_falls_back_to_discovery(self) -> None:
        # O resolver carrega a família ATIVA; se a dona apontada na conversa
        # não resolve mais (arquivada), o turno cai para a descoberta em vez
        # de morrer — inbound sempre tem resposta.
        discovery = a_mission(
            id="00000000-0000-0000-0000-00000000dddd", event_type=DISCOVERY_EVENT
        )
        winner, _ = arbitrate(owner=None, discovery=discovery)
        assert winner is discovery

    def test_without_any_mission_the_turn_dies_loudly(self) -> None:
        with pytest.raises(MissionUnavailable):
            arbitrate(owner=None, discovery=None)


class TestDeterminism:
    def test_the_same_inputs_always_produce_the_same_frame(self) -> None:
        mission = a_mission()
        delta = NodeDelta(objective="x", forbidden=("y",))
        first = merge_mission(mission, delta, agent_tools=AGENT_TOOLS)
        second = merge_mission(mission, delta, agent_tools=AGENT_TOOLS)
        assert first == second
