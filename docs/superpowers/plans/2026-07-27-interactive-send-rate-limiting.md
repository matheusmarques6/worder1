# Interactive Send Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proteger todos os caminhos de envio interativo de WhatsApp (inbox texto/template/mídia, cloud/messages, IA) com o mesmo rate limiter por tier da Meta e circuit breaker que hoje só protegem campanhas.

**Architecture:** Um novo módulo `src/lib/whatsapp/send-guard.ts` encapsula `getRateLimiter` (tier/pair-rate/cota diária, Upstash Redis) e `getCircuitBreaker` (chave `wa:${accountId}`, compartilhada com o campaign-processor) atrás de duas funções: `checkBeforeSend()` e `reportSendResult()`. As rotas HTTP retornam 429 com `retryAfterMs` + mensagem amigável em PT-BR quando bloqueadas; o caminho da IA faz skip silencioso com `reason`. O guard é fail-open: indisponibilidade de Redis loga e permite o envio (mesma filosofia do fallback de `src/lib/rate-limit.ts`).

**Tech Stack:** Next.js 14 (App Router, route handlers), TypeScript, Upstash Redis (`@upstash/redis`, `@upstash/ratelimit`), Vitest 1.x.

## Global Constraints

- O `checkRateLimit` fixo de 80 msg/s por org em `cloud/messages/route.ts` (linhas 106-118) FICA como camada anti-abuso — o guard é adicionado DEPOIS dele, não o substitui.
- O circuit breaker do guard usa o MESMO nome do campaign-processor (`wa:${accountId}`, `failureThreshold: 5`, `resetTimeout: 30000` — ver `campaign-processor.ts:623-633`) para compartilhar estado por conta.
- O campaign-processor NÃO é refatorado neste plano (fluxo dele usa sleep/getRecommendedDelay em loop; refactor para o guard fica para depois).
- Fail-open obrigatório: erro de Redis dentro do guard nunca pode derrubar um envio interativo (log `console.warn` e `allowed: true`).
- Comportamento por caminho (decidido e fixado aqui):
  - `cloud/messages`, `inbox texto`, `inbox template`, `inbox mídia`: bloqueio ⇒ HTTP 429, body `{ error: <mensagem PT-BR>, code: 'rate_limited', reason, retryAfterMs, retryAfter }` + header `Retry-After`. Cota diária bloqueia com mensagem clara e `retryAfter` até a meia-noite; pair-rate e circuit breaker bloqueiam com `retryAfter` curto (6s / 30s).
  - IA (`cloud-sender.ts`): bloqueio ⇒ `{ sent: false, reason: 'send_guard_<motivo>' }` + `wlog.warn`, sem retry automático (YAGNI).
  - Na mídia do inbox, o guard roda ANTES do upload (falha rápida, não desperdiça upload em Storage/Meta).
- Frontend: `useInboxMessages` já exibe `data.error` quando `!response.ok` (marca bolha como `failed` + `setError`) — nenhuma mudança de frontend é necessária, desde que a API mande a mensagem amigável no campo `error` (verificação manual na Task 8).
- `canSend()` incrementa a cota diária no check; se o envio falhar depois na Meta, a unidade de cota fica consumida — mesmo comportamento do caminho de campanhas, aceito.
- Testes: Vitest (`npm test` roda `vitest run`); testes unitários ficam colocalizados (`src/lib/whatsapp/*.test.ts`), padrão de mock igual a `src/lib/ai/cloud-sender.test.ts` (mock de módulo antes do import). Rotas HTTP não têm harness de teste no repo ⇒ verificação manual explícita.
- Prosa/comentários seguem o padrão do repo (comentários em PT-BR permitidos); identificadores em inglês.

---

### Task 1: Código de motivo estruturado no RateLimitResult

O `canSend()` de `rate-limiter.ts` retorna `reason` como string livre ("Pair rate limit exceeded (max 10 msg/min per recipient)" etc.). O guard precisa mapear o motivo sem parsear texto. Adicionamos um campo opcional `code` — mudança retrocompatível (o campaign-processor ignora).

**Files:**
- Modify: `src/lib/whatsapp/rate-limiter.ts:35-40` (interface) e `src/lib/whatsapp/rate-limiter.ts:82-151` (branches do `canSend`)
- Test: sem teste unitário (a classe depende de Upstash Redis real e não tem suite hoje); verificação por `tsc` + o campo é coberto indiretamente nos testes do send-guard (Task 2)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `RateLimitResult.code?: 'throttled' | 'throughput' | 'pair_rate' | 'daily_quota'` — a Task 2 depende exatamente destes literais.

- [ ] **Step 1: Adicionar o campo `code` à interface**

Em `src/lib/whatsapp/rate-limiter.ts`, trocar a interface `RateLimitResult` (linhas 35-40) por:

```typescript
export type RateLimitBlockCode = 'throttled' | 'throughput' | 'pair_rate' | 'daily_quota'

export interface RateLimitResult {
  allowed: boolean
  retryAfter?: number // segundos
  remaining?: number
  reason?: string
  code?: RateLimitBlockCode
}
```

- [ ] **Step 2: Preencher `code` em cada branch de bloqueio do `canSend`**

Ainda em `rate-limiter.ts`, dentro de `canSend()`:

No branch de throttle (linhas 87-94), o return vira:

```typescript
      return {
        allowed: false,
        retryAfter: ttl > 0 ? ttl : 60,
        reason: 'Instance throttled due to rate limit errors',
        code: 'throttled',
      }
```

No branch de throughput (linhas 98-106):

```typescript
      return {
        allowed: false,
        retryAfter: Math.max(retryAfter, 1),
        remaining: throughputResult.remaining,
        reason: 'Throughput limit exceeded',
        code: 'throughput',
      }
```

