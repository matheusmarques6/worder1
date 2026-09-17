# Canonical App Schema Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local Supabase migration stream reproducible from zero and prove a data-preserving forward-only upgrade for existing databases.

**Architecture:** A bootstrap-only migration creates the legacy application prerequisites before their first active consumer. A later forward-only migration converges existing databases to the same scoped catalog, while the existing disposable executor gains strict post-reset identity readoption and one sealed synthetic-upgrade lane.

**Tech Stack:** PostgreSQL/Supabase CLI 2.111.0, Python 3.12, psycopg 3, pytest, PowerShell 7, Docker Desktop, TypeScript/Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-auditoria-ia-baseline-schema.md`

## Global Constraints

- Work only in the linked worktree on branch `fix/ai-engine-schema-baseline`, based on commit `51a8f25d`.
- Never change an existing file under `supabase/migrations`; only add the three versions named by the spec.
- Fresh bootstrap version is exactly `20260812000005_app_baseline_prereqs.sql`.
- Forward-only compensation version is exactly `20260909230000_app_baseline_forward_compat.sql`.
- Auth trigger version is exactly `20260910000000_auth_user_created_trigger.sql`.
- Supabase CLI remains pinned to `2.111.0`; disposable ports remain `45320`, `45321`, and `45322`.
- Never use `--linked`, `--include-all`, `migration repair`, a remote DSN, seed data, dump data, reset remote, or a down migration.
- No push, merge, deploy, publish, remote migration, or access to production is authorized.
- Docker operations are sequential and may be run only by the designated DB guardian after the relevant code review.
- Existing application and runtime tests may not gain skips or xfails. Five pre-existing XFAILs are evidence, not permission to add another.
- Every non-trivial code change follows RED then GREEN; failing RED tests and their implementation enter the same commit only after GREEN.
- The current app and active migrations are authoritative. Historical SQL is evidence and is never loaded as bootstrap wholesale.
- Preserve rows and primary keys. Divergence outside the approved transformation matrix aborts transactionally; no silent data rewrite is allowed.
- Reuse the current executor, pytest fixtures, psycopg, stdlib, and SQL catalog. Add no dependency, second executor, generic migration selector, or general schema-diff framework.
- A real run stops on its first non-green action. Failed nonces are never reused.

## File Structure

| File | Responsibility |
|---|---|
| `runtime/tests/support/disposable_executor.py` | Identity readoption, sealed upgrade projection and lifecycle. |
| `runtime/tests/unit/test_disposable_executor.py` | Pure FakeCLI regression tests for every new executor branch. |
| `scripts/test-disposable-db.ps1` | Closed public action dispatch; no SQL/path input. |
| `supabase/migrations/20260812000005_app_baseline_prereqs.sql` | Fresh-only prerequisite tables before active consumers. |
| `supabase/migrations/20260909230000_app_baseline_forward_compat.sql` | Additive convergence and explicit compatibility validation. |
| `supabase/migrations/20260910000000_auth_user_created_trigger.sql` | One verified auth signup trigger. |
| `runtime/tests/db/test_app_baseline_schema.py` | Executable normalized catalog contract for the 11 relations, shared by both lanes. |
| `runtime/tests/db/fixtures/app_baseline_legacy.sql` | Fixed synthetic legacy shapes and preservation rows. |
| `runtime/tests/db/app_baseline_upgrade_check.py` | Focal-only preservation and incompatible-data proof; its non-`test_` filename keeps it out of the fresh full suite. |
| `runtime/tests/db/test_auth_user_created_trigger.py` | Signup, invite and duplicate-trigger behavior. |
| `runtime/tests/db/conftest.py` | Tenant factory consumes the real auth trigger. |
| `docs/migrations/2026-09-09-app-schema-baseline-upgrade.md` | Fresh/upgrade manifests, dry-run procedure and failure response. |

---

### Task 1: Readopt the Postgres container after local reset

**Implementer:** fresh `gpt-5.6-sol`, high; **Reviewer:** fresh `gpt-6-astra`, high.

**Files:**
- Modify: `runtime/tests/support/disposable_executor.py:373-443,768-810,895-931`
- Modify: `runtime/tests/unit/test_disposable_executor.py:2711-3217`

**Interfaces:**
- Consumes: persisted `identity.json`, `inspect_record(data, project, before, prior=None)`, `Executor.physical()` and `Executor.replay()`.
- Produces: `inspect_record(data, project, before, prior=None, *, allow_container_replacement=False)`, `Executor.physical(*, allow_container_replacement=False)` and a persisted replacement `containerId` after a reset.
- Invariant: replacement may change only `containerId`; project, workdir label, image, volume, port and `systemIdentifier` remain equal.

- [ ] **Step 1: Extend FakeCLI with a real reset rotation**

Add explicit old/new 64-hex IDs and make the fake replace the DB ID whenever it handles the non-help `supabase db reset` call. Add a `reset_returncode` knob so replacement occurs before returning either zero or a migration failure.

```python
OLD_DB_ID = "a" * 64
NEW_DB_ID = "c" * 64

