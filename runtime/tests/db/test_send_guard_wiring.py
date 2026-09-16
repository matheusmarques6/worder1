"""Item 32 — o guard ligado no sender de verdade, não só a função pura.

A régua está provada em `test_send_guard.py`. Aqui o que se prova é a FIAÇÃO:
que o veredito é EXECUTADO e não sugerido, que a linha segurada volta para a
fila em vez de morrer, que o motivo fica legível para quem opera, e que o
resultado de cada chamada ao Graph volta para o breaker.

Ruling N, o desenho que estes testes prendem: **o gate é por LINHA, o alimento
é por CHAMADA.** Uma checagem antes da primeira bolha — checar antes de cada
bolha abriria o caso de bloquear no meio de uma mensagem já parcialmente
entregue — e um relato depois de CADA POST de mensagem ou read/typing,
porque é a chamada ao Graph que a Meta conta e é ela que falha.
"""

import json
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager

import httpx
import psycopg
import pytest

from agents_runtime.channels.cloud_api import CloudApiChannel
from agents_runtime.config import QueueingConfig
from agents_runtime.queueing.sender import _mark_read_and_typing, sender_pass
from agents_runtime.randomness import SystemRandomness
from agents_runtime.repository.outbox import ClaimedSend
from tests.db.conftest import TwoTenants
from tests.db.factories import (
    Thread,
    contact_phone,
    create_cloud_mirror,
    create_outbox_item,
    create_template_policy,
    create_thread,
    open_window,
)
from tests.db.test_send_guard import (
    FAILURE_THRESHOLD,
    close_breaker,
    expire_window,
    report,
    streak,
)
from tests.support.fake_channel import SCHEMA_SQL, FakeChannel

NO_DELAYS = QueueingConfig(humanize_delays=False)

THREE_PARAGRAPHS = (
    "Oi Joana! Vi que ficou um tênis no seu carrinho.\n\n"
    "Ele ainda está reservado, e o frete continua grátis.\n\n"
    "Quer que eu te mande o link para fechar?"
)


@asynccontextmanager
async def as_sender(dsn: str):
    async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
        await conn.execute("set role sender_role")
        yield conn


@pytest.fixture
def fake_channel(dsn: str, admin: psycopg.Connection) -> FakeChannel:
    admin.execute(SCHEMA_SQL)
    admin.execute("truncate testing.fake_channel_sends, testing.fake_channel_directives")
    return FakeChannel(dsn)


@pytest.fixture(autouse=True)
def clean_guard_state(admin: psycopg.Connection) -> Iterator[None]:
    """As contas de teste nascem com `phone_number_id` no formato `wa-…`
    (`factories.unique_id`), e o estado do guard é por número — o teardown por
    org da conftest não o alcança."""
    yield
    admin.execute("delete from internal.whatsapp_send_guard where phone_number_id like 'wa-%'")


def account_number(admin: psycopg.Connection, thread: Thread) -> str:
    """O `phone_number_id` da conta da thread — a MESMA chave que o claim
    entrega ao sender em `channel_external_id`."""
    return admin.execute(
        "select phone_number_id from public.whatsapp_business_accounts where id = %s",
        (thread.channel_account_id,),
    ).fetchone()[0]


def guard_row(admin: psycopg.Connection, phone_number_id: str) -> tuple | None:
    return admin.execute(
        "select consecutive_failures, rate_limit_errors, open_until is not null"
        "  from internal.whatsapp_send_guard where phone_number_id = %s",
        (phone_number_id,),
    ).fetchone()


def outbox_row(admin: psycopg.Connection, outbox_id: uuid.UUID) -> tuple:
    return admin.execute(
        "select status, last_error, next_attempt_at - now()"
        "  from internal.message_outbox where id = %s",
        (outbox_id,),
    ).fetchone()


def sends_of(admin: psycopg.Connection, outbox_id: uuid.UUID) -> int:
    return admin.execute(
        "select count(*) from testing.fake_channel_sends where outbox_id = %s",
        (outbox_id,),
    ).fetchone()[0]


