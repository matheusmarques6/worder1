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
        "id, organization_id, name, subject, status, total_recipients, total_sent, total_opened, "
        "total_clicked, opens, clicks, settings, metadata, created_at, updated_at"
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
            _id(9), org, "Legacy Email", "Fixture subject", "scheduled", 20, 18, 7, 3, 8, 4,
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


def preservation_rows(admin):
    return {
        table: tuple(admin.execute(
            f"select {PRESERVATION_QUERIES[table]} from public.{table} order by id"
        ).fetchall())
        for table in SCOPED_TABLES
    }


def execute_compensation_against_unknown_status_inside_transaction(admin):
    sql = COMPENSATION_PATH.read_text(encoding="utf-8").strip()
    assert sql.startswith("begin;") and sql.endswith("commit;")
    body = sql.removeprefix("begin;").removesuffix("commit;")
    with admin.transaction(force_rollback=True):
        admin.execute(
            "alter table public.email_sends drop constraint email_sends_status_check"
        )
        admin.execute(
            "insert into public.email_sends (id, organization_id, email, status) "
            "values (%s, %s, %s, %s)",
            (UNKNOWN_EMAIL_SEND_ID, _id(1), "unknown@example.test", "unknown-status"),
        )
        admin.execute(body)


def test_upgrade_preserves_fixture_primary_keys_and_values(admin):
    assert preservation_rows(admin) == load_expected_fixture_rows()


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
