# Template Resync Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar a ambiguidade de IDs no cron de resync de templates WhatsApp (RPC `stale_pending_templates` × tabela `whatsapp_templates`) e endurecer a auth do cron, com lógica extraída e testada.

**Architecture:** O RPC passa a retornar colunas inequívocas (`row_id` = PK da tabela, `meta_template_id` = ID na Meta) mantendo a coluna legada `template_id` para rollout sem downtime; o route passa a usar essas colunas e deixa de fazer o SELECT extra por template. A lógica de mapeamento status Meta → payload de update e a autorização de cron viram funções puras em `src/lib/`, cobertas por testes Vitest.

**Tech Stack:** Next.js 14.0.4 (App Router), TypeScript 5, @supabase/supabase-js 2.39 (RPC + service role), Postgres/plpgsql (Supabase), Vitest 1.2.

## Global Constraints

- Migrações SQL são aplicadas manualmente no Supabase SQL Editor (ou via MCP `apply_migration`) e versionadas em `docs/` — não existe pipeline automático de migração (padrão do repo, ver `docs/whatsapp-onda5-fix-resync-templates.sql`).
- Testes: Vitest (`npm test` = `vitest run`); testes colocados junto do módulo (`src/lib/whatsapp/*.test.ts`), padrão já existente.
- Sem novas dependências npm.
- Prosa/comentários de migração em pt-BR; código TypeScript/SQL em inglês seguindo convenções do repo.
- Mensagens de commit no padrão do repo: `tipo(escopo): descrição` em pt-BR, ex.: `fix(whatsapp): ...`, `chore(db): ...`.
- Zero downtime: a ordem de deploy é migração SQL primeiro, depois o código do route; o RPC novo mantém a coluna legada `template_id` para o código antigo continuar funcionando durante a janela.
- A auth do cron deve ser fail-closed quando `CRON_SECRET` estiver definido, em qualquer ambiente; dev local sem secret continua funcionando.

---

## Fatos verificados no repo (base para todas as tasks)

- `src/app/api/cron/whatsapp-resync-templates/route.ts`: `authorize()` (linhas 9-17) retorna `NODE_ENV !== 'production'` como fallback — ou seja, em dev com `CRON_SECRET` definido e Bearer errado, ainda autoriza. Linhas 83-93 fazem SELECT extra em `whatsapp_templates` filtrando `.eq('id', tpl.template_id)`; linha 110 atualiza com o mesmo filtro.
- RPC versionado (`docs/whatsapp-onda5-fix-resync-templates.sql`, `docs/ALL-MIGRATIONS-CONSOLIDATED.sql` linhas 1251-1278, `worder-cloud-api-fixes/06-crons.sql` linhas 73-100): `RETURNS TABLE(template_id UUID, name TEXT, language TEXT, waba_id UUID, created_at TIMESTAMPTZ, age_minutes DOUBLE PRECISION)` e seleciona `t.id` como `template_id`. **Portanto, no SQL versionado, `template_id` do RPC É a PK** e o route funciona — a falha real é a ambiguidade: a tabela `whatsapp_templates` também tem colunas `template_id TEXT` e `meta_template_id TEXT` (IDs da Meta, ver `docs/ALL-MIGRATIONS-CONSOLIDATED.sql` linhas 533/538), então o mesmo nome significa PK no RPC e Meta-ID na tabela. O que está deployado em produção precisa ser confirmado (Task 1); se produção tiver uma versão que retorna `t.template_id`, o cron é no-op silencioso hoje.
- `getTemplateById` em `src/lib/whatsapp/cloud-api.ts:357`: `async getTemplateById(templateId: string): Promise<Template>`; `Template` (linhas 38-45): `{ id: string; name: string; language: string; status: string; category: string; components: any[] }`.
- Não existe `src/lib/cron-auth.ts`; a função `authorize()` está duplicada em ~25 crons de `src/app/api/cron/*` com pequenas variações (alguns fail-closed, ex. `shopify-token-refresh`; a maioria fail-open fora de produção).
- `whatsapp_templates` (schema consolidado) tem: `id UUID PK`, `template_id TEXT`, `meta_template_id TEXT`, `waba_id UUID`, `status TEXT`, `components JSONB`, `rejection_reason TEXT`, `synced_at TIMESTAMPTZ`.