# In FakeCLI's db reset branch:
self.db_container_id = NEW_DB_ID
return subprocess.CompletedProcess(argv, self.reset_returncode, "", "")
```

- [ ] **Step 2: Write RED for successful readoption**

```python
def test_replay_readopts_reset_replacement_after_all_invariants_match(tmp_path, monkeypatch):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == 0
    assert executor.execute("Replay") == 0
    identity = json.loads((executor.run / "identity.json").read_text("utf-8"))
    assert identity["containerId"] == NEW_DB_ID
    assert identity["systemIdentifier"] == "1234567890123456789"
```

Run:

```powershell
uv run --directory runtime pytest tests/unit/test_disposable_executor.py::test_replay_readopts_reset_replacement_after_all_invariants_match -q
```

Expected: FAIL because replay still inspects `OLD_DB_ID`.

- [ ] **Step 3: Write RED for failure cleanup and primary error preservation**

```python
def test_failed_reset_readopts_for_cleanup_and_keeps_reset_failure(tmp_path, monkeypatch):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == 0
    cli.reset_returncode = 19
    assert executor.execute("Replay") == 19
    gate = json.loads((executor.run / "gates.json").read_text("utf-8"))
    assert gate["failure"] == {
        "stage": "reset", "kind": "CommandFailure", "exitCode": 19,
    }
    assert gate["state"] == "stopped"
    assert not cli.started
```

Run the exact node above. Expected: FAIL with the replacement left running and cleanup unable to inspect the old ID.

- [ ] **Step 4: Add negative identity cases**

Parameterize replacement records for changed `Image`, project label, workdir label, volume/port binding, direct SID, loopback SID and more than one DB candidate. Each case must return validation exit 2, set `state=unproven`, never call Supabase Stop and retain the project inventory in `unproven.json`.

```python
@pytest.mark.parametrize(
    "changed", ["image", "project", "workdir", "volume", "port", "sid", "loopback", "multiple"],
)
def test_reset_replacement_with_changed_invariant_is_never_adopted(
    tmp_path, monkeypatch, changed,
):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("Prepare") == 0
    cli.change_replacement(changed)
    assert executor.execute("Replay") == 2
    assert not cli.stop_called
```

- [ ] **Step 5: Implement the narrow replacement flag**

Keep the existing default strict. When `allow_container_replacement` is true, inspect by the exact project-owned DB name/label, compare every persisted field except `containerId`, and compare both direct and loopback `systemIdentifier` to the persisted SID.

```python
def inspect_record(data, project, before, prior=None, *, allow_container_replacement=False):
    result = {
        "projectId": project,
        "containerId": db["Id"],
        "imageId": db["Image"],
        "volumeName": volume,
        "port": 45322,
    }
    if prior is not None:
        stable = result.keys() - ({"containerId"} if allow_container_replacement else set())
        require(all(prior.get(key) == result[key] for key in stable),
                "container identity changed")
    return result

def physical(self, *, allow_container_replacement=False):
    target = (
        "supabase_db_" + self.project
        if allow_container_replacement or not self.identity
        else self.identity["containerId"]
    )
    # Existing inspect, port, volume, SID and loopback checks remain mandatory.
```

In `replay()`, capture a reset exception, attempt the one allowed readoption, persist the new validated identity, then re-raise the original exception. If readoption fails, clear `self.identity`, write `unproven.json`, and do not call Stop.

- [ ] **Step 6: Run GREEN and regression gates**

```powershell
uv run --directory runtime pytest tests/unit/test_disposable_executor.py -q
uv run --directory runtime ruff check tests/support/disposable_executor.py tests/unit/test_disposable_executor.py
```

Expected: 357 or more tests PASS; no new skip/xfail; Ruff exit 0.

- [ ] **Step 7: Commit after self-review**

```powershell
git add -- runtime/tests/support/disposable_executor.py runtime/tests/unit/test_disposable_executor.py
git commit -m "fix: readopt disposable database after reset"
```

**Review gate:** Critical 0, Important 0; both spec compliance and code quality approved. No Docker is run in this task.

---

### Task 2: Establish the executable fresh schema contract

**Implementer:** fresh `gpt-6-astra`, high; **Reviewer:** fresh `gpt-6-astra`, xhigh, distinct instance.

**Files:**
- Create: `runtime/tests/db/test_app_baseline_schema.py`
- Create: `supabase/migrations/20260812000005_app_baseline_prereqs.sql`

**Interfaces:**
- Consumes: organizations, profiles, contacts, stores, shopify_stores, templates and types from `20260812000001_agents_baseline_prereqs.sql`.
- Produces: the 11 relations required by active migrations before `20260904000001_attribution_v2_single_credit.sql` and by auth runtime.
- Produces test helpers `column_contract(admin, table, column)`, `constraint_definitions(admin, table)`, `scoped_catalog(admin)` and `expected_scoped_catalog()` for reuse in the upgrade lane.

- [ ] **Step 1: Write relation-presence RED**

```python
import pytest

