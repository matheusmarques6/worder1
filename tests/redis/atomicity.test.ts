import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { Redis } from '@upstash/redis'
import { CircuitBreaker } from '@/lib/whatsapp/circuit-breaker'
import { WhatsAppRateLimiter, TIER_CONFIG } from '@/lib/whatsapp/rate-limiter'

const nonce = process.env.REDIS_TEST_NONCE || ''
const url = new URL(process.env.UPSTASH_REDIS_REST_URL || 'http://invalid')
const redis = new Redis({ url: url.href, token: process.env.UPSTASH_REDIS_REST_TOKEN || '' })
const prefix = `sec-it-${nonce}`

beforeAll(async () => {
  vi.stubEnv('WA_RL_LUA_PCT', '100')
  vi.stubEnv('WA_RL_LUA_KILL', '0')
  expect(nonce).toMatch(/^[a-f0-9]{32}$/)
  expect(url.hostname).toBe('127.0.0.1')
  expect(url.protocol).toBe('http:')
  expect(await redis.get(`security-test-run:${nonce}`)).toBe(nonce)
})
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

it('real Lua admits exactly three of fifty concurrent HALF_OPEN calls', async () => {
  const cb = new CircuitBreaker(`${prefix}-cb`, { halfOpenMaxCalls: 3 })
  await cb.reset()
  await cb.forceState('HALF_OPEN')
  const grants = await Promise.all(Array.from({ length: 50 }, () => cb.canExecute()))
  expect(grants.filter(Boolean)).toHaveLength(3)
})

it('real Lua caps a concurrent burst and still admits legitimate traffic', async () => {
  // Freeze only the application clock so elapsed network time cannot refill
  // the bucket. Redis and EVAL run for real, through the real Upstash SDK.
  vi.spyOn(Date, 'now').mockReturnValue(1_792_000_000_000)
  const rl = new WhatsAppRateLimiter(`${prefix}-burst`, 0)
  await rl.reset()
  const grants = await Promise.all(Array.from({ length: 50 }, (_, i) => rl.canSend(`recipient-${i}`)))
  const cap = Math.floor(TIER_CONFIG[0].mps * 0.9)
  expect(grants.filter((result) => result.allowed)).toHaveLength(cap)
  expect(grants.filter((result) => !result.allowed).every((result) => result.reason === 'Throughput limit exceeded')).toBe(true)
})
