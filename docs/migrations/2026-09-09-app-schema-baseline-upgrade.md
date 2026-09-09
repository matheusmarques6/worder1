# App schema baseline: local proof and upgrade boundary

## Authority and scope

This runbook documents local, disposable-database validation only. It grants no production authorization and performs no remote inventory, dry-run, migration, push, merge, or deploy. A failed or ambiguous proof is a stop condition; it is not permission to repair, skip, or reinterpret history.

The executor is the only caller of SQL, migration paths, exclusions, and test-environment credentials. Operators provide only the public action, an absolute nonce directory, and (for focal `Test`) the fixed test-target array shown below.

## Fresh manifest

`Prepare` copies the complete ordered inventory of `supabase/migrations` into `$runPath/supabase/migrations`. The rows below are the literal `manifest.json` inventory at this revision; `version` is the numeric prefix and `sha256` is the uppercase SHA-256 of the file bytes. Order is `(version, filename)`.

| version | filename | sha256 |
|---|---|---|
| 20260621 | `20260621_phase0_foundations.sql` | `8990BEB3BAF7D7677A7299B16045114137D1C54AE0722E6341FEE80B577A4320` |
| 20260812000001 | `20260812000001_agents_baseline_prereqs.sql` | `2F127B5C1FF280B82955BD6E1F444E921D4BC50018403EF1EB2B61FED583A219` |
| 20260812000002 | `20260812000002_runtime_roles_and_internal.sql` | `DF4A849999D0A407B07792BFC26C2DAB533664AB417DC6D56665A3D23E2803D3` |
| 20260812000003 | `20260812000003_identity_conversations.sql` | `52C96186B085C52C3DFC1C17508A147408D90246972BD6D59F5E55BCB0E2ABD6` |
| 20260812000004 | `20260812000004_engine_functions.sql` | `B1C92756190FFA67D201615EF7B0212DBC4676C2D8EAEFBD467747B450C0D304` |
| 20260812000005 | `20260812000005_app_baseline_prereqs.sql` | `80517ED4B6729789B13B3FA5632F33A5F2120D712953BA4B06D9415A97B04F07` |
| 20260813000001 | `20260813000001_ai_missions.sql` | `BE978E08303E5B498275F7BD2BB4896D9A84DC1E9EAB100E0CD45360645C1A75` |
| 20260813000002 | `20260813000002_internal_llm_trail.sql` | `ABFADC5DD7A3F4005CC994602ACEF39CB41857BC6C0B7757D15989D70FEB29F9` |
| 20260813000003 | `20260813000003_sender_preflight.sql` | `4057DDC1DA472E07FAB4DE6C597A7E7A3CA0017D2FC1D4F087271B47550444B1` |
| 20260813000004 | `20260813000004_contacts_rls_for_runtime.sql` | `AE1C697A58D61B7271D2B36D0A4D74CE12BBFB8A4B91F6B12FD5AE614073593A` |
| 20260813000005 | `20260813000005_commercial_moments_and_incentives.sql` | `EAEA2F7EE6729D2C91BAEA4E66398F64DC2222E1092D9B2B499E89E2BA349C34` |
| 20260813000006 | `20260813000006_store_credentials_port.sql` | `6ED8DC9115B25A8F09E634905B087A257D360A10ACF3A3EB6C720D56458661D6` |
| 20260813000007 | `20260813000007_moment_template_preflight.sql` | `66A59AA55FCFDFB4D86AA0B708371D2851537D5090E03BB37B6A892CBEE35F24` |
| 20260813000008 | `20260813000008_emit_ai_mission_job.sql` | `9A7303770DBFA79B5FF3938F7D633BAD80A667695C12DE72F5C001B49F67D14E` |
| 20260813000009 | `20260813000009_activate_ai_mission.sql` | `D9187BCA9658B7336EF16D3B6C590A4368E09A5B1183D35F98C2F4A2C9B3193F` |
| 20260813000010 | `20260813000010_mission_seeds_v0.sql` | `01324233E3B12E79BA6BB6E5DCF58EAF649623C95C483A40832A5AB39672D9E3` |
| 20260813000011 | `20260813000011_grant_lifecycle.sql` | `15484169C1ACABD3E91DD1256FA47E5B257D03C2B0FF3603128FC3B842FBE71C` |
| 20260813000012 | `20260813000012_otel_carrier.sql` | `E04A84FDE31D94330927E42295F5002A758C38E433EB38ACB2F446A9E3B279A9` |
| 20260813000013 | `20260813000013_activity_compat_views.sql` | `FC0583D7D4C343A7882D4ED593CD729919FCA8E6B427536EADB319FF8757DD97` |
| 20260814000001 | `20260814000001_agent_presentation_adaptation.sql` | `677459FB54534BC76BC2A1E8CE136A2D109B8C2A08E4FEF48A2E7DDDE310B1C7` |
| 20260814000002 | `20260814000002_active_commercial_moments_view.sql` | `646C1EAF5107933298F67AA3295E11838F9C5118DFAD7B0725DFD38ED7A8B189` |
| 20260814000003 | `20260814000003_ai_agent_custom_tools.sql` | `F728F34D9008A271E0C7BEE307B82EB21631AFF784C3CDB54D675FEDB91E4D39` |
| 20260814000004 | `20260814000004_mission_display_name.sql` | `4FBAE42ED1FB445331B83ABF5CE1C647C9C88DC7F0F439F090D7D148AACDB0D9` |
| 20260815000001 | `20260815000001_shopify_orders_mirror_prereq.sql` | `1CC07323FBD8C38C36E5133DBE4DEFCCA1F298EA80F00BC1C35AE5FDB11C1B64` |
| 20260817000001 | `20260817000001_legacy_cron_columns.sql` | `7A517B5EAEC88587C074DCF682AD8A40EF4D7BFB78F030CD324202084B69EC9E` |
| 20260817000002 | `20260817000002_ai_run_steps_runtime.sql` | `37FCBF6B1F8AEDD90166E52A035574E675FC5AE9855DFB69F097EFCC82EE3209` |
| 20260817000003 | `20260817000003_cancel_pending_ai_response.sql` | `FCD5A5EB7BEFB27539D268D12A94FFEE5CE8063351614D4ECCC14228DAC8F8DB` |
| 20260817000004 | `20260817000004_ingest_prefers_plain_text.sql` | `1B940869B08BBCDDA62A6BF41FDA435013719956F34225F9AEF26E6B48C9F3E8` |
| 20260817000005 | `20260817000005_segment_change_cursor.sql` | `888B47CB30597AA96C15F8D4BB99B3C8DCBAE1653B4CBAF050CB042B820F4485` |
| 20260817000006 | `20260817000006_segment_memberships_snapshot.sql` | `0CE4A78C9987EC468F8C451C86A9FB71D26908360F22520608F64A2FB3D4F24F` |
| 20260819000001 | `20260819000001_abandoned_carts_recovered_order_id.sql` | `90E1A6048B9CA5F467C450FA818B5C672A85F6A2CAB7772F1E7BC0F0802B7FBF` |
| 20260819000002 | `20260819000002_email_sends_tracking_columns.sql` | `16ACEAD0346D2E38BCDF50F74F4131B96EF7342233950D6814F6C54AC3C90B8B` |
| 20260828000001 | `20260828000001_embedding_model_provenance.sql` | `72EA4D0A555927501C79697C2212E65C69C619F2FD7C2E3A58A44358EFF62177` |
| 20260828000002 | `20260828000002_ai_agent_chunks_indexes.sql` | `D33CF8BF4B3F138280DE44EB674DFB2E201242271D11EE59437DB7D0EB56E1AA` |
| 20260828000003 | `20260828000003_coalesce_by_rollout.sql` | `FB7F8A3723975B03CD6A66381631A12BCC3FDC3B4A7B727B6871E9E83CDAEA8B` |
| 20260828000004 | `20260828000004_coalesce_separate_rollout_budgets.sql` | `05346E8E88960EC1D6A546AE13AEF2357284E643B7421342C00603414A71EBEE` |
| 20260828000005 | `20260828000005_correlate_outbox_status_error.sql` | `959491B9EFA539FAE336A6D6F97C1EAF081EF27A7D725044416D7E27E66369FB` |
| 20260828000006 | `20260828000006_correlate_outbox_status_from_sent.sql` | `53F72EA3D74F6C68502256D53773914331A72484190B5F8573D892C02CC8A143` |
| 20260901000001 | `20260901000001_active_whatsapp_business_account.sql` | `3C996BCBF9A1BEA41288D6C7B24F8475E043B9AE5F638A0FF6ECF82C1A237258` |
| 20260901000002 | `20260901000002_legacy_conversation_guard_state.sql` | `FFBCC1E908B1BF02C075D8128CEC4E0B19C488FEDBE8F5FE8A53F6A831EDD206` |
| 20260901000003 | `20260901000003_guard_state_ai_enabled.sql` | `B85E087B0951A6C2DA71A951A7CDB71D3053614D13112FE881134B6A77C893BD` |
| 20260901000004 | `20260901000004_send_guard.sql` | `9EF8C62B3D0EDEF971EB2985DB876F984457431E1EBE3802E7162D31F7527A9B` |
| 20260901000005 | `20260901000005_send_guard_half_open.sql` | `5A3014E7B9A98DF34693E8DC699BCBFFCCBC7E5109F413FE24D423D457EF150F` |
| 20260901000006 | `20260901000006_send_guard_throttle_rearm.sql` | `255A7DB9D01ACED9F6F0038294613DBE35B95557466D42F48E9A74F2F9637126` |
| 20260901000007 | `20260901000007_send_guard_error_day_rolls.sql` | `B0CCE14FB22C317809A6498B747A1CE94B9B083CF348AA2928507F0F993D88F8` |
| 20260901000008 | `20260901000008_send_guard_closed_keeps_successes.sql` | `06B8F22F822DC6B55E19E35AC3A6EA5C6717D6F1B927023D93B8B543055B1D77` |
| 20260901000009 | `20260901000009_whatsapp_template_shape.sql` | `BFDAC92B03173B12A420C8266F9B1BA203E7E98DFB278E0BFC324301801B0558` |
| 20260902000001 | `20260902000001_ai_usage_logs_bridge.sql` | `D6E15B9B9301AB33401C44300DC1D34D01EDF18466172BCE915E9F4292D5C98A` |
| 20260902000002 | `20260902000002_claim_outbox_last_inbound_wamid.sql` | `7827B46AF363DBF9FDB03E23A0FF5CCC4035548BBA1326240A7DADACE68185FA` |
| 20260902000003 | `20260902000003_ai_usage_logs_cost_usd_unknown.sql` | `F6BDC615F6D5EF3EEB5ED724AD6E7EB87B1AC2D97B5976F0416C8F9FE2BD169C` |
| 20260902000004 | `20260902000004_search_agent_knowledge_org_scoped.sql` | `92FD7FB42CE037F33630B102DA1BA2CA21C15671552FDB2C23F421952523AA70` |
| 20260903000001 | `20260903000001_incentive_grants_expiry_sweep_idx.sql` | `AB221BE01BBF514FB5C991B71904459A65D83C01404D7417F34DB8738CD342CE` |
| 20260903000002 | `20260903000002_get_active_agent_for_conversation_versioned.sql` | `EA9FCAA1F2B86B682074CA9F698ADFAB7FC35679A8E34E3AC18A1986B4DA9F40` |
| 20260903000003 | `20260903000003_shopify_orders_org_email_lower_idx.sql` | `2DCDA6D9E882D1B9CDD759338F2BC584B57E9A4F04B44F6997B0E46A6BB8B174` |
| 20260903000004 | `20260903000004_whatsapp_cloud_conversations_org_wa_id_idx.sql` | `3D60F6270DCA298ADC347A802125A05CA3FAAC1737CF28562963D169C099933E` |
| 20260904000001 | `20260904000001_attribution_v2_single_credit.sql` | `E04227DF3B9216D1AB7FC9617AC131D864E337AC9B9A4E1041947732333827E9` |
| 20260904120000 | `20260904120000_recipient_timezone_scheduling.sql` | `4FDDD150854DFDA54415370665D6A46284E4F5D50970D3B25119E94069D1F1E5` |
| 20260904170000 | `20260904170000_merge_tag_mappings.sql` | `0A1CE197D768CD287C828A5BE7A59D612D244C80821930905950568FA9D269DB` |
| 20260904200000 | `20260904200000_product_feeds_store_id.sql` | `80207A714C3699818E04C1CB7900516034E0F9F26D0CFEA702E60F6B4940109B` |
| 20260904210000 | `20260904210000_products_feed_visibility.sql` | `3DC1D77F511ED89841AAC047DA8A8A73508BE3AFD7496D99FF0AEB21602B426D` |
| 20260904220000 | `20260904220000_shared_sender_addresses.sql` | `2635A256E54C4FD4D21B00388B87F71BE746A2C3B01BD082D27CE0E57ACB15A8` |
| 20260905090000 | `20260905090000_settings_redesign_security.sql` | `4664C7CA3B19FBFD1CA99685A7D794596FA9D04BD402CF677A1C848CE991BC53` |
| 20260905091000 | `20260905091000_invited_members_join_org.sql` | `BA99E923BDDAAD34163EDF368E8D7CBA64CBA2157680755E384496EB640F03BC` |
| 20260905093000 | `20260905093000_lgpd_retention_policies_api_keys.sql` | `A3560F55289BB353CD343B18EAD19939F9434DBD94D2BF53097AC45771896C84` |
| 20260905185030 | `20260905185030_filter_search_agent_knowledge_embedding_space.sql` | `569CEB45CFF08DC0E46A5DCA7DE75B623E1BA4746ED3F82B449BF125819984B7` |
| 20260905194328 | `20260905194328_require_runtime_for_inbound_turn.sql` | `627F07002B4D0BC43E292018D5D7DE0B58A5DBAF3A8114BF60A4F8EDA9500DF3` |
| 20260905230148 | `20260905230148_claim_outbox_wamid_channel.sql` | `A612773D80CB98839BCAF579DFC7DD1D1A5730DD3413230FF2B9CC25ECD0FCE0` |
| 20260906120000 | `20260906120000_product_feeds_excluded_products.sql` | `F2C8DFF3F32CC84DDFD060B7E15596E187F3F4B4ACD1B50065EC9D651F43C61A` |
| 20260907090000 | `20260907090000_email_universal_usage.sql` | `F95BF6C65281FBD74933E49A56A7067547B116F17EE50A109900C65E4EEA9D02` |
| 20260908090000 | `20260908090000_email_send_engagement_counters.sql` | `700B7111E5B8C856F193AA718D10AD55A462BAA294A851B919AC701044A05C10` |
| 20260908100000 | `20260908100000_email_metrics_aggregates.sql` | `499C441D073B21DD3882E7D25947E54741D95195169834FCB56D9FBAEA6380BE` |
| 20260909100000 | `20260909100000_enable_rls_org_tables.sql` | `DA1406357BEBC4E06608537DF707E95A9D94ABC0B579A28DEABF2027666D1B7B` |
| 20260909110000 | `20260909110000_enable_rls_child_tables.sql` | `968141300E00CE42014B67F2208829C2B1629B955F778C05230D9C5DC88647AE` |
| 20260909120000 | `20260909120000_views_security_invoker.sql` | `A576E44F6AF7ECB379060D3FEBCA518FF685948B17551A578301243846242368` |
| 20260909130000 | `20260909130000_revoke_definer_functions.sql` | `A44015515E74CC61800268D2D11E390D1980CE2010BF9CBA14ED75B8FA39E421` |
| 20260909140000 | `20260909140000_definer_search_path.sql` | `1DCBB5819031C770A3C88B49A40378F6FA6BF7D01EDE0FCAD544C150AF89DCB6` |
| 20260909230000 | `20260909230000_app_baseline_forward_compat.sql` | `711231769DE7F3FEAD0BA9B33C74172FC68BDC82CBB0E102E595983B63538656` |
| 20260910000000 | `20260910000000_auth_user_created_trigger.sql` | `D1E1026B4C4153E569DBC048D102A381FB871E1E0404B0F6EF3B827F11CEA97E` |

