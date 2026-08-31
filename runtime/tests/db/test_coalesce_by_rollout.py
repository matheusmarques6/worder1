"""item 09 da auditoria — o coalescer aprende o rollout.

`internal.coalesce_due_conversations` é `security definer` e cross-org: um
passe só cobre TODAS as orgs de uma vez. Antes desta migration
(`20260828000003_coalesce_by_rollout`) ele não lia `public.ai_runtime_rollout`
— voltar uma org para 'legacy' não parava o Python. Jobs de `q_inbound` já em
voo continuavam sendo consumidos, e qualquer `pending_response_at` já gravado
seguia virando job enquanto o caminho TS (QStash + cloud-runner) já tinha
retomado a mesma conversa: dois mecanismos respondendo à mesma loja.

`ai_runtime_rollout` documenta fail-closed para legacy — linha ausente É
legacy (o mesmo contrato de `src/lib/ai/runtime-rollout.ts`). Uma org em
legacy tem seu `pending_response_at` limpo no MESMO passe, sem virar job e
sem bump de `processing_generation`: quem responde por ela agora é o TS, com
o próprio debounce; deixar o prazo pendente faria a resposta velha do runtime
disparar assim que a org voltasse a 'runtime'.
"""

import psycopg
import pytest

from tests.db.conftest import TwoTenants
from tests.db.factories import Thread, create_thread, make_due, set_runtime_mode

QUEUE = "q_inbound"


def coalesce(conn: psycopg.Connection, *, queue: str = QUEUE, limit: int = 100) -> list[tuple]:
    return conn.execute(
        "select * from internal.coalesce_due_conversations(%s, %s)", (queue, limit)
    ).fetchall()


def conversation_state(conn: psycopg.Connection, conversation_id) -> tuple:
    return conn.execute(
        """
        select processing_generation, pending_response_at is null
          from public.conversations where id = %s
        """,
        (conversation_id,),
    ).fetchone()


def _due_thread(conn: psycopg.Connection, organization_id) -> Thread:
    thread = create_thread(conn, organization_id)
    make_due(conn, thread.conversation_id, last_inbound_seq=3)
    return thread


@pytest.fixture(autouse=True)
def empty_inbound(admin: psycopg.Connection):
    admin.execute("select pgmq.purge_queue(%s)", (QUEUE,))
    yield
    admin.execute("select pgmq.purge_queue(%s)", (QUEUE,))


class TestOnlyRuntimeOrgsAreCoalesced:
    def test_a_runtime_org_conversation_is_coalesced_as_today(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        set_runtime_mode(admin, two_tenants.a.id, "runtime")
        thread = _due_thread(admin, two_tenants.a.id)

        jobs = coalesce(admin)

        assert [job[0] for job in jobs] == [thread.conversation_id]
        assert conversation_state(admin, thread.conversation_id) == (1, True)

    def test_a_legacy_org_conversation_never_becomes_a_job_but_loses_its_deadline(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        set_runtime_mode(admin, two_tenants.a.id, "legacy")
        thread = _due_thread(admin, two_tenants.a.id)

        jobs = coalesce(admin)

        assert jobs == []
        # Geração intocada — não é o coalescer do runtime quem vai responder
        # esta rodada — mas o prazo some, senão a resposta velha do runtime
        # dispara sozinha no instante em que a org voltar para 'runtime'.
        assert conversation_state(admin, thread.conversation_id) == (0, True)

    def test_an_org_absent_from_the_rollout_table_behaves_like_legacy(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        # Nenhum set_runtime_mode: a org não tem linha em ai_runtime_rollout —
        # é exatamente o caso fail-closed que o contrato documenta.
        thread = _due_thread(admin, two_tenants.a.id)

        jobs = coalesce(admin)

        assert jobs == []
        assert conversation_state(admin, thread.conversation_id) == (0, True)

    def test_the_generation_bump_only_happens_for_the_runtime_conversation(
        self, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        # As duas orgs, no MESMO passe: prova que o filtro escolhe por
        # conversa, não que o teste de legacy só passa porque é a única
        # conversa devida.
        set_runtime_mode(admin, two_tenants.a.id, "runtime")
        runtime_thread = _due_thread(admin, two_tenants.a.id)
        legacy_thread = _due_thread(admin, two_tenants.b.id)  # sem linha = legacy

        jobs = coalesce(admin)

        assert [job[0] for job in jobs] == [runtime_thread.conversation_id]
        assert conversation_state(admin, runtime_thread.conversation_id) == (1, True)
        assert conversation_state(admin, legacy_thread.conversation_id) == (0, True)
