# Auditoria IA — Wave 6: infraestrutura e evidência Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provar portabilidade, imagem runtime, configuração externa e depreciação com artefatos verificáveis, mantendo item 92 aberto até cumprir oito dias reais.

**Architecture:** Consumir o executor descartável da Onda 0 e os contratos corrigidos das Ondas 1–5. Reutilizar workflows, Dockerfile e wlog existentes; separar implementação local de evidência externa e observação temporal.

**Tech Stack:** GitHub Actions, pnpm 10, Node 22, Python 3.13, uv, pytest, PowerShell 7, Docker, Supabase CLI 2.111.0; wlog JSON e Logfire instalados.

**Spec:** `docs/superpowers/specs/2026-09-08-auditoria-motor-ia-sdd-program-design.md`

## Global Constraints

- A branch principal e suas alterações locais permanecem intocadas.
- Nenhum teste destrutivo aponta para banco existente, pooler ou produção.
- Nenhum subagente pode fazer push, merge, deploy ou migration remota.
- Nunca há dois implementadores escrevendo no mesmo worktree ao mesmo tempo.
- Toda lógica não trivial recebe ao menos um teste de regressão executável.
- Decisões de produto antecedem implementação.
- O menor diff responsável vence; código especulativo não será criado.
- Critical ou Important bloqueia a tarefa e a onda.
- Falha preexistente não será ocultada nem convertida em skip.
- item 92 aberto até existir janela real de pelo menos oito dias.
- Worktree exclusiva: `.worktrees/sync-remote-ai-2026-09-08`; branch `integration/sync-remote-ai-2026-09-08`.
- Artefatos não contêm segredos, URLs privadas ou DSNs reais. Não executar `mirror.ps1`, perfil `piloto`, `--linked` ou limpeza Docker global.

---

## Execução SDD

Controlador: `gpt-6-astra`, high. Cada tarefa usa implementador fresco, `fork_turns: "none"`, modelo/esforço explícitos e sem filhos. Revisor é outra instância; exige `Spec PASS/FAIL` e `Quality APPROVED/CHANGES_REQUIRED`. Implementação e revisão são sequenciais. O verificador de onda é `gpt-5.6-terra`, high; guardião Docker/DB é `gpt-6-astra`, high e trabalha sozinho enquanto o banco está ativo. Revisor final: `gpt-6-astra`, xhigh.

O controlador resolve o workspace pelo script `scripts/sdd-workspace PLAN_FILE` da skill SDD; guarda nele `progress.md`, briefs, relatórios, review packages e `external-evidence.md`. Registra BASE antes de cada tarefa, comandos, saída, commits e rulings. Reviews usam BASE..HEAD completo. Rodadas 1–3 retomam o implementador; 4–5 usam agente fresco superior. Critical/Important remanescente mantém bloqueio segundo a especificação, mesmo no limite de rodadas.

Cada checkbox é uma ação de 2–5 minutos; comandos longos são iniciados em um passo e têm a saída coletada em outro. Uma espera externa não é checkbox de execução contínua. Commits listados são instruções para a execução futura, não foram executados durante este planejamento. Rollback de tarefa usa `git revert` do hash registrado no ledger, nunca reset/checkout destrutivo.

## Entrada, estrutura e dependências

W0 deve ter replay integral e identidade descartável verdes; W1–W5 devem ter revisões aprovadas. Esta onda altera `.github/workflows/app.yml`, `.github/workflows/runtime.yml`, `runtime/Dockerfile`/`.dockerignore` somente se a prova exigir, quatro pontos de log nas duas rotas legadas e documentação/evidência. Não altera rollout, env remota, políticas RLS vivas ou configuração de serviço.

Interfaces obrigatórias W0: chamadas sem array usam `pwsh -File scripts/test-disposable-db.ps1 -Action Prepare|Replay|Upgrade|Test|Stop -RunDirectory <absolute-path>`; `-MigrationThrough <14-digit version>` é opcional somente em Prepare/Upgrade. `TestTargets` é opcional somente em Test e, com array, é chamado dentro de uma sessão PowerShell 7: `& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $runPath -TestTargets @('a','b')`; `pwsh -File` não transporta esse array. `runtime/tests/support/disposable_db.py::validate_dsn(dsn: str) -> dict[str, str]`; `assert_database_identity(conn: psycopg.Connection, *, system_identifier: str, sentinel: str) -> None`; `runtime/tests/support/database.py::dsn_from_env() -> str`. Artefatos em `.superpowers/sdd/auditoria-ia-disposable/<nonce>/`: `manifest.json` é array de `{filename,sha256,version}`, com `version` legada preservada em 8 ou 14 dígitos; `identity.json` contém `projectId/containerId/imageId/volumeName/port/systemIdentifier/sentinel` e `gates.json` contém `commit/commands/exitCodes/collectedRls/state`. Somente o executor injeta `SUPABASE_DB_URL`, `WORDER_TEST_DB_SYSTEM_IDENTIFIER` e `WORDER_TEST_DB_SENTINEL` nos filhos. Não duplicar o executor.

