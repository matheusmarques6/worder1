"""As ferramentas do catálogo, no runtime (alteração 2026-10-15-06).

Porte de `src/lib/ai/tools/handlers/*.ts` com as mesmas regras de produto:

  * `product_lookup` e `order_status` exigem loja Shopify conectada
    (`requiresStore` no catálogo da UI) — sem loja a ferramenta nem é
    oferecida ao modelo;
  * `save_customer` e `save_interests` nunca inventam dado: gravam o que o
    modelo diz que o CLIENTE informou, e o escopo (contato, org) vem do
    `ToolContext`, nunca dos argumentos;
  * `timeline` lê ou registra atividades do contato;
  * `transfer_to_human` tira a IA de cena com um MOTIVO codificado, que a
    tela Atividade do novo hub agrega ("por que transferiram").

Nenhuma delas abre a porta do dinheiro: `create_coupon` continua sozinha
nesse papel e só entra pela interseção missão∩agente (`responder.py`).

Toda execução passa por `run_tool` (base.py): trilha em `internal.tool_calls`,
span `tool_call`, falha vira resposta e nunca mata o turno.
"""

import re
import unicodedata
from collections.abc import Mapping
from decimal import Decimal
from typing import Any

from agents_runtime.agent_core.handoff import transfer_to_human
from agents_runtime.agent_core.llm import ToolSpec
from agents_runtime.repository import agent as agent_repo
from agents_runtime.repository import catalog as catalog_repo
from agents_runtime.repository import crm as crm_repo
from agents_runtime.repository import knowledge as knowledge_repo
from agents_runtime.repository import orders as orders_repo
from agents_runtime.repository.scope import scope_to_organization
from agents_runtime.tools.base import ToolContext, ToolResult

#: Os motivos que a tela Atividade agrega ("Por que transferiram"). O modelo
#: escolhe um; qualquer outra coisa vira `other`.
HANDOFF_REASONS = (
    "asked_human",
    "discount_over_limit",
    "complaint",
    "health_topic",
    "no_knowledge",
    "other",
)

MAX_PRODUCTS = 5
MAX_ORDERS = 3


def _text(arguments: Mapping[str, Any], key: str) -> str:
    value = arguments.get(key)
    return value.strip() if isinstance(value, str) else ""


def _strings(arguments: Mapping[str, Any], key: str) -> tuple[str, ...]:
    value = arguments.get(key)
    if not isinstance(value, list):
        return ()
    seen: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip() and item.strip() not in seen:
            seen.append(item.strip())
    return tuple(seen)


def _digits(value: str | None) -> str:
    return re.sub(r"\D+", "", value or "")


def _money(value: Decimal | None) -> str | None:
    return f"{value:.2f}" if value is not None else None


def slugify(value: str) -> str:
    text = unicodedata.normalize("NFD", value.lower())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:80]


# ----------------------------------------------------------------------------
# product_lookup
# ----------------------------------------------------------------------------
class ProductLookup:
    name = "product_lookup"

    async def __call__(
        self, conn: Any, context: ToolContext, arguments: Mapping[str, Any]
    ) -> ToolResult:
        query = _text(arguments, "query")
        if not query:
            return ToolResult(self.name, False, error="query vazia")
        async with conn.transaction():
            await scope_to_organization(conn, context.organization_id)
            rows = await catalog_repo.search_products(
                conn, organization_id=context.organization_id, query=query, limit=MAX_PRODUCTS
            )
        if not rows:
            return ToolResult(
                self.name,
                True,
                {
                    "found": False,
                    "message": "Nenhum produto encontrado para a busca.",
                    "products": [],
                },
            )
        products = []
        for row in rows:
            inventory = row.inventory_quantity
            available = (
                row.available
                if row.available is not None
                else (row.status == "active" and (inventory is None or inventory > 0))
            )
            variants = [
                {
                    "title": v.get("title") or v.get("option1"),
                    "sku": v.get("sku"),
                    "price": v.get("price"),
                    "available": (
                        v["inventory_quantity"] > 0
                        if isinstance(v.get("inventory_quantity"), int)
                        else v.get("available")
                    ),
                }
                for v in row.variants[:10]
                if isinstance(v, dict)
            ]
            products.append(
                {
                    "title": row.title,
                    "price": _money(row.price),
                    "compare_at_price": _money(row.compare_at_price),
                    "sku": row.sku,
                    "inventory_quantity": inventory,
                    "available": bool(available),
                    "variants": variants,
                }
            )
        return ToolResult(
            self.name, True, {"found": True, "count": len(products), "products": products}
        )