## Upgrade manifest

`PrepareUpgrade` creates the approved old history through `20260909140000_definer_search_path.sql`, excluding exactly `20260812000005_app_baseline_prereqs.sql`. It applies the fixed legacy fixture, then `Upgrade` may append only these two reviewed files, in order:

1. `20260909230000_app_baseline_forward_compat.sql` (`711231769DE7F3FEAD0BA9B33C74172FC68BDC82CBB0E102E595983B63538656`)
2. `20260910000000_auth_user_created_trigger.sql` (`D1E1026B4C4153E569DBC048D102A381FB871E1E0404B0F6EF3B827F11CEA97E`)

The sealed `Upgrade` action owns this projection and history check. Do not pass a migration limit, SQL path, exclusion, or caller-selected mapping. The upgraded history must be the old prefix plus exactly this suffix.

## CLI, markers, manifests, and evidence files

The pinned Supabase CLI is `2.111.0`; the executor verifies it before local actions. Ports are fixed at `45320` (shadow), `45321` (API), and `45322` (database). Each nonce is a direct child of `.superpowers/sdd/auditoria-ia-disposable/`.

| path under `$runPath` | produced meaning |
|---|---|
| `gates.json` | action state, stage, commit, scope, command argv, exit codes, RLS count, and structured failure |
| `manifest.json` | ordered `{filename, sha256, version}` rows actually copied/applied |
| `manifest.prospective.json` | sealed Upgrade projection before applying the suffix |
| `upgrade-baseline.json` | PrepareUpgrade marker containing the complete checkout inventory with only the fresh bootstrap excluded |
| `identity.json` | verified project/container/image/volume/port/system identifier and disposable sentinel |
| `volumes-before.json` | volume names captured immediately before start |
| `events.jsonl` | sanitized stage, exit code, SQLSTATE, and migration-version observations; never raw subprocess output |
| `artifacts/db.xml`, `artifacts/rls.xml`, `artifacts/pipeline.xml`, `artifacts/focal.xml` | sanitized non-empty JUnit summaries; only files for executed suites are present |
| `unproven.json` | observed project/container IDs when identity was not proven; it never authorizes cleanup |