**Decisão justificada (mismatch):** em vez de só ajustar o route (que continuaria acoplado a um nome ambíguo) ou só renomear (que quebraria o código antigo durante o deploy), o RPC passa a retornar **as três colunas**: `template_id UUID` (legado, = `t.id`, mantém o route atual funcionando), `row_id UUID` (= `t.id`, nome inequívoco) e `meta_template_id TEXT` (= `COALESCE(t.meta_template_id, t.template_id)`). Isso também elimina o SELECT extra por template no route (DRY, menos uma round-trip por template).

---

### Task 1: Diagnóstico do contrato real do RPC em produção

**Files:**
- Create: nenhum (task read-only; o resultado vira o comentário-cabeçalho da migração da Task 2)
- Modify: nenhum
- Test: verificação manual via SQL

**Interfaces:**
- Consumes: banco Supabase de produção (SQL Editor ou MCP `execute_sql`, somente leitura).
- Produces: confirmação escrita (colada no PR/commit da Task 2) de (a) qual definição do RPC está deployada e (b) quais colunas de ID existem em `whatsapp_templates`.

- [ ] **Step 1: Obter a definição deployada do RPC**

Rodar no Supabase SQL Editor (read-only):

```sql
SELECT pg_get_functiondef('stale_pending_templates(integer)'::regprocedure);
```

Esperado (se produção = SQL versionado): corpo contendo `SELECT t.id, t.name, ...` — ou seja, `template_id` do retorno é a PK. Se o corpo contiver `t.template_id` na primeira coluna, o cron está em no-op silencioso hoje (nada casa com `.eq('id', ...)`) e a Task 2 corrige isso de qualquer forma.

- [ ] **Step 2: Confirmar colunas de ID e NOT NULLs da tabela**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'whatsapp_templates'
  AND column_name IN ('id', 'template_id', 'meta_template_id', 'waba_id',
                      'status', 'components', 'rejection_reason', 'synced_at',
                      'body_text', 'organization_id');
```

Esperado: `id` (uuid), `template_id` (text), `meta_template_id` (text), `waba_id` (uuid), `synced_at` (timestamptz) presentes. Anotar quais colunas são `is_nullable = NO` (usado no INSERT da Task 6).

- [ ] **Step 3: Medir o sintoma (baseline)**

```sql
SELECT count(*) AS stale_count FROM stale_pending_templates(60);
SELECT count(*) AS pending_total FROM whatsapp_templates WHERE status = 'PENDING';
```

Esperado: números registrados como baseline. Se `stale_count > 0` e o cron vinha respondendo `updated: 0` com `checked > 0` nos logs da Vercel, o diagnóstico do no-op está confirmado.

- [ ] **Step 4: Registrar conclusão**

Escrever 2-3 linhas de conclusão (qual variante estava deployada + baseline) no cabeçalho da migração criada na Task 2. Sem commit nesta task.

---

### Task 2: Migração SQL — RPC com `row_id` e `meta_template_id` inequívocos

**Files:**
- Create: `docs/whatsapp-fix-stale-pending-templates-rpc-ids.sql`
- Modify: nenhum
- Test: smoke test SQL (read-only) no Supabase SQL Editor

**Interfaces:**
- Consumes: tabela `whatsapp_templates` (colunas confirmadas na Task 1).
- Produces: RPC `stale_pending_templates(p_threshold_minutes INTEGER DEFAULT 60)` retornando `TABLE(template_id UUID, name TEXT, language TEXT, waba_id UUID, created_at TIMESTAMPTZ, age_minutes DOUBLE PRECISION, row_id UUID, meta_template_id TEXT)`. As Tasks 5 e 6 dependem de `row_id` e `meta_template_id`.

- [ ] **Step 1: Criar o arquivo de migração**

Criar `docs/whatsapp-fix-stale-pending-templates-rpc-ids.sql` (preencher o bloco `-- Diagnóstico (Task 1):` com as conclusões reais):

```sql
-- =====================================================
-- Fix — stale_pending_templates: unambiguous IDs
-- =====================================================
-- Problema: o RPC retornava a PK de whatsapp_templates numa coluna
-- chamada template_id, mas a TABELA whatsapp_templates também tem uma
-- coluna template_id (TEXT, ID da Meta). O mesmo nome significa coisas
-- diferentes dependendo do contexto — receita para o cron
-- /api/cron/whatsapp-resync-templates virar no-op silencioso se alguém
-- "corrigir" o RPC para retornar t.template_id.
--
-- Diagnóstico (Task 1): [preencher: definição deployada + baseline]
--
-- Fix: retornar as tres colunas —
--   template_id      UUID  (legado, = t.id; mantém o route antigo vivo
--                           durante o rollout)
--   row_id           UUID  (= t.id, nome inequívoco — novo route usa este)
--   meta_template_id TEXT  (= COALESCE(t.meta_template_id, t.template_id);
--                           elimina o SELECT extra por template no route)
--
-- CREATE OR REPLACE não permite mudar o RETURNS TABLE, então é preciso
-- DROP + CREATE. Rodar no Supabase SQL Editor ANTES do deploy do route.

