# Auditoria IA — Wave 7: prontidão para promoção Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar branch comparativa com diff integral revisado, gates no mesmo commit e relatório rastreável de correções, riscos, regressões e rollback.

**Architecture:** Congelar um candidato local depois da documentação final e verificar app, runtime, replay, RLS e imagem nesse SHA. A onda não implementa features; findings retornam à tarefa responsável. Promoção significa prontidão documentada, sem executar push, merge, migration remota ou deploy.

**Tech Stack:** Git, Markdown/HTML estático, pnpm/Vitest/TypeScript/Next.js, uv/pytest/Ruff/Import Linter, executor PowerShell descartável da W0, Docker.

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

## Entrada e estrutura

O merge de referência é `04b916327e72be9f60950da2ec310f433db4e097`, a base local auditada é `f0be80619cf6fbd006c27c05abe8fa81c2a8c84e` e a origem remota sincronizada é `4847440c0317e106b0abde6c8c61f0c25b689d5a`. Não substituir uma referência pela outra.

W0–W6 entregam commits, testes, decisões e evidências. Item 92 exige janela real mínima de oito dias, não promessa de acompanhamento. O relatório pode ser entregue com impedimentos, mas isso não é programa concluído nem candidato aprovado. Nenhum Critical/Important pode ser aceito silenciosamente como “pendência externa”.

Consumir nomes e versões de migrations do manifesto W0 produzido a partir de `supabase/migrations/` no candidato atual, incorporando as revisões das ondas posteriores. Esta onda não fixa timestamps de migrations, não presume quantidade e não reaproveita manifesto anterior à última mudança SQL. Contrato W0 preservado: chamadas sem array usam `pwsh -File scripts/test-disposable-db.ps1 -Action Prepare|Replay|Upgrade|Test|Stop -RunDirectory <absolute-path>`; `-MigrationThrough <14-digit version>` é opcional somente em Prepare/Upgrade. `TestTargets` é opcional somente em Test e, com array, é chamado dentro de uma sessão PowerShell 7: `& ./scripts/test-disposable-db.ps1 -Action Test -RunDirectory $runPath -TestTargets @('a','b')`; `pwsh -File` não transporta esse array. Só o executor injeta `SUPABASE_DB_URL`, `WORDER_TEST_DB_SYSTEM_IDENTIFIER` e `WORDER_TEST_DB_SENTINEL` nos filhos. `manifest.json` é array de `{filename,sha256,version}`, com `version` legada preservada em 8 ou 14 dígitos; `gates.json.collectedRls` é contagem, enquanto nomes e resultados dos casos vêm dos logs/JUnit. Test sempre encerra o projeto no finally e registra `state=stopped`; próximo ciclo precisa de nonce novo.

Artefatos duráveis desta onda:
- Modify: `docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md`.
- Modify: `docs/SYNC-REMOTE-AI-2026-09-08.md`.
- Create: `docs/AUDITORIA-IA-2026-09-08-RELATORIO.html`.
- Create: `docs/superpowers/evidence/2026-09-08-auditoria-ia-promotion.md`.

O repositório inspecionado não tem HTML de auditoria versionado; por isso o artefato acima é novo, não substituição dos emails HTML. O relatório anterior citado no checklist é uma referência externa, preservada.

Artefatos de verificação no workspace SDD desta onda: `progress.md`, `final-gates.json`, `review-final.md`, `external-evidence.md`. Resultados pós-commit ficam nesses artefatos, sem novo commit que invalide o SHA verificado. A documentação final aponta para o commit que a contém, resolvido por `git log -1 --format=%H -- docs/AUDITORIA-IA-2026-09-08-RELATORIO.html`; não tenta embutir seu próprio hash.

### Task 1: W7 — reconciliar catálogo, comparação e rollback

**Files:**
- Modify/Create: os quatro artefatos duráveis enumerados acima.
- Read: todos os plans e evidências das Ondas 0–6, `render.yaml`.
- No changes: código, banco, configuração remota.