## Exact local fresh proof

Run each action sequentially and stop at the first non-zero exit. `$freshNonce` is a new value for every attempt; never reuse a failed nonce.

```powershell
$freshNonce = [guid]::NewGuid().ToString('N')
$freshRun = Join-Path $PWD ".superpowers/sdd/auditoria-ia-disposable/$freshNonce"
& ./scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $freshRun
if ($LASTEXITCODE -ne 0) { throw "Prepare failed with exit code $LASTEXITCODE" }
& ./scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $freshRun
if ($LASTEXITCODE -ne 0) { throw "Replay failed with exit code $LASTEXITCODE" }
& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $freshRun
if ($LASTEXITCODE -ne 0) { throw "Test failed with exit code $LASTEXITCODE" }
& ./scripts/test-disposable-db.ps1 -Action Stop -RunDirectory $freshRun
if ($LASTEXITCODE -ne 0) { throw "Stop failed with exit code $LASTEXITCODE" }
```

An empty `TestTargets` value selects the executor's full serial proof: RLS collection, database tests, RLS tests, then pipeline tests. `Test` also proves cleanup in its failure path; the explicit `Stop` proves idempotence.

## Exact local upgrade proof

The upgrade lane is sealed: `PrepareUpgrade` builds the legacy prefix and marker, and `Upgrade` selects the two-file suffix above. Do not add `MigrationThrough`.

