"""Real local Storage HTTP; requires explicit guarded storage-http-v1 profile.

No HTTP mocks, public cloud endpoints, real credentials, or absent-infra skips.
JWT signing is synthetic; auth.sessions and Storage JWT validation/RLS are real.
"""

import os
import re
import time
import uuid

import httpx
import pytest

from tests.db.factories import create_channel_account
from tests.support.storage_http import checked_path, token


@pytest.fixture
def storage(admin, two_tenants):
    assert os.environ.get("WORDER_TEST_STORAGE_PROFILE") == "storage-http-v1"
    secret = os.environ.get("WORDER_TEST_STORAGE_SECRET", "")
    assert re.fullmatch(r"[0-9a-f]{64}", secret), "guarded local Storage credentials absent"
    assert admin.execute(
        "select public from storage.buckets where id='whatsapp-media'"
    ).fetchone() == (False,)
    sessions, conversations = [], []
    for tenant in (two_tenants.a, two_tenants.b):
        session = uuid.uuid4()
        admin.execute(
            "insert into auth.sessions(id,user_id,created_at,updated_at) "
            "values(%s,%s,now(),now())", (session, tenant.user_id),
        )
        sessions.append(session)
        account = create_channel_account(admin, tenant.id)
        conversations.append(admin.execute(
            "insert into public.whatsapp_cloud_conversations(organization_id,waba_id,wa_id) "
            "values(%s,%s,%s) returning id", (tenant.id, account.id, str(uuid.uuid4())),
        ).fetchone()[0])

    class Storage:
        own = f"{two_tenants.a.id}/{conversations[0]}/image.txt"
        foreign = f"{two_tenants.b.id}/{conversations[1]}/image.txt"
        foreign_conversation = f"{two_tenants.a.id}/{conversations[1]}/image.txt"
        other_bucket = "sec17-http-" + uuid.uuid4().hex
        user = token(secret, "authenticated", user=two_tenants.a.user_id, session=sessions[0])
        service = token(secret, "service_role")
        anon = token(secret, "anon")
        expired = token(secret, "authenticated", user=two_tenants.a.user_id,
                        session=sessions[0], seconds=-60)
        invalid = token("wrong-synthetic-secret", "authenticated", user=two_tenants.a.user_id,
                        session=sessions[0])

        def request(self, method, path, *, jwt=None, **kwargs):
            headers = kwargs.pop("headers", {})
            if jwt:
                headers["Authorization"] = "Bearer " + jwt
            return self.client.request(method, checked_path(path), headers=headers, **kwargs)

        def upload(self, key, *, jwt=None, data=b"fixture", upsert=False, bucket="whatsapp-media"):
            return self.request("POST", f"/object/{bucket}/{key}", jwt=jwt or self.user,
                                content=data, headers={"Content-Type": "text/plain",
                                                       "x-upsert": str(upsert).lower()})

        def delete(self, key, *, jwt=None, bucket="whatsapp-media"):
            return self.request("DELETE", f"/object/{bucket}", jwt=jwt or self.user,
                                json={"prefixes": [key]})

    state = Storage()
    with httpx.Client(base_url="http://127.0.0.1:45323", timeout=10,
                      follow_redirects=False, trust_env=False) as client:
        state.client = client
        # Legacy permissive policies must not bypass the private bucket fence.
        admin.execute(
            "create policy sec17_http_legacy_broad on storage.objects "
            "for all to anon,authenticated using (true) with check (true)"
        )
        admin.execute("insert into storage.buckets(id,name,public) values(%s,%s,true)",
                      (state.other_bucket, state.other_bucket))
        try:
            for key in (state.own, state.foreign, state.foreign_conversation):
                response = state.upload(key, jwt=state.service)
                assert response.status_code == 200, response.text
            yield state
        finally:
            for key in (state.own, state.foreign, state.foreign_conversation,
                        state.own.replace("image.txt", "new.txt")):
                state.delete(key, jwt=state.service)
            state.delete("public.txt", jwt=state.service, bucket=state.other_bucket)
            admin.execute("delete from storage.buckets where id=%s", (state.other_bucket,))
            admin.execute("drop policy sec17_http_legacy_broad on storage.objects")


