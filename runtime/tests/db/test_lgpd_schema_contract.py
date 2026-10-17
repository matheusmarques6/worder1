"""LGPD schema boundaries; no customer data or hosted services.

These are characterization checks for the route's safety assumptions, not a
claim that an application-only patch has erased the complete subject graph.
"""

import uuid

import psycopg
import pytest


def test_lgpd_contact_rectification_updates_components_not_generated_name(admin, two_tenants):
    contact_id = uuid.uuid4()
    with admin.transaction(force_rollback=True):
        admin.execute(
            "insert into public.contacts (id, organization_id, first_name, last_name) "
            "values (%s, %s, 'Old', 'Name')",
            (contact_id, two_tenants.a.id),
        )
        with pytest.raises(psycopg.errors.GeneratedAlways):
            with admin.transaction():
                admin.execute(
                    "update public.contacts set full_name='Forbidden' where id=%s",
                    (contact_id,),
                )
        # Tenant filtering must yield zero rows on a foreign contact.
        changed = admin.execute(
            "update public.contacts set first_name='Wrong tenant' "
            "where id=%s and organization_id=%s returning id",
            (contact_id, two_tenants.b.id),
        ).fetchall()
        assert changed == []
        row = admin.execute(
            "update public.contacts set first_name='Corrected', last_name='Name', "
            "email_consent='unsubscribed', suppressed=true "
            "where id=%s and organization_id=%s returning full_name, email_consent",
            (contact_id, two_tenants.a.id),
        ).fetchone()
        assert row == ("Corrected Name", "unsubscribed")


def test_lgpd_popup_consent_scrub_requires_a_separate_schema_decision(admin, two_tenants):
    """The current append-only guard must never be silently bypassed by erasure."""
    with admin.transaction(force_rollback=True):
        consent_id = admin.execute(
            "insert into public.consent_records "
            "(organization_id, channel, action, source, ip_address) "
            "values (%s, 'email', 'granted', 'test', '192.0.2.1') returning id",
            (two_tenants.a.id,),
        ).fetchone()[0]
        with pytest.raises(psycopg.errors.RaiseException):
            with admin.transaction():
                admin.execute(
                    "update public.consent_records set ip_address=null where id=%s",
                    (consent_id,),
                )
        assert admin.execute(
            "select ip_address from public.consent_records where id=%s", (consent_id,)
        ).fetchone() == ("192.0.2.1",)