BEGIN;

DROP FUNCTION IF EXISTS stale_pending_templates(INTEGER);

CREATE FUNCTION stale_pending_templates(
  p_threshold_minutes INTEGER DEFAULT 60
)
RETURNS TABLE(
  template_id       UUID,
  name              TEXT,
  language          TEXT,
  waba_id           UUID,
  created_at        TIMESTAMPTZ,
  age_minutes       DOUBLE PRECISION,
  row_id            UUID,
  meta_template_id  TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.language,
    t.waba_id,
    t.created_at,
    (EXTRACT(EPOCH FROM (now() - t.created_at)) / 60.0)::DOUBLE PRECISION,
    t.id,
    COALESCE(t.meta_template_id, t.template_id)
  FROM whatsapp_templates t
  WHERE t.status = 'PENDING'
    AND t.created_at < now() - (p_threshold_minutes || ' minutes')::interval
  ORDER BY t.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION stale_pending_templates(INTEGER) TO service_role;

COMMIT;

-- Smoke test (read-only):
-- SELECT * FROM stale_pending_templates(60) LIMIT 5;
```

- [ ] **Step 2: Aplicar no Supabase**

Colar o arquivo inteiro no Supabase SQL Editor e executar (ou via MCP `apply_migration` com nome `whatsapp_fix_stale_pending_templates_rpc_ids`).
Esperado: `COMMIT` sem erro.

- [ ] **Step 3: Smoke test — verificar o novo contrato**

```sql
SELECT template_id, row_id, meta_template_id, name
FROM stale_pending_templates(0)
LIMIT 5;
```

Esperado: para cada linha, `template_id = row_id` (ambos UUID da PK) e `meta_template_id` TEXT (pode ser NULL para templates nunca sincronizados). Threshold `0` só para ver linhas se houver qualquer PENDING; se retornar 0 linhas e não houver PENDING no banco, o contrato ainda é validado pelo header do resultado (colunas presentes).

- [ ] **Step 4: Confirmar que o route ANTIGO ainda funciona (compat)**

Com a migração aplicada e o código antigo ainda deployado, chamar o cron em produção (ou aguardar a próxima execução agendada) e verificar nos logs da Vercel que a resposta continua `{"ok":true,...}` sem erro 500. O campo legado `template_id` garante isso.

- [ ] **Step 5: Commit**

```bash
git add docs/whatsapp-fix-stale-pending-templates-rpc-ids.sql
git commit -m "chore(db): stale_pending_templates retorna row_id e meta_template_id inequivocos (mantem template_id legado)"
```

---

### Task 3: Extrair e testar o mapeamento status Meta → update do banco

**Files:**
- Create: `src/lib/whatsapp/template-resync.ts`
- Test: `src/lib/whatsapp/template-resync.test.ts` (colocado, padrão de `src/lib/whatsapp/template-approval.test.ts`)

**Interfaces:**
- Consumes: `Template` de `src/lib/whatsapp/cloud-api.ts:38` (`{ id: string; name: string; language: string; status: string; category: string; components: any[] }`).
- Produces: `buildResyncUpdate(metaTemplate: Template, now?: Date): ResyncUpdate | null` e `interface ResyncUpdate { status: string; components?: any[]; rejection_reason?: string | null; synced_at: string }`. A Task 5 importa ambos.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/whatsapp/template-resync.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildResyncUpdate } from './template-resync';
import type { Template } from './cloud-api';

const base: Template = {
  id: '123456789',
  name: 'order_update',
  language: 'pt_BR',
  status: 'APPROVED',
  category: 'UTILITY',
  components: [{ type: 'BODY', text: 'Oi {{1}}' }],
};

const FIXED_NOW = new Date('2026-07-27T12:00:00.000Z');

describe('buildResyncUpdate', () => {
  it('returns null when Meta status is still PENDING', () => {
    expect(buildResyncUpdate({ ...base, status: 'PENDING' }, FIXED_NOW)).toBeNull();
  });

  it('returns null when Meta status is empty', () => {
    expect(buildResyncUpdate({ ...base, status: '' }, FIXED_NOW)).toBeNull();
  });

  it('maps APPROVED to an update with status, components and synced_at', () => {
    const update = buildResyncUpdate(base, FIXED_NOW);
    expect(update).toEqual({
      status: 'APPROVED',
      components: base.components,
      synced_at: '2026-07-27T12:00:00.000Z',
    });
  });

  it('omits components when Meta returns none', () => {
    const update = buildResyncUpdate(
      { ...base, components: undefined as unknown as any[] },
      FIXED_NOW
    );
    expect(update).not.toBeNull();
    expect(update).not.toHaveProperty('components');
  });

  it('maps REJECTED with rejected_reason into rejection_reason', () => {
    const rejected = {
      ...base,
      status: 'REJECTED',
      rejected_reason: 'INVALID_FORMAT',
    } as Template;
    expect(buildResyncUpdate(rejected, FIXED_NOW)).toEqual({
      status: 'REJECTED',
      components: base.components,
      rejection_reason: 'INVALID_FORMAT',
      synced_at: '2026-07-27T12:00:00.000Z',
    });
  });

  it('falls back to quality_score.reason, then null, for REJECTED', () => {
    const viaQuality = {
      ...base,
      status: 'REJECTED',
      quality_score: { reason: 'LOW_QUALITY' },
    } as Template;
    expect(buildResyncUpdate(viaQuality, FIXED_NOW)?.rejection_reason).toBe('LOW_QUALITY');

    const noReason = { ...base, status: 'REJECTED' } as Template;
    expect(buildResyncUpdate(noReason, FIXED_NOW)?.rejection_reason).toBeNull();
  });

  it('does not set rejection_reason for non-REJECTED statuses', () => {
    const update = buildResyncUpdate({ ...base, status: 'PAUSED' }, FIXED_NOW);
    expect(update).not.toBeNull();
    expect(update).not.toHaveProperty('rejection_reason');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/whatsapp/template-resync.test.ts`
Esperado: FAIL — `Cannot find module './template-resync'` (ou equivalente do resolver do Vitest).

- [ ] **Step 3: Implementação mínima**

Criar `src/lib/whatsapp/template-resync.ts` (semântica idêntica ao bloco atual das linhas 97-110 do route: chaves omitidas não tocam a coluna no update do supabase-js):

```typescript
import type { Template } from './cloud-api';

/**
 * Payload applied to whatsapp_templates when Meta reports a status
 * change for a template stuck in PENDING. Keys that are absent are
 * left untouched by supabase-js `.update()`.
 */
export interface ResyncUpdate {
  status: string;
  components?: any[];
  rejection_reason?: string | null;
  synced_at: string;
}

/**
 * Maps a Meta template payload to the DB update, or null when there is
 * nothing to sync (status missing or still PENDING).
 */
export function buildResyncUpdate(
  metaTemplate: Template,
  now: Date = new Date()
): ResyncUpdate | null {
  if (!metaTemplate.status || metaTemplate.status === 'PENDING') {
    return null;
  }

  const update: ResyncUpdate = {
    status: metaTemplate.status,
    synced_at: now.toISOString(),
  };

  if (metaTemplate.components) {
    update.components = metaTemplate.components;
  }

  if (metaTemplate.status === 'REJECTED') {
    update.rejection_reason =
      (metaTemplate as any).rejected_reason ??
      (metaTemplate as any).quality_score?.reason ??
      null;
  }

  return update;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/whatsapp/template-resync.test.ts`
Esperado: PASS — 7 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/template-resync.ts src/lib/whatsapp/template-resync.test.ts
git commit -m "feat(whatsapp): extrair buildResyncUpdate (status Meta -> update do banco) com testes"
```

---

### Task 4: Helper centralizado de auth de cron (fail-closed com CRON_SECRET)

**Files:**
- Create: `src/lib/cron-auth.ts`
- Test: `src/lib/cron-auth.test.ts` (colocado, padrão de `src/lib/crypto/secret-box.test.ts`)

**Interfaces:**
- Consumes: nada de outras tasks; `NextRequest` de `next/server` (só o tipo, no wrapper).
- Produces: `isCronAuthorized(headers: Pick<Headers, 'get'>, env: CronAuthEnv): boolean`, `interface CronAuthEnv { cronSecret?: string; nodeEnv?: string }` e `authorizeCronRequest(req: NextRequest): boolean`. A Task 5 importa `authorizeCronRequest`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/cron-auth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isCronAuthorized } from './cron-auth';

const headers = (init: Record<string, string>) => new Headers(init);

describe('isCronAuthorized', () => {
  it('accepts the x-vercel-cron header regardless of env', () => {
    expect(
      isCronAuthorized(headers({ 'x-vercel-cron': '1' }), {
        cronSecret: 's3cret',
        nodeEnv: 'production',
      })
    ).toBe(true);
    expect(
      isCronAuthorized(headers({ 'x-vercel-cron': '1' }), { nodeEnv: 'development' })
    ).toBe(true);
  });

  it('accepts a matching Bearer CRON_SECRET', () => {
    expect(
      isCronAuthorized(headers({ authorization: 'Bearer s3cret' }), {
        cronSecret: 's3cret',
        nodeEnv: 'production',
      })
    ).toBe(true);
  });

  it('rejects a wrong or missing Bearer when CRON_SECRET is set, EVEN in dev', () => {
    const env = { cronSecret: 's3cret', nodeEnv: 'development' };
    expect(isCronAuthorized(headers({ authorization: 'Bearer wrong' }), env)).toBe(false);
    expect(isCronAuthorized(headers({}), env)).toBe(false);
  });

  it('rejects everything in production when CRON_SECRET is unset (fail-closed)', () => {
    expect(isCronAuthorized(headers({}), { nodeEnv: 'production' })).toBe(false);
  });

  it('allows local dev without CRON_SECRET configured', () => {
    expect(isCronAuthorized(headers({}), { nodeEnv: 'development' })).toBe(true);
    expect(isCronAuthorized(headers({}), { nodeEnv: 'test' })).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/cron-auth.test.ts`
Esperado: FAIL — `Cannot find module './cron-auth'`.

- [ ] **Step 3: Implementação mínima**

Criar `src/lib/cron-auth.ts`:

```typescript
import type { NextRequest } from 'next/server';

export interface CronAuthEnv {
  cronSecret?: string;
  nodeEnv?: string;
}

/**
 * Shared cron authorization. Rules, in order:
 * 1. Vercel Cron (x-vercel-cron header) is always accepted — Vercel
 *    strips this header from external requests.
 * 2. If CRON_SECRET is configured, a matching `Authorization: Bearer`
 *    is REQUIRED — regardless of NODE_ENV. No fallthrough to dev mode.
 * 3. Only when CRON_SECRET is not configured, non-production
 *    environments are open (keeps local dev working without a secret).
 */
export function isCronAuthorized(
  headers: Pick<Headers, 'get'>,
  env: CronAuthEnv
): boolean {
  if (headers.get('x-vercel-cron')) return true;
  if (env.cronSecret) {
    return headers.get('authorization') === `Bearer ${env.cronSecret}`;
  }
  return env.nodeEnv !== 'production';
}

export function authorizeCronRequest(req: NextRequest): boolean {
  return isCronAuthorized(req.headers, {
    cronSecret: process.env.CRON_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/cron-auth.test.ts`
Esperado: PASS — 5 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cron-auth.ts src/lib/cron-auth.test.ts
git commit -m "feat(cron): helper central de auth fail-closed quando CRON_SECRET esta definido"
```

Nota (YAGNI): a duplicação de `authorize()` existe em ~25 crons de `src/app/api/cron/*`; este plano adota o helper apenas no cron de resync (Task 5). Migrar os demais é follow-up fora de escopo — o helper já foi desenhado (assinatura `Pick<Headers, 'get'>`) para essa adoção incremental.

---

### Task 5: Reescrever o route do cron usando row_id, buildResyncUpdate e authorizeCronRequest

**Files:**
- Modify: `src/app/api/cron/whatsapp-resync-templates/route.ts` (arquivo inteiro, 133 linhas)
- Test: suíte existente + `npx tsc --noEmit` (a lógica nova extraível já foi testada nas Tasks 3 e 4; o route vira orquestração fina de I/O)

**Interfaces:**
- Consumes: `authorizeCronRequest(req: NextRequest): boolean` de `@/lib/cron-auth` (Task 4); `buildResyncUpdate(metaTemplate: Template, now?: Date): ResyncUpdate | null` de `@/lib/whatsapp/template-resync` (Task 3); RPC com colunas `row_id UUID` e `meta_template_id TEXT` (Task 2); `getTemplateById(templateId: string): Promise<Template>` de `src/lib/whatsapp/cloud-api.ts:357`.
- Produces: resposta JSON inalterada `{ ok, checked, updated, errors? }` (contrato externo preservado).

- [ ] **Step 1: Substituir o conteúdo do route**

Substituir `src/app/api/cron/whatsapp-resync-templates/route.ts` inteiro por:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createWhatsAppCloudClient } from '@/lib/whatsapp/cloud-api';
import { getAccessToken } from '@/lib/whatsapp/account-loader';
import { authorizeCronRequest } from '@/lib/cron-auth';
import { buildResyncUpdate } from '@/lib/whatsapp/template-resync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface StaleTemplateRow {
  /** Legacy alias of row_id (table PK). Kept by the RPC for rollout compat. */
  template_id: string;
  name: string;
  language: string;
  waba_id: string;
  created_at: string;
  age_minutes: number;
  /** whatsapp_templates.id (PK) — unambiguous. */
  row_id: string;
  /** COALESCE(meta_template_id, template_id) from the table — Meta's ID. */
  meta_template_id: string | null;
}