No branch de pair rate (linhas 117-124):

```typescript
      return {
        allowed: false,
        retryAfter: Math.max(retryAfter, 6), // Mínimo 6s (pair rate = 1 msg/6s)
        reason: 'Pair rate limit exceeded (max 10 msg/min per recipient)',
        code: 'pair_rate',
      }
```

No branch de daily quota (linhas 139-145):

```typescript
      return {
        allowed: false,
        retryAfter: this.getSecondsUntilMidnight(),
        remaining: 0,
        reason: `Daily limit exceeded (${config.daily} messages)`,
        code: 'daily_quota',
      }
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: exit 0, sem erros novos (rodar antes da edição se quiser baseline).

- [ ] **Step 4: Commit**

```bash
git add src/lib/whatsapp/rate-limiter.ts
git commit -m "feat(whatsapp): add structured block code to RateLimitResult"
```

---

### Task 2: Criar `send-guard.ts` (TDD)

**Files:**
- Create: `src/lib/whatsapp/send-guard.ts`
- Test: `src/lib/whatsapp/send-guard.test.ts`

**Interfaces:**
- Consumes: `getRateLimiter(instanceId: string, tier?: number): WhatsAppRateLimiter` e `RateLimitResult` (com `code` da Task 1) de `./rate-limiter`; `getCircuitBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker` de `./circuit-breaker`. Métodos usados: `limiter.canSend(toPhone): Promise<RateLimitResult>`, `limiter.recordError(errorCode: string | number): Promise<void>`, `breaker.canExecute(): Promise<boolean>`, `breaker.recordSuccess(): Promise<void>`, `breaker.recordFailure(error?: Error): Promise<void>`.
- Produces (Tasks 3-7 consomem exatamente estas assinaturas):
  - `tierFromMessagingLimit(messagingLimit?: string | null): number`
  - `checkBeforeSend(params: { accountId: string; recipientPhone: string; messagingLimit?: string | null }): Promise<SendGuardResult>` onde `SendGuardResult = { allowed: boolean; reason?: 'circuit_open' | 'throttled' | 'throughput' | 'pair_rate' | 'daily_quota'; retryAfterMs?: number; message?: string }`
  - `reportSendResult(params: { accountId: string; success: boolean; errorCode?: string | number; error?: Error; messagingLimit?: string | null }): Promise<void>`
  - `buildRateLimitedResponseBody(check: SendGuardResult): { error: string; code: 'rate_limited'; reason?: string; retryAfterMs: number; retryAfter: number }`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/whatsapp/send-guard.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks antes do import — vitest hoist (padrão de cloud-sender.test.ts)
const mockCanSend = vi.fn()
const mockRecordError = vi.fn(async () => {})
const mockGetRateLimiter = vi.fn(() => ({
  canSend: mockCanSend,
  recordError: mockRecordError,
  recordSuccess: vi.fn(async () => {}),
}))

const mockCanExecute = vi.fn()
const mockBreakerRecordSuccess = vi.fn(async () => {})
const mockBreakerRecordFailure = vi.fn(async () => {})
const mockGetCircuitBreaker = vi.fn(() => ({
  canExecute: mockCanExecute,
  recordSuccess: mockBreakerRecordSuccess,
  recordFailure: mockBreakerRecordFailure,
}))

vi.mock('./rate-limiter', () => ({
  getRateLimiter: (...args: any[]) => (mockGetRateLimiter as any)(...args),
}))
vi.mock('./circuit-breaker', () => ({
  getCircuitBreaker: (...args: any[]) => (mockGetCircuitBreaker as any)(...args),
}))

import {
  checkBeforeSend,
  reportSendResult,
  tierFromMessagingLimit,
  buildRateLimitedResponseBody,
} from './send-guard'

beforeEach(() => {
  mockCanSend.mockReset()
  mockRecordError.mockClear()
  mockGetRateLimiter.mockClear()
  mockCanExecute.mockReset()
  mockBreakerRecordSuccess.mockClear()
  mockBreakerRecordFailure.mockClear()
  mockGetCircuitBreaker.mockClear()
})

describe('tierFromMessagingLimit', () => {
  it('mapeia messaging_limit da Meta para tier numerico do TIER_CONFIG', () => {
    expect(tierFromMessagingLimit('TIER_NOT_SET')).toBe(0)
    expect(tierFromMessagingLimit('TIER_250')).toBe(0)
    expect(tierFromMessagingLimit('TIER_1K')).toBe(1)
    expect(tierFromMessagingLimit('TIER_10K')).toBe(2)
    expect(tierFromMessagingLimit('TIER_100K')).toBe(3)
    expect(tierFromMessagingLimit('TIER_UNLIMITED')).toBe(4)
  })

  it('desconhecido/null cai no tier 1 (paridade com campaign-processor messaging_tier || 1)', () => {
    expect(tierFromMessagingLimit(null)).toBe(1)
    expect(tierFromMessagingLimit(undefined)).toBe(1)
    expect(tierFromMessagingLimit('UNKNOWN')).toBe(1)
  })
})

describe('checkBeforeSend', () => {
  it('bloqueia com circuit_open quando o breaker nao permite (sem consultar rate limiter)', async () => {
    mockCanExecute.mockResolvedValue(false)

    const r = await checkBeforeSend({ accountId: 'acc-1', recipientPhone: '5538999990000' })

    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('circuit_open')
    expect(r.retryAfterMs).toBe(30000)
    expect(r.message).toBeTruthy()
    expect(mockCanSend).not.toHaveBeenCalled()
    // Breaker compartilhado com campanhas: mesma chave wa:<accountId>
    expect(mockGetCircuitBreaker).toHaveBeenCalledWith('wa:acc-1', {
      failureThreshold: 5,
      resetTimeout: 30000,
    })
  })

  it('bloqueia com pair_rate e converte retryAfter (s) para retryAfterMs', async () => {
    mockCanExecute.mockResolvedValue(true)
    mockCanSend.mockResolvedValue({
      allowed: false,
      retryAfter: 6,
      reason: 'Pair rate limit exceeded (max 10 msg/min per recipient)',
      code: 'pair_rate',
    })

    const r = await checkBeforeSend({ accountId: 'acc-1', recipientPhone: '5538999990000' })

    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('pair_rate')
    expect(r.retryAfterMs).toBe(6000)
    expect(r.message).toContain('10 mensagens')
  })

  it('bloqueia com daily_quota e mensagem clara de limite diario', async () => {
    mockCanExecute.mockResolvedValue(true)
    mockCanSend.mockResolvedValue({
      allowed: false,
      retryAfter: 3600,
      remaining: 0,
      reason: 'Daily limit exceeded (250 messages)',
      code: 'daily_quota',
    })

    const r = await checkBeforeSend({ accountId: 'acc-1', recipientPhone: '5538999990000' })

    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('daily_quota')
    expect(r.retryAfterMs).toBe(3600000)
    expect(r.message).toContain('diário')
  })

  it('permite quando breaker fechado e rate limiter ok, usando o tier do messaging_limit', async () => {
    mockCanExecute.mockResolvedValue(true)
    mockCanSend.mockResolvedValue({ allowed: true, remaining: 9000 })

    const r = await checkBeforeSend({
      accountId: 'acc-1',
      recipientPhone: '5538999990000',
      messagingLimit: 'TIER_10K',
    })

    expect(r.allowed).toBe(true)
    expect(mockGetRateLimiter).toHaveBeenCalledWith('acc-1', 2)
    expect(mockCanSend).toHaveBeenCalledWith('5538999990000')
  })

  it('fail-open: erro de Redis no guard permite o envio', async () => {
    mockCanExecute.mockRejectedValue(new Error('redis down'))

    const r = await checkBeforeSend({ accountId: 'acc-1', recipientPhone: '5538999990000' })

    expect(r.allowed).toBe(true)
  })
})

describe('reportSendResult', () => {
  it('sucesso registra no breaker e nao toca no contador de erros', async () => {
    await reportSendResult({ accountId: 'acc-1', success: true })

    expect(mockBreakerRecordSuccess).toHaveBeenCalledTimes(1)
    expect(mockRecordError).not.toHaveBeenCalled()
    expect(mockBreakerRecordFailure).not.toHaveBeenCalled()
  })

  it('falha registra recordError no limiter e recordFailure no breaker', async () => {
    const err = new Error('(#131056) pair rate limit hit')
    await reportSendResult({ accountId: 'acc-1', success: false, errorCode: 131056, error: err })

    expect(mockRecordError).toHaveBeenCalledWith(131056)
    expect(mockBreakerRecordFailure).toHaveBeenCalledWith(err)
    expect(mockBreakerRecordSuccess).not.toHaveBeenCalled()
  })

  it('fail-open: erro de Redis no report nao propaga', async () => {
    mockBreakerRecordSuccess.mockRejectedValueOnce(new Error('redis down'))
    await expect(reportSendResult({ accountId: 'acc-1', success: true })).resolves.toBeUndefined()
  })
})

describe('buildRateLimitedResponseBody', () => {
  it('monta body 429 com error amigavel, code rate_limited e retryAfter em ms e s', () => {
    const body = buildRateLimitedResponseBody({
      allowed: false,
      reason: 'pair_rate',
      retryAfterMs: 6000,
      message: 'Limite da Meta: no máximo 10 mensagens por minuto para o mesmo contato. Aguarde alguns segundos.',
    })

    expect(body).toEqual({
      error: 'Limite da Meta: no máximo 10 mensagens por minuto para o mesmo contato. Aguarde alguns segundos.',
      code: 'rate_limited',
      reason: 'pair_rate',
      retryAfterMs: 6000,
      retryAfter: 6,
    })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/whatsapp/send-guard.test.ts`
