# Auditoria IA — Onda 0: baseline confiável Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estabelecer catálogo revalidado e execução DB/RLS/pipeline sobre Supabase comprovadamente descartável.

**Architecture:** Reusar as suítes e o stream de migrations. Um único guardião prepara a cópia com nonce e prova a identidade do Postgres antes de liberar qualquer fixture destrutiva; o CI consome o mesmo executor.

**Tech Stack:** Next.js 14, TypeScript, Vitest, pnpm 10, Python >=3.13, psycopg 3, pytest, Supabase CLI 2.111.0, PostgreSQL 17, PowerShell 7 e Docker.

**Spec:** `docs/superpowers/specs/2026-09-08-auditoria-motor-ia-sdd-program-design.md`

## Global Constraints

- A branch principal e suas alterações locais permanecem intocadas.
- Nenhum teste destrutivo aponta para banco existente, pooler ou produção.
- Nenhum subagente pode fazer push, merge, deploy ou migration remota.
- Nunca há dois implementadores escrevendo no mesmo worktree ao mesmo tempo.
- Toda lógica não trivial recebe ao menos um teste de regressão executável.
- Decisões de produto antecedem implementação.
- O menor diff responsável vence; código especulativo não será criado.
- idempotência de negócio antes do dreno da DLQ;
- detecção e reconciliação de cupons duplicados antes do `UNIQUE`;
- multi-WABA antes de promover organização com várias contas;
- item 92 aberto até existir janela real de pelo menos oito dias.
- Push, merge, migration remota e deploy são etapas separadas e exigem autorização explícita do usuário depois do relatório final.

---

Controlador: `gpt-6-astra/high`. Cada implementador/revisor/verificador é fresco, `fork_turns: "none"`, modelo/esforço explícitos e sem filhos. Luna = `gpt-5.6-luna/medium`; Terra = `gpt-5.6-terra/high`; Sol = `gpt-5.6-sol/high`; Astra = `gpt-6-astra/high`. Revisão final: Astra `xhigh`. A matriz por tarefa prevalece sobre o default do SDD. Critical/Important bloqueia; revisão exige `Spec PASS` e `Quality APPROVED`. Registrar BASE, SHA, RED/GREEN e rulings no ledger da onda. Cada checkbox abaixo é uma ação de 2–5 minutos; comandos longos iniciam em um passo e têm resultado coletado no passo seguinte, com atualizações durante a espera. Nenhum comando deste documento foi executado durante o planejamento.

## Mapa de arquivos e dependências

| Arquivo | Responsabilidade |
|---|---|
| `package.json`, `.github/workflows/app.yml` | Builds pnpm explicitamente permitidos e gatilhos |
| `.github/workflows/runtime.yml` | Gates bloqueantes e executor descartável |
| `runtime/tests/support/disposable_db.py` (novo) | DSN local estrita e prova da sentinela/identidade |
| `runtime/tests/support/database.py` | Única entrada das fixtures DB e pipeline |
| `scripts/test-disposable-db.ps1` (novo) | Prepare, Replay, Test e Stop do projeto com nonce |
| `supabase/migrations/20260812000005_app_baseline_prereqs.sql` (novo, condicionado a W0-T3) | DDL canônico após pré-requisitos de agentes e antes da primeira dependência |
| `supabase/migrations/20260910000000_auth_user_created_trigger.sql` (novo) | Trigger real de cadastro, ausente do stream atual |
| `docs/superpowers/specs/2026-09-08-auditoria-ia-baseline-schema.md` (novo) | Inventário de objetos/colunas e decisões sobre fontes divergentes |
| `docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md` | Evidência das três caixas já resolvidas |

Ordem: T1 → T2 → T3 → T4. Este documento não é um plano integralmente pronto para implementação: T2 fixa contratos de um executor de alto risco, mas os trechos abaixo não compõem um script autocontido; exige o plano filho E0 antes de qualquer implementação/operação desse executor. T3 depende das decisões B0/B1 e de um plano filho de DDL, pois não existe fonte única de schema do app. Não declarar replay verde nem liberar T4 enquanto os dois gates de planos filhos estiverem abertos.

### Task 1: W0-T1 — inventário e inconsistências do CI

**Papéis:** implementador Luna; revisor Terra; verificador Terra.

**Files:**
- Modify: `package.json`, `.github/workflows/app.yml`, `.github/workflows/runtime.yml`, `docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md`
- Create: `src/tests/audit-baseline-config.test.ts`
- Test: `src/tests/reports-utils.test.ts`, `runtime/tests/db/test_startup_rls_guard.py`
- Read: `.gitignore`, `src/lib/reports/utils.ts::formatDate`, `runtime/src/agents_runtime/agent_core/responder.py`, `runtime/src/agents_runtime/agent_core/toucher.py`

**Interfaces:**
- Consumes: scripts existentes `pnpm test`, `pnpm typecheck`; guardas `assert_rls_enforced` já presentes.
- Produces: `package.json.pnpm.onlyBuiltDependencies: string[]` igual a `["esbuild", "unrs-resolver"]`; catálogo com evidência, sem declarar DB aprovado antes de T3.

- [ ] **Step 1: Escrever RED do contrato pnpm**

```ts
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('permite somente os builds nativos necessários aos testes', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  expect(pkg.pnpm?.onlyBuiltDependencies).toEqual(['esbuild', 'unrs-resolver'])
})
```

- [ ] **Step 2: Executar RED**

Run: `pnpm exec vitest run src/tests/audit-baseline-config.test.ts`.
Expected: FAIL, `undefined` recebido no lugar da lista. Se o próprio deps-check impedir o comando, registrar essa falha original; não usar bypass como evidência GREEN.

- [ ] **Step 3: Implementar política explícita no package.json**

