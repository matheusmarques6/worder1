"""Forward-only OAuth ACL repair preserves callbacks and rejects unsafe drift."""
import uuid
from pathlib import Path

import psycopg
import pytest
from psycopg import sql

from tests.db.test_oauth_states import _seed, _snapshot
from tests.db.test_oauth_states import test_oauth_states_catalog as assert_catalog

pytestmark = pytest.mark.rls
MIGRATION = (Path(__file__).resolve().parents[3] / 'supabase/migrations'
             / '20261019211310_oauth_states_service_only_forward.sql')


def _body():
    source = MIGRATION.read_text(encoding='utf-8').strip()
    assert source.startswith('begin;') and source.endswith('commit;')
    return source.removeprefix('begin;').removesuffix('commit;')


def test_forward_repair_preserves_rows_shape_and_service_callback(admin):
    before = _snapshot(admin)
    with admin.transaction(force_rollback=True):
        _seed(admin)
        original = _snapshot(admin)
        admin.execute('create policy "Authenticated can use oauth_states" '
                      'on public.oauth_states for all to public using (auth.uid() is not null)')
        admin.execute('create policy org_isolation_rls on public.oauth_states '
                      'for all to authenticated '
                      'using (organization_id=get_user_organization_id()::text) '
                      'with check (organization_id=get_user_organization_id()::text)')
        admin.execute('create policy oauth_forward_broad on public.oauth_states '
                      'for all to public using (true) with check (true)')
        admin.execute('grant all on public.oauth_states to anon,authenticated')
        admin.execute('grant select(metadata) on public.oauth_states '
                      'to public,worker_role,sender_role,runtime_worker_login,runtime_sender_login')
        admin.execute(_body())
        current = _snapshot(admin)
        for index in (0, 1, 4, 5):
            assert current[index] == original[index]
        assert_catalog(admin)
        for role in ('runtime_worker_login', 'runtime_sender_login'):
            assert not admin.execute(
                "select has_column_privilege(%s,'public.oauth_states','metadata','SELECT')",
                (role,),
            ).fetchone()[0]
        nonce = 'forward:' + uuid.uuid4().hex
        admin.execute('set local role service_role')
        row = admin.execute(
            'insert into public.oauth_states(state,organization_id,expires_at) '
            "values(%s,'forward-probe',now()) returning id", (nonce,),
        ).fetchone()
        assert admin.execute('select id from public.oauth_states where state=%s',
                             (nonce,)).fetchone() == row
        assert admin.execute('delete from public.oauth_states where state=%s returning id',
                             (nonce,)).fetchone() == row
    assert _snapshot(admin) == before


def test_forward_repair_is_idempotent(admin):
    before = _snapshot(admin)
    with admin.transaction(force_rollback=True):
        _seed(admin)
        admin.execute(_body())
        once = _snapshot(admin)
        admin.execute(_body())
        assert _snapshot(admin) == once
    assert _snapshot(admin) == before


def test_forward_repair_rejects_unknown_grantee_before_changes(admin):
    before = _snapshot(admin)
    with admin.transaction(force_rollback=True):
        role = sql.Identifier('oauth_forward_' + uuid.uuid4().hex[:12])
        admin.execute(sql.SQL('create role {}').format(role))
        admin.execute(sql.SQL('grant select on public.oauth_states to {}').format(role))
        drift = _snapshot(admin)
        with pytest.raises(psycopg.errors.RaiseException, match='unknown_grantee'):
            with admin.transaction():
                admin.execute(_body())
        assert _snapshot(admin) == drift
    assert _snapshot(admin) == before


def test_forward_repair_refuses_missing_relation_without_recreating_it(admin):
    before = _snapshot(admin)
    with admin.transaction(force_rollback=True):
        admin.execute('drop table public.oauth_states')
        with pytest.raises(psycopg.errors.RaiseException, match='relation'):
            with admin.transaction():
                admin.execute(_body())
        assert admin.execute("select to_regclass('public.oauth_states')").fetchone() == (None,)
    assert _snapshot(admin) == before


@pytest.mark.parametrize('member,parent', (
    ('runtime_worker_login', 'service_role'), ('service_role', 'postgres'),
))
def test_forward_repair_refuses_privileged_membership(admin, member, parent):
    before = _snapshot(admin)
    membership = admin.execute('select pg_has_role(%s,%s,\'MEMBER\')',
                               (member, parent)).fetchone()
    with admin.transaction(force_rollback=True):
        admin.execute(sql.SQL('grant {} to {}').format(sql.Identifier(parent),
                                                      sql.Identifier(member)))
        if member == 'runtime_worker_login':
            assert admin.execute(
                "select rolinherit from pg_roles where rolname='runtime_worker_login'"
            ).fetchone() == (False,)
        drift = _snapshot(admin)
        with pytest.raises(psycopg.errors.RaiseException, match='privileged_membership'):
            with admin.transaction():
                admin.execute(_body())
        assert _snapshot(admin) == drift
    assert _snapshot(admin) == before
    assert admin.execute('select pg_has_role(%s,%s,\'MEMBER\')',
                         (member, parent)).fetchone() == membership