Expected: FAIL — `Cannot find module './send-guard'` (ou equivalente de resolução).

- [ ] **Step 3: Implementação mínima**

Criar `src/lib/whatsapp/send-guard.ts`:

```typescript
// =============================================
// SEND GUARD — proteção unificada de envio WhatsApp
//
// Reusa o rate limiter por tier da Meta (throughput MPS, pair-rate
// 10/min/destinatário, cota diária) e o circuit breaker que antes só
// protegiam o caminho de CAMPANHAS (campaign-processor.ts:488-581).
// Caminhos interativos (inbox, cloud/messages, IA) chamam:
//   checkBeforeSend() ANTES do envio  -> 429/skip quando bloqueado
//   reportSendResult() DEPOIS do envio -> alimenta breaker/throttle
//
// Fail-open: indisponibilidade de Redis loga e PERMITE o envio —
// um outage de infra nunca pode derrubar o atendimento humano.
// =============================================

import { getRateLimiter, type RateLimitResult } from './rate-limiter'
import { getCircuitBreaker, type CircuitBreaker } from './circuit-breaker'

export type SendGuardBlockReason =
  | 'circuit_open'
  | 'throttled'
  | 'throughput'
  | 'pair_rate'
  | 'daily_quota'

export interface SendGuardCheckParams {
  /** whatsapp_business_accounts.id — mesmo id/keyspace usado pelas campanhas */
  accountId: string
  recipientPhone: string
  /** whatsapp_business_accounts.messaging_limit (TIER_250, TIER_1K, ...) */
  messagingLimit?: string | null
}

export interface SendGuardResult {
  allowed: boolean
  reason?: SendGuardBlockReason
  retryAfterMs?: number
  /** Mensagem amigável PT-BR, pronta para a UI do inbox */
  message?: string
}

export interface SendGuardReportParams {
  accountId: string
  success: boolean
  errorCode?: string | number
  error?: Error
  messagingLimit?: string | null
}

// Paridade com campaign-processor.ts:623-633 (mesmo nome => mesmo estado)
const CIRCUIT_RESET_TIMEOUT_MS = 30_000
const CIRCUIT_FAILURE_THRESHOLD = 5

const BLOCK_MESSAGES: Record<SendGuardBlockReason, string> = {
  circuit_open:
    'Envio temporariamente pausado: muitas falhas seguidas nesta conta do WhatsApp. Tente novamente em instantes.',
  throttled:
    'A Meta sinalizou excesso de envios nesta conta. Aguarde alguns minutos antes de tentar de novo.',
  throughput:
    'Muitas mensagens sendo enviadas agora por esta conta. Tente novamente em alguns segundos.',
  pair_rate:
    'Limite da Meta: no máximo 10 mensagens por minuto para o mesmo contato. Aguarde alguns segundos.',
  daily_quota:
    'Limite diário de mensagens desta conta do WhatsApp foi atingido. O limite renova à meia-noite.',
}

/**
 * Mapeia whatsapp_business_accounts.messaging_limit (string da Meta)
 * para o tier numérico do TIER_CONFIG do rate-limiter.
 * Desconhecido => 1 (paridade com campaign-processor: messaging_tier || 1).
 */
export function tierFromMessagingLimit(messagingLimit?: string | null): number {
  switch ((messagingLimit || '').toUpperCase()) {
    case 'TIER_NOT_SET':
    case 'TIER_250':
      return 0
    case 'TIER_1K':
      return 1
    case 'TIER_10K':
      return 2
    case 'TIER_100K':
      return 3
    case 'TIER_UNLIMITED':
      return 4
    default:
      return 1
  }
}

function guardBreaker(accountId: string): CircuitBreaker {
  return getCircuitBreaker(`wa:${accountId}`, {
    failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
    resetTimeout: CIRCUIT_RESET_TIMEOUT_MS,
  })
}

function mapRateLimitReason(result: RateLimitResult): SendGuardBlockReason {
  if (result.code) return result.code
  // Fallback defensivo (reason string) — não deve acontecer após a Task 1
  const r = result.reason || ''
  if (r.startsWith('Instance throttled')) return 'throttled'
  if (r.startsWith('Pair rate')) return 'pair_rate'
  if (r.startsWith('Daily limit')) return 'daily_quota'
  return 'throughput'
}

export async function checkBeforeSend(
  params: SendGuardCheckParams,
): Promise<SendGuardResult> {
  const { accountId, recipientPhone, messagingLimit } = params
  try {
    // 1. Circuit breaker (compartilhado com campanhas)
    if (!(await guardBreaker(accountId).canExecute())) {
      return {
        allowed: false,
        reason: 'circuit_open',
        retryAfterMs: CIRCUIT_RESET_TIMEOUT_MS,
        message: BLOCK_MESSAGES.circuit_open,
      }
    }

    // 2. Rate limiter por tier (throttle, MPS, pair-rate, cota diária)
    const limiter = getRateLimiter(accountId, tierFromMessagingLimit(messagingLimit))
    const rate = await limiter.canSend(recipientPhone)
    if (!rate.allowed) {
      const reason = mapRateLimitReason(rate)
      return {
        allowed: false,
        reason,
        retryAfterMs: Math.max(1, rate.retryAfter ?? 1) * 1000,
        message: BLOCK_MESSAGES[reason],
      }
    }

    return { allowed: true }
  } catch (e: any) {
    console.warn('[send-guard] check failed (fail-open):', e?.message || e)
    return { allowed: true }
  }
}

export async function reportSendResult(params: SendGuardReportParams): Promise<void> {
  const { accountId, success, errorCode, error, messagingLimit } = params
  try {
    const breaker = guardBreaker(accountId)
    if (success) {
      await breaker.recordSuccess()
      return
    }
    const limiter = getRateLimiter(accountId, tierFromMessagingLimit(messagingLimit))
    await limiter.recordError(errorCode ?? 'UNKNOWN')
    await breaker.recordFailure(error)
  } catch (e: any) {
    console.warn('[send-guard] report failed (ignored):', e?.message || e)
  }
}

/** Body padrão de resposta 429 para as rotas HTTP interativas. */
export function buildRateLimitedResponseBody(check: SendGuardResult): {
  error: string
  code: 'rate_limited'
  reason?: string
  retryAfterMs: number
  retryAfter: number
} {
  const retryAfterMs = check.retryAfterMs ?? 1000
  return {
    error: check.message || 'Limite de envio atingido. Tente novamente em instantes.',
    code: 'rate_limited',
    reason: check.reason,
    retryAfterMs,
    retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/whatsapp/send-guard.test.ts`
