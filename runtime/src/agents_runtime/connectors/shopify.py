"""Shopify Admin REST — o braço que materializa o cupom do grant.

Só entra aqui quem já passou pelo offer_engine: este módulo recebe um código
DECIDIDO (determinístico do grant) e o cria na loja — price rule + discount
code. Duas propriedades sustentam o retry seguro:

  * o código é o mesmo em toda tentativa (vem do grant), então "já existe"
    no provedor é SUCESSO idempotente, não erro — mas só no passo do DISCOUNT
    CODE, e só depois de a rule ter sido confirmada NOSSA nesta chamada.
    "Já existe" na price rule não prova cupom nenhum: um 429 no meio deixa a
    rule criada e o código não (item 33 da auditoria), e o código do grant
    tem 32 bits sem unique no banco, então a rule que carrega aquele título
    pode ser de OUTRO grant (item 51 da auditoria) — por isso a busca compara
    os termos, não só o título;
  * nenhuma transação de banco está aberta durante estas chamadas (ADR-6) —
    quem chama grava o grant antes e o código depois.

Nuvemshop chega pela mesma porta quando o conector existir; a tool decide o
provedor pela loja da org, não por parâmetro do modelo.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

import httpx

from agents_runtime.clock import Clock, SystemClock

API_VERSION = "2026-04"
_TIMEOUT = httpx.Timeout(15.0, connect=5.0)

# 429: inspirado no `fetchWithRateLimit` do lado TS
# (`src/lib/services/shopify/api-client.ts:109-142`), com DUAS divergências
# numéricas deliberadas — o comportamento aqui não é o de lá:
#
#   * contagem: `api-client.ts:112,130` faz `maxRetries = 3` com
#     `retryCount >= maxRetries` a partir de 0, ou seja 3 RE-tentativas =
#     4 requisições. Aqui são 3 REQUISIÇÕES no total (2 re-tentativas),
#     porque o teto de espera abaixo é mais apertado que o de lá;
#   * throttle proativo: `api-client.ts:148+` desacelera sozinho quando o
#     header `X-Shopify-Shop-Api-Call-Limit` mostra `remaining <= 5`. NÃO
#     replicamos: lá o cliente serve sync/leitura em lote, onde vale gastar
#     latência para não bater no limite; aqui é uma chamada única dentro do
#     turno do agente, e desacelerar de propósito só encurta o turno.
#
# O que veio de lá sem mudança: honrar `Retry-After`, com 2s de default
# quando o header não vem ou vem ilegível.
_MAX_ATTEMPTS = 3
_DEFAULT_RETRY_AFTER_SECONDS = 2.0
# O teto é NOSSO, não de lá, e é do CONECTOR INTEIRO — não de cada request.
# `create_discount` faz até três chamadas HTTP; um teto por chamada deixaria
# a tool dormir 3x6s dentro de um turno de 60s (timeout de geração) com lease
# de 60s no envio. Por isso o orçamento nasce em `create_discount` e é
# compartilhado pelas três. Estourou, o 429 sobe e o backoff longo fica com a
# fila (`queueing/backoff.py:15-35`), que é por MENSAGEM — os dois convivem,
# não se substituem.
_RETRY_BUDGET_SECONDS = 6.0

# `GET /price_rules.json` (2026-04, item 35 da auditoria — checado na
# documentação antes de subir) não filtra por título — os únicos filtros
# continuam sendo datas, `limit`, `since_id` e `times_used`. Como o `ends_at`
# da rule é o `validity_until` do grant, uma janela estreita em volta dele traz
# um punhado de rules em vez da loja inteira; quem garante que é A rule certa é
# o título, comparado exato depois. A margem cobre o truncamento de subsegundo do lado
# da Shopify.
#
# Uma página só: se a rule não estiver nos 250 primeiros resultados da janela,
# a busca devolve None e vira ShopifyError. Falha FECHADA de propósito — nunca
# um cupom prometido sem existir — e paginar dentro do turno do agente custaria
# mais que o retry da fila. Só vira problema numa loja com >250 price rules
# terminando dentro da mesma janela de 2 minutos.
_ENDS_AT_MARGIN = timedelta(seconds=60)
_PAGE_LIMIT = 250


class ShopifyError(RuntimeError):
    """Falha que NÃO é 'código já existe' — o chamador decide re-tentar."""


@dataclass(frozen=True, slots=True)
class ShopifyStore:
    shop_domain: str
    access_token: str
    currency: str = "BRL"


def _price_rule_payload(
    *, code: str, kind: str, value: Decimal, validity_until: datetime, max_uses: int
) -> dict:
    if kind == "free_shipping":
        target = {"target_type": "shipping_line", "value_type": "percentage", "value": "-100.0"}
    elif kind == "percent":
        target = {
            "target_type": "line_item",
            "value_type": "percentage",
            "value": f"-{value}",
        }
    else:  # fixed
        target = {
            "target_type": "line_item",
            "value_type": "fixed_amount",
            "value": f"-{value}",
        }
    return {
        "price_rule": {
            "title": code,
            "target_selection": "all",
            "allocation_method": "across",
            "customer_selection": "all",
            # starts_at só precisa "já ter começado" — âncora fixa no passado
            # mantém o payload determinístico para o retry.
            "starts_at": "1970-01-01T00:00:00Z",
            "ends_at": validity_until.isoformat(),
            "usage_limit": max_uses,
            "once_per_customer": True,
            **target,
        }
    }


def _retry_after_seconds(raw: str | None) -> float:
    """Segundos do `Retry-After`. Ausente, ilegível ou negativo vira o default."""
    try:
        delay = float(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return _DEFAULT_RETRY_AFTER_SECONDS
    return delay if delay >= 0 else _DEFAULT_RETRY_AFTER_SECONDS


async def _send(
    client: httpx.AsyncClient,
    clock: Clock,
    budget: list[float],
    method: str,
    url: str,
    **kwargs,
) -> httpx.Response:
    """Uma chamada à Shopify, re-tentando só 429 e só dentro do teto.

    Vale para as três chamadas do fluxo: era o 429 no `discount_codes` que
    deixava a price rule órfã e o cliente com um código inexistente. A espera
    sai do `Clock` injetado, não de `asyncio.sleep` — a fitness function
    `tests/unit/test_no_direct_clock.py` é quem manda aqui.

    `budget` é uma caixa de um elemento porque o teto é do CONECTOR, não desta
    chamada: as três compartilham o mesmo saldo, senão uma rajada de throttle
    somaria 3x`_RETRY_BUDGET_SECONDS` dentro de um turno só.
    """
    for attempt in range(_MAX_ATTEMPTS):
        response = await client.request(method, url, **kwargs)
        if response.status_code != 429 or attempt == _MAX_ATTEMPTS - 1:
            return response
        delay = _retry_after_seconds(response.headers.get("Retry-After"))
        if delay > budget[0]:
            return response  # esperar mais que o teto é pior que devolver o 429
        await clock.sleep(delay)
        budget[0] -= delay
    return response


def _diverging_fields(expected: dict, rule: dict) -> list[str]:
    """Campos em que a rule achada na loja NÃO é a que esta chamada pediu.

    Campo ausente na resposta é divergência, não empate: um GET que não
    devolve o campo não prova equivalência nenhuma, e falhar aberto aqui é
    exatamente o buraco que o item 51 fecha.

    `target_type` está na lista porque sem ele `free_shipping` e um `percent`
    de 100 são indistinguíveis — os outros três campos são idênticos nos dois
    (`_price_rule_payload:87-100`).
    """
    diverging = [
        field
        for field in ("target_type", "value_type", "usage_limit")
        if field not in rule or rule[field] != expected[field]
    ]
    # `value` compara NUMERICAMENTE. `incentive_grants.value` é numeric(12,2),
    # psycopg entrega Decimal('10.00') e montamos "-10.00"; a Shopify devolve
    # "-10.0" para a MESMA rule. Igualdade de string reprovaria o nosso próprio
    # retry idempotente e o cupom legítimo nunca sairia.
    try:
        if Decimal(str(rule["value"])) != Decimal(str(expected["value"])):
            diverging.append("value")
    except (KeyError, ArithmeticError):
        diverging.append("value")
    return diverging


async def _find_price_rule_id(
    client: httpx.AsyncClient,
    clock: Clock,
    budget: list[float],
    base: str,
    *,
    code: str,
    validity_until: datetime,
    price_rule: dict,
) -> int | None:
    """Reencontra a price rule que o 422 'taken' disse existir, ou None.

    `price_rule` é o corpo que ESTA chamada pediu (`_price_rule_payload`): a
    comparação mora aqui dentro para a saída continuar sendo "id da rule certa
    ou None" e o ramo fail-closed do chamador não mudar de forma.
    """
    found = await _send(
        client,
        clock,
        budget,
        "GET",
        f"{base}/price_rules.json",
        params={
            "limit": _PAGE_LIMIT,
            "ends_at_min": (validity_until - _ENDS_AT_MARGIN).isoformat(),
            "ends_at_max": (validity_until + _ENDS_AT_MARGIN).isoformat(),
        },
    )
    if found.status_code != 200:
        raise ShopifyError(
            f"busca da price rule falhou: HTTP {found.status_code} — {found.text[:200]}"
        )
    for rule in found.json().get("price_rules", []):
        # título == código do grant: escopo de loja vem do token, escopo de
        # grant vem daqui. Mas o título NÃO basta para provar que a rule é
        # deste grant: `coupon_code_for` (`commerce/offer_engine.py:214-217`)
        # é `WD-` + 8 dígitos hex = 32 bits, e `incentive_grants.coupon_code`
        # não tem unique. Dois grants da mesma loja podem cair no mesmo
        # código, e aí esta busca acha a rule do OUTRO — com o percentual, o
        # usage_limit e a validade dele. Item 51 da auditoria: era assim que
        # o cliente B saía com o desconto de A no checkout.
        if rule.get("title") != code:
            continue
        diverging = _diverging_fields(price_rule, rule)
        if diverging:
            # Nomes de campo, não valores: `failures.classify` lê status HTTP
            # do TEXTO da exceção (`queueing/failures.py:95-98`,
            # `\b(?:HTTP\s*)?([1-5]\d{2})\b`), e um "-100.0" cru viraria um
            # falso HTTP 100 se algum dia esta exceção escapar da captura de
            # `tools/coupon.py:190`.
            raise ShopifyError(
                f"price rule '{code}' já existe na loja com termos diferentes "
                f"dos deste grant ({', '.join(diverging)}) — provável colisão "
                "de código entre grants; o cupom NÃO está confirmado"
            )
        return rule["id"]
    return None


async def create_discount(
    store: ShopifyStore,
    *,
    code: str,
    kind: str,
    value: Decimal,
    validity_until: datetime,
    max_uses: int = 1,
    transport: httpx.AsyncBaseTransport | None = None,
    clock: Clock | None = None,
) -> str:
    """Cria (ou encontra) o cupom `code` na loja. Devolve o código."""
    clock = clock or SystemClock()
    # Saldo de espera das TRÊS chamadas juntas — ver `_RETRY_BUDGET_SECONDS`.
    budget = [_RETRY_BUDGET_SECONDS]
    base = f"https://{store.shop_domain}/admin/api/{API_VERSION}"
    payload = _price_rule_payload(
        code=code, kind=kind, value=value,
        validity_until=validity_until, max_uses=max_uses,
    )
    headers = {
        "X-Shopify-Access-Token": store.access_token,
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(
        timeout=_TIMEOUT, transport=transport, headers=headers
    ) as client:
        created = await _send(
            client,
            clock,
            budget,
            "POST",
            f"{base}/price_rules.json",
            json=payload,
        )
        if created.status_code == 422 and "taken" in created.text.lower():
            # A rule PODE ser nossa, de uma tentativa anterior — mas isso NÃO
            # prova que o discount code saiu (um 429 no passo seguinte deixa a
            # rule órfã), nem sequer que a rule é deste grant (colisão de
            # código, item 51). Sair com `code` aqui mandava ao cliente um
            # cupom que não existe, ou o cupom de outra pessoa. Reencontra a
            # rule, confere os termos, e segue para o passo que confirma.
            rule_id = await _find_price_rule_id(
                client, clock, budget, base,
                code=code, validity_until=validity_until,
                price_rule=payload["price_rule"],
            )
            if rule_id is None:
                raise ShopifyError(
                    f"price rule '{code}' consta como já existente (422 taken) mas "
                    "não foi reencontrada na loja — o cupom NÃO está confirmado"
                )
        elif created.status_code not in (200, 201):
            raise ShopifyError(
                f"price rule falhou: HTTP {created.status_code} — {created.text[:200]}"
            )
        else:
            rule_id = created.json()["price_rule"]["id"]

        coded = await _send(
            client,
            clock,
            budget,
            "POST",
            f"{base}/price_rules/{rule_id}/discount_codes.json",
            json={"discount_code": {"code": code}},
        )
        if coded.status_code == 422 and "taken" in coded.text.lower():
            # Aqui o "já existe" É sucesso: a rule foi confirmada nesta mesma
            # chamada — criada agora, ou achada com os termos DESTE grant — e
            # o código pendurado nela é o do grant.
            #
            # O que este guard NÃO fecha, e não é "economicamente idêntico":
            # numa colisão entre dois grants com os quatro campos iguais, é
            # UMA rule, UM código e UM `usage_limit` (`:111`, alimentado por
            # `max_uses`, default 1) — o primeiro que resgatar consome o cupom
            # do outro, e o segundo cliente fica com um código que não
            # funciona no checkout. E o dano contábil continua inteiro:
            # `consume_incentive_grant` (`20260813000011:46-52,65`) casa pelo
            # código com `order by created_at limit 1` e credita o pedido ao
            # contato errado. O resíduo é inerente a o código do cupom ser a
            # identidade; fechá-lo é o unique
            # `(organization_id, upper(coupon_code))`, item próprio.
            return code
        if coded.status_code not in (200, 201):
            raise ShopifyError(
                f"discount code falhou: HTTP {coded.status_code} — {coded.text[:200]}"
            )
    return code