**Interfaces:**
- Consumes: catálogo inicial de 64 caixas abertas; 3 obsoletas revalidadas; 61 pendências reais; risco novo de convite; commits/reviews de cada onda; `webhook-deprecation-window.json`.
- Produces: uma linha por pendência original com identificador estável, estado, commit, comando/resultado, evidência e regressão; risco de convite separado; decisão de prontidão.
- Responsável documental: controlador Astra high; nenhum implementador de código. Revisor final Astra xhigh independente.

- [ ] **Step 1: prova inicial de completude do catálogo (3 min).**

Executar `git status --short`, `git log --oneline 04b916327e72be9f60950da2ec310f433db4e097..HEAD` e `rg -n '^- \[[ x]\]' docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md`. Reconciliar as 64 entradas originais com o catálogo W0 por identidade, não pelo número final de caixas — tarefas desmembradas mudam contagens. Exigir item novo de convite rastreado. Falta de linha/commit/teste é RED documental, sem inventar um teste do app.

- [ ] **Step 2: conferir dependências e janela externa (4 min).**

Ler `docs/superpowers/evidence/2026-09-08-auditoria-ia-wave-6.md` e artefatos externos. Conferir 691200 segundos reais, quatro séries zero, cobertura sem gaps, deployment identificado. Conferir a prova W6-T1 da fixture `fixtures/ai-guard-contract.json`: diff exclusivo no push e no PR e quatro runs reais `app/runtime × push/pull_request`; teste local de YAML não substitui esses runs. Confirmar decisões de produto exigidas nas W3–W5, prova multi-WABA quando aplicável e escopos GraphQL. Bloqueios materiais geram estado `NOT_READY`; mantenha a entrega documental avançando sem chamar programa de completo.

- [ ] **Step 3: escrever antes/depois e rastreabilidade (5 min).**

No checklist, só marcar `[x]` se resultado tiver evidência; anotar `aguardando dependência externa` mantendo `[ ]` quando necessário. Em SYNC e promotion.md registrar tabela de campos:

```text
item_id | original_heading | state | before | after | commit
command | exit_code | tests_passed | skips | xfails | evidence | residual_risk
```

Estados permitidos: `CORRIGIDO_TESTADO`, `REMOVIDO`, `DECIDIDO`, `AGUARDANDO_EXTERNO`, `BLOQUEADO`. “DECIDIDO” exige decisão de produto rastreável e nenhuma implementação prometida faltando. Registrar contagens reais, nunca reutilizar 1874/1208 da baseline como resultado novo. Cinco XFAIL originais precisam estar resolvidos com prova W1 ou permanecer visíveis como impedimento; não renomear/desmarcar para ocultar.

- [ ] **Step 4: escrever HTML mínimo e autônomo (5 min).**

Criar documento HTML estático sem CDN/JS externo. Estrutura concreta:

```html
<!doctype html>
<html lang="pt-BR">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Auditoria do motor de IA — 08/09/2026</title>
<style>
body{max-width:1100px;margin:2rem auto;padding:0 1rem;font:16px/1.5 system-ui}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #aaa;padding:.5rem;text-align:left;vertical-align:top}
code{overflow-wrap:anywhere}.blocked{color:#9b1c1c}.passed{color:#166534}
</style>
<main>
<h1>Auditoria do motor de IA</h1>
<p>Branch: <code>integration/sync-remote-ai-2026-09-08</code>.</p>
<p>Este relatório não autoriza publicação nem alteração de banco remoto.</p>
<h2>Comparação e evidências</h2>
<table><caption>Rastreabilidade das pendências</caption>
<thead><tr><th scope="col">Item</th><th scope="col">Antes</th><th scope="col">Depois</th><th scope="col">Commit e prova</th><th scope="col">Estado</th></tr></thead>
<tbody></tbody></table>
<h2>Regressões, dependências externas e rollback</h2>
</main>
</html>
```

