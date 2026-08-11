"""`create_coupon` — a única mão que entrega dinheiro, e ela exige o grant.

O nó PEDE · o engine DECIDE · esta tool EXECUTA (doc §2, decisão de fronteira).
Dois caminhos, um invariante:

  * **com `grant_id`**: valida O GRANT — existe, é desta conversa (contato do
    job, nunca dos argumentos), não expirou, não consumiu, objeto certo, e o
    que o modelo está prestes a prometer bate com o que o grant autoriza.
    NUNCA revalida contra a concession da missão do turno: reuso legítimo de
    um grant de momento não pode quebrar (§3.3.5);
  * **sem `grant_id`**: pede ao offer_engine (o ÚNICO emissor) — que reusa,
    emite capado na concession, ou NEGA. A negativa volta como resultado
    (success=True, decision='denied') para o agente responder com honestidade,
    não como erro.

A ordem das transações é o ADR-6 aplicado a dinheiro: grant+ledger comitam
ANTES do provedor; o código é determinístico do grant (retry recria o mesmo);
o código comita DEPOIS. Morte no meio deixa um grant emitido sem código — e o
retry termina o serviço sem emitir de novo.
"""

from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

import httpx
import psycopg

from agents_runtime.agent_core.mission_resolver import ResolvedMission
from agents_runtime.agent_core.providers import decode_stored_key
from agents_runtime.clock import Clock, SystemClock
from agents_runtime.commerce.moments import Moment
from agents_runtime.commerce.offer_engine import (
    OfferRequest,
    Outcome,
    coupon_code_for,
    process,
)
from agents_runtime.connectors import shopify
from agents_runtime.repository import contacts as contacts_repo
from agents_runtime.repository import incentives as incentives_repo
from agents_runtime.repository import stores as stores_repo
from agents_runtime.repository.incentives import Grant
from agents_runtime.repository.scope import scope_to_organization
from agents_runtime.tools.base import ToolContext, ToolResult, require_text

OBJECT_KINDS = ("cart", "checkout", "order")
BENEFIT_KINDS = ("percent", "fixed", "free_shipping")


def _optional_decimal(arguments: Mapping[str, Any], key: str) -> Decimal | None:
    value = arguments.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise ValueError(f"{key}: número esperado, veio {type(value).__name__}")
    try:
        return Decimal(str(value))
    except InvalidOperation as exc:
        raise ValueError(f"{key}: número inválido: {value!r}") from exc


