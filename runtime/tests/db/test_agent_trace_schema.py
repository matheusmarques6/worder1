"""Canonical accepted traces keep legacy history readable and tenant-safe."""

import uuid
from pathlib import Path

import psycopg
import pytest
from psycopg.types.json import Jsonb

from tests.db.conftest import as_app_role, as_authenticated_user
from tests.db.factories import create_agent, create_outbox_item, create_thread

pytestmark = pytest.mark.rls
MIGRATION = (
    Path(__file__).resolve().parents[3]
    / "supabase/migrations/20260915020000_accepted_agent_traces.sql"
)
RPC = (
    "internal.record_accepted_trace(uuid,uuid,uuid,uuid,uuid,integer,integer,"
    "integer,text,text,text,text,jsonb,integer,integer)"
)


def migration_body():
    sql = MIGRATION.read_text(encoding="utf-8").strip()
    assert sql.startswith("begin;") and sql.endswith("commit;")
    return sql.removeprefix("begin;").removesuffix("commit;")


def accepted_fixture(admin, organization_id):
    thread = create_thread(admin, organization_id)
    agent_id = create_agent(admin, organization_id)
    outbox_id = create_outbox_item(admin, organization_id, thread, text="accepted reply")
    admin.execute(
        "update public.conversations set processing_generation=3, last_processed_seq=7 where id=%s",
        (thread.conversation_id,),
    )
    return {
        "p_organization_id": organization_id,
        "p_outbox_id": outbox_id,
        "p_conversation_id": thread.conversation_id,
        "p_agent_id": agent_id,
        "p_channel_account_id": thread.channel_account_id,
        "p_generation": 3,
        "p_target_seq": 7,
        "p_selected_attempt": 1,
        "p_provider": "openai",
        "p_model": "gpt-4o-mini",
        "p_input": "customer input",
        "p_output": "accepted reply",
        "p_tool_calls": Jsonb({"calls": [{"name": "lookup", "result": {"ok": True}}]}),
        "p_tokens": 42,
        "p_latency_ms": 125,
    }


def record(conn, values):
    return conn.execute(
        """select internal.record_accepted_trace(
               %(p_organization_id)s, %(p_outbox_id)s, %(p_conversation_id)s,
               %(p_agent_id)s, %(p_channel_account_id)s, %(p_generation)s,
               %(p_target_seq)s, %(p_selected_attempt)s, %(p_provider)s,
               %(p_model)s, %(p_input)s, %(p_output)s, %(p_tool_calls)s,
               %(p_tokens)s, %(p_latency_ms)s)""",
        values,
    ).fetchone()[0]


def test_trace_catalog_has_canonical_columns_constraints_and_indexes(admin):
    columns = {
        row[0]: row[1:]
        for row in admin.execute(
            """select a.attname, format_type(a.atttypid,a.atttypmod),
                      not a.attnotnull, pg_get_expr(d.adbin,d.adrelid)
                 from pg_attribute a left join pg_attrdef d
                   on d.adrelid=a.attrelid and d.adnum=a.attnum
                where a.attrelid='public.agent_traces'::regclass
                  and a.attnum>0 and not a.attisdropped"""
        ).fetchall()
    }
    assert columns["trace_source"] == ("text", False, "'legacy_generated'::text")
    for name, sql_type in {
        "outbox_id": "uuid", "channel_account_id": "uuid", "generation": "integer",
        "target_seq": "integer", "selected_attempt": "integer",
    }.items():
        assert columns[name] == (sql_type, True, None)

    constraints = {
        name: (definition, valid)
        for name, definition, valid in admin.execute(
            """select conname, pg_get_constraintdef(oid,true), convalidated
                 from pg_constraint where conrelid='public.agent_traces'::regclass"""
        ).fetchall()
    }
    assert "trace_source = ANY" in constraints["agent_traces_trace_source_check"][0]
    assert "selected_attempt >= 0" in constraints["agent_traces_selected_attempt_check"][0]
    complete, valid = constraints["agent_traces_runtime_accepted_complete"]
    assert valid
    for name in (
        "organization_id", "conversation_id", "agent_id", "outbox_id",
        "generation", "target_seq", "output",
    ):
        assert f"{name} IS NOT NULL" in complete
    assert "channel_account_id IS NOT NULL" not in complete

    indexes = dict(admin.execute(
        "select indexname,indexdef from pg_indexes "
        "where schemaname='public' and tablename='agent_traces'"
    ).fetchall())
    assert "UNIQUE" in indexes["agent_traces_outbox_uniq"]
    assert "WHERE (outbox_id IS NOT NULL)" in indexes["agent_traces_outbox_uniq"]
    assert "(organization_id, agent_id, trace_source, created_at DESC)" in indexes[
        "agent_traces_org_agent_source_created_idx"
    ]
    assert admin.execute(
        """select count(*) from pg_constraint
            where conrelid='public.agent_traces'::regclass and contype='f'
              and pg_get_constraintdef(oid) ~ '(conversation_id|outbox_id)'"""
    ).fetchone() == (0,)