PRODUCT_LOOKUP_SPEC = ToolSpec(
    name="product_lookup",
    description=(
        "Busca produtos da loja por nome ou SKU e devolve preço, disponibilidade/estoque "
        "e variantes. Use quando o cliente perguntar sobre um produto, preço, "
        "disponibilidade ou tamanhos/variantes."
    ),
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Nome do produto (busca parcial) ou SKU a procurar.",
            }
        },
        "required": ["query"],
    },
)


# ----------------------------------------------------------------------------
# order_status
# ----------------------------------------------------------------------------
_NO_TRACKING = (
    "Sem rastreio disponível (ainda não enviado ou transportadora fora do Shopify)."
)
_FULFILLMENT_TEXT = {
    "fulfilled": "Pedido enviado/concluído.",
    "partial": "Envio parcial.",
    "restocked": "Itens devolvidos ao estoque.",
}


class OrderStatus:
    name = "order_status"

    async def __call__(
        self, conn: Any, context: ToolContext, arguments: Mapping[str, Any]
    ) -> ToolResult:
        order_number = _digits(_text(arguments, "order_number"))
        email = _text(arguments, "email").lower()
        phone_digits = _digits(context.phone)
        if not order_number and not email and not phone_digits:
            return ToolResult(
                self.name, False, error="informe número do pedido ou e-mail para localizar o pedido"
            )
        async with conn.transaction():
            await scope_to_organization(conn, context.organization_id)
            rows = await orders_repo.find_orders(
                conn,
                organization_id=context.organization_id,
                contact_id=context.contact_id,
                order_number=order_number or None,
                email=email or None,
                phone_digits=phone_digits or None,
                limit=MAX_ORDERS,
            )
        if not rows:
            return ToolResult(
                self.name,
                True,
                {"found": False, "message": "Nenhum pedido encontrado com os dados informados."},
            )
        orders = [
            {
                "order_number": row.label,
                "financial_status": row.financial_status or "pending",
                "fulfillment_status": row.fulfillment_status,
                "fulfillment_description": _FULFILLMENT_TEXT.get(
                    (row.fulfillment_status or "").lower(),
                    row.fulfillment_status
                    or _NO_TRACKING,
                ),
                "total_price": _money(row.total),
                "currency": row.currency,
                "created_at": row.placed_at.isoformat() if row.placed_at else None,
                "items_count": row.items_count,
            }
            for row in rows
        ]
        return ToolResult(self.name, True, {"found": True, "count": len(orders), "orders": orders})


ORDER_STATUS_SPEC = ToolSpec(
    name="order_status",
    description=(
        "Consulta o status de um pedido da loja (pagamento, envio). Use quando o cliente "
        "perguntar sobre o status, rastreio ou andamento de um pedido. Pode buscar por "
        "número do pedido ou e-mail; o telefone do cliente é usado automaticamente."
    ),
    parameters={
        "type": "object",
        "properties": {
            "order_number": {"type": "string", "description": "Número do pedido, se informado."},
            "email": {"type": "string", "description": "E-mail usado na compra, se informado."},
        },
        "required": [],
    },
)