Test sempre executa Stop no finally e grava `state=stopped`; cada novo ciclo RED/GREEN usa nonce novo e passa por Prepare/Replay novamente. Upgrade preserva identidade/sentinela, aceita apenas sufixo maior que a última migration aplicada e recusa alterações antigas ou baseline fora de ordem; sucesso não encerra o projeto. Replay-zero não substitui a prova sequencial Upgrade nem resolve a decisão B1 sobre histórico remoto.

Nomes e ordem das migrations vêm de todos os arquivos atuais de `supabase/migrations/` e do manifesto W0 do commit sob teste, incluindo revisões das W1–W3. Comparar o array completo `filename/sha256/version` com arquivos copiados e histórico aplicado; não manter lista paralela de timestamps nem contagem fixa de migrations nesta onda.

Criar relatório durável `docs/superpowers/evidence/2026-09-08-auditoria-ia-wave-6.md`, copiando apenas fatos redigidos e identificadores não secretos dos artefatos operacionais. Evidência ausente é `AWAITING_EXTERNAL`; falha é `FAILED`; aprovação local é `LOCAL_PASS`; não são sinônimos.

### Task 1: W6-T1 — Windows/TZ e gatilhos complementares

**Files:**
- Modify: `.github/workflows/runtime.yml` — job `tests-unit` e paths.
- Modify: `.github/workflows/app.yml` — job `tests` e paths.
- Modify: `src/tests/runtime-ci-gates.test.ts` — acrescentar cobertura dos quatro filtros.
- Read: `fixtures/ai-guard-contract.json`, criada na W3 e consumida por `src/lib/ai/__tests__/guard-contract.test.ts` e `runtime/tests/unit/test_guard_contract.py`.
- Read/Test: `src/tests/reports-utils.test.ts`, `runtime/tests/unit/test_pack_traceability.py`, `runtime/tests/unit/test_rubric_scoring.py`.
- Create/Modify: `docs/superpowers/evidence/2026-09-08-auditoria-ia-wave-6.md`.

**Interfaces:**
- Consumes: testes unitários sem DSN; `TZ`; gates e filtros W0; fixture W3 `fixtures/ai-guard-contract.json` com `id/now/schedule/expected`.
- Produces: runtime `tests-unit` em Ubuntu/Windows; app `tests` em UTC/America_Sao_Paulo; ambos workflows selecionados por alteração exclusiva da fixture em `push` e `pull_request`; referências a runs reais com mesmo headSha.
- Prova externa dos filtros: `probeBase: string`, `probeHead: string`, `probeNumber: number`, lista exclusiva de arquivos alterados e quatro registros `workflowName/event/headSha/conclusion/url`, fornecidos pelo operador após publicação separadamente autorizada.
- Implementador Terra high; revisor Sol high; verificação final é CI real, não leitura de YAML.

- [ ] **Step 1: prova inicial e decisão de custo (3 min).**

`Get-Content .github/workflows/runtime.yml` e `Get-Content .github/workflows/app.yml`; registrar jobs/plataformas reais após W0, além de `render.yaml:autoDeploy=true`. A decisão do item 84 precisa aprovar concretamente dois jobs unitários runtime e dois fusos app; DB/Docker permanecem Ubuntu. Sem decisão de infraestrutura, preparar esse diff no plano, manter Task 1 aguardando decisão e não alterar workflow para contratar execução remota.

- [ ] **Step 2: escrever RED para alteração exclusiva da fixture (4 min).**

No teste de CI existente criado na W0, reutilizar imports `readFileSync/expect/it` e acrescentar:

```typescript
for (const workflow of ['app', 'runtime']) {
  for (const event of ['push', 'pull_request']) {
    it(`${workflow}/${event} seleciona alteração exclusiva do contrato de guards`, () => {
      const changedFiles = ['fixtures/ai-guard-contract.json']
      const source = readFileSync(`.github/workflows/${workflow}.yml`, 'utf8')
        .replace(/\r\n/g, '\n')
      const eventBody = source.split(`\n  ${event}:\n`)[1]
        ?.split(/\n  [a-z_]+:|\n\S/)[0] ?? ''
      const paths = [...eventBody.matchAll(/^\s+- "([^"]+)"$/gm)].map(match => match[1])
      expect(paths.length).toBeGreaterThan(0)
      expect(changedFiles.some(file => paths.includes(file))).toBe(true)
    })
  }
}
```

