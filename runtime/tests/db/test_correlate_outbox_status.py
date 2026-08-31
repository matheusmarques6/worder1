"""item 10 da auditoria, fix round 1 — o motivo da falha chega em `last_error`.

`internal.correlate_outbox_status` já movia a row para `sent`/`failed`
(20260812000004), e o wrapper público `correlate_channel_status` já era o
único jeito de um webhook de status alcançar essa função (20260813000003).
O que faltava: nenhuma das duas assinaturas tinha por onde passar o ERRO da
Meta — uma falha virava `status = 'failed'` com `last_error` sempre null.

20260828000005 adiciona `p_error text default null` no fim de ambas as
assinaturas — call sites antigos (3 args) continuam funcionando sem tocar.
A regra provada aqui: `last_error` só é escrito quando `p_status = 'failed'`;
um sucesso nunca apaga um erro anterior com null.
"""

import uuid

import psycopg
import pytest

from tests.db.conftest import TwoTenants
from tests.db.factories import Thread, create_outbox_item, create_thread


def outbox_status_row(conn: psycopg.Connection, outbox_id: uuid.UUID) -> dict:
    row = conn.execute(
        "select status, last_error, provider_message_id from internal.message_outbox where id = %s",
        (outbox_id,),
    ).fetchone()
    return {"status": row[0], "last_error": row[1], "provider_message_id": row[2]}


def idempotency_key_of(conn: psycopg.Connection, outbox_id: uuid.UUID) -> str:
    return conn.execute(
        "select idempotency_key from internal.message_outbox where id = %s",
        (outbox_id,),
    ).fetchone()[0]


@pytest.fixture
def thread(admin: psycopg.Connection, two_tenants: TwoTenants) -> Thread:
    return create_thread(admin, two_tenants.a.id)


@pytest.fixture
def sending(admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread) -> uuid.UUID:
    return create_outbox_item(admin, two_tenants.a.id, thread, status="sending")


class TestTheErrorReachesLastError:
    def test_a_failed_status_writes_both_the_status_and_the_reason(
        self, admin: psycopg.Connection, sending: uuid.UUID
    ) -> None:
        key = idempotency_key_of(admin, sending)

        found = admin.execute(
            "select internal.correlate_outbox_status(%s, 'failed', %s, %s)",
            (key, "wamid.real", "131047 - Re-engagement message"),
        ).fetchone()[0]
        assert found is True

        row = outbox_status_row(admin, sending)
        assert row["status"] == "failed"
        assert row["last_error"] == "131047 - Re-engagement message"
        assert row["provider_message_id"] == "wamid.real"

    def test_a_success_status_never_clobbers_an_existing_error(
        self, admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread
    ) -> None:
        # 'unknown' com last_error já gravado — o desfecho de um ciclo
        # anterior (sweep_outbox_unknown / uma falha prévia) que o webhook
        # de status agora vem resolver com um 'sent' atrasado.
        outbox_id = create_outbox_item(admin, two_tenants.a.id, thread, status="unknown")
        admin.execute(
            "update internal.message_outbox set last_error = %s where id = %s",
            ("previous failure", outbox_id),
        )
        key = idempotency_key_of(admin, outbox_id)

        found = admin.execute(
            "select internal.correlate_outbox_status(%s, 'sent', %s)",
            (key, "wamid.late"),
        ).fetchone()[0]
        assert found is True

        row = outbox_status_row(admin, outbox_id)
        assert row["status"] == "sent"
        # A regra do fix: sucesso não é licença pra apagar o motivo do erro
        # anterior — só a PRÓXIMA falha (ou um novo ciclo) tem autoridade
        # pra limpar.
        assert row["last_error"] == "previous failure"

    def test_the_old_three_argument_call_site_still_works(
        self, admin: psycopg.Connection, sending: uuid.UUID
    ) -> None:
        # p_error é opcional, no fim — nenhum chamador existente precisa
        # mudar. O teste em test_scenarios_c.py chama exatamente assim.
        key = idempotency_key_of(admin, sending)

        found = admin.execute(
            "select internal.correlate_outbox_status(%s, 'sent', %s)",
            (key, "wamid.old-callsite"),
        ).fetchone()[0]
        assert found is True

        row = outbox_status_row(admin, sending)
        assert row["status"] == "sent"
        assert row["last_error"] is None

    def test_the_public_wrapper_carries_the_error_through_too(
        self, admin: psycopg.Connection, sending: uuid.UUID
    ) -> None:
        # O webhook de status (app server, service_role) só fala com o
        # wrapper público — nunca com internal diretamente (FORK: internal é
        # invisível pra Data API de propósito). Prova que o parâmetro novo
        # atravessa o wrapper, não só a função internal.
        key = idempotency_key_of(admin, sending)

        admin.execute("set role service_role")
        found = admin.execute(
            "select public.correlate_channel_status(%s, 'failed', %s, %s)",
            (key, "wamid.wrapper", "500 - Internal Server Error"),
        ).fetchone()[0]
        admin.execute("reset role")

        assert found is True
        row = outbox_status_row(admin, sending)
        assert row["status"] == "failed"
        assert row["last_error"] == "500 - Internal Server Error"

    def test_the_vocabulary_guard_still_rejects_anything_but_sent_or_failed(
        self, admin: psycopg.Connection, sending: uuid.UUID
    ) -> None:
        key = idempotency_key_of(admin, sending)

        with pytest.raises(psycopg.errors.RaiseException, match="unknown correlation status"):
            admin.execute(
                "select internal.correlate_outbox_status(%s, 'delivered')",
                (key,),
            )


