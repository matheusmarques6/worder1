"""Regression checks for the migrations received in the September merge."""

import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import psycopg
import pytest

from tests.db.conftest import as_authenticated_user

pytestmark = pytest.mark.rls

ROOT = Path(__file__).resolve().parents[3]
INSTAGRAM_INTEGRITY = (
    ROOT / "supabase/migrations/20260910340000_instagram_tenant_integrity.sql"
)


def test_required_merge_relations_and_policies_exist(admin):
    relations = (
        "whatsapp_campaign_logs",
        "instagram_accounts",
        "instagram_contacts",
        "instagram_conversations",
        "instagram_messages",
    )
    for relation in relations:
        assert admin.execute(
            "select to_regclass(%s)", (f"public.{relation}",)
        ).fetchone()[0] is not None

    for relation in relations[1:]:
        assert admin.execute(
            """select relrowsecurity from pg_class
                 where oid=to_regclass(%s)""",
            (f"public.{relation}",),
        ).fetchone() == (True,)
        assert admin.execute(
            """select policyname, permissive, roles, cmd, qual, with_check
                 from pg_policies
                 where schemaname='public' and tablename=%s
                 order by policyname""",
            (relation,),
        ).fetchall() == [
            (
                "org_isolation_rls",
                "PERMISSIVE",
                ["authenticated"],
                "ALL",
                "(organization_id = get_user_organization_id())",
                "(organization_id = get_user_organization_id())",
            )
        ]
        assert not admin.execute(
            "select has_table_privilege('anon', %s, 'SELECT')",
            (f"public.{relation}",),
        ).fetchone()[0]
        assert admin.execute(
            "select has_table_privilege('authenticated', %s, 'SELECT,INSERT,UPDATE,DELETE')",
            (f"public.{relation}",),
        ).fetchone()[0]
        assert admin.execute(
            """select count(*)
                 from pg_attribute a
                 cross join lateral aclexplode(a.attacl) acl
                where a.attrelid=to_regclass(%s)
                  and a.attnum>0 and not a.attisdropped
                  and acl.grantee in (0, 'anon'::regrole::oid)""",
            (f"public.{relation}",),
        ).fetchone() == (0,)

    assert admin.execute(
        """select policyname, permissive, roles, cmd, qual, with_check
             from pg_policies
            where schemaname='public' and tablename='whatsapp_campaign_logs'
            order by policyname"""
    ).fetchall() == [
        (
            "org_isolation_rls",
            "PERMISSIVE",
            ["authenticated"],
            "ALL",
            "(organization_id = get_user_organization_id())",
            "(organization_id = get_user_organization_id())",
        )
    ]


def test_campaign_counters_are_service_only(admin):
    for name in (
        "increment_campaign_sent",
        "increment_campaign_delivered",
        "increment_campaign_read",
        "increment_campaign_failed",
    ):
        signature = f"public.{name}(uuid)"
        assert not admin.execute(
            "select has_function_privilege('anon', %s, 'EXECUTE')", (signature,)
        ).fetchone()[0]
        assert not admin.execute(
            "select has_function_privilege('authenticated', %s, 'EXECUTE')", (signature,)
        ).fetchone()[0]
        assert admin.execute(
            "select has_function_privilege('service_role', %s, 'EXECUTE')", (signature,)
        ).fetchone()[0]

        with admin.transaction(force_rollback=True):
            admin.execute("set local role authenticated")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with admin.transaction():
                    admin.execute(f"select public.{name}(%s)", (None,))

        with admin.transaction(force_rollback=True):
            admin.execute("set local role service_role")
            assert admin.execute(f"select public.{name}(%s)", (None,)).fetchone() is not None