```json
"pnpm": {
  "onlyBuiltDependencies": ["esbuild", "unrs-resolver"]
}
```

Substituir o cabeçalho obsoleto de runtime.yml por:
```yaml
# Gates bloqueantes: lint, boundaries, tests-unit e tests-db (DB/RLS/pipeline).
# O banco de testes precisa de identidade descartável comprovada.
```

- [ ] **Step 4: Revalidar as três caixas obsoletas**

Run: `pnpm exec vitest run src/tests/reports-utils.test.ts src/tests/audit-baseline-config.test.ts` com `TZ=America/Sao_Paulo` no processo do comando. Run somente leitura: `git check-ignore supabase/.branches/probe supabase/.temp/probe`; `rg -n "assert_rls_enforced" runtime/src/agents_runtime/agent_core/responder.py runtime/src/agents_runtime/agent_core/toucher.py`.
Expected: PASS de datas, dois caminhos ignorados e duas chamadas de guarda. A prova dinâmica RLS fica referenciada a T3; não reabrir código já corrigido.

- [ ] **Step 5: Registrar o resultado verificável e GREEN**

Texto do checklist, junto a cada caixa correspondente:
```markdown
Revalidado na Onda 0: comportamento de data em America/Sao_Paulo e ignores confirmados; guardas diretas presentes. Prova dinâmica de RLS vinculada ao gate descartável W0-T3.
```
Run: `pnpm install --frozen-lockfile` e depois `pnpm test`. Expected: entrada pelo script oficial sem bloqueio de builds.

- [ ] **Step 6: Commit e revisão**

```powershell
git add package.json .github/workflows/runtime.yml src/tests/audit-baseline-config.test.ts docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md
git commit -m "test: reconcile audit baseline and pnpm build policy"
```

**Gate:** revisão Terra; datas e script oficial verdes. **Rollback:** `git revert` do SHA desta tarefa; não alterar política global da máquina.

### Task 2: W0-T2 — Supabase descartável e guardas de identidade

**Papéis:** implementador Sol; revisor Astra; guardião/verificador DB Astra, sozinho.

**Gate E0 — plano filho presente e obrigatório antes do dispatch:** `docs/superpowers/plans/2026-09-08-auditoria-ia-disposable-db-executor.md` cita esta onda e a spec do programa e é a autoridade para o código completo do executor. Os snippets desta tarefa são requisitos/contratos para esse plano filho, não implementação completa nem autorização de executar Prepare/Replay/Upgrade/Test/Stop. A implementação e as provas executáveis do E0 ainda estão pendentes; o pai não deve despachar esta tarefa como transcrição pronta. Nenhuma operação Docker/DB da W0–W7 usa o executor antes de o filho ser implementado, testado e aprovado por Astra.

O plano filho deve conter o código completo de `scripts/test-disposable-db.ps1` e de todos os helpers Python invocados, sem completar comportamento por interpretação. Contratos que o filho precisa materializar antes de seu aceite:

| Unidade autocontida exigida | Resultado verificável |
|---|---|
| Dispatch único `switch ($Action)` | Cinco branches Prepare/Replay/Upgrade/Test/Stop, rejeição de transição inválida e códigos de saída preservados |
| Edição TOML fechada | Parse das seções exatas, uma ocorrência por chave esperada, substituição exclusiva de project_id/portas/migrations.enabled, seed/storage desativados; recusar config ambígua |
| Prepare e manifesto | Nonce/diretório novo, portas livres, inventário de volumes anterior, cópias permitidas e sha256/version exatos, nenhuma leitura de env/seed/dump |
| Prova de identidade completa | docker inspect com label/container/image/volume/portas, system_identifier por containerId e loopback, sentinela independente, checks antes de qualquer reset ou fixture |
| Replay | Manifesto/hashes conferidos, reset local sem seed, histórico aplicado igual ao manifesto, criação e leitura da sentinela pelo caminho aprovado |
| Upgrade prospectivo | Histórico antigo+hashes imutáveis, somente sufixo novo, manifesto prospectivo separado; em falha não promover esse manifesto, registrar estágio/exit code e parar o projeto aprovado; nenhuma tentativa de rollback remoto/repair |
| Test focal/completo | Validação de TestTargets via argv, ambiente temporário restaurado, RLS coletado e contado no gate completo, subprocessos sequenciais e nenhum teste após uma falha |
| Escrita de gates.json | Schema explícito `commit`, `scope`, `state`, `commands`, `exitCodes`, `collectedRls`, `stage`, `failure`; gravar também em falha sem segredo/DSN, atualizar estado stopped somente após Stop confirmado |
| Cleanup | Revalidar identidade antes do Stop, não operar em projeto sem prova, aguardar processos; Stop no finally de Test e falhas parciais sem limpeza global |

O reviewer do filho exige testes puros do dispatch, edição TOML, conjunto de migrations, manifesto prospectivo e serialização de gates, com CLI/Docker falsos, mais um teste negativo por guarda de identidade. Só o guardião, depois desse review, executa o teste real descartável e repassa o contrato a W0-T3/T4. A aprovação do desenho do programa não substitui a implementação e as provas executáveis pendentes do E0. Registrar E0 como dependência de engenharia a concluir, não como decisão de produto nem pedido de nova permissão do usuário.

**Files:**
- Create: `runtime/tests/support/disposable_db.py`, `runtime/tests/unit/test_disposable_db_guard.py`, `scripts/test-disposable-db.ps1`
- Read/contract source: `docs/superpowers/plans/2026-09-08-auditoria-ia-disposable-db-executor.md` (plano filho E0 presente e obrigatório; autoridade do código completo; implementação e provas pendentes)
- Modify: `runtime/tests/support/database.py::dsn_from_env`
- Read: `runtime/tests/db/conftest.py::dsn`, `runtime/tests/pipeline/conftest.py::dsn`, `supabase/config.toml`