Este teste verifica a entrada exata nos quatro blocos reais; não implementa outro avaliador de globs do GitHub. O diff hipotético contém apenas a fixture, portanto não pode passar por `src/**` ou `runtime/**`.

- [ ] **Step 3: executar RED dos quatro eventos (2 min).**

`pnpm exec vitest run src/tests/runtime-ci-gates.test.ts`. Esperado: quatro FAIL nas expectativas da fixture, porque nenhum filtro atual inclui o arquivo; as guardas anti-vacuidade continuam PASS. Registrar saída no relatório. Se W0 já tiver adicionado a entrada por revisão posterior, registrar baseline GREEN real e preservar a regressão, sem remover regra para fabricar falha.

- [ ] **Step 4: baseline comportamental em fuso negativo (2 min para iniciar).**

Em PowerShell, `$env:TZ='America/Sao_Paulo'`; `pnpm exec vitest run src/tests/reports-utils.test.ts`. Em Windows executar `uv run --directory runtime pytest tests/unit/test_pack_traceability.py tests/unit/test_rubric_scoring.py -q`. Restaurar TZ ao valor anterior ao fim da verificação. Esperado PASS pós-W0/W3; se falhar, registrar regressão e devolver ao responsável, sem alterar expectativas.

- [ ] **Step 5: menor matriz aprovada (4 min).**

No job runtime `tests-unit`:

```yaml
strategy:
  fail-fast: false
  matrix:
    os: [ubuntu-latest, windows-latest]
runs-on: ${{ matrix.os }}
```

No job app `tests`, manter Ubuntu e acrescentar:

```yaml
strategy:
  fail-fast: false
  matrix:
    tz: [UTC, America/Sao_Paulo]
env:
  TZ: ${{ matrix.tz }}
```

Preservar checkout/setup/dependency pins atuais, Python 3.13 e `uv run --directory runtime pytest -m unit`. Não criar Windows Supabase, nem reduzir marcadores. As mudanças são feitas apenas após a decisão Step 1.

- [ ] **Step 6: ajustar filtros usando consumidores reais (3 min).**

Adicionar `core/**` aos dois eventos do runtime: `test_pack_traceability.py` lê `core/requisitos-e-entidades.md`. Adicionar `scripts/test-disposable-db.ps1` aos paths do runtime, caso W0 ainda não tenha feito. Adicionar `supabase/migrations/**` e `runtime/src/**` aos paths do app: os testes TS de paridade leem essas fontes.

Acrescentar a linha abaixo em `on.push.paths` e `on.pull_request.paths` de AMBOS os arquivos `.github/workflows/app.yml` e `.github/workflows/runtime.yml`, totalizando quatro inclusões:

```yaml
      - "fixtures/ai-guard-contract.json"
```

Usar o caminho exato, pois os dois leitores W3 dependem deste contrato compartilhado; não há consumidor comprovado que exija ampliar para `fixtures/**`. Preservar paths já existentes.

- [ ] **Step 7: GREEN local dos filtros e matrizes (3 min para iniciar).**

`pnpm exec vitest run src/tests/runtime-ci-gates.test.ts`: esperado PASS nos quatro casos de alteração exclusiva da fixture. Executar as duas configurações TZ de `pnpm test` e unit runtime da plataforma disponível, registrando commit, OS, TZ, início/fim UTC, comando, exit e contagens. A configuração da plataforma indisponível fica `AWAITING_EXTERNAL`; teste de configuração local não comprova disparo remoto.

- [ ] **Step 8: coletar saída, commit e rollback (3 min).**

Coletar saídas dos gates locais. `git add .github/workflows/app.yml .github/workflows/runtime.yml src/tests/runtime-ci-gates.test.ts docs/superpowers/evidence/2026-09-08-auditoria-ia-wave-6.md`; `git commit -m "ci: cover shared guard fixtures Windows and timezones"`. Revert local remove matriz/filtros/teste juntos; execução remota já faturada não é reversível, portanto sua autorização permanece separada.

- [ ] **Step 9: GREEN por quatro runs reais de alteração exclusiva (4 min de coleta).**

Após autorização externa específica, o operador publica uma prova cuja base já contém os filtros corrigidos e cujo único arquivo alterado é `fixtures/ai-guard-contract.json` (mudança de formatação JSON, preservando dados). Tanto o diff base/head do push quanto o diff completo do PR precisam conter exclusivamente esse caminho; um commit só de fixture dentro de um PR que também altera workflow não prova o filtro do PR. Os identificadores `probeBase/probeHead/probeNumber` vêm dessa execução autorizada.

Coletar somente leitura:

```powershell
git diff --name-only $probeBase $probeHead
gh pr diff $probeNumber --name-only
gh run list --commit $probeHead --limit 100 --json databaseId,workflowName,event,headSha,status,conclusion,url
```

