# AI Response Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir que nenhuma mensagem inbound de cliente fique sem resposta da IA silenciosamente: falhas transient ganham retry com cap e backoff; falhas permanent desligam o bot com visibilidade (alerta + notificação); esgotamento de tentativas emite `whatsapp.ai.gave_up` + alerta.

**Architecture:** Classificador puro de falhas (`classifyAiFailure`) usado pelo cloud-runner para distinguir transient/permanent/skip. Estratégia de retry escolhida: **self-reschedule pelo próprio worker** (repõe `ai_pending=true` + `ai_debounce_until` com backoff e re-enfileira via QStash), com **sweep no cron existente** `reprocess-whatsapp-pending` como rede de segurança para jobs QStash perdidos. Nova coluna `ai_retry_count` na conversa serve de cap. Falha permanent mantém o disable com `ai_disabled_reason`, mas agora com `sendAlert` (novo type `ai_response_failed`) + insert em `notifications`.

**Tech Stack:** Next.js App Router (route handlers), Supabase (supabaseAdmin + migration SQL + RPC), QStash (`enqueueWhatsAppAiRespond`), Vitest, `wlog`, `sendAlert`.

**Worktree:** `D:\worder1-fwrle` (branch `claude/debug-console-error-FWrLE`, HEAD `8a378fe4`).

---

## Investigação — estado atual (com file:line)

### Fluxo completo hoje

1. **Ingestão**: webhook público persiste raw payload em `whatsapp_webhook_events` e enfileira `/api/workers/whatsapp-webhook` via QStash com `retries: 3` (`src/lib/queue.ts:352-376`).
2. **Webhook worker** (`src/app/api/workers/whatsapp-webhook/route.ts`): claim atômico via RPC `claim_whatsapp_webhook_event` (linha 87-90), processa, e **marca o evento `done` IMEDIATAMENTE após `processWebhookPayload` retornar** (linhas 103-104). O processamento da IA é assíncrono e acontece DEPOIS — em outro job.
3. **webhook-processor** (`src/lib/whatsapp/webhook-processor.ts:361-404`): marca `ai_pending=true` + `ai_debounce_until` (linha 377) e enfileira `/api/workers/whatsapp-ai-respond` com `retries: 1` (`src/lib/queue.ts:407-419`). O try/catch em volta (linha 405-410) nunca quebra o webhook.
4. **AI worker** (`src/app/api/workers/whatsapp-ai-respond/route.ts`):
   - **Claim atômico consome `ai_pending=true → false` ANTES de rodar o LLM** (linhas 114-120).
   - Chama `maybeRunAgentForCloudConversation` (linha 166).
   - **Catch retorna 200 SEMPRE** (linhas 177-184), e mesmo o caminho de sucesso retorna 200 quando `result.error` está setado (linha 176) — design anti-retempest.
5. **cloud-runner** (`src/lib/ai/cloud-runner.ts`): guards (cooldown linhas 129-146, `max_messages_per_conversation` 149-161, `stop_on_human_reply` 164-177), BYO-key 182-210, engine 251-283, trace 287-310, envio 345-361.
6. **Envio** (`src/lib/ai/cloud-sender.ts`): se a 1ª bolha falha na Meta API, retorna `{ sent: false, error }` (linhas 212-214, 248-250) — zero mensagens enviadas. Se bolhas posteriores falham, `sent: true` parcial (linha 216).

### O que acontece em cada ponto de falha (confirmado)

| Falha | Comportamento hoje | Marca em algum lugar? |
|---|---|---|
| LLM 429/5xx/timeout (caminho **sem tools**) | `callAI` lança `Error` genérico com message do provider, **sem status code** (`src/lib/whatsapp/ai-providers.ts:114-115, 156-157, 203-204, 237-238, 271-272`). O catch do cloud-runner (linhas 263-283) trata **QUALQUER erro do engine como `no_valid_api_key` e DESABILITA PERMANENTEMENTE a IA da conversa** (`ai_enabled=false`). | `ai_disabled_reason='no_valid_api_key'` (errado p/ 429!) — sem alerta, sem notificação. |
| LLM 429 (caminho **com tools**) | `runToolLoop` aborta gracioso com `stoppedBy='rate_limited'` e `text=''` (`src/lib/ai/tools/loop.ts:139-146`; `ai-providers.ts:370-371, 455-456, 544-545`). Engine retorna `response=''` sem throw (`src/lib/ai/engine.ts:164-191`). Cloud-runner cai em `if (!response) return { replied:false }` (linhas 336-339) **sem nem setar `error`**. | **Nada.** Silêncio total. |
| API key inválida (401/403) | Mesmo catch genérico → disable com `no_valid_api_key` (correto por acaso) + `console.error` (linhas 274-276). | `ai_disabled_reason` só; humano NÃO fica sabendo (sem alerta/notificação). |
| Key ausente no BYO | Disable + `console.error` (cloud-runner 189-210). | Idem — invisível. |
| `Agente não está ativo` / `Fora do horário` | Engine **lança** (`src/lib/ai/engine.ts:59, 64`) → catch genérico → **disable permanente com motivo errado**. Não é falha — é skip intencional! | Bug colateral grave. |
| Envio Meta falha (1ª bolha) | `sendResult.sent=false` → worker retorna 200 com `result.error` (cloud-runner 345-361). | Nada retenta. |