class TestCorrelationFromAnAlreadySentRow:
    """Review final, item 10: o caminho real de produção.

    `mark_outbox_sent` move a row para 'sent' assim que a Meta API responde
    200 — antes de qualquer webhook de status existir. O webhook de FALHA de
    entrega chega depois, encontrando a row já 'sent'. Os testes acima nunca
    provaram esse caminho: todos semeavam 'sending'/'unknown'.
    """

    def test_a_failure_reported_after_a_sent_row_is_recorded(
        self, admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread
    ) -> None:
        outbox_id = create_outbox_item(admin, two_tenants.a.id, thread, status="sent")
        key = idempotency_key_of(admin, outbox_id)

        found = admin.execute(
            "select internal.correlate_outbox_status(%s, 'failed', %s, %s)",
            (key, "wamid.late-failure", "131026 - Message undeliverable"),
        ).fetchone()[0]
        assert found is True

        row = outbox_status_row(admin, outbox_id)
        assert row["status"] == "failed"
        assert row["last_error"] == "131026 - Message undeliverable"

    def test_a_redundant_success_on_an_already_sent_row_does_not_clobber(
        self, admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread
    ) -> None:
        # Um 'sent' redundante (webhook reentregue, corrida) não pode apagar
        # um erro já registrado nem é licença para "confirmar" de novo — a
        # row já está no estado terminal certo, nada anda pra trás.
        outbox_id = create_outbox_item(admin, two_tenants.a.id, thread, status="sent")
        admin.execute(
            "update internal.message_outbox set last_error = %s where id = %s",
            ("previous failure", outbox_id),
        )
        key = idempotency_key_of(admin, outbox_id)

        found = admin.execute(
            "select internal.correlate_outbox_status(%s, 'sent', %s)",
            (key, "wamid.redundant"),
        ).fetchone()[0]
        assert found is False

        row = outbox_status_row(admin, outbox_id)
        assert row["status"] == "sent"
        assert row["last_error"] == "previous failure"

    def test_a_failed_row_does_not_walk_backward_to_sent(
        self, admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread
    ) -> None:
        outbox_id = create_outbox_item(admin, two_tenants.a.id, thread, status="failed")
        admin.execute(
            "update internal.message_outbox set last_error = %s where id = %s",
            ("131026 - Message undeliverable", outbox_id),
        )
        key = idempotency_key_of(admin, outbox_id)

        found = admin.execute(
            "select internal.correlate_outbox_status(%s, 'sent', %s)",
            (key, "wamid.late-success"),
        ).fetchone()[0]
        assert found is False

        row = outbox_status_row(admin, outbox_id)
        assert row["status"] == "failed"
        assert row["last_error"] == "131026 - Message undeliverable"

    def test_manual_review_is_left_alone_by_either_status(
        self, admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread
    ) -> None:
        outbox_id = create_outbox_item(admin, two_tenants.a.id, thread, status="manual_review")
        key = idempotency_key_of(admin, outbox_id)

        found_failed = admin.execute(
            "select internal.correlate_outbox_status(%s, 'failed', %s, %s)",
            (key, "wamid.mr", "any error"),
        ).fetchone()[0]
        assert found_failed is False

        found_sent = admin.execute(
            "select internal.correlate_outbox_status(%s, 'sent', %s)",
            (key, "wamid.mr"),
        ).fetchone()[0]
        assert found_sent is False

        row = outbox_status_row(admin, outbox_id)
        assert row["status"] == "manual_review"