Preencher tbody com todas as linhas reconciliadas e seção final com fatos dos Steps 2–3; sem linha fictícia nem texto vazio na entrega. Escapar `& < > "` de dados copiados para HTML usando cuidado editorial, sem introduzir gerador para um relatório. Marcar estado legível em texto, não apenas cor. Links relativos para checklist, SYNC e evidências.

- [ ] **Step 5: escrever rollback concreto e limites de publicação (4 min).**

Registrar em promotion.md:
1. Sem promoção, continuar usando a branch original; a principal não mudou.
2. Código: reverter commits independentes por hash e ordem inversa dos dependentes; não usar `reset --hard`.
3. Migrations: usar compensações aditivas das tarefas W0–W2; nunca assumir que voltar código desfaz schema/grants/cupons emitidos.
4. Rollout runtime→legacy só pelo procedimento revisado W2, com autorização externa e prova de drenagem/idempotência/takeover; nenhuma SQL remota executada aqui.
5. `render.yaml` contém `autoDeploy: true`; obter evidência da branch monitorada e integração Vercel antes de pedir autorização futura para push. Aprovar push pode disparar deploy; o usuário deve ver essa consequência concreta.
6. Qualquer promoção futura deve nomear destino/branch/SHA, conjunto de migrations e operador. Esta task não contém comandos de push, merge, deploy ou migration remota.

- [ ] **Step 6: GREEN documental e commit (3 min).**

`git diff --check`; `git diff --stat`; conferir número de linhas reconciliadas, links locais e estado de cada evidência. Esperado sem espaços inválidos/conflitos e nenhuma dependência externa apresentada como concluída. `git add docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md docs/SYNC-REMOTE-AI-2026-09-08.md docs/AUDITORIA-IA-2026-09-08-RELATORIO.html docs/superpowers/evidence/2026-09-08-auditoria-ia-promotion.md`; `git commit -m "docs: reconcile AI audit evidence and promotion readiness"`.

Rollback do relatório por revert preserva código e dados. Uma retificação factual posterior prefere commit corretivo; terá de congelar e verificar novamente o candidato.

### Task 2: W7 — gates independentes no mesmo SHA

**Files:**
- Read/Test: `package.json`, `runtime/pyproject.toml`, `runtime/Dockerfile`, `supabase/migrations/`, todas as suítes.
- Execute: `scripts/test-disposable-db.ps1` produzido na W0.
- Artifacts: `final-gates.json` no workspace SDD; W0 `manifest.json/identity.json/gates.json`.
- No source edits.

**Interfaces:**
- Consumes: SHA congelado Task 1, DSN/identidade/sentinela injetados exclusivamente pelo executor W0.
- Consumes: prova sequencial de Upgrade e seus limites de fase da W0, revisados contra os manifestos aprovados W0→W4; decisão B1 sobre compatibilidade com histórico remoto. Nenhum desses resultados pode ser inferido do replay-zero.
- Produces: `{candidate_commit, app, runtime, database, docker, external, verdict}`; cada grupo contém comandos, inicio/fim UTC, exit codes, contagens e hash de artifact.
- App Terra high; runtime Sol high; DB/Docker guardião Astra high sozinho. Controlador não implementa correções durante verificação.

- [ ] **Step 1: congelar candidato e baseline (3 min).**

```powershell
$candidate = git rev-parse HEAD
git status --porcelain
git diff --check
git diff --stat 04b916327e72be9f60950da2ec310f433db4e097 HEAD
git diff --stat f0be80619cf6fbd006c27c05abe8fa81c2a8c84e HEAD
git diff --stat 4847440c0317e106b0abde6c8c61f0c25b689d5a HEAD
```

Esperado worktree sem mudanças versionadas; ignorados SDD não são divergência. Registrar SHA. Se houver arquivo de implementação sujo, não validar outro estado como se fosse candidato.

- [ ] **Step 2: iniciar gate app (2 min por comando).**

