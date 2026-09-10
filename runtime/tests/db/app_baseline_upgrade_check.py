"""Focused checks for the sealed synthetic legacy-upgrade lane."""

from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID

import psycopg
import pytest

from tests.db.test_app_baseline_schema import (
    constraint_definitions,
    expected_scoped_catalog,
    scoped_catalog,
)

SCOPED_TABLES = (
    "organization_members", "pipelines", "pipeline_stages", "automations",
    "automation_runs", "email_campaigns", "whatsapp_campaigns", "sms_campaigns",
    "email_sends", "whatsapp_sends", "sms_sends",
)
LEGACY_EMAIL_SEND_ID = UUID("00000000-0000-4000-8000-000000000013")
UNKNOWN_EMAIL_SEND_ID = UUID("00000000-0000-4000-8000-000000000099")
COMPENSATION_PATH = (
    Path(__file__).resolve().parents[3]
    / "supabase/migrations/20260909230000_app_baseline_forward_compat.sql"
)
PRESERVATION_QUERIES = {
    "organization_members": (
        "id, organization_id, user_id, role::text, email, name, status, invited_at, created_at"
    ),
    "pipelines": (
        "id, organization_id, store_id, name, description, color, position, is_default, "
        "created_at, updated_at"
    ),
    "pipeline_stages": "id, pipeline_id, name, color, position, probability, created_at",
    "automations": (
        "id, organization_id, name, description, status, trigger_type, trigger_config, nodes, "
        "edges, total_runs, successful_runs, failed_runs, total_revenue, created_at, updated_at"
    ),
    "automation_runs": (
        "id, automation_id, organization_id, contact_id, trigger_type, status, "
        "current_node_id, waiting_until, started_at, result, node_results, retry_count, metadata, "
        "trigger_data, lock_token, locked_at, locked_by, created_at"
    ),
    "email_campaigns": (
        "id, organization_id, template_id, name, subject, status, total_recipients, total_sent, "
        "total_opened, total_clicked, opens, clicks, settings, metadata, created_at, updated_at"
    ),
    "whatsapp_campaigns": (
        "id, organization_id, name, title, campaign_id, status, template_name, "
        "template_variables, body_variables, audience_count, total_recipients, total_sent, "
        "total_delivered, sent_count, delivered_count, read_count, failed_count, replied_count, "
        "created_at, updated_at"
    ),
    "sms_campaigns": (
        "id, organization_id, name, status, message_body, audience_count, sent_count, "
        "delivered_count, failed_count, replied_count, revenue, conversions, created_at, updated_at"
    ),
    "email_sends": (
        "id, organization_id, campaign_id, contact_id, automation_id, automation_run_id, flow_id, "
        "node_id, email, from_email, subject, status, open_count, click_count, provider, "
        "provider_message_id, resend_id, metadata, created_at, updated_at"
    ),
    "whatsapp_sends": (
        "id, organization_id, contact_id, campaign_id, automation_id, automation_run_id, flow_id, "
        "node_id, phone_number, message_body, template_name, template_params, status, "
        "external_message_id, metadata, created_at, updated_at"
    ),
    "sms_sends": (
        "id, organization_id, contact_id, campaign_id, automation_id, automation_run_id, flow_id, "
        "node_id, phone_number, message_body, status, external_message_id, metadata, "
        "created_at, updated_at"
    ),
}

REPLAY_DEPENDENCY_PRESERVATION_QUERIES = {
    "shopify_products": (
        "id, store_id, organization_id, shopify_product_id, title, description, body_html, "
        "collections, hidden_from_feeds, available, created_at, updated_at"
    ),
    "api_keys": (
        "id, organization_id, created_by, user_id, name, key, expires_at, created_at, "
        "permissions, key_hash, key_prefix, last_used_at, is_active"
    ),
    "email_templates": (
        "id, organization_id, store_id, name, description, category, design_json, design, html, "
        "thumbnail_url, is_prebuilt, is_active, editor_type, created_at, updated_at"
    ),
    "deals": (
        "id, organization_id, store_id, pipeline_id, stage_id, contact_id, title, value, "
        "currency, probability, status, position, tags, custom_fields, created_at, updated_at"
    ),
    "deal_activities": (
        "id, organization_id, store_id, deal_id, contact_id, user_id, activity_type, title, "
        "description, metadata, is_pinned, due_at, completed_at, created_at, updated_at"
    ),
    "events": "id, store_id",
    "pipeline_stage_transitions": (
        "id, organization_id, store_id, pipeline_id, from_stage_id, to_stage_id, source_type, "
        "trigger_event, filters, is_enabled, position, transitions_count, created_at, updated_at"
    ),
    "email_clicks": "id, email_send_id, url, clicked_at, user_agent, ip_address",
    "automation_executions": (
        "id, automation_id, organization_id, status, trigger_type, trigger_data, contact_id, "
        "deal_id, node_results, final_context, duration_ms, started_at, completed_at"
    ),
    "automation_versions": (
        "id, automation_id, version, nodes, edges, settings, change_note, created_by, created_at"
    ),
    "automation_run_steps": (
        "id, run_id, node_id, node_type, node_label, step_order, status, input_data, output_data, "
        "config_used, variables_resolved, error_message, error_details, duration_ms, started_at, "
        "completed_at, created_at"
    ),
    "automation_pending_steps": (
        "id, run_id, node_id, scheduled_for, context, status, qstash_message_id, lock_token, "
        "locked_at, locked_by, created_at"
    ),
    "whatsapp_campaign_recipients": (
        "id, campaign_id::text, contact_id, phone_number, contact_name, status, queued_at, "
        "sending_at, sent_at, retry_count, resolved_variables, created_at"
    ),
}


