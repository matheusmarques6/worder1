"""Auditoria 2026-08-28, item 20, fix round 1 — a peça que faltava.

Os testes `unit` de `channels/cloud_api.py` injetam um `load_token` falso —
provam que o CANAL usa o que o loader devolve, nunca provam que o loader DE
VERDADE (`from_env`, banco + secret_box) devolve alguma coisa. E os testes
`db` de `test_whatsapp_token_by_account.py` provam o repository direto, nunca
`from_env`. O buraco entre os dois é exatamente onde o Critical do fix round 1
morava: `from_env` real, sobre a conexão exata que o sender abre (nunca
escopada por fora), tinha que recusar SEMPRE — nenhum teste olhava para essa
combinação.

`test_responder_is_required.py` é a razão deste arquivo existir do jeito que
existe: uma guarda de fiação só vale testada pela porta que a produção usa,
não por uma cópia da lógica escrita à mão no teste. Aqui a porta é
`from_env(dsn)` de verdade — nenhum `load_token` injetado — mandando de
verdade pelo `channel.send`, com o transporte de rede interceptado (o único
jeito de fazer isso sem `from_env` expor um parâmetro de teste que a produção
não usaria).
"""

import json
import uuid

import httpx
import psycopg
import pytest

import agents_runtime.channels.cloud_api as cloud_api
from agents_runtime.channels.template_components import TemplateParametersMissing
from agents_runtime.repository.outbox import ClaimedSend
from tests.db.conftest import TwoTenants
from tests.db.factories import create_channel_account, create_whatsapp_template


async def _sender_shaped_connection(dsn: str) -> psycopg.AsyncConnection:
    """O MESMO formato que `app._connect(dsn, sender_set_role, SENDER_ROLE)`
    produz de verdade: autocommit, role setada, e nenhum `scope_to_organization`
    chamado por fora — o sender real nunca escopa a conexão inteira."""
    conn = await psycopg.AsyncConnection.connect(dsn, autocommit=True)
    await conn.execute("set role sender_role")
    return conn