def test_legacy_insert_keeps_default_source_and_tool_shape(admin, two_tenants):
    tools = {"calls": [{"name": "catalog", "arguments": {"sku": "A-1"}}], "stopped_by": "done"}
    trace_id = admin.execute(
        """insert into public.agent_traces
               (organization_id,provider,model,input,output,tool_calls)
             values (%s,'openai','legacy-model','old input','old output',%s)
             returning id""",
        (two_tenants.a.id, Jsonb(tools)),
    ).fetchone()[0]
    assert admin.execute(
        "select trace_source,tool_calls from public.agent_traces where id=%s", (trace_id,)
    ).fetchone() == ("legacy_generated", tools)


@pytest.mark.parametrize(
    "source,attempt",
    (("unknown", None), ("legacy_generated", -1), ("runtime_accepted", None)),
)
def test_trace_constraints_reject_invalid_new_rows(admin, two_tenants, source, attempt):
    with pytest.raises(psycopg.errors.CheckViolation):
        admin.execute(
            "insert into public.agent_traces (organization_id,trace_source,selected_attempt) "
            "values (%s,%s,%s)",
            (two_tenants.a.id, source, attempt),
        )


@pytest.mark.parametrize("correction", (None, "", "   ", "\t", "\n", " \t\n "))
def test_annotations_preserve_shape_and_fix_requires_text(
    admin, two_tenants, correction
):
    columns = [row[0] for row in admin.execute(
        """select attname from pg_attribute
            where attrelid='public.agent_trace_annotations'::regclass
              and attnum>0 and not attisdropped order by attnum"""
    ).fetchall()]
    assert columns == [
        "id", "organization_id", "agent_id", "trace_id", "rating",
        "correction_text", "annotated_by", "created_at", "updated_at",
    ]
    trace_id = admin.execute(
        "insert into public.agent_traces (organization_id) values (%s) returning id",
        (two_tenants.a.id,),
    ).fetchone()[0]
    with admin.transaction(force_rollback=True):
        admin.execute("set local role service_role")
        admin.execute(
            """insert into public.agent_trace_annotations
                 (organization_id,agent_id,trace_id,rating)
               values (%s,%s,%s,'good')""",
            (two_tenants.a.id, uuid.uuid4(), trace_id),
        )
        with pytest.raises(psycopg.errors.CheckViolation):
            with admin.transaction():
                admin.execute(
                    """insert into public.agent_trace_annotations
                         (organization_id,agent_id,trace_id,rating,correction_text)
                       values (%s,%s,%s,'fix',%s)""",
                    (two_tenants.a.id, uuid.uuid4(), trace_id, correction),
                )