def test_instagram_rejects_cross_tenant_references(admin, two_tenants):
    with admin.transaction(force_rollback=True):
        account_a = admin.execute(
            """insert into public.instagram_accounts (organization_id, ig_user_id)
               values (%s, 'ig-a') returning id""",
            (two_tenants.a.id,),
        ).fetchone()[0]
        account_b = admin.execute(
            """insert into public.instagram_accounts (organization_id, ig_user_id)
               values (%s, 'ig-b') returning id""",
            (two_tenants.b.id,),
        ).fetchone()[0]
        contact_b = admin.execute(
            """insert into public.instagram_contacts (organization_id, ig_user_id)
               values (%s, 'contact-b') returning id""",
            (two_tenants.b.id,),
        ).fetchone()[0]
        contact_a = admin.execute(
            """insert into public.instagram_contacts (organization_id, ig_user_id)
               values (%s, 'contact-a') returning id""",
            (two_tenants.a.id,),
        ).fetchone()[0]
        conversation_a = admin.execute(
            """insert into public.instagram_conversations
                     (organization_id, account_id, contact_id, ig_user_id)
               values (%s, %s, %s, 'participant-a') returning id""",
            (two_tenants.a.id, account_a, contact_a),
        ).fetchone()[0]
        account_a2 = admin.execute(
            """insert into public.instagram_accounts (organization_id, ig_user_id)
               values (%s, 'ig-a-2') returning id""",
            (two_tenants.a.id,),
        ).fetchone()[0]

        with pytest.raises(psycopg.errors.RaiseException, match="account belongs"):
            with admin.transaction():
                admin.execute(
                    """insert into public.instagram_conversations
                             (organization_id, account_id, ig_user_id)
                       values (%s, %s, 'cross-account')""",
                    (two_tenants.a.id, account_b),
                )

        with pytest.raises(psycopg.errors.RaiseException, match="contact belongs"):
            with admin.transaction():
                admin.execute(
                    """update public.instagram_conversations set contact_id=%s
                         where id=%s""",
                    (contact_b, conversation_a),
                )

        admin.execute(
            "update public.instagram_contacts set name='Renamed' where id=%s",
            (contact_a,),
        )
        assert admin.execute(
            "select contact_id from public.instagram_conversations where id=%s",
            (conversation_a,),
        ).fetchone() == (contact_a,)
        with pytest.raises(psycopg.errors.RaiseException, match="identity is referenced"):
            with admin.transaction():
                admin.execute(
                    "update public.instagram_contacts set organization_id=%s where id=%s",
                    (two_tenants.b.id, contact_a),
                )

        with pytest.raises(psycopg.errors.RaiseException, match="another account"):
            with admin.transaction():
                admin.execute(
                    """insert into public.instagram_messages
                             (organization_id, account_id, conversation_id, direction)
                       values (%s, %s, %s, 'inbound')""",
                    (two_tenants.a.id, account_b, conversation_a),
                )

        admin.execute(
            """insert into public.instagram_messages
                     (organization_id, account_id, conversation_id, direction)
               values (%s, %s, %s, 'inbound')""",
            (two_tenants.a.id, account_a, conversation_a),
        )
        with pytest.raises(psycopg.errors.RaiseException, match="identity is referenced"):
            with admin.transaction():
                admin.execute(
                    "update public.instagram_conversations set account_id=%s where id=%s",
                    (account_a2, conversation_a),
                )
        with pytest.raises(psycopg.errors.RaiseException, match="identity is referenced"):
            with admin.transaction():
                admin.execute(
                    "update public.instagram_accounts set organization_id=%s where id=%s",
                    (two_tenants.b.id, account_a),
                )


def test_instagram_rls_filters_and_rejects_cross_tenant_writes(admin, dsn, two_tenants):
    account_a = admin.execute(
        """insert into public.instagram_accounts (organization_id, ig_user_id)
           values (%s, 'rls-a') returning id""",
        (two_tenants.a.id,),
    ).fetchone()[0]
    account_b = admin.execute(
        """insert into public.instagram_accounts (organization_id, ig_user_id)
           values (%s, 'rls-b') returning id""",
        (two_tenants.b.id,),
    ).fetchone()[0]
    own_account = None
    admin.execute(
        "update public.profiles set organization_id=%s where id=%s",
        (two_tenants.a.id, two_tenants.b.user_id),
    )
    try:
        with as_authenticated_user(dsn, two_tenants.a.user_id) as authenticated:
            assert authenticated.execute(
                "select id from public.instagram_accounts where id=any(%s) order by id",
                ([account_a, account_b],),
            ).fetchall() == [(account_a,)]
            own_account = authenticated.execute(
                """insert into public.instagram_accounts (organization_id, ig_user_id)
                   values (%s, 'rls-own') returning id""",
                (two_tenants.a.id,),
            ).fetchone()[0]
            assert authenticated.execute(
                """insert into public.instagram_conversations
                         (organization_id, account_id, assigned_to, ig_user_id)
                   values (%s, %s, %s, 'rls-colleague') returning assigned_to""",
                (two_tenants.a.id, own_account, two_tenants.b.user_id),
            ).fetchone() == (two_tenants.b.user_id,)
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with authenticated.transaction():
                    authenticated.execute(
                        """insert into public.instagram_accounts (organization_id, ig_user_id)
                           values (%s, 'rls-cross')""",
                        (two_tenants.b.id,),
                    )
    finally:
        admin.execute(
            "delete from public.instagram_accounts where id=any(%s)",
            ([account_a, account_b, own_account] if own_account else [account_a, account_b],),
        )


