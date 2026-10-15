"""Alteração 2026-10-15-06 — as ferramentas do catálogo no runtime.

Os repositórios são substituídos por dublês (monkeypatch): o que se prova é a
regra de cada ferramenta — argumentos hostis, escopo pelo contexto, fusão de
etiquetas, motivos codificados, gating por loja — e nunca SQL.
"""

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from agents_runtime.repository.catalog import ProductRow
from agents_runtime.repository.crm import ActivityRow, ContactRow
from agents_runtime.repository.orders import OrderLookup
from agents_runtime.tools import builtin
from agents_runtime.tools.base import ToolContext

ORG, CONV, CONTACT, AGENT = uuid4(), uuid4(), uuid4(), uuid4()


class _Conn:
    @asynccontextmanager
    async def transaction(self):
        yield


@pytest.fixture(autouse=True)
def _scope(monkeypatch):
    monkeypatch.setattr(builtin, "scope_to_organization", AsyncMock())


def ctx(**over) -> ToolContext:
    base = dict(
        organization_id=ORG,
        conversation_id=CONV,
        contact_id=CONTACT,
        agent_id=AGENT,
        phone="+55 11 98765-4321",
    )
    return ToolContext(**{**base, **over})


class TestCatalogSelection:
    def test_only_enabled_tools_are_offered_in_catalog_order(self) -> None:
        offered = builtin.builtin_tools_for(("timeline", "transfer_to_human"), has_store=True)
        assert [name for name, _, _ in offered] == ["transfer_to_human", "timeline"]
        assert all(spec.name == name for name, _, spec in offered)

    def test_shopify_tools_need_a_store(self) -> None:
        names = [
            n for n, _, _ in builtin.builtin_tools_for(builtin.BUILTIN_TOOL_NAMES, has_store=False)
        ]
        assert "product_lookup" not in names and "order_status" not in names
        names = [
            n for n, _, _ in builtin.builtin_tools_for(builtin.BUILTIN_TOOL_NAMES, has_store=True)
        ]
        assert "product_lookup" in names and "order_status" in names

    def test_every_spec_is_a_json_schema_object(self) -> None:
        for _, spec, _ in builtin.BUILTIN_TOOLS.values():
            assert spec.parameters["type"] == "object"
            assert isinstance(spec.parameters["required"], list)
            assert spec.description


class TestProductLookup:
    async def test_empty_query_is_refused_without_touching_the_db(self, monkeypatch) -> None:
        search = AsyncMock()
        monkeypatch.setattr(builtin.catalog_repo, "search_products", search)
        result = await builtin.ProductLookup()(_Conn(), ctx(), {"query": "  "})
        assert result.success is False and search.await_count == 0

    async def test_rows_become_products_with_availability(self, monkeypatch) -> None:
        rows = (
            ProductRow(
                "Sérum Noturno",
                Decimal("54.90"),
                None,
                "SER-30",
                3,
                "active",
                None,
                [{"title": "30ml", "sku": "SER-30", "price": "54.90", "inventory_quantity": 3}],
                None,
            ),
            ProductRow(
                "Shampoo", Decimal("49.90"), Decimal("59.90"), None, 0, "active", False, [], None
            ),
        )
        monkeypatch.setattr(builtin.catalog_repo, "search_products", AsyncMock(return_value=rows))
        result = await builtin.ProductLookup()(_Conn(), ctx(), {"query": "sérum"})
        assert result.success and result.output["found"] and result.output["count"] == 2
        first, second = result.output["products"]
        assert first["available"] is True and first["variants"][0]["available"] is True
        assert second["available"] is False and second["compare_at_price"] == "59.90"


class TestOrderStatus:
    async def test_needs_some_identifier(self, monkeypatch) -> None:
        find = AsyncMock()
        monkeypatch.setattr(builtin.orders_repo, "find_orders", find)
        result = await builtin.OrderStatus()(_Conn(), ctx(phone=None), {})
        assert result.success is False and find.await_count == 0

    async def test_the_phone_from_context_is_the_fallback(self, monkeypatch) -> None:
        find = AsyncMock(
            return_value=(
                OrderLookup(
                    "#1001",
                    "paid",
                    None,
                    Decimal("120.00"),
                    "BRL",
                    datetime(2026, 9, 1, tzinfo=UTC),
                    2,
                ),
            )
        )
        monkeypatch.setattr(builtin.orders_repo, "find_orders", find)
        result = await builtin.OrderStatus()(_Conn(), ctx(), {})
        assert result.success and result.output["orders"][0]["order_number"] == "#1001"
        assert "Sem rastreio" in result.output["orders"][0]["fulfillment_description"]
        assert find.await_args.kwargs["phone_digits"] == "5511987654321"
        assert find.await_args.kwargs["contact_id"] == CONTACT

    async def test_the_order_number_is_digits_only(self, monkeypatch) -> None:
        find = AsyncMock(return_value=())
        monkeypatch.setattr(builtin.orders_repo, "find_orders", find)
        result = await builtin.OrderStatus()(_Conn(), ctx(), {"order_number": "#1042"})
        assert result.success and result.output["found"] is False
        assert find.await_args.kwargs["order_number"] == "1042"


