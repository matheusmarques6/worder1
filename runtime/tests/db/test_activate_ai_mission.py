"""activate_ai_mission — arquivar-e-ativar não pode depender da ordem do heap.

A migration 20260813000009 fazia as duas coisas num único UPDATE, confiando
que o Postgres arquivaria a missão ativa antes de ativar a alvo. Mas
`ai_missions_one_active_per_family` é um índice único comum, verificado
linha a linha DURANTE a instrução — não no fim dela. Quando a linha da alvo
vinha antes da ativa no heap, a segunda `active` era escrita enquanto a
primeira ainda existia e o índice barrava, com o mesmo
`duplicate key value violates unique constraint` que o lojista via na tela.

A ordem inverte sozinha: qualquer edição na missão ativa reescreve a linha e
a joga para o fim do heap, atrás de um rascunho criado antes.
"""

import psycopg
import pytest

from tests.db.factories import create_mission

FAMILY = "cart.abandoned"


def _family(conn: psycopg.Connection, organization_id) -> list[tuple]:
    return conn.execute(
        "select id, status from public.ai_missions "
        "where organization_id = %s and event_type = %s order by status",
        (organization_id, FAMILY),
    ).fetchall()


class TestActivationIgnoresRowOrder:
    def test_it_activates_when_the_draft_row_comes_after_the_active_one(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        org = two_tenants.a.id
        active = create_mission(admin, org, event_type=FAMILY, status="active")
        draft = create_mission(admin, org, event_type=FAMILY, status="draft")

        admin.execute("select public.activate_ai_mission(%s, %s)", (org, draft))

        assert _family(admin, org) == [(draft, "active"), (active, "archived")]

    def test_it_activates_when_the_draft_row_comes_before_the_active_one(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        org = two_tenants.a.id
        active = create_mission(admin, org, event_type=FAMILY, status="active")
        draft = create_mission(admin, org, event_type=FAMILY, status="draft")
        # Editar a ativa reescreve a linha: ela passa a ocupar um ctid maior
        # que o do rascunho. É o estado real de quem mexeu na missão em uso
        # depois de guardar o rascunho — e era aqui que a ativação morria.
        admin.execute(
            "update public.ai_missions set change_summary = %s where id = %s",
            ("editada depois do rascunho", active),
        )

        admin.execute("select public.activate_ai_mission(%s, %s)", (org, draft))

        assert _family(admin, org) == [(draft, "active"), (active, "archived")]

    def test_it_still_refuses_a_mission_from_another_org(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        draft = create_mission(admin, two_tenants.a.id, event_type=FAMILY, status="draft")

        (activated,) = admin.execute(
            "select public.activate_ai_mission(%s, %s)", (two_tenants.b.id, draft)
        ).fetchone()

        assert activated is False
        assert _family(admin, two_tenants.a.id) == [(draft, "draft")]


class TestActivationWithoutAnIncumbent:
    def test_it_activates_a_draft_in_an_empty_family(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        org = two_tenants.a.id
        draft = create_mission(admin, org, event_type=FAMILY, status="draft")

        admin.execute("select public.activate_ai_mission(%s, %s)", (org, draft))

        assert _family(admin, org) == [(draft, "active")]

    def test_it_stamps_activated_at_only_on_the_winner(
        self, admin: psycopg.Connection, two_tenants
    ) -> None:
        org = two_tenants.a.id
        active = create_mission(admin, org, event_type=FAMILY, status="active")
        draft = create_mission(admin, org, event_type=FAMILY, status="draft")
        admin.execute(
            "update public.ai_missions set activated_at = now() where id = %s", (active,)
        )
        (incumbent_stamp,) = admin.execute(
            "select activated_at from public.ai_missions where id = %s", (active,)
        ).fetchone()

        admin.execute("select public.activate_ai_mission(%s, %s)", (org, draft))

        stamps = dict(
            admin.execute(
                "select id, activated_at from public.ai_missions "
                "where organization_id = %s and event_type = %s",
                (org, FAMILY),
            ).fetchall()
        )
        assert stamps[draft] is not None
        assert stamps[active] == incumbent_stamp
