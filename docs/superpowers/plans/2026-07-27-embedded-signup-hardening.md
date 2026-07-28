# Embedded Signup Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar as 2 lacunas do Embedded Signup (Facebook/Meta) que geram conexões "bem-sucedidas" sem recebimento de mensagens: inscrição de webhook sem `subscribed_fields` explícito e persistência de token sem validação de escopos.

**Architecture:** Extraímos a validação `debug_token` (hoje inline em `src/app/api/whatsapp/connect/route.ts:367-406`) para um helper compartilhado `src/lib/whatsapp/token-validation.ts`, consumido pela rota manual (`connect`) e pela rota de Embedded Signup antes de qualquer persistência. Em paralelo, `subscribeAppToWABA` em `src/lib/whatsapp/cloud-api.ts` passa a enviar `subscribed_fields` explícito no body do POST `/{waba_id}/subscribed_apps`, cobrindo exatamente os fields que `src/lib/whatsapp/webhook-processor.ts` processa, sem depender da configuração de webhook fields no painel do app na Meta.

**Tech Stack:** Next.js 14 (App Router, route handlers), TypeScript 5, Vitest 1.2 (globals, environment node), Supabase, Meta Graph API v22.0 (`META_BASE_URL` de `src/lib/whatsapp/api-version.ts`).

## Global Constraints

- Versão Graph centralizada: importar `META_BASE_URL` de `@/lib/whatsapp/api-version` (v22.0) — nunca hardcodar URL/versão.
- Credenciais do app Meta vêm de `process.env.META_APP_ID` / `process.env.META_APP_SECRET` (padrão já usado em connect e embedded-signup).
- Mensagens de erro voltadas ao usuário em português brasileiro; código, identificadores e comentários novos em inglês (comentários pt-BR existentes preservados onde não forem tocados).
- Testes com Vitest: `npm test` roda `vitest run`; arquivos `*.test.ts` colocalizados em `src/lib/whatsapp/` (padrão do repo, ex.: `cloud-api-signature.test.ts`).
- Em falha de validação de token no Embedded Signup: retornar erro claro em pt-BR e NÃO persistir a conta (nenhum upsert em `whatsapp_business_accounts`).
- `validateBusinessToken` é best-effort quanto a falhas de rede/infra do próprio `debug_token` (segue em frente com warn) — mesmo comportamento que a rota connect já tem hoje; só reprova por expiry curto ou escopo faltando.
- Não alterar o contrato público existente de `subscribeAppToWABA` (`params: { wabaId, accessToken }` → `Promise<{ success: boolean }>`) — a rota connect também a consome (`src/app/api/whatsapp/connect/route.ts:4`).

---

### Task 1: Helper compartilhado `validateBusinessToken` (TDD)

**Files:**
- Create: `src/lib/whatsapp/token-validation.ts`
- Test: `src/lib/whatsapp/token-validation.test.ts`

**Interfaces:**
- Consumes: `META_BASE_URL` de `@/lib/whatsapp/api-version` (string, `https://graph.facebook.com/v22.0`); `fetch` global.
- Produces (Tasks 2 e 3 dependem destas assinaturas exatas):
  - `export const REQUIRED_TOKEN_SCOPES: readonly ['whatsapp_business_messaging', 'whatsapp_business_management']`
  - `export const MIN_TOKEN_LIFETIME_HOURS = 168`
  - `export interface TokenValidationResult { valid: boolean; error?: string }`
  - `export async function validateBusinessToken(params: { accessToken: string; appId: string; appSecret: string }): Promise<TokenValidationResult>`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/whatsapp/token-validation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateBusinessToken } from './token-validation';

const mockFetch = vi.fn();

function debugTokenResponse(data: unknown) {
  return { ok: true, json: async () => ({ data }) };
}

const CREDS = { accessToken: 'tok_123', appId: 'app_1', appSecret: 'secret_1' };
const ALL_SCOPES = ['whatsapp_business_messaging', 'whatsapp_business_management'];