def direct(admin: psycopg.Connection, outbox_id: uuid.UUID, behavior: str) -> None:
    (key,) = admin.execute(
        "select idempotency_key from internal.message_outbox where id = %s", (outbox_id,)
    ).fetchone()
    admin.execute(
        "insert into testing.fake_channel_directives (idempotency_key, behavior) values (%s, %s)",
        (key, behavior),
    )


class TestTheVerdictIsExecuted:
    async def test_an_open_breaker_holds_the_line_without_touching_the_channel(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        """Requisitos 1 e 2 na mesma passada: o guard roda ANTES do envio, e a
        linha segurada volta para a fila com o atraso da janela em vez de
        morrer ou de sair assim mesmo."""
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id)
        for _ in range(FAILURE_THRESHOLD):
            report(admin, account_number(admin, thread), success=False)
        outbox_id = create_outbox_item(admin, org, thread)

        async with as_sender(dsn) as conn:
            await sender_pass(conn, fake_channel, config=NO_DELAYS, randomness=SystemRandomness())

        status, error, retry_in = outbox_row(admin, outbox_id)
        assert status == "pending"  # de volta para a fila, não perdida
        assert sends_of(admin, outbox_id) == 0  # e o canal nunca foi chamado
        # O atraso é o da JANELA do guard, não o da escada de backoff: a linha
        # volta quando o número volta.
        assert 25 <= retry_in.total_seconds() <= 30
        # Requisito 2: quem opera distingue "a Meta recusou" de "nós seguramos".
        assert "send-guard: circuit_open" in error
        assert "seguramos" in error

    async def test_a_throttled_number_holds_the_line_too(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id)
        pnid = account_number(admin, thread)
        for _ in range(10):
            report(admin, pnid, success=False, rate_limited=True)
        close_breaker(admin, pnid)  # fecha o breaker; o throttle fica
        outbox_id = create_outbox_item(admin, org, thread)

        async with as_sender(dsn) as conn:
            await sender_pass(conn, fake_channel, config=NO_DELAYS, randomness=SystemRandomness())

        status, error, retry_in = outbox_row(admin, outbox_id)
        assert status == "pending"
        assert sends_of(admin, outbox_id) == 0
        assert 55 <= retry_in.total_seconds() <= 60
        assert "send-guard: throttled" in error

    async def test_the_template_fallback_does_not_escape_the_guard(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        """O preflight rebaixa um toque de janela fechada para template — e o
        template é um envio como qualquer outro. Se o guard morasse acima da
        reescrita, esta linha sairia com o número em apuros."""
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id, hours_ago=25)
        create_template_policy(admin, org, template_name="volta_pra_loja")
        for _ in range(FAILURE_THRESHOLD):
            report(admin, account_number(admin, thread), success=False)
        outbox_id = create_outbox_item(admin, org, thread, kind="funnel_touch")

        async with as_sender(dsn) as conn:
            await sender_pass(conn, fake_channel, config=NO_DELAYS, randomness=SystemRandomness())

        status, error, _ = outbox_row(admin, outbox_id)
        assert status == "pending"
        assert "send-guard: circuit_open" in error
        assert sends_of(admin, outbox_id) == 0

    async def test_the_breaker_stops_the_storm_inside_a_single_pass(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        """O achado do checklist em pessoa: um lote inteiro martelando um número
        que a Meta está recusando.

        Dez linhas, todas recusadas. Antes deste item o sender chamaria o Graph
        dez vezes; agora as cinco primeiras falham, o breaker abre e as OUTRAS
        CINCO nunca saem — dentro do MESMO pass, sem esperar o próximo.

        A asserção é sobre quantas chegaram ao canal, e não sobre QUAIS: o
        `claim_outbox_batch` ordena o CTE por `next_attempt_at` mas o select
        externo não reordena, então a ordem de entrega dentro do lote não é
        garantida. Contar é a propriedade verdadeira; nomear a sexta linha seria
        prender um detalhe que o banco não promete.
        """
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id)
        lines = [create_outbox_item(admin, org, thread) for _ in range(10)]
        for outbox_id in lines:
            direct(admin, outbox_id, "fail_transient")

        async with as_sender(dsn) as conn:
            await sender_pass(conn, fake_channel, config=NO_DELAYS, randomness=SystemRandomness())

        assert guard_row(admin, account_number(admin, thread)) == (FAILURE_THRESHOLD, 0, True)
        reached = sum(sends_of(admin, outbox_id) for outbox_id in lines)
        assert reached == 0  # `fail_transient` levanta ANTES de registrar

        held = [
            outbox_id
            for outbox_id in lines
            if "send-guard: circuit_open" in (outbox_row(admin, outbox_id)[1] or "")
        ]
        refused = [
            outbox_id
            for outbox_id in lines
            if "503" in (outbox_row(admin, outbox_id)[1] or "")
        ]
        # Cinco chegaram à Meta e levaram não; cinco nós seguramos. E as dez
        # continuam na fila — segurar não é perder.
        assert len(refused) == FAILURE_THRESHOLD
        assert len(held) == 10 - FAILURE_THRESHOLD
        assert all(outbox_row(admin, outbox_id)[0] == "pending" for outbox_id in lines)

    async def test_the_hold_says_so_in_the_panel(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        """Ruling V: um envio segurado por dez minutos de throttle não pode ser
        invisível.

        Antes deste round o hold não emitia nada — nem o `sending`, que só sai
        depois do guard de propósito (anunciar "Enviando resposta" e então
        segurar faria o painel mentir). Quem opera só descobria lendo o
        `last_error` da outbox.

        O passo é `started`, não um novo: `started` é NÃO-terminal, e a linha
        VAI sair quando a janela passar — isto é atraso, não silêncio. É o
        mesmo precedente que o item 31 abriu para a degradação de mídia, e não
        exige vocabulário novo (o que seria `src/`, proibido aqui).
        """
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id)
        phone = contact_phone(admin, thread.contact_id)
        mirror = create_cloud_mirror(admin, org, thread.channel_account_id, phone)
        for _ in range(FAILURE_THRESHOLD):
            report(admin, account_number(admin, thread), success=False)
        create_outbox_item(admin, org, thread)

        async with as_sender(dsn) as conn:
            await sender_pass(conn, fake_channel, config=NO_DELAYS, randomness=SystemRandomness())

        steps = admin.execute(
            "select step, detail from public.whatsapp_ai_run_steps"
            " where conversation_id = %s order by created_at",
            (mirror.conversation_id,),
        ).fetchall()
        assert len(steps) == 1
        step, detail = steps[0]
        assert step == "started"
        # A voz é a do TS (`send-guard.ts:67-70`), porque é a mesma pausa vista
        # do mesmo lado — e o prazo entra, senão o painel diz "pausado" sem
        # dizer até quando.
        assert "muitas falhas seguidas" in detail
        assert "30s" in detail

    async def test_a_throttle_hold_says_the_other_reason(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id)
        phone = contact_phone(admin, thread.contact_id)
        mirror = create_cloud_mirror(admin, org, thread.channel_account_id, phone)
        pnid = account_number(admin, thread)
        for _ in range(10):
            report(admin, pnid, success=False, rate_limited=True)
        close_breaker(admin, pnid)
        create_outbox_item(admin, org, thread)

        async with as_sender(dsn) as conn:
            await sender_pass(conn, fake_channel, config=NO_DELAYS, randomness=SystemRandomness())

        detail = admin.execute(
            "select detail from public.whatsapp_ai_run_steps where conversation_id = %s",
            (mirror.conversation_id,),
        ).fetchone()[0]
        assert "excesso de envios" in detail

    async def test_the_guard_being_unavailable_lets_the_send_through(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        """Fail-open (ruling D, `send-guard.ts:21`): um outage da infra do
        guard nunca pode calar a loja. O grant revogado é indisponibilidade de
        verdade — o mesmo `psycopg.Error` que uma função ausente daria."""
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id)
        outbox_id = create_outbox_item(admin, org, thread, text="Tem sim! 3 cores.")
        admin.execute("revoke execute on function internal.send_guard_check(text) from sender_role")
        try:
            async with as_sender(dsn) as conn:
                await sender_pass(
                    conn, fake_channel, config=NO_DELAYS, randomness=SystemRandomness()
                )
        finally:
            admin.execute(
                "grant execute on function internal.send_guard_check(text) to sender_role"
            )

        assert outbox_row(admin, outbox_id)[0] == "sent"
        assert sends_of(admin, outbox_id) == 1