`pnpm test`; `pnpm typecheck`; `pnpm build`. Build usa somente valores dummy do workflow app para Supabase/chaves, nunca `.env` real. Cada comando exige exit 0 e resultado capturado; iniciar um por vez se competirem por recursos. Registrar counts/skips e NODE/TZ utilizados. Evidência W6 cobre matriz CI, sem confundir execução local com Windows/Linux remoto.

- [ ] **Step 3: coletar app e iniciar runtime (3 min).**

`uv run --directory runtime ruff check .`; `uv run --directory runtime lint-imports`; `uv run --directory runtime pytest -m unit`. Esperado exit 0, todos contratos preservados e XFAIL conhecidos enumerados. Capturar nomes de qualquer skip/xfail, sem aceitar aumento injustificado.

- [ ] **Step 4: coletar runtime e preparar banco descartável (3 min).**

Somente guardião e nenhum outro operador DB ativo:

```powershell
$runDirectory = Join-Path (Get-Location).Path ('.superpowers/sdd/auditoria-ia-disposable/' + [guid]::NewGuid().ToString('N'))
pwsh -File scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $runDirectory
```

O executor valida caminho abaixo da worktree, nonce, portas exclusivas, labels/container/image/volume novo, config sem seed/migrations inicialmente desligadas. Se W0 não estiver pronta, encerrar gate como bloqueado, sem `supabase start` improvisado. Nunca consumir DSN existente.

- [ ] **Step 5: replay integral (2 min para iniciar).**

`pwsh -File scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $runDirectory`. Exigir correspondência de `system_identifier` container/loopback, sentinela e manifesto completo antes dos testes. Comparar o array integral `filename/sha256/version` do manifesto com os arquivos SQL do candidato, cópias efetivamente aplicadas e histórico do banco, sem lista de migrations codificada nesta onda. Capturar hashes/versões aplicadas. Falha na baseline canônica bloqueia, não autoriza dump ou `sql/` congelado.

- [ ] **Step 6: coletar replay e executar DB/RLS/pipeline (2 min).**

`pwsh -File scripts/test-disposable-db.ps1 -Action Test -RunDirectory $runDirectory`. O executor roda `db and not rls`, `rls` e `pipeline` serialmente; isso cobre o gate agregado `pytest -m "db or pipeline"` da spec e adiciona seleção RLS explícita. Não executar agregado novamente sem motivo. Confirmar `gates.json.commit == $candidate`, todos exit 0 e `collectedRls > 0`; exigir JUnit com casos positivos/negativos por papel e duas orgs, inclusive tabelas do app cobertas após W0/W1.

- [ ] **Step 7: coletar DB e encerrar apenas stack próprio (3 min).**

Preservar manifest/identity/gates e saídas redigidas. Confirmar `gates.json.state == "stopped"`, pois Test obrigatoriamente chama Stop no finally. `pwsh -File scripts/test-disposable-db.ps1 -Action Stop -RunDirectory $runDirectory` somente para recuperar falha de cleanup registrada, validando identidade do mesmo nonce. Stop falho é concern operacional explícito, nunca gatilho de `docker system prune`. O operador continua sozinho até stack encerrado; esse runDirectory não pode receber Replay, Upgrade ou Test novamente.

- [ ] **Step 7a: provar upgrade sequencial em outro projeto (2 min para iniciar).**

Consumir o cenário de preservação aprovado na W0 e `runtime/tests/db/test_migration_upgrade_preservation.py`. Os cinco limites `$phase0/$phase1/$phase2/$phase3/$phase4` são as versões máximas dos manifestos aprovados das respectivas ondas, extraídas e registradas pelo guardião antes da execução; não copiar datas deste plano. O candidato continua sendo `$candidate`.

```powershell
$upgradeRun = Join-Path (Get-Location).Path ('.superpowers/sdd/auditoria-ia-disposable/' + [guid]::NewGuid().ToString('N'))
pwsh -File scripts/test-disposable-db.ps1 -Action Prepare -RunDirectory $upgradeRun -MigrationThrough $phase0
pwsh -File scripts/test-disposable-db.ps1 -Action Replay -RunDirectory $upgradeRun
```