describe('validateBusinessToken', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts a non-expiring token with both required scopes', async () => {
    mockFetch.mockResolvedValueOnce(
      debugTokenResponse({ expires_at: 0, scopes: ALL_SCOPES })
    );
    const result = await validateBusinessToken(CREDS);
    expect(result).toEqual({ valid: true });
  });

  it('calls debug_token with input_token and app credentials', async () => {
    mockFetch.mockResolvedValueOnce(
      debugTokenResponse({ expires_at: 0, scopes: ALL_SCOPES })
    );
    await validateBusinessToken(CREDS);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/debug_token?input_token=tok_123');
    expect(url).toContain(`access_token=${encodeURIComponent('app_1|secret_1')}`);
  });

  it('rejects a token expiring in less than 168h with pt-BR message', async () => {
    const in24h = Math.floor(Date.now() / 1000) + 24 * 3600;
    mockFetch.mockResolvedValueOnce(
      debugTokenResponse({ expires_at: in24h, scopes: ALL_SCOPES })
    );
    const result = await validateBusinessToken(CREDS);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Token expira em');
    expect(result.error).toContain('System User Access Token');
  });

  it('accepts a token expiring beyond 168h', async () => {
    const in30d = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
    mockFetch.mockResolvedValueOnce(
      debugTokenResponse({ expires_at: in30d, scopes: ALL_SCOPES })
    );
    const result = await validateBusinessToken(CREDS);
    expect(result.valid).toBe(true);
  });

  it('rejects a token missing whatsapp_business_management', async () => {
    mockFetch.mockResolvedValueOnce(
      debugTokenResponse({ expires_at: 0, scopes: ['whatsapp_business_messaging'] })
    );
    const result = await validateBusinessToken(CREDS);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('whatsapp_business_management');
    expect(result.error).toContain('permissões obrigatórias');
  });

  it('does not reject when scopes array is empty (Meta omitted scopes)', async () => {
    mockFetch.mockResolvedValueOnce(
      debugTokenResponse({ expires_at: 0, scopes: [] })
    );
    const result = await validateBusinessToken(CREDS);
    expect(result.valid).toBe(true);
  });

  it('is best-effort: returns valid when debug_token request throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    const result = await validateBusinessToken(CREDS);
    expect(result.valid).toBe(true);
  });

  it('is best-effort: returns valid when response has no data envelope', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const result = await validateBusinessToken(CREDS);
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npx vitest run src/lib/whatsapp/token-validation.test.ts`
Esperado: FAIL — `Cannot find module './token-validation'` (ou equivalente de resolução de import).

- [ ] **Step 3: Implementação mínima**

Criar `src/lib/whatsapp/token-validation.ts`:

```typescript
// =============================================
// Meta access token validation via debug_token.
// Shared by the manual connect route and the
// Embedded Signup route — validate BEFORE persisting.
// =============================================

import { META_BASE_URL } from './api-version';

export const REQUIRED_TOKEN_SCOPES = [
  'whatsapp_business_messaging',
  'whatsapp_business_management',
] as const;

export const MIN_TOKEN_LIFETIME_HOURS = 168;

export interface TokenValidationResult {
  valid: boolean;
  /** User-facing message in pt-BR when valid === false. */
  error?: string;
}

/**
 * Validates an access token against Meta's debug_token endpoint:
 * - rejects tokens expiring in < MIN_TOKEN_LIFETIME_HOURS
 * - rejects tokens missing any of REQUIRED_TOKEN_SCOPES
 *
 * Best-effort: failures of the debug_token call itself (network, Meta 5xx,
 * malformed response) do NOT block — returns { valid: true } with a warn,
 * matching the historical behavior of the manual connect route.
 */
export async function validateBusinessToken(params: {
  accessToken: string;
  appId: string;
  appSecret: string;
}): Promise<TokenValidationResult> {
  try {
    const res = await fetch(
      `${META_BASE_URL}/debug_token?input_token=${encodeURIComponent(params.accessToken)}` +
        `&access_token=${encodeURIComponent(`${params.appId}|${params.appSecret}`)}`
    );
    const dbg = await res.json();

    if (!dbg?.data) return { valid: true };

    if (typeof dbg.data.expires_at === 'number' && dbg.data.expires_at > 0) {
      const hoursLeft = (dbg.data.expires_at * 1000 - Date.now()) / 3600000;
      if (hoursLeft < MIN_TOKEN_LIFETIME_HOURS) {
        return {
          valid: false,
          error:
            `Token expira em ${Math.round(hoursLeft)}h. Use um System User Access Token (não expira) ` +
            `gerado em Business Manager → Usuários do Sistema → Gerar novo token.`,
        };
      }
    }

    const scopes: string[] = Array.isArray(dbg.data.scopes) ? dbg.data.scopes : [];
    const missing = REQUIRED_TOKEN_SCOPES.filter((s) => !scopes.includes(s));
    if (scopes.length > 0 && missing.length > 0) {
      return {
        valid: false,
        error:
          `Token sem permissões obrigatórias: ${missing.join(', ')}. ` +
          `Edite o System User no Business Manager e adicione esses escopos.`,
      };
    }

    return { valid: true };
  } catch (e) {
    // debug_token is best-effort — if Meta itself fails, proceed.
    console.warn('debug_token check falhou (seguindo):', (e as Error)?.message);
    return { valid: true };
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npx vitest run src/lib/whatsapp/token-validation.test.ts`
Esperado: PASS — 8 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/token-validation.ts src/lib/whatsapp/token-validation.test.ts
git commit -m "feat(whatsapp): extrair validacao debug_token para helper compartilhado token-validation"
```

---

### Task 2: Rota manual `connect` passa a usar o helper (DRY)

**Files:**
- Modify: `src/app/api/whatsapp/connect/route.ts:367-406` (bloco "B.5 — Token quality check" dentro de `validateCredentials`) e bloco de imports (`:1-11`)

**Interfaces:**
- Consumes (da Task 1): `validateBusinessToken(params: { accessToken: string; appId: string; appSecret: string }): Promise<TokenValidationResult>` de `@/lib/whatsapp/token-validation`.
- Produces: nenhum símbolo novo — `validateCredentials` mantém exatamente o mesmo retorno `{ valid, error?, details?, businessName?, phoneNumber?, wabaId? }`.

- [ ] **Step 1: Adicionar o import**

Em `src/app/api/whatsapp/connect/route.ts`, logo após a linha `import { encryptToken } from '@/lib/whatsapp/token-encryption';` (linha 8), adicionar:

```typescript
import { validateBusinessToken } from '@/lib/whatsapp/token-validation';
```

- [ ] **Step 2: Substituir o bloco inline por chamada ao helper**

Substituir o bloco das linhas 367-406 (de `// B.5 — Token quality check via debug_token...` até o fim do `catch` com `console.warn('debug_token check falhou (seguindo)...')` inclusive) por:

```typescript
    // B.5 — Token quality check via debug_token (helper compartilhado com o
    // Embedded Signup). Só roda se o app tem credenciais.
    const appId = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET
    if (appId && appSecret) {
      const tokenCheck = await validateBusinessToken({ accessToken, appId, appSecret })
      if (!tokenCheck.valid) {
        return { valid: false, error: tokenCheck.error }
      }
    }
```

Observação: `accessToken` já é o primeiro parâmetro de `validateCredentials` (linha 335) — nada mais muda na função.

- [ ] **Step 3: Verificar tipos e testes existentes**

Rodar: `npx tsc --noEmit`
Esperado: zero erros novos (comparar com baseline antes da mudança, se o repo já tiver erros pré-existentes).

Rodar: `npm test`
Esperado: PASS — nenhuma suíte existente quebra (a rota connect não tem teste próprio; a suíte inteira serve de regressão).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/whatsapp/connect/route.ts
git commit -m "refactor(whatsapp): connect usa helper validateBusinessToken (sem mudanca de comportamento)"
```

---

### Task 3: Embedded Signup valida o token ANTES de persistir

**Files:**
- Modify: `src/app/api/whatsapp/cloud/embedded-signup/route.ts:113-139` (entre o Step 1 — code exchange — e o Step 2 — subscribe) e bloco de imports (`:18-30`)

**Interfaces:**
- Consumes (da Task 1): `validateBusinessToken(params: { accessToken: string; appId: string; appSecret: string }): Promise<TokenValidationResult>` de `@/lib/whatsapp/token-validation`.
- Produces: novo erro HTTP 400 da rota com shape `{ error: 'token_validation_failed', detail: string }` (`detail` em pt-BR, vindo do helper). Nenhuma linha é gravada em `whatsapp_business_accounts` quando isso acontece (o upsert só existe no Step 4 da rota, que nunca é alcançado).

- [ ] **Step 1: Adicionar o import**

Em `src/app/api/whatsapp/cloud/embedded-signup/route.ts`, logo após a linha `import { encryptToken } from '@/lib/whatsapp/token-encryption';` (linha 28), adicionar:

```typescript
import { validateBusinessToken } from '@/lib/whatsapp/token-validation';
```

- [ ] **Step 2: Inserir a validação entre o code exchange e o subscribe**

Logo após o fechamento do `catch` do Step 1 (linha 128, antes do comentário `// Step 2 — subscribe our app to WABA`), inserir:

```typescript
    // Step 1.5 — validate token scopes/expiry BEFORE any Meta side-effects or
    // persistence. Without whatsapp_business_management the connection would be
    // saved as 'active' and fail later with error 190 (audit: MEDIUM gap #2).
    const validation = await validateBusinessToken({
      accessToken: businessToken,
      appId,
      appSecret,
    });
    if (!validation.valid) {
      console.error('[embedded-signup] token validation failed:', validation.error);
      return NextResponse.json(
        {
          error: 'token_validation_failed',
          detail:
            validation.error ||
            'Token retornado pela Meta sem as permissões necessárias. Refaça a conexão com o Facebook.',
        },
        { status: 400 }
      );
    }
```

Observação: `appId` e `appSecret` já estão em escopo (linhas 104-105 da rota) e já foram checados como não-nulos (linha 106) — não repetir o guard.

- [ ] **Step 3: Verificar tipos e regressão**

Rodar: `npx tsc --noEmit`
Esperado: zero erros novos.

Rodar: `npm test`
Esperado: PASS (a validação da lógica do helper já está coberta pela Task 1; a fiação da rota é coberta pelo smoke da Task 5).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/whatsapp/cloud/embedded-signup/route.ts
git commit -m "fix(whatsapp): embedded signup valida escopos/expiry do token via debug_token antes de persistir"
```

---

### Task 4: `subscribeAppToWABA` envia `subscribed_fields` explícito (TDD)

**Files:**
- Modify: `src/lib/whatsapp/cloud-api.ts:865-885` (função `subscribeAppToWABA` e docstring)
- Test: `src/lib/whatsapp/subscribe-app.test.ts` (novo)

**Interfaces:**
- Consumes: `META_BASE_URL` de `./api-version`; `WhatsAppCloudError` (já exportada em `cloud-api.ts:659`).
- Produces (a rota connect e a rota embedded-signup já consomem — assinatura NÃO muda):
  - `export const WABA_SUBSCRIBED_FIELDS: readonly ['messages', 'message_template_status_update', 'template_category_update', 'phone_number_quality_update']`
  - `export async function subscribeAppToWABA(params: { wabaId: string; accessToken: string }): Promise<{ success: boolean }>` (inalterada)

Nota de escopo (YAGNI): os 4 fields acima são exatamente os `case` do `switch (field)` em `src/lib/whatsapp/webhook-processor.ts:72-216`. `account_update` NÃO entra — o processor o descarta como `unhandled_field` (linha 212-215); inscrever-se nele só geraria ruído.

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/whatsapp/subscribe-app.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  subscribeAppToWABA,
  WABA_SUBSCRIBED_FIELDS,
  WhatsAppCloudError,
  META_BASE_URL,
} from './cloud-api';

const mockFetch = vi.fn();

describe('subscribeAppToWABA', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to /{wabaId}/subscribed_apps with explicit subscribed_fields body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const result = await subscribeAppToWABA({ wabaId: '111222333', accessToken: 'tok_abc' });

    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${META_BASE_URL}/111222333/subscribed_apps`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok_abc');

    const body = JSON.parse(init.body);
    expect(body.subscribed_fields).toEqual([
      'messages',
      'message_template_status_update',
      'template_category_update',
      'phone_number_quality_update',
    ]);
  });

  it('always includes "messages" — the field that makes inbound work', () => {
    expect(WABA_SUBSCRIBED_FIELDS).toContain('messages');
  });

  it('throws WhatsAppCloudError when Meta returns an error payload', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Unsupported post request', code: 100 } }),
    });

    await expect(
      subscribeAppToWABA({ wabaId: '111222333', accessToken: 'tok_abc' })
    ).rejects.toBeInstanceOf(WhatsAppCloudError);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npx vitest run src/lib/whatsapp/subscribe-app.test.ts`
Esperado: FAIL — o import de `WABA_SUBSCRIBED_FIELDS` não existe ainda (SyntaxError/undefined export) e/ou `init.body` é `undefined` no primeiro teste.

- [ ] **Step 3: Implementação mínima**

Em `src/lib/whatsapp/cloud-api.ts`, substituir a função atual (linhas 865-885, incluindo a docstring `Subscribe your app to a WABA's webhook events...`) por:

```typescript
/**
 * Webhook fields this app actually processes — must mirror the switch(field)
 * cases in webhook-processor.ts. Sent explicitly on subscribe so message
 * delivery does NOT depend on the app dashboard's webhook field config.
 */
export const WABA_SUBSCRIBED_FIELDS = [
  'messages',
  'message_template_status_update',
  'template_category_update',
  'phone_number_quality_update',
] as const;

/**
 * Subscribe your app to a WABA's webhook events. Must be called once per
 * WABA after Embedded Signup completes — without this, no inbound messages.
 * Sends subscribed_fields explicitly (audit: MEDIUM gap #1) instead of
 * relying on the Meta app dashboard webhook configuration.
 */
export async function subscribeAppToWABA(params: {
  wabaId: string;
  accessToken: string;
}): Promise<{ success: boolean }> {
  const res = await fetch(`${META_BASE_URL}/${params.wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subscribed_fields: WABA_SUBSCRIBED_FIELDS }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new WhatsAppCloudError(data.error || { message: 'subscribe failed', code: res.status });
  }
  return data;
}
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npx vitest run src/lib/whatsapp/subscribe-app.test.ts`
Esperado: PASS — 3 testes verdes.

Rodar: `npm test`
Esperado: PASS — regressão total (connect e embedded-signup consomem a mesma função; a assinatura não mudou).

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/cloud-api.ts src/lib/whatsapp/subscribe-app.test.ts
git commit -m "fix(whatsapp): subscribeAppToWABA envia subscribed_fields explicito (messages + template/quality updates)"
```