def test_owned_upload_download_upsert_and_delete(storage):
    key = storage.own.replace("image.txt", "new.txt")
    assert storage.upload(key, data=b"first").status_code == 200
    downloaded = storage.request("GET", f"/object/authenticated/whatsapp-media/{key}",
                                 jwt=storage.user)
    assert downloaded.status_code == 200 and downloaded.content == b"first"
    assert storage.upload(key, data=b"replacement", upsert=True).status_code == 200
    downloaded = storage.request("GET", f"/object/authenticated/whatsapp-media/{key}",
                                 jwt=storage.user)
    assert downloaded.status_code == 200 and downloaded.content == b"replacement"
    assert storage.delete(key).status_code == 200
    assert storage.request("GET", f"/object/authenticated/whatsapp-media/{key}",
                           jwt=storage.user).status_code in (400, 403, 404)


@pytest.mark.parametrize("identity", ["anonymous", "anon", "invalid", "expired"])
def test_anonymous_and_invalid_tokens_cannot_read_upload_or_sign(storage, identity):
    jwt = None if identity == "anonymous" else getattr(storage, identity)
    for method, path, kwargs in [
        ("GET", f"/object/authenticated/whatsapp-media/{storage.own}", {}),
        ("POST", f"/object/sign/whatsapp-media/{storage.own}", {"json": {"expiresIn": 60}}),
        ("POST", f"/object/whatsapp-media/{storage.own}",
         {"content": b"attack", "headers": {"Content-Type": "text/plain", "x-upsert": "true"}}),
    ]:
        response = storage.request(method, path, jwt=jwt, **kwargs)
        assert response.status_code in (400, 401, 403, 404), response.text


def test_private_public_endpoint_denied_even_with_authenticated_token(storage):
    for jwt in (None, storage.anon, storage.user):
        response = storage.request("GET", f"/object/public/whatsapp-media/{storage.own}", jwt=jwt)
        assert response.status_code in (400, 403, 404), response.text


@pytest.mark.parametrize("key_kind", ["foreign", "foreign_conversation"])
def test_foreign_organization_and_conversation_denied(storage, key_kind):
    key = getattr(storage, key_kind)
    for response in (
        storage.request("GET", f"/object/authenticated/whatsapp-media/{key}", jwt=storage.user),
        storage.request("POST", f"/object/sign/whatsapp-media/{key}", jwt=storage.user,
                        json={"expiresIn": 60}),
        storage.upload(key, data=b"attack", upsert=True),
        storage.upload(key.replace("image.txt", "new.txt"), data=b"attack"),
    ):
        assert response.status_code in (400, 403, 404), response.text
    # DELETE may return 200/[] for filtered rows; prove bytes remain intact.
    response = storage.delete(key)
    assert response.status_code in (200, 400, 403, 404), response.text
    response = storage.request("GET", f"/object/authenticated/whatsapp-media/{key}",
                               jwt=storage.service)
    assert response.status_code == 200 and response.content == b"fixture"


def test_signed_download_expires_at_live_server(storage):
    response = storage.request("POST", f"/object/sign/whatsapp-media/{storage.own}",
                               jwt=storage.user, json={"expiresIn": 2})
    assert response.status_code == 200, response.text
    signed = checked_path(response.json()["signedURL"])
    response = storage.request("GET", signed)
    assert response.status_code == 200 and response.content == b"fixture"
    # Bounded real clock wait, no monkeypatch/freezegun/expiry simulation.
    deadline = time.monotonic() + 7
    while time.monotonic() < deadline:
        time.sleep(0.5)
        response = storage.request("GET", signed)
        if response.status_code in (400, 401, 403):
            assert "expir" in response.text.lower(), response.text
            return
        assert response.status_code == 200, response.text
    pytest.fail("signed URL still served bytes after the bounded expiry window")


def test_revoked_session_cannot_access_private_storage(storage, admin, two_tenants):
    admin.execute("delete from auth.sessions where user_id=%s", (two_tenants.a.user_id,))
    response = storage.request("GET", f"/object/authenticated/whatsapp-media/{storage.own}",
                               jwt=storage.user)
    assert response.status_code in (400, 403, 404), response.text
    assert storage.upload(storage.own, upsert=True).status_code in (400, 403, 404)


def test_unrelated_bucket_keeps_public_read_and_permissive_upload(storage):
    response = storage.upload("public.txt", jwt=storage.anon, data=b"unrelated",
                               bucket=storage.other_bucket)
    assert response.status_code == 200, response.text
    response = storage.request("GET", f"/object/public/{storage.other_bucket}/public.txt")
    assert response.status_code == 200 and response.content == b"unrelated"
