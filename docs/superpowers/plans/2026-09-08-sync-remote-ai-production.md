# Sync Remote AI Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar os 46 commits exclusivos do remoto ao motor de IA auditado localmente, em branch comparativa, sem perder correções de segurança ou histórico de migrations.

**Architecture:** A integração parte de `f0be8061` e recebe `origin/claude/debug-console-error-FWrLE` por merge explícito. Os três conflitos textuais são resolvidos semanticamente; depois, os auto-merges do motor e do banco são revisados por invariantes e gates focados antes dos gates amplos.

**Tech Stack:** Git, Next.js 14, TypeScript, Vitest, Python 3, pytest, Ruff, Supabase/Postgres.

**Spec:** `docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md`

## Global Constraints

- Não alterar `claude/debug-console-error-FWrLE` nem sua worktree principal.
- Branch de integração: `integration/sync-remote-ai-2026-09-08`.
- Origem local auditada: `f0be8061`; origem remota: `4847440c`; merge-base: `f0196638`.
- Não usar resolução global `ours`/`theirs`.
- Preservar migrations dos dois lados; nenhuma migration aplicada a banco real nesta etapa.
- Manter RLS, escopo por organização, redaction e limites de resposta conquistados pela auditoria.
- Rollback: abandonar a branch/worktree; nenhuma mudança é aplicada à branch original ou a ambiente externo.

---

### Task 1: Congelar referências e baseline

**Files:**
- Create: `docs/superpowers/plans/2026-09-08-sync-remote-ai-production.md`

**Interfaces:**
- Consumes: `f0be8061`, `4847440c`, `f0196638`.
- Produces: branch e worktree isoladas com referências imutáveis registradas.

- [x] **Step 1: Criar worktree a partir do HEAD auditado**

Run: `git worktree add .worktrees/sync-remote-ai-2026-09-08 -b integration/sync-remote-ai-2026-09-08 f0be8061`

- [x] **Step 2: Simular o merge sem alterar index/worktree**

Run: `git merge-tree --write-tree --name-only HEAD origin/claude/debug-console-error-FWrLE`

Expected: exatamente três conflitos: AI usage page, custom-tool test route e seu teste.

- [x] **Step 3: Executar baseline focado**

Run: TypeScript sem emissão, testes da rota de custom tool, testes de AI usage e runtime unit.

Resultado inicial: `tsc --noEmit` passou; os 9 testes focados passaram. O runtime completo fica para o gate final, pois não participa dos três conflitos textuais.

Expected: registrar qualquer falha preexistente antes do merge.

### Task 2: Mesclar e resolver os três conflitos

**Files:**
- Modify: `src/app/(dashboard)/settings/ai-usage/page.tsx`
- Modify: `src/app/api/ai/custom-tools/[id]/test/route.ts`
- Modify: `src/app/api/ai/custom-tools/[id]/test/route.test.ts`
- Preserve: `src/app/api/ai/custom-tools/[id]/test/refusal-message.ts`
- Preserve: `src/app/(dashboard)/settings/ai-usage/usage-label.ts`

**Interfaces:**
- Consumes: novo design system remoto e contratos de custo/SSRF locais.
- Produces: UI nova com custo desconhecido explícito; rota SSRF com mensagem extraída e leitura limitada.

- [x] **Step 1: Iniciar merge sem commit**

Run: `git merge --no-ff --no-commit origin/claude/debug-console-error-FWrLE`

Expected: somente os três conflitos simulados.

- [x] **Step 2: Resolver AI usage**

Usar a nova página remota baseada em `Card`, `Meter`, `Tabs` e `useApi`, acrescentando ao contrato:

```ts
unknownCostCalls?: number
hasUnknownCost?: boolean
```

O rótulo do custo usa `costLabel(data.totals, data.budget)` e a tela mantém o aviso de custo parcial.

- [x] **Step 3: Resolver custom-tool route**

Preservar a importação remota:

```ts
import { GENERIC_REFUSAL_MESSAGE } from './refusal-message'
```

Preservar também `MAX_BODY_CHARS`, `MAX_BODY_BYTES`, `readResponseText()` e o cancelamento da stream ao atingir o teto.

