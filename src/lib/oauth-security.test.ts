import { createHmac } from 'crypto'
import { timingSafeEqual } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: vi.fn() }))
vi.mock('node:crypto', async importOriginal => {
  const crypto = await importOriginal<typeof import('node:crypto')>()
  return { ...crypto, timingSafeEqual: vi.fn(crypto.timingSafeEqual) }
})

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

it('compares signatures through the real constant-time primitive', async () => {
  const { validateOAuthState } = await import('./oauth-security')
  const state = signState('oauth-test-secret')
  const signature = state.split('.')[1]

  expect(validateOAuthState(state, 'meta')).not.toBeNull()
  expect(timingSafeEqual).toHaveBeenCalledTimes(1)
  expect(timingSafeEqual).toHaveBeenCalledWith(
    Buffer.from(signature, 'utf8'), Buffer.from(signature, 'utf8'),
  )
})

it.each(['short', 'long', 'malformed', 'unicode'])(
  'rejects a %s signature without accessing storage', async kind => {
    const { consumeOAuthState } = await import('./oauth-security')
    const [payload, signature] = signState('oauth-test-secret').split('.')
    const invalid = {
      short: signature.slice(1),
      long: `${signature}=`,
      malformed: `$${signature.slice(1)}`,
      unicode: `é${signature.slice(1)}`,
    }[kind]

    expect(await consumeOAuthState(`${payload}.${invalid}`, 'meta')).toBeNull()
    expect(getSupabaseAdmin).not.toHaveBeenCalled()
    if (kind !== 'malformed') expect(timingSafeEqual).not.toHaveBeenCalled()
  },
)

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

describe('atomic nonce consumption', () => {
  const insert = vi.fn()
  const select = vi.fn()
  const from = vi.fn()

  beforeEach(() => {
    insert.mockReset().mockResolvedValue({ data: null, error: null })
    // The modern table has no nonce column; the SDK resolves errors instead of throwing.
    select.mockReturnValue({
      eq: () => ({ single: async () => ({ data: null, error: { code: '42703' } }) }),
    })
    from.mockReturnValue({ insert, select })
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseAdmin>)
  })

  it('returns valid data only after one INSERT with the modern four-column contract', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-10T12:00:00Z'))
    const { consumeOAuthState } = await import('./oauth-security')

    expect(await consumeOAuthState(signState('oauth-test-secret'), 'meta')).toEqual({
      organizationId: 'org-a', userId: 'user-a', provider: 'meta',
      nonce: 'test-nonce', createdAt: Date.now(),
    })
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('oauth_states')
    expect(select).not.toHaveBeenCalled()
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith({
      state: 'nonce:test-nonce', provider: 'meta', organization_id: 'org-a',
      expires_at: '2026-09-10T12:10:00.000Z',
    })
  })

  it.each(['23505', '42703', '42501'])('rejects a resolved INSERT error %s', async code => {
    insert.mockResolvedValueOnce({ data: null, error: { code } })
    const { consumeOAuthState } = await import('./oauth-security')

    expect(await consumeOAuthState(signState('oauth-test-secret'), 'meta')).toBeNull()
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('rejects an SDK promise rejection', async () => {
    insert.mockRejectedValueOnce(new Error('storage unavailable'))
    const { consumeOAuthState } = await import('./oauth-security')

    expect(await consumeOAuthState(signState('oauth-test-secret'), 'meta')).toBeNull()
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('rejects failure to initialize the database client', async () => {
    vi.mocked(getSupabaseAdmin).mockImplementationOnce(() => { throw new Error('not configured') })
    const { consumeOAuthState } = await import('./oauth-security')

    await expect(consumeOAuthState(signState('oauth-test-secret'), 'meta')).resolves.toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it('accepts only one concurrent consumer when the unique state INSERT rejects the duplicate', async () => {
    const claimed = new Set<string>()
    insert.mockImplementation(async ({ state }: { state: string }) => {
      if (claimed.has(state)) return { data: null, error: { code: '23505' } }
      claimed.add(state)
      return { data: null, error: null }
    })
    const { consumeOAuthState, generateOAuthState } = await import('./oauth-security')
    const state = generateOAuthState('org-a', 'user-a', 'meta')

    const results = await Promise.all([
      consumeOAuthState(state, 'meta'), consumeOAuthState(state, 'meta'),
    ])

    expect(results.filter(Boolean)).toHaveLength(1)
    expect(results.filter(result => result === null)).toHaveLength(1)
    expect(insert).toHaveBeenCalledTimes(2)
    expect(select).not.toHaveBeenCalled()
    expect([...claimed]).toEqual([expect.stringMatching(/^nonce:[a-f0-9]{32}$/)])
  })

  it('rejects an invalid state before client initialization or any database operation', async () => {
    const { consumeOAuthState } = await import('./oauth-security')

    expect(await consumeOAuthState('not-a-signed-state', 'meta')).toBeNull()
    expect(getSupabaseAdmin).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
    expect(insert).not.toHaveBeenCalled()
  })
})