RELATIONS = (
    "organization_members", "pipelines", "pipeline_stages",
    "automations", "automation_runs",
    "email_campaigns", "whatsapp_campaigns", "sms_campaigns",
    "email_sends", "whatsapp_sends", "sms_sends",
)

@pytest.mark.parametrize("table", RELATIONS)
def test_app_baseline_relations_exist(admin, table):
    assert admin.execute(
        "select to_regclass(%s)", (f"public.{table}",)
    ).fetchone()[0] == f"{table}"
```

The first protected replay RED is already recorded as SQLSTATE `42P01` at `email_sends`. Collect the new test without connecting:

```powershell
uv run --directory runtime pytest --collect-only tests/db/test_app_baseline_schema.py -q
```

Expected: 11 collected nodes, exit 0.

- [ ] **Step 2: Add catalog helpers and contract cases**

Use parameterized catalog assertions, not one test per column.

```python
def column_contract(admin, table, column):
    return admin.execute(
        """select data_type, udt_name, is_nullable, column_default
             from information_schema.columns
            where table_schema='public' and table_name=%s and column_name=%s""",
        (table, column),
    ).fetchone()

def constraint_definitions(admin, table):
    return dict(admin.execute(
        """select conname, pg_get_constraintdef(oid, true)
             from pg_constraint
            where conrelid=to_regclass(%s)
            order by conname""",
        (f"public.{table}",),
    ).fetchall())