### O cron `reprocess-whatsapp-pending` cobre? **NÃO — gap real confirmado**

- `src/app/api/cron/reprocess-whatsapp-pending/route.ts:35-38` chama a RPC `pending_whatsapp_webhook_events_for_reprocess`, que varre **somente `whatsapp_webhook_events` com status `pending`/`failed`** (`supabase/migrations/20260522_whatsapp_webhook_events.sql:76-92`), e re-enfileira o **webhook worker** (linha 51), não o AI worker.
- A hipótese se confirma com agravante: o evento de webhook é marcado `done` pelo webhook worker (route.ts:104) **antes mesmo do AI worker rodar** (são jobs QStash separados). Quando o LLM falha, **não existe NENHUMA linha em estado retryável em lugar nenhum**: evento `done`, `ai_pending` já consumido pelo claim (ai-respond route.ts:114-120), worker retornou 200. O cron nunca vê o caso.
- Cron roda a cada minuto (`vercel.json:100-101`).

### `ai_disabled_reason` / visibilidade

- Valores em uso: `no_valid_api_key` (cloud-runner 195, 271), `transferred_to_human` (319). Coluna criada em `supabase/migrations/whatsapp-cloud-ai-enable.sql:25`; `ai_pending`/`ai_debounce_until` idem (linhas 31-33).
- Nenhum `sendAlert` nem insert em `notifications` em nenhum caminho de falha da IA. O padrão de visibilidade existe no P0: `src/app/api/cron/whatsapp-dead-alert/route.ts:58-90` (pre-check de alerta aberto + `sendAlert` com `dedupKey` explícito + insert em `notifications`).

### Infra disponível para o desenho

- `sendAlert` com union de types e `dedupKey` explícito: `src/lib/whatsapp/alerts.ts:4-14, 35`. CHECK constraint de `whatsapp_alerts.type` estendido por DO-block guard em `supabase/migrations/20260615_whatsapp_campaign_pipeline.sql:145-164` (padrão a replicar).
- Tabela `notifications`: `organization_id NOT NULL, user_id, type, title, message, metadata, action_url, action_label, is_read` (`supabase/migrations/20260123_ads_and_help_tables.sql:443-460`).
- `wlog`: `src/lib/observability/whatsapp-logger.ts:21-25`.
- `conversation.waba_id = account.id` (`src/lib/whatsapp/webhook-processor.ts:736`) — permite reconstruir `accountId` no sweep do cron.
- Vitest com mock de `supabaseAdmin` já praticado (`src/lib/whatsapp/campaign-processor.test.ts:1-50`); testes em `src/lib/ai/__tests__/`.
- Migrations: última numerada `20260615`; 16-18 reservadas → usar **`20260619`**.

## Contexto e Análise de Impacto

### Decisão de estratégia para transient (escolha única, com justificativa)

**Escolhida: (a-adaptada) self-reschedule pelo worker + sweep no cron existente — sobre `whatsapp_cloud_conversations`, não sobre `whatsapp_webhook_events`.**

- **Por que não (a-literal)** (re-marcar o webhook event como não-processado): reprocessar o evento re-executa `processWebhookPayload` inteiro — `RuleEngine.processCreationRules` (webhook-processor.ts:323-346) e contadores não são idempotentes; acoplaria recuperação de IA ao pipeline de ingest.
- **Por que não (b)** (retornar não-200 ao QStash): `enqueueWhatsAppAiRespond` usa `retries: 1` (queue.ts:418) — daria no máximo 1 retentativa com backoff curto, insuficiente p/ rate-limit prolongado; exigiria repor `ai_pending` antes do non-200 de qualquer forma (o claim já consumiu — o retry entraria e sairia em `already_consumed`, route.ts:122-124); e reintroduz o risco de retempest que o design atual evita de propósito.
- **A escolhida** reusa o mecanismo existente (claim de `ai_pending` + `ai_debounce_until` + `enqueueWhatsAppAiRespond` com delay), dá backoff controlado por nós (30s → 2min → 8min), cap explícito (`ai_retry_count`, máx. 3), e o sweep no cron cobre o caso QStash-down/job perdido (bônus: passa a cobrir também o gap atual de job de debounce perdido).

### Idempotência / double-send (verificado)

- O claim atômico de `ai_pending` (ai-respond route.ts:114-120) continua sendo a única porta de entrada — retry tardio concorre normalmente.
- **Todos os guards re-executam a cada tentativa** dentro do cloud-runner: `stop_on_human_reply` (164-177, default ligado) cobre humano que respondeu no meio; `max_messages_per_conversation` é recontado (149-161); cooldown 5s (129-146). Nenhum loop de resposta dupla.
- Se mensagem nova chegar durante a janela de retry, o webhook empurra `ai_debounce_until` e seta `ai_pending=true` igual já faz hoje — o retry agendado vira só mais um candidato ao claim (comportamento idêntico ao debounce atual).

