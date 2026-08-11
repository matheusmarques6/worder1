"""O connector Shopify — retry seguro é a única propriedade que importa.

O código vem DECIDIDO (determinístico do grant), então 'já existe' no provedor
tem que ser sucesso idempotente; qualquer outra falha tem que subir como
ShopifyError para o grant permanecer emitido e o retry recriar O MESMO código.
MockTransport do httpx: nenhum teste daqui toca rede (S5)."""

import json
from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest

from agents_runtime.connectors import shopify

UNTIL = datetime(2026, 8, 15, 12, 0, tzinfo=UTC)
STORE = shopify.ShopifyStore(shop_domain="loja.myshopify.com", access_token="shpat_x")


def _transport(handler) -> tuple[httpx.MockTransport, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def wrapped(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    return httpx.MockTransport(wrapped), seen


def _ok_handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/price_rules.json"):
        return httpx.Response(201, json={"price_rule": {"id": 42}})
    return httpx.Response(201, json={"discount_code": {"code": "WD-ABC"}})


class TestHappyPath:
    async def test_price_rule_then_discount_code(self) -> None:
        transport, seen = _transport(_ok_handler)
        code = await shopify.create_discount(
            STORE, code="WD-ABC12345", kind="percent", value=Decimal("10"),
            validity_until=UNTIL, transport=transport,
        )
        assert code == "WD-ABC12345"
        assert [r.url.path for r in seen] == [
            "/admin/api/2024-01/price_rules.json",
            "/admin/api/2024-01/price_rules/42/discount_codes.json",
        ]
        rule = json.loads(seen[0].content)["price_rule"]
        assert rule["value"] == "-10"
        assert rule["value_type"] == "percentage"
        assert rule["ends_at"] == UNTIL.isoformat()
        assert seen[0].headers["x-shopify-access-token"] == "shpat_x"

    async def test_free_shipping_targets_the_shipping_line(self) -> None:
        transport, seen = _transport(_ok_handler)
        await shopify.create_discount(
            STORE, code="WD-FRETE", kind="free_shipping", value=Decimal("0"),
            validity_until=UNTIL, transport=transport,
        )
        rule = json.loads(seen[0].content)["price_rule"]
        assert rule["target_type"] == "shipping_line"
        assert rule["value"] == "-100.0"


class TestIdempotentRetry:
    async def test_an_already_taken_title_is_success(self) -> None:
        def taken(request: httpx.Request) -> httpx.Response:
            return httpx.Response(422, json={"errors": {"title": ["has already been taken"]}})

        transport, seen = _transport(taken)
        code = await shopify.create_discount(
            STORE, code="WD-DEJA", kind="percent", value=Decimal("10"),
            validity_until=UNTIL, transport=transport,
        )
        assert code == "WD-DEJA"
        assert len(seen) == 1  # não insiste: o cupom é nosso e está lá

    async def test_any_other_failure_raises_for_the_retry(self) -> None:
        def broken(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text="internal")

        transport, _ = _transport(broken)
        with pytest.raises(shopify.ShopifyError, match="HTTP 500"):
            await shopify.create_discount(
                STORE, code="WD-X", kind="percent", value=Decimal("10"),
                validity_until=UNTIL, transport=transport,
            )
