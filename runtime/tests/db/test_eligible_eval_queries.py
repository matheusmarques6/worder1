"""Eval eligibility is decided in Postgres before the hard result cap."""

import uuid
from pathlib import Path

import psycopg
import pytest

from tests.db.conftest import as_authenticated_user
from tests.db.factories import create_agent, create_thread

pytestmark = pytest.mark.db
ROOT = Path(__file__).resolve().parents[3]
LEGACY_SCHEMA = (
    ROOT / "supabase/migrations-archive/20260612_ai_test_scenarios.sql",
    ROOT / "supabase/migrations-archive/20260613_ai_eval_tables.sql",
)
CASE_RPC = "public.list_eligible_eval_cases(uuid,uuid,integer)"
RESULT_RPC = "public.list_eligible_low_eval_results(uuid,uuid,integer)"


@pytest.fixture(scope="module", autouse=True)
def install_legacy_eval_schema(dsn):
    """Reproduce the remote legacy tables omitted from the clean migration stream."""
    with psycopg.connect(dsn, autocommit=True) as conn:
        for migration in LEGACY_SCHEMA:
            conn.execute(migration.read_text(encoding="utf-8"))
        conn.execute(
            "grant select on public.ai_eval_cases, public.ai_eval_results to service_role"
        )


def _insert_case(
    admin, organization_id, agent_id, *, source, source_id=None, created_at="now()"
):
    return admin.execute(
        f"""insert into public.ai_eval_cases
               (organization_id,agent_id,title,input,expected,source,source_id,created_at)
             values (%s,%s,'case','input','expected',%s,%s,{created_at})
             returning id""",
        (organization_id, agent_id, source, source_id),
    ).fetchone()[0]


def test_rpcs_filter_before_the_server_side_hard_cap(admin, two_tenants):
    with admin.transaction(force_rollback=True):
        organization_id = two_tenants.a.id
        agent_id = create_agent(admin, organization_id)
        thread = create_thread(admin, organization_id)

        # These 1,001 rows sort ahead of every eligible case/result. A client-side
        # filter behind PostgREST's max_rows=1000 would never see the valid rows.
        admin.execute(
            """insert into public.ai_eval_cases
                   (organization_id,agent_id,title,input,source,source_id,created_at)
                 select %s,%s,'ineligible-' || g,'input',
                        case when g <= 501 then 'manual' else null end,
                        case when g <= 501 then gen_random_uuid() else null end,
                        now() + interval '1 day' + g * interval '1 second'
                   from generate_series(1,1001) g""",
            (organization_id, agent_id),
        )
        legacy_trace_id = admin.execute(
            """insert into public.agent_traces
                   (organization_id,agent_id,input,output,created_at)
                 values (%s,%s,'legacy input','legacy output',now() + interval '3 days')
                 returning id""",
            (organization_id, agent_id),
        ).fetchone()[0]
        legacy_case_id = _insert_case(
            admin,
            organization_id,
            agent_id,
            source="annotation",
            source_id=legacy_trace_id,
            created_at="now() + interval '2 days'",
        )

        accepted_trace_id = admin.execute(
            """insert into public.agent_traces
                   (organization_id,conversation_id,agent_id,input,output,trace_source,outbox_id,
                    channel_account_id,generation,target_seq,created_at)
                 values (%s,%s,%s,'accepted input','accepted output','runtime_accepted',
                         gen_random_uuid(),%s,1,1,now() - interval '1 day')
                 returning id""",
            (organization_id, thread.conversation_id, agent_id, thread.channel_account_id),
        ).fetchone()[0]
        accepted_case_id = _insert_case(
            admin,
            organization_id,
            agent_id,
            source="annotation",
            source_id=accepted_trace_id,
            created_at="now() - interval '1 day'",
        )
        scenario_rows = admin.execute(
            """insert into public.ai_eval_cases
                   (organization_id,agent_id,title,input,source,source_id,created_at)
                 select %s,%s,'scenario-' || g,'input','scenario',gen_random_uuid(),
                        now() - interval '1 day' - g * interval '1 second'
                   from generate_series(1,25) g
                 returning id""",
            (organization_id, agent_id),
        ).fetchall()

        foreign_agent_id = create_agent(admin, two_tenants.b.id)
        _insert_case(
            admin,
            two_tenants.b.id,
            foreign_agent_id,
            source="scenario",
            created_at="now() + interval '10 days'",
        )

        ineligible_case_ids = [
            row[0]
            for row in admin.execute(
                """select id from public.ai_eval_cases
                     where organization_id=%s and agent_id=%s
                       and (source is null or source='manual')""",
                (organization_id, agent_id),
            ).fetchall()
        ]
        admin.execute(
            """insert into public.ai_eval_results
                   (organization_id,agent_id,case_id,score,judged_output,created_at)
                 select %s,%s,unnest(%s::uuid[]),0,'ineligible',now()""",
            (organization_id, agent_id, ineligible_case_ids),
        )
        admin.execute(
            """insert into public.ai_eval_results
                   (organization_id,agent_id,case_id,score,judged_output,created_at)
                 values (%s,%s,%s,0,'legacy',now())""",
            (organization_id, agent_id, legacy_case_id),
        )
        admin.execute(
            """insert into public.ai_eval_results
                   (organization_id,agent_id,case_id,score,judged_output,created_at)
                 values (%s,%s,%s,5,'accepted',now())""",
            (organization_id, agent_id, accepted_case_id),
        )
        for score, (case_id,) in zip(range(10, 35), scenario_rows, strict=True):
            admin.execute(
                """insert into public.ai_eval_results
                       (organization_id,agent_id,case_id,score,judged_output,created_at)
                     values (%s,%s,%s,%s,'scenario',now())""",
                (organization_id, agent_id, case_id, score),
            )

        admin.execute("set local role service_role")
        cases = admin.execute(
            "select id,source from public.list_eligible_eval_cases(%s,%s,5000)",
            (organization_id, agent_id),
        ).fetchall()
        assert len(cases) == 20
        assert cases[0] == (accepted_case_id, "annotation")
        assert [source for _, source in cases].count("scenario") == 19
        assert legacy_case_id not in {case_id for case_id, _ in cases}
        assert admin.execute(
            "select count(*) from public.list_eligible_eval_cases(%s,%s,0)",
            (organization_id, agent_id),
        ).fetchone() == (0,)

        results = admin.execute(
            """select case_id,score,judged_output
                 from public.list_eligible_low_eval_results(%s,%s,5000)""",
            (organization_id, agent_id),
        ).fetchall()
        assert len(results) == 20
        assert [score for _, score, _ in results] == [
            5, 10, 11, 12, 13, 14, 15, 16, 17, 18,
            19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
        ]
        assert results[0] == (accepted_case_id, 5, "accepted")
        assert legacy_case_id not in {case_id for case_id, _, _ in results}
        assert admin.execute(
            "select count(*) from public.list_eligible_low_eval_results(%s,%s,-7)",
            (organization_id, agent_id),
        ).fetchone() == (0,)