Expected: PASS — 12 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp/send-guard.ts src/lib/whatsapp/send-guard.test.ts
git commit -m "feat(whatsapp): add reusable send guard (tier rate limiter + circuit breaker)"
```

---

### Task 3: Integrar o guard em `cloud/messages/route.ts`

O `checkRateLimit` de 80 msg/s por org (linhas 106-118) permanece como anti-abuso. O guard entra DEPOIS dos checks de opt-out e janela de 24h (não consome cota de quem seria bloqueado por outra regra), imediatamente antes de criar o client da Meta.

**Files:**
- Modify: `src/app/api/whatsapp/cloud/messages/route.ts:6-18` (imports), `:223-230` (check antes de `// Criar cliente`), `:313-321` (report de sucesso/erro em volta do try/catch do switch)
- Test: sem harness de rota no repo — verificação manual na Task 8; `npx tsc --noEmit` aqui

**Interfaces:**
- Consumes: `checkBeforeSend`, `reportSendResult`, `buildRateLimitedResponseBody` de `@/lib/whatsapp/send-guard` (assinaturas da Task 2). Campos usados da conta: `account.id`, `account.messaging_limit`.
- Produces: contrato HTTP 429 `{ error, code: 'rate_limited', reason, retryAfterMs, retryAfter }` + header `Retry-After` (mesmo contrato das Tasks 4-6).