export async function GET(req: NextRequest) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 1. Fetch templates stuck in PENDING status for more than 60 minutes
  const { data: staleTemplates, error } = await supabaseAdmin.rpc(
    'stale_pending_templates',
    { p_threshold_minutes: 60 }
  );

  if (error) {
    console.error('[resync-templates] RPC error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (staleTemplates || []) as StaleTemplateRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, updated: 0 });
  }

  // 2. Group templates by waba_id so we load each account once
  const byWaba = new Map<string, StaleTemplateRow[]>();
  for (const tpl of rows) {
    if (!byWaba.has(tpl.waba_id)) byWaba.set(tpl.waba_id, []);
    byWaba.get(tpl.waba_id)!.push(tpl);
  }

  let checked = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const [wabaId, templates] of byWaba) {
    // 3. Load the WABA account row for credentials
    const { data: account, error: accErr } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('id', wabaId)
      .single();

    if (accErr || !account) {
      errors.push(`WABA ${wabaId}: account not found`);
      continue;
    }

    let accessToken: string;
    try {
      accessToken = getAccessToken(account);
    } catch (e: any) {
      errors.push(`WABA ${wabaId}: ${e.message}`);
      continue;
    }

    const client = createWhatsAppCloudClient({
      phoneNumberId: account.phone_number_id,
      accessToken,
      wabaId: account.waba_id,
    });

    // 4. For each stale template, fetch current status from Meta
    for (const tpl of templates) {
      checked++;
      // Rollout safety: if the RPC migration was not applied yet,
      // row_id is undefined and template_id still carries the PK.
      const rowId = tpl.row_id ?? tpl.template_id;

      try {
        if (!tpl.meta_template_id) {
          errors.push(`Template ${rowId} (${tpl.name}): no Meta ID in DB`);
          continue;
        }

        const metaTemplate = await client.getTemplateById(tpl.meta_template_id);
        const update = buildResyncUpdate(metaTemplate);
        if (!update) continue; // still PENDING on Meta's side

        const { error: updateErr } = await supabaseAdmin
          .from('whatsapp_templates')
          .update(update)
          .eq('id', rowId);

        if (updateErr) {
          errors.push(`Template ${rowId}: update failed - ${updateErr.message}`);
        } else {
          updated++;
          console.log(
            `[resync-templates] Template "${tpl.name}" (${tpl.language}) updated: PENDING -> ${update.status}`
          );
        }
      } catch (e: any) {
        errors.push(`Template ${rowId} (${tpl.name}): Meta API error - ${e.message}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    checked,
    updated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
```

Mudanças vs. original: (a) `authorize()` local removido → `authorizeCronRequest` fail-closed; (b) SELECT extra por template (antigas linhas 83-93) removido — `meta_template_id` já vem do RPC; (c) filtro do update usa `rowId` (PK inequívoca, com fallback legado); (d) bloco de mapeamento de status (antigas linhas 97-110) → `buildResyncUpdate`. Contrato de resposta intacto.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Esperado: zero erros novos (comparar com a baseline rodando o mesmo comando antes do edit, se o repo tiver erros pré-existentes).

- [ ] **Step 3: Rodar a suíte inteira**

Run: `npm test`
Esperado: PASS — inclusive os testes das Tasks 3 e 4; nenhum teste existente quebrado.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/whatsapp-resync-templates/route.ts
git commit -m "fix(cron): resync de templates usa row_id/meta_template_id do RPC e auth fail-closed"
```

---

### Task 6: Verificação manual E2E — template PENDING falso + curl

**Files:**
- Create: nenhum
- Modify: nenhum
- Test: verificação manual (SQL + curl contra `npm run dev`), com cleanup

Pré-requisitos: migração da Task 2 aplicada no banco alvo (produção ou branch Supabase); `.env.local` apontando para esse banco com `SUPABASE_SERVICE_ROLE_KEY` válido.

**Interfaces:**
- Consumes: endpoint `GET /api/cron/whatsapp-resync-templates` (Task 5); RPC da Task 2.
- Produces: evidência (outputs de curl/SQL colados no PR) de que o cron não é mais no-op e de que a auth é fail-closed.

- [ ] **Step 1: Inserir template PENDING falso (com created_at antigo)**

No Supabase SQL Editor, usando uma WABA real existente (o `meta_template_id` falso força um erro rastreável na Meta, provando que o matching de IDs funcionou — o objetivo é sair do no-op silencioso, não aprovar template de mentira):

```sql
INSERT INTO whatsapp_templates
  (organization_id, name, language, status, components, waba_id, template_id, created_at)
SELECT
  wba.organization_id,
  'resync_test_fake',
  'pt_BR',
  'PENDING',
  '[]'::jsonb,
  wba.id,
  '000000000000000',
  now() - interval '2 hours'
FROM whatsapp_business_accounts wba
LIMIT 1
RETURNING id, waba_id;
```

Esperado: 1 linha inserida. Nota: se a Task 1 (Step 2) mostrou `body_text` com `is_nullable = NO` no seu banco, acrescente `body_text` à lista de colunas e o valor `'resync test'` ao SELECT, na mesma posição.

- [ ] **Step 2: Confirmar que o RPC enxerga o template falso**

```sql
SELECT row_id, meta_template_id, name FROM stale_pending_templates(60)
WHERE name = 'resync_test_fake';
```

Esperado: 1 linha com `row_id` = id retornado no Step 1 e `meta_template_id = '000000000000000'`.

- [ ] **Step 3: Subir o dev server e rodar o cron via curl (autorizado)**

Com `CRON_SECRET=local-test-secret` no `.env.local`:

```bash
npm run dev
# noutro terminal:
curl -s -H "Authorization: Bearer local-test-secret" \
  http://localhost:3000/api/cron/whatsapp-resync-templates
```

Esperado: HTTP 200 com `{"ok":true,"checked":1,...}` e um item em `errors` contendo o `row_id` (UUID) do template falso + `Meta API error` (o ID Meta `000000000000000` não existe). **`checked: 1` com o UUID certo no erro prova que o RPC → route casou os IDs** — antes do fix, um contrato errado produziria `no Meta ID in DB` ou update em linha nenhuma. Se você tiver um template PENDING real com `meta_template_id` válido, o esperado é vê-lo em `updated` ≥ 1 com log `PENDING -> APPROVED/REJECTED`.

- [ ] **Step 4: Verificar auth fail-closed (a regressão corrigida)**

Ainda em dev (`NODE_ENV=development`) com `CRON_SECRET` definido:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  http://localhost:3000/api/cron/whatsapp-resync-templates
# Esperado: 401  (antes do fix: 200, pois NODE_ENV !== 'production' abria tudo)

curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer wrong-secret" \
  http://localhost:3000/api/cron/whatsapp-resync-templates
# Esperado: 401

curl -s -o /dev/null -w "%{http_code}\n" -H "x-vercel-cron: 1" \
  http://localhost:3000/api/cron/whatsapp-resync-templates
# Esperado: 200 (simula o Vercel Cron; em produção esse header é
# controlado pela Vercel e não pode ser forjado externamente)
```

- [ ] **Step 5: Verificar dev sem secret continua aberto**

Remover/comentar `CRON_SECRET` do `.env.local`, reiniciar `npm run dev` e:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  http://localhost:3000/api/cron/whatsapp-resync-templates
# Esperado: 200 (dev local sem secret segue funcionando)
```

Restaurar `CRON_SECRET` no `.env.local` ao final.

- [ ] **Step 6: Cleanup do template falso**

```sql
DELETE FROM whatsapp_templates
WHERE name = 'resync_test_fake' AND template_id = '000000000000000';
```

Esperado: 1 linha deletada.

- [ ] **Step 7: Commit final (evidências no corpo do commit, se desejado) e push**

```bash
git status   # deve estar limpo de código; nada a commitar nesta task
git push origin claude/debug-console-error-FWrLE
```

---

## Autocheck (executado na escrita do plano)

- **Cobertura do spec:** diagnóstico do contrato do RPC (Task 1), correção do mismatch com decisão justificada e zero-downtime (Task 2 + Task 5), hardening da auth com helper centralizado `src/lib/cron-auth.ts` (Task 4 + Task 5), testes unitários da lógica extraível — mapeamento status Meta → DB (Task 3) e auth (Task 4) —, verificação manual com template PENDING falso + curl (Task 6). ✔
- **Placeholders:** nenhum "TBD"/"similar à Task N"; todo código é real e derivado dos arquivos lidos (`route.ts`, `cloud-api.ts:357`, `06-crons.sql`, `ALL-MIGRATIONS-CONSOLIDATED.sql:1251-1278`, `package.json`). O único campo a preencher é o resultado do diagnóstico da Task 1 dentro do comentário da migração, por definição só conhecido em execução. ✔
- **Consistência de nomes/tipos:** `row_id UUID`/`meta_template_id TEXT` (Task 2) = `StaleTemplateRow.row_id: string`/`meta_template_id: string | null` (Task 5); `buildResyncUpdate(metaTemplate: Template, now?: Date): ResyncUpdate | null` idêntico nas Tasks 3 e 5; `authorizeCronRequest(req: NextRequest): boolean` idêntico nas Tasks 4 e 5; `getTemplateById(templateId: string): Promise<Template>` confere com `cloud-api.ts:357`. ✔