def test_rpcs_are_security_invoker_and_service_role_only(admin, dsn, two_tenants):
    case_oid, result_oid = admin.execute(
        "select to_regprocedure(%s)::oid,to_regprocedure(%s)::oid",
        (CASE_RPC, RESULT_RPC),
    ).fetchone()
    assert case_oid is not None
    assert result_oid is not None
    rows = admin.execute(
        """select p.oid,p.prosecdef,p.provolatile,p.proconfig
             from pg_proc p
            where p.oid in (%s,%s)
            order by p.oid""",
        (case_oid, result_oid),
    ).fetchall()
    assert rows == sorted(
        [
            (case_oid, False, "s", ["search_path=pg_catalog, public"]),
            (result_oid, False, "s", ["search_path=pg_catalog, public"]),
        ]
    )
    for rpc_oid in (case_oid, result_oid):
        assert admin.execute(
            """select count(*) from pg_proc p
                cross join lateral aclexplode(p.proacl) acl
               where p.oid=%s and acl.grantee=0
                 and acl.privilege_type='EXECUTE'""",
            (rpc_oid,),
        ).fetchone() == (0,)
        for role in ("anon", "authenticated", "worker_role", "sender_role"):
            assert not admin.execute(
                "select has_function_privilege(%s,%s,'EXECUTE')", (role, rpc_oid)
            ).fetchone()[0]
        assert admin.execute(
            "select has_function_privilege('service_role',%s,'EXECUTE')", (rpc_oid,)
        ).fetchone() == (True,)

    with as_authenticated_user(dsn, two_tenants.a.user_id) as user:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            user.execute(
                "select * from public.list_eligible_eval_cases(%s,%s,20)",
                (two_tenants.a.id, uuid.uuid4()),
            )