class TestFromEnvResolvesARealTokenOnTheUnscopedSenderConnection:
    async def test_the_send_uses_the_accounts_real_token_not_a_fake(
        self,
        dsn: str,
        admin: psycopg.Connection,
        two_tenants: TwoTenants,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Nenhum `load_token` injetado: `from_env` de verdade, e a única
        coisa interceptada é o transporte de rede (mesmo papel do `transport=`
        que os testes unit já recebem no construtor — `from_env` não expõe
        esse parâmetro, então o alvo é `httpx.AsyncClient` em si, só para esta
        chamada). Se isto recusar, o deploy recusa TODO envio junto."""
        monkeypatch.setenv("ENCRYPTION_KEY", "x" * 32)
        monkeypatch.delenv("AGENTS_META_ACCESS_TOKEN", raising=False)

        account = create_channel_account(
            admin, two_tenants.a.id, access_token="token-de-producao"
        )

        seen: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen["auth"] = request.headers.get("authorization")
            seen["url"] = str(request.url)
            return httpx.Response(200, json={"messages": [{"id": "wamid.REAL"}]})

        real_async_client = httpx.AsyncClient

        def client_with_mock_transport(*args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            return real_async_client(*args, **kwargs)

        monkeypatch.setattr(cloud_api.httpx, "AsyncClient", client_with_mock_transport)

        channel = cloud_api.from_env(dsn)
        conn = await _sender_shaped_connection(dsn)
        try:
            wamid = await channel.send(
                conn,
                ClaimedSend(
                    outbox_id=uuid.uuid4(),
                    organization_id=two_tenants.a.id,
                    channel_type="whatsapp",
                    channel_external_id=account.external_account_id,
                    to_phone_e164="+5511987654321",
                    payload={"text": "oi"},
                    idempotency_key="idem-real-wiring",
                    attempt_count=1,
                ),
            )
        finally:
            await conn.close()
            await channel.aclose()

        assert wamid == "wamid.REAL"
        assert seen["auth"] == "Bearer token-de-producao"
        assert seen["url"].endswith(f"/{account.external_account_id}/messages")

    async def test_a_second_org_on_the_same_shared_connection_gets_its_own_token(
        self,
        dsn: str,
        admin: psycopg.Connection,
        two_tenants: TwoTenants,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A conexão é UMA só, compartilhada — a prova de isolamento real é
        duas orgs na mesma conexão, cada uma recebendo o SEU token."""
        monkeypatch.setenv("ENCRYPTION_KEY", "x" * 32)
        monkeypatch.delenv("AGENTS_META_ACCESS_TOKEN", raising=False)

        account_a = create_channel_account(admin, two_tenants.a.id, access_token="token-a")
        account_b = create_channel_account(admin, two_tenants.b.id, access_token="token-b")

        seen_auth: list[str | None] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen_auth.append(request.headers.get("authorization"))
            return httpx.Response(200, json={"messages": [{"id": "wamid.X"}]})

        real_async_client = httpx.AsyncClient

        def client_with_mock_transport(*args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            return real_async_client(*args, **kwargs)

        monkeypatch.setattr(cloud_api.httpx, "AsyncClient", client_with_mock_transport)

        channel = cloud_api.from_env(dsn)
        conn = await _sender_shaped_connection(dsn)

        def a_send(organization_id, channel_external_id) -> ClaimedSend:
            return ClaimedSend(
                outbox_id=uuid.uuid4(),
                organization_id=organization_id,
                channel_type="whatsapp",
                channel_external_id=channel_external_id,
                to_phone_e164="+5511987654321",
                payload={"text": "oi"},
                idempotency_key=f"idem-{uuid.uuid4()}",
                attempt_count=1,
            )

        try:
            await channel.send(conn, a_send(two_tenants.a.id, account_a.external_account_id))
            await channel.send(conn, a_send(two_tenants.b.id, account_b.external_account_id))
        finally:
            await conn.close()
            await channel.aclose()

        assert seen_auth == ["Bearer token-a", "Bearer token-b"]


class TestFromEnvAsksTheRealTemplatePort:
    """Auditoria 2026-08-28, item 34 — o buraco que o default abre.

    `CloudApiChannel(load_template_shape=None)` significa "não sei", e "não
    sei" MANDA. É o que os testes de unidade usam (não há Postgres lá) e é o
    comportamento certo para uma org sem catálogo sincronizado — mas se
    `from_env` esquecesse de ligar o loader de verdade, a produção inteira
    cairia nesse default e a guarda deste item ficaria muda sem nenhum teste
    reclamar. Este arquivo já existe por causa do buraco gêmeo no item 20.
    """

    async def test_a_template_that_demands_a_variable_never_reaches_the_wire(
        self,
        dsn: str,
        admin: psycopg.Connection,
        two_tenants: TwoTenants,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("ENCRYPTION_KEY", "x" * 32)
        account = create_channel_account(
            admin, two_tenants.a.id, access_token="token-de-producao"
        )
        create_whatsapp_template(
            admin,
            two_tenants.a.id,
            name="volta_pra_loja",
            body_text="Oi {{1}}, seu carrinho ainda está aqui",
        )

        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            return httpx.Response(200, json={"messages": [{"id": "wamid.NAO"}]})

        real_async_client = httpx.AsyncClient

        def client_with_mock_transport(*args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            return real_async_client(*args, **kwargs)

        monkeypatch.setattr(cloud_api.httpx, "AsyncClient", client_with_mock_transport)

        channel = cloud_api.from_env(dsn)
        conn = await _sender_shaped_connection(dsn)
        try:
            with pytest.raises(TemplateParametersMissing) as failure:
                await channel.send(
                    conn,
                    ClaimedSend(
                        outbox_id=uuid.uuid4(),
                        organization_id=two_tenants.a.id,
                        channel_type="whatsapp",
                        channel_external_id=account.external_account_id,
                        to_phone_e164="+5511987654321",
                        payload={"template": {"name": "volta_pra_loja", "language": "pt_BR"}},
                        idempotency_key="idem-template-exige",
                        attempt_count=1,
                    ),
                )
        finally:
            await conn.close()
            await channel.aclose()

        assert calls == 0
        assert "volta_pra_loja" in str(failure.value)

    async def test_another_orgs_template_is_not_the_answer_for_this_one(
        self,
        dsn: str,
        admin: psycopg.Connection,
        two_tenants: TwoTenants,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A tabela não tem RLS. Se a leitura não fosse escopada, o template
        exigente da org B recusaria o envio perfeitamente válido da org A —
        e o vazamento seria de dados, não só de comportamento."""
        monkeypatch.setenv("ENCRYPTION_KEY", "x" * 32)
        account = create_channel_account(
            admin, two_tenants.a.id, access_token="token-de-producao"
        )
        create_whatsapp_template(
            admin, two_tenants.b.id, name="volta_pra_loja", body_text="Oi {{1}}"
        )

        seen: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            seen.update(json.loads(request.content))
            return httpx.Response(200, json={"messages": [{"id": "wamid.OK"}]})

        real_async_client = httpx.AsyncClient

        def client_with_mock_transport(*args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            return real_async_client(*args, **kwargs)

        monkeypatch.setattr(cloud_api.httpx, "AsyncClient", client_with_mock_transport)

        channel = cloud_api.from_env(dsn)
        conn = await _sender_shaped_connection(dsn)
        try:
            wamid = await channel.send(
                conn,
                ClaimedSend(
                    outbox_id=uuid.uuid4(),
                    organization_id=two_tenants.a.id,
                    channel_type="whatsapp",
                    channel_external_id=account.external_account_id,
                    to_phone_e164="+5511987654321",
                    payload={"template": {"name": "volta_pra_loja", "language": "pt_BR"}},
                    idempotency_key="idem-template-de-outra-org",
                    attempt_count=1,
                ),
            )
        finally:
            await conn.close()
            await channel.aclose()

        assert wamid == "wamid.OK"
        assert seen["template"] == {"name": "volta_pra_loja", "language": {"code": "pt_BR"}}