```powershell
$upgradeNonce = [guid]::NewGuid().ToString('N')
$upgradeRun = Join-Path $PWD ".superpowers/sdd/auditoria-ia-disposable/$upgradeNonce"
& ./scripts/test-disposable-db.ps1 -Action PrepareUpgrade -RunDirectory $upgradeRun
if ($LASTEXITCODE -ne 0) { throw "PrepareUpgrade failed with exit code $LASTEXITCODE" }
& ./scripts/test-disposable-db.ps1 -Action Upgrade -RunDirectory $upgradeRun
if ($LASTEXITCODE -ne 0) { throw "Upgrade failed with exit code $LASTEXITCODE" }
& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $upgradeRun -TestTargets @(
  'tests/db/test_app_baseline_schema.py',
  'tests/db/app_baseline_upgrade_check.py',
  'tests/db/test_auth_user_created_trigger.py'
)
if ($LASTEXITCODE -ne 0) { throw "Test failed with exit code $LASTEXITCODE" }
& ./scripts/test-disposable-db.ps1 -Action Stop -RunDirectory $upgradeRun
if ($LASTEXITCODE -ne 0) { throw "Stop failed with exit code $LASTEXITCODE" }
```

`TestTargets` is transported as a native PowerShell array with `&`. Never nest `pwsh -File` to pass that array; the launcher accepts the array directly and sends it to the executor as JSON.