Antes do primeiro Upgrade, o guardião executa o arranjo sintético de preservação definido no plano filho W0, usando a conexão cuja identidade foi validada. Registrar IDs/conteúdo de profiles, organization_members, mensagens e grants; nenhum dado real. Ausência desse arranjo aprovado mantém a prova bloqueada, sem improvisar schema. Então executar, um estágio por vez:

```powershell
pwsh -File scripts/test-disposable-db.ps1 -Action Upgrade -RunDirectory $upgradeRun -MigrationThrough $phase1
pwsh -File scripts/test-disposable-db.ps1 -Action Upgrade -RunDirectory $upgradeRun -MigrationThrough $phase2
pwsh -File scripts/test-disposable-db.ps1 -Action Upgrade -RunDirectory $upgradeRun -MigrationThrough $phase3
pwsh -File scripts/test-disposable-db.ps1 -Action Upgrade -RunDirectory $upgradeRun -MigrationThrough $phase4
pwsh -File scripts/test-disposable-db.ps1 -Action Test -RunDirectory $upgradeRun
```

Interromper em qualquer falha e comparar asserções de preservação entre estágios; Upgrade não reseta dados nem encerra projeto ao passar. TestTargets vazio executa gates completos, incluindo o teste de preservação no conjunto DB, e Stop final. Se alguma onda posterior introduziu migration aprovada, acrescentar seu estágio a partir do manifesto correspondente antes do Test, até coincidir com todo o candidato.

- [ ] **Step 7b: coletar preservação e limite B1 (3 min).**

Registrar artefatos separados `replay-zero` e `upgrade-sequencial`, ambos com `commit == $candidate`, histórico ampliado apenas pelo sufixo previsto, identidade/sentinela constantes e dados sintéticos preservados. Exigir trigger `on_auth_user_created` único e todos gates verdes nos dois projetos encerrados. A sequência local não comprova reconciliação do histórico remoto fora de ordem: B1 precisa de alternativa aprovada e evidência específica, permanecendo impedimento de promoção quando ausente.

- [ ] **Step 8: iniciar Docker runtime do candidato (2 min).**

`docker build -t worder-runtime:sdd runtime`. Registrar SHA, início e imageId depois do exit 0; não usar tag antiga como se fosse rebuild atual.

- [ ] **Step 9: coletar build e smokes (3 min).**

```powershell
docker run --rm --network none --entrypoint python worder-runtime:sdd -c "import agents_runtime"
docker run --rm --network none --entrypoint id worder-runtime:sdd -u
docker run --rm --network none --entrypoint python worder-runtime:sdd -c "from pathlib import Path; from agents_runtime.evals.pack import load_rubrics; assert load_rubrics(Path('/app/evals/rubrics'))"
```

Esperado exit 0, UID 10001, rubricas acessíveis. Capturar imageId e finalizar grupo Docker. Não iniciar runtime com acesso a provedores.

- [ ] **Step 10: atestar SHA único e registrar GREEN (3 min).**

```powershell
if ((git rev-parse HEAD) -ne $candidate) { throw 'Candidate changed during verification' }
if (git status --porcelain) { throw 'Tracked candidate is dirty' }
```

Comparar SHA de todos os grupos e artifact DB. Gravar final-gates.json via ferramenta de edição com resultados observados; nenhum código de exemplo “PASS” antes de rodar. Provas externas W6 devem identificar commit implantado e compatibilidade com candidato; se mudança posterior tocar contrato observado, refazer prova relevante. CI deve ter headSha do candidato quando requerido; se não existe por falta de publicação autorizada, `AWAITING_EXTERNAL` bloqueia aceite integral.

**Commit/rollback:** Esta task não comita resultados ignorados, preservando o SHA congelado. O commit de entrega é o da Task 1. Rollback de execução é Stop do projeto próprio; nenhum dado remoto foi alterado. Qualquer correção de código exige nova revisão da onda dona, novo candidato e gates pertinentes novamente; nunca usar logs do SHA antigo.

