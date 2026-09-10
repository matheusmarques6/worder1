import { createHmac } from 'crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('OAUTH_STATE_SECRET', 'oauth-test-secret')
  vi.stubEnv('NEXTAUTH_SECRET', '')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function signState(secret: string) {
  const payload = Buffer.from(JSON.stringify({
    organizationId: 'org-a', userId: 'user-a', provider: 'meta',
    nonce: 'test-nonce', createdAt: Date.now(),
  })).toString('base64url')
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
}

it.each(['development', 'test', 'production'])(
  'imports without a secret but refuses generation and validation in %s',
  async environment => {
    vi.stubEnv('NODE_ENV', environment)
    vi.stubEnv('OAUTH_STATE_SECRET', '')
    vi.stubEnv('NEXTAUTH_SECRET', '')
    const oauth = await import('./oauth-security')

    expect(() => oauth.generateOAuthState('org-a', 'user-a', 'meta'))
      .toThrow('OAuth state secret is not configured')
    expect(oauth.validateOAuthState(signState('fallback-secret-change-me'), 'meta')).toBeNull()
    expect(await oauth.consumeOAuthState(signState('fallback-secret-change-me'), 'meta')).toBeNull()
    expect(getSupabaseAdmin).not.toHaveBeenCalled()
  },
)

it.each(['validateOAuthState', 'consumeOAuthState'] as const)(
  '%s rejects the public fallback when both secrets are unset without accessing storage', async method => {
    delete process.env.OAUTH_STATE_SECRET
    delete process.env.NEXTAUTH_SECRET
    const oauth = await import('./oauth-security')
    expect(await oauth[method](signState('fallback-secret-change-me'), 'meta')).toBeNull()
    expect(getSupabaseAdmin).not.toHaveBeenCalled()
  },
)

it.each(['meta', 'tiktok', 'google', 'shopify'] as const)(
  'roundtrips %s with the configured HMAC key and preserves storeId', async provider => {
    const { generateOAuthState, validateOAuthState } = await import('./oauth-security')
    const state = generateOAuthState('org-a', 'user-a', provider, 'store-a')
    const [payload, signature] = state.split('.')

    expect(signature).toBe(createHmac('sha256', 'oauth-test-secret').update(payload).digest('base64url'))
    expect(validateOAuthState(state, provider)).toMatchObject({
      organizationId: 'org-a', userId: 'user-a', provider, storeId: 'store-a',
      nonce: expect.any(String), createdAt: expect.any(Number),
    })
  },
)

it('uses NEXTAUTH_SECRET when OAuth is absent and prefers OAuth when both are set', async () => {
  vi.stubEnv('OAUTH_STATE_SECRET', '')
  vi.stubEnv('NEXTAUTH_SECRET', 'nextauth-test-secret')
  const oauth = await import('./oauth-security')
  const nextauthState = oauth.generateOAuthState('org-a', 'user-a', 'meta')
  const [payload, signature] = nextauthState.split('.')
  expect(signature).toBe(createHmac('sha256', 'nextauth-test-secret').update(payload).digest('base64url'))
  expect(oauth.validateOAuthState(nextauthState, 'meta')).not.toBeNull()

  vi.stubEnv('OAUTH_STATE_SECRET', 'preferred-oauth-secret')
  expect(oauth.validateOAuthState(nextauthState, 'meta')).toBeNull()
  const [newPayload, newSignature] = oauth.generateOAuthState('org-a', 'user-a', 'meta').split('.')
  expect(newSignature).toBe(createHmac('sha256', 'preferred-oauth-secret').update(newPayload).digest('base64url'))
})

it('reads secrets after import and rejects existing states when configuration is removed', async () => {
  vi.stubEnv('OAUTH_STATE_SECRET', '')
  const oauth = await import('./oauth-security')
  vi.stubEnv('OAUTH_STATE_SECRET', 'later-secret')
  expect(oauth.validateOAuthState(signState('later-secret'), 'meta')).not.toBeNull()
  const state = oauth.generateOAuthState('org-a', 'user-a', 'meta')

  vi.stubEnv('OAUTH_STATE_SECRET', '')
  expect(oauth.validateOAuthState(state, 'meta')).toBeNull()
  expect(await oauth.consumeOAuthState(state, 'meta')).toBeNull()
  expect(getSupabaseAdmin).not.toHaveBeenCalled()
  expect(() => oauth.generateOAuthState('org-a', 'user-a', 'meta')).toThrow()
})

it('rejects signatures made with the former public fallback without touching storage', async () => {
  const oauth = await import('./oauth-security')
  expect(await oauth.consumeOAuthState(signState('fallback-secret-change-me'), 'meta')).toBeNull()
  expect(getSupabaseAdmin).not.toHaveBeenCalled()
})

it('rejects provider mismatch, payload tampering and expiry without touching storage', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-10T12:00:00Z'))
  const oauth = await import('./oauth-security')
  const state = oauth.generateOAuthState('org-a', 'user-a', 'meta', 'store-a')
  expect(await oauth.consumeOAuthState(state, 'tiktok')).toBeNull()
  const [payload, signature] = state.split('.')
  const tampered = JSON.parse(Buffer.from(payload, 'base64url').toString())
  tampered.organizationId = 'org-b'
  expect(await oauth.consumeOAuthState(
    `${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${signature}`, 'meta',
  )).toBeNull()
  vi.advanceTimersByTime(10 * 60 * 1000 + 1)
  expect(await oauth.consumeOAuthState(state, 'meta')).toBeNull()
  expect(getSupabaseAdmin).not.toHaveBeenCalled()
})
