"""O histórico de compras que o prompt afirma (E3 — plano missões-no-nó, 12/08).

O usuário fixou: dados do cliente e histórico de compras entram SEMPRE no
prompt. A fonte é o espelho `shopify_orders` — legada, sem RLS — então o
escopo por org é explícito na query e estes testes vigiam três coisas:

  * **decisão 81b**: "sem espelho" ≠ "sem compras". Org sem loja conectada →
    None (nenhuma afirmação no prompt); loja conectada e zero pedidos →
    histórico ZERADO (o prompt diz que não há compras). Inventar um zero para
    quem nunca conectou loja seria mentir.
  * **o elo é preciso, nunca fuzzy**: `contact_id` (o app grava no ingest) ou
    e-mail EXATO case-insensitive (bulk antigo sem elo). Telefone não entra —
    cauda de dígitos colide entre clientes e o custo seria mostrar a compra
    de OUTRA pessoa no prompt.
  * **privacidade por construção**: o worker lê número/valor/status/itens e
    NÃO consegue ler endereço de entrega/cobrança — grant coluna a coluna.
"""

import uuid
from decimal import Decimal

import psycopg
import pytest

from tests.db.factories import (
    create_contact,
    create_order,
    create_store,
    create_tenant,
)
from tests.support.database import as_runtime_worker, as_worker


@pytest.fixture
def tenant(admin: psycopg.Connection) -> uuid.UUID:
    organization_id = create_tenant(admin)
    yield organization_id
    with admin.cursor() as cur:
        cur.execute("delete from public.organizations where id = %s", (organization_id,))


async def _load(dsn: str, organization_id: uuid.UUID, contact_id: uuid.UUID):
    from agents_runtime.repository import orders as orders_repo

    async with as_worker(dsn, organization_id) as conn:
        return await orders_repo.load_purchase_history(
            conn, organization_id=organization_id, contact_id=contact_id
        )


class TestDecision81b:
    async def test_an_org_without_a_store_has_no_record_at_all(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        contact_id = create_contact(admin, tenant)

        history = await _load(dsn, tenant, contact_id)

        assert history is None

    async def test_a_store_with_no_orders_is_an_explicit_zero(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        create_store(admin, tenant)
        contact_id = create_contact(admin, tenant)

        history = await _load(dsn, tenant, contact_id)

        assert history is not None
        assert history.total_orders == 0
        assert history.recent == ()


class TestTheLinkIsPreciseNeverFuzzy:
    async def test_orders_link_by_contact_id_and_by_exact_email(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        store = create_store(admin, tenant)
        contact_id = create_contact(admin, tenant, email="Ana@Example.test")
        create_order(
            admin, tenant, store,
            contact_id=contact_id, name="#1001", total=150.0,
            line_items=[{"title": "Tênis", "quantity": 1}], placed_days_ago=10,
        )
        # Bulk antigo: sem contact_id, só o e-mail (case diferente de propósito).
        create_order(
            admin, tenant, store,
            email="ana@example.test", name="#1002", total=50.0,
            line_items=[{"title": "Meia", "quantity": 2}], placed_days_ago=2,
        )
        # Pedido de OUTRO cliente da mesma loja: nunca aparece.
        create_order(admin, tenant, store, name="#1003", total=999.0)

        history = await _load(dsn, tenant, contact_id)

        assert history.total_orders == 2
        assert history.total_spent == Decimal("200.00")
        assert history.first_order_at is not None
        assert history.last_order_at is not None
        assert history.first_order_at < history.last_order_at
        # Mais novo primeiro; o rótulo é o `name` da loja; itens legíveis.
        assert [o.label for o in history.recent] == ["#1002", "#1001"]
        assert history.recent[0].items == ("2x Meia",)
        assert history.recent[1].items == ("Tênis",)

    async def test_a_refund_subtracts_from_what_was_spent(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        store = create_store(admin, tenant)
        contact_id = create_contact(admin, tenant)
        create_order(admin, tenant, store, contact_id=contact_id, total=100.0)
        create_order(
            admin, tenant, store, contact_id=contact_id,
            total=80.0, refunded=80.0, financial_status="refunded",
        )

        history = await _load(dsn, tenant, contact_id)

        assert history.total_orders == 2
        assert history.total_spent == Decimal("100.00")

    async def test_another_orgs_orders_never_leak_even_with_the_same_email(
        self, dsn: str, admin: psycopg.Connection, tenant: uuid.UUID
    ) -> None:
        email = f"{uuid.uuid4().hex[:10]}@example.test"
        create_store(admin, tenant)
        contact_id = create_contact(admin, tenant, email=email)

        other_org = create_tenant(admin)
        other_store = create_store(admin, other_org)
        create_order(admin, other_org, other_store, email=email, total=500.0)

        try:
            history = await _load(dsn, tenant, contact_id)
            assert history.total_orders == 0
        finally:
            with admin.cursor() as cur:
                cur.execute(
                    "delete from public.organizations where id = %s", (other_org,)
                )


class TestPrivacyByConstruction:
    async def test_the_worker_cannot_read_shipping_addresses(self, dsn: str) -> None:
        async with as_runtime_worker(dsn) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                await conn.execute(
                    "select shipping_address from public.shopify_orders limit 1"
                )
