"""The runtime mirror reader proves the conversation belongs to its organization."""

import uuid

import psycopg
import pytest

from agents_runtime.repository.agent import load_mirror_media
from tests.db.factories import create_channel_account, create_cloud_mirror


@pytest.mark.parametrize("case", ["owned", "foreign_org", "foreign_conversation"])
async def test_mirror_reader_requires_owned_conversation(admin, dsn, two_tenants, case):
    org = two_tenants.a.id
    account = create_channel_account(admin, org)
    conversation_org = two_tenants.b.id if case == "foreign_conversation" else org
    conversation_account = (
        create_channel_account(admin, conversation_org) if conversation_org != org else account
    )
    cloud = create_cloud_mirror(
        admin, conversation_org, conversation_account.id, f"media-{uuid.uuid4().hex}"
    )
    provider_id = f"media-{uuid.uuid4().hex}"
    key = f"{org}/{cloud.conversation_id}/audio.ogg"
    admin.execute(
        """insert into public.whatsapp_cloud_messages
           (organization_id, waba_id, conversation_id, message_id, direction,
            message_type, media_storage_path, media_mime_type)
           values (%s, %s, %s, %s, 'inbound', 'audio', %s, 'audio/ogg')""",
        (org, account.id, cloud.conversation_id, provider_id, key),
    )
    admin.commit()
    async with await psycopg.AsyncConnection.connect(dsn, autocommit=True) as conn:
        result = await load_mirror_media(
            conn,
            organization_id=two_tenants.b.id if case == "foreign_org" else org,
            provider_message_id=provider_id,
        )
    if case == "owned":
        assert result is not None
        assert result.conversation_id == cloud.conversation_id
        assert result.media_storage_path == key
        assert result.media_mime_type == "audio/ogg"
    else:
        assert result is None