## Forbidden operations and arguments

The following are prohibited in this local proof and are not workarounds: `--include-all`, migration `repair`, `--linked`, `--db-url`, caller-selected SQL or migration paths, caller-selected exclusions, remote inventory, remote dry-run, remote push, production migration, production deploy, seed data, reset, or down migration. A remote or production action requires a new explicit authorization and a separately reviewed procedure.

## Expected evidence

- Every executed suite is non-empty with zero skips, failures, errors, and warning-masked failures.
- `manifest.json` hashes match this inventory, and database migration history matches the exact manifest in order; the upgrade history excludes the bootstrap and ends with only the two approved suffix versions.
- Fresh and upgraded `scoped_catalog(admin)` equal the shared `expected_scoped_catalog()`, including columns, constraints, indexes, RLS/policies, functions/triggers, enum order, and ACLs.
- Upgrade preservation rows retain primary keys and values across all 11 scoped relations; the legacy `email_sends` pending row remains pending while the new default is queued.
- Auth tests prove normal signup owner provisioning, invited signup membership consumption without an extra organization/pipeline, and duplicate/noncanonical trigger rejection without partial change.
- `gates.json` reaches `ready` before tests and `stopped` after cleanup; `identity.json` remains consistent; there are no project-labeled containers, networks, or volumes, no recorded IDs remain, all three ports are free, and the executor lock is absent.