def _id(suffix):
    return UUID(f"00000000-0000-4000-8000-{suffix:012d}")


def _at(day, minute=0):
    return datetime(2026, 1, day, 0, minute, tzinfo=UTC)


def load_expected_fixture_rows():
    org, contact, automation = _id(1), _id(2), _id(6)
    return {
        "organization_members": ((
            _id(3), org, None, "member", "invitee@example.test", "Invited Member", "invited",
            _at(3), _at(3),
        ),),
        "pipelines": ((
            _id(4), org, None, "Legacy Pipeline", "Fixture pipeline", "#123456", 4, True,
            _at(4), _at(4),
        ),),
        "pipeline_stages": ((_id(5), _id(4), "Legacy Stage", "#654321", 2, 65, _at(5)),),
        "automations": ((
            automation, org, "Legacy Automation", "Fixture automation", "active",
            "contact_created", {"kind": "fixture"}, [{"id": "start"}],
            [{"from": "start", "to": "end"}], 9, 6, 3, Decimal("42.50"), _at(6), _at(6),
        ),),
        "automation_runs": (
            (_id(7), automation, org, contact, "manual", "pending", "start", None, _at(7),
             {"outcome": "pending"}, {"start": "queued"}, 2, {"fixture": 7},
             {"event": "pending"}, _id(107), _at(7, 1), "worker-7", _at(7)),
            (_id(8), automation, org, contact, "delay", "waiting", "delay-1", _at(9), _at(8),
             {"outcome": "waiting"}, {"delay-1": "waiting"}, 1, {"fixture": 8},
             {"event": "waiting"}, _id(108), _at(8, 1), "worker-8", _at(8)),
        ),
        "email_campaigns": ((
            _id(9), org, _id(18), "Legacy Email", "Fixture subject", "scheduled",
            20, 18, 7, 3, 8, 4,
            {"mode": "legacy"}, {"fixture": 9}, _at(9), _at(9),
        ),),
        "whatsapp_campaigns": (
            (_id(10), org, "Modern Campaign", None, None, "scheduled", "modern_fixture",
             {"first_name": "Legacy"}, ["Legacy"], 11, 11, 5, 4, 0, 0, 0, 0, 0,
             _at(10), _at(10)),
            (_id(11), org, None, "Legacy Campaign", "legacy-11", "RUNNING", "legacy_fixture",
             {}, ["Legacy"], 0, 0, 0, 0, 7, 6, 5, 2, 1, _at(11), _at(11)),
        ),
        "sms_campaigns": ((
            _id(12), org, "Legacy SMS", "draft", "Fixture message", 6, 5, 4, 1, 2,
            Decimal("12.34"), 1, _at(12), _at(12),
        ),),
        "email_sends": ((
            _id(13), org, _id(9), contact, automation, _id(7), automation, "email-1",
            "recipient@example.test", "sender@example.test", "Legacy pending", "pending", 3, 1,
            "fixture", "msg-13", "resend-13", {"fixture": 13}, _at(13), _at(13),
        ),),
        "whatsapp_sends": ((
            _id(14), org, contact, _id(10), automation, _id(7), automation, "wa-1",
            "+15550000014", "Fixture WhatsApp", "modern_fixture", ["Legacy"], "sent",
            "wamid-14", {"fixture": 14}, _at(14), _at(14),
        ),),
        "sms_sends": ((
            _id(15), org, contact, _id(12), automation, _id(8), automation, "sms-1",
            "+15550000015", "Fixture SMS", "delivered", "sms-15", {"fixture": 15},
            _at(15), _at(15),
        ),),
    }