- [x] **Step 4: Resolver o teste de custom tool**

Importar `GENERIC_REFUSAL_MESSAGE` do módulo extraído e manter os testes de texto curto e cancelamento no limite de bytes.

- [x] **Step 5: Provar ausência de conflitos pendentes**

Run: `git diff --name-only --diff-filter=U`

Expected: saída vazia.

### Task 3: Auditar os auto-merges críticos

**Files:**
- Review: `runtime/src/agents_runtime/**`
- Review: `src/lib/ai/**`
- Review: `src/app/api/ai/**`
- Review: `src/app/api/queue/**`
- Review: `src/middleware.ts`
- Review: `supabase/migrations/**`

**Interfaces:**
- Consumes: auto-merge Git dos dois históricos.
- Produces: prova de que correções locais e recursos remotos coexistem.

- [x] **Step 1: Conferir inventário de migrations**

Confirmar que as migrations locais de 2026-09-01 a 2026-09-05 permanecem e que as migrations remotas de 2026-09-04 a 2026-09-09 entram sem nome duplicado ou contração destrutiva implícita.

- [x] **Step 2: Conferir invariantes de tenant e privilégio**

Revisar RLS habilitada em tabelas expostas, views `security_invoker`, revokes de funções `SECURITY DEFINER`, `search_path` fixo e organização derivada da autenticação nas rotas privilegiadas.

- [x] **Step 3: Conferir invariantes do motor de IA**

Verificar guard pre-send, cascade BYO, metering/custo desconhecido, SSRF, resposta limitada, outbox idempotente, isolamento multi-tenant e cinco XFAIL conhecidos.

- [x] **Step 4: Registrar conflitos semânticos adicionais**

Qualquer regressão encontrada no auto-merge recebe arquivo, impacto, decisão e teste; nenhuma limpeza fora de escopo.

### Task 4: Executar gates

**Files:**
- Test: `src/app/api/ai/custom-tools/[id]/test/route.test.ts`
- Test: `src/app/(dashboard)/settings/ai-usage/page.test.ts`
- Test: suítes `src/lib/ai/**` e `runtime/tests/unit/**`

**Interfaces:**
- Consumes: árvore integrada sem conflitos.
- Produces: resultados reproduzíveis para decisão de produção.

- [x] **Step 1: Rodar testes focados dos conflitos**

Run: Vitest da custom tool e AI usage.

Expected: todos verdes.

- [x] **Step 2: Rodar TypeScript e build**

Run: `tsc --noEmit` e `next build`.

Expected: exit 0.

- [x] **Step 3: Rodar gates JavaScript e Python**

Run: Vitest completo, Ruff e runtime unit.

Expected: registrar passes, falhas e XFAILs exatamente; não chamar vermelho de verde.

- [x] **Step 4: Avaliar gate DB/RLS**

Executar somente com `SUPABASE_DB_URL` explicitamente apontando ao banco descartável 55322 e guard de identidade aprovado. Sem isso, marcar como não executado, nunca usar 54322 por fallback.

### Task 5: Consolidar comparação e commit local

**Files:**
- Create: `docs/SYNC-REMOTE-AI-2026-09-08.md`
- Update: `docs/AUDITORIA-IA-2026-08-28-CHECKLIST.md` somente se a reavaliação mudar um veredito.

**Interfaces:**
- Consumes: diff final e resultados dos gates.
- Produces: branch comparativa pronta para revisão, sem push ou deploy.

- [x] **Step 1: Escrever relatório de conflitos**

Registrar os três conflitos textuais, decisões, auto-merges críticos, riscos residuais e referência de rollback.

- [x] **Step 2: Atualizar a avaliação do motor de IA**

Classificar cada pendência anterior como resolvida, parcial, ainda aberta ou nova regressão no HEAD integrado.

- [x] **Step 3: Criar commit de merge local**

Run: `git commit` após todos os arquivos resolvidos e documentação pronta.

Expected: commit com dois pais, branch original intacta, nenhum push/deploy.

- [x] **Step 4: Entregar comparação**

Reportar branch, SHA, conflitos, decisões, gates e riscos que impedem produção.