**Interfaces:**
- Consumes: `psycopg.conninfo.conninfo_to_dict(conninfo: str) -> dict[str, str]`.
- Produces: `validate_dsn(dsn: str) -> dict[str, str]`; `assert_database_identity(conn: psycopg.Connection, *, system_identifier: str, sentinel: str) -> None`.
- Produces executor: chamadas sem array usam `pwsh -File scripts/test-disposable-db.ps1 -Action Prepare|Replay|Upgrade|Test|Stop -RunDirectory <absolute path>`; `-MigrationThrough <14-digit version>` é opcional somente em Prepare/Upgrade. `TestTargets` é opcional somente em Test e, com array, deve ser chamado dentro de uma sessão PowerShell 7: `& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $runPath -TestTargets @('a','b')`; `pwsh -File` não transporta esse array. TestTargets vazio executa os três gates; lista não vazia executa um subprocesso focal com todos os nodeids informados. Não aceita opções pytest arbitrárias nem shell text.
- Produces artefatos em `.superpowers/sdd/auditoria-ia-disposable/<nonce>/`: `manifest.json` = array de `{filename,sha256,version}`, com `version` legada preservada em 8 ou 14 dígitos; `identity.json` = `{projectId,containerId,imageId,volumeName,port,systemIdentifier,sentinel}`; `gates.json` = `{commit,commands,exitCodes,collectedRls}`. Nenhum inclui senha/DSN.
- Consumes nas fixtures: `SUPABASE_DB_URL`, `WORDER_TEST_DB_SYSTEM_IDENTIFIER`, `WORDER_TEST_DB_SENTINEL`; só o executor define essas variáveis nos filhos.

- [ ] **Step 1: Escrever teste RED sem conectar**

```python
import pytest
from tests.support.disposable_db import validate_dsn

@pytest.mark.parametrize("dsn", [
    "postgresql://postgres:postgres@db.example.test:55322/postgres",
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    "host=127.0.0.1 hostaddr=10.0.0.1 port=55322 dbname=postgres",
    "host=127.0.0.1,db.example.test port=55322 dbname=postgres",
    "service=production",
])
def test_rejects_unproven_target(dsn):
    with pytest.raises(ValueError):
        validate_dsn(dsn)

def test_accepts_explicit_disposable_loopback():
    assert validate_dsn(
        "postgresql://postgres:postgres@127.0.0.1:55322/postgres"
    )["port"] == "55322"
```

- [ ] **Step 2: Executar RED**

Run: `uv run --directory runtime pytest tests/unit/test_disposable_db_guard.py -q`.
Expected: FAIL `ModuleNotFoundError: tests.support.disposable_db`.

- [ ] **Step 3: Implementar validação mínima**

```python
from psycopg.conninfo import conninfo_to_dict

def validate_dsn(dsn: str) -> dict[str, str]:
    values = conninfo_to_dict(dsn)
    allowed = {"host", "port", "dbname", "user", "password", "connect_timeout"}
    if set(values) - allowed:
        raise ValueError("unsupported test DSN parameters")
    if values.get("host") != "127.0.0.1":
        raise ValueError("test database must use explicit loopback")
    if values.get("port") != "55322" or values.get("dbname") != "postgres":
        raise ValueError("test database must use the disposable port and database")
    return values

def assert_database_identity(conn, *, system_identifier: str, sentinel: str) -> None:
    actual = conn.execute(
        "select system_identifier::text from pg_control_system()"
    ).fetchone()[0]
    if actual != system_identifier:
        raise RuntimeError("test database identity mismatch")
    row = conn.execute("select token from testing.disposable_identity").fetchone()
    if row != (sentinel,):
        raise RuntimeError("test database sentinel mismatch")
```

- [ ] **Step 4: Fazer a entrada das fixtures falhar fechada**

Substituir o fallback `DEFAULT_DSN` de `dsn_from_env` pelo corpo abaixo; importar os dois helpers:
```python
dsn = os.environ["SUPABASE_DB_URL"]
validate_dsn(dsn)
system_identifier = os.environ["WORDER_TEST_DB_SYSTEM_IDENTIFIER"]
sentinel = os.environ["WORDER_TEST_DB_SENTINEL"]
with psycopg.connect(dsn, connect_timeout=3) as conn:
    assert_database_identity(
        conn, system_identifier=system_identifier, sentinel=sentinel
    )
return dsn
```
Essa verificação ocorre antes das fixtures `admin`, `_testing_schema` e qualquer purge/TRUNCATE.

- [ ] **Step 5: Implementar Prepare com diretório e arquivos permitidos**

O script inicia com:
```powershell
param(
  [Parameter(Mandatory)][ValidateSet('Prepare','Replay','Upgrade','Test','Stop')][string]$Action,
  [Parameter(Mandatory)][string]$RunDirectory,
  [string[]]$TestTargets = @(),
  [ValidatePattern('^\d{14}$')][string]$MigrationThrough
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$allowedRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot '.superpowers/sdd/auditoria-ia-disposable'))
$runPath = [IO.Path]::GetFullPath($RunDirectory)
if (-not $runPath.StartsWith($allowedRoot + [IO.Path]::DirectorySeparatorChar)) {
  throw 'RunDirectory must be below the disposable workspace'
}
if ($Action -eq 'Prepare' -and (Test-Path -LiteralPath $runPath)) {
  throw 'Prepare requires a new directory'
}
```
Prepare cria somente `supabase/config.toml` e cópias das migrations, usando `Copy-Item -LiteralPath` individual e hashes SHA256. Se MigrationThrough estiver presente, copia apenas versões menores ou iguais ao valor; excluídas ficam fora do manifesto daquela fase. Config copiada: `project_id="worder-audit-<nonce>"`, API 55321, DB 55322, shadow 55320, `[db.migrations] enabled=false`, seed/storage desativados. Aplicar substituições somente nas seções exatas `[api]`, `[db]`, `[db.migrations]`; recusar ausência/duplicação de seção ou chave. O script não copia seed, `.env`, dumps ou outros arquivos. Recusar portas ocupadas antes do start. Salvar manifesto a partir dos arquivos efetivamente copiados:
```powershell
$manifest = Get-ChildItem -LiteralPath (Join-Path $runPath 'supabase/migrations') -File |
  Sort-Object Name | ForEach-Object {
    [pscustomobject]@{
      filename = $_.Name
      sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
      version = ($_.BaseName -split '_',2)[0]
    }
  }
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runPath 'manifest.json')
```

