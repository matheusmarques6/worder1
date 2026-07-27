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