Esperado: as duas listas contêm apenas `fixtures/ai-guard-contract.json`; existem quatro runs concluídos com sucesso, um para cada par `app/push`, `runtime/push`, `app/pull_request`, `runtime/pull_request`. Conferir `headSha == probeHead`, jobs Ubuntu+Windows e os dois fusos nos respectivos runs. Registrar IDs/URLs, início/fim UTC e diff exclusivo em `external-evidence.md`. Se política de concorrência cancelar uma execução, aguardar nova prova autorizada concluída; `cancelled` não é GREEN. Sem autorização/publicação/PR ou sem algum run, manter `AWAITING_EXTERNAL`, item 84 e esta prova abertos. Nenhum comando de publicação é autorizado por este plano.

### Task 2: W6-T2 — provar imagem de produção e contexto limpo

**Files:**
- Modify if failing proof: `runtime/Dockerfile`, `runtime/.dockerignore`.
- Modify: `.github/workflows/runtime.yml` — acrescentar job `image`; W0 adiou este gate para W6-T2.
- Test: imagem `worder-runtime:sdd`; `runtime/evals/rubrics/`.
- Modify: `docs/superpowers/evidence/2026-09-08-auditoria-ia-wave-6.md`.

**Interfaces:**
- Consumes: Dockerfile multi-stage, venv `/app/.venv`, pacote `/app/src/agents_runtime`, evals `/app/evals`.
- Produces: image ID/digest associado ao commit, import smoke verde e UID exatamente `10001`.
- Implementador Terra high; revisor Astra high; execução Docker exclusiva do guardião Astra high.

- [ ] **Step 1: prova inicial do contexto e Docker disponível (3 min).**

`docker version`; `Get-Content runtime/Dockerfile`; `Get-Content runtime/.dockerignore`. Não ler `.env.piloto`. O ignore atual não exclui `.env*`; verificar apenas nomes de arquivos ignorados por git, sem imprimir valores. Sem daemon acessível, Task 2 fica bloqueada por ambiente e não “verificada estaticamente”.

- [ ] **Step 2: mínimo ignore, somente se ausente (2 min).**

Adicionar a `runtime/.dockerignore`:

```text
.env*
.superpowers/
```

Preservar os COPY explícitos e o usuário 10001 já existentes. Não alterar imagem base ou dependências se o build passar. Se W3 introduziu tzdata, a prova abaixo precisa encontrá-lo no venv de produção.

- [ ] **Step 3: iniciar build da imagem (2 min).**

`docker build -t worder-runtime:sdd runtime`. Sem env-file, sem build arg secreto, sem montar banco. Registrar início UTC e commit. Usar stream/poll com atualizações; não abrir Docker Desktop nem iniciar janela visível.

- [ ] **Step 4: coletar build e executar smoke (3 min).**

```powershell
docker image inspect worder-runtime:sdd --format '{{.Id}}'
docker run --rm --network none --entrypoint python worder-runtime:sdd -c "import agents_runtime"
docker run --rm --network none --entrypoint id worder-runtime:sdd -u
docker run --rm --network none --entrypoint python worder-runtime:sdd -c "from pathlib import Path; from zoneinfo import ZoneInfo; from agents_runtime.evals.pack import load_rubrics; assert load_rubrics(Path('/app/evals/rubrics')); assert ZoneInfo('America/Sao_Paulo').key == 'America/Sao_Paulo'"
```

Esperado exit 0 em todos e UID `10001`. `--network none` prova que smoke não depende de provedores/banco. Importar pacote sozinho não prova rubricas; por isso o quarto comando é obrigatório.

- [ ] **Step 5: corrigir somente falha demonstrada (4 min).**

Se assets ausentes, restabelecer `COPY evals/ ./evals/` no builder e `COPY --from=builder --chown=runtime:runtime /app/evals /app/evals` no estágio runtime. Se import falhar, corrigir COPY de venv/src conforme caminhos reais, sem instalar dependência global paralela. Se UID diferente, usar `RUN useradd --create-home --uid 10001 runtime` e `USER runtime`. Se tudo já passa, não editar Dockerfile. Repetir somente build/smoke depois de uma mudança.

- [ ] **Step 6: registrar GREEN, CI e commit (3 min).**

Acrescentar um job `image` bloqueante em runtime.yml:

```yaml
image:
  runs-on: ubuntu-latest
  timeout-minutes: 20
  steps:
    - uses: actions/checkout@v7
    - run: docker build -t worder-runtime:sdd runtime
    - run: docker run --rm --network none --entrypoint python worder-runtime:sdd -c "import agents_runtime"
    - run: test "$(docker run --rm --network none --entrypoint id worder-runtime:sdd -u)" = "10001"
    - run: docker run --rm --network none --entrypoint python worder-runtime:sdd -c "from pathlib import Path; from zoneinfo import ZoneInfo; from agents_runtime.evals.pack import load_rubrics; assert load_rubrics(Path('/app/evals/rubrics')); assert ZoneInfo('America/Sao_Paulo').key == 'America/Sao_Paulo'"
```

Evidência registra SHA/imageId, início/fim e saídas. `git add runtime/.dockerignore .github/workflows/runtime.yml docs/superpowers/evidence/2026-09-08-auditoria-ia-wave-6.md`, mais Dockerfile somente se alterado; `git commit -m "ci: verify runtime image assets and non-root user"`. Rollback reverte arquivos locais; imagem anterior fica recuperável pelo image ID. Não limpar imagens/volumes compartilhados.

### Task 3: W6-T3 — evidências de env, rollout, RLS e advisors

**Files:**
- Read: `render.yaml`, `runtime/DEPLOY.md`, `runtime/.env.piloto.example`, `src/lib/ai/runtime-rollout.ts`, `src/lib/oauth-security.ts`.
- Read/Test: `runtime/tests/db/test_rls_identity.py`, `test_rls_conversation.py`, `test_rls_e2.py`.
- Modify: `docs/superpowers/evidence/2026-09-08-auditoria-ia-wave-6.md` e `external-evidence.md` do workspace SDD.
- No automatic changes: banco vivo, envs, Render, Vercel, rollout e advisors.

**Interfaces:**
- Consumes: artefatos W0 `manifest.json/identity.json/gates.json`; metadados de configuração do ambiente correto; resultados somente leitura redigidos.
- Produces: linhas `evidence_id, subject_commit, environment_alias, source, collected_at_utc, coverage_start_utc, coverage_end_utc, verdict, limitation`.
- Responsável por coletar: operador autorizado; revisor Astra high. Guardião DB Astra opera apenas descartável.

- [ ] **Step 1: abrir registro sem presumir ambiente (3 min).**

Registrar provas ausentes como:

```text
evidence_id=runtime-env
subject_commit=obtido por git rev-parse HEAD
environment_alias=ambiente indicado pelo operador
verdict=AWAITING_EXTERNAL
coverage_start_utc=NOT_STARTED
coverage_end_utc=NOT_ENDED
limitation=nenhuma configuração viva foi inspecionada
```

Os estados textuais são resultados explícitos de ausência, não datas fictícias. Assim que a coleta começar, substituir por timestamps ISO8601 reais. Não ler `.env` como substituto de configuração Render/Vercel.

- [ ] **Step 2: evidenciar configuração por presença e igualdade (4 min).**

No ambiente escolhido e com acesso somente leitura autorizado, registrar presença booleana de `OAUTH_STATE_SECRET` ou `NEXTAUTH_SECRET`, `AGENTS_PREVIEW_TOKEN`, `SUPABASE_DB_URL`, `ENCRYPTION_KEY`; igualdade app/runtime dos segredos compartilhados por comparação dentro do ambiente seguro, sem imprimir valor/hash reutilizável. Registrar `AGENTS_WORKER_SET_ROLE=worker_role`, `AGENTS_SENDER_SET_ROLE=sender_role`, factories de responder/toucher/channel e source commit ativo. Resolver aws-0/aws-1 pelo endpoint indicado pelo painel do projeto e configuração do serviço, sem escolher pelo arquivo local do operador. Registro público contém apenas “coincide/não coincide” e tipo session pooler, nunca hostname/DSN real.

- [ ] **Step 3: coletar rollout e metadados RLS/advisors (5 min).**

Operador autorizado executa somente SELECT; separar estado vivo de prova DB descartável. Consultas concretas:

```sql
select mode, count(*) from public.ai_runtime_rollout group by mode;
select tablename, indexname, indexdef from pg_indexes
where schemaname = 'public'
and tablename in ('whatsapp_cloud_conversations', 'whatsapp_opt_status', 'ai_agent_chunks');
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='whatsapp_cloud_conversations';
select tablename, policyname, roles, cmd, qual, with_check from pg_policies
where schemaname='public' and tablename='whatsapp_cloud_conversations';
select rolname, rolsuper, rolbypassrls from pg_roles
where rolname in ('anon','authenticated','worker_role','sender_role','service_role');
```

Além do agregado, confirmar por vínculo interno que a org piloto correta está no modo esperado, sem publicar seu ID. Relatório dos advisors: projeto/ambiente por alias, data, categorias, severidades, evidências e correções já versionadas; não aplicar recomendações automaticamente. Advisory só do ambiente explicitamente autorizado; ausência de banco local não autoriza apontar advisors para produção.

