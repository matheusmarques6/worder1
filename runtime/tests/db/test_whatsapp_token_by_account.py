"""Auditoria 2026-08-28, item 20 — token Meta por conta, não mais global.

`internal.active_whatsapp_business_account` é a porta SECURITY DEFINER que
entrega a credencial da conta ativa de UMA org — no mesmo molde de
`internal.active_shopify_store` (20260813000006): a primeira coisa que a
função faz é recusar se a org pedida não é a org da sessão, ANTES de
qualquer leitura. É esse teste — a recusa — que este item existe para provar;
o resto é o caminho feliz que confirma que a porta ainda entrega a conta
certa depois de fechada para as outras.

Fix round 1: a 1ª entrega deste arquivo tinha um teste
(`test_an_org_with_no_session_scope_is_refused_too`) que abria uma conexão
NUNCA escopada — exatamente a forma do `sender_conn` real de produção
(`app.py:231-240` abre uma conexão só, para a fila inteira, e
`repository/engine.py` documenta isso: "a conexão do sender drena todas as
orgs sem escopo fixo") — e afirmava a RECUSA como o desfecho correto. Era o
desfecho da função crua, mas não do caminho de produção: o review provou ao
vivo que, sem escopo em lugar nenhum, TODO envio recusava. O conserto (agora
em `repository/whatsapp_accounts.py`) escopa por operação, dentro do
repository — `TestTheRepositoryScopesPerOperationNotTheWholeConnection`
abaixo prova as duas metades: a função crua CONTINUA recusando sem escopo (é
a garantia de fronteira, não regride), e o repository, na MESMA conexão nunca
escopada por fora, SUCEDE.
"""

import uuid

import psycopg
import pytest

from agents_runtime.repository.whatsapp_accounts import load_active_account
from tests.db.conftest import TwoTenants, as_app_role
from tests.db.factories import create_channel_account


def active_account(conn: psycopg.Connection, organization_id: uuid.UUID) -> tuple:
    return conn.execute(
        "select * from internal.active_whatsapp_business_account(%s)",
        (organization_id,),
    ).fetchone()


class TestTheOrgMismatchIsRefusedBeforeAnyRead:
    def test_one_org_cannot_read_another_orgs_credential(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """A prova que este item inteiro existe para escrever: a org B, com
        uma conexão scoped para B, pede a credencial da org A — e a função
        recusa antes de tocar em `whatsapp_business_accounts`, mesmo sendo
        SECURITY DEFINER e mesmo existindo uma conta ativa para A."""
        create_channel_account(admin, two_tenants.a.id, access_token="a-secret-token")

        with as_app_role(dsn, "sender_role", two_tenants.b.id) as conn:
            with pytest.raises(psycopg.errors.RaiseException) as caught:
                active_account(conn, two_tenants.a.id)

        # A mensagem nomeia a função e a org recusada, nunca um token — a
        # recusa não pode ser o lugar onde a credencial vaza pela lateral.
        message = str(caught.value)
        assert "active_whatsapp_business_account" in message
        assert str(two_tenants.a.id) in message
        assert "a-secret-token" not in message


class TestTheRepositoryScopesPerOperationNotTheWholeConnection:
    """A conexão do sender é aberta UMA vez para todas as orgs (`app.py`) e
    NUNCA passa por `scope_to_organization` por fora — a mesma forma que
    `repository/engine.py:alert_moment_suppression` já assume para o alerta
    de momento, nesta MESMA conexão. Uma função que só recusa sem escopo por
    fora não é uma guarda: em produção ela recusaria SEMPRE. As duas metades
    do fix ficam lado a lado aqui de propósito."""

    def test_the_raw_function_still_refuses_an_unscoped_call(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """Garantia de fronteira, sem o repository no meio: a função SQL
        sozinha não vira passe livre só porque ninguém escopou por fora —
        `current_app_organization_id()` ausente é só mais um valor que não
        bate com o pedido."""
        create_channel_account(admin, two_tenants.a.id, access_token="a-secret-token")

        with psycopg.connect(dsn) as conn:
            conn.execute("set role sender_role")
            with pytest.raises(psycopg.errors.RaiseException):
                active_account(conn, two_tenants.a.id)

    async def test_the_repository_succeeds_on_the_exact_shape_of_the_sender_conn(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """A prova que fecha o Critical do fix round 1: numa conexão idêntica
        à que `app._connect(dsn, sender_set_role, SENDER_ROLE)` produz de
        verdade — autocommit, role setada, `scope_to_organization` JAMAIS
        chamado por fora —, `load_active_account` tem que devolver a
        credencial da própria org. Ele escopa por operação, dentro de si."""
        create_channel_account(admin, two_tenants.a.id, access_token="a-secret-token")

        conn = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
        try:
            await conn.execute("set role sender_role")
            account = await load_active_account(conn, organization_id=two_tenants.a.id)
        finally:
            await conn.close()

        assert account is not None
        assert account.access_token == "a-secret-token"


class TestTheHappyPathStillWorksBehindTheGuard:
    def test_an_org_reads_its_own_active_account(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        account = create_channel_account(
            admin, two_tenants.a.id, access_token="a-secret-token"
        )

        with as_app_role(dsn, "sender_role", two_tenants.a.id) as conn:
            row = active_account(conn, two_tenants.a.id)

        assert row[0] == account.id
        assert row[1] == account.external_account_id
        assert row[2] == "a-secret-token"
        assert row[3] is None

    def test_prefers_the_encrypted_column_when_both_are_present(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """A função devolve as DUAS colunas cruas — quem decide qual vale é o
        Python (repository/whatsapp_accounts.py), mas a linha certa tem que
        chegar inteira, sem a porta já escolher por conta própria."""
        create_channel_account(
            admin,
            two_tenants.a.id,
            access_token="legado-em-claro",
            access_token_encrypted="v2:aa:bb:cc:dd",
        )

        with as_app_role(dsn, "sender_role", two_tenants.a.id) as conn:
            row = active_account(conn, two_tenants.a.id)

        assert row[2] == "legado-em-claro"
        assert row[3] == "v2:aa:bb:cc:dd"

    def test_only_the_active_account_is_returned(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """Uma conta desativada (reconexão, troca de número) não é a que o
        envio deve usar — mesmo critério que `claim_outbox_batch` já aplica."""
        create_channel_account(
            admin, two_tenants.a.id, access_token="inativa", status="disconnected"
        )
        active = create_channel_account(admin, two_tenants.a.id, access_token="ativa")

        with as_app_role(dsn, "sender_role", two_tenants.a.id) as conn:
            row = active_account(conn, two_tenants.a.id)

        assert row[0] == active.id
        assert row[2] == "ativa"

    def test_no_active_account_returns_no_row(
        self, dsn: str, two_tenants: TwoTenants
    ) -> None:
        with as_app_role(dsn, "sender_role", two_tenants.a.id) as conn:
            assert active_account(conn, two_tenants.a.id) is None


class TestOnlySenderRoleHoldsTheGrant:
    def test_worker_role_has_no_execute_on_the_function(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """O chamador real é o sender (`channels/cloud_api.py`), nunca o
        worker — o grant único para `sender_role` é a fronteira, não um
        detalhe de implementação esquecido."""
        create_channel_account(admin, two_tenants.a.id, access_token="a-secret-token")

        with as_app_role(dsn, "worker_role", two_tenants.a.id) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                active_account(conn, two_tenants.a.id)
