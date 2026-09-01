"""The Cloud API adapter, proven against a fake transport.

`httpx.MockTransport` keeps everything in-process — no socket is opened, so
this is honestly `unit`. What CANNOT be proven here is Meta's side of the
contract (does `biz_opaque_callback_data` echo back? does a resend duplicate?)
— that is the `contract` suite, weekly, with real credentials, and it stays
pendência nº 2 until B-4 hands over a token.

The request shapes mirror worder1, which ran this API in production.

Auditoria 2026-08-28, item 20: o canal já não segura um token fixo — ele pede
um por envio a um `load_token` injetado (a assinatura de
`repository.whatsapp_accounts` + banco, na produção). `conn` aqui é sempre
`None`: o fake ignora, exatamente como o fake de produção ignoraria uma
conexão de verdade — nenhum destes testes toca Postgres.
"""

import json
import uuid

import httpx
import pytest

from agents_runtime.channels.cloud_api import CloudApiChannel, from_env
from agents_runtime.queueing.failures import Failure, classify, is_rate_limited
from agents_runtime.repository.outbox import ClaimedSend


def a_send(**overrides) -> ClaimedSend:
    defaults = dict(
        outbox_id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        channel_type="cloud",
        channel_external_id="123456789012345",  # the phone_number_id
        to_phone_e164="+5511987654321",
        payload={"text": "Seu pedido saiu para entrega 🧡"},
        idempotency_key="reply-abc-2",
        attempt_count=1,
    )
    return ClaimedSend(**{**defaults, **overrides})


def channel_answering(handler, *, token: str = "token-de-teste") -> CloudApiChannel:
    async def load_token(conn, organization_id) -> str:
        return token

    return CloudApiChannel(load_token=load_token, transport=httpx.MockTransport(handler))


async def test_the_request_is_the_one_the_cloud_api_expects() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"messages": [{"id": "wamid.HBg="}]})

    wamid = await channel_answering(handler).send(None, a_send())

    assert wamid == "wamid.HBg="
    # The account routes by phone_number_id in the PATH — the same id that
    # resolves the tenant on the inbound side.
    assert seen["url"].endswith("/123456789012345/messages")
    assert seen["auth"] == "Bearer token-de-teste"
    assert seen["body"]["to"] == "+5511987654321"
    assert seen["body"]["type"] == "text"
    assert seen["body"]["text"] == {"body": "Seu pedido saiu para entrega 🧡"}


