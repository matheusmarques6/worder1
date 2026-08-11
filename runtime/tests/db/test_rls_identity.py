"""The cross-org leak suite over the canonical identity tables.

Three credentials reach the data — the user's JWT, `worker_role` and
`sender_role` — and every one of them must be confined to its own
organization. **Any row returned or affected fails the suite.**

`organization_id` never comes from the client: the app roles carry it in
`app.organization_id`, the user carries it implicitly through
`profiles.organization_id`.

Scope note (Adendo §A.4.6 do doc-fonte): the LEGACY tables of the live
database still have RLS disabled — remediation is a pending, user-approved
item. This suite asserts the NEW tables, which are born locked.
"""

import psycopg
import pytest

from tests.db.conftest import TwoTenants, as_app_role, as_authenticated_user
from tests.db.factories import Thread, create_alert, create_outbox_item, create_thread

pytestmark = pytest.mark.rls


class TestReadIsConfinedToOneOrg:
    def test_worker_of_a_cannot_read_conversations_of_b(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        create_thread(admin, two_tenants.b.id)

        with as_app_role(dsn, "worker_role", two_tenants.a.id) as conn:
            rows = conn.execute(
                "select id from public.conversations where organization_id = %s",
                (two_tenants.b.id,),
            ).fetchall()

        assert rows == []

    def test_sender_of_a_cannot_read_conversations_of_b(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        create_thread(admin, two_tenants.b.id)

        with as_app_role(dsn, "sender_role", two_tenants.a.id) as conn:
            rows = conn.execute(
                "select id from public.conversations where organization_id = %s",
                (two_tenants.b.id,),
            ).fetchall()

        assert rows == []

    def test_user_of_a_cannot_read_conversations_of_b(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        create_thread(admin, two_tenants.b.id)

        with as_authenticated_user(dsn, two_tenants.a.user_id) as conn:
            rows = conn.execute(
                "select id from public.conversations where organization_id = %s",
                (two_tenants.b.id,),
            ).fetchall()

        assert rows == []

    def test_user_of_a_cannot_read_alerts_of_b(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        create_alert(admin, two_tenants.b.id)

        with as_authenticated_user(dsn, two_tenants.a.user_id) as conn:
            rows = conn.execute(
                "select id from public.alerts where organization_id = %s",
                (two_tenants.b.id,),
            ).fetchall()

        assert rows == []

    def test_a_platform_alert_is_invisible_to_every_user(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """organization_id NULL = platform alert. No merchant ever sees it."""
        admin.execute(
            """
            insert into public.alerts (organization_id, type, severity, title)
            values (null, 'critical_violation', 'critical', 'platform-only')
            """,
        )

        with as_authenticated_user(dsn, two_tenants.a.user_id) as conn:
            rows = conn.execute(
                "select id from public.alerts where organization_id is null",
            ).fetchall()

        assert rows == []

    def test_worker_of_a_cannot_read_the_outbox_of_b(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        thread: Thread = create_thread(admin, two_tenants.b.id)
        create_outbox_item(admin, two_tenants.b.id, thread)

        with as_app_role(dsn, "worker_role", two_tenants.a.id) as conn:
            rows = conn.execute(
                "select id from internal.message_outbox where organization_id = %s",
                (two_tenants.b.id,),
            ).fetchall()

        assert rows == []


class TestWriteIsConfinedToOneOrg:
    def test_worker_of_a_cannot_open_a_conversation_for_b(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        thread: Thread = create_thread(admin, two_tenants.b.id)

        with as_app_role(dsn, "worker_role", two_tenants.a.id) as conn:
            # Violação de RLS no INSERT é SQLSTATE 42501 — a mesma classe de
            # privilégio insuficiente; psycopg não tem uma classe própria.
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute(
                    """
                    insert into public.conversations (organization_id, contact_id)
                    values (%s, %s)
                    """,
                    (two_tenants.b.id, thread.contact_id),
                )

    def test_worker_of_a_cannot_touch_a_conversation_of_b(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        thread: Thread = create_thread(admin, two_tenants.b.id)

        with as_app_role(dsn, "worker_role", two_tenants.a.id) as conn:
            affected = conn.execute(
                "update public.conversations set status = 'closed' where id = %s",
                (thread.conversation_id,),
            ).rowcount

        assert affected == 0


class TestAnUnscopedPoolReadsNothing:
    def test_worker_without_app_organization_id_sees_no_conversations(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        """A pool that forgot to scope its transaction reads NOTHING instead
        of reading everything — `organization_id = NULL` is never true."""
        create_thread(admin, two_tenants.a.id)

        with psycopg.connect(dsn) as conn:
            conn.execute("set role worker_role")
            rows = conn.execute("select id from public.conversations").fetchall()

        assert rows == []