- [ ] **Step 1: Adicionar import**

Depois de `import { checkRateLimit } from '@/lib/rate-limit';` (linha 18):

```typescript
import {
  checkBeforeSend,
  reportSendResult,
  buildRateLimitedResponseBody,
} from '@/lib/whatsapp/send-guard';
```

- [ ] **Step 2: Inserir o check do guard antes de criar o client**

Logo antes do comentário `// Criar cliente` (linha ~225), depois do bloco de janela de 24h:

```typescript
    // Send guard — rate limiter por tier da Meta + circuit breaker
    // (mesma proteção do caminho de campanhas). O checkRateLimit de
    // 80/s acima continua como camada anti-abuso por org.
    const guardCheck = await checkBeforeSend({
      accountId: account.id,
      recipientPhone: to,
      messagingLimit: account.messaging_limit,
    });
    if (!guardCheck.allowed) {
      const body429 = buildRateLimitedResponseBody(guardCheck);
      return NextResponse.json(body429, {
        status: 429,
        headers: { 'Retry-After': String(body429.retryAfter) },
      });
    }
```

- [ ] **Step 3: Reportar resultado do envio**

No início do bloco `catch (apiError: any)` (linha ~314), logo após `wlog.error('whatsapp.send.api_error', ...)`:

```typescript
      await reportSendResult({
        accountId: account.id,
        success: false,
        errorCode: apiError?.code,
        error: apiError,
        messagingLimit: account.messaging_limit,
      });
```

E logo DEPOIS do fechamento do try/catch do switch (após a linha `}` que fecha o catch, antes de `const messageId = result.messages?.[0]?.id;`):

```typescript
    await reportSendResult({ accountId: account.id, success: true });
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/whatsapp/cloud/messages/route.ts
git commit -m "feat(whatsapp): enforce send guard on cloud/messages interactive path"
```

---

### Task 4: Integrar o guard no envio de texto do inbox (`[id]/messages`)

Este é o caminho que o `useInboxMessages.sendMessage` realmente usa (POST `/api/whatsapp/inbox/conversations/[id]/messages`) — estava fora da auditoria original, mas envia direto pela Cloud API sem guard nenhum. O hook já trata `!response.ok` marcando a bolha como `failed` e exibindo `data.error`, então a mensagem amigável em `error` chega na UI sem mudança de frontend.

**Files:**
- Modify: `src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts:1-11` (imports), `:120-129` (check após opt-out, antes do client), `:127-136` (report no try/catch do `sendText`)
- Test: verificação manual na Task 8; `npx tsc --noEmit` aqui

**Interfaces:**
- Consumes: `checkBeforeSend`, `reportSendResult`, `buildRateLimitedResponseBody` de `@/lib/whatsapp/send-guard`. Campos: `cloudConv.account.id`, `cloudConv.account.messaging_limit`, `phoneNumber`.
- Produces: mesmo contrato HTTP 429 da Task 3, com `NO_CACHE_HEADERS` incluídos.

- [ ] **Step 1: Adicionar import**

Depois do bloco de import do opt-out-guard (linha 11):

```typescript
import {
  checkBeforeSend,
  reportSendResult,
  buildRateLimitedResponseBody,
} from '@/lib/whatsapp/send-guard'
```

- [ ] **Step 2: Inserir check após o guard de opt-out**

Depois do `if (!optCheck.allowed) { ... }` (linha ~120) e antes de `const client = createWhatsAppCloudClient({`:

```typescript
      // Send guard — tier da Meta + circuit breaker (paridade com campanhas)
      const guardCheck = await checkBeforeSend({
        accountId: cloudConv.account.id,
        recipientPhone: phoneNumber,
        messagingLimit: cloudConv.account.messaging_limit,
      })
      if (!guardCheck.allowed) {
        const body429 = buildRateLimitedResponseBody(guardCheck)
        return NextResponse.json(body429, {
          status: 429,
          headers: { ...NO_CACHE_HEADERS, 'Retry-After': String(body429.retryAfter) },
        })
      }
```

- [ ] **Step 3: Reportar resultado em volta do `sendText`**

O bloco try/catch existente (linhas ~127-136) vira:

```typescript
      let result
      try {
        result = await client.sendText(phoneNumber, content)
      } catch (apiError: any) {
        console.error('[Messages POST] Cloud API error:', apiError)
        await reportSendResult({
          accountId: cloudConv.account.id,
          success: false,
          errorCode: apiError?.code,
          error: apiError,
          messagingLimit: cloudConv.account.messaging_limit,
        })
        return NextResponse.json(
          { error: apiError.message || 'Failed to send message', code: apiError.code },
          { status: 400, headers: NO_CACHE_HEADERS }
        )
      }
      await reportSendResult({ accountId: cloudConv.account.id, success: true })
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts"
git commit -m "feat(whatsapp): enforce send guard on inbox text messages"
```

---

### Task 5: Integrar o guard no envio de template do inbox

**Files:**
- Modify: `src/app/api/whatsapp/inbox/conversations/[id]/send-template/route.ts:13-22` (imports), `:144-149` (check após opt-out, antes do client), `:151-160` (report no try/catch do `sendTemplate`)
- Test: verificação manual na Task 8; `npx tsc --noEmit` aqui

