import uuid

import pytest

from tests.db.factories import (
    contact_phone,
    create_cloud_mirror,
    create_contact,
    create_message,
    create_thread,
)


@pytest.mark.db
def test_human_outbound_is_recorded_once(admin, two_tenants):
    thread = create_thread(admin, two_tenants.a.id)
    cloud = create_cloud_mirror(
        admin,
        two_tenants.a.id,
        thread.channel_account_id,
        contact_phone(admin, thread.contact_id),
    )
    provider_id = f"human-{uuid.uuid4().hex}"
    # organization_id/waba_id: not null on whatsapp_cloud_messages, no default
    # and no fill-in trigger — the brief's insert omitted them, which faults
    # on NOT NULL before this migration's AFTER INSERT trigger ever runs.
    # on conflict (message_id) do nothing: message_id is UNIQUE on this table
    # (whatsapp_cloud_messages_message_id_key) and production's own writer,
    # internal.mirror_outbound_to_inbox, already guards a webhook redelivery
    # the same way — a bare second INSERT would raise unique_violation before
    # ever reaching this migration's trigger.
    insert = """insert into public.whatsapp_cloud_messages
        (organization_id,waba_id,conversation_id,message_id,direction,message_type,text_body,content,sender,sent_by_bot)
        values (%s,%s,%s,%s,'outbound','text','Frete grátis','{}','human',false)
        on conflict (message_id) do nothing"""
    admin.execute(insert, (two_tenants.a.id, cloud.waba_id, cloud.conversation_id, provider_id))
    admin.execute(insert, (two_tenants.a.id, cloud.waba_id, cloud.conversation_id, provider_id))

    rows = admin.execute(
        """select author_type, content->>'text' from public.messages
           where provider_message_id=%s""",
        (provider_id,),
    ).fetchall()
    assert rows == [("human", "Frete grátis")]


@pytest.mark.db
def test_bot_outbound_is_not_duplicated(admin, two_tenants):
    thread = create_thread(admin, two_tenants.a.id)
    cloud = create_cloud_mirror(
        admin,
        two_tenants.a.id,
        thread.channel_account_id,
        contact_phone(admin, thread.contact_id),
    )
    provider_id = f"bot-{uuid.uuid4().hex}"
    admin.execute(
        """insert into public.whatsapp_cloud_messages
           (organization_id,waba_id,conversation_id,message_id,direction,message_type,text_body,content,sender,sent_by_bot)
           values (%s,%s,%s,%s,'outbound','text','resposta do bot','{}','bot',true)""",
        (two_tenants.a.id, cloud.waba_id, cloud.conversation_id, provider_id),
    )
    assert admin.execute(
        "select count(*) from public.messages where provider_message_id=%s",
        (provider_id,),
    ).fetchone() == (0,)


@pytest.mark.db
def test_channel_identity_wins_over_phone_fallback(admin, two_tenants):
    """Parity with `public.ingest_inbound_message`: identity lookup first,
    phone fallback second — and the first branch has to actually win, not
    just exist. `create_thread`/`create_cloud_mirror` alone never touch
    `channel_identities`, so every other case in this file only exercises
    the phone fallback. Here a SECOND contact (with its own canonical
    conversation) is pinned by a `channel_identities` row on the mirror's
    `wa_id`; the phone fallback would instead find the first contact. The
    canonical row must land on the identity contact's conversation."""
    org = two_tenants.a.id
    thread = create_thread(admin, org)
    cloud = create_cloud_mirror(
        admin, org, thread.channel_account_id, contact_phone(admin, thread.contact_id)
    )

    identity_contact_id = create_contact(admin, org)
    with admin.cursor() as cur:
        cur.execute(
            """insert into public.conversations
                   (organization_id, contact_id, last_channel, last_inbound_at)
               values (%s, %s, 'whatsapp', now())
               returning id""",
            (org, identity_contact_id),
        )
        (identity_conversation_id,) = cur.fetchone()
        cur.execute(
            """insert into public.channel_identities
                   (organization_id, contact_id, channel, external_id)
               values (%s, %s, 'whatsapp', %s)""",
            (org, identity_contact_id, cloud.wa_id),
        )

    provider_id = f"human-{uuid.uuid4().hex}"
    admin.execute(
        """insert into public.whatsapp_cloud_messages
               (organization_id,waba_id,conversation_id,message_id,direction,message_type,text_body,content,sender,sent_by_bot)
           values (%s,%s,%s,%s,'outbound','text','Frete grátis','{}','human',false)
           on conflict (message_id) do nothing""",
        (org, cloud.waba_id, cloud.conversation_id, provider_id),
    )

    row = admin.execute(
        "select conversation_id from public.messages where provider_message_id=%s",
        (provider_id,),
    ).fetchone()
    assert row == (identity_conversation_id,)
    assert row != (thread.conversation_id,)


@pytest.mark.db
def test_trigger_conflict_guard_is_reachable(admin, two_tenants):
    """Proves the trigger's OWN `on conflict do nothing` on `public.messages`
    — not the mirror's uniqueness on `whatsapp_cloud_messages.message_id`,
    which `test_human_outbound_is_recorded_once` already covers but which
    short-circuits the trigger entirely (an AFTER INSERT trigger never fires
    for a row Postgres skipped at the mirror). Reached from the other side:
    the canonical writer (the sender/outbox path) legitimately lands a row
    with this `provider_message_id` FIRST — `messages_provider_message_id_uniq`
    is what the human-outbound insert then collides with. Exactly one
    canonical row must survive and the trigger's insert must not raise."""
    org = two_tenants.a.id
    thread = create_thread(admin, org)
    cloud = create_cloud_mirror(
        admin, org, thread.channel_account_id, contact_phone(admin, thread.contact_id)
    )
    provider_id = f"human-{uuid.uuid4().hex}"
    create_message(
        admin,
        org,
        thread,
        direction="outbound",
        seq=99,
        text="já enviado pelo motor",
        provider_message_id=provider_id,
    )

    admin.execute(
        """insert into public.whatsapp_cloud_messages
               (organization_id,waba_id,conversation_id,message_id,direction,message_type,text_body,content,sender,sent_by_bot)
           values (%s,%s,%s,%s,'outbound','text','chegou depois','{}','human',false)
           on conflict (message_id) do nothing""",
        (org, cloud.waba_id, cloud.conversation_id, provider_id),
    )

    rows = admin.execute(
        "select author_type from public.messages where provider_message_id=%s",
        (provider_id,),
    ).fetchall()
    assert rows == [("agent",)]
