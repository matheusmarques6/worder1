"""A regra pura do engine (§3.3.5): quem autoriza, quanto sai, quando nega.

`decide_emission` é onde a concession vira teto DE VERDADE — o modelo expressa
desejo, o engine decide. Cada linha da tabela de decisão é um teste, porque
cada linha errada é dinheiro saindo sem autorização."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from agents_runtime.agent_core.mission_resolver import ResolvedMission
from agents_runtime.commerce.moments import Moment
from agents_runtime.commerce.offer_engine import (
    OfferRequest,
    _Emission,
    coupon_code_for,
    decide_emission,
)
from agents_runtime.repository.incentives import Grant

NOW = datetime(2026, 8, 13, 12, 0, tzinfo=UTC)


def _mission(concession: dict | None = None) -> ResolvedMission:
    return ResolvedMission(
        mission_version_id=str(uuid.uuid4()),
        event_type="cart.abandoned",
        situation="",
        objective="recuperar",
        success_criteria=(),
        failure_criteria=(),
        tone=None,
        context_fields=(),
        context={},
        tools=(),
        forbidden=(),
        max_turns=3,
        topic_change_policy="cede",
        promote_moment=False,
        concession=concession if concession is not None else {"kind": "none"},
        node_ref=None,
    )


def _moment(offer: dict) -> Moment:
    return Moment(
        id=uuid.uuid4(),
        name="semana-do-cliente",
        public_claim=None,
        offer=offer,
        temp_facts=(),
        forbidden=(),
        priority=0,
        template_readiness={},
    )


def _request(kind: str | None = None, value: Decimal | None = None) -> OfferRequest:
    return OfferRequest(
        organization_id=uuid.uuid4(),
        contact_id=uuid.uuid4(),
        conversation_id=None,
        object_kind="cart",
        object_ref="cart-1",
        requested_kind=kind,
        requested_value=value,
    )


class TestWhoAuthorizes:
    def test_an_active_moment_with_an_offer_wins_over_the_concession(self) -> None:
        moment = _moment({"kind": "percent", "value": 15})
        emission = decide_emission(
            _request(), mission=_mission({"kind": "percent", "max_value": 5}),
            moment=moment, now=NOW,
        )
        assert isinstance(emission, _Emission)
        assert emission.source == "moment"
        assert emission.value == Decimal("15")
        assert emission.moment_id == moment.id
        assert emission.mission_version_id is None

    def test_a_moment_without_an_offer_falls_to_the_mission(self) -> None:
        emission = decide_emission(
            _request(), mission=_mission({"kind": "percent", "max_value": 10}),
            moment=_moment({"kind": "none"}), now=NOW,
        )
        assert isinstance(emission, _Emission)
        assert emission.source == "mission"

    def test_no_authorizer_is_a_denial_with_words(self) -> None:
        verdict = decide_emission(_request(), mission=_mission(), moment=None, now=NOW)
        assert isinstance(verdict, str)
        assert "não autoriza" in verdict


class TestTheCeiling:
    def test_the_wish_is_capped_at_the_concession(self) -> None:
        emission = decide_emission(
            _request(value=Decimal("50")),
            mission=_mission({"kind": "percent", "max_value": 15}),
            moment=None, now=NOW,
        )
        assert isinstance(emission, _Emission)
        assert emission.value == Decimal("15")

    def test_no_wish_means_the_ceiling_itself(self) -> None:
        emission = decide_emission(
            _request(), mission=_mission({"kind": "fixed", "max_value": 30}),
            moment=None, now=NOW,
        )
        assert isinstance(emission, _Emission)
        assert emission.value == Decimal("30")

    def test_a_kind_outside_the_concession_is_refused(self) -> None:
        verdict = decide_emission(
            _request(kind="fixed"),
            mission=_mission({"kind": "percent", "max_value": 10}),
            moment=None, now=NOW,
        )
        assert isinstance(verdict, str)
        assert "fora da concession" in verdict

    def test_free_shipping_needs_no_value(self) -> None:
        emission = decide_emission(
            _request(), mission=_mission({"kind": "free_shipping"}),
            moment=None, now=NOW,
        )
        assert isinstance(emission, _Emission)
        assert emission.value == Decimal("0")

    def test_a_percent_concession_without_a_ceiling_is_unusable(self) -> None:
        verdict = decide_emission(
            _request(), mission=_mission({"kind": "percent"}), moment=None, now=NOW
        )
        assert isinstance(verdict, str)

    def test_validity_hours_come_from_the_concession(self) -> None:
        emission = decide_emission(
            _request(),
            mission=_mission({"kind": "percent", "max_value": 10, "validity_hours": 6}),
            moment=None, now=NOW,
        )
        assert isinstance(emission, _Emission)
        assert emission.validity_until == NOW + timedelta(hours=6)


class TestTheCode:
    def _grant(self, grant_id: uuid.UUID) -> Grant:
        return Grant(
            id=grant_id, organization_id=uuid.uuid4(), contact_id=uuid.uuid4(),
            conversation_id=None, object_kind="cart", object_ref="c", source="mission",
            mission_version_id=None, moment_id=None, kind="percent",
            value=Decimal("10"), validity_until=NOW, max_uses=1, uses=0,
            status="issued", coupon_code=None, idempotency_key="k",
        )

    def test_the_code_is_deterministic_from_the_grant(self) -> None:
        grant_id = uuid.uuid4()
        assert coupon_code_for(self._grant(grant_id)) == coupon_code_for(self._grant(grant_id))

    def test_two_grants_two_codes(self) -> None:
        assert coupon_code_for(self._grant(uuid.uuid4())) != coupon_code_for(
            self._grant(uuid.uuid4())
        )