def test_rls_and_grants_are_explicit_and_tenant_scoped(admin, dsn, two_tenants):
    policies = admin.execute(
        """select tablename,roles,cmd,qual from pg_policies
            where schemaname='public'
              and tablename in ('agent_traces','agent_trace_annotations')
            order by tablename"""
    ).fetchall()
    assert len(policies) == 2
    assert all(row[1] == ["authenticated"] and row[2] == "SELECT" for row in policies)
    assert all("user_belongs_to_org(organization_id)" in row[3] for row in policies)
    for table in ("agent_traces", "agent_trace_annotations"):
        assert admin.execute(
            """select count(*) from pg_class c
                cross join lateral aclexplode(c.relacl) acl
               where c.oid=%s::regclass and acl.grantee=0
                 and acl.privilege_type in ('INSERT','UPDATE','DELETE')""",
            (f"public.{table}",),
        ).fetchone() == (0,)
        for role in ("anon", "authenticated", "worker_role", "sender_role"):
            assert not admin.execute(
                "select has_table_privilege(%s,%s,'INSERT,UPDATE,DELETE')",
                (role, f"public.{table}"),
            ).fetchone()[0]
        assert admin.execute(
            "select has_table_privilege('authenticated',%s,'SELECT')", (f"public.{table}",)
        ).fetchone() == (True,)
    for table, privileges in {
        "agent_traces": ("SELECT", "INSERT"),
        "agent_trace_annotations": ("SELECT", "INSERT", "UPDATE", "DELETE"),
    }.items():
        for privilege in privileges:
            assert admin.execute(
                "select has_table_privilege('service_role',%s,%s)",
                (f"public.{table}", privilege),
            ).fetchone() == (True,)

    own = admin.execute(
        "insert into public.agent_traces (organization_id) values (%s) returning id",
        (two_tenants.a.id,),
    ).fetchone()[0]
    admin.execute(
        "insert into public.agent_traces (organization_id) values (%s)",
        (two_tenants.b.id,),
    )
    with as_authenticated_user(dsn, two_tenants.a.user_id) as user:
        assert user.execute("select id from public.agent_traces").fetchall() == [(own,)]


def test_record_rpc_catalog_and_privileges(admin):
    assert admin.execute(
        """select p.oid::regprocedure::text,p.prosecdef,p.proconfig,
                  pg_get_function_result(p.oid)
             from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='internal' and p.proname='record_accepted_trace'"""
    ).fetchone() == (RPC, True, ["search_path=pg_catalog, public, internal"], "uuid")
    assert admin.execute(
        """select count(*) from pg_proc p
            cross join lateral aclexplode(p.proacl) acl
           where p.oid=%s::regprocedure and acl.grantee=0
             and acl.privilege_type='EXECUTE'""",
        (RPC,),
    ).fetchone() == (0,)
    for role in ("anon", "authenticated", "service_role", "sender_role"):
        assert not admin.execute(
            "select has_function_privilege(%s,%s,'EXECUTE')", (role, RPC)
        ).fetchone()[0]
    assert admin.execute(
        "select has_function_privilege('worker_role',%s,'EXECUTE')", (RPC,)
    ).fetchone() == (True,)


def test_record_rpc_is_idempotent_and_rejects_divergence(admin, dsn, two_tenants):
    values = accepted_fixture(admin, two_tenants.a.id)
    with as_app_role(dsn, "worker_role", two_tenants.a.id) as worker:
        first = record(worker, values)
        admin.execute(
            """update public.conversations
                  set processing_generation=4, last_processed_seq=8
                where id=%s""",
            (values["p_conversation_id"],),
        )
        assert record(worker, values) == first
        with pytest.raises(psycopg.errors.RaiseException, match="retry diverged"):
            with worker.transaction():
                record(worker, values | {"p_input": "different input"})
    assert admin.execute(
        "select trace_source,count(*) from public.agent_traces where outbox_id=%s group by 1",
        (values["p_outbox_id"],),
    ).fetchone() == ("runtime_accepted", 1)


