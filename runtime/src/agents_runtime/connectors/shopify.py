"""Shopify Admin REST — o braço que materializa o cupom do grant.

Só entra aqui quem já passou pelo offer_engine: este módulo recebe um código
DECIDIDO (determinístico do grant) e o cria na loja — price rule + discount
code. Duas propriedades sustentam o retry seguro:

  * o código é o mesmo em toda tentativa (vem do grant), então "já existe"
    no provedor é SUCESSO idempotente, não erro;
  * nenhuma transação de banco está aberta durante estas chamadas (ADR-6) —
    quem chama grava o grant antes e o código depois.

Nuvemshop chega pela mesma porta quando o conector existir; a tool decide o
provedor pela loja da org, não por parâmetro do modelo.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

import httpx

API_VERSION = "2024-01"
_TIMEOUT = httpx.Timeout(15.0, connect=5.0)


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


async def create_discount(
    store: ShopifyStore,
    *,
    code: str,
    kind: str,
    value: Decimal,
    validity_until: datetime,
    max_uses: int = 1,
    transport: httpx.AsyncBaseTransport | None = None,
) -> str:
    """Cria (ou encontra) o cupom `code` na loja. Devolve o código."""
    base = f"https://{store.shop_domain}/admin/api/{API_VERSION}"
    headers = {
        "X-Shopify-Access-Token": store.access_token,
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(
        timeout=_TIMEOUT, transport=transport, headers=headers
    ) as client:
        created = await client.post(
            f"{base}/price_rules.json",
            json=_price_rule_payload(
                code=code, kind=kind, value=value,
                validity_until=validity_until, max_uses=max_uses,
            ),
        )
        if created.status_code == 422 and "taken" in created.text.lower():
            # Retry de um grant já materializado: o código é nosso, está lá.
            return code
        if created.status_code not in (200, 201):
            raise ShopifyError(
                f"price rule falhou: HTTP {created.status_code} — {created.text[:200]}"
            )
        rule_id = created.json()["price_rule"]["id"]

        coded = await client.post(
            f"{base}/price_rules/{rule_id}/discount_codes.json",
            json={"discount_code": {"code": code}},
        )
        if coded.status_code == 422 and "taken" in coded.text.lower():
            return code
        if coded.status_code not in (200, 201):
            raise ShopifyError(
                f"discount code falhou: HTTP {coded.status_code} — {coded.text[:200]}"
            )
    return code
