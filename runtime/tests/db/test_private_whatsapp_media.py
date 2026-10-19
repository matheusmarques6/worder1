"""SQL/RLS gate only: this does not prove Storage HTTP or signed URL expiry.

Uses the real storage schema. Missing Storage tables are a failure, never a
reason to substitute fake tables or silently skip the private-media gate.
"""

import json
import uuid

import psycopg
import pytest

from tests.db.factories import create_channel_account

pytestmark = pytest.mark.rls


@pytest.fixture(autouse=True)
def require_real_storage_schema(admin):
    """A DB/Auth-only executor must fail if official Storage bootstrap is absent."""
    buckets, objects = admin.execute(
        "select to_regclass('storage.buckets'), to_regclass('storage.objects')"
    ).fetchone()
    assert buckets is not None and objects is not None, (
        "SEC17 requires the real Supabase Storage schema: storage.buckets and "
        "storage.objects are missing. Bootstrap the pinned official Storage "
        "schema in the guarded disposable executor; do not skip this gate or "
        "substitute mirror tables. Storage HTTP proof remains a separate gate."
    )
    assert admin.execute(
        "select relrowsecurity from pg_class where oid='storage.objects'::regclass"
    ).fetchone() == (True,), "SEC17 requires RLS enabled on real storage.objects"


def assume_user(admin, tenant, session, aal="aal1"):
    claims = {
        "sub": str(tenant.user_id),
        "role": "authenticated",
        "session_id": str(session),
        "aal": aal,
    }
    admin.execute("select set_config('request.jwt.claims',%s,true)", (json.dumps(claims),))
    admin.execute("set local role authenticated")


def arrange(admin, tenants):
    assert admin.execute(
        "select public from storage.buckets where id='whatsapp-media'"
    ).fetchone() == (False,)
    # A legacy broad policy must not defeat the bucket's restrictive fence.
    admin.execute(
        "create policy sec17_test_legacy_broad on storage.objects "
        "for all to anon,authenticated using (true) with check (true)"
    )
    session = uuid.uuid4()
    admin.execute(
        "insert into auth.sessions(id,user_id,created_at,updated_at) values(%s,%s,now(),now())",
        (session, tenants.a.user_id),
    )
    keys = [f"{tenant.id}/template-headers/{uuid.uuid4()}.jpg" for tenant in (tenants.a, tenants.b)]
    for key in keys:
        admin.execute(
            "insert into storage.objects(bucket_id,name) values('whatsapp-media',%s)", (key,)
        )
    return session, keys[0], keys[1]


@pytest.mark.parametrize("operation", ["read", "insert", "update", "delete", "upsert"])
def test_storage_tenant_boundary_survives_legacy_policies(admin, two_tenants, operation):
    with admin.transaction(force_rollback=True):
        session, own, foreign = arrange(admin, two_tenants)
        assume_user(admin, two_tenants.a, session)
        if operation == "read":
            assert admin.execute(
                "select name from storage.objects where bucket_id='whatsapp-media' and name=%s",
                (own,),
            ).fetchone() == (own,)
            assert (
                admin.execute(
                    "select name from storage.objects where bucket_id='whatsapp-media' and name=%s",
                    (foreign,),
                ).fetchall()
                == []
            )
        elif operation in ("insert", "upsert"):
            suffix = (
                " on conflict(bucket_id,name) do update set metadata=excluded.metadata"
                if operation == "upsert"
                else ""
            )
            own_target = own if operation == "upsert" else own.replace(".jpg", "-new.jpg")
            foreign_target = (
                foreign if operation == "upsert" else foreign.replace(".jpg", "-new.jpg")
            )
            admin.execute(
                "insert into storage.objects(bucket_id,name) values('whatsapp-media',%s)" + suffix,
                (own_target,),
            )
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with admin.transaction():
                    admin.execute(
                        "insert into storage.objects(bucket_id,name) values('whatsapp-media',%s)"
                        + suffix,
                        (foreign_target,),
                    )
        elif operation == "update":
            assert (
                admin.execute(
                    "update storage.objects set metadata='{}' "
                    "where bucket_id='whatsapp-media' and name=%s",
                    (own,),
                ).rowcount
                == 1
            )
            assert (
                admin.execute(
                    "update storage.objects set metadata='{}' "
                    "where bucket_id='whatsapp-media' and name=%s",
                    (foreign,),
                ).rowcount
                == 0
            )
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with admin.transaction():
                    admin.execute(
                        "update storage.objects set name=%s "
                        "where bucket_id='whatsapp-media' and name=%s",
                        (foreign.replace(".jpg", "-moved.jpg"), own),
                    )
        else:
            # Match the Storage API's transaction scope; the fixture only creates
            # metadata and rolls back. This permits SQL DELETE, not an RLS bypass.
            admin.execute("select set_config('storage.allow_delete_query', 'true', true)")
            assert (
                admin.execute(
                    "delete from storage.objects where bucket_id='whatsapp-media' and name=%s",
                    (foreign,),
                ).rowcount
                == 0
            )
            assert (
                admin.execute(
                    "delete from storage.objects where bucket_id='whatsapp-media' and name=%s",
                    (own,),
                ).rowcount
                == 1
            )