# ----------------------------------------------------------------------------
# timeline
# ----------------------------------------------------------------------------
class Timeline:
    name = "timeline"

    async def __call__(
        self, conn: Any, context: ToolContext, arguments: Mapping[str, Any]
    ) -> ToolResult:
        if context.contact_id is None:
            return ToolResult(
                self.name, False, error="sem contato para consultar/registrar timeline"
            )
        action = _text(arguments, "action")
        if action not in ("read", "add"):
            return ToolResult(self.name, False, error='action inválida: use "read" ou "add"')
        async with conn.transaction():
            await scope_to_organization(conn, context.organization_id)
            if action == "read":
                rows = await crm_repo.recent_activities(
                    conn, organization_id=context.organization_id, contact_id=context.contact_id
                )
                activities = [
                    {
                        "type": row.type,
                        "title": row.title,
                        "description": row.description,
                        "created_at": row.created_at.isoformat() if row.created_at else None,
                    }
                    for row in rows
                ]
                return ToolResult(
                    self.name, True, {"count": len(activities), "activities": activities}
                )
            title = _text(arguments, "title")
            if not title:
                return ToolResult(self.name, False, error="title é obrigatório para add")
            kind = _text(arguments, "type").lower() or "note"
            activity_id = await crm_repo.add_activity(
                conn,
                organization_id=context.organization_id,
                contact_id=context.contact_id,
                conversation_id=context.conversation_id,
                type=kind,
                title=title,
                description=_text(arguments, "description") or None,
                metadata={
                    "source": "ai_agent",
                    "agent_id": str(context.agent_id) if context.agent_id else None,
                    "conversation_id": str(context.conversation_id),
                },
            )
        return ToolResult(self.name, True, {"added": True, "activity_id": str(activity_id)})


TIMELINE_SPEC = ToolSpec(
    name="timeline",
    description=(
        'Consulta (action="read") ou registra (action="add") atividades no histórico do '
        'contato. Use "read" para entender o histórico antes de responder; "add" para '
        "registrar uma observação relevante da conversa atual."
    ),
    parameters={
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": ["read", "add"]},
            "type": {"type": "string", "description": "Tipo da atividade (add). Padrão: note."},
            "title": {"type": "string", "description": "Título curto (obrigatório para add)."},
            "description": {"type": "string", "description": "Detalhe (opcional, add)."},
        },
        "required": ["action"],
    },
)


# ----------------------------------------------------------------------------
# save_customer
# ----------------------------------------------------------------------------
class SaveCustomer:
    name = "save_customer"

    async def __call__(
        self, conn: Any, context: ToolContext, arguments: Mapping[str, Any]
    ) -> ToolResult:
        phone = (context.phone or "").strip()
        if not phone and context.contact_id is None:
            return ToolResult(self.name, False, error="sem telefone nem contato para identificar")
        name = _text(arguments, "name") or None
        email = _text(arguments, "email").lower() or None
        tags = _strings(arguments, "tags")
        custom = arguments.get("custom_fields")
        custom_fields = dict(custom) if isinstance(custom, Mapping) else None
        async with conn.transaction():
            await scope_to_organization(conn, context.organization_id)
            existing = await crm_repo.find_contact(
                conn,
                organization_id=context.organization_id,
                contact_id=context.contact_id,
                phone=phone or None,
                email=email,
            )
            if existing is not None:
                merged_tags = tuple(dict.fromkeys((*existing.tags, *tags))) if tags else None
                merged_fields = (
                    {**existing.custom_fields, **custom_fields} if custom_fields else None
                )
                await crm_repo.update_contact(
                    conn,
                    organization_id=context.organization_id,
                    contact_id=existing.id,
                    first_name=name,
                    email=email,
                    tags=merged_tags,
                    custom_fields=merged_fields,
                )
                return ToolResult(
                    self.name, True, {"contact_id": str(existing.id), "created": False}
                )
            created = await crm_repo.insert_contact(
                conn,
                organization_id=context.organization_id,
                phone=phone or None,
                first_name=name,
                email=email,
                tags=tags,
                custom_fields=custom_fields or {},
            )
        return ToolResult(self.name, True, {"contact_id": str(created), "created": True})