def test_instagram_reference_lock_serializes_parent_change(admin, dsn, two_tenants):
    account_a = admin.execute(
        """insert into public.instagram_accounts (organization_id, ig_user_id)
           values (%s, 'race-a') returning id""",
        (two_tenants.a.id,),
    ).fetchone()[0]
    account_a2 = admin.execute(
        """insert into public.instagram_accounts (organization_id, ig_user_id)
           values (%s, 'race-a-2') returning id""",
        (two_tenants.a.id,),
    ).fetchone()[0]
    conversation = admin.execute(
        """insert into public.instagram_conversations
                 (organization_id, account_id, ig_user_id)
           values (%s, %s, 'race-participant') returning id""",
        (two_tenants.a.id, account_a),
    ).fetchone()[0]
    conversation2 = admin.execute(
        """insert into public.instagram_conversations
                 (organization_id, account_id, ig_user_id)
           values (%s, %s, 'race-participant-2') returning id""",
        (two_tenants.a.id, account_a),
    ).fetchone()[0]

    try:
        with (
            psycopg.connect(dsn, autocommit=True, connect_timeout=5) as first,
            psycopg.connect(dsn, autocommit=True, connect_timeout=5) as second,
        ):
            for connection in (first, second):
                connection.execute("set statement_timeout='10s'")
                connection.execute("set lock_timeout='8s'")

            def reparent_conversation():
                with second.transaction():
                    second.execute(
                        "update public.instagram_conversations set account_id=%s where id=%s",
                        (account_a2, conversation),
                    )

            def insert_old_parent_message():
                with second.transaction():
                    second.execute(
                        """insert into public.instagram_messages
                                 (organization_id, account_id, conversation_id, direction)
                           values (%s, %s, %s, 'inbound')""",
                        (two_tenants.a.id, account_a, conversation2),
                    )

            def wait_until_blocked(attempt):
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline and not attempt.done():
                    if first.info.backend_pid in admin.execute(
                        "select pg_blocking_pids(%s)", (second.info.backend_pid,)
                    ).fetchone()[0]:
                        return
                    time.sleep(0.02)
                pytest.fail("tenant reference write did not wait for the parent row lock")

            with ThreadPoolExecutor(max_workers=1) as pool:
                with first.transaction():
                    first.execute(
                        """insert into public.instagram_messages
                                 (organization_id, account_id, conversation_id, direction)
                           values (%s, %s, %s, 'inbound')""",
                        (two_tenants.a.id, account_a, conversation),
                    )
                    attempt = pool.submit(reparent_conversation)
                    wait_until_blocked(attempt)
                with pytest.raises(
                    psycopg.errors.RaiseException, match="identity is referenced"
                ):
                    attempt.result(timeout=10)

                with first.transaction():
                    first.execute(
                        "update public.instagram_conversations set account_id=%s where id=%s",
                        (account_a2, conversation2),
                    )
                    attempt = pool.submit(insert_old_parent_message)
                    wait_until_blocked(attempt)
                with pytest.raises(psycopg.errors.RaiseException, match="another account"):
                    attempt.result(timeout=10)
    finally:
        admin.execute(
            "delete from public.instagram_accounts where id=any(%s)",
            ([account_a, account_a2],),
        )