- [ ] **Step 6: Implementar validação anterior ao Replay**

Iniciar com migrations desativadas: `supabase start --workdir $runPath -x realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`.
Capturar `docker inspect supabase_db_<projectId>`; exigir `com.supabase.cli.project=<projectId>`, imagem Postgres Supabase, um volume ausente no inventário anterior, e mapping exclusivo de 55322. Persistir containerId, imageId e volumeName exatos; recusar ambiguidades. Comparar o resultado de:
```powershell
docker exec $containerId psql -U postgres -d postgres -Atc 'select system_identifier from pg_control_system()'
```
com a consulta psycopg da DSN loopback gerada pelo script. Implementar as verificações do inspect como condições fechadas:
```powershell
$container = @(docker inspect "supabase_db_$projectId" | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0 -or $container.Count -ne 1) { throw 'DB container not unique' }
$db = $container[0]
if ($db.Config.Labels.'com.supabase.cli.project' -cne $projectId) { throw 'project label mismatch' }
if ($db.Config.Image -notmatch '(^|/)supabase/postgres:') { throw 'unexpected DB image' }
$mapping = @($db.NetworkSettings.Ports.'5432/tcp')
if ($mapping.Count -ne 1 -or $mapping[0].HostPort -ne '55322' -or
    $mapping[0].HostIp -notin @('127.0.0.1','0.0.0.0')) { throw 'port mapping mismatch' }
$dataVolumes = @($db.Mounts | Where-Object { $_.Type -eq 'volume' -and $_.Destination -eq '/var/lib/postgresql/data' })
if ($dataVolumes.Count -ne 1 -or $dataVolumes[0].Name -in $volumesBeforeStart) {
  throw 'DB volume is not new'
}
$containerId = $db.Id
$imageId = $db.Image
$volumeName = $dataVolumes[0].Name
```
`$volumesBeforeStart` é o array produzido por `docker volume ls --format '{{.Name}}'` imediatamente antes de start; `$projectId` vem do nonce recém-criado. Uma instalação com montagem em destino diferente ou mapping IPv6 adicional é recusada até revisão do JSON real; não relaxar a guarda automaticamente. `docker exec` consulta o containerId imutável aprovado. Helper novo `runtime/tests/support/disposable_db.py::read_system_identifier(dsn: str) -> str` usa validate_dsn + psycopg.connect(connect_timeout=3) e retorna a mesma consulta `pg_control_system`. O script compara as strings antes de reset; a DSN é criada internamente e passada por variável de ambiente somente ao filho, sem stdout. Falha de conexão/label/volume/identidade aborta antes de qualquer SQL destrutivo.

- [ ] **Step 7: Implementar Replay e sentinela**

Depois da prova do passo anterior, mudar somente `[db.migrations].enabled` na cópia para true e executar `supabase db reset --local --no-seed --workdir $runPath`. Revalidar container/mapping/systemIdentifier; então criar pelo container aprovado:
```sql
create schema if not exists testing;
create table testing.disposable_identity(token text primary key);
revoke all on schema testing from public;
```
Gerar `$sentinel = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()`. Inserir pelo containerId aprovado usando SQL stdin; a gramática do valor é fechada a 64 hex:
```powershell
if ($sentinel -notmatch '^[0-9a-f]{64}$') { throw 'invalid sentinel' }
"insert into testing.disposable_identity(token) values ('$sentinel');" |
  docker exec -i $containerId psql -v ON_ERROR_STOP=1 -U postgres -d postgres
if ($LASTEXITCODE -ne 0) { throw 'sentinel write failed' }
```
Revoke/grants impedem os papéis sob teste de alterar a sentinela. Gravar identity.json só após a comparação de identidade e verificar a mesma sentinela pela DSN com assert_database_identity. Comparar `select version from supabase_migrations.schema_migrations order by version` com todas as versões do manifesto; nenhuma versão ausente, extra ou duplicada é aceita. Revalidar também SHA256 de cada migration copiada contra manifest.json antes do reset e antes de cada subprocesso Test. Versão aplicada não substitui prova do conteúdo do arquivo.

- [ ] **Step 7a: Upgrade sequencial sem reset**

Upgrade exige projeto ativo, identidade/sentinela/hashes válidos e histórico aplicado exatamente igual ao manifesto atual. Rejeitar MigrationThrough menor que a maior versão já aplicada. Copiar do checkout apenas migrations ainda não presentes, com versão maior que a maior aplicada e menor/igual MigrationThrough; qualquer arquivo existente com hash diferente ou versão faltante anterior à maior aplicada aborta. Escrever manifesto prospectivo separado antes da ação; não substituir manifesto aprovado se a aplicação falhar.
```powershell
$newFiles = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'supabase/migrations') -File |
  Where-Object {
    $version = ($_.BaseName -split '_',2)[0]
    $version -gt $lastApplied -and (!$MigrationThrough -or $version -le $MigrationThrough)
  } | Sort-Object Name
foreach ($migration in $newFiles) {
  Copy-Item -LiteralPath $migration.FullName -Destination (Join-Path $runPath "supabase/migrations/$($migration.Name)")
}
& supabase migration up --local --workdir $runPath
if ($LASTEXITCODE -ne 0) { throw 'sequential migration upgrade failed' }
```
`$lastApplied` vem do histórico validado no Postgres, não de argumento do operador. O preflight anterior também compara o conjunto inteiro do checkout até MigrationThrough para detectar lacunas antigas, incluindo baseline fora de ordem; não usar include-all automaticamente. Depois da aplicação, reafirmar system_identifier/sentinela e igualdade entre histórico e manifesto prospectivo, então promovê-lo. Upgrade não executa reset nem Stop quando passa; falha para a sequência e descarta apenas o projeto comprovado. Reaplicação com nenhum novo arquivo é no-op comprovado.