**Interfaces:**
- Consumes: `checkBeforeSend`, `reportSendResult`, `buildRateLimitedResponseBody` de `@/lib/whatsapp/send-guard`. Campos: `cloudConv.account.id`, `cloudConv.account.messaging_limit`, `phoneNumber`.
- Produces: mesmo contrato HTTP 429 da Task 3.

- [ ] **Step 1: Adicionar import**

Depois do bloco de import do opt-out-guard (linha 22):

```typescript
import {
  checkBeforeSend,
  reportSendResult,
  buildRateLimitedResponseBody,
} from '@/lib/whatsapp/send-guard'
```

- [ ] **Step 2: Inserir check após o guard de opt-out**

Depois do `if (!optCheck.allowed) { ... }` (linha ~144) e antes de `const client = createWhatsAppCloudClient({`:

```typescript
    // Send guard — tier da Meta + circuit breaker (paridade com campanhas).
    // Template fora da janela de 24h é exatamente o caso que a Meta
    // monitora para qualidade — cota diária bloqueia com mensagem clara.
    const guardCheck = await checkBeforeSend({
      accountId: cloudConv.account.id,
      recipientPhone: phoneNumber,
      messagingLimit: cloudConv.account.messaging_limit,
    })
    if (!guardCheck.allowed) {
      const body429 = buildRateLimitedResponseBody(guardCheck)
      return NextResponse.json(body429, {
        status: 429,
        headers: { ...NO_CACHE_HEADERS, 'Retry-After': String(body429.retryAfter) },
      })
    }
```

- [ ] **Step 3: Reportar resultado em volta do `sendTemplate`**

O try/catch existente (linhas ~151-160) vira:

```typescript
    let result
    try {
      result = await client.sendTemplate(phoneNumber, templateName, language, components)
    } catch (apiError: any) {
      console.error('[send-template] Cloud API error:', apiError)
      await reportSendResult({
        accountId: cloudConv.account.id,
        success: false,
        errorCode: apiError?.code,
        error: apiError,
        messagingLimit: cloudConv.account.messaging_limit,
      })
      return NextResponse.json(
        { error: apiError.message || 'Failed to send template', code: apiError.code },
        { status: 400, headers: NO_CACHE_HEADERS },
      )
    }
    await reportSendResult({ accountId: cloudConv.account.id, success: true })
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/whatsapp/inbox/conversations/[id]/send-template/route.ts"
git commit -m "feat(whatsapp): enforce send guard on inbox template sends"
```

---

### Task 6: Integrar o guard no envio de mídia do inbox

Decisão: o check roda logo após o opt-out e ANTES de qualquer upload (Storage/Meta) — falha rápida sem desperdiçar upload de arquivo. Trade-off aceito: se o `sendImage/Video/...` falhar depois, a unidade de cota diária consumida no check não é devolvida (mesmo comportamento do caminho de campanhas).

**Files:**
- Modify: `src/app/api/whatsapp/inbox/conversations/[id]/media/route.ts:1-10` (imports), `:135-141` (check após opt-out, antes do client/upload), `:197-224` (report no try/catch do send)
- Test: verificação manual na Task 8; `npx tsc --noEmit` aqui

**Interfaces:**
- Consumes: `checkBeforeSend`, `reportSendResult`, `buildRateLimitedResponseBody` de `@/lib/whatsapp/send-guard`. Campos: `cloudConv.account.id`, `cloudConv.account.messaging_limit`, `phoneNumber`.
- Produces: mesmo contrato HTTP 429 da Task 3 (o hook `sendMedia` lança `Error(data.error)` em `!ok` — mensagem amigável chega via `setError`).

- [ ] **Step 1: Adicionar import**

Depois de `import { getAccessToken } from '@/lib/whatsapp/account-loader'` (linha 10):

```typescript
import {
  checkBeforeSend,
  reportSendResult,
  buildRateLimitedResponseBody,
} from '@/lib/whatsapp/send-guard'
```

- [ ] **Step 2: Inserir check após o guard de opt-out (antes de upload/client)**

Depois do `if (!optCheck.allowed) { ... }` (linha ~135) e antes de `const client = createWhatsAppCloudClient({`:

```typescript
      // Send guard ANTES do upload — falha rápida sem desperdiçar
      // upload em Storage/Meta quando a conta está limitada.
      const guardCheck = await checkBeforeSend({
        accountId: cloudConv.account.id,
        recipientPhone: phoneNumber,
        messagingLimit: cloudConv.account.messaging_limit,
      })
      if (!guardCheck.allowed) {
        const body429 = buildRateLimitedResponseBody(guardCheck)
        return NextResponse.json(
          { ...body429, success: false },
          {
            status: 429,
            headers: { ...NO_CACHE_HEADERS, 'Retry-After': String(body429.retryAfter) },
          },
        )
      }
```

- [ ] **Step 3: Reportar resultado em volta do send de mídia**

No `catch (e: any)` do bloco de envio (linhas ~212-224, o segundo catch — o do `sendImage/sendVideo/sendAudio/sendDocument`), logo após `console.error('[Media POST/Cloud] send error:', e)`:

```typescript
        await reportSendResult({
          accountId: cloudConv.account.id,
          success: false,
          errorCode: e?.code,
          error: e,
          messagingLimit: cloudConv.account.messaging_limit,
        })
```

E logo DEPOIS do fechamento desse try/catch (antes de `const messageId = result.messages?.[0]?.id`):

```typescript
      await reportSendResult({ accountId: cloudConv.account.id, success: true })
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/whatsapp/inbox/conversations/[id]/media/route.ts"
git commit -m "feat(whatsapp): enforce send guard on inbox media sends"
```

---

### Task 7: Integrar o guard no envio da IA (`cloud-sender.ts`) — TDD

