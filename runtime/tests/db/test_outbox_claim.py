"""A5 — `claim_outbox_batch` e os desfechos do envio.

O sender drena a outbox de todos os tenants, e é por isso que a função é
`security definer` — a mesma justificativa do coalescer, e com a mesma
contrapartida: a assinatura não aceita filtro nenhum. Um sender que pudesse
pedir "só as linhas do tenant X" seria uma consulta cross-tenant arbitrária
com outro nome.

Os desfechos (`sent`, `failed`, retry) só acontecem com o token do dono — a
disciplina da lease, repetida na outbox.
"""

import threading
import uuid

import psycopg
import pytest

from tests.db.conftest import TwoTenants, as_app_role
from tests.db.factories import Thread, create_message, create_outbox_item, create_thread, unique_id

LIMIT = 50


def claim(
    conn: psycopg.Connection, token: uuid.UUID, *, limit: int = LIMIT
) -> list[tuple]:
    return conn.execute(
        "select * from internal.claim_outbox_batch(%s, %s)", (token, limit)
    ).fetchall()


def outbox_row(conn: psycopg.Connection, outbox_id: uuid.UUID) -> dict:
    row = conn.execute(
        """
        select status, locked_by, attempt_count, next_attempt_at > now(),
               provider_message_id, last_error
          from internal.message_outbox where id = %s
        """,
        (outbox_id,),
    ).fetchone()
    return {
        "status": row[0],
        "locked_by": row[1],
        "attempts": row[2],
        "retry_in_future": row[3],
        "provider_message_id": row[4],
        "last_error": row[5],
    }


@pytest.fixture
def thread(admin: psycopg.Connection, two_tenants: TwoTenants) -> Thread:
    return create_thread(admin, two_tenants.a.id)


@pytest.fixture
def pending(admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread) -> uuid.UUID:
    return create_outbox_item(admin, two_tenants.a.id, thread)


# --- o claim ----------------------------------------------------------------