def load_expected_replay_dependency_rows():
    org, store, contact = _id(1), _id(16), _id(2)
    return {
        "shopify_products": (
            _id(17), store, org, "17001", "Legacy Product", "Legacy description",
            "<p>Legacy body</p>", [{"id": "legacy-collection"}], False, None, _at(17), _at(17),
        ),
        "api_keys": (
            _id(20), org, None, _id(120), "Legacy API Key",
            "fixture_plaintext_not_a_credential", datetime(2027, 1, 20, tzinfo=UTC), _at(20),
            [], None, None, None, True,
        ),
        "email_templates": (
            _id(18), org, store, "Legacy Template", "Fixture template", "custom", None,
            {"sections": [{"_savedSectionId": str(_id(19)), "columns": []}]},
            "<p>Legacy template</p>", None, False, True, "visual", _at(18), _at(18),
        ),
        "deals": (
            _id(21), org, store, _id(4), _id(5), contact, "Legacy Deal", Decimal("21.50"),
            "BRL", 65, "open", 3, ["fixture"], {"source": "fixture"}, _at(21), _at(21),
        ),
        "deal_activities": (
            _id(22), org, store, _id(21), contact, None, "note", "Legacy note",
            "Fixture activity", {"fixture": 22}, True, None, None, _at(22), _at(22),
        ),
        "events": (_id(23), store),
        "pipeline_stage_transitions": (
            _id(24), org, store, _id(4), _id(5), _id(5), "shopify", "order_paid",
            {"fixture": 24}, True, 2, 7, _at(24), _at(24),
        ),
        "email_clicks": (
            _id(25), _id(13), "https" + "://example.test/legacy", _at(25), "fixture-agent",
            "192.0.2.25",
        ),
        "automation_executions": (
            "legacy-exec-26", _id(6), org, "success", "manual", {"fixture": 26}, contact,
            _id(21), {"start": "success"}, {"result": "preserved"}, 126, _at(26), _at(26, 1),
        ),
        "automation_versions": (
            _id(27), _id(6), 1, [{"id": "start"}], [{"from": "start", "to": "end"}],
            {"fixture": 27}, "Legacy version", None, _at(27),
        ),
        "automation_run_steps": (
            _id(28), _id(7), "start", "trigger", "Legacy step", 1, "success",
            {"fixture": "input"}, {"fixture": "output"}, {"fixture": "config"},
            {"fixture": "variables"}, None, None, 28, _at(28), _at(28, 1), _at(28),
        ),
        "automation_pending_steps": (
            _id(29), _id(8), "delay-1", datetime(2026, 2, 1, tzinfo=UTC), {"fixture": 29},
            "pending", "qstash-fixture-29", _id(129), _at(29, 1), "worker-29", _at(29),
        ),
        "whatsapp_campaign_recipients": (
            _id(30), str(_id(10)), contact, "+15550000030", "Legacy Recipient", "pending",
            _at(30), None, None, 2, {"first_name": "Legacy"}, _at(30),
        ),
    }


def preservation_rows(admin):
    return {
        table: tuple(admin.execute(
            f"select {PRESERVATION_QUERIES[table]} from public.{table} order by id"
        ).fetchall())
        for table in SCOPED_TABLES
    }


def replay_dependency_preservation_rows(admin):
    return {
        table: admin.execute(
            f"select {query} from public.{table}",
        ).fetchone()
        for table, query in REPLAY_DEPENDENCY_PRESERVATION_QUERIES.items()
    }


def _compensation_body():
    sql = COMPENSATION_PATH.read_text(encoding="utf-8").strip()
    assert sql.startswith("begin;") and sql.endswith("commit;")
    return sql.removeprefix("begin;").removesuffix("commit;")


def execute_compensation_against_unknown_status_inside_transaction(admin):
    with admin.transaction(force_rollback=True):
        admin.execute(
            "alter table public.email_sends drop constraint email_sends_status_check"
        )
        admin.execute(
            "insert into public.email_sends (id, organization_id, email, status) "
            "values (%s, %s, %s, %s)",
            (UNKNOWN_EMAIL_SEND_ID, _id(1), "unknown@example.test", "unknown-status"),
        )
        admin.execute(_compensation_body())


def test_upgrade_preserves_fixture_primary_keys_and_values(admin):
    assert preservation_rows(admin) == load_expected_fixture_rows()