- [ ] **Step 4: demonstrar RLS real no descartável (2 min para iniciar).**

Guardião prepara um ciclo novo, pois qualquer Test anterior já encerrou seu projeto:

```powershell
$runDirectory = Join-Path (Get-Location).Path ('.superpowers/sdd/auditoria-ia-disposable/' + [guid]::NewGuid().ToString('N'))
pwsh -File scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $runDirectory
pwsh -File scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $runDirectory
pwsh -File scripts/test-disposable-db.ps1 -Action Test -RunDirectory $runDirectory
```

Interromper a sequência se Prepare/Replay falhar. O gate completo usa TestTargets vazio. `gates.json.collectedRls > 0`; o log de coleta e JUnit RLS devem nomear casos de `test_rls_identity.py`, `test_rls_conversation.py`, `test_rls_e2.py`, papéis reais `anon/authenticated` e serviço, worker/sender quando aplicáveis, duas orgs, bloqueio cross-org e de operação indevida na própria org. Exigir `state=stopped` ao terminar. Apenas listar policies vivas não substitui prova comportamental. Caso o contrato W0 ainda não ofereça esses cenários, devolver gap à W0/W1, mantendo esta task aberta.

- [ ] **Step 5: coletar resultados e decidir conclusão (3 min).**

Exigir início/fim UTC e `subject_commit` em cada prova. Falta de acesso, projeto não identificado, divergência de papel, rollout incorreto, alto risco no advisor ou ausência de prova RLS resulta `AWAITING_EXTERNAL`/`FAILED`; não fechar checklist. Corrigir exemplo de pooler somente em task de documentação explicitamente aprovada depois da evidência, jamais substituir aws-0 por aws-1 automaticamente.

- [ ] **Step 6: commit do registro (2 min).**

`git add docs/superpowers/evidence/2026-09-08-auditoria-ia-wave-6.md`; `git commit -m "docs: record runtime environment and RLS evidence"`. Rollback: revert do registro não muda ambiente; se evidência era incorreta, preferir nota corretiva preservando trilha. Pacote completo apenas quando evidência obrigatória tiver verdict PASS; relatório de ausência é progresso, não aceite.

### Task 4: W6-T4 — instrumentar quatro entradas legadas e provar ausência de segredos

**Files:**
- Modify: `src/app/api/whatsapp/webhook/route.ts`, `src/app/api/whatsapp/meta/webhook/route.ts` — GET e POST.
- Create: `src/lib/whatsapp/__tests__/deprecated-webhook-telemetry.test.ts`.
- Read: `src/lib/observability/whatsapp-logger.ts::wlog`.
- Test/Modify if failing proof: `runtime/tests/unit/test_obs.py`, `runtime/src/agents_runtime/obs/logfire_setup.py::configure_logfire`.
- Modify: `docs/superpowers/evidence/2026-09-08-auditoria-ia-wave-6.md`.

**Interfaces:**
- Consumes: `wlog.warn(event: string, data: Record<string,unknown>)`.
- Produces: `event="whatsapp.webhook.deprecated_hit"`, `route` fixo entre dois paths, `method="GET"|"POST"`, `ts` pelo logger. Sem query, verify token, assinatura, corpo ou header.
- Implementador Terra high; revisor Sol high; verificação Terra high. Item 92 continua aberto depois do merge local desta task.

- [ ] **Step 1: decisão concreta de destino (3 min).**

Registrar aprovação do destino externo já contratado, retenção de pelo menos oito dias, coleta sem amostragem de warn, timezone UTC e operador dono. A implementação abaixo emite JSON pelo logger existente, sem SDK/dependência nova. Sem decisão de destino, os testes locais podem ser preparados; não afirmar disponibilidade de métrica externa e não iniciar relógio de observação.

- [ ] **Step 2: escrever RED dos quatro pontos (5 min).**