class TestTheClaim:
    def test_the_claimed_row_carries_everything_a_send_needs(
        self, admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread, pending: uuid.UUID
    ) -> None:
        # Se este teste precisar de um join para conferir, o sender também
        # precisaria — e sender que faz segunda query abre porta para
        # inconsistência entre a query e o envio.
        (row,) = claim(admin, uuid.uuid4())

        phone = admin.execute(
            "select phone from public.contacts where id = %s", (thread.contact_id,)
        ).fetchone()[0]

        assert row[0] == pending
        assert row[1] == two_tenants.a.id
        assert row[2] == "whatsapp"
        assert row[3].startswith("wa-")  # o phone_number_id da conta Cloud
        assert row[4] == phone
        assert row[5] == {"text": "resposta"}
        assert row[6].startswith("idem-")
        assert row[7] == 1  # a tentativa que este claim inaugura
        assert row[8] == "reply"  # kind — o que o preflight usa para decidir

    def test_claiming_marks_the_row_as_sending_with_the_owner(
        self, admin: psycopg.Connection, pending: uuid.UUID
    ) -> None:
        token = uuid.uuid4()
        claim(admin, token)

        row = outbox_row(admin, pending)
        assert row["status"] == "sending"
        assert row["locked_by"] == str(token)

    def test_only_pending_and_due_rows_are_claimable(
        self, admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread
    ) -> None:
        for status in ("sending", "sent", "failed", "unknown", "manual_review"):
            create_outbox_item(admin, two_tenants.a.id, thread, status=status)
        future = create_outbox_item(admin, two_tenants.a.id, thread)
        admin.execute(
            "update internal.message_outbox set next_attempt_at = now() + interval '1 hour'"
            " where id = %s",
            (future,),
        )

        assert claim(admin, uuid.uuid4()) == []

    def test_the_limit_is_respected(
        self, admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread
    ) -> None:
        for _ in range(3):
            create_outbox_item(admin, two_tenants.a.id, thread)

        assert len(claim(admin, uuid.uuid4(), limit=2)) == 2
        assert len(claim(admin, uuid.uuid4(), limit=2)) == 1

    def test_two_concurrent_claims_get_disjoint_partitions(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread
    ) -> None:
        created = {create_outbox_item(admin, two_tenants.a.id, thread) for _ in range(6)}
        barrier = threading.Barrier(2)
        partitions: list[set[uuid.UUID]] = []
        lock = threading.Lock()

        def drain() -> None:
            with psycopg.connect(dsn) as conn:
                barrier.wait(timeout=5)
                got = {row[0] for row in claim(conn, uuid.uuid4())}
                conn.commit()
            with lock:
                partitions.append(got)

        workers = [threading.Thread(target=drain) for _ in range(2)]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=15)

        assert partitions[0] & partitions[1] == set()
        assert partitions[0] | partitions[1] == created

    def test_a_second_claimer_does_not_wait_for_the_first(
        self, dsn: str, pending: uuid.UUID
    ) -> None:
        # A lição da A4, pré-aplicada: o que o SKIP LOCKED compra é não esperar,
        # e a asserção é feita com a transação do primeiro ainda aberta.
        first = psycopg.connect(dsn)
        second = psycopg.connect(dsn)
        try:
            first.execute("select 1")
            assert len(claim(first, uuid.uuid4())) == 1

            second.execute("set lock_timeout = '2s'")
            assert claim(second, uuid.uuid4()) == []

            first.commit()
            second.commit()
        finally:
            first.close()
            second.close()

    def test_the_sender_drains_every_tenant_in_one_claim(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        # A razão de ser do DEFINER. Sob invoker, o sender escopado enxergaria
        # um tenant só — e as respostas de todos os outros ficariam na fila.
        for tenant in (two_tenants.a, two_tenants.b):
            create_outbox_item(admin, tenant.id, create_thread(admin, tenant.id))

        with as_app_role(dsn, "sender_role", uuid.uuid4()) as conn:
            drained = {row[1] for row in claim(conn, uuid.uuid4())}
            conn.commit()

        assert drained == {two_tenants.a.id, two_tenants.b.id}


# --- item 38 — o wamid do último inbound viaja com o claim ------------------
#
# Achado Important da review (fix round 1): a lógica SQL nova
# (`20260902000002_claim_outbox_last_inbound_wamid.sql`) não tinha teste
# nenhum aqui — só leitura. Esta classe fecha isso, mas continua sem prova
# EXECUTADA: `tests/db` pede Postgres em Docker, indisponível nesta máquina
# (o mesmo texto vale para toda a suíte `tests/db`, não é peculiaridade
# desta classe). `row[11]` é a mesma posição que `repository/engine.py`
# desempacota como `last_inbound_wamid` — testado pelo índice exato, porque
# é justamente a correção do desempacotamento POR POSIÇÃO que está em jogo.


class TestLastInboundWamid:
    def test_the_wamid_of_the_last_inbound_travels_with_the_claim(
        self, admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread
    ) -> None:
        create_message(
            admin,
            two_tenants.a.id,
            thread,
            direction="inbound",
            seq=1,
            provider_message_id="wamid.first",
        )
        outbox_id = create_outbox_item(admin, two_tenants.a.id, thread)

        (row,) = claim(admin, uuid.uuid4())
        assert row[0] == outbox_id
        assert row[11] == "wamid.first"

    def test_multiple_inbounds_pick_the_highest_seq(
        self, admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread
    ) -> None:
        # seq é atômico por conversa (internal.next_message_seq); dois
        # inbounds fora de ordem de inserção não deveriam confundir o "select
        # ... order by seq desc limit 1".
        create_message(
            admin,
            two_tenants.a.id,
            thread,
            direction="inbound",
            seq=2,
            provider_message_id="wamid.newer",
        )
        create_message(
            admin,
            two_tenants.a.id,
            thread,
            direction="inbound",
            seq=1,
            provider_message_id="wamid.older",
        )
        create_outbox_item(admin, two_tenants.a.id, thread)

        (row,) = claim(admin, uuid.uuid4())
        assert row[11] == "wamid.newer"

    def test_the_wamid_matches_the_claimed_outbox_channel(
        self, admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread
    ) -> None:
        create_message(
            admin,
            two_tenants.a.id,
            thread,
            direction="inbound",
            seq=1,
            provider_message_id="wamid.whatsapp",
        )
        admin.execute(
            """
            insert into public.messages
                (organization_id, conversation_id, direction, seq, channel, author_type,
                 content, provider_message_id)
            values (%s, %s, 'inbound', 2, 'email', 'contact', %s, 'email.newer')
            """,
            (
                two_tenants.a.id,
                thread.conversation_id,
                psycopg.types.json.Jsonb({"text": "email mais novo"}),
            ),
        )
        create_outbox_item(admin, two_tenants.a.id, thread)

        (row,) = claim(admin, uuid.uuid4())
        assert row[11] == "wamid.whatsapp"

    def test_an_outbound_message_never_counts_as_the_last_inbound(
        self, admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread
    ) -> None:
        create_message(
            admin,
            two_tenants.a.id,
            thread,
            direction="inbound",
            seq=1,
            provider_message_id="wamid.inbound",
        )
        create_message(
            admin,
            two_tenants.a.id,
            thread,
            direction="outbound",
            seq=2,
            provider_message_id="wamid.outbound",
        )
        create_outbox_item(admin, two_tenants.a.id, thread)

        (row,) = claim(admin, uuid.uuid4())
        assert row[11] == "wamid.inbound"

    def test_no_inbound_yet_means_null(
        self, admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread, pending: uuid.UUID
    ) -> None:
        # `thread` (create_thread) só cria a conversa, nenhuma mensagem —
        # ruling D depende do subselect devolver null aqui, não estourar.
        (row,) = claim(admin, uuid.uuid4())
        assert row[11] is None

    def test_a_funnel_touch_without_a_conversation_means_null_too(
        self, admin: psycopg.Connection, two_tenants: TwoTenants, thread: Thread
    ) -> None:
        # conversation_id é NULLABLE em internal.message_outbox de propósito:
        # um toque de funil pode preceder a conversa (ruling D do item 38).
        with admin.cursor() as cur:
            cur.execute(
                """
                insert into internal.message_outbox
                    (organization_id, conversation_id, contact_id, channel_account_id,
                     kind, payload, idempotency_key)
                values (%s, null, %s, %s, 'funnel_touch', %s, %s)
                """,
                (
                    two_tenants.a.id,
                    thread.contact_id,
                    thread.channel_account_id,
                    psycopg.types.json.Jsonb({"text": "toque"}),
                    unique_id("idem"),
                ),
            )

        (row,) = claim(admin, uuid.uuid4())
        assert row[11] is None


# --- os desfechos -----------------------------------------------------------


class TestTheOutcomes:
    def test_sent_only_with_the_owner_token(
        self, admin: psycopg.Connection, pending: uuid.UUID
    ) -> None:
        token = uuid.uuid4()
        claim(admin, token)

        stranger = admin.execute(
            "select internal.mark_outbox_sent(%s, %s, 'wamid.X')", (pending, uuid.uuid4())
        ).fetchone()[0]
        assert stranger is False
        assert outbox_row(admin, pending)["status"] == "sending"

        owner = admin.execute(
            "select internal.mark_outbox_sent(%s, %s, 'wamid.X')", (pending, token)
        ).fetchone()[0]
        assert owner is True

        row = outbox_row(admin, pending)
        assert row["status"] == "sent"
        assert row["provider_message_id"] == "wamid.X"
        assert row["locked_by"] is None

    def test_a_transient_failure_requeues_with_the_delay_the_runtime_chose(
        self, admin: psycopg.Connection, pending: uuid.UUID
    ) -> None:
        token = uuid.uuid4()
        claim(admin, token)

        assert admin.execute(
            "select internal.mark_outbox_failed(%s, %s, true, 'HTTP 503', interval '2 minutes')",
            (pending, token),
        ).fetchone()[0]

        row = outbox_row(admin, pending)
        assert row["status"] == "pending"
        assert row["attempts"] == 1
        assert row["retry_in_future"] is True
        assert row["last_error"] == "HTTP 503"

        # E a tentativa seguinte incrementa de novo — o contador é do claim,
        # que é o único lugar por onde toda tentativa passa.
        admin.execute(
            "update internal.message_outbox set next_attempt_at = now() where id = %s",
            (pending,),
        )
        claim(admin, uuid.uuid4())
        assert outbox_row(admin, pending)["attempts"] == 2

    def test_a_permanent_failure_ends_the_story(
        self, admin: psycopg.Connection, pending: uuid.UUID
    ) -> None:
        token = uuid.uuid4()
        claim(admin, token)

        admin.execute(
            "select internal.mark_outbox_failed(%s, %s, false, 'HTTP 400', interval '1 second')",
            (pending, token),
        )

        row = outbox_row(admin, pending)
        assert row["status"] == "failed"
        assert row["last_error"] == "HTTP 400"

        # E não volta a ser reclamável.
        assert claim(admin, uuid.uuid4()) == []

    def test_failed_only_with_the_owner_token(
        self, admin: psycopg.Connection, pending: uuid.UUID
    ) -> None:
        claim(admin, uuid.uuid4())

        assert (
            admin.execute(
                "select internal.mark_outbox_failed(%s, %s, true, 'x', interval '1 second')",
                (pending, uuid.uuid4()),
            ).fetchone()[0]
            is False
        )
        assert outbox_row(admin, pending)["status"] == "sending"


# --- a assimetria de papéis --------------------------------------------------


class TestWhoMayRun:
    def test_the_sender_claims(self, dsn: str, pending: uuid.UUID) -> None:
        with as_app_role(dsn, "sender_role", uuid.uuid4()) as conn:
            assert len(claim(conn, uuid.uuid4())) == 1
            conn.commit()

    def test_the_worker_does_not_claim(self, dsn: str, pending: uuid.UUID) -> None:
        # O outro sentido da assimetria do PR-0 ("o sender não inventa envio"):
        # o worker cria o envio, mas não o executa.
        with as_app_role(dsn, "worker_role", uuid.uuid4()) as conn:
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                claim(conn, uuid.uuid4())

    def test_the_data_api_does_not_claim(self, dsn: str) -> None:
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                cur.execute("set role authenticated")

                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    cur.execute("select * from internal.claim_outbox_batch(gen_random_uuid())")

    def test_the_three_definer_guards_are_in_place(self, admin: psycopg.Connection) -> None:
        # As três travas do ADR-11, asseridas no catálogo: DEFINER, search_path
        # fixo, e nenhum EXECUTE herdado por PUBLIC.
        prosecdef, proconfig = admin.execute(
            """
            select prosecdef, proconfig
              from pg_proc
             where proname = 'claim_outbox_batch'
            """
        ).fetchone()

        assert prosecdef is True
        assert any(entry.startswith("search_path=") for entry in proconfig)

        public_can_execute = admin.execute(
            """
            select coalesce(bool_or(grantee = 0), false)
              from pg_proc p, aclexplode(p.proacl) as acl(grantor, grantee, privilege, grantable)
             where p.proname = 'claim_outbox_batch'
            """
        ).fetchone()[0]

        assert public_can_execute is False
