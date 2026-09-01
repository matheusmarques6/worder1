"""Item 32 — o guard ligado no sender de verdade, não só a função pura.

A régua está provada em `test_send_guard.py`. Aqui o que se prova é a FIAÇÃO:
que o veredito é EXECUTADO e não sugerido, que a linha segurada volta para a
fila em vez de morrer, que o motivo fica legível para quem opera, e que o
resultado de cada chamada ao Graph volta para o breaker.

Ruling N, o desenho que estes testes prendem: **o gate é por LINHA, o alimento
é por CHAMADA.** Uma checagem antes da primeira bolha — checar antes de cada
bolha abriria o caso de bloquear no meio de uma mensagem já parcialmente
entregue — e um relato depois de CADA `channel.send`, porque é a chamada ao
Graph que a Meta conta e é ela que falha.
"""

import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager

import psycopg
import pytest

from agents_runtime.config import QueueingConfig
from agents_runtime.queueing.sender import sender_pass
from agents_runtime.randomness import SystemRandomness
from tests.db.conftest import TwoTenants
from tests.db.factories import (
    Thread,
    create_outbox_item,
    create_template_policy,
    create_thread,
    open_window,
)
from tests.db.test_send_guard import FAILURE_THRESHOLD, close_breaker, report
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
