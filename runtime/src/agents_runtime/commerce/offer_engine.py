"""O offer engine — ÚNICO emissor de benefício (invariante §3.4-1).

O nó PEDE · o engine DECIDE · a tool EXECUTA. A decisão, na ordem:

  1. **Reuso** — existe grant vigente para o mesmo benefício no mesmo objeto?
     Devolve ELE (o cliente que pede duas vezes não ganha dois cupons).
  2. **Emissão** — quem autoriza: o MOMENTO ativo com oferta (fonte `moment`,
     valor do momento — não se negocia com panfleto), senão a `concession` da
     missão do turno (fonte `mission`, valor pedido CAPADO no teto — a
     concession limita a emissão, o modelo só expressa desejo).
  3. **Negativa** — sem momento com oferta e com concession `none`, nega; a
     negativa também vira ledger (`denied`), porque "por que o agente não deu
     desconto" é uma pergunta que o lojista faz.

A corrida entre dois fluxos morre na idempotency_key UNIQUE do banco: o
segundo INSERT conflita e RECEBE o grant do primeiro (vira reuso no ledger).

Grant e ledger são gravados na MESMA transação do chamador; este módulo não
abre conexão — orquestra o repository dentro da transação curta de quem pediu.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID

import psycopg

from agents_runtime.agent_core.mission_resolver import ResolvedMission
from agents_runtime.clock import Clock
from agents_runtime.commerce.moments import Moment
from agents_runtime.repository import incentives as incentives_repo
from agents_runtime.repository.incentives import Grant

#: Sem validity na concession, o grant vale isto — curto o bastante para a
#: promessa não sobreviver à conversa esfriar.
DEFAULT_VALIDITY_HOURS = 48


@dataclass(frozen=True, slots=True)
class OfferRequest:
    organization_id: UUID
    contact_id: UUID
    conversation_id: UUID | None
    object_kind: Literal["cart", "checkout", "order"]
    object_ref: str
    #: O que o chamador (nó ou modelo) DESEJA. O engine decide o que sai.
    requested_kind: str | None = None
    requested_value: Decimal | None = None
    node_ref: str | None = None


@dataclass(frozen=True, slots=True)
class Outcome:
    decision: Literal["issued", "reused", "denied"]
    grant: Grant | None
    reason: str


def _idempotency_key(request: OfferRequest, kind: str) -> str:
    return (
        f"{request.organization_id}:{request.contact_id}:"
        f"{request.object_kind}:{request.object_ref}:{kind}"
    )


@dataclass(frozen=True, slots=True)
class _Emission:
    source: str
    kind: str
    value: Decimal
    validity_until: datetime
    max_uses: int
    mission_version_id: UUID | None
    moment_id: UUID | None
    reason: str


def decide_emission(
    request: OfferRequest,
    *,
    mission: ResolvedMission,
    moment: Moment | None,
    now: datetime,
) -> _Emission | str:
    """A regra pura: quem autoriza e quanto. Devolve a emissão ou a razão da
    negativa (string) — decisão separada de I/O para o teste apertar de graça."""
    if moment is not None:
        offer = dict(moment.offer or {})
        kind = str(offer.get("kind") or "none")
        if kind != "none":
            value = Decimal(str(offer.get("value") or 0))
            return _Emission(
                source="moment",
                kind=kind,
                value=value,
                validity_until=now + timedelta(hours=DEFAULT_VALIDITY_HOURS),
                max_uses=1,
                mission_version_id=None,
                moment_id=moment.id,
                reason=f"momento '{moment.name}': {kind} {value}",
            )

    concession = dict(mission.concession or {})
    kind = str(concession.get("kind") or "none")
    if kind == "none":
        return "a missão do turno não autoriza concessão e não há momento com oferta"

    if request.requested_kind is not None and request.requested_kind != kind:
        return (
            f"a missão autoriza {kind}, não {request.requested_kind} — "
            "benefício fora da concession não se emite"
        )

    ceiling = Decimal(str(concession.get("max_value") or 0))
    wished = request.requested_value if request.requested_value is not None else ceiling
    value = min(wished, ceiling) if kind != "free_shipping" else Decimal(0)
    if kind != "free_shipping" and value <= 0:
        return "a concession da missão não tem max_value utilizável"

    hours = int(concession.get("validity_hours") or DEFAULT_VALIDITY_HOURS)
    return _Emission(
        source="mission",
        kind=kind,
        value=value,
        validity_until=now + timedelta(hours=hours),
        max_uses=int(concession.get("max_uses") or 1),
        mission_version_id=UUID(mission.mission_version_id),
        moment_id=None,
        reason=f"missão {mission.event_type}: {kind} {value} (teto {ceiling})",
    )


async def process(
    conn: psycopg.AsyncConnection,
    request: OfferRequest,
    *,
    mission: ResolvedMission,
    moment: Moment | None,
    clock: Clock,
) -> Outcome:
    """O caminho único de emissão. Chamar DENTRO da transação curta do turno."""
    reusable = await incentives_repo.find_reusable_grant(
        conn,
        contact_id=request.contact_id,
        object_kind=request.object_kind,
        object_ref=request.object_ref,
        kind=request.requested_kind,
    )
    if reusable is not None:
        await incentives_repo.append_ledger(
            conn,
            organization_id=request.organization_id,
            contact_id=request.contact_id,
            entry_kind="reused",
            grant_id=reusable.id,
            reason=f"reuso do grant vigente para {request.object_kind} {request.object_ref}",
        )
        return Outcome("reused", reusable, "já havia grant vigente para o objeto")

    emission = decide_emission(request, mission=mission, moment=moment, now=clock.now())
    if isinstance(emission, str):
        await incentives_repo.append_ledger(
            conn,
            organization_id=request.organization_id,
            contact_id=request.contact_id,
            entry_kind="denied",
            grant_id=None,
            reason=emission,
        )
        return Outcome("denied", None, emission)

    grant, created = await incentives_repo.insert_grant(
        conn,
        organization_id=request.organization_id,
        contact_id=request.contact_id,
        conversation_id=request.conversation_id,
        object_kind=request.object_kind,
        object_ref=request.object_ref,
        source=emission.source,
        mission_version_id=emission.mission_version_id,
        moment_id=emission.moment_id,
        node_ref=request.node_ref,
        kind=emission.kind,
        value=emission.value,
        validity_until=emission.validity_until,
        max_uses=emission.max_uses,
        idempotency_key=_idempotency_key(request, emission.kind),
    )
    if not created:
        # O outro fluxo chegou primeiro — o conflito É o desenho (§3.3.5).
        await incentives_repo.append_ledger(
            conn,
            organization_id=request.organization_id,
            contact_id=request.contact_id,
            entry_kind="reused",
            grant_id=grant.id,
            reason="corrida de emissão: recebeu o grant do primeiro fluxo",
        )
        return Outcome("reused", grant, "outro fluxo emitiu primeiro")

    await incentives_repo.append_ledger(
        conn,
        organization_id=request.organization_id,
        contact_id=request.contact_id,
        entry_kind="issued",
        grant_id=grant.id,
        reason=emission.reason,
    )
    return Outcome("issued", grant, emission.reason)


def coupon_code_for(grant: Grant) -> str:
    """Determinístico a partir do grant: o retry do provedor recria o MESMO
    código, e código duplicado no provedor vira sucesso idempotente."""
    return f"WD-{grant.id.hex[:8].upper()}"