async def test_the_send_uses_the_accounts_token_never_the_global_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A prova que este item existe para escrever: mesmo com
    `AGENTS_META_ACCESS_TOKEN` setada no ambiente, quem autentica o envio é o
    token que o `load_token` da CONTA devolveu — o canal nem olha para a env."""
    monkeypatch.setenv("AGENTS_META_ACCESS_TOKEN", "token-global-nunca-deveria-sair")

    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"messages": [{"id": "wamid.ACC"}]})

    channel = channel_answering(handler, token="token-da-conta-org-especifica")
    await channel.send(None, a_send())

    assert seen["auth"] == "Bearer token-da-conta-org-especifica"


async def test_each_send_asks_the_loader_for_that_sends_organization() -> None:
    """`load_token` recebe a org de CADA linha — duas orgs na mesma fila
    nunca podem compartilhar a credencial que uma delas resolveu."""
    seen_orgs: list[uuid.UUID] = []

    async def load_token(conn, organization_id) -> str:
        seen_orgs.append(organization_id)
        return f"token-{organization_id}"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"messages": [{"id": "wamid.X"}]})

    channel = CloudApiChannel(load_token=load_token, transport=httpx.MockTransport(handler))
    org_a, org_b = uuid.uuid4(), uuid.uuid4()

    await channel.send(None, a_send(organization_id=org_a))
    await channel.send(None, a_send(organization_id=org_b))

    assert seen_orgs == [org_a, org_b]


async def test_the_idempotency_key_travels_in_the_opaque_field() -> None:
    # Decisão 59: one key, two worlds. Without this line in the payload, an
    # unknown outbox row whose sender died before the wamid arrived would have
    # NO evidence that could ever resolve it.
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(200, json={"messages": [{"id": "wamid.X"}]})

    await channel_answering(handler).send(None, a_send(idempotency_key="reply-conv-7"))

    assert captured["biz_opaque_callback_data"] == "reply-conv-7"


@pytest.mark.parametrize(
    ("status", "expected_class"),
    [
        (429, Failure.TRANSIENT),
        (500, Failure.TRANSIENT),
        (503, Failure.TRANSIENT),
        (400, Failure.PERMANENT),
        (401, Failure.PERMANENT),
    ],
)
async def test_provider_errors_speak_the_classifier_language(
    status: int, expected_class: Failure
) -> None:
    # The adapter's error message IS its integration contract with unidade 4:
    # the classifier reads the HTTP status out of it. Same vocabulary, one
    # judge.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"error": {"message": "nope"}})

    with pytest.raises(RuntimeError) as failure:
        await channel_answering(handler).send(None, a_send())

    assert classify(failure.value) is expected_class


async def test_a_2xx_without_a_wamid_is_permanent() -> None:
    # A success the provider cannot name is a contract violation — retrying it
    # blind is how a customer gets the same message twice.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"messages": []})

    with pytest.raises(ValueError) as failure:
        await channel_answering(handler).send(None, a_send())

    assert classify(failure.value) is Failure.PERMANENT


async def test_a_template_send_takes_the_template_shape() -> None:
    # O rebaixamento do preflight (janela fechada → template aprovado): o que
    # chega ao wire é nome + idioma, nunca o texto livre que a outbox carregava.
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(200, json={"messages": [{"id": "wamid.T"}]})

    wamid = await channel_answering(handler).send(
        None, a_send(payload={"template": {"name": "volta_pra_loja", "language": "pt_BR"}})
    )

    assert wamid == "wamid.T"
    assert seen["type"] == "template"
    assert seen["template"] == {"name": "volta_pra_loja", "language": {"code": "pt_BR"}}
    assert "text" not in seen
    # A correlação de status vale para template igual (decisão 59).
    assert seen["biz_opaque_callback_data"] == "reply-abc-2"


async def test_a_template_without_a_name_never_reaches_the_wire() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200)

    with pytest.raises(ValueError, match="template"):
        await channel_answering(handler).send(
            None, a_send(payload={"template": {"language": "pt_BR"}})
        )

    assert calls == 0


async def test_an_unknown_payload_shape_never_reaches_the_wire() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200)

    with pytest.raises(ValueError):
        await channel_answering(handler).send(None, a_send(payload={"template": "x"}))

    assert calls == 0, "guessing at an unknown shape would send SOMETHING to a customer"


def test_missing_encryption_key_dies_at_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    # Item 20: a env global (AGENTS_META_ACCESS_TOKEN) sumiu do caminho de
    # produção — quem o canal agora exige na partida é ENCRYPTION_KEY, sem a
    # qual nenhuma conta cifrada abriria. Mesma doutrina: absent e broken são
    # estados diferentes, e nenhum vira "sem sender" em silêncio.
    monkeypatch.delenv("ENCRYPTION_KEY", raising=False)

    with pytest.raises(RuntimeError, match="ENCRYPTION_KEY"):
        from_env("postgresql://x")


# --- item 32, ruling R: o sinal de excesso não pode depender do comprimento ---
#
# `send` trunca o corpo em 300 caracteres para o `last_error`, e o cooldown do
# número lê o código de erro DESSA string. A truncagem existe para o log; uma
# decisão não pode depender do tamanho do texto que a Meta escolheu mandar.


def meta_error_body(message: str, code: int = 131048) -> dict:
    """A forma real de um erro da Meta: `code` vem DEPOIS de `message`, então
    quanto mais longa a mensagem, mais fundo o código."""
    return {
        "error": {
            "message": message,
            "type": "OAuthException",
            "code": code,
            "error_subcode": 2494055,
            "fbtrace_id": "A1bC2dE3fG4",
        }
    }


async def test_a_long_meta_message_does_not_bury_the_rate_limit_code() -> None:
    """O corpo de 381 B que o revisor mediu: mesma falha de excesso, mensagem
    completa, e o `code` cai depois do caractere 300."""
    body = meta_error_body(
        "(#131048) Spam rate limit hit. Message failed to send because there are"
        " restrictions on how many messages can be sent from this phone number."
        " This may be because too many previous messages were blocked or flagged"
        " as spam. Please check the quality rating of your phone number."
    )
    # A fatia de 300 de fato enterra o código — se deixar de enterrar, o teste
    # está provando outra coisa e precisa ser recalibrado.
    assert '"code":131048' not in httpx.Response(400, json=body).text[:300]

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json=body)

    with pytest.raises(RuntimeError) as failure:
        await channel_answering(handler).send(None, a_send())

    assert is_rate_limited(failure.value) is True


async def test_a_truncated_number_is_not_read_as_another_code() -> None:
    """A direção oposta, e mais traiçoeira: a truncagem pode partir um número.
    `"code":470` cortado vira `"code":4`, e o 4 ESTÁ na lista de excesso — um
    número entraria em cooldown por um erro que não é de limite."""
    body = meta_error_body("x" * 245, code=470)
    truncated = httpx.Response(400, json=body).text[:300]
    # A fatia de fato parte o número — se deixar de partir, o teste está
    # provando outra coisa e precisa ser recalibrado.
    assert truncated.endswith('"code":4')

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json=body)

    with pytest.raises(RuntimeError) as failure:
        await channel_answering(handler).send(None, a_send())

    assert is_rate_limited(failure.value) is False


async def test_a_short_body_still_works_the_old_way() -> None:
    """Controle: o caso que já passava continua passando."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json=meta_error_body("limite"))

    with pytest.raises(RuntimeError) as failure:
        await channel_answering(handler).send(None, a_send())

    assert is_rate_limited(failure.value) is True