### Métrica de silêncio (avaliação YAGNI)

Só `wlog.error('whatsapp.ai.gave_up', ...)` estruturado + `sendAlert` dedupado por conversa + 1 notificação na UI. **Sem** linha no relatório do agente nem contador agregado nesta fase — o wlog já é filtrável no Vercel/Datadog e o alerta cobre o humano.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/lib/ai/failure-classifier.ts` | **Criar** | Funções puras: `classifyAiFailure`, `computeAiRetryDelaySeconds`, `planAiRetry`, constantes de cap/backoff |
| `src/lib/ai/__tests__/failure-classifier.test.ts` | **Criar** | Testes das funções puras |
| `supabase/migrations/20260619_whatsapp_ai_retry.sql` | **Criar** | Coluna `ai_retry_count`, índice parcial, RPC `pending_whatsapp_ai_responses_for_reprocess`, extensão do CHECK de `whatsapp_alerts.type` |
| `src/lib/whatsapp/alerts.ts` | Modificar (linha 6) | Adicionar `'ai_response_failed'` à union de types |
| `src/lib/ai/cloud-runner.ts` | Modificar (49-57, 189-210, 263-283, 310+, 345-361) | Classificação de falha; transient NÃO desabilita; permanent desabilita + alerta/notificação; `rate_limited` do tool-loop e falha de envio viram transient |
| `src/app/api/workers/whatsapp-ai-respond/route.ts` | Modificar (após linha 174) | Agendar retry com backoff / gave_up com alerta + notificação / reset do contador em sucesso |
| `src/app/api/cron/reprocess-whatsapp-pending/route.ts` | Modificar (após linha 57) | Sweep de conversas com `ai_pending=true` e debounce vencido há ≥2min |

---

### Task 1: Classificador puro de falhas (`classifyAiFailure`)

**Files:**
- Create: `src/lib/ai/failure-classifier.ts`
- Test: `src/lib/ai/__tests__/failure-classifier.test.ts`

- [ ] **Step 1: Escrever testes falhando**

```ts
// src/lib/ai/__tests__/failure-classifier.test.ts
import { describe, it, expect } from 'vitest'
import { classifyAiFailure } from '../failure-classifier'