---

### Task 5: Smoke manual do fluxo Embedded Signup completo

**Files:**
- Test: verificação manual (sem arquivo) — o fluxo depende de FB.login + Meta Graph reais, fora do alcance do Vitest.

**Interfaces:**
- Consumes: rota `POST /api/whatsapp/cloud/embedded-signup` (Tasks 3 e 4 aplicadas), frontend `WhatsAppEmbeddedSignup.tsx`, feature flag `whatsapp_embedded_signup`, env `META_APP_ID`/`META_APP_SECRET` configurados no ambiente de teste.
- Produces: evidência de que conexão via Embedded Signup termina com conta `active` que RECEBE webhook de mensagem inbound.

- [ ] **Step 1: Preparar ambiente**

1. Ambiente com URL pública (staging/preview) apontando o webhook do app Meta para `/api/whatsapp/cloud/webhook` (ou a rota de webhook configurada no app).
2. Confirmar `META_APP_ID` e `META_APP_SECRET` setados (`vercel env ls` ou painel do ambiente).
3. Habilitar a flag `whatsapp_embedded_signup` para a org de teste (tabela `feature_flags` — sem isso a rota retorna 403 `embedded_signup_disabled`).

- [ ] **Step 2: Executar o fluxo code → token → subscribe → register**

1. Logar na org de teste, abrir a tela de conexão WhatsApp e iniciar o Embedded Signup (FB.login) com uma conta Meta de teste que tenha um número disponível.
2. No DevTools (aba Network), confirmar que `POST /api/whatsapp/cloud/embedded-signup` respondeu `200` com `{ success: true, account: { status: 'active', ... } }`.
3. Caso de erro esperado: se a Meta devolver token sem `whatsapp_business_management`, a resposta deve ser `400 { error: 'token_validation_failed', detail: 'Token sem permissões obrigatórias: ...' }` e NENHUMA linha nova deve existir em `whatsapp_business_accounts` para esse `phone_number_id` (checar via SQL no passo 3).