```typescript
import { afterEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import * as old from '@/app/api/whatsapp/webhook/route'
import * as meta from '@/app/api/whatsapp/meta/webhook/route'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
for (const [route, handlers] of [
  ['/api/whatsapp/webhook', old],
  ['/api/whatsapp/meta/webhook', meta],
] as const) {
  for (const method of ['GET', 'POST'] as const) {
    it(`${method} ${route} conta hit sem vazar segredo e preserva forward`, async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const upstream = vi.fn().mockResolvedValue(new Response('upstream', { status: 202 }))
      vi.stubGlobal('fetch', upstream)
      const request = new NextRequest(
        `https://example.test${route}?hub.verify_token=SECRET_CANARY`,
        { method, headers: { 'x-hub-signature-256': 'SIGNATURE_CANARY' },
          ...(method === 'POST' ? { body: 'RAW_CANARY' } : {}) },
      )
      const response = await handlers[method](request)
      const event = JSON.parse(String(warn.mock.calls[0][0]))
      expect(event).toMatchObject({
        event: 'whatsapp.webhook.deprecated_hit', route, method,
      })
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/SECRET_CANARY|SIGNATURE_CANARY|RAW_CANARY/)
      expect(response.status).toBe(202)
      expect(await response.text()).toBe('upstream')
      const [url, init] = upstream.mock.calls[0]
      expect(String(url)).toContain('hub.verify_token=SECRET_CANARY')
      expect(init.headers.get('x-hub-signature-256')).toBe('SIGNATURE_CANARY')
      if (method === 'POST') expect(init.body).toBe('RAW_CANARY')
    })
  }
}
```

- [ ] **Step 3: executar RED (2 min).**

`pnpm exec vitest run src/lib/whatsapp/__tests__/deprecated-webhook-telemetry.test.ts`. Esperado FAIL: console atual não é JSON; GET da rota meta ainda loga query sensível. Esse teste também impede “corrigir log” alterando bytes/headers do forward.

- [ ] **Step 4: implementação mínima em quatro call sites (3 min).**

Importar `wlog` em ambas rotas. Substituir cada console.warn por:

```typescript
wlog.warn('whatsapp.webhook.deprecated_hit', {
  route: '/api/whatsapp/webhook',
  method: 'GET',
})
```

Nos outros três sítios usar exatamente o path e o método declarados no teste, literais fixos. Não escrever request.url/search/headers/body. Preservar GET/POST, query e resposta do upstream.

- [ ] **Step 5: GREEN local da instrumentação (2 min).**

`pnpm exec vitest run src/lib/whatsapp/__tests__/deprecated-webhook-telemetry.test.ts`; `pnpm typecheck`. Esperado quatro testes verdes e exit 0.

- [ ] **Step 6: provar Logfire na fronteira de exportação (5 min).**

Ler a versão de `runtime/uv.lock` e confirmar as APIs públicas `configure(local=True, additional_span_processors=...)` e `instrument_httpx(client)` no SDK instalado. Elas foram conferidas durante o planejamento no pacote disponível e na [referência Logfire](https://pydantic.dev/docs/logfire/api/logfire/). Adicionar este teste a `test_obs.py`; o adapter só troca exportação e instrumentação de DB/métricas, enquanto configuração de scrubbing e HTTPX são reais:

```python
def test_httpx_export_does_not_contain_authorization(monkeypatch):
    from types import SimpleNamespace

    import httpx
    import logfire
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

    exporter = InMemorySpanExporter()
    configured = []

    def configure_offline(**options):
        options.update(
            token=None, send_to_logfire=False, local=True, metrics=False,
            additional_span_processors=[SimpleSpanProcessor(exporter)],
        )
        configured.append(logfire.configure(**options))

    with httpx.Client(transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json={"ok": True}),
    )) as client:
        adapter = SimpleNamespace(
            configure=configure_offline,
            ScrubbingOptions=logfire.ScrubbingOptions,
            instrument_httpx=lambda: configured[0].instrument_httpx(client),
            instrument_psycopg=lambda: None,
            instrument_system_metrics=lambda: None,
        )
        monkeypatch.setenv("AGENTS_LOGFIRE_TOKEN", "test-only-token")
        monkeypatch.setattr(logfire_setup, "_import_logfire", lambda: adapter)
        try:
            assert "httpx" in logfire_setup.configure_logfire()
            client.get("https://example.test/probe", headers={
                "Authorization": "Bearer SECRET_CANARY",
                "X-Shopify-Access-Token": "SHOPIFY_CANARY",
            })
            configured[0].force_flush()
            spans = exporter.get_finished_spans()
            assert spans
            serialized = json.dumps([span.to_json() for span in spans])
            assert "SECRET_CANARY" not in serialized
            assert "SHOPIFY_CANARY" not in serialized
        finally:
            HTTPXClientInstrumentor.uninstrument_client(client)