class TestTimeline:
    async def test_read_lists_recent_activities(self, monkeypatch) -> None:
        rows = (ActivityRow("note", "Pediu troca", None, datetime(2026, 9, 1, tzinfo=UTC)),)
        monkeypatch.setattr(builtin.crm_repo, "recent_activities", AsyncMock(return_value=rows))
        result = await builtin.Timeline()(_Conn(), ctx(), {"action": "read"})
        assert result.success and result.output["activities"][0]["title"] == "Pediu troca"

    async def test_add_requires_a_title_and_normalises_the_type(self, monkeypatch) -> None:
        add = AsyncMock(return_value=uuid4())
        monkeypatch.setattr(builtin.crm_repo, "add_activity", add)
        refused = await builtin.Timeline()(_Conn(), ctx(), {"action": "add"})
        assert refused.success is False
        ok = await builtin.Timeline()(
            _Conn(), ctx(), {"action": "add", "title": "x", "type": "LIGAÇÃO"}
        )
        assert ok.success and ok.output["added"] is True
        assert add.await_args.kwargs["type"] == "ligação"  # o repositório normaliza para 'note'

    async def test_without_a_contact_there_is_no_timeline(self) -> None:
        result = await builtin.Timeline()(_Conn(), ctx(contact_id=None), {"action": "read"})
        assert result.success is False


class TestSaveCustomer:
    async def test_tags_and_fields_merge_into_the_existing_contact(self, monkeypatch) -> None:
        existing = ContactRow(CONTACT, "+5511", None, ("vip",), {"cidade": "SP"})
        monkeypatch.setattr(builtin.crm_repo, "find_contact", AsyncMock(return_value=existing))
        update = AsyncMock()
        monkeypatch.setattr(builtin.crm_repo, "update_contact", update)
        result = await builtin.SaveCustomer()(
            _Conn(),
            ctx(),
            {
                "name": "Ana",
                "email": "ANA@X.COM",
                "tags": ["vip", "atacado"],
                "custom_fields": {"cnpj": "1"},
            },
        )
        assert result.success and result.output == {"contact_id": str(CONTACT), "created": False}
        kwargs = update.await_args.kwargs
        assert kwargs["first_name"] == "Ana" and kwargs["email"] == "ana@x.com"
        assert kwargs["tags"] == ("vip", "atacado")
        assert kwargs["custom_fields"] == {"cidade": "SP", "cnpj": "1"}

    async def test_a_new_contact_is_inserted_with_the_context_phone(self, monkeypatch) -> None:
        monkeypatch.setattr(builtin.crm_repo, "find_contact", AsyncMock(return_value=None))
        insert = AsyncMock(return_value=uuid4())
        monkeypatch.setattr(builtin.crm_repo, "insert_contact", insert)
        result = await builtin.SaveCustomer()(_Conn(), ctx(contact_id=None), {"name": "Bia"})
        assert result.success and result.output["created"] is True
        assert insert.await_args.kwargs["phone"] == "+55 11 98765-4321"

    async def test_arguments_never_choose_the_organisation(self, monkeypatch) -> None:
        monkeypatch.setattr(builtin.crm_repo, "find_contact", AsyncMock(return_value=None))
        insert = AsyncMock(return_value=uuid4())
        monkeypatch.setattr(builtin.crm_repo, "insert_contact", insert)
        await builtin.SaveCustomer()(_Conn(), ctx(), {"organization_id": str(uuid4()), "name": "x"})
        assert insert.await_args.kwargs["organization_id"] == ORG


class TestSaveInterests:
    async def test_interests_become_prefixed_tags_and_a_product_interest(self, monkeypatch) -> None:
        contact = ContactRow(CONTACT, None, None, ("interesse:tênis",), {})
        monkeypatch.setattr(builtin.crm_repo, "find_contact", AsyncMock(return_value=contact))
        update = AsyncMock()
        monkeypatch.setattr(builtin.crm_repo, "update_contact", update)
        monkeypatch.setattr(
            builtin.crm_repo, "product_interest_exists", AsyncMock(return_value=False)
        )
        add = AsyncMock()
        monkeypatch.setattr(builtin.crm_repo, "add_product_interest", add)
        result = await builtin.SaveInterests()(
            _Conn(), ctx(), {"interests": ["tênis", "promoções"], "product_name": "Sérum Noturno"}
        )
        assert result.success and result.output["product_interest_saved"] is True
        assert update.await_args.kwargs["tags"] == (
            "interesse:tênis",
            "interesse:promoções",
            "interesse:Sérum Noturno",
        )
        assert add.await_args.kwargs["product_id"] == "name:serum-noturno"

    async def test_nothing_to_save_is_refused(self) -> None:
        result = await builtin.SaveInterests()(_Conn(), ctx(), {"interests": []})
        assert result.success is False


class TestTransferToHuman:
    async def test_the_reason_is_coded_and_the_activity_logged(self, monkeypatch) -> None:
        handoff = AsyncMock(return_value=True)
        monkeypatch.setattr(builtin, "transfer_to_human", handoff)
        add = AsyncMock(return_value=uuid4())
        monkeypatch.setattr(builtin.crm_repo, "add_activity", add)
        result = await builtin.TransferToHuman()(
            _Conn(), ctx(), {"reason": "discount_over_limit", "summary": "quer 30%"}
        )
        assert result.success and result.output["transferred"] and result.output["mirrored"]
        assert handoff.await_args.kwargs["reason"] == "tool:discount_over_limit"
        assert add.await_args.kwargs["metadata"]["handoff_reason"] == "discount_over_limit"

    async def test_an_unknown_reason_becomes_other(self, monkeypatch) -> None:
        handoff = AsyncMock(return_value=False)
        monkeypatch.setattr(builtin, "transfer_to_human", handoff)
        result = await builtin.TransferToHuman()(
            _Conn(), ctx(contact_id=None), {"reason": "sei lá"}
        )
        assert result.output["reason"] == "other" and result.output["mirrored"] is False
