"""Legacy WhatsApp claims stay single-owner and stop at runtime cutover."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import psycopg

from tests.db.conftest import TwoTenants
from tests.db.factories import contact_phone, create_cloud_mirror, create_thread, set_runtime_mode


def pending_conversation(
    admin: psycopg.Connection, organization_id
):
    thread = create_thread(admin, organization_id)
    mirror = create_cloud_mirror(
        admin,
        organization_id,
        thread.channel_account_id,
        contact_phone(admin, thread.contact_id),
    )
    admin.execute(
        """
        update public.whatsapp_cloud_conversations
           set ai_pending = true,
               ai_debounce_until = now() + interval '30 seconds'
         where id = %s
        """,
        (mirror.conversation_id,),
    )
    return mirror.conversation_id


def claim(dsn: str, conversation_id) -> bool:
    with psycopg.connect(dsn, autocommit=True) as conn:
        return conn.execute(
            "select public.claim_legacy_ai_pending(%s)", (conversation_id,)
        ).fetchone()[0]


def release(dsn: str, conversation_id) -> None:
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute("select public.release_legacy_ai_pending(%s)", (conversation_id,))


def state(admin: psycopg.Connection, conversation_id) -> tuple[bool, bool]:
    return admin.execute(
        """
        select ai_pending, ai_debounce_until is null
          from public.whatsapp_cloud_conversations
         where id = %s
        """,
        (conversation_id,),
    ).fetchone()


class TestLegacyPendingCutover:
    def test_only_one_concurrent_claim_wins(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        conversation_id = pending_conversation(admin, two_tenants.a.id)

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: claim(dsn, conversation_id), range(2)))

        assert sorted(results) == [False, True]
        assert state(admin, conversation_id) == (False, False)

    def test_runtime_flip_clears_only_the_target_org_and_refuses_claim(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        target = pending_conversation(admin, two_tenants.a.id)
        other = pending_conversation(admin, two_tenants.b.id)

        set_runtime_mode(admin, two_tenants.a.id, "runtime")

        assert state(admin, target) == (False, True)
        assert state(admin, other) == (True, False)
        assert claim(dsn, target) is False

        admin.execute(
            """
            update public.whatsapp_cloud_conversations
               set ai_pending = true,
                   ai_debounce_until = now() + interval '30 seconds'
             where id = %s
            """,
            (target,),
        )
        assert state(admin, target) == (False, True)

    def test_release_cannot_reopen_pending_after_runtime_flip(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        conversation_id = pending_conversation(admin, two_tenants.a.id)
        assert claim(dsn, conversation_id) is True

        set_runtime_mode(admin, two_tenants.a.id, "runtime")
        release(dsn, conversation_id)

        assert state(admin, conversation_id) == (False, True)

    def test_claim_and_flip_race_ends_with_no_legacy_pending(
        self, dsn: str, admin: psycopg.Connection, two_tenants: TwoTenants
    ) -> None:
        conversation_id = pending_conversation(admin, two_tenants.a.id)
        barrier = Barrier(2)

        def race_claim() -> bool:
            barrier.wait()
            return claim(dsn, conversation_id)

        def race_flip() -> None:
            barrier.wait()
            with psycopg.connect(dsn, autocommit=True) as conn:
                set_runtime_mode(conn, two_tenants.a.id, "runtime")

        with ThreadPoolExecutor(max_workers=2) as pool:
            claim_future = pool.submit(race_claim)
            flip_future = pool.submit(race_flip)
            claimed = claim_future.result()
            flip_future.result()

        assert claimed in (False, True)
        assert state(admin, conversation_id) == (False, True)

    def test_functions_are_service_role_only(self, admin: psycopg.Connection) -> None:
        for signature in (
            "public.claim_legacy_ai_pending(uuid)",
            "public.release_legacy_ai_pending(uuid)",
        ):
            privileges = admin.execute(
                """
                select has_function_privilege('anon', %s, 'EXECUTE'),
                       has_function_privilege('authenticated', %s, 'EXECUTE'),
                       has_function_privilege('service_role', %s, 'EXECUTE')
                """,
                (signature, signature, signature),
            ).fetchone()
            assert privileges == (False, False, True)