class TestReadAndTypingFeedsTheBreaker:
    @pytest.mark.parametrize("status", [200, 429, 400])
    async def test_each_real_presence_post_reports_once(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, status: int
    ) -> None:
        thread = create_thread(admin, two_tenants.a.id)
        pnid = account_number(admin, thread)
        for _ in range(5 if status == 200 else 9):
            report(admin, pnid, success=False, rate_limited=status != 200)
        if status == 200:
            expire_window(admin, pnid, "open_until")
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(
                status,
                json={"success": True} if status == 200 else {
                    "error": {"message": "x" * 400, "code": 130429},
                },
            )

        token_calls = []

        async def load_token(conn, organization_id, channel_external_id):
            token_calls.append((conn, organization_id, channel_external_id))
            return "test-token"

        channel = CloudApiChannel(load_token=load_token, transport=httpx.MockTransport(handler))
        send = ClaimedSend(
            outbox_id=uuid.uuid4(), organization_id=two_tenants.a.id,
            channel_type="whatsapp", channel_external_id=pnid, to_phone_e164="+15551234567",
            payload={"text": "oi"}, idempotency_key="presence", attempt_count=1,
            last_inbound_wamid="wamid.inbound",
        )
        try:
            async with as_sender(dsn) as conn:
                await _mark_read_and_typing(channel, conn, send)
        finally:
            await channel.aclose()

        assert token_calls == [(conn, two_tenants.a.id, pnid)]
        assert len(seen) == 1
        assert seen[0].method == "POST"
        assert seen[0].url.path.endswith(f"/{pnid}/messages")
        assert json.loads(seen[0].content)["status"] == "read"
        if status == 200:
            assert streak(admin, pnid) == 1  # zero or duplicate reports both fail
        else:
            assert guard_row(admin, pnid) == (10, 10, True)
            remaining = admin.execute(
                "select throttled_until - now() from internal.whatsapp_send_guard"
                " where phone_number_id = %s", (pnid,),
            ).fetchone()[0]
            assert 55 <= remaining.total_seconds() <= 60

    @pytest.mark.parametrize("no_wamid", [True, False])
    async def test_no_graph_call_leaves_the_guard_untouched(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, no_wamid: bool
    ) -> None:
        thread = create_thread(admin, two_tenants.a.id)
        pnid = account_number(admin, thread)
        reached: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            reached.append(request)
            return httpx.Response(200, json={"success": True})

        token_calls = []

        async def load_token(conn, organization_id, channel_external_id):
            token_calls.append((conn, organization_id, channel_external_id))
            raise ValueError("local credential unavailable")

        channel = CloudApiChannel(load_token=load_token, transport=httpx.MockTransport(handler))
        send = ClaimedSend(
            outbox_id=uuid.uuid4(), organization_id=two_tenants.a.id,
            channel_type="whatsapp", channel_external_id=pnid, to_phone_e164="+15551234567",
            payload={"text": "oi"}, idempotency_key="presence", attempt_count=1,
            last_inbound_wamid=None if no_wamid else "wamid.inbound",
        )
        try:
            async with as_sender(dsn) as conn:
                await _mark_read_and_typing(channel, conn, send)
        finally:
            await channel.aclose()

        assert token_calls == ([] if no_wamid else [(conn, two_tenants.a.id, pnid)])
        assert reached == []
        assert guard_row(admin, pnid) is None


