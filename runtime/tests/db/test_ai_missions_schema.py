"""ai_missions — o catálogo por evento, append-only (doc §3.3.3).

O que o schema em si tem que garantir, antes de qualquer código: UMA missão
ativa por (organization_id, event_type); concession estruturada com default
`{"kind": "none"}`; versões formam árvore por parent_version_id.
"""


import psycopg
import pytest

from tests.db.factories import create_mission


class TestOneActivePerFamily:
    def test_a_second_active_mission_for_the_same_event_is_rejected(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        create_mission(admin, two_tenants.a.id, event_type="cart.abandoned", status="active")

        with pytest.raises(psycopg.errors.UniqueViolation):
            create_mission(admin, two_tenants.a.id, event_type="cart.abandoned", status="active")

    def test_drafts_do_not_count_against_the_active_slot(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        create_mission(admin, two_tenants.a.id, event_type="cart.abandoned", status="active")
        create_mission(admin, two_tenants.a.id, event_type="cart.abandoned", status="draft")
        create_mission(admin, two_tenants.a.id, event_type="cart.abandoned", status="archived")

    def test_the_slot_is_per_event_type(self, admin: psycopg.Connection, two_tenants) -> None:
        create_mission(admin, two_tenants.a.id, event_type="cart.abandoned", status="active")
        create_mission(admin, two_tenants.a.id, event_type="order.fulfilled", status="active")

    def test_the_slot_is_per_org(self, admin: psycopg.Connection, two_tenants) -> None:
        create_mission(admin, two_tenants.a.id, event_type="cart.abandoned", status="active")
        create_mission(admin, two_tenants.b.id, event_type="cart.abandoned", status="active")


class TestConcession:
    def test_the_default_is_kind_none(self, admin: psycopg.Connection, two_tenants) -> None:
        mission_id = create_mission(admin, two_tenants.a.id)
        (concession,) = admin.execute(
            "select concession from public.ai_missions where id = %s", (mission_id,)
        ).fetchone()

        assert concession == {"kind": "none"}


class TestVersionTree:
    def test_a_version_may_point_at_its_parent(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        parent = create_mission(admin, two_tenants.a.id, status="archived")
        child = create_mission(admin, two_tenants.a.id, status="active", parent_version_id=parent)

        (got,) = admin.execute(
            "select parent_version_id from public.ai_missions where id = %s", (child,)
        ).fetchone()
        assert got == parent

    def test_deleting_the_parent_keeps_the_child(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        """Append-only na prática: apagar história não pode arrastar a versão
        viva junto — o FK é ON DELETE SET NULL."""
        parent = create_mission(admin, two_tenants.a.id, status="archived")
        child = create_mission(admin, two_tenants.a.id, status="active", parent_version_id=parent)

        admin.execute("delete from public.ai_missions where id = %s", (parent,))

        (got,) = admin.execute(
            "select parent_version_id from public.ai_missions where id = %s", (child,)
        ).fetchone()
        assert got is None


class TestConversationOwnerLink:
    def test_owner_mission_version_survives_mission_archival_but_not_deletion(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        from tests.db.factories import create_thread

        mission_id = create_mission(admin, two_tenants.a.id, status="active")
        thread = create_thread(admin, two_tenants.a.id)
        admin.execute(
            "update public.conversations set owner_mission_version_id = %s where id = %s",
            (mission_id, thread.conversation_id),
        )

        admin.execute("delete from public.ai_missions where id = %s", (mission_id,))

        (owner,) = admin.execute(
            "select owner_mission_version_id from public.conversations where id = %s",
            (thread.conversation_id,),
        ).fetchone()
        assert owner is None
