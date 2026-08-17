"""Chips de progresso do agente no chat (pedido 17/08).

`internal.emit_ai_run_step` é o palco dos chips que o inbox assina por
Realtime (`whatsapp_ai_run_steps`, filtrada pela conversa CLOUD): o worker
emite partindo da conversa CANÔNICA (ele não conhece telefone) e o sender
partindo do telefone E.164. Sem conversa no espelho (toque frio) o passo
some num `false` silencioso — adereço de UI nunca é motivo de erro.
"""

import uuid

import psycopg

from tests.db.conftest import as_app_role
from tests.db.factories import contact_phone, create_cloud_mirror, create_thread


def emit(
    conn: psycopg.Connection,
    organization_id: uuid.UUID,
    *,
    conversation_id: uuid.UUID | None = None,
    phone: str | None = None,
    step: str = "started",
    detail: str | None = None,
) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "select internal.emit_ai_run_step(%s, %s, %s, %s, null, null, %s, %s)",
            (organization_id, uuid.uuid4(), step, detail, conversation_id, phone),
        )
        (ok,) = cur.fetchone()
    return ok


def steps_for(admin: psycopg.Connection, cloud_conversation_id: uuid.UUID) -> list[tuple]:
    with admin.cursor() as cur:
        cur.execute(
            """
            select step, detail from public.whatsapp_ai_run_steps
             where conversation_id = %s order by created_at
            """,
            (cloud_conversation_id,),
        )
        return cur.fetchall()


def link_identity(
    admin: psycopg.Connection, organization_id: uuid.UUID, contact_id: uuid.UUID, phone: str
) -> None:
    """No vivo quem cria a identidade é o ingest; aqui o arranjo é manual."""
    admin.execute(
        """
        insert into public.channel_identities
            (organization_id, contact_id, channel, external_id)
        values (%s, %s, 'whatsapp', %s)
        """,
        (organization_id, contact_id, phone),
    )


class TestEmitFromTheWorker:
    def test_resolves_the_cloud_conversation_from_the_canonical_one(
        self, admin, dsn, two_tenants
    ) -> None:
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        link_identity(admin, org, thread.contact_id, phone)
        mirror = create_cloud_mirror(admin, org, thread.channel_account_id, phone)

        with as_app_role(dsn, "worker_role", org) as worker:
            ok = emit(
                worker,
                org,
                conversation_id=thread.conversation_id,
                step="generating",
                detail="Gerando resposta",
            )

        assert ok is True
        assert steps_for(admin, mirror.conversation_id) == [("generating", "Gerando resposta")]

    def test_without_a_cloud_stage_it_is_a_quiet_false(self, admin, dsn, two_tenants) -> None:
        """Toque frio: canônica existe, inbox nunca viu a pessoa. Sem palco,
        sem chip — e sem erro que pudesse custar o turno."""
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        link_identity(admin, org, thread.contact_id, phone)

        with as_app_role(dsn, "worker_role", org) as worker:
            ok = emit(worker, org, conversation_id=thread.conversation_id)

        assert ok is False


class TestEmitFromTheSender:
    def test_resolves_by_phone_across_the_plus_prefix(self, admin, dsn, two_tenants) -> None:
        """O espelho guarda wa_id SEM '+'; o sender manda E.164 COM '+'. A
        mesma tolerância do mirror_outbound_to_inbox vale aqui."""
        org = two_tenants.a.id
        thread = create_thread(admin, org)
        phone = contact_phone(admin, thread.contact_id)
        mirror = create_cloud_mirror(admin, org, thread.channel_account_id, phone)

        with as_app_role(dsn, "sender_role", org) as sender:
            ok = emit(sender, org, phone=phone, step="sent", detail="Resposta enviada")

        assert ok is True
        assert steps_for(admin, mirror.conversation_id) == [("sent", "Resposta enviada")]