SAVE_CUSTOMER_SPEC = ToolSpec(
    name="save_customer",
    description=(
        "Salva ou atualiza os dados de contato do cliente no CRM (nome, e-mail, etiquetas, "
        "campos personalizados). Use quando o cliente informar nome, e-mail ou outra "
        "informação de cadastro. Não invente dados."
    ),
    parameters={
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "email": {"type": "string"},
            "tags": {"type": "array", "items": {"type": "string"}},
            "custom_fields": {"type": "object", "additionalProperties": True},
        },
        "required": [],
    },
)


# ----------------------------------------------------------------------------
# save_interests
# ----------------------------------------------------------------------------
class SaveInterests:
    name = "save_interests"

    async def __call__(
        self, conn: Any, context: ToolContext, arguments: Mapping[str, Any]
    ) -> ToolResult:
        interests = _strings(arguments, "interests")
        product_name = _text(arguments, "product_name")
        product_id = _text(arguments, "product_id")
        if not interests and not product_name and not product_id:
            return ToolResult(self.name, False, error="nenhum interesse informado")
        if context.contact_id is None and not context.phone:
            return ToolResult(self.name, False, error="sem contato para associar o interesse")
        out: dict[str, Any] = {}
        async with conn.transaction():
            await scope_to_organization(conn, context.organization_id)
            contact = await crm_repo.find_contact(
                conn,
                organization_id=context.organization_id,
                contact_id=context.contact_id,
                phone=context.phone,
            )
            interest_tags = tuple(
                f"interesse:{item}" for item in (*interests, product_name) if item
            )
            if contact is not None and interest_tags:
                merged = tuple(dict.fromkeys((*contact.tags, *interest_tags)))
                if len(merged) != len(contact.tags):
                    await crm_repo.update_contact(
                        conn,
                        organization_id=context.organization_id,
                        contact_id=contact.id,
                        first_name=None,
                        email=None,
                        tags=merged,
                        custom_fields=None,
                    )
                    out["tags_added"] = list(interest_tags)
                else:
                    out["tags_added"] = []
            effective_id = product_id or (f"name:{slugify(product_name)}" if product_name else "")
            target = contact.id if contact is not None else context.contact_id
            if effective_id and target is not None:
                if not await crm_repo.product_interest_exists(
                    conn,
                    organization_id=context.organization_id,
                    contact_id=target,
                    product_id=effective_id,
                ):
                    await crm_repo.add_product_interest(
                        conn,
                        organization_id=context.organization_id,
                        contact_id=target,
                        phone=context.phone,
                        product_id=effective_id,
                        product_title=product_name or None,
                    )
                out["product_interest_saved"] = True
        return ToolResult(self.name, True, out)


SAVE_INTERESTS_SPEC = ToolSpec(
    name="save_interests",
    description=(
        "Registra o interesse do cliente em produtos/assuntos para remarketing e contexto "
        "futuro. Use quando o cliente demonstrar interesse em comprar algo, pedir aviso de "
        "estoque ou citar produtos que deseja. Registre apenas o que o cliente expressou."
    ),
    parameters={
        "type": "object",
        "properties": {
            "interests": {"type": "array", "items": {"type": "string"}},
            "product_name": {"type": "string"},
            "product_id": {"type": "string"},
        },
        "required": ["interests"],
    },
)


