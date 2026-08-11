"""O merge dos momentos (§3.3.4): fatos somam, postura é uma, missão gateia.

Regras pequenas com consequência de dinheiro: se duas promoções virassem duas
posturas, o agente panfletaria em dobro; se a missão de suporte pudesse
promover, todo turno viraria campanha. Cada regra é um teste."""

import uuid

from agents_runtime.agent_core.mission_resolver import ResolvedMission
from agents_runtime.commerce.moments import (
    EMPTY_VIEW,
    Moment,
    apply_moment_restrictions,
    resolve_moments,
)


def _moment(
    *,
    priority: int = 0,
    claim: str | None = "Frete grátis até domingo",
    facts: tuple[str, ...] = (),
    forbidden: tuple[str, ...] = (),
) -> Moment:
    return Moment(
        id=uuid.uuid4(),
        name="promo",
        public_claim=claim,
        offer={"kind": "percent", "value": 10},
        temp_facts=facts,
        forbidden=forbidden,
        priority=priority,
        template_readiness={},
    )


def _mission(forbidden: tuple[str, ...] = ()) -> ResolvedMission:
    return ResolvedMission(
        mission_version_id=str(uuid.uuid4()),
        event_type="whatsapp.received",
        situation="",
        objective="ajudar",
        success_criteria=(),
        failure_criteria=(),
        tone=None,
        context_fields=(),
        context={},
        tools=(),
        forbidden=forbidden,
        max_turns=3,
        topic_change_policy="cede",
        promote_moment=False,
        concession={"kind": "none"},
        node_ref=None,
    )


class TestResolve:
    def test_no_moments_is_the_empty_view(self) -> None:
        assert resolve_moments((), promote=True) is EMPTY_VIEW

    def test_facts_add_up_across_overlapping_moments(self) -> None:
        view = resolve_moments(
            (
                _moment(priority=10, facts=("frete grátis acima de 99",)),
                _moment(priority=0, facts=("troca estendida até janeiro",)),
            ),
            promote=True,
        )
        assert view.facts == ("frete grátis acima de 99", "troca estendida até janeiro")

    def test_the_posture_belongs_to_the_highest_priority_alone(self) -> None:
        leader = _moment(priority=10, claim="10% hoje")
        view = resolve_moments((leader, _moment(priority=0, claim="5% sempre")), promote=True)
        assert view.public_claim == "10% hoje"
        assert view.claim_moment_id == leader.id

    def test_a_mission_that_does_not_promote_gets_facts_but_no_claim(self) -> None:
        view = resolve_moments(
            (_moment(claim="10% hoje", facts=("promo válida até domingo",)),),
            promote=False,
        )
        assert view.public_claim is None
        assert view.claim_moment_id is None
        # A verdade continua lá: suporte não panfleta, mas também não contradiz.
        assert view.facts == ("promo válida até domingo",)

    def test_forbidden_is_the_union_without_duplicates(self) -> None:
        view = resolve_moments(
            (
                _moment(priority=1, forbidden=("prometer prazo", "falar de preço antigo")),
                _moment(priority=0, forbidden=("prometer prazo",)),
            ),
            promote=True,
        )
        assert view.forbidden == ("prometer prazo", "falar de preço antigo")


class TestRestrictionsAccumulate:
    def test_moment_forbidden_lands_on_the_mission(self) -> None:
        mission = _mission(forbidden=("parcelar sem juros",))
        view = resolve_moments((_moment(forbidden=("prometer prazo",)),), promote=False)
        merged = apply_moment_restrictions(mission, view)
        assert merged.forbidden == ("parcelar sem juros", "prometer prazo")

    def test_nothing_to_add_returns_the_same_mission(self) -> None:
        mission = _mission()
        assert apply_moment_restrictions(mission, EMPTY_VIEW) is mission