```

O provider é local ao teste e nenhum token/endpoint real é usado. A configuração HTTPX padrão não captura headers, conforme a [integração oficial](https://pydantic.dev/docs/logfire/integrations/http-clients/httpx/); registrar GREEN inicial honesto se o teste já passar. Se falhar por vazamento, adicionar `authorization` e `x-shopify-access-token` ao `CONTENT_SCRUB_PATTERNS` ou desabilitar captura de headers, preservando no-op sem token, e repetir para demonstrar RED→GREEN. A evidência viva precisa ainda confirmar ausência de overrides de captura no ambiente. Se a versão instalada não tiver a API confirmada, diagnosticar divergência de lock/ambiente; não inventar PASS nem converter em skip.

- [ ] **Step 7: coletar prova Logfire e commit (3 min).**

`uv run --directory runtime pytest tests/unit/test_obs.py -q`; `uv run --directory runtime ruff check .`. Guardar saída e diferença entre mock de boot e export real. `git add` somente rotas/teste de telemetria, test_obs/logfire_setup se mudados e relatório de evidência; `git commit -m "fix: instrument legacy webhook hits without secrets"`. Rollback por revert restaura forwarders; se voltar logging inseguro, usar patch compensatório apenas da instrumentação em vez de reintroduzir vazamento.

### Task 5: W6-T4 — janela real de oito dias, sem conclusão por ausência de dados

**Files:**
- Modify: `docs/superpowers/evidence/2026-09-08-auditoria-ia-wave-6.md`.
- Artifacts: `external-evidence.md` e `webhook-deprecation-window.json` no workspace SDD desta onda.
- Read: `docs/superpowers/plans/whatsapp-scale/phase7-cleanup-observability.md`.

**Interfaces:**
- Consumes: quatro eventos Task 4 disponíveis no ambiente autorizado e destino externo com retenção/aprovação.
- Produces: `{deployment_commit, start_utc, end_utc, duration_seconds, route_method_counts, ingestion_gap_seconds, query, export_sha256, verdict}`.
- Verificador Terra high; revisor Sol high. Operador externo é dono de publicação/configuração; nenhum agente desta task publica.

- [ ] **Step 1: prova inicial e início objetivo (3 min).**

Antes de publicação autorizada separadamente, gravar `start_utc=null,end_utc=null,verdict="AWAITING_DEPLOYMENT"`; execução local e console.log não iniciam a janela. Após o operador comprovar deployment com código da Task 4, destino ativo e teste de ingestão, o começo é o timestamp UTC do primeiro instante com cobertura integral das quatro séries. Canário de validação fica antes de `start_utc`. Registrar SHA do deployment e identificador redigido do destino.

- [ ] **Step 2: registrar consulta e janela mínima (3 min).**

Consulta semântica a traduzir no destino aprovado: contar `event = "whatsapp.webhook.deprecated_hit"` agrupado por `route,method` no intervalo semiaberto `[start_utc,end_utc)`, materializando as quatro combinações mesmo sem resultados. Guardar consulta executada literal e SHA256 do export sanitizado. `end_utc >= start_utc + 691200 segundos`; exemplo meramente aritmético: início 2026-09-08T12:00:00Z só permite fim a partir de 2026-09-16T12:00:00Z. Não usar essa data como evidência real.

- [ ] **Step 3: registrar observação por checkpoints (2 min por coleta).**

Usar mecanismo de monitoramento do produto, quando disponível, para a consulta somente leitura. A cada checkpoint salvar hora, contagens cumulativas e saúde da ingestão no artefato; não manter shell dormindo oito dias. Antes de sair de uma sessão, deixar estado `OBSERVING` e data do próximo checkpoint explícitos. Nova sessão retoma timestamps existentes; não reinicia janela só por trocar agente.

- [ ] **Step 4: avaliar encerramento (3 min).**

PASS exige quatro contagens zero, `duration_seconds >= 691200`, nenhuma lacuna de ingestão, retenção cobrindo todo intervalo e implantação instrumentada comprovada. Qualquer hit reinicia uma janela elegível depois do último hit; qualquer gap reinicia cobertura depois da recuperação. Export vazio com pipeline desconhecido é `AWAITING_EXTERNAL`, não zero. Ainda há tráfego → `FAILED_ZERO_HITS` e forwarders permanecem. Código novo não remove as rotas automaticamente.

- [ ] **Step 5: registrar prova, commit e rollback (2 min).**

`git add docs/superpowers/evidence/2026-09-08-auditoria-ia-wave-6.md`; `git commit -m "docs: record legacy webhook observation window"`. Se não cumpriu janela, registrar progresso com item 92 aberto e não marcar a tarefa completa. Corrigir prova errada por commit novo; nunca apagar histórico de hits para obter PASS.

## Saída da onda

App/runtime/DB/RLS/Docker devem passar no mesmo SHA congelado, repetidos na W7. É permitido entregar instrumentação local com evidência externa pendente, mas isso não conclui a onda nem o programa. 84 requer run CI real; 92 requer oito dias reais; env/RLS/advisors/Authorization requerem prova concreta. Atualizar checklist somente quando a respectiva condição estiver satisfeita.

Autorrevisão: filtros cobrem arquivos lidos pelos testes; matriz não inclui DB Windows; Docker usa 10001 e rubricas reais; não confundir configuração declarada com ativa; nenhum acesso externo mutante; logs não incluem query/headers; janela tem início/fim e saúde de ingestão; nenhum registro PASS sem artifact/commit.