# ----------------------------------------------------------------------------
# transfer_to_human
# ----------------------------------------------------------------------------
class TransferToHuman:
    name = "transfer_to_human"

    async def __call__(
        self, conn: Any, context: ToolContext, arguments: Mapping[str, Any]
    ) -> ToolResult:
        reason = _text(arguments, "reason")
        if reason not in HANDOFF_REASONS:
            reason = "other"
        summary = _text(arguments, "summary")
        marked = await transfer_to_human(
            conn,
            organization_id=context.organization_id,
            conversation_id=context.conversation_id,
            reason=f"tool:{reason}",
            channel_account_id=context.channel_account_id,
            severity="warning",
            title="Agente transferiu a conversa para a equipe",
            payload={"handoff_reason": reason, "summary": summary or None},
        )
        if reason == "no_knowledge" and context.last_question:
            # Alteração 2026-10-15-11: "não sei responder" é lacuna.
            try:
                async with conn.transaction():
                    await scope_to_organization(conn, context.organization_id)
                    await knowledge_repo.record_gap(
                        conn,
                        organization_id=context.organization_id,
                        question=context.last_question,
                        outcome="transferred",
                        agent_id=context.agent_id,
                        conversation_id=context.conversation_id,
                    )
            except Exception:  # registro, nunca condição da transferência
                pass
        if context.contact_id is not None:
            try:
                async with conn.transaction():
                    await scope_to_organization(conn, context.organization_id)
                    await crm_repo.add_activity(
                        conn,
                        organization_id=context.organization_id,
                        contact_id=context.contact_id,
                        conversation_id=context.conversation_id,
                        type="agent_assigned",
                        title="Transferido para atendimento humano (IA)",
                        description=(
                            f"Motivo: {reason}\n\nResumo: {summary}"
                            if summary
                            else f"Motivo: {reason}"
                        ),
                        metadata={
                            "source": "ai_agent",
                            "agent_id": str(context.agent_id) if context.agent_id else None,
                            "conversation_id": str(context.conversation_id),
                            "handoff_reason": reason,
                        },
                    )
            except Exception:  # a atividade é registro, nunca condição da transferência
                pass
        return ToolResult(
            self.name,
            True,
            {
                "transferred": True,
                "mirrored": marked,
                "reason": reason,
                "instruction": (
                    "A conversa foi passada para a equipe. Responda ao cliente em uma frase "
                    "curta avisando que uma pessoa vai continuar o atendimento."
                ),
            },
        )


TRANSFER_TO_HUMAN_SPEC = ToolSpec(
    name="transfer_to_human",
    description=(
        "Transfere o atendimento para uma pessoa da equipe e DESLIGA a IA nesta conversa. "
        "Use quando o cliente pedir explicitamente um atendente, estiver insatisfeito, "
        "pedir desconto acima do que você pode dar, tocar em tema de saúde, ou quando você "
        "não tiver a informação. Informe sempre o motivo e um resumo."
    ),
    parameters={
        "type": "object",
        "properties": {
            "reason": {"type": "string", "enum": list(HANDOFF_REASONS)},
            "summary": {"type": "string", "description": "Resumo da conversa para quem assume."},
        },
        "required": ["reason"],
    },
)


class TransferToAgent:
    """Passa a conversa para OUTRO agente ativo da loja (alteração
    2026-10-15-09). Não desliga a IA: o próximo turno é atendido pelo agente
    escolhido, que arbitra as missões DELE (a dona atual é limpa)."""

    name = "transfer_to_agent"

    async def __call__(
        self, conn: Any, context: ToolContext, arguments: Mapping[str, Any]
    ) -> ToolResult:
        wanted = _text(arguments, "agent").strip().lower()
        summary = _text(arguments, "summary")
        async with conn.transaction():
            await scope_to_organization(conn, context.organization_id)
            agents = await agent_repo.list_active_agents(
                conn, organization_id=context.organization_id
            )
            target = next(
                (
                    a for a in agents
                    if str(a[0]).lower() == wanted or a[1].strip().lower() == wanted
                ),
                None,
            )
            if target is None or target[0] == context.agent_id:
                return ToolResult(
                    self.name,
                    False,
                    {
                        "transferred": False,
                        "reason": "unknown_agent" if target is None else "same_agent",
                        "available": [
                            {"name": a[1], "role": a[2]} for a in agents if a[0] != context.agent_id
                        ],
                    },
                )
            await agent_repo.assign_conversation_agent(
                conn,
                conversation_id=context.conversation_id,
                agent_id=target[0],
                reset_owner_mission=True,
            )
            if context.contact_id is not None:
                try:
                    await crm_repo.add_activity(
                        conn,
                        organization_id=context.organization_id,
                        contact_id=context.contact_id,
                        conversation_id=context.conversation_id,
                        type="agent_assigned",
                        title=f"Transferido para o agente {target[1]} (IA)",
                        description=f"Resumo: {summary}" if summary else None,
                        metadata={
                            "source": "ai_agent",
                            "from_agent_id": str(context.agent_id) if context.agent_id else None,
                            "to_agent_id": str(target[0]),
                            "conversation_id": str(context.conversation_id),
                        },
                    )
                except Exception:  # registro, nunca condição da transferência
                    pass
        return ToolResult(
            self.name,
            True,
            {
                "transferred": True,
                "to": {"name": target[1], "role": target[2]},
                "instruction": (
                    f"A conversa passa para {target[1]} a partir da próxima mensagem. "
                    "Responda ao cliente em uma frase curta avisando quem continua."
                ),
            },
        )