- [ ] **Step 8: GREEN e regressões negativas da identidade**

Run: `uv run --directory runtime pytest tests/unit/test_disposable_db_guard.py -q`; expected PASS. Acrescentar caso de conn falso com `fetchone()` retornando identidade/sentinela trocadas:
```python
from unittest.mock import Mock
from tests.support.disposable_db import assert_database_identity

def test_rejects_wrong_identity_before_sentinel_read():
    conn = Mock()
    conn.execute.return_value.fetchone.return_value = ("wrong",)
    with pytest.raises(RuntimeError, match="identity mismatch"):
        assert_database_identity(conn, system_identifier="expected", sentinel="nonce")
    assert conn.execute.call_count == 1
```
Não executar DB neste pacote antes da revisão do executor. Prepare pode comprovar o ambiente; Replay deve registrar a falha conhecida de schema que alimenta T3.

- [ ] **Step 9: Implementar Stop estritamente escopado e commit**

Stop relê identity.json e docker inspect, compara containerId/projectId/volumeName e executa apenas `supabase stop --no-backup --workdir $runPath`. Nunca `stop --all`, prune ou delete recursivo. Test sempre chama Stop no finally, inclusive em falha, e marca `state=stopped` em gates.json; aquele runPath não pode mais receber Test/Replay/Upgrade. Cada ciclo RED ou GREEN cria nonce/runPath novos. Prepare e Replay mantêm o projeto ativo para a próxima ação; seus próprios erros executam Stop do projeto de identidade já aprovada. Se a identidade não chegou a ser provada, registrar o container criado e interromper sem tentar limpeza inferida.

Validar e invocar o filtro focal por argv, não por concatenação de shell:
```powershell
foreach ($target in $TestTargets) {
  $testPath = ($target -split '::',2)[0]
  if ($testPath -notmatch '^tests/(unit|db|pipeline)/[A-Za-z0-9_/-]+\.py$' -or
      $testPath.Contains('..') -or $target.Contains("`n")) { throw 'invalid test target' }
  $resolvedTest = (Resolve-Path -LiteralPath (Join-Path $repoRoot "runtime/$testPath")).Path
  if (-not $resolvedTest.StartsWith((Join-Path $repoRoot 'runtime/tests') + [IO.Path]::DirectorySeparatorChar)) {
    throw 'test target escaped test root'
  }
}
if ($TestTargets.Count -gt 0) {
  & uv run --directory (Join-Path $repoRoot 'runtime') pytest @TestTargets -q
  $testExit = $LASTEXITCODE
  if ($testExit -ne 0) { throw "focal pytest failed ($testExit)" }
}
```
Essa invocação ocorre somente após identidade/sentinela/hashes verificados e envs temporárias definidas. Restaurar os valores anteriores das três envs no finally. Gate focal grava `scope=focal`; não pode declarar a onda aprovada nem substituir a execução completa com collectedRls positivo. Persistir logs expurgados; nenhum stdout de `supabase status` com credenciais.
```powershell
git add runtime/tests/support/disposable_db.py runtime/tests/support/database.py runtime/tests/unit/test_disposable_db_guard.py scripts/test-disposable-db.ps1
git commit -m "test: guard disposable database identity before fixtures"
```

**Gate:** Astra revisa script antes da primeira operação destrutiva local; dois caminhos de fixture usam a guarda; sem env falha antes de conectar. **Rollback:** reverter script/fixtures juntos; Stop só descarta o projeto comprovado. Reverter não autoriza usar o fallback antigo em banco existente.

### Task 3: W0-T3 — reconciliar baseline canônico e executar replay integral

**Papéis:** implementador Sol; revisor Astra; guardião DB Astra.

**Files:**
- Create: `docs/superpowers/specs/2026-09-08-auditoria-ia-baseline-schema.md`, `runtime/tests/db/test_app_baseline_schema.py`
- Create, após decisão de schema e plano filho aprovados: `supabase/migrations/20260812000005_app_baseline_prereqs.sql`
- Create: `supabase/migrations/20260910000000_auth_user_created_trigger.sql`, `runtime/tests/db/test_auth_user_created_trigger.py`
- Modify: `runtime/tests/db/conftest.py::_create_tenant`
- Read: `supabase/migrations/20260812000001_agents_baseline_prereqs.sql`, `supabase/migrations/20260904000001_attribution_v2_single_credit.sql`, `supabase/complete-schema.sql`, `sql/claude-b-migration.sql`, `supabase/migrations-archive/20260401_store_isolation_tracking.sql`

**Interfaces:**
- Consumes: executor/manifesto/identity de T2.
- Produces: stream completo reproduzível antes de `20260819000002_email_sends_tracking_columns.sql`; organizações/profiles continuam compatíveis com factories.
- Produces inventário `object | columns/types/defaults | first consumer | source conflicts | selected contract`, usado por W1 para convites, papéis e e-mail.

**Decisão B0 obrigatória:** existem duas definições incompatíveis de `email_sends`: status `queued`/CHECK em `sql/claude-b-migration.sql:198` versus `pending`/sem CHECK em `migrations-archive/20260401_store_isolation_tracking.sql:19`. Alternativa A (recomendada): contrato atual do app como autoridade, documentando por coluna quais estados/defaults são aceitos pelos produtores e preservando dados legados via compensação; exige inventário completo das referências. Alternativa B: schema capturado de ambiente não produtivo autorizado como referência comparativa, ainda transcrito em migrations revisadas; exige ambiente externo sem dados/segredos e não autoriza dump de produção. O dono escolhe a fonte autoritativa; executor não decide silenciosamente quais escritas passam a falhar. O stream também referencia `whatsapp_sends`, `sms_sends`, `automations`, `email_campaigns`, `whatsapp_campaigns`, `sms_campaigns`, `automation_runs`, `organization_members`, `pipelines` e `pipeline_stages` sem que o baseline de agentes os crie.

Depois da decisão, escrever o plano filho `docs/superpowers/plans/2026-09-08-auditoria-ia-app-schema-baseline.md` com DDL completo, dependências ordenadas, contratos de colunas/FKs/defaults e testes de cada divergência. Seu gate é review Astra + replay protegido; W0-T3 não está completo antes desse plano filho implementado e verificado. Não promover o fragmento de uma única tabela nem afirmar que os oito planos são integralmente executáveis.

**Decisão B1, distinta do bootstrap:** a migration histórica `20260812000005` é necessária antes de dependências num banco vazio, mas fica fora de ordem para um remoto já em `20260909*`. Um bootstrap fresco bem-sucedido não prova upgrade. O CLI compara versões locais/remotas; inserções anteriores ao último remoto podem ser recusadas como migrations fora de ordem e não devem ser ocultadas com `migration repair`. Alternativa A: provar equivalência/preservação num clone descartável sintético do histórico já aplicado e aprovar aplicação explícita das versões faltantes com o modo documentado `--include-all` para o CLI pinado; esse comando remoto não é autorizado aqui. Alternativa B: baseline exclusivo de provisionamento novo, mais uma série compensatória forward-only para bases existentes e runbook de reconciliação de histórico aprovado; os dois manifestos devem ser identificados e comparados por equivalência de schema, nunca apresentados como o mesmo histórico. Nenhuma alternativa foi aprovada para produção. O plano filho precisa escolher A/B e documentar exatamente as versões; sem isso, promoção permanece bloqueada.

- [ ] **Step 1: Escrever RED de presença e contrato essenciais**

```python
import pytest