- [ ] **Step 3: Verificar persistência e inscrição do webhook**

1. SQL (Supabase): `select waba_id, phone_number_id, status, connection_method from whatsapp_business_accounts where connection_method = 'embedded_signup' order by created_at desc limit 1;` → esperado `status = 'active'`.
2. Confirmar a inscrição na Meta (usar o token do System User/admin do app):

```bash
curl -s "https://graph.facebook.com/v22.0/{WABA_ID}/subscribed_apps" \
  -H "Authorization: Bearer {BUSINESS_TOKEN}"
```

Esperado: o app aparece em `data[]` e, quando retornado pela Meta, `subscribed_fields` (ou `whatsapp_business_api_data`) inclui `messages`.

- [ ] **Step 4: Verificar recebimento de webhook (o ponto da auditoria)**

1. Do celular, enviar uma mensagem de texto real PARA o número recém-conectado.
2. Verificar nos logs do ambiente (`vercel logs` ou painel) a chegada do webhook com `field: 'messages'` e processamento sem `skipped`/`unknown_phone_number_id`.
3. Confirmar que a mensagem aparece no inbox da org (tabela de conversas/mensagens ou UI do inbox).
4. Se o inbound NÃO chegar: rodar o curl do Step 3 novamente e comparar `subscribed_fields` — é o discriminador entre falha do fix da Task 4 e problema de configuração do webhook do app.

- [ ] **Step 5: Registrar resultado e commit final**

Anotar no PR o resultado do smoke (prints/logs). Nenhum commit de código nesta task; se o smoke revelar ajuste, tratá-lo como fix dedicado:

```bash
git commit --allow-empty -m "chore(whatsapp): smoke manual do embedded signup validado (inbound OK)"
```

---

## Autocheck (executado na escrita do plano)

- Cobertura: Fix #1 (subscribed_fields) → Task 4; Fix #2 (validação de token antes de persistir) → Tasks 1 + 3; DRY com a rota connect → Task 2; smoke E2E code → token → subscribe → register → inbound → Task 5.
- Placeholders: nenhum — todo step de código traz o código completo; comandos e resultados esperados explícitos.
- Consistência: `validateBusinessToken({ accessToken, appId, appSecret })` idêntica nas Tasks 1, 2 e 3; `WABA_SUBSCRIBED_FIELDS` idêntico entre implementação e teste na Task 4; fields espelham exatamente os `case` de `webhook-processor.ts:72-216` (`messages`, `message_template_status_update`, `template_category_update`, `phone_number_quality_update`).