describe('classifyAiFailure', () => {
  // skip — não são falhas, são gates intencionais (engine.ts:59,64 lança)
  it('classifica "Agente não está ativo" como skip', () => {
    expect(classifyAiFailure(new Error('Agente não está ativo'))).toBe('skip')
  })
  it('classifica "Fora do horário de atendimento" como skip', () => {
    expect(classifyAiFailure(new Error('Fora do horário de atendimento'))).toBe('skip')
  })

  // permanent — chave/modelo/billing: retry não resolve
  it.each([
    'Incorrect API key provided: sk-***',
    'invalid x-api-key',
    'API key não configurada para provider: anthropic',
    'authentication_error: invalid bearer token',
    'The model `gpt-5-turbo-x` does not exist',
    'model_not_found',
    'You exceeded your current quota, please check your plan and billing details',
    'insufficient_quota',
    'Agente não encontrado',
  ])('classifica "%s" como permanent', (msg) => {
    expect(classifyAiFailure(new Error(msg))).toBe('permanent')
  })

  // transient — rede/429/5xx/timeout: retry resolve
  it.each([
    'Rate limit reached for gpt-4o-mini',
    'Anthropic API error: overloaded_error',
    'fetch failed',
    'ECONNRESET',
    'Request timed out',
    'Internal server error',
    'rate_limited', // sinal do tool-loop (loop.ts:144)
  ])('classifica "%s" como transient', (msg) => {
    expect(classifyAiFailure(new Error(msg))).toBe('transient')
  })

  it('default é transient (fail-safe: cap limita o custo do engano)', () => {
    expect(classifyAiFailure(new Error('erro desconhecido qualquer'))).toBe('transient')
    expect(classifyAiFailure(undefined)).toBe('transient')
    expect(classifyAiFailure('string solta')).toBe('transient')
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run src/lib/ai/__tests__/failure-classifier.test.ts`
Expected: FAIL — `Cannot find module '../failure-classifier'`

- [ ] **Step 3: Implementação mínima**

```ts
// src/lib/ai/failure-classifier.ts
/**
 * Classificação de falhas do caminho de resposta da IA (WhatsApp).
 *
 * Os providers (src/lib/whatsapp/ai-providers.ts:114,156,203,237,271) lançam
 * Error genérico com a MESSAGE do provider — sem status code. Por isso a
 * classificação é por padrão textual, com default 'transient' (fail-safe:
 * um permanent classificado como transient custa no máximo MAX_AI_RETRY_ATTEMPTS
 * tentativas; um transient classificado como permanent desligaria o bot).
 *
 * 'skip' = gates intencionais do engine (engine.ts:59,64) — não retentar,
 * não desabilitar, não alertar.
 */
export type AiFailureClass = 'transient' | 'permanent' | 'skip'

const SKIP_PATTERNS: RegExp[] = [
  /agente não está ativo/i,
  /fora do horário de atendimento/i,
]

const PERMANENT_PATTERNS: RegExp[] = [
  /api[ _-]?key/i,            // "Incorrect API key", "invalid x-api-key", "API key não configurada"
  /authentication/i,
  /unauthorized/i,
  /permission[ _]denied/i,
  /model.*(does not exist|not found)/i,
  /model_not_found/i,
  /insufficient_quota/i,
  /exceeded your current quota/i,
  /billing/i,
  /agente não encontrado/i,    // engine.ts:462 — config quebrada, retry não resolve
]

export function classifyAiFailure(error: unknown): AiFailureClass {
  const message =
    error instanceof Error ? error.message : String(error ?? '')
  if (SKIP_PATTERNS.some((re) => re.test(message))) return 'skip'
  if (PERMANENT_PATTERNS.some((re) => re.test(message))) return 'permanent'
  return 'transient'
}
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `npx vitest run src/lib/ai/__tests__/failure-classifier.test.ts`
Expected: PASS (todos os casos)

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/failure-classifier.ts src/lib/ai/__tests__/failure-classifier.test.ts
git commit -m "feat(whatsapp): classifyAiFailure — transient/permanent/skip p/ caminho de IA"
```

---

### Task 2: Plano de retry puro (`planAiRetry` + backoff)

**Files:**
- Modify: `src/lib/ai/failure-classifier.ts`
- Test: `src/lib/ai/__tests__/failure-classifier.test.ts`

- [ ] **Step 1: Acrescentar testes falhando**

```ts
// append em src/lib/ai/__tests__/failure-classifier.test.ts
import { planAiRetry, computeAiRetryDelaySeconds, MAX_AI_RETRY_ATTEMPTS } from '../failure-classifier'

describe('computeAiRetryDelaySeconds', () => {
  it('backoff 30s / 120s / 480s por tentativa', () => {
    expect(computeAiRetryDelaySeconds(1)).toBe(30)
    expect(computeAiRetryDelaySeconds(2)).toBe(120)
    expect(computeAiRetryDelaySeconds(3)).toBe(480)
  })
  it('clampa fora do range', () => {
    expect(computeAiRetryDelaySeconds(0)).toBe(30)
    expect(computeAiRetryDelaySeconds(99)).toBe(480)
  })
})

describe('planAiRetry', () => {
  it('agenda retry 1..MAX com delay crescente', () => {
    expect(planAiRetry(0)).toEqual({ action: 'retry', attempt: 1, delaySeconds: 30 })
    expect(planAiRetry(1)).toEqual({ action: 'retry', attempt: 2, delaySeconds: 120 })
    expect(planAiRetry(2)).toEqual({ action: 'retry', attempt: 3, delaySeconds: 480 })
  })
  it('desiste após MAX_AI_RETRY_ATTEMPTS', () => {
    expect(planAiRetry(MAX_AI_RETRY_ATTEMPTS)).toEqual({ action: 'give_up', attempts: MAX_AI_RETRY_ATTEMPTS })
    expect(planAiRetry(10)).toEqual({ action: 'give_up', attempts: 10 })
  })
})
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run src/lib/ai/__tests__/failure-classifier.test.ts`
Expected: FAIL — `planAiRetry is not a function`

- [ ] **Step 3: Implementar**

```ts
// append em src/lib/ai/failure-classifier.ts

/** Cap de retentativas transient por "rodada" de resposta (zera em sucesso). */
export const MAX_AI_RETRY_ATTEMPTS = 3

/** Backoff por tentativa (1-based): 30s, 2min, 8min. */
const RETRY_DELAYS_SECONDS = [30, 120, 480]

export function computeAiRetryDelaySeconds(attempt: number): number {
  const idx = Math.min(Math.max(attempt, 1), RETRY_DELAYS_SECONDS.length) - 1
  return RETRY_DELAYS_SECONDS[idx]
}

export type AiRetryPlan =
  | { action: 'retry'; attempt: number; delaySeconds: number }
  | { action: 'give_up'; attempts: number }

/** previousRetryCount = whatsapp_cloud_conversations.ai_retry_count atual. */
export function planAiRetry(previousRetryCount: number): AiRetryPlan {
  const attempt = previousRetryCount + 1
  if (attempt > MAX_AI_RETRY_ATTEMPTS) {
    return { action: 'give_up', attempts: previousRetryCount }
  }
  return { action: 'retry', attempt, delaySeconds: computeAiRetryDelaySeconds(attempt) }
}
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `npx vitest run src/lib/ai/__tests__/failure-classifier.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/failure-classifier.ts src/lib/ai/__tests__/failure-classifier.test.ts
git commit -m "feat(whatsapp): planAiRetry com cap=3 e backoff 30s/2m/8m"
```

---

### Task 3: Migration 20260619 — `ai_retry_count`, RPC de sweep, alert type

**Files:**
- Create: `supabase/migrations/20260619_whatsapp_ai_retry.sql`

- [ ] **Step 1: Escrever a migration completa**

```sql
-- ================================================
-- AI Response Reliability — retry de resposta IA (WhatsApp)
-- ================================================
-- 1) ai_retry_count: cap de retentativas transient por rodada de resposta.
-- 2) RPC de sweep: conversas com ai_pending=true e debounce vencido há
--    >= p_older_than_seconds (job QStash perdido OU QStash off). O worker
--    /api/workers/whatsapp-ai-respond continua dono do claim atômico.
-- 3) Estende CHECK de whatsapp_alerts.type com 'ai_response_failed'
--    (padrão do DO-block guard de 20260615_whatsapp_campaign_pipeline.sql).

ALTER TABLE whatsapp_cloud_conversations
  ADD COLUMN IF NOT EXISTS ai_retry_count int NOT NULL DEFAULT 0;

-- Sweep lookup (parcial: só pendentes com IA ligada)
CREATE INDEX IF NOT EXISTS idx_wcc_ai_pending_debounce
  ON whatsapp_cloud_conversations (ai_debounce_until)
  WHERE ai_pending = true AND ai_enabled = true;

CREATE OR REPLACE FUNCTION pending_whatsapp_ai_responses_for_reprocess(
  p_older_than_seconds int DEFAULT 120,
  p_limit int DEFAULT 50
)
RETURNS TABLE (conversation_id uuid, account_id uuid, organization_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.waba_id, c.organization_id
  FROM whatsapp_cloud_conversations c
  WHERE c.ai_pending = true
    AND c.ai_enabled = true
    AND c.ai_debounce_until IS NOT NULL
    AND c.ai_debounce_until < now() - (p_older_than_seconds || ' seconds')::interval
  ORDER BY c.ai_debounce_until ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION pending_whatsapp_ai_responses_for_reprocess(int, int) TO service_role;
REVOKE ALL ON FUNCTION pending_whatsapp_ai_responses_for_reprocess(int, int) FROM PUBLIC, anon, authenticated;

-- whatsapp_alerts vem de script manual — guard (espelha 20260615:145-164).
DO $alerts$
BEGIN
  IF to_regclass('public.whatsapp_alerts') IS NOT NULL THEN
    ALTER TABLE whatsapp_alerts DROP CONSTRAINT IF EXISTS whatsapp_alerts_type_check;
    ALTER TABLE whatsapp_alerts ADD CONSTRAINT whatsapp_alerts_type_check
      CHECK (type IN (
        'quality_drop',
        'frequency_cap',
        'template_rejected',
        'template_paused',
        'template_disabled',
        'account_restricted',
        'webhook_dead',
        'window_expiry_bulk',
        'low_messaging_limit',
        'campaign_worker_stalled',
        'ai_response_failed'
      ));
  END IF;
END
$alerts$;
```

- [ ] **Step 2: Validar sintaxe (sem aplicar em produção)**

Revisão manual dos delimitadores ($$, $alerts$) e ponto-e-vírgulas; aplicação real segue o fluxo de deploy do projeto (mcp apply_migration / SQL Editor) ANTES do deploy do código.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260619_whatsapp_ai_retry.sql
git commit -m "feat(db): ai_retry_count + RPC sweep de IA pendente + alert type ai_response_failed"
```

---

### Task 4: cloud-runner — classificar falha, parar de desabilitar em transient, visibilidade em permanent

**Files:**
- Modify: `src/lib/whatsapp/alerts.ts:6` (union de types)
- Modify: `src/lib/ai/cloud-runner.ts:49-57` (interface), `189-210` (BYO key), `263-283` (catch do engine), `~310` (rate_limited), `345-361` (falha de envio)

- [ ] **Step 1: Adicionar `'ai_response_failed'` à union em `alerts.ts:6`**

```ts
type: 'quality_drop' | 'frequency_cap' | 'template_rejected' | 'template_paused' | 'template_disabled' | 'account_restricted' | 'webhook_dead' | 'window_expiry_bulk' | 'low_messaging_limit' | 'campaign_worker_stalled' | 'ai_response_failed';
```

- [ ] **Step 2: Estender `CloudRunnerResult` (cloud-runner.ts:49-57)**

```ts
export interface CloudRunnerResult {
  replied: boolean;
  response?: string;
  transferred: boolean;
  traceId?: string;
  agentId?: string;
  skipped?: string;
  error?: string;
  /** Classificação da falha — o worker usa p/ decidir retry vs gave_up. */
  failure?: 'transient' | 'permanent';
}
```

- [ ] **Step 3: Helper local de visibilidade (novo, no topo do cloud-runner, após imports)**

```ts
import { classifyAiFailure } from './failure-classifier';
import { sendAlert } from '@/lib/whatsapp/alerts';
import { wlog } from '@/lib/observability/whatsapp-logger';

/** Alerta + notificação quando a IA é DESLIGADA por falha permanent.
 *  Padrão campaign_worker_stalled (whatsapp-dead-alert/route.ts:67-90):
 *  sendAlert com dedupKey + insert best-effort em notifications. */
async function notifyAiDisabled(params: {
  organizationId: string;
  conversationId: string;
  reason: string;
  detail?: string;
}): Promise<void> {
  const { organizationId, conversationId, reason, detail } = params;
  await sendAlert({
    severity: 'critical',
    type: 'ai_response_failed',
    title: 'IA do WhatsApp desativada para uma conversa',
    message: `Conversa ${conversationId}: IA desativada (${reason}). ${detail || ''}`.trim(),
    organizationId,
    dedupKey: `ai_response_failed:disabled:${organizationId}:${conversationId}`,
    metadata: { conversation_id: conversationId, reason, detail },
  }).catch(() => {});

  const { error: notifErr } = await supabaseAdmin.from('notifications').insert({
    organization_id: organizationId,
    type: 'whatsapp_ai_disabled',
    title: 'IA do WhatsApp desativada',
    message: `A IA foi desativada em uma conversa (${reason}). Verifique a chave de API / configuração do agente.`,
    metadata: { conversation_id: conversationId, reason, detail },
    action_url: '/whatsapp/inbox',
  });
  if (notifErr) wlog.warn('whatsapp.ai.notify_insert_failed', { error: notifErr.message });
}
```

- [ ] **Step 4: BYO-key sem chave (linhas 189-210) — adicionar visibilidade**

Após o `update` que desabilita (linha 191-197), antes do `return`:

```ts
    await notifyAiDisabled({
      organizationId,
      conversationId: conversation.id,
      reason: 'no_valid_api_key',
      detail: `provider=${agent.provider} agent=${agentId}`,
    });
```

- [ ] **Step 5: Reescrever o catch do engine (linhas 263-283) com classificação**

Substituir o bloco inteiro por:

```ts
  } catch (engineErr: any) {
    const failureClass = classifyAiFailure(engineErr);

    if (failureClass === 'skip') {
      // Gates intencionais (agente inativo / fora do horário) — não é falha.
      return { replied: false, transferred: false, agentId, skipped: 'agent_unavailable' };
    }

    if (failureClass === 'transient') {
      // NÃO desabilita. O worker agenda retry com backoff.
      wlog.warn('whatsapp.ai.transient_error', {
        organization_id: organizationId,
        conversation_id: conversation.id,
        agent_id: agentId,
        error: engineErr?.message,
      });
      return {
        replied: false,
        transferred: false,
        agentId,
        failure: 'transient',
        error: engineErr?.message || 'engine_error',
      };
    }

    // permanent: desabilita com motivo correto + visibilidade.
    const reason = /api[ _-]?key/i.test(engineErr?.message || '')
      ? 'no_valid_api_key'
      : 'ai_permanent_error';
    await supabaseAdmin
      .from('whatsapp_cloud_conversations')
      .update({
        ai_enabled: false,
        ai_disabled_at: new Date().toISOString(),
        ai_disabled_reason: reason,
      })
      .eq('id', conversation.id);
    await notifyAiDisabled({
      organizationId,
      conversationId: conversation.id,
      reason,
      detail: engineErr?.message,
    });
    return {
      replied: false,
      transferred: false,
      agentId,
      failure: 'permanent',
      error: engineErr?.message || 'engine_error',
    };
  }
```

- [ ] **Step 6: Tool-loop rate-limited vira transient (após o bloco de trace, ~linha 310, ANTES do bloco de transferência)**

```ts
  // 429 no tool-loop: abort gracioso com stopped_by='rate_limited' e texto
  // vazio (loop.ts:139-146) — hoje cairia no `if (!response)` silencioso.
  if (result.stopped_by === 'rate_limited' && !(result.response || '').trim()) {
    wlog.warn('whatsapp.ai.transient_error', {
      organization_id: organizationId,
      conversation_id: conversation.id,
      agent_id: agentId,
      error: 'rate_limited',
    });
    return {
      replied: false,
      transferred: false,
      traceId,
      agentId,
      failure: 'transient',
      error: 'rate_limited',
    };
  }
```

NOTA (verificado em review): o campo correto é `result.stopped_by` — o loop interno retorna `stoppedBy` (loop.ts:144) mas o engine mapeia para `stopped_by` no EngineResponse (engine.ts:190, types.ts:271), e o cloud-runner já consome `result.stopped_by` hoje (linha ~300). Use `stopped_by` como está no snippet.

- [ ] **Step 7: Falha de envio Meta vira transient (return final, linhas 354-361)**

`sendHumanizedReply` só retorna `sent:false` com ZERO bolhas enviadas (cloud-sender.ts:212-214, 248-250) — retry é seguro. Substituir o return final por:

```ts
  return {
    replied: sendResult.sent,
    transferred: false,
    response,
    traceId,
    agentId,
    failure: sendResult.sent ? undefined : 'transient',
    error: sendResult.sent ? undefined : sendResult.reason || sendResult.error,
  };
```

- [ ] **Step 8: Typecheck + suíte**

Run: `npx tsc --noEmit` e `npx vitest run`
Expected: sem erros novos; suíte verde.

- [ ] **Step 9: Commit**

```bash
git add src/lib/ai/cloud-runner.ts src/lib/whatsapp/alerts.ts
git commit -m "fix(whatsapp): cloud-runner classifica falha de IA — transient nao desliga bot; permanent alerta"
```

---

### Task 5: Worker `whatsapp-ai-respond` — retry agendado / gave_up / reset

**Files:**
- Modify: `src/app/api/workers/whatsapp-ai-respond/route.ts` (imports + após linha 174)

- [ ] **Step 1: Substituir o bloco final do try (linhas 164-176) pela orquestração de retry**

Adicionar imports no topo: `planAiRetry` de `@/lib/ai/failure-classifier`, `wlog` de `@/lib/observability/whatsapp-logger`, `sendAlert` de `@/lib/whatsapp/alerts`.

```ts
    // ---------- 6. Rodar runner (envio humanizado dentro do sender) ----------
    const { maybeRunAgentForCloudConversation } = await import('@/lib/ai/cloud-runner');
    const result = await maybeRunAgentForCloudConversation({
      account,
      conversation,
      contact,
      text,
      inboundMessageId: lastInbound?.message_id,
      messageType: 'text',
      phoneNumber: conversation.contact_phone || conversation.wa_id,
    });

    // ---------- 7. Falha transient => retry com backoff (cap em ai_retry_count) ----------
    if (result.failure === 'transient') {
      const plan = planAiRetry(conversation.ai_retry_count ?? 0);

      if (plan.action === 'retry') {
        // Reabre o claim: repõe ai_pending e empurra a janela p/ o backoff.
        await supabaseAdmin
          .from('whatsapp_cloud_conversations')
          .update({
            ai_pending: true,
            ai_debounce_until: new Date(Date.now() + plan.delaySeconds * 1000).toISOString(),
            ai_retry_count: plan.attempt,
          })
          .eq('id', conversationId);

        const { enqueueWhatsAppAiRespond } = await import('@/lib/queue');
        const qId = await enqueueWhatsAppAiRespond(
          { conversationId, accountId, organizationId },
          plan.delaySeconds,
        );
        // qId null (QStash off) => o sweep do cron reprocess-whatsapp-pending cobre.
        wlog.warn('whatsapp.ai.retry_scheduled', {
          organization_id: organizationId,
          conversation_id: conversationId,
          attempt: plan.attempt,
          delay_seconds: plan.delaySeconds,
          enqueued: Boolean(qId),
          error: result.error,
        });
        return NextResponse.json(
          { ok: false, retry_scheduled: true, attempt: plan.attempt },
          { status: 200 },
        );
      }

      // ---------- 8. Esgotou tentativas => gave_up com visibilidade ----------
      await supabaseAdmin
        .from('whatsapp_cloud_conversations')
        .update({ ai_retry_count: 0 })
        .eq('id', conversationId);

      wlog.error('whatsapp.ai.gave_up', {
        organization_id: organizationId,
        conversation_id: conversationId,
        attempts: plan.attempts,
        error: result.error,
      });
      await sendAlert({
        severity: 'warning',
        type: 'ai_response_failed',
        title: 'IA não conseguiu responder cliente no WhatsApp',
        message: `Conversa ${conversationId}: ${plan.attempts} tentativas esgotadas sem resposta. Último erro: ${result.error || 'desconhecido'}`,
        organizationId,
        dedupKey: `ai_response_failed:gave_up:${organizationId}:${conversationId}`,
        metadata: { conversation_id: conversationId, attempts: plan.attempts, last_error: result.error },
      }).catch(() => {});
      const { error: notifErr } = await supabaseAdmin.from('notifications').insert({
        organization_id: organizationId,
        type: 'whatsapp_ai_gave_up',
        title: 'Cliente sem resposta da IA',
        message: 'A IA esgotou as tentativas de responder uma conversa do WhatsApp. Responda manualmente.',
        metadata: { conversation_id: conversationId, attempts: plan.attempts, last_error: result.error },
        action_url: '/whatsapp/inbox',
      });
      if (notifErr) console.error('[whatsapp-ai-respond] notification insert failed:', notifErr.message);

      return NextResponse.json({ ok: false, gave_up: true }, { status: 200 });
    }

    // ---------- 9. Sucesso/skip: zera contador de retry se necessário ----------
    if ((conversation.ai_retry_count ?? 0) > 0) {
      await supabaseAdmin
        .from('whatsapp_cloud_conversations')
        .update({ ai_retry_count: 0 })
        .eq('id', conversationId);
    }

    return NextResponse.json({ ok: true, conversationId, result }, { status: 200 });
```

Nota: o catch externo (linhas 177-184) permanece retornando 200 — erros de infra do worker (Supabase down etc.) continuam cobertos pelo design atual; o sweep do cron (Task 6) reapanha a conversa se `ai_pending` tiver ficado `true`.

- [ ] **Step 2: Typecheck + suíte**

Run: `npx tsc --noEmit` e `npx vitest run`
Expected: verde.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/workers/whatsapp-ai-respond/route.ts
git commit -m "feat(whatsapp): worker de IA agenda retry transient com backoff e emite whatsapp.ai.gave_up no cap"
```

---

### Task 6: Sweep no cron `reprocess-whatsapp-pending`

**Files:**
- Modify: `src/app/api/cron/reprocess-whatsapp-pending/route.ts` (imports + após linha 57)

- [ ] **Step 1: Adicionar fase 2 (sweep de IA) após o loop de webhook events**

Adicionar import: `import { enqueueWhatsAppAiRespond } from '@/lib/queue';` (junto ao import existente da linha 15). Inserir antes do return final (linha 59):

```ts
  // ---------- Fase 2: IA pendente órfã (job QStash perdido / QStash off / retry agendado) ----------
  // RPC criada em 20260619_whatsapp_ai_retry.sql. Janela 120s > debounce normal,
  // então só pega casos realmente órfãos. O worker faz o claim atômico de
  // ai_pending — re-enfileirar em duplicidade é no-op.
  let aiScanned = 0;
  let aiEnqueued = 0;
  let aiFailed = 0;
  const { data: aiPending, error: aiErr } = await supabaseAdmin.rpc(
    'pending_whatsapp_ai_responses_for_reprocess',
    { p_older_than_seconds: 120, p_limit: 50 }
  );
  if (aiErr) {
    // Migration ainda não aplicada => degrade gracioso, fase 1 já rodou.
    console.error('[reprocess-whatsapp-pending] ai sweep RPC error:', aiErr.message);
  } else {
    const rows = (aiPending as any[]) || [];
    aiScanned = rows.length;
    for (const row of rows) {
      try {
        await enqueueWhatsAppAiRespond(
          {
            conversationId: row.conversation_id,
            accountId: row.account_id,
            organizationId: row.organization_id,
          },
          0,
        );
        aiEnqueued++;
      } catch (err) {
        aiFailed++;
        console.error('[reprocess-whatsapp-pending] ai enqueue failed for', row.conversation_id, err);
      }
    }
  }
```

E estender o return final:

```ts
  return NextResponse.json({
    ok: true,
    scanned: events.length,
    enqueued,
    failed,
    ai_scanned: aiScanned,
    ai_enqueued: aiEnqueued,
    ai_failed: aiFailed,
  });
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/reprocess-whatsapp-pending/route.ts
git commit -m "feat(whatsapp): cron reprocess varre conversas com IA pendente orfa (rede de seguranca do retry)"
```

---

### Task 7: Verificação final de fluxo

**Files:** nenhum novo — validação.

- [ ] **Step 1: Suíte completa + typecheck**

Run: `npx vitest run` e `npx tsc --noEmit`
Expected: tudo verde, zero regressão.

- [ ] **Step 2: Revisão de invariantes (checklist manual sobre o diff)**

- Transient NUNCA seta `ai_enabled=false` (cloud-runner catch novo).
- `ai_pending` só é reposto pelo worker em transient com `plan.action==='retry'` — cap respeitado.
- Guards `stop_on_human_reply` / `max_messages` / cooldown re-executam em toda tentativa (cloud-runner.ts:129-177, inalterados) — sem double-send em retry tardio.
- `whatsapp.ai.gave_up` emitido exatamente uma vez por rodada (contador zera).
- dedupKeys: `ai_response_failed:disabled:<org>:<conv>` e `ai_response_failed:gave_up:<org>:<conv>` — UNIQUE em `whatsapp_alerts.dedup_key` suprime spam (NOTA: organization_id é NOT NULL aqui, diferente do caso campaign_worker_stalled — o dedup via index FUNCIONA; confirme que sendAlert recebe organizationId nestes calls).

- [ ] **Step 3: Teste E2E local via simulador**

Usar `POST /api/ai/test/cloud-webhook` (simulador citado em cloud-runner.ts:5-6) com uma org cuja `api_keys` do provider foi removida → esperar: conversa desabilitada com `no_valid_api_key` + linha em `whatsapp_alerts` + linha em `notifications`. Depois, com key válida mas modelo inexistente no agente → `ai_permanent_error`. (Transient é coberto pelos testes puros + revisão.)

- [ ] **Step 4: Commit final (se houver ajustes)**

```bash
git add -A && git commit -m "chore(whatsapp): verificacao do pacote de confiabilidade da resposta IA"
```

---

## Riscos e observações

- **`ai_retry_count` lido antes do claim** (worker route.ts:80-85): valor pode estar 1 tick defasado sob concorrência extrema, mas o claim atômico garante 1 executor por rodada — no pior caso uma tentativa extra dentro do cap.
- **Migration precisa ir antes do deploy do código** (worker escreve `ai_retry_count`; cron chama a RPC com degrade gracioso se ausente).
- **`Agente não encontrado`** (engine.ts:462) classificado como permanent — mas SEM key-pattern, então `ai_disabled_reason='ai_permanent_error'`; UI que filtra por `no_valid_api_key` (src/types/inbox.ts) não quebra, apenas mostra reason novo como texto.

### Critical Files for Implementation

- D:\worder1-fwrle\src\lib\ai\cloud-runner.ts
- D:\worder1-fwrle\src\app\api\workers\whatsapp-ai-respond\route.ts
- D:\worder1-fwrle\src\lib\ai\failure-classifier.ts (novo)
- D:\worder1-fwrle\src\app\api\cron\reprocess-whatsapp-pending\route.ts
- D:\worder1-fwrle\supabase\migrations\20260619_whatsapp_ai_retry.sql (novo)