def test_instagram_external_parents_cannot_break_tenant_links(admin, two_tenants):
    with admin.transaction(force_rollback=True):
        admin.execute(
            "update public.profiles set organization_id=%s where id=%s",
            (two_tenants.a.id, two_tenants.b.user_id),
        )
        store = admin.execute(
            """insert into public.shopify_stores
                     (organization_id, shop_domain, access_token)
               values (%s, %s, 'test-token') returning id""",
            (two_tenants.a.id, f"integrity-{two_tenants.a.id}.test"),
        ).fetchone()[0]
        crm_contact = admin.execute(
            """insert into public.contacts (organization_id, email)
               values (%s, %s) returning id""",
            (two_tenants.a.id, f"integrity-{two_tenants.a.id}@example.test"),
        ).fetchone()[0]
        account = admin.execute(
            """insert into public.instagram_accounts
                     (organization_id, store_id, ig_user_id)
               values (%s, %s, 'parent-account') returning id""",
            (two_tenants.a.id, store),
        ).fetchone()[0]
        contact = admin.execute(
            """insert into public.instagram_contacts
                     (organization_id, store_id, crm_contact_id, ig_user_id)
               values (%s, %s, %s, 'parent-contact') returning id""",
            (two_tenants.a.id, store, crm_contact),
        ).fetchone()[0]
        conversation = admin.execute(
            """insert into public.instagram_conversations
                     (organization_id, store_id, account_id, contact_id,
                      assigned_to, ig_user_id)
               values (%s, %s, %s, %s, %s, 'parent-conversation') returning id""",
            (
                two_tenants.a.id,
                store,
                account,
                contact,
                two_tenants.b.user_id,
            ),
        ).fetchone()[0]
        message = admin.execute(
            """insert into public.instagram_messages
                     (organization_id, store_id, account_id, conversation_id, direction)
               values (%s, %s, %s, %s, 'inbound') returning id""",
            (two_tenants.a.id, store, account, conversation),
        ).fetchone()[0]

        for table, row_id in (
            ("profiles", two_tenants.b.user_id),
            ("contacts", crm_contact),
            ("shopify_stores", store),
        ):
            with pytest.raises(psycopg.errors.RaiseException, match="tenant link"):
                with admin.transaction():
                    admin.execute(
                        f"update public.{table} set organization_id=%s where id=%s",
                        (two_tenants.b.id, row_id),
                    )

        admin.execute(
            "update public.profiles set last_seen_at=now() where id=%s",
            (two_tenants.b.user_id,),
        )
        admin.execute(
            "update public.contacts set first_name='Renamed' where id=%s",
            (crm_contact,),
        )
        admin.execute(
            "update public.shopify_stores set shop_name='Renamed' where id=%s",
            (store,),
        )

        admin.execute("delete from public.shopify_stores where id=%s", (store,))
        assert admin.execute(
            """select a.store_id, c.store_id, v.store_id, m.store_id
                 from public.instagram_accounts a
                 join public.instagram_contacts c on c.id=%s
                 join public.instagram_conversations v on v.id=%s
                 join public.instagram_messages m on m.id=%s
                where a.id=%s""",
            (contact, conversation, message, account),
        ).fetchone() == (None, None, None, None)


def test_instagram_migration_removes_incompatible_legacy_log_policy(admin):
    migration = INSTAGRAM_INTEGRITY.read_text(encoding="utf-8")
    policy = "Users can view own org campaign_logs"
    with admin.transaction(force_rollback=True):
        admin.execute(f'drop policy if exists "{policy}" on public.whatsapp_campaign_logs')
        admin.execute(
            f"""create policy "{policy}" on public.whatsapp_campaign_logs
                  for select to public using (organization_id is not null)"""
        )
        admin.execute(migration)
        assert admin.execute(
            """select count(*) from pg_policies
                 where schemaname='public' and tablename='whatsapp_campaign_logs'
                   and policyname=%s""",
            (policy,),
        ).fetchone() == (0,)


def test_instagram_migration_aborts_before_mutating_incompatible_legacy_row(
    admin, two_tenants
):
    migration = INSTAGRAM_INTEGRITY.read_text(encoding="utf-8")
    with admin.transaction(force_rollback=True):
        account_b = admin.execute(
            """insert into public.instagram_accounts (organization_id, ig_user_id)
               values (%s, 'preflight-b') returning id""",
            (two_tenants.b.id,),
        ).fetchone()[0]
        admin.execute(
            "drop trigger instagram_reference_same_org on public.instagram_conversations"
        )
        legacy_id = admin.execute(
            """insert into public.instagram_conversations
                     (organization_id, account_id, ig_user_id)
               values (%s, %s, 'preflight-cross') returning id""",
            (two_tenants.a.id, account_b),
        ).fetchone()[0]
        before = admin.execute(
            "select row_to_json(c)::text from public.instagram_conversations c where id=%s",
            (legacy_id,),
        ).fetchone()

        with pytest.raises(psycopg.errors.RaiseException, match="conversation tenant"):
            with admin.transaction():
                admin.execute(migration)

        assert admin.execute(
            "select row_to_json(c)::text from public.instagram_conversations c where id=%s",
            (legacy_id,),
        ).fetchone() == before


def test_upgrade_migrations_do_not_silently_rewrite_incompatible_rows():
    sources = {
        name: (ROOT / "supabase/migrations" / name).read_text(encoding="utf-8").lower()
        for name in (
            "20260910170000_popup_tenant_hardening.sql",
            "20260910210000_popup_store_integrity.sql",
            "20260910330000_instagram_direct.sql",
        )
    }
    assert "delete from public.crm_forms" not in sources[
        "20260910170000_popup_tenant_hardening.sql"
    ]
    popup = sources["20260910210000_popup_store_integrity.sql"]
    assert "update public.crm_forms f set store_id = null" not in popup
    assert "update public.coupon_pools p set status = 'error'" not in popup
    instagram = sources["20260910330000_instagram_direct.sql"]
    assert "set contact_id = null" not in instagram
    assert "set assigned_to = null" not in instagram
