"""Auditoria 2026-08-28, item 34 — a porta que o runtime não tinha.

`grep whatsapp_templates runtime/src` voltava vazio: o runtime montava
`{name, language}` sem nunca perguntar se aquele template exige parâmetro.
`internal.whatsapp_template_shape` (20260901000009) é a pergunta — e ela é
SECURITY DEFINER pelo mesmo motivo do item 20: `public.whatsapp_templates` é
LEGADA e está SEM RLS (`relrowsecurity = false`, nenhuma policy), então um
`grant select` ao `sender_role` entregaria a ele os templates de todas as
organizações. O teste que este arquivo existe para escrever é a RECUSA; o
resto é o caminho feliz que confirma que a porta ainda entrega a linha certa.
"""

import uuid

import psycopg
import pytest

from agents_runtime.repository.whatsapp_templates import load_template_shape
from tests.db.conftest import TwoTenants, as_app_role
from tests.db.factories import create_whatsapp_template


def template_shape(conn: psycopg.Connection, organization_id: uuid.UUID, name: str) -> tuple:
    return conn.execute(
        "select * from internal.whatsapp_template_shape(%s, %s, %s)",
        (organization_id, name, "pt_BR"),
    ).fetchone()


class TestTheOrgMismatchIsRefusedBeforeAnyRead:
    def test_one_org_cannot_read_another_orgs_template(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """A tabela não tem RLS: sem esta guarda, `sender_role` leria o
        catálogo de templates de qualquer loja da plataforma."""
        create_whatsapp_template(
            admin, two_tenants.a.id, name="volta_pra_loja", body_text="Oi {{1}}"
        )

        with as_app_role(dsn, "sender_role", two_tenants.b.id) as conn:
            with pytest.raises(psycopg.errors.RaiseException) as caught:
                template_shape(conn, two_tenants.a.id, "volta_pra_loja")

        message = str(caught.value)
        assert "whatsapp_template_shape" in message
        assert str(two_tenants.a.id) in message

    def test_the_raw_function_refuses_an_unscoped_call(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """Sem escopo por fora — a forma crua da conexão do sender — a função
        continua recusando: `current_app_organization_id()` ausente é só mais
        um valor que não bate com o pedido."""
        create_whatsapp_template(
            admin, two_tenants.a.id, name="volta_pra_loja", body_text="Oi {{1}}"
        )

        with psycopg.connect(dsn) as conn:
            conn.execute("set role sender_role")
            with pytest.raises(psycopg.errors.RaiseException):
                template_shape(conn, two_tenants.a.id, "volta_pra_loja")


class TestTheRepositoryScopesPerOperationNotTheWholeConnection:
    async def test_it_succeeds_on_the_exact_shape_of_the_sender_conn(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """A conexão do sender é aberta UMA vez para a fila inteira e nunca
        passa por `scope_to_organization` por fora (`app.py`). Uma leitura que
        só funcionasse com escopo externo recusaria TODO envio em produção —
        foi assim que o item 20 quebrou no fix round 1."""
        create_whatsapp_template(
            admin,
            two_tenants.a.id,
            name="volta_pra_loja",
            body_text="Oi {{1}}, seu pedido {{2}} está pronto",
        )

        conn = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
        try:
            await conn.execute("set role sender_role")
            shape = await load_template_shape(
                conn,
                organization_id=two_tenants.a.id,
                name="volta_pra_loja",
                language="pt_BR",
            )
        finally:
            await conn.close()

        assert shape is not None
        assert shape.body_text == "Oi {{1}}, seu pedido {{2}} está pronto"

    async def test_a_template_the_org_never_synced_is_not_an_error(
        self, dsn: str, two_tenants: TwoTenants
    ) -> None:
        """Ruling C: ausência de sincronização é "não sei", nunca "não exige
        parâmetro" — e muito menos uma exceção que calaria a loja."""
        conn = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
        try:
            await conn.execute("set role sender_role")
            shape = await load_template_shape(
                conn,
                organization_id=two_tenants.a.id,
                name="nunca_sincronizado",
                language="pt_BR",
            )
        finally:
            await conn.close()

        assert shape is None


class TestTheShapeArrivesRawInBothFormats:
    def test_the_meta_components_json_comes_through_untouched(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """A porta não concilia os dois formatos — quem faz isso é o Python,
        espelhando `template-components.ts`. O que o SQL deve garantir é que
        as duas fontes cheguem inteiras."""
        create_whatsapp_template(
            admin,
            two_tenants.a.id,
            name="carrinho",
            components=[
                {"type": "HEADER", "format": "IMAGE"},
                {"type": "BODY", "text": "Oi {{1}}"},
            ],
            header_type="none",
            body_text=None,
        )

        with as_app_role(dsn, "sender_role", two_tenants.a.id) as conn:
            row = template_shape(conn, two_tenants.a.id, "carrinho")

        assert row[0] == [
            {"type": "HEADER", "format": "IMAGE"},
            {"type": "BODY", "text": "Oi {{1}}"},
        ]
        assert row[2] is None

    def test_the_language_is_part_of_the_question(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """Mesmo nome, idiomas diferentes, exigências diferentes — pedir pt_BR
        não pode devolver a linha em inglês."""
        create_whatsapp_template(
            admin, two_tenants.a.id, name="oi", language="en_US", body_text="Hi {{1}}"
        )

        with as_app_role(dsn, "sender_role", two_tenants.a.id) as conn:
            assert template_shape(conn, two_tenants.a.id, "oi") is None

    def test_the_most_recently_synced_row_wins(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """A UNIQUE da tabela é (waba_id, name, language): uma org com duas
        contas WABA tem duas linhas para o mesmo nome. A que descreve o que a
        Meta tem hoje é a sincronizada por último."""
        create_whatsapp_template(
            admin,
            two_tenants.a.id,
            name="promo",
            body_text="antigo, sem variável",
            synced_at_days_ago=10,
        )
        create_whatsapp_template(
            admin,
            two_tenants.a.id,
            name="promo",
            body_text="novo, com {{1}}",
            synced_at_days_ago=1,
        )

        with as_app_role(dsn, "sender_role", two_tenants.a.id) as conn:
            row = template_shape(conn, two_tenants.a.id, "promo")

        assert row[2] == "novo, com {{1}}"