## Abort procedure

Abort immediately and preserve the nonce evidence if any schema or data is unknown, an object is incompatible, identity cannot be proven/readopted, the tracked tree is dirty, a migration is unexpected, an action skips/fails/errors, a test suite is empty or non-green, catalog equality fails, a row changes, or cleanup is uncertain. Record the stage, exit code, `gates.json`, `events.jsonl`, manifests, identity/unproven record, and sanitized JUnit artifact paths. Do not infer ownership, stop unrelated resources, alter history, retry with new flags, or reuse the nonce; escalate for review.

## Future authorized promotion checklist

This section describes a future authorized operation; it is not an instruction to execute it now.

1. Obtain a new explicit authorization naming the target and allowed scope; review the clean commit and this runbook.
2. First inventory remote migration versions without altering history; sanitize the output.
3. In that separately authorized session, run `supabase db push --dry-run` without `--include-all` and expect exactly `20260909230000_app_baseline_forward_compat.sql` and `20260910000000_auth_user_created_trigger.sql`.
4. Block promotion on any bootstrap/retroactive file, extra migration, destructive statement, history divergence, or need for migration `repair`; also block on any catalog, preservation, identity, or cleanup concern from the local proof.
5. A human inspects the sanitized dry-run and grants a new explicit production authorization before any real push or deploy. This document itself never grants that authorization.