class TestTheResultFeedsTheBreaker:
    async def test_the_happy_path_records_a_success(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        """O caminho feliz passa sem tocar em nada — e ainda assim CONTA. Sem o
        relato de sucesso, cinco falhas espalhadas ao longo de um dia inteiro
        acabariam abrindo o breaker de uma loja saudável."""
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id)
        pnid = account_number(admin, thread)
        for _ in range(FAILURE_THRESHOLD - 1):
            report(admin, pnid, success=False)
        outbox_id = create_outbox_item(admin, org, thread, text="Tem sim! 3 cores.")

        async with as_sender(dsn) as conn:
            await sender_pass(conn, fake_channel, config=NO_DELAYS, randomness=SystemRandomness())

        assert outbox_row(admin, outbox_id)[0] == "sent"
        assert guard_row(admin, pnid) == (0, 0, False)

    async def test_a_failure_that_never_left_the_house_does_not_count(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        """Ruling U(a): o canal faz trabalho local antes da rede — resolver a
        credencial, montar o payload — e os dois falham por bug NOSSO.

        Cinco payloads malformados do mesmo número abririam o circuito de uma
        conta perfeitamente saudável, e a loja ficaria 30 s muda por nossa
        causa. Aqui são cinco, o limiar exato, e o breaker não pode se mexer.
        """
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id)
        lines = [create_outbox_item(admin, org, thread) for _ in range(FAILURE_THRESHOLD)]
        for outbox_id in lines:
            direct(admin, outbox_id, "fail_before_the_provider")

        async with as_sender(dsn) as conn:
            await sender_pass(conn, fake_channel, config=NO_DELAYS, randomness=SystemRandomness())

        assert guard_row(admin, account_number(admin, thread)) is None

    async def test_a_failed_send_counts_against_the_number(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id)
        outbox_id = create_outbox_item(admin, org, thread, text="Tem sim! 3 cores.")
        direct(admin, outbox_id, "fail_transient")

        async with as_sender(dsn) as conn:
            await sender_pass(conn, fake_channel, config=NO_DELAYS, randomness=SystemRandomness())

        assert guard_row(admin, account_number(admin, thread)) == (1, 0, False)

    async def test_the_meta_excess_signal_reaches_the_number(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        """O seam inteiro: o corpo que a Meta devolve num excesso vira sinal de
        excesso NESTE número. A escada em si está provada no SQL; o que falta
        provar é que o sinal chega até lá vindo do canal de verdade."""
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id)
        outbox_id = create_outbox_item(admin, org, thread, text="Tem sim! 3 cores.")
        direct(admin, outbox_id, "fail_rate_limited")

        async with as_sender(dsn) as conn:
            await sender_pass(conn, fake_channel, config=NO_DELAYS, randomness=SystemRandomness())

        assert guard_row(admin, account_number(admin, thread)) == (1, 1, False)
        # Ruling S: o excesso chega como HTTP 400, que pelo status seria
        # permanente — e antes deste round a linha era DESCARTADA. O número
        # ficava protegido e a mensagem morria, que é meia proteção.
        assert outbox_row(admin, outbox_id)[0] == "pending"

    async def test_a_bubble_failing_after_the_first_still_counts(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, fake_channel
    ) -> None:
        """Ruling N, a metade que só o relato POR CHAMADA prende.

        A 1ª bolha saiu e a 2ª foi recusada: a LINHA conta como enviada — o que
        saiu vale, e re-entregar repetiria bolhas na tela do cliente —, mas o
        Graph recusou uma chamada e o breaker precisa saber. Um relato por
        linha da outbox veria só um sucesso e deixaria o contador em zero,
        que é o número errado sobre uma conta que acabou de recusar.
        """
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        open_window(admin, thread.conversation_id)
        outbox_id = create_outbox_item(admin, org, thread, text=THREE_PARAGRAPHS)
        direct(admin, outbox_id, "fail_after_first")

        async with as_sender(dsn) as conn:
            await sender_pass(conn, fake_channel, config=NO_DELAYS, randomness=SystemRandomness())

        assert outbox_row(admin, outbox_id)[0] == "sent"
        assert sends_of(admin, outbox_id) == 1
        assert guard_row(admin, account_number(admin, thread)) == (1, 0, False)
