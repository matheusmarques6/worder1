"""A projeção textual do histórico de compras (E3 — decisão 81b).

O que o prompt AFIRMA sobre compras passa por `history_lines`, e a distinção
inteira da decisão 81b mora na diferença entre "nenhuma linha" e "uma linha
dizendo zero": sem espelho o prompt fica calado; com espelho e zero pedidos o
prompt diz que este contato ainda não comprou. O compiler só transporta —
`StateBlock.purchase_lines` entra no bloco ESTADO como veio.
"""

from datetime import datetime
from decimal import Decimal

from agents_runtime.agent_core.prompt_compiler import StateBlock
from agents_runtime.repository.orders import (
    OrderSummary,
    PurchaseHistory,
    history_lines,
)


def a_history(**overrides) -> PurchaseHistory:
    base = dict(
        total_orders=2,
        total_spent=Decimal("200.00"),
        currency="BRL",
        first_order_at=datetime(2026, 6, 1, 12, 0),
        last_order_at=datetime(2026, 8, 10, 12, 0),
        recent=(
            OrderSummary(
                label="#1002",
                placed_at=datetime(2026, 8, 10, 12, 0),
                total=Decimal("50.00"),
                currency="BRL",
                financial_status="paid",
                fulfillment_status="fulfilled",
                items=("2x Meia",),
            ),
        ),
    )
    base.update(overrides)
    return PurchaseHistory(**base)


class TestDecision81bInText:
    def test_no_mirror_says_nothing(self) -> None:
        assert history_lines(None) == ()

    def test_zero_orders_is_an_explicit_sentence(self) -> None:
        lines = history_lines(
            a_history(total_orders=0, total_spent=Decimal("0"), recent=())
        )
        assert lines == ("Compras — nenhuma compra registrada nesta loja até hoje.",)

    def test_orders_become_a_summary_and_recent_lines(self) -> None:
        lines = history_lines(a_history())

        assert lines[0] == (
            "Compras — 2 pedido(s), R$ 200.00 no total; último em 10/08/2026."
        )
        assert lines[1] == (
            "Compras — pedido #1002 em 10/08/2026: 2x Meia — R$ 50.00 (pago, enviado)."
        )

    def test_a_foreign_currency_is_never_dressed_as_reais(self) -> None:
        lines = history_lines(a_history(currency="USD"))
        assert "USD 200.00" in lines[0]
        assert "R$" not in lines[0]


class TestTheStateBlockCarriesTheLines:
    def test_purchase_lines_render_inside_estado(self) -> None:
        block = StateBlock(
            moment_ids=(),
            moment_facts=(),
            moment_public_claim=None,
            grant_id=None,
            grant_lines=(),
            ledger_lines=(),
            contact_facts=(("nome", "Ana"),),
            purchase_lines=("Compras — 1 pedido(s), R$ 50.00 no total.",),
        )
        from agents_runtime.agent_core.prompt_compiler import _state_block

        text = _state_block(block).text
        assert "Compras — 1 pedido(s), R$ 50.00 no total." in text
        assert "Contato — nome: Ana" in text

    def test_the_default_is_silence_not_a_claim(self) -> None:
        block = StateBlock(
            moment_ids=(),
            moment_facts=(),
            moment_public_claim=None,
            grant_id=None,
            grant_lines=(),
            ledger_lines=(),
            contact_facts=(),
        )
        from agents_runtime.agent_core.prompt_compiler import _state_block

        assert "Compras" not in _state_block(block).text