Comportamento decidido: bloqueio ⇒ skip silencioso (`{ sent: false, reason: 'send_guard_<motivo>' }`) + `wlog.warn`, sem retry automático. O check roda UMA vez por resposta humanizada (antes da 1ª bolha); as até 4 bolhas cabem com folga no pair-rate de 10/min. O report é 1x por resposta: falha na 1ª chamada da Meta ⇒ `success: false`; resposta concluída sem erro de envio ⇒ `success: true`.

**Files:**
- Modify: `src/lib/ai/cloud-sender.ts:28-32` (imports), `:166-171` (check após opt-out, antes do split), `:225-268` (report no loop de bolhas), `:270-276` (report de sucesso)
- Test: `src/lib/ai/cloud-sender.test.ts` (estender — mock do send-guard + 3 testes novos)

**Interfaces:**
- Consumes: `checkBeforeSend`, `reportSendResult` de `@/lib/whatsapp/send-guard` (Task 2). Campos: `account.id`, `account.messaging_limit` (pode vir `undefined` no fixture — tier default 1), `phone`.
- Produces: novos valores de `SendHumanizedReplyResult.reason`: `'send_guard_circuit_open' | 'send_guard_throttled' | 'send_guard_throughput' | 'send_guard_pair_rate' | 'send_guard_daily_quota'` (workers já tratam `sent: false` genericamente, como fazem com `'window_closed'`/`'opted_out'`).

- [ ] **Step 1: Escrever os testes que falham**

Em `src/lib/ai/cloud-sender.test.ts`, adicionar junto aos mocks existentes (antes do `import { sendHumanizedReply }`):

```typescript
const mockCheckBeforeSend = vi.fn(async () => ({ allowed: true }) as any)
const mockReportSendResult = vi.fn(async () => {})

vi.mock('@/lib/whatsapp/send-guard', () => ({
  checkBeforeSend: (...args: any[]) => (mockCheckBeforeSend as any)(...args),
  reportSendResult: (...args: any[]) => (mockReportSendResult as any)(...args),
}))
```

No `beforeEach` existente do describe principal, adicionar:

```typescript
    mockCheckBeforeSend.mockReset()
    mockCheckBeforeSend.mockResolvedValue({ allowed: true })
    mockReportSendResult.mockClear()
```

E adicionar um novo describe no fim do arquivo:

```typescript
describe('sendHumanizedReply — send guard (rate limit por tier + circuit breaker)', () => {
  beforeEach(() => {
    mockRequireOptIn.mockReset()
    mockRequireOptIn.mockResolvedValue({ allowed: true })
    mockSendText.mockReset()
    mockCreateClient.mockClear()
    mockCheckBeforeSend.mockReset()
    mockCheckBeforeSend.mockResolvedValue({ allowed: true })
    mockReportSendResult.mockClear()
  })

  it('NAO envia quando o guard bloqueia (skip silencioso com reason)', async () => {
    mockCheckBeforeSend.mockResolvedValue({
      allowed: false,
      reason: 'daily_quota',
      retryAfterMs: 3600000,
    })

    const r = await sendHumanizedReply({
      account,
      conversation,
      text: 'oi, posso ajudar?',
      agent,
      skipDelays: true,
    })

    expect(r.sent).toBe(false)
    expect(r.reason).toBe('send_guard_daily_quota')
    expect(mockSendText).not.toHaveBeenCalled()
    expect(mockCheckBeforeSend).toHaveBeenCalledWith({
      accountId: 'waba-1',
      recipientPhone: '553898575602',
      messagingLimit: undefined,
    })
  })

  it('reporta sucesso 1x quando a resposta e enviada', async () => {
    mockSendText.mockResolvedValue({ messages: [{ id: 'wamid.1' }] })

    const r = await sendHumanizedReply({
      account,
      conversation,
      text: 'tudo certo!',
      agent,
      skipDelays: true,
    })

    expect(r.sent).toBe(true)
    expect(mockReportSendResult).toHaveBeenCalledTimes(1)
    expect(mockReportSendResult).toHaveBeenCalledWith({
      accountId: 'waba-1',
      success: true,
    })
  })

  it('reporta falha quando a 1a bolha falha na Meta', async () => {
    const apiError = Object.assign(new Error('(#131056) pair rate'), { code: 131056 })
    mockSendText.mockRejectedValue(apiError)

    const r = await sendHumanizedReply({
      account,
      conversation,
      text: 'oi',
      agent,
      skipDelays: true,
    })

    expect(r.sent).toBe(false)
    expect(mockReportSendResult).toHaveBeenCalledTimes(1)
    expect(mockReportSendResult).toHaveBeenCalledWith({
      accountId: 'waba-1',
      success: false,
      errorCode: 131056,
      error: apiError,
      messagingLimit: undefined,
    })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/ai/cloud-sender.test.ts`
Expected: FAIL — os 3 testes novos falham (`r.reason` undefined / `mockReportSendResult` não chamado); os testes antigos de opt-out continuam passando.

- [ ] **Step 3: Implementação em `cloud-sender.ts`**

Adicionar import depois de `import { requireOptIn } from '@/lib/whatsapp/opt-out-guard';` (linha 31):

```typescript
import { checkBeforeSend, reportSendResult } from '@/lib/whatsapp/send-guard';
```

Depois do bloco de opt-out (após o `return { sent: false, reason: 'opted_out' };`, linha ~166) e antes de `const bubbles = splitIntoBubbles(trimmed);`:

