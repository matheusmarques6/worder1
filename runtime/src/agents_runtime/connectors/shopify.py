"""Shopify Admin REST — o braço que materializa o cupom do grant.

Só entra aqui quem já passou pelo offer_engine: este módulo recebe um código
DECIDIDO (determinístico do grant) e o cria na loja — price rule + discount
code. Duas propriedades sustentam o retry seguro:

  * o código é o mesmo em toda tentativa (vem do grant), então "já existe"
    no provedor é SUCESSO idempotente, não erro — mas só no passo do DISCOUNT
    CODE. "Já existe" na price rule não prova cupom nenhum: um 429 no meio
    deixa a rule criada e o código não (item 33 da auditoria);
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

API_VERSION = "2024-01"
_TIMEOUT = httpx.Timeout(15.0, connect=5.0)

# 429: paridade com o `fetchWithRateLimit` do lado TS
# (`src/lib/services/shopify/api-client.ts:109-142`) — 3 tentativas honrando
# `Retry-After`, com 2s de default quando o header não vem ou vem ilegível.
_MAX_ATTEMPTS = 3
_DEFAULT_RETRY_AFTER_SECONDS = 2.0
# O teto é NOSSO, não de lá: esta chamada roda DENTRO do turno do agente (60s
# de timeout de geração, lease de 60s no envio), então um `Retry-After: 120`
# da Shopify não pode segurar o turno inteiro. Estourou o teto, o 429 sobe e o
# backoff longo fica com a fila (`queueing/backoff.py:15-35`), que é por
# MENSAGEM — os dois convivem, não se substituem.
_RETRY_BUDGET_SECONDS = 6.0

# `GET /price_rules.json` (2024-01) não filtra por título — os únicos filtros
# são datas, `limit`, `since_id` e `times_used`. Como o `ends_at` da rule é o
# `validity_until` do grant, uma janela estreita em volta dele traz um punhado
# de rules em vez da loja inteira; quem garante que é A rule certa é o título,
# comparado exato depois. A margem cobre o truncamento de subsegundo do lado
# da Shopify.
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
    client: httpx.AsyncClient, clock: Clock, method: str, url: str, **kwargs
) -> httpx.Response:
    """Uma chamada à Shopify, re-tentando só 429 e só dentro do teto.

    Vale para as três chamadas do fluxo: era o 429 no `discount_codes` que
    deixava a price rule órfã e o cliente com um código inexistente. A espera
    sai do `Clock` injetado, não de `asyncio.sleep` — a fitness function
    `tests/unit/test_no_direct_clock.py` é quem manda aqui.
    """
    budget = _RETRY_BUDGET_SECONDS
    for attempt in range(_MAX_ATTEMPTS):
        response = await client.request(method, url, **kwargs)
        if response.status_code != 429 or attempt == _MAX_ATTEMPTS - 1:
            return response
        delay = _retry_after_seconds(response.headers.get("Retry-After"))
        if delay > budget:
            return response  # esperar mais que o teto é pior que devolver o 429
        await clock.sleep(delay)
        budget -= delay
    return response


async def _find_price_rule_id(
    client: httpx.AsyncClient,
    clock: Clock,
    base: str,
    *,
    code: str,
    validity_until: datetime,
) -> int | None:
    """Reencontra a price rule que o 422 'taken' disse existir, ou None."""
    found = await _send(
        client,
        clock,
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
        # grant vem daqui. Nunca pega a rule de outro grant.
        if rule.get("title") == code:
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
    base = f"https://{store.shop_domain}/admin/api/{API_VERSION}"
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
            "POST",
            f"{base}/price_rules.json",
            json=_price_rule_payload(
                code=code, kind=kind, value=value,
                validity_until=validity_until, max_uses=max_uses,
            ),
        )
        if created.status_code == 422 and "taken" in created.text.lower():
            # A rule é nossa, de uma tentativa anterior — mas isso NÃO prova
            # que o discount code saiu: um 429 no passo seguinte deixa a rule
            # órfã. Sair com `code` aqui mandava ao cliente um cupom que não
            # existe. Reencontra a rule e segue para o passo que confirma.
            rule_id = await _find_price_rule_id(
                client, clock, base, code=code, validity_until=validity_until
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
            "POST",
            f"{base}/price_rules/{rule_id}/discount_codes.json",
            json={"discount_code": {"code": code}},
        )
        if coded.status_code == 422 and "taken" in coded.text.lower():
            # Aqui o "já existe" É sucesso: a rule foi confirmada nesta mesma
            # chamada, e o código pendurado nela é o do grant.
            return code
        if coded.status_code not in (200, 201):
            raise ShopifyError(
                f"discount code falhou: HTTP {coded.status_code} — {coded.text[:200]}"
            )
    return code