```

Assert these exact behavior-critical contracts:

| Relation | Required contract assertions |
|---|---|
| `organization_members` | UUID PK; org FK CASCADE; nullable user FK; role `user_role`; email/name/status; invited/joined timestamps; UNIQUE org/user; enum values owner/admin/member/agent. |
| `pipelines` | org and nullable store UUIDs; name; position 0; is_default false; timestamps. |
| `pipeline_stages` | pipeline FK CASCADE; position 0; probability 50; is_won/is_lost false. |
| `automations` | org/store/name/trigger; JSONB config/filter/node/edge fields; `frequency_config` default `{\"type\":\"once\"}`; status; counters and revenue default 0. |
| `automation_runs` | automation FK CASCADE; nullable org/contact/deal; pending/waiting/running/completed/failed/cancelled; lock/result/retry/error/timestamps. |
| `email_campaigns` | org/store/name/subject/sender/template; both legacy and current counters; scheduling; failed plus legacy statuses; revenue/conversions defaults 0. |
| `whatsapp_campaigns` | union of name/title, total_*/*_count, lowercase/uppercase states; scheduling/template/audience/cost; revenue defaults 0. |
| `sms_campaigns` | org/store/name/status/message; counters, scheduling and revenue defaults 0. |
| `email_sends` | org/contact/campaign/store/automation links; email/to_email/from_email/sender_email/subject/provider/resend/provider IDs; queued default with pending compatibility; tracking/conversion/counters; JSONB metadata; partial UNIQUE dedupe_key. |
| `whatsapp_sends` | org/contact/campaign/automation/run/flow; phone/body/template; pending default; delivery/read/reply/conversion; external ID; metadata. |
| `sms_sends` | same ownership/link core; phone/body; pending default; delivery/click/conversion; external ID; metadata. |

`scoped_catalog(admin)` returns a sorted tuple of semantic rows covering the
columns above plus enum order, PK/FK/UNIQUE/CHECK definitions, semantic index
definitions, RLS/policy command/roles/qual/check, associated function/trigger
definitions and ACLs. `expected_scoped_catalog()` is explicit immutable test
data derived from this table and the reviewed active migrations. The fresh test
must assert equality between these two values; it must not write a golden file.

- [ ] **Step 3: Create the bootstrap migration in dependency order**

Use only `create table if not exists` with the exact columns from Step 2 and
semantic indexes. Do not add RLS or triggers here; active migrations own those
effects. Create the tables in this fixed order: `organization_members`,
`pipelines`, `pipeline_stages`, `automations`, `automation_runs`,
`email_campaigns`, `whatsapp_campaigns`, `sms_campaigns`, `email_sends`,
`whatsapp_sends`, then `sms_sends`.

Use these sources as evidence, then add the current-only fields from the table above:

- email campaign/send: `sql/claude-b-migration.sql:123-235`, `supabase/migrations-archive/20260401_store_isolation_tracking.sql`, `20260415_email_production_schema.sql`;
- WhatsApp/SMS sends and SMS campaigns: `supabase/migrations-archive/20260513_multi_channel_attribution.sql`;
- automations/runs: `supabase/complete-schema.sql:392-450`, `supabase/migrations-archive/20260508_automation_runs_full_columns.sql`;
- WhatsApp campaigns: `supabase/campaigns-schema.sql:70-126` and `supabase/whatsapp-schema-v3.sql:225-280`;
- membership/pipeline/stages: `supabase/complete-schema.sql:95-105,225-252`.

Required semantic indexes include:

```sql
create unique index if not exists uq_email_sends_dedupe_key
  on public.email_sends(dedupe_key) where dedupe_key is not null;
create index if not exists idx_automation_runs_pending
  on public.automation_runs(created_at) where status = 'pending';
create index if not exists idx_automation_runs_waiting
  on public.automation_runs(waiting_until) where status = 'waiting';
create index if not exists idx_pipeline_stages_pipeline_position
  on public.pipeline_stages(pipeline_id, position);
```

- [ ] **Step 4: Run static and collection GREEN**

```powershell
uv run --directory runtime pytest --collect-only tests/db/test_app_baseline_schema.py -q
uv run --directory runtime ruff check tests/db/test_app_baseline_schema.py
git diff --check
```

Expected: 11 presence nodes plus all contract nodes collected; Ruff and diff check exit 0. The real DB GREEN remains a guardian gate after review.

- [ ] **Step 5: Commit test and migration together**

```powershell
git add -- runtime/tests/db/test_app_baseline_schema.py supabase/migrations/20260812000005_app_baseline_prereqs.sql
git commit -m "fix: establish fresh app schema prerequisites"
```

**Review gate:** reviewer verifies all 11 relations, dependency order, current-only fields, status unions, FK semantics and absence of speculative tables. Critical 0, Important 0 before Task 3.

---

### Task 3: Add the forward-only convergence migration and preservation tests

**Implementer:** fresh `gpt-5.6-sol`, high; **Reviewer:** fresh `gpt-6-astra`, xhigh.

**Files:**
- Create: `supabase/migrations/20260909230000_app_baseline_forward_compat.sql`
- Create: `runtime/tests/db/fixtures/app_baseline_legacy.sql`
- Create: `runtime/tests/db/app_baseline_upgrade_check.py`

**Interfaces:**
- Consumes: the Task 2 contract and all active migrations through `20260909140000_definer_search_path.sql`.
- Produces: an additive, transactional migration that creates missing relations/columns, applies only approved transformations, and rejects every other divergence.
- Produces: a fixed legacy fixture and `preservation_rows(admin)`; reuses Task 2's normalized catalog contract instead of introducing a second representation.

- [ ] **Step 1: Write the fixed legacy fixture**

The fixture is test-only SQL. It creates the historical variants before active migrations are applied and inserts deterministic UUID rows. It must include:

- `email_sends` with default/status `pending` and one pending row;
- `organization_members` with nullable invited row and no user_id;
- `automation_runs` with one pending and one waiting row, including lock/result JSONB;
- both current WhatsApp campaign column families and one row for each status family;
- one linked row in every other scoped relation;
- no production identifier, email, URL, token or DSN.

Use UUIDs beginning `00000000-0000-4000-8000-` with distinct twelve-digit
suffixes and `example.test` emails so assertions are byte-stable.

- [ ] **Step 2: Write preservation and catalog tests**

```python
SCOPED_TABLES = (
    "organization_members", "pipelines", "pipeline_stages", "automations",
    "automation_runs", "email_campaigns", "whatsapp_campaigns", "sms_campaigns",
    "email_sends", "whatsapp_sends", "sms_sends",
)

def test_upgrade_preserves_fixture_primary_keys_and_values(admin):
    expected = load_expected_fixture_rows()
    assert preservation_rows(admin) == expected

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
```

Import `scoped_catalog` and `expected_scoped_catalog` from
`test_app_baseline_schema.py`. The single explicit contract is therefore run on
both fresh and upgraded databases. Keep normalization semantic: never include
OID, relfilenode, generated names or internal Supabase objects.

- [ ] **Step 3: Write incompatible-data RED**

On the upgraded database, open a transaction, remove only the known
`email_sends.status` CHECK inside that transaction, insert one fixed
`unknown-status` row, and execute the reviewed compensation SQL from its fixed
repository path. It must raise the sanitized compatibility error. Roll back,
then assert the canonical CHECK and every pre-existing row/value are unchanged.

```python
def test_incompatible_legacy_state_aborts_without_partial_changes(admin):
    before = preservation_rows(admin)
    with pytest.raises(psycopg.errors.RaiseException, match="email_sends.status"):
        execute_compensation_against_unknown_status_inside_transaction(admin)
    assert preservation_rows(admin) == before
```

- [ ] **Step 4: Implement only the approved transformation matrix**

The migration begins explicit transactional validation and applies:

- missing table/column creation using the Task 2 contract;
- `email_sends.status` default to queued while retaining pending in the allowed set;
- nullable `organization_members.user_id` and invite fields;
- `automation_runs` state union and missing lock/result/retry fields;
- `automations.frequency_config` default for future rows only;
- dual current counter/status families for email/WhatsApp campaigns;
- `pipelines.store_id` and stage flags;
- semantic FKs and indexes only after duplicate/orphan checks pass;
- `user_role` value `agent` if absent, without using the new enum value in the same migration.

Use explicit precondition blocks. Example:

```sql
do $$
begin
  if exists (
    select 1 from public.email_sends
     where status is not null
       and status not in ('pending','queued','sent','delivered','opened','clicked',
                          'bounced','failed','unsubscribed','complained')
  ) then
    raise exception 'app baseline incompatible: email_sends.status';
  end if;
end $$;
```

Do not delete, truncate, coerce values, rename columns, create synchronization triggers or drop unknown RLS policies/grants. Unknown incompatible definitions abort with a sanitized object/property message.

- [ ] **Step 5: Run static gates**

```powershell
uv run --directory runtime pytest --collect-only tests/db/app_baseline_upgrade_check.py -q
uv run --directory runtime ruff check tests/db/app_baseline_upgrade_check.py
git diff --check
```

Expected: preservation, equivalence and negative-abort nodes collected; Ruff/diff exit 0.

- [ ] **Step 6: Commit the convergence unit**

```powershell
git add -- supabase/migrations/20260909230000_app_baseline_forward_compat.sql
git add -- runtime/tests/db/fixtures/app_baseline_legacy.sql runtime/tests/db/app_baseline_upgrade_check.py
git commit -m "fix: add forward app schema convergence"
```

**Review gate:** Critical 0, Important 0; reviewer traces each DDL change to section 5.1, rejects destructive operations, verifies fixture coverage and checks that extra policies/grants cause refusal rather than silent removal.

---

### Task 4: Add the sealed synthetic-upgrade lane

**Implementer:** fresh `gpt-5.6-sol`, high; **Reviewer:** fresh `gpt-6-astra`, xhigh.

**Files:**
- Modify: `runtime/tests/support/disposable_executor.py`
- Modify: `runtime/tests/unit/test_disposable_executor.py`
- Modify: `scripts/test-disposable-db.ps1`

**Interfaces:**
- Consumes: fixed fixture `runtime/tests/db/fixtures/app_baseline_legacy.sql` and exact bootstrap filename.
- Produces: public action `PrepareUpgrade`, marker `upgrade-baseline.json`, and `upgrade_inventory(repo)` that excludes exactly one fixed bootstrap filename only in that lane.
- Keeps existing `Prepare`, `Replay`, `Upgrade`, `Test`, `Stop` behavior unchanged outside the sealed lane.

- [ ] **Step 1: Write dispatch and input RED**

Add tests proving `PrepareUpgrade` is accepted with no `TestTargets` or `MigrationThrough`, and every attempt to supply a SQL path, migration directory, exclusion list, linked flag or remote environment is rejected before start.

```python
def test_prepare_upgrade_accepts_no_caller_selected_inputs(tmp_path, monkeypatch):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    assert executor.execute("PrepareUpgrade") == 0
    assert cli.started

@pytest.mark.parametrize("action", ["prepareupgrade", "UpgradePrepare", "Prepare-Legacy"])
def test_unknown_upgrade_actions_are_refused(action, tmp_path, monkeypatch):
    executor, cli = fake_environment(tmp_path, monkeypatch)
    with pytest.raises(ValueError, match="invalid Action"):
        executor.execute(action)
    assert not cli.started
```

Expected: RED because the action is outside both ValidateSets.

- [ ] **Step 2: Write manifest projection RED**

```python
def test_upgrade_projection_excludes_only_fresh_bootstrap_and_keeps_hashes(tmp_path):
    current = inventory(tmp_path / "supabase/migrations")
    projected = upgrade_inventory(tmp_path)
    assert [r for r in current if r["filename"] != FRESH_BOOTSTRAP] == projected
    assert all(r in current for r in projected)

def test_upgrade_projection_rejects_missing_duplicate_or_changed_bootstrap(tmp_path):
    with pytest.raises(ValueError):
        upgrade_inventory(broken_repo(tmp_path))
```

- [ ] **Step 3: Write two-phase local history RED**

The FakeCLI call order must be exactly:

```python
assert operational_calls(cli) == [
    ["supabase", "start", "-x", EXCLUDED, "--workdir", str(run)],
    ["supabase", "migration", "up", "--local", "--workdir", str(run)],
    ["docker", "exec", "-i", DB_ID, "psql", "-X", "-v", "ON_ERROR_STOP=1",
     "-U", "postgres", "-d", "postgres", "-At"],
    ["supabase", "migration", "up", "--local", "--workdir", str(run)],
]
```

After the first `migration up`, history ends at `20260812000004`. After the second, it ends at `20260909140000` and contains neither bootstrap nor forward migration. The fixture path is resolved under the repository and rejected if linked/reparse or changed during execution.

- [ ] **Step 4: Implement the sealed action**

Add the literal action to PowerShell and Python ValidateSets only:

```powershell
[ValidateSet('Prepare', 'PrepareUpgrade', 'Replay', 'Upgrade', 'Test', 'Stop')]
```

Use constants, not caller configuration:

```python
FRESH_BOOTSTRAP = "20260812000005_app_baseline_prereqs.sql"
LEGACY_FIXTURE = Path("runtime/tests/db/fixtures/app_baseline_legacy.sql")
LEGACY_PREFIX_END = "20260812000004"
LEGACY_HISTORY_END = "20260909140000"
```

`PrepareUpgrade` starts with migrations disabled, materializes and hashes only the prefix, applies it, executes the fixed fixture, adds the remaining old history, applies it, verifies the exact projected history, writes the sealed marker, establishes sentinel/identity and ends in `state=ready`. Later `Upgrade` reads the marker and compares against `upgrade_inventory`; all other lanes continue using `inventory`.

- [ ] **Step 5: Prove forbidden CLI and lifecycle behavior**

Add assertions that the lane never emits `db reset`, `--include-all`, `repair`, `--linked`, `--db-url`, or seed flags. Failure in either migration phase or fixture execution preserves the original stage/exit code, invokes Stop only after full identity proof, and never promotes `manifest.json` on upgrade failure.

- [ ] **Step 6: Run GREEN and regression gates**

```powershell
uv run --directory runtime pytest tests/unit/test_disposable_executor.py -q
uv run --directory runtime ruff check tests/support/disposable_executor.py tests/unit/test_disposable_executor.py
git diff --check
```

Expected: all executor unit tests pass with no new skips/xfails.

- [ ] **Step 7: Commit**

```powershell
git add -- runtime/tests/support/disposable_executor.py runtime/tests/unit/test_disposable_executor.py scripts/test-disposable-db.ps1
git commit -m "test: add sealed app schema upgrade lane"
```

**Review gate:** Critical 0, Important 0; no generic projection/filter, no caller-selected SQL, exact history/hash proof, old actions unchanged.

---

### Task 5: Canonicalize auth signup and tenant fixtures

**Implementer:** fresh `gpt-5.6-terra`, high; **Reviewer:** fresh `gpt-5.6-sol`, high.

**Files:**
- Create: `supabase/migrations/20260910000000_auth_user_created_trigger.sql`
- Create: `runtime/tests/db/test_auth_user_created_trigger.py`
- Modify: `runtime/tests/db/conftest.py:58-101`

**Interfaces:**
- Consumes: `public.handle_new_user()` from `20260905091000_invited_members_join_org.sql` and the Task 2 membership/pipeline contract.
- Produces: one enabled auth trigger invocation; `_create_tenant()` inserts only `auth.users` and reads the objects provisioned by the trigger.

- [ ] **Step 1: Write signup RED**

```python
def test_auth_insert_provisions_one_owner_membership_pipeline_and_six_stages(admin):
    user_id = uuid.uuid4()
    email = f"signup-{user_id}@example.test"
    admin.execute(
        "insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_user_meta_data) "
        "values (%s,'00000000-0000-0000-0000-000000000000','authenticated',"
        "'authenticated',%s,'','{}')",
        (user_id, email),
    )
    profile = admin.execute(
        "select organization_id,role::text from profiles where id=%s", (user_id,)
    ).fetchone()
    assert profile and profile[1] == "owner"
    assert admin.execute(
        "select count(*) from organization_members where user_id=%s", (user_id,)
    ).fetchone()[0] == 1
    assert admin.execute(
        "select count(*) from pipelines where organization_id=%s and is_default",
        (profile[0],),
    ).fetchone()[0] == 1
    assert admin.execute(
        "select count(*) from pipeline_stages s join pipelines p on p.id=s.pipeline_id "
        "where p.organization_id=%s", (profile[0],)
    ).fetchone()[0] == 6
```

Cleanup deletes the auth user and generated organization in `finally`.

- [ ] **Step 2: Write invite and duplicate-trigger RED**

The invite test pre-creates an invited membership with null user_id, inserts an auth user carrying `invited_org_id` and `invited_role`, and asserts no extra organization/pipeline was created. The duplicate test creates a differently named enabled trigger that calls `handle_new_user`, reads the fixed migration path with `Path(__file__).resolve()`, executes that SQL in a transaction, expects the sanitized conflict error and rolls back without changing either trigger.

- [ ] **Step 3: Implement catalog-safe trigger installation**

The migration inspects `pg_trigger`, `pg_proc` and `pg_namespace` before DDL. It aborts on a conflicting homonym or any other enabled trigger invoking `public.handle_new_user()`. If absent or already canonical, it leaves one trigger:

```sql
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
```

Do not drop a trigger under another name and do not alter `handle_new_user()` in this task.

- [ ] **Step 4: Make `_create_tenant` consume the trigger**

Replace manual organization/profile creation with one auth insert and one profile lookup:

```python
def _create_tenant(conn: psycopg.Connection, label: str) -> Tenant:
    user_id = uuid.uuid4()
    with conn.transaction():
        conn.execute(
            """insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_user_meta_data)
               values (%s,'00000000-0000-0000-0000-000000000000','authenticated',
                       'authenticated',%s,'','{}')""",
            (user_id, f"{label}@example.test"),
        )
        row = conn.execute(
            "select organization_id from public.profiles where id=%s", (user_id,)
        ).fetchone()
        if row is None:
            raise AssertionError("auth trigger did not create a profile")
    return Tenant(id=row[0], user_id=user_id)
```

Keep teardown by the returned IDs; do not add a redundant profile insert.

- [ ] **Step 5: Run collection and unit gates**

```powershell
uv run --directory runtime pytest --collect-only tests/db/test_auth_user_created_trigger.py -q
uv run --directory runtime pytest tests/unit -q
uv run --directory runtime ruff check tests/db/conftest.py tests/db/test_auth_user_created_trigger.py
git diff --check
```

Expected: auth tests collected, full runtime unit suite green with only the five existing XFAILs, Ruff/diff exit 0.

- [ ] **Step 6: Commit**

```powershell
git add -- supabase/migrations/20260910000000_auth_user_created_trigger.sql
git add -- runtime/tests/db/test_auth_user_created_trigger.py runtime/tests/db/conftest.py
git commit -m "fix: install canonical auth signup trigger"
```

**Review gate:** Critical 0, Important 0; one invocation, invited tenancy preserved, unknown triggers untouched, fixture cleanup safe.

---

### Task 6: Document the two manifests and promotion boundary

**Implementer:** fresh `gpt-5.6-luna`, high; **Reviewer:** fresh `gpt-5.6-sol`, high.

**Files:**
- Create: `docs/migrations/2026-09-09-app-schema-baseline-upgrade.md`

**Interfaces:**
- Consumes: exact filenames/actions and evidence fields implemented by Tasks 1-5.
- Produces: an operator runbook that describes local proof and a future remote dry-run without authorizing it.

- [ ] **Step 1: Write the runbook with exact sections**

The document contains:

1. authority and scope;
2. fresh manifest rule: full ordered `supabase/migrations` inventory;
3. upgrade manifest rule: exclude only the bootstrap fresh, then add compensation and auth trigger;
4. CLI pin `2.111.0` and SHA-256 artifact locations;
5. local `Prepare/Replay/Test/Stop` commands;
6. local `PrepareUpgrade/Upgrade/Test/Stop` commands;
7. forbidden flags and remote operations;
8. expected catalog/preservation/auth evidence;
9. abort procedure for unknown schema/data;
10. production promotion checklist requiring a new explicit authorization.

Use placeholders only for runtime-generated values with shell syntax such as `$runPath`; do not include a real DSN, password, project ref or token.

- [ ] **Step 2: Add dry-run wording without performing it**

State that a future authorized operator must first inventory remote migration versions and execute `supabase db push --dry-run` without `--include-all`. The expected list is exactly the forward compensation and auth trigger; any retroactive file, extra migration or destructive statement blocks promotion.

- [ ] **Step 3: Verify and commit**

```powershell
rg -n -- "--include-all|repair|--linked|db-url|production" docs/migrations/2026-09-09-app-schema-baseline-upgrade.md
git diff --check
git add -- docs/migrations/2026-09-09-app-schema-baseline-upgrade.md
git commit -m "docs: add app schema upgrade runbook"
```

Expected: every forbidden operation appears only in a prohibition or future authorization boundary; diff check exit 0.

---

### Task 7: Run the two guarded Docker acceptance cycles

**Operators:** fresh `gpt-6-astra` high for fresh, then a distinct fresh `gpt-6-astra` high for upgrade; **Reviewer:** final branch reviewer in Task 8.

**Files:**
- Write ignored evidence only: `.superpowers/sdd/2026-09-08-auditoria-ia-app-schema-baseline/`
- Do not modify tracked files during acceptance.

**Interfaces:**
- Consumes: reviewed commits from Tasks 1-6 and a clean worktree.
- Produces: two stopped gates, manifest hashes, sanitized JUnit/catalog artifacts and zero residual Docker resources.

- [ ] **Step 1: Preflight without mutation**

Record branch, HEAD, clean status, CLI version/hash, PowerShell version, Docker context/endpoint, exact occupied ports and project-label inventory. Refuse if another disposable project owns `45320-45322` or the worktree is dirty in runtime/scripts/config/migrations.

- [ ] **Step 2: Execute the fresh nonce sequentially**

```powershell
$freshNonce = [guid]::NewGuid().ToString('N')
$freshRun = Join-Path $PWD ".superpowers/sdd/auditoria-ia-disposable/$freshNonce"
pwsh -File scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $freshRun
pwsh -File scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $freshRun
pwsh -File scripts/test-disposable-db.ps1 -Action Test -RunDirectory $freshRun
pwsh -File scripts/test-disposable-db.ps1 -Action Stop -RunDirectory $freshRun
```

Stop at the first non-zero exit. Test full must run DB, collected RLS, executed RLS and pipeline serially. `Test` may already stop in its finally; the explicit Stop proves idempotence.

- [ ] **Step 3: Prove fresh cleanup before the next nonce**

Require `state=stopped`, exact manifest history, zero project-labeled containers/networks/volumes, all recorded IDs absent, all three ports free, lock absent and unrelated preflight inventory unchanged.

- [ ] **Step 4: Execute the upgrade nonce sequentially**

```powershell
$upgradeNonce = [guid]::NewGuid().ToString('N')
$upgradeRun = Join-Path $PWD ".superpowers/sdd/auditoria-ia-disposable/$upgradeNonce"
pwsh -File scripts/test-disposable-db.ps1 -Action PrepareUpgrade -RunDirectory $upgradeRun
pwsh -File scripts/test-disposable-db.ps1 -Action Upgrade -RunDirectory $upgradeRun
& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $upgradeRun -TestTargets @('tests/db/test_app_baseline_schema.py','tests/db/app_baseline_upgrade_check.py','tests/db/test_auth_user_created_trigger.py')
pwsh -File scripts/test-disposable-db.ps1 -Action Stop -RunDirectory $upgradeRun
```

Require the history to exclude the bootstrap and include only the reviewed forward suffix. Require preservation, normalized catalog equivalence and auth focal PASS.

- [ ] **Step 5: Prove upgrade cleanup and write the sanitized report**

Repeat all postconditions from Step 3 and record commands, exit codes, HEAD, project IDs, container/image/volume IDs, SIDs, manifest hashes, test totals and artifact paths. Never copy a DSN, secret, raw customer payload or unsanitized CLI output.

**Gate:** both cycles green and stopped. An `unproven` run, residual resource, empty suite, skip, warning masking a failure, catalog difference or row mutation blocks Task 8.

---

### Task 8: Run global gates and whole-branch review

**Verifier:** fresh `gpt-5.6-terra`, high for app gates; fresh `gpt-5.6-sol`, high for runtime evidence; **Final reviewer:** fresh `gpt-6-astra`, xhigh.

**Files:**
- Write ignored review/evidence artifacts only under this plan's SDD workspace.
- Modify tracked files only through the single final fix agent if findings require it.

**Interfaces:**
- Consumes: merge base `51a8f25d`, Task 7 reports and every task review package.
- Produces: final spec/quality verdict and an explicit list of deferred minors/rulings.

- [ ] **Step 1: Run repository gates on the same clean HEAD**

```powershell
pnpm test
pnpm typecheck
pnpm build
uv run --directory runtime pytest tests/unit -q
uv run --directory runtime ruff check .
uv run --directory runtime lint-imports
```

Run the existing PowerShell boundary smoke and static parser explicitly:

```powershell
uv run --directory runtime pytest tests/unit/test_disposable_executor.py::test_launcher_transports_two_targets_and_preserves_native_exit_code -q
$parseTokens = $null
$parseErrors = $null
[Management.Automation.Language.Parser]::ParseFile((Join-Path $PWD 'scripts/test-disposable-db.ps1'), [ref]$parseTokens, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count) { throw 'PowerShell parse failed' }
git diff --check 51a8f25d..HEAD
```

Every command and exit code goes into the ledger/report.

- [ ] **Step 2: Generate the whole-branch review package**

Use merge base `51a8f25d` and current HEAD; include commit list, stat and full diff with context. Point the reviewer to the spec, plan, Task 7 reports, deferred minors and every ledger `Ruling:` line.

- [ ] **Step 3: Dispatch final review**

The final reviewer must return both spec compliance and code quality, check data preservation, tenant/auth security, migration ordering, executor identity/cleanup, rollback and scope. Critical or Important triggers one combined fix-agent dispatch and one scoped re-review.

- [ ] **Step 4: Finish without external side effects**

Require a clean worktree, no disposable resources and final review with no open Critical/Important. Report the branch, commit range, gates, remaining minors and every ruling. Do not push, merge, deploy or run any remote command; present those as separately authorized next steps.

---

## Stop Conditions

Subagent-Driven Development runs continuously through the plan and stops only for:

1. an irreversible/destructive operation;
2. a security-sensitive action not already bounded by this plan;
3. an external side effect such as push, merge, publish, remote migration or deploy;
4. a plan defect that leaves every safe path forward as a guess.

All other ambiguities receive a ledger ruling tied to the specification and continue through the review loop.