```typescript
  // --- Send guard (rate limiter por tier da Meta + circuit breaker) ---
  // Mesma proteção do caminho de campanhas. Bloqueio => skip silencioso:
  // o worker de IA não deve martelar a Meta com a conta limitada.
  // 1 check por resposta: as até MAX_BUBBLES bolhas cabem com folga no
  // pair-rate de 10/min por destinatário.
  const guard = await checkBeforeSend({
    accountId: account.id,
    recipientPhone: phone,
    messagingLimit: account.messaging_limit,
  });
  if (!guard.allowed) {
    wlog.warn('whatsapp.ai.blocked_by_send_guard', {
      organization_id: conversation.organization_id,
      conversation_id: conversation.id,
      agent_id: agent.id,
      reason: guard.reason,
      retry_after_ms: guard.retryAfterMs,
    });
    return { sent: false, reason: `send_guard_${guard.reason ?? 'blocked'}` };
  }
```

No loop de bolhas, declarar a flag antes do `for` (junto de `const messageIds: string[] = [];`, linha ~208):

```typescript
  let hadSendError = false;
```

No `catch (apiError: any)` do `client.sendText` (linhas ~228-239), logo após o `console.error(...)`:

```typescript
      hadSendError = true;
      await reportSendResult({
        accountId: account.id,
        success: false,
        errorCode: apiError?.code,
        error: apiError,
        messagingLimit: account.messaging_limit,
      });
```

(mantendo o `if (i === 0) return ...` e o `break` existentes logo depois).

Após o loop, logo depois do bloco `if (messageIds.length === 0) { return { sent: false, error: 'send_failed' }; }` (linha ~272):

```typescript
  if (!hadSendError) {
    await reportSendResult({ accountId: account.id, success: true });
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/ai/cloud-sender.test.ts`
Expected: PASS — suite inteira verde (testes antigos + 3 novos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/cloud-sender.ts src/lib/ai/cloud-sender.test.ts
git commit -m "feat(ai): enforce send guard on humanized AI replies"
```

---

### Task 8: Verificação final (suite completa, build e roteiro manual)

**Files:**
- Test: suite completa do repo + roteiro manual abaixo (rotas HTTP não têm harness de teste no repo)

**Interfaces:**
- Consumes: tudo das Tasks 1-7.
- Produces: confirmação de regressão zero e do contrato 429 ponta a ponta.

- [ ] **Step 1: Rodar a suite completa**

Run: `npm test`
Expected: todas as suites passam (incluindo `send-guard.test.ts`, `cloud-sender.test.ts`, `campaign-processor.test.ts` e `opt-out-guard.test.ts` intactos).

- [ ] **Step 2: Build de produção**

Run: `npm run build`
Expected: build Next.js conclui sem erro de tipo/import nas 4 rotas alteradas.

- [ ] **Step 3: Verificação manual — pair-rate no inbox**

Com `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` configurados e `npm run dev`:
1. Abrir o inbox numa conversa Cloud com janela de 24h aberta.
2. Enviar 11 mensagens de texto seguidas (menos de 1 minuto) para o mesmo contato.
3. Esperado: as 10 primeiras enviam; a 11ª volta 429, a bolha fica `failed` e a UI mostra "Limite da Meta: no máximo 10 mensagens por minuto para o mesmo contato. Aguarde alguns segundos." (mensagem vinda de `data.error` — sem mudança no `useInboxMessages`).
4. Conferir no DevTools (Network) o body do 429: `{ error, code: 'rate_limited', reason: 'pair_rate', retryAfterMs, retryAfter }` e o header `Retry-After`.

- [ ] **Step 4: Verificação manual — circuit breaker compartilhado**

1. No Redis (Upstash console), setar `cb:wa:<accountId>:state = OPEN` e `cb:wa:<accountId>:lastFailure = <Date.now() atual em ms>` para a conta de teste.
2. Tentar enviar texto, template e mídia pelo inbox.
3. Esperado: os três caminhos retornam 429 com `reason: 'circuit_open'` e `retryAfterMs: 30000`; após ~30s sem novas falhas, o envio volta a funcionar (HALF_OPEN → CLOSED).
4. Limpar as chaves de teste ao final (`DEL cb:wa:<accountId>:state cb:wa:<accountId>:lastFailure cb:wa:<accountId>:halfOpenCalls`).

- [ ] **Step 5: Verificação manual — IA com guard bloqueado**

1. Com o breaker forçado OPEN (passo anterior), disparar uma mensagem inbound que aciona o agente de IA.
2. Esperado: nenhuma resposta enviada; log estruturado `whatsapp.ai.blocked_by_send_guard` com `reason: 'circuit_open'` no output do worker.

- [ ] **Step 6: Commit final (se houver ajustes da verificação)**

```bash
git add -A
git commit -m "test(whatsapp): verify interactive send guard end-to-end"
```

---

## Autocheck (executado na escrita do plano)

- Cobertura da spec: guard reutilizável (Task 2); integração em cloud/messages (Task 3), inbox texto (Task 4 — caminho extra descoberto na leitura: é o endpoint que o `useInboxMessages` usa), inbox template (Task 5), inbox mídia (Task 6), IA (Task 7); `checkRateLimit` 80/s mantido (Task 3); 429 com `retryAfterMs` (Tasks 3-6); comportamento por caminho decidido e documentado (Global Constraints); frontend verificado — `useInboxMessages` exibe `data.error`, sem mudança necessária (constraint + Task 8 Step 3); testes unitários com mock de limiter/breaker (Task 2) e verificação manual (Task 8).
- Placeholders: nenhum "TBD"/"similar à Task N" — todo step de código traz o código real.
- Consistência de nomes/tipos: `checkBeforeSend`/`reportSendResult`/`buildRateLimitedResponseBody`/`tierFromMessagingLimit` idênticos nas Tasks 2-7; `RateLimitResult.code` (Task 1) consumido em `mapRateLimitReason` (Task 2); chave do breaker `wa:${accountId}` idêntica à do campaign-processor (`campaign-processor.ts:626`).
