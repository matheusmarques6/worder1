import uuid

import pytest

from tests.db.conftest import as_app_role
from tests.db.factories import create_outbox_item, create_thread


@pytest.mark.db
def test_confirmation_requires_matching_tenant(admin, dsn, two_tenants):
    thread = create_thread(admin, two_tenants.a.id)
    outbox_id = create_outbox_item(admin, two_tenants.a.id, thread)
    token = uuid.uuid4()
    admin.execute(
        "update internal.message_outbox set status='manual_review', locked_by=%s "
        "where id=%s",
        (str(token), outbox_id),
    )
    query = "select internal.confirm_sender_delivery(%s,%s,%s)"
    args = (outbox_id, token, "wamid.proof")

    with as_app_role(dsn, "sender_role", two_tenants.b.id) as conn:
        assert conn.execute(query, args).fetchone()[0] is False
    assert admin.execute(
        "select status,locked_by,provider_message_id from internal.message_outbox "
        "where id=%s",
        (outbox_id,),
    ).fetchone() == ("manual_review", str(token), None)

    with as_app_role(dsn, "sender_role", two_tenants.a.id) as conn:
        assert conn.execute(query, args).fetchone()[0] is True
    assert admin.execute(
        "select status,locked_by,provider_message_id from internal.message_outbox "
        "where id=%s",
        (outbox_id,),
    ).fetchone() == ("sent", None, "wamid.proof")


@pytest.mark.db
def test_confirmation_refuses_without_context_or_evidence(admin, dsn, two_tenants):
    thread = create_thread(admin, two_tenants.a.id)
    outbox_id = create_outbox_item(admin, two_tenants.a.id, thread)
    token = uuid.uuid4()
    admin.execute(
        "update internal.message_outbox set status='manual_review', locked_by=%s "
        "where id=%s",
        (str(token), outbox_id),
    )
    query = "select internal.confirm_sender_delivery(%s,%s,%s)"

    with as_app_role(dsn, "sender_role", two_tenants.a.id) as conn:
        conn.execute("select set_config('app.organization_id','',true)")
        assert conn.execute(query, (outbox_id, token, "wamid.proof")).fetchone()[0] is False
    with as_app_role(dsn, "sender_role", two_tenants.a.id) as conn:
        assert conn.execute(query, (outbox_id, token, "  ")).fetchone()[0] is False
        assert conn.execute(query, (outbox_id, uuid.uuid4(), "wamid.x")).fetchone()[0] is False