@pytest.mark.parametrize("table", [
    "email_sends", "whatsapp_sends", "sms_sends", "automations",
    "email_campaigns", "whatsapp_campaigns", "sms_campaigns",
    "automation_runs", "organization_members", "pipelines", "pipeline_stages",
])
def test_app_baseline_relations_exist(admin, table):
    assert admin.execute(
        "select to_regclass(%s)", (f"public.{table}",)
    ).fetchone()[0] is not None
```

- [ ] **Step 2: Observar RED no executor protegido**

Run: `pwsh -File scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $runPath` no diretório previamente preparado e aprovado. Expected: SQLSTATE 42P01 em `email_sends`, na migration `20260904000001_attribution_v2_single_credit.sql`; nenhuma suíte inicia. Guardar erro e versão, sem tentar seed/dump.

- [ ] **Step 3: Registrar dependências e conflitos de fontes**

Run somente leitura:
```powershell
rg -n -i 'create table|alter table|references|create.*view' supabase/migrations
rg -n -i 'create table.*(email_sends|whatsapp_sends|sms_sends|automations|organization_members|pipelines)' supabase sql
```
Preencher o novo inventário com as declarações encontradas e colunas efetivamente lidas por rotas/migrations. Texto obrigatório:
```markdown
# Baseline canônico do app
O replay parte somente de supabase/migrations. Fontes históricas são evidência de contrato, nunca scripts de bootstrap. Divergência em status, nulabilidade, FK ou papel exige decisão registrada antes de introduzir DDL.
```

- [ ] **Step 4: Materializar a decisão de baseline em plano filho**

Registrar B0/B1 no inventário com campos `decision_id`, `selected_alternative`, `approved_by`, `schema_sources`, `fresh_manifest`, `upgrade_manifest` e `preservation_assertions`. Astra revisa o plano filho antes de dispatch. A migration completa cria somente objetos ausentes segundo o contrato aprovado e valida os objetos existentes; `IF NOT EXISTS` não é prova de que uma coluna tem tipo/FK correto. Nome de bootstrap fixado em `20260812000005_app_baseline_prereqs.sql`; compensações forward-only ficam depois do último histórico aplicado e antes das novas migrations desta onda.

- [ ] **Step 4a: RED do trigger real de auth**

Criar teste sem a fixture two_tenants, pois ele precisa provar o próprio mecanismo que a fixture passará a consumir:
```python
import uuid

def test_auth_insert_provisions_profile_and_membership(admin):
    user_id = uuid.uuid4()
    email = f"signup-{user_id}@example.test"
    try:
        admin.execute(
            "insert into auth.users(id,email,raw_user_meta_data) values (%s,%s,'{}')",
            (user_id,email),
        )
        profile = admin.execute(
            "select organization_id,role::text from public.profiles where id=%s",
            (user_id,),
        ).fetchone()
        assert profile is not None
        assert profile[1] == 'owner'
        assert admin.execute(
            "select count(*) from public.organization_members where user_id=%s and organization_id=%s",
            (user_id,profile[0]),
        ).fetchone()[0] == 1
    finally:
        admin.execute(
            "delete from public.organizations where id in (select organization_id from public.profiles where id=%s)",
            (user_id,),
        )
        admin.execute("delete from auth.users where id=%s",(user_id,))