@pytest.mark.parametrize(
    "state", ["anon", "removed", "revoked_session", "required_aal1", "required_aal2"]
)
def test_storage_live_identity_and_mfa(admin, two_tenants, state):
    with admin.transaction(force_rollback=True):
        session, own, _ = arrange(admin, two_tenants)
        if state == "removed":
            admin.execute(
                "update public.organization_members set status='removed' "
                "where user_id=%s and organization_id=%s",
                (two_tenants.a.user_id, two_tenants.a.id),
            )
        if state == "revoked_session":
            admin.execute("delete from auth.sessions where id=%s", (session,))
        if state.startswith("required"):
            admin.execute(
                "update public.organizations set settings=coalesce(settings,'{}'::jsonb) "
                "|| '{\"require_2fa\":true}'::jsonb where id=%s",
                (two_tenants.a.id,),
            )
        if state == "anon":
            admin.execute("set local role anon")
        else:
            assume_user(
                admin, two_tenants.a, session, "aal2" if state == "required_aal2" else "aal1"
            )
        rows = admin.execute(
            "select name from storage.objects where bucket_id='whatsapp-media' and name=%s", (own,)
        ).fetchall()
        assert bool(rows) is (state == "required_aal2")
        if state != "required_aal2":
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with admin.transaction():
                    admin.execute(
                        "insert into storage.objects(bucket_id,name) values('whatsapp-media',%s)",
                        (own.replace(".jpg", "-new.jpg"),),
                    )


def test_storage_key_requires_own_conversation_and_preserves_other_buckets(admin, two_tenants):
    with admin.transaction(force_rollback=True):
        session, _, _ = arrange(admin, two_tenants)
        conversations = []
        for tenant in (two_tenants.a, two_tenants.b):
            account = create_channel_account(admin, tenant.id)
            conversation = admin.execute(
                "insert into public.whatsapp_cloud_conversations(organization_id,waba_id,wa_id) "
                "values(%s,%s,%s) returning id",
                (tenant.id, account.id, str(uuid.uuid4())),
            ).fetchone()[0]
            conversations.append(conversation)
        bucket = f"sec17-other-{uuid.uuid4()}"
        admin.execute(
            "insert into storage.buckets(id,name,public) values(%s,%s,true)", (bucket, bucket)
        )
        assume_user(admin, two_tenants.a, session)
        own = f"{two_tenants.a.id}/{conversations[0]}/image.jpg"
        admin.execute(
            "insert into storage.objects(bucket_id,name) values('whatsapp-media',%s)", (own,)
        )
        for path in (
            f"{two_tenants.a.id}/{conversations[1]}/image.jpg",
            f"{two_tenants.a.id}/{conversations[0]}/../image.jpg",
            f"{two_tenants.a.id}/{conversations[0]}/image%2f.jpg",
        ):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                with admin.transaction():
                    admin.execute(
                        "insert into storage.objects(bucket_id,name) values('whatsapp-media',%s)",
                        (path,),
                    )
        admin.execute(
            "insert into storage.objects(bucket_id,name) values(%s,'image.jpg')", (bucket,)
        )
        assert admin.execute(
            "select name from storage.objects where bucket_id=%s", (bucket,)
        ).fetchall() == [("image.jpg",)]