def test_email_template_orphan_aborts_compensation_without_coercion(admin):
    before = preservation_rows(admin)
    with admin.transaction(force_rollback=True):
        admin.execute(
            "alter table public.email_campaigns drop constraint email_campaigns_template_id_fkey"
        )
        admin.execute(
            "update public.email_campaigns set template_id=%s where id=%s", (_id(999), _id(9)),
        )
        incompatible = preservation_rows(admin)
        with pytest.raises(
            psycopg.errors.RaiseException, match=r"email_campaigns\.template_id\.orphan",
        ):
            with admin.transaction():
                admin.execute(_compensation_body())
        assert preservation_rows(admin) == incompatible
    assert preservation_rows(admin) == before


def test_upgrade_preserves_replay_dependency_rows(admin):
    assert replay_dependency_preservation_rows(admin) == load_expected_replay_dependency_rows()


def test_upgrade_catalog_matches_canonical_contract(admin):
    assert scoped_catalog(admin) == expected_scoped_catalog()


def test_email_pending_row_survives_but_new_default_is_queued(admin):
    assert admin.execute(
        "select status from email_sends where id=%s", (LEGACY_EMAIL_SEND_ID,)
    ).fetchone()[0] == "pending"
    assert admin.execute(
        "select column_default from information_schema.columns "
        "where table_schema='public' and table_name='email_sends' and column_name='status'"
    ).fetchone()[0] in ("'queued'::text", "'queued'::character varying")


def test_incompatible_legacy_state_aborts_without_partial_changes(admin):
    before_rows = preservation_rows(admin)
    before_checks = constraint_definitions(admin, "email_sends")
    with pytest.raises(psycopg.errors.RaiseException, match=r"email_sends\.status"):
        execute_compensation_against_unknown_status_inside_transaction(admin)
    assert preservation_rows(admin) == before_rows
    assert constraint_definitions(admin, "email_sends") == before_checks


def test_compensation_replay_accepts_canonical_policy_deparse(admin):
    before = scoped_catalog(admin)
    with admin.transaction(force_rollback=True):
        admin.execute(_compensation_body())
    assert scoped_catalog(admin) == before == expected_scoped_catalog()


def test_compensation_recreates_missing_reserved_identifier_index(admin):
    before = scoped_catalog(admin)
    with admin.transaction(force_rollback=True):
        admin.execute("drop index public.idx_pipeline_stages_pipeline_position")
        admin.execute(_compensation_body())
        assert scoped_catalog(admin) == before == expected_scoped_catalog()


def test_email_status_without_default_is_rejected_and_rolled_back(admin):
    query = (
        "select column_default from information_schema.columns "
        "where table_schema='public' and table_name='email_sends' and column_name='status'"
    )
    before = admin.execute(query).fetchone()[0]
    with admin.transaction(force_rollback=True):
        admin.execute("alter table public.email_sends alter column status drop default")
        with pytest.raises(
            psycopg.errors.RaiseException,
            match=r"email_sends\.status\.default",
        ):
            with admin.transaction():
                admin.execute(_compensation_body())
        assert admin.execute(query).fetchone()[0] is None
    assert admin.execute(query).fetchone()[0] == before


@pytest.mark.parametrize(("ddl", "message"), (
    (
        "alter table public.email_sends add constraint task3_duplicate_check "
        "check (status in ('queued', 'pending', 'sent', 'delivered', 'opened', "
        "'clicked', 'bounced', 'failed', 'unsubscribed', 'complained'))",
        r"scoped_constraints\.multiplicity",
    ),
    (
        "alter table public.email_sends add constraint task3_duplicate_fk "
        "foreign key (organization_id) references public.organizations(id) on delete cascade",
        r"scoped_constraints\.multiplicity",
    ),
    (
        "create index task3_duplicate_index on public.email_sends (store_id) "
        "where store_id is not null",
        r"scoped_indexes\.multiplicity",
    ),
    (
        "create policy task3_duplicate_policy on public.organization_members "
        "as permissive for all to authenticated "
        "using (organization_id = public.get_user_organization_id()) "
        "with check (organization_id = public.get_user_organization_id())",
        r"scoped_policies\.multiplicity",
    ),
), ids=("check", "foreign-key", "index", "policy"))
def test_semantic_duplicates_abort_and_are_rolled_back(admin, ddl, message):
    before = scoped_catalog(admin)
    with admin.transaction(force_rollback=True):
        admin.execute(ddl)
        incompatible = scoped_catalog(admin)
        with pytest.raises(psycopg.errors.RaiseException, match=message):
            with admin.transaction():
                admin.execute(_compensation_body())
        assert scoped_catalog(admin) == incompatible
    assert scoped_catalog(admin) == before == expected_scoped_catalog()
