// src/lib/ai/__tests__/failure-classifier.test.ts
import { describe, it, expect } from 'vitest'
import { classifyAiFailure } from '../failure-classifier'
import { planAiRetry, computeAiRetryDelaySeconds, MAX_AI_RETRY_ATTEMPTS } from '../failure-classifier'

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