def test_record_rpc_rejects_cross_tenant_scope(admin, dsn, two_tenants):
    values = accepted_fixture(admin, two_tenants.b.id)
    with as_app_role(dsn, "worker_role", two_tenants.a.id) as worker:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            record(worker, values)


@pytest.mark.parametrize("field", (
    "p_outbox_id", "p_conversation_id", "p_agent_id", "p_channel_account_id",
    "p_generation", "p_target_seq", "p_output",
))
def test_record_rpc_rejects_nonconcordant_context(admin, dsn, two_tenants, field):
    values = accepted_fixture(admin, two_tenants.a.id)
    foreign = create_thread(admin, two_tenants.b.id)
    replacements = {
        "p_outbox_id": uuid.uuid4(),
        "p_conversation_id": foreign.conversation_id,
        "p_agent_id": create_agent(admin, two_tenants.b.id),
        "p_channel_account_id": foreign.channel_account_id,
        "p_generation": 4,
        "p_target_seq": 8,
        "p_output": "draft, not accepted",
    }
    with as_app_role(dsn, "worker_role", two_tenants.a.id) as worker:
        with pytest.raises(psycopg.errors.InvalidParameterValue):
            record(worker, values | {field: replacements[field]})


def test_migration_replays_without_changing_rows(admin, two_tenants):
    trace_id = admin.execute(
        "insert into public.agent_traces (organization_id) values (%s) returning id",
        (two_tenants.a.id,),
    ).fetchone()[0]
    with admin.transaction(force_rollback=True):
        admin.execute(migration_body())
        admin.execute(migration_body())
        assert admin.execute(
            "select trace_source from public.agent_traces where id=%s", (trace_id,)
        ).fetchone() == ("legacy_generated",)


def test_archived_shape_and_rows_survive_forward_migration(admin, two_tenants):
    trace_id, annotation_id = uuid.uuid4(), uuid.uuid4()
    tools = {"calls": [{"name": "old_tool", "arguments": {"id": 7}}]}
    with admin.transaction(force_rollback=True):
        admin.execute("drop table public.agent_trace_annotations")
        admin.execute(f"drop function {RPC}")
        for column in (
            "trace_source", "outbox_id", "channel_account_id", "generation",
            "target_seq", "selected_attempt",
        ):
            admin.execute(f"alter table public.agent_traces drop column {column} cascade")
        admin.execute(
            """create table public.agent_trace_annotations (
                 id uuid primary key default gen_random_uuid(),
                 organization_id uuid not null, agent_id uuid not null,
                 trace_id uuid not null unique references public.agent_traces(id) on delete cascade,
                 rating text not null check (rating in ('good','bad','fix')),
                 correction_text text, annotated_by uuid,
                 created_at timestamptz not null default now(),
                 updated_at timestamptz not null default now())"""
        )
        admin.execute(
            """insert into public.agent_traces
                 (id,organization_id,provider,model,input,output,tool_calls)
               values (%s,%s,'legacy','old','input','output',%s)""",
            (trace_id, two_tenants.a.id, Jsonb(tools)),
        )
        admin.execute(
            """insert into public.agent_trace_annotations
                 (id,organization_id,agent_id,trace_id,rating,correction_text)
               values (%s,%s,%s,%s,'fix',E'\\t\\n')""",
            (annotation_id, two_tenants.a.id, uuid.uuid4(), trace_id),
        )
        admin.execute(migration_body())
        assert admin.execute(
            "select trace_source,tool_calls from public.agent_traces where id=%s", (trace_id,)
        ).fetchone() == ("legacy_generated", tools)
        assert admin.execute(
            "select rating,correction_text from public.agent_trace_annotations where id=%s",
            (annotation_id,),
        ).fetchone() == ("fix", "\t\n")
        assert admin.execute(
            """select convalidated from pg_constraint
                where conrelid='public.agent_trace_annotations'::regclass
                  and conname='agent_trace_annotations_fix_requires_correction'"""
        ).fetchone() == (False,)