```
Run em ciclo focal W0 com TestTargets=`tests/db/test_auth_user_created_trigger.py`; depois do baseline de tabelas mas antes da migration do trigger. Expected: profile é None, porque `CREATE TRIGGER on_auth_user_created` só existe nos arquivos históricos. Não instalar trigger manualmente no teste: isso esconderia a falta no stream.

- [ ] **Step 4b: Canonizar trigger depois de handle_new_user**

Em `20260910000000_auth_user_created_trigger.sql`, posterior a `20260905091000_invited_members_join_org.sql` e anterior à correção W1:
```sql
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
```
O objeto é recriado com a definição canônica conhecida; reaplicação não duplica triggers. Essa W0 passa a reproduzir a vulnerabilidade de convite do HEAD em banco descartável, para W1 corrigi-la com RED real. Nenhum deploy intermediário desta onda é autorizado.

- [ ] **Step 4c: Adaptar _create_tenant antes do primeiro gate DB completo**

Substituir a criação manual de organização/profile pelo consumo do trigger real:
```python
def _create_tenant(conn: psycopg.Connection, label: str) -> Tenant:
    user_id = uuid.uuid4()
    with conn.transaction():
        conn.execute(
            """insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_user_meta_data)
               values (%s,'00000000-0000-0000-0000-000000000000','authenticated',
                       'authenticated',%s,'','{}')""",
            (user_id,f"{label}@example.test"),
        )
        row = conn.execute(
            "select organization_id from public.profiles where id=%s",(user_id,)
        ).fetchone()
        if row is None:
            raise AssertionError("auth trigger did not create a profile")
    return Tenant(id=row[0],user_id=user_id)
```
Não desabilitar trigger e não fazer INSERT profile redundante. two_tenants já limpa organizações e auth.users pelos IDs retornados. Teste do catálogo exige exatamente um trigger não interno com `tgname='on_auth_user_created'` em `auth.users`; teste smoke confirma um profile/membership/pipeline por signup. Só depois dessa adaptação executar DB/RLS/pipeline completos.

- [ ] **Step 5: GREEN por replay e compatibilidade**

Run: Replay em projeto novo; depois Test com DB/RLS/pipeline serialmente. Expected: todas as migrations do manifesto aplicadas e `test_app_baseline_relations_exist` PASS. Reaplicar a nova migration no mesmo DB descartável deve preservar dados fixtures e não duplicar objetos; o replay integral do stream é sempre em projeto novo.

- [ ] **Step 6: Commit apenas após contrato completo e provas**

```powershell
git add docs/superpowers/specs/2026-09-08-auditoria-ia-baseline-schema.md runtime/tests/db/test_app_baseline_schema.py runtime/tests/db/test_auth_user_created_trigger.py runtime/tests/db/conftest.py
git add supabase/migrations/20260812000005_app_baseline_prereqs.sql supabase/migrations/20260910000000_auth_user_created_trigger.sql
git commit -m "fix: establish canonical app schema prerequisites"
```
Incluir o plano filho e suas compensações somente pelos caminhos explícitos que o review aprovou; nunca staging global de migrations.

**Gate:** nenhum objeto falso, nenhuma guarda que pula tabela obrigatória; replay completo e teste de preservação. **Rollback:** banco descartável pode ser reconstruído; em banco promovido, não remover tabelas com dados. Compensação aditiva revisada e autorização remota separada.

### Task 4: W0-T4 — gates descartáveis no CI

**Papéis:** implementador Terra; revisor Sol; guardião DB Astra.

**Files:**
- Modify: `.github/workflows/runtime.yml`, `scripts/test-disposable-db.ps1`
- Create: `src/tests/runtime-ci-gates.test.ts`

**Interfaces:**
- Consumes: executor T2, baseline T3, manifest.json e identity.json.
- Produces: gates.json com SHA atual, comandos/exit codes e contagem real de casos RLS; artifacts do CI livres de segredos.

- [ ] **Step 1: RED de CI que usa a mesma guarda**

```ts
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
it('usa o executor descartável e preserva o gate RLS', () => {
  const workflow = readFileSync('.github/workflows/runtime.yml', 'utf8')
  expect(workflow).toContain('scripts/test-disposable-db.ps1')
  expect(workflow).not.toContain('run: supabase start')
  expect(workflow).not.toContain('continue-on-error: true')
})
```

- [ ] **Step 2: Executar RED**

Run: `pnpm exec vitest run src/tests/runtime-ci-gates.test.ts`.
Expected: FAIL por executor ausente.

- [ ] **Step 3: Trocar start/pytest cru pelo executor**

```yaml
- name: Isolated DB, RLS and pipeline
  shell: pwsh
  run: |
    $runPath = Join-Path $PWD ".superpowers/sdd/auditoria-ia-disposable/$([guid]::NewGuid().ToString('N'))"
    ./scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $runPath
    ./scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $runPath
    ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $runPath