### Task 3: W7 — revisão integral e handoff sem publicar

**Files:**
- Read: diff integral, relatório HTML/Markdown, ledgers W0–W7, `final-gates.json`.
- Artifact: `review-final.md` no workspace SDD.
- No source edits or remote writes.

**Interfaces:**
- Consumes: `BASE=04b916327e72be9f60950da2ec310f433db4e097`, `HEAD=candidate`; contexto adicional de comparação das duas origens; findings minor/rulings/decisões.
- Produces: `Spec PASS/FAIL`, `Quality APPROVED/CHANGES_REQUIRED`, `READY/NOT_READY`, riscos/rollback e lista exaustiva de rulings.
- Revisor final `gpt-6-astra`, xhigh, fresco e independente; controlador Astra high organiza handoff.

- [ ] **Step 1: gerar pacote integral (3 min).**

Usar `scripts/review-package PLAN_FILE BASE HEAD` da skill SDD, com o BASE exato acima, sem `HEAD~1`. Incluir referências aos dois diffs comparativos da Task 2, inventário de migrations e todas as linhas minor/parked/Ruling dos ledgers. Preservar identidade de cada plan; não editar ledger alheio.

- [ ] **Step 2: despachar revisão independente (2 min).**

Briefing contém caminhos do pacote, spec, relatório e gates; pede regressão nos três conflitos do sync (ai-usage, custom-tools route e teste), segurança de convites/item80, custos desconhecidos, limitação de corpo HTTP, contratos de filas/cupom e coerência de rollback. Não pedir rerun do mesmo teste já comprovado sem concern concreto. Revisor deve ler código/diff e indicar impossibilidades de verificação.

- [ ] **Step 3: resolver findings pelo dono (3 min).**

Critical/Important bloqueia entrega aprovada. Encaminhar uma rodada consolidada aos implementadores responsáveis, seguida de re-review focado; mudanças exigem novo SHA e revalidação. Se depois do limite da spec continuar falha material, registrar `NOT_READY`, evidência e alternativa; não converter severidade em Minor para liberar.

- [ ] **Step 4: verificar aceite final (3 min).**

Exigir: nenhuma pendência interna sem tratamento; três caixas antigas revalidadas; risco de convite fechado; nenhum Critical/Important; replay/RLS com duas orgs e papéis reais; app/runtime/DB/Docker mesmo SHA; evidências externas identificadas; 92 com janela real; review Astra APPROVED. Se a observação de oito dias ou CI externo ainda falta, relatório final diz “branch comparativa validada localmente; promoção bloqueada”, com início/fim/proximidade de prova e próximo checkpoint, sem chamar programa de concluído.

- [ ] **Step 5: entregar resultado e limites (3 min).**

Entregar branch e SHA, link ao HTML e Markdown, resumo de gates, diferenças relevantes para usuário, impedimentos e rollback. Reproduzir todas as rulings com custo se erradas. O commit desta onda é documental da Task 1; não criar commit vazio de aceite. Não apagar workspace SDD enquanto não houver conclusão, pois contém provas temporais e gates pós-commit.

Texto obrigatório de limite: “Nenhum push, merge, deploy ou migration remota foi executado. Qualquer publicação exige autorização explícita posterior para o SHA e destino indicados; Render está declarado com autoDeploy=true e seu vínculo real precisa ser confirmado.”

**Rollback:** Não houve promoção a reverter. Continuar na branch original é fallback de entrega; relatório local continua disponível. Revisão recusada preserva candidato para investigação, sem desfazer alterações do usuário.

## Autorrevisão de cobertura

A matriz da Task 1 cobre as 64 caixas originais e risco novo; Task 2 prova SHA/gates/isolamento; Task 3 cobre revisão integral, comparação e autorização separada. Não há implementação funcional escondida nesta onda. Evidência externa pendente pode ser documentada, mas item 92 e Critical/Important impedem conclusão. Nenhum teste recebe skip por conveniência e nenhum comando neste plano publica código.
