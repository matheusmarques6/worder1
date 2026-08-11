"""Schema behaviour of the canonical identity tables that RLS does not cover.

The leak suite proves who can see a row; this file proves the row itself
behaves as the data dictionary describes it (core/agentes-por-evento.md §3.3).
"""

import uuid

import psycopg
import pytest

from tests.db.factories import create_contact, create_message, create_thread


class TestUpdatedAtIsMaintained:
    def test_updating_a_conversation_touches_updated_at(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        """`updated_at` that never updates is worse than absent: it reads as
        "this row never changed" with authority. The column moves on UPDATE,
        by trigger, so no write path can forget it."""
        thread = create_thread(admin, two_tenants.a.id)

        before = admin.execute(
            "select updated_at from public.conversations where id = %s",
            (thread.conversation_id,),
        ).fetchone()[0]

        admin.execute(
            "update public.conversations set status = 'human' where id = %s",
            (thread.conversation_id,),
        )
        after = admin.execute(
            "select updated_at from public.conversations where id = %s",
            (thread.conversation_id,),
        ).fetchone()[0]

        assert after > before


class TestTheLeaseIsWhole:
    def test_a_token_without_a_deadline_is_rejected(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        """A half-set lease would make the claim condition read as "free"
        while a token still points at an owner."""
        thread = create_thread(admin, two_tenants.a.id)

        with pytest.raises(psycopg.errors.CheckViolation):
            admin.execute(
                "update public.conversations set processing_token = %s where id = %s",
                (uuid.uuid4(), thread.conversation_id),
            )


class TestSequencesCannotDuplicate:
    def test_the_same_seq_in_the_same_direction_is_impossible(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        thread = create_thread(admin, two_tenants.a.id)
        create_message(admin, two_tenants.a.id, thread, direction="inbound", seq=1)

        with pytest.raises(psycopg.errors.UniqueViolation):
            create_message(admin, two_tenants.a.id, thread, direction="inbound", seq=1)

    def test_the_same_seq_in_the_other_direction_is_fine(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        """Counters are per direction — the UNIQUE has to allow (1, inbound)
        and (1, outbound) to coexist."""
        thread = create_thread(admin, two_tenants.a.id)
        create_message(admin, two_tenants.a.id, thread, direction="inbound", seq=1)
        message_id = create_message(admin, two_tenants.a.id, thread, direction="outbound", seq=1)

        assert message_id is not None


class TestOneConversationPerContact:
    def test_a_second_canonical_conversation_for_the_same_contact_is_rejected(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        """The canonical conversation is the person's thread across channels —
        one per (organization, contact). Channels come and go through
        channel_identities/last_channel, not through new rows."""
        contact_id = create_contact(admin, two_tenants.a.id)
        admin.execute(
            "insert into public.conversations (organization_id, contact_id) values (%s, %s)",
            (two_tenants.a.id, contact_id),
        )

        with pytest.raises(psycopg.errors.UniqueViolation):
            admin.execute(
                "insert into public.conversations (organization_id, contact_id) values (%s, %s)",
                (two_tenants.a.id, contact_id),
            )


class TestChannelIdentities:
    def test_the_same_external_id_cannot_bind_twice_in_a_channel(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        contact_id = create_contact(admin, two_tenants.a.id)
        other_contact_id = create_contact(admin, two_tenants.a.id)
        admin.execute(
            """
            insert into public.channel_identities
                (organization_id, contact_id, channel, external_id)
            values (%s, %s, 'whatsapp', '+5511999990000')
            """,
            (two_tenants.a.id, contact_id),
        )

        with pytest.raises(psycopg.errors.UniqueViolation):
            admin.execute(
                """
                insert into public.channel_identities
                    (organization_id, contact_id, channel, external_id)
                values (%s, %s, 'whatsapp', '+5511999990000')
                """,
                (two_tenants.a.id, other_contact_id),
            )

    def test_the_same_external_id_may_exist_in_another_org(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        """The UNIQUE is per organization: two stores can talk to the same
        person without one hijacking the other's identity row."""
        for org in (two_tenants.a, two_tenants.b):
            contact_id = create_contact(admin, org.id)
            admin.execute(
                """
                insert into public.channel_identities
                    (organization_id, contact_id, channel, external_id)
                values (%s, %s, 'whatsapp', '+5511888880000')
                """,
                (org.id, contact_id),
            )


class TestMessageExpiry:
    def test_expires_at_is_filled_by_the_trigger(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        """`expires_at` is NOT NULL and nobody writes it by hand — a message
        with no expiry is a message the LGPD purge misses."""
        thread = create_thread(admin, two_tenants.a.id)
        message_id = create_message(admin, two_tenants.a.id, thread)

        expires_at, created_at = admin.execute(
            "select expires_at, created_at from public.messages where id = %s",
            (message_id,),
        ).fetchone()

        assert expires_at > created_at


class TestRolloutFlag:
    def test_an_org_without_a_row_is_legacy_by_absence_and_the_default_is_legacy(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        """The webhook treats "no row" as legacy; a row created without an
        explicit mode must not silently migrate the store."""
        admin.execute(
            "insert into public.ai_runtime_rollout (organization_id) values (%s)",
            (two_tenants.a.id,),
        )
        (mode,) = admin.execute(
            "select mode from public.ai_runtime_rollout where organization_id = %s",
            (two_tenants.a.id,),
        ).fetchone()

        assert mode == "legacy"