def transfer_to_agent_spec(
    agents: tuple[tuple[Any, str, str | None], ...], *, exclude: Any = None
) -> ToolSpec:
    """O spec lista os destinos possíveis pelo nome — o modelo escolhe entre
    agentes reais, nunca inventa um."""
    names = [a[1] for a in agents if a[0] != exclude]
    return ToolSpec(
        name="transfer_to_agent",
        description=(
            "Passa a conversa para outro agente da loja quando o assunto é dele "
            "(ex.: pós-venda, cobrança). A IA continua ligada; quem responde a partir "
            "da próxima mensagem é o agente escolhido. Destinos: "
            + ", ".join(f"{a[1]} ({a[2]})" if a[2] else a[1] for a in agents if a[0] != exclude)
        ),
        parameters={
            "type": "object",
            "properties": {
                "agent": {"type": "string", "enum": names},
                "summary": {"type": "string", "description": "Resumo para quem assume."},
            },
            "required": ["agent"],
        },
    )


# ----------------------------------------------------------------------------
# catálogo
# ----------------------------------------------------------------------------
#: Nome → (fábrica, spec, exige loja). Espelha `src/lib/ai/tools/catalog.ts`
#: (`requiresStore`); `search_knowledge` não está aqui porque a busca roda
#: antes da geração (`responder._knowledge`), e `create_coupon` entra pela
#: missão, não por este catálogo.
BUILTIN_TOOLS: dict[str, tuple[type, ToolSpec, bool]] = {
    "transfer_to_human": (TransferToHuman, TRANSFER_TO_HUMAN_SPEC, False),
    "save_customer": (SaveCustomer, SAVE_CUSTOMER_SPEC, False),
    "save_interests": (SaveInterests, SAVE_INTERESTS_SPEC, False),
    "timeline": (Timeline, TIMELINE_SPEC, False),
    "product_lookup": (ProductLookup, PRODUCT_LOOKUP_SPEC, True),
    "order_status": (OrderStatus, ORDER_STATUS_SPEC, True),
}

BUILTIN_TOOL_NAMES = tuple(BUILTIN_TOOLS)


def builtin_tools_for(
    enabled: tuple[str, ...] | list[str], *, has_store: bool
) -> tuple[tuple[str, Any, ToolSpec], ...]:
    """As ferramentas do catálogo que ESTE agente ligou e que a loja consegue
    servir (as de Shopify só com loja conectada). Ordem do catálogo."""
    wanted = set(enabled)
    out: list[tuple[str, Any, ToolSpec]] = []
    for name, (factory, spec, needs_store) in BUILTIN_TOOLS.items():
        if name not in wanted:
            continue
        if needs_store and not has_store:
            continue
        out.append((name, factory(), spec))
    return tuple(out)