```
Retirar `SUPABASE_DB_URL` global que aponta 54322. Acrescentar `scripts/test-disposable-db.ps1` aos dois path filters. Preservar Python 3.13, Supabase 2.111.0 e os jobs bloqueantes existentes.

- [ ] **Step 4: Implementar Test serial e evidência**

Test lê identidade, reafirma docker inspect e hashes, injeta variáveis somente no processo filho e, quando TestTargets está vazio, executa nesta ordem:
```text
uv run --directory runtime pytest --collect-only -m rls -q
uv run --directory runtime pytest -m "db and not rls" --junitxml=artifacts/db.xml
uv run --directory runtime pytest -m rls --junitxml=artifacts/rls.xml
uv run --directory runtime pytest -m pipeline --junitxml=artifacts/pipeline.xml
```
Exigir `collectedRls > 0`; falha/skip por banco inacessível é gate vermelho. `commands` e `exitCodes` têm a mesma ordem e comprimento em gates.json; `commit` vem de `git rev-parse HEAD`. Stop no finally também quando um gate falhar.

Uso focal, válido para cada RED/GREEN de W1/W2: um nonce novo por ciclo; Test é a última ação e encerra o projeto:
```powershell
$runPath = Join-Path $PWD ".superpowers/sdd/auditoria-ia-disposable/$([guid]::NewGuid().ToString('N'))"
./scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $runPath
./scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $runPath
./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $runPath -TestTargets @('tests/db/test_verified_member_invites.py')
```
Teste unitário não precisa abrir Supabase; usar o pytest unitário diretamente. Focal DB exige o mesmo protocolo de identidade do gate completo.

- [ ] **Step 5: GREEN e gate de onda**

Run: `pnpm exec vitest run src/tests/runtime-ci-gates.test.ts`; `pnpm typecheck`; executor no commit. Expected: todos PASS, DB/RLS/pipeline sem XFAIL novo. Adicionar build/import/id Docker no job somente depois de W6-T2 ter a imagem aprovada; o gate runtime presente nesta onda cobre importação/arquitetura via `uv run --directory runtime lint-imports`.

Prova de migrations em dois projetos distintos: (1) Prepare/Replay/Test com todo o stream para replay-zero; (2) Prepare `-MigrationThrough 20260910000000`, Replay, inserir fixtures sintéticas, Upgrade até `20260910010000` (W1), Upgrade até `20260910020800` (W2), Upgrade até `20260910030000` (W3), Upgrade até `20260910040001` (W4), Test. Executar cada estágio só após seus arquivos aprovados existirem. Antes de cada Upgrade guardar IDs/conteúdo das fixtures e depois comparar, incluindo profiles/organization_members/mensagens/grants; histórico deve crescer só pelo sufixo previsto e system_identifier/sentinela permanecer iguais. Os testes de upgrade vivem em `runtime/tests/db/test_migration_upgrade_preservation.py` (novo, guardião adiciona ao plano filho de baseline), usam dados sintéticos conhecidos e verificam também `on_auth_user_created` único. Esse cenário não equivale à reconciliação do remoto fora de ordem descrita em B1.

- [ ] **Step 6: Commit e handoff**

```powershell
git add .github/workflows/runtime.yml scripts/test-disposable-db.ps1 src/tests/runtime-ci-gates.test.ts
git commit -m "ci: require isolated runtime database gates"
```

**Gate:** mesmo executor local/CI, replay do manifesto completo, RLS coletado e executado. **Rollback:** reverter job e executor em conjunto; manter o guard de fixtures até substituir por mecanismo equivalente.

## Autorrevisão de cobertura

| Requisito | Tarefa / estado |
|---|---|
| Três caixas já resolvidas | T1; guarda dinâmica ratificada em T3 |
| pnpm approve-builds | T1, política restrita versionada |
| Container, labels, volume, mapping, identidade e sentinela | T2 |
| Sem seed, dumps, linked, pooler ou operação global | T2 |
| Baseline completo e tabelas fora do stream | T3, bloqueado para DDL até inventário reconciliado |
| DB/RLS/pipeline, papéis reais e duas organizações | T3–T4; suítes existentes + W1 negativos |
| CI bloqueante e evidência no commit | T4 |
| Container runtime não-root | W6-T2; não declarar concluído na W0 |

Assinaturas revisadas: `dsn_from_env() -> str` permanece o seam compartilhado; TestTargets é string[]; Upgrade aceita somente sufixo de migrations sobre identidade preservada; Test sempre encerra o projeto. Trigger real e fixture de signup pertencem a W0, antes do gate DB. E0 é conteúdo de implementação ainda necessário para o executor; B0/B1 e o plano filho de schema condicionam T3. Este documento especifica contratos e gates, mas não promete que o executor ou os oito planos estejam integralmente prontos para implementação.

**Atualizado em 2026-09-17 (fechamento das Waves 0–4).** O ledger desta onda
(`.superpowers/sdd/2026-09-08-auditoria-ia-wave-0-baseline/progress.md`) parou em "Próxima ação:
executar o plano filho E0 antes de W0-T2" — essa linha está desatualizada e não deve ser lida como
"W0-T2/T3/T4 ainda não começaram". Os três foram entregues pelos planos filhos que este documento
previu, não por este ledger diretamente:

- **W0-T2 (executor descartável)** — plano filho `docs/superpowers/plans/2026-09-08-auditoria-ia-disposable-db-executor.md`
  (ledger E0). `scripts/test-disposable-db.ps1` e `runtime/tests/support/disposable_db.py` estão no
  branch e em uso desde então por todas as tasks de banco das Waves 1–4, inclusive por este
  fechamento (Task 8).
- **W0-T3 (baseline canônico do app)** — plano filho
  `docs/superpowers/plans/2026-09-08-auditoria-ia-app-schema-baseline.md`. Ledger fechou com commit
  `f75db83a7d438fc969d8edfdb1f01186c84e30de` (fresh GREEN: DB 799/799, RLS 76/76, pipeline 32
  PASS/1 skip Windows-only conhecido; auth/ACL/concorrência 17/17) e upgrade lane subsequente.
- **W0-T4 (gates descartáveis no CI)** — entregue dentro do mesmo plano filho de T3, tasks "7A Linux
  zero-skip integration" (commits `97d0265a`, `71cf6d51`): `.github/workflows/runtime.yml` já usa
  `scripts/test-disposable-db.ps1` com Prepare/Replay/Test/Stop sempre, sem `supabase start` cru e
  sem `continue-on-error`.

Estes três seguem valendo na branch corrente (`fix/ai-engine-schema-baseline`); a reconciliação
completa de Waves 0–4, incluindo o que a bateria completa de Task 8 achou de novo, está em
`docs/audits/2026-09-17-fechamento-waves-0-4.md`.
