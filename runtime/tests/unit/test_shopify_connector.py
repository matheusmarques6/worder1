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


class FakeClock:
    """Clock injetado: o teste MEDE a espera em vez de esperar."""

    def __init__(self) -> None:
        self.slept: list[float] = []

    def now(self) -> datetime:
        return UNTIL

    async def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)


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
            "/admin/api/2026-04/price_rules.json",
            "/admin/api/2026-04/price_rules/42/discount_codes.json",
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


_TAKEN = {"errors": {"title": ["has already been taken"]}}


class TestIdempotentRetry:
    async def test_a_taken_title_only_succeeds_after_confirming_the_discount_code(
        self,
    ) -> None:
        """422 taken na price rule NÃO prova que o cupom existe (item 33).

        Devolver `code` aqui mandava ao cliente um código que podia nunca ter
        virado discount code. O contrato agora é: reencontra a rule pelo título
        determinístico e só sai pelo passo do discount code.
        """

        def taken(request: httpx.Request) -> httpx.Response:
            if request.method == "POST" and request.url.path.endswith("/price_rules.json"):
                return httpx.Response(422, json=_TAKEN)
            if request.method == "GET":
                return httpx.Response(
                    200,
                    json={"price_rules": [
                        # título diferente: descartada antes de comparar termos
                        {"id": 7, "title": "OUTRO-GRANT", "target_type": "line_item",
                         "value_type": "fixed_amount", "value": "-50.0", "usage_limit": 3},
                        {"id": 99, "title": "WD-DEJA", "target_type": "line_item",
                         "value_type": "percentage", "value": "-10.0", "usage_limit": 1},
                    ]},
                )
            # discount code já lá da tentativa anterior: aqui 422 taken É sucesso
            return httpx.Response(422, json={"errors": {"code": ["has already been taken"]}})

        transport, seen = _transport(taken)
        code = await shopify.create_discount(
            STORE, code="WD-DEJA", kind="percent", value=Decimal("10"),
            validity_until=UNTIL, transport=transport,
        )
        assert code == "WD-DEJA"
        assert [r.url.path for r in seen] == [
            "/admin/api/2026-04/price_rules.json",
            "/admin/api/2026-04/price_rules.json",
            "/admin/api/2026-04/price_rules/99/discount_codes.json",
        ]
        # a busca é escopada: janela em torno do ends_at do grant, e o título
        # bate exato — não dá para pegar a rule de outro grant.
        params = seen[1].url.params
        assert "ends_at_min" in params and "ends_at_max" in params

    async def test_the_429_that_orphaned_the_rule_still_ends_with_the_coupon_created(
        self,
    ) -> None:
        """A sequência exata do item 33, ponta a ponta.

        1ª chamada: price rule 201, discount code 429 -> ShopifyError (o grant
        fica emitido). 2ª chamada: price rule 422 taken -> tem de terminar com
        o discount code CRIADO, não com um código de fé.
        """
        created_codes: list[str] = []

        def first(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/price_rules.json"):
                return httpx.Response(201, json={"price_rule": {"id": 42}})
            return httpx.Response(429, headers={"Retry-After": "60"}, text="throttled")

        # 60s > teto de 6s: sobe sem segurar o turno. O FakeClock é o que
        # garante que este teste nunca dorme de verdade nem quando o teto
        # quebra — teste que só é rápido porque o código está certo esconde a
        # falha em vez de mostrá-la.
        clock = FakeClock()
        transport, _ = _transport(first)
        with pytest.raises(shopify.ShopifyError, match="HTTP 429"):
            await shopify.create_discount(
                STORE, code="WD-ORFA", kind="percent", value=Decimal("10"),
                validity_until=UNTIL, transport=transport, clock=clock,
            )
        assert clock.slept == []

        def second(request: httpx.Request) -> httpx.Response:
            if request.method == "POST" and request.url.path.endswith("/price_rules.json"):
                return httpx.Response(422, json=_TAKEN)
            if request.method == "GET":
                return httpx.Response(200, json={"price_rules": [
                    {"id": 42, "title": "WD-ORFA", "target_type": "line_item",
                     "value_type": "percentage", "value": "-10.0", "usage_limit": 1},
                ]})
            created_codes.append(json.loads(request.content)["discount_code"]["code"])
            return httpx.Response(201, json={"discount_code": {"code": "WD-ORFA"}})

        transport, seen = _transport(second)
        code = await shopify.create_discount(
            STORE, code="WD-ORFA", kind="percent", value=Decimal("10"),
            validity_until=UNTIL, transport=transport,
        )
        assert code == "WD-ORFA"
        assert created_codes == ["WD-ORFA"]  # o cupom EXISTE ao fim da segunda
        assert seen[-1].url.path == "/admin/api/2026-04/price_rules/42/discount_codes.json"

    async def test_a_rule_that_cannot_be_refound_is_error_not_success(self) -> None:
        def taken_but_absent(request: httpx.Request) -> httpx.Response:
            if request.method == "GET":
                return httpx.Response(200, json={"price_rules": []})
            return httpx.Response(422, json=_TAKEN)

        transport, _ = _transport(taken_but_absent)
        with pytest.raises(shopify.ShopifyError, match="não foi reencontrada"):
            await shopify.create_discount(
                STORE, code="WD-SUMIU", kind="percent", value=Decimal("10"),
                validity_until=UNTIL, transport=transport,
            )

    async def test_a_rule_created_now_needs_no_terms_check(self) -> None:
        """Rule criada nesta chamada + 422 no código: sucesso, sem busca.

        O guard de termos (item 51) mora na BUSCA. Quando a rule nasce aqui,
        ela é deste grant por construção e o 422 do discount code continua
        sendo o sucesso idempotente que o item 33 deixou.
        """

        def created_then_taken(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/price_rules.json"):
                return httpx.Response(201, json={"price_rule": {"id": 42}})
            return httpx.Response(422, json={"errors": {"code": ["has already been taken"]}})

        transport, seen = _transport(created_then_taken)
        code = await shopify.create_discount(
            STORE, code="WD-NOVA", kind="percent", value=Decimal("10"),
            validity_until=UNTIL, transport=transport,
        )
        assert code == "WD-NOVA"
        assert [r.method for r in seen] == ["POST", "POST"]  # nenhum GET

    async def test_a_different_decimal_scale_is_the_same_rule(self) -> None:
        """`numeric(12,2)` vira "-10.00"; a Shopify devolve "-10.0".

        É o NOSSO retry idempotente passando pela busca. Comparar `value` como
        string reprovaria a própria rule que acabamos de criar e o cupom
        legítimo nunca sairia — por isso a escala aqui é diferente DE PROPÓSITO.
        """

        def taken(request: httpx.Request) -> httpx.Response:
            if request.method == "POST" and request.url.path.endswith("/price_rules.json"):
                return httpx.Response(422, json=_TAKEN)
            if request.method == "GET":
                return httpx.Response(200, json={"price_rules": [
                    {"id": 77, "title": "WD-ESCALA", "target_type": "line_item",
                     "value_type": "percentage", "value": "-10.0", "usage_limit": 1},
                ]})
            return httpx.Response(422, json={"errors": {"code": ["has already been taken"]}})

        transport, seen = _transport(taken)
        code = await shopify.create_discount(
            STORE, code="WD-ESCALA", kind="percent", value=Decimal("10.00"),
            validity_until=UNTIL, transport=transport,
        )
        assert json.loads(seen[0].content)["price_rule"]["value"] == "-10.00"
        assert code == "WD-ESCALA"
        assert seen[-1].url.path == "/admin/api/2026-04/price_rules/77/discount_codes.json"

    async def test_a_rule_with_other_terms_is_error_not_success(self) -> None:
        """Colisão de código (item 51b): a rule achada é de OUTRO grant.

        O caso escolhido é o que os três campos óbvios NÃO separam: um
        `free_shipping` e um `percent` de 100 têm `value_type=percentage` e
        `value` numericamente igual a -100. Quem separa é `target_type` — sem
        ele, o cliente autorizado a frete grátis sairia com 100% de desconto
        nos itens.
        """

        def other_grants_rule(request: httpx.Request) -> httpx.Response:
            if request.method == "POST" and request.url.path.endswith("/price_rules.json"):
                return httpx.Response(422, json=_TAKEN)
            if request.method == "GET":
                return httpx.Response(200, json={"price_rules": [
                    {"id": 13, "title": "WD-COLIDE", "target_type": "shipping_line",
                     "value_type": "percentage", "value": "-100.0", "usage_limit": 1},
                ]})
            raise AssertionError("não pode chegar ao discount code")

        transport, seen = _transport(other_grants_rule)
        with pytest.raises(shopify.ShopifyError, match="termos diferentes") as caught:
            await shopify.create_discount(
                STORE, code="WD-COLIDE", kind="percent", value=Decimal("100"),
                validity_until=UNTIL, transport=transport,
            )
        assert "target_type" in str(caught.value)
        # a mensagem não embute valor cru: `failures.classify` leria "-100.0"
        # como um falso HTTP 100 (`queueing/failures.py:95-98`)
        assert "100" not in str(caught.value)
        assert len(seen) == 2  # parou na busca, não tocou o discount code

    @pytest.mark.parametrize(
        "found_rule",
        [
            pytest.param(
                {"target_type": "line_item", "value_type": "percentage", "value": "-10.0"},
                id="usage_limit ausente",
            ),
            pytest.param(
                {"target_type": "line_item", "value_type": "percentage", "usage_limit": 1},
                id="value ausente",
            ),
            pytest.param(
                {"target_type": "line_item", "value": "-10.0", "usage_limit": 1},
                id="value_type ausente",
            ),
            pytest.param(
                {"target_type": "line_item", "value_type": "fixed_amount",
                 "value": "-10.0", "usage_limit": 1},
                id="value_type divergente",
            ),
            pytest.param(
                {"target_type": "line_item", "value_type": "percentage",
                 "value": "-10.0", "usage_limit": 5},
                id="usage_limit divergente",
            ),
        ],
    )
    async def test_a_missing_or_divergent_field_is_divergence_never_a_tie(
        self, found_rule: dict
    ) -> None:
        """Fail-closed nos QUATRO campos, e ausente NUNCA empata (item 51, E-3/E-4).

        Um GET que não devolve o campo não prova equivalência nenhuma. Sem
        estes casos, trocar `field not in rule or ...` por `field in rule and
        ...`, engolir o `except` do bloco numérico, ou tirar `value_type`/
        `usage_limit` da comparação passa verde na suíte inteira — e o cliente
        B volta a sair com o cupom de A.
        """

        def taken(request: httpx.Request) -> httpx.Response:
            if request.method == "POST" and request.url.path.endswith("/price_rules.json"):
                return httpx.Response(422, json=_TAKEN)
            if request.method == "GET":
                return httpx.Response(
                    200, json={"price_rules": [{"id": 55, "title": "WD-GUARD", **found_rule}]}
                )
            raise AssertionError("não pode chegar ao discount code")

        transport, seen = _transport(taken)
        with pytest.raises(shopify.ShopifyError, match="termos diferentes"):
            await shopify.create_discount(
                STORE, code="WD-GUARD", kind="percent", value=Decimal("10"),
                validity_until=UNTIL, transport=transport,
            )
        assert len(seen) == 2  # parou na busca, não tocou o discount code

    async def test_a_usage_limit_that_came_back_as_a_string_is_the_same_rule(self) -> None:
        """`usage_limit` é número: `"1"` da Shopify contra `1` nosso é EMPATE.

        Irmão do caso da escala decimal, e a mesma regressão: comparar o tipo
        cru do JSON reprovaria o nosso próprio retry idempotente e o cupom
        legítimo pararia de sair.
        """

        def taken(request: httpx.Request) -> httpx.Response:
            if request.method == "POST" and request.url.path.endswith("/price_rules.json"):
                return httpx.Response(422, json=_TAKEN)
            if request.method == "GET":
                return httpx.Response(200, json={"price_rules": [
                    {"id": 88, "title": "WD-STR", "target_type": "line_item",
                     "value_type": "percentage", "value": "-10.0", "usage_limit": "1"},
                ]})
            return httpx.Response(422, json={"errors": {"code": ["has already been taken"]}})

        transport, seen = _transport(taken)
        code = await shopify.create_discount(
            STORE, code="WD-STR", kind="percent", value=Decimal("10"),
            validity_until=UNTIL, transport=transport,
        )
        assert code == "WD-STR"
        assert seen[-1].url.path == "/admin/api/2026-04/price_rules/88/discount_codes.json"

    async def test_any_other_failure_raises_for_the_retry(self) -> None:
        def broken(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text="internal")

        transport, _ = _transport(broken)
        with pytest.raises(shopify.ShopifyError, match="HTTP 500"):
            await shopify.create_discount(
                STORE, code="WD-X", kind="percent", value=Decimal("10"),
                validity_until=UNTIL, transport=transport,
            )


class TestRateLimit:
    """429 é a única falha que o conector re-tenta sozinho.

    Paridade com `src/lib/services/shopify/api-client.ts:109-142`
    (`fetchWithRateLimit`): no máximo 3 tentativas honrando `Retry-After`.
    O que é NOSSO e não de lá: o teto total de 6s, porque esta chamada roda
    dentro do turno do agente — o backoff longo é da FILA
    (`queueing/backoff.py:15-35`), por mensagem, não por chamada HTTP.
    """

    async def test_it_retries_a_429_up_to_three_times(self) -> None:
        def throttled(request: httpx.Request) -> httpx.Response:
            return httpx.Response(429, headers={"Retry-After": "1"}, text="throttled")

        clock = FakeClock()
        transport, seen = _transport(throttled)
        with pytest.raises(shopify.ShopifyError, match="HTTP 429"):
            await shopify.create_discount(
                STORE, code="WD-429", kind="percent", value=Decimal("10"),
                validity_until=UNTIL, transport=transport, clock=clock,
            )
        assert len(seen) == shopify._MAX_ATTEMPTS == 3
        assert clock.slept == [1.0, 1.0]  # dorme ENTRE tentativas, não depois da última

    async def test_a_429_that_clears_goes_on_to_the_discount_code(self) -> None:
        calls = {"n": 0}

        def flaky(request: httpx.Request) -> httpx.Response:
            if request.url.path.endswith("/price_rules.json"):
                calls["n"] += 1
                if calls["n"] == 1:
                    return httpx.Response(429, headers={"Retry-After": "3"}, text="throttled")
                return httpx.Response(201, json={"price_rule": {"id": 42}})
            return httpx.Response(201, json={"discount_code": {"code": "WD-OK"}})

        clock = FakeClock()
        transport, seen = _transport(flaky)
        code = await shopify.create_discount(
            STORE, code="WD-OK", kind="percent", value=Decimal("10"),
            validity_until=UNTIL, transport=transport, clock=clock,
        )
        assert code == "WD-OK"
        assert clock.slept == [3.0]  # honrou o Retry-After da Shopify
        assert seen[-1].url.path == "/admin/api/2026-04/price_rules/42/discount_codes.json"

    async def test_a_retry_after_beyond_the_cap_gives_up_immediately(self) -> None:
        """`Retry-After: 120` da Shopify não pode segurar o turno inteiro."""

        def slow(request: httpx.Request) -> httpx.Response:
            return httpx.Response(429, headers={"Retry-After": "120"}, text="throttled")

        clock = FakeClock()
        transport, seen = _transport(slow)
        with pytest.raises(shopify.ShopifyError, match="HTTP 429"):
            await shopify.create_discount(
                STORE, code="WD-LENTO", kind="percent", value=Decimal("10"),
                validity_until=UNTIL, transport=transport, clock=clock,
            )
        assert len(seen) == 1
        assert clock.slept == []  # nem dormiu: 120s > teto de 6s

    async def test_the_total_wait_never_passes_the_cap(self) -> None:
        """O teto é do CONECTOR, não de cada request.

        `create_discount` faz até três chamadas HTTP; um teto por chamada
        deixaria a tool dormir 3x6s dentro de um turno de 60s. O throttle real
        chega em rajada, então o cenário é este: a price rule custa duas
        esperas e o discount code tenta gastar mais duas — a segunda tem de
        ser negada porque o orçamento do conector já acabou.
        """
        calls = {"price_rules": 0}

        def burst(request: httpx.Request) -> httpx.Response:
            # sem Retry-After em lugar nenhum: cai no default de 2s
            if request.url.path.endswith("/price_rules.json"):
                calls["price_rules"] += 1
                if calls["price_rules"] <= 2:
                    return httpx.Response(429, text="throttled")
                return httpx.Response(201, json={"price_rule": {"id": 42}})
            return httpx.Response(429, text="throttled")

        clock = FakeClock()
        transport, _ = _transport(burst)
        with pytest.raises(shopify.ShopifyError, match="HTTP 429"):
            await shopify.create_discount(
                STORE, code="WD-TETO", kind="percent", value=Decimal("10"),
                validity_until=UNTIL, transport=transport, clock=clock,
            )
        assert clock.slept == [2.0, 2.0, 2.0]  # 2 na price rule, só 1 no código
        assert sum(clock.slept) <= shopify._RETRY_BUDGET_SECONDS == 6.0