class CreateCoupon:
    name = "create_coupon"

    def __init__(
        self,
        *,
        mission: ResolvedMission,
        moment: Moment | None = None,
        base_secret: str | None = None,
        clock: Clock | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._mission = mission
        self._moment = moment
        self._base_secret = base_secret
        self._clock = clock or SystemClock()
        self._transport = transport

    async def __call__(
        self,
        conn: psycopg.AsyncConnection,
        context: ToolContext,
        arguments: Mapping[str, Any],
    ) -> ToolResult:
        object_kind = require_text(arguments, "object_kind")
        if object_kind not in OBJECT_KINDS:
            return self._error(f"object_kind: {object_kind!r} não é um de {OBJECT_KINDS}")
        object_ref = require_text(arguments, "object_ref")

        requested_kind = arguments.get("kind")
        if requested_kind is not None:
            requested_kind = require_text(arguments, "kind")
            if requested_kind not in BENEFIT_KINDS:
                return self._error(f"kind: {requested_kind!r} não é um de {BENEFIT_KINDS}")
        try:
            requested_value = _optional_decimal(arguments, "value")
        except ValueError as exc:
            return self._error(str(exc))

        grant_id_raw = arguments.get("grant_id")

        # --- transação curta 1: contato do job + decisão/validação ----------
        async with conn.transaction():
            await scope_to_organization(conn, context.organization_id)
            contact_id = await contacts_repo.contact_id_of_conversation(
                conn, conversation_id=context.conversation_id
            )
            if contact_id is None:
                return self._error("conversa não encontrada para este tenant")

            if grant_id_raw is not None:
                grant, problem = await self._validated_grant(
                    conn,
                    grant_id_raw=str(grant_id_raw),
                    contact_id=contact_id,
                    object_kind=object_kind,
                    object_ref=object_ref,
                    requested_kind=requested_kind,
                    requested_value=requested_value,
                )
                if problem is not None:
                    return self._error(problem)
                decision, reason = "reused", "executado contra o grant informado"
            else:
                outcome: Outcome = await process(
                    conn,
                    OfferRequest(
                        organization_id=context.organization_id,
                        contact_id=contact_id,
                        conversation_id=context.conversation_id,
                        object_kind=object_kind,
                        object_ref=object_ref,
                        requested_kind=requested_kind,
                        requested_value=requested_value,
                    ),
                    mission=self._mission,
                    moment=self._moment,
                    clock=self._clock,
                )
                if outcome.decision == "denied":
                    # Negativa é RESPOSTA, não erro: o agente precisa lê-la
                    # para dizer um não honesto ao cliente.
                    return ToolResult(
                        tool=self.name,
                        success=True,
                        output={"decision": "denied", "reason": outcome.reason},
                    )
                grant = outcome.grant
                decision, reason = outcome.decision, outcome.reason

        # --- provedor, SEM transação aberta (ADR-6 sobre dinheiro) ----------
        if grant.coupon_code is not None:
            code = grant.coupon_code
        else:
            code = coupon_code_for(grant)
            async with conn.transaction():
                await scope_to_organization(conn, context.organization_id)
                store = await stores_repo.load_active_store(
                    conn, organization_id=context.organization_id
                )
            if store is None:
                return self._error(
                    "a organização não tem loja conectada — o grant fica emitido "
                    f"({grant.id}) e o cupom sai quando houver loja"
                )
            token = decode_stored_key(
                store.stored_access_token, base_secret=self._base_secret
            )
            try:
                await shopify.create_discount(
                    shopify.ShopifyStore(
                        shop_domain=store.shop_domain,
                        access_token=token,
                        currency=store.currency,
                    ),
                    code=code,
                    kind=grant.kind,
                    value=grant.value,
                    validity_until=grant.validity_until,
                    max_uses=grant.max_uses,
                    transport=self._transport,
                )
            except (shopify.ShopifyError, httpx.HTTPError) as exc:
                return self._error(
                    f"provedor falhou ({exc}); grant {grant.id} segue emitido, "
                    "o retry recria o MESMO código"
                )

            # --- transação curta 2: o código comita depois do provedor ------
            async with conn.transaction():
                await scope_to_organization(conn, context.organization_id)
                await incentives_repo.record_coupon_code(conn, grant.id, code)

        return ToolResult(
            tool=self.name,
            success=True,
            output={
                "decision": decision,
                "reason": reason,
                "grant_id": str(grant.id),
                "coupon_code": code,
                "kind": grant.kind,
                "value": str(grant.value),
                "valid_until": grant.validity_until.isoformat(),
            },
        )

    async def _validated_grant(
        self,
        conn: psycopg.AsyncConnection,
        *,
        grant_id_raw: str,
        contact_id: UUID,
        object_kind: str,
        object_ref: str,
        requested_kind: str | None,
        requested_value: Decimal | None,
    ) -> tuple[Grant | None, str | None]:
        """A tabela-verdade da execução: o GRANT é a autoridade, item a item."""
        try:
            grant_id = UUID(grant_id_raw)
        except ValueError:
            return None, f"grant_id: uuid inválido: {grant_id_raw!r}"

        grant = await incentives_repo.load_grant(conn, grant_id)
        if grant is None:
            return None, "o grant não existe (ou não é desta organização)"
        if grant.contact_id != contact_id:
            return None, "o grant pertence a outro contato — não é desta conversa"
        if grant.status != "issued":
            return None, f"o grant está '{grant.status}', não 'issued'"
        if grant.validity_until <= self._clock.now():
            return None, "o grant expirou"
        if grant.uses >= grant.max_uses:
            return None, "o grant já consumiu todos os usos"
        if (grant.object_kind, grant.object_ref) != (object_kind, object_ref):
            return None, (
                f"o grant autoriza {grant.object_kind} {grant.object_ref}, "
                f"não {object_kind} {object_ref}"
            )
        if requested_kind is not None and requested_kind != grant.kind:
            return None, f"o grant autoriza {grant.kind}, não {requested_kind}"
        if requested_value is not None and requested_value != grant.value:
            return None, (
                f"o valor prometido ({requested_value}) não bate com o do grant "
                f"({grant.value})"
            )
        return grant, None

    def _error(self, message: str) -> ToolResult:
        return ToolResult(tool=self.name, success=False, error=message)
