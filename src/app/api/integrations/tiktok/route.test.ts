import { NextRequest } from 'next/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  insert: vi.fn(), upsert: vi.fn(), from: vi.fn(),
}))

vi.mock('@/lib/api-utils', () => ({
  getAuthClient: async () => ({ user: { id: 'user-a', organization_id: 'org-a' } }),
  getSupabaseClient: vi.fn(),
  authError: () => new Response(null, { status: 401 }),
}))
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ from: mocks.from }),
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('OAUTH_STATE_SECRET', 'tiktok-oauth-test-secret')
  vi.stubEnv('NEXTAUTH_SECRET', '')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test')
  vi.stubEnv('TIKTOK_CLIENT_KEY', 'test-client')
  mocks.insert.mockResolvedValue({ data: null, error: null })
  mocks.upsert.mockResolvedValue({ data: null, error: null })
  mocks.from.mockImplementation((table: string) => {
    if (table === 'oauth_states') return {
      insert: mocks.insert,
    }
    if (table === 'tiktok_accounts') return { upsert: mocks.upsert }
    throw new Error(`Unexpected table: ${table}`)
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json({ code: 0, data: { access_token: 'test-token', advertiser_ids: ['advertiser-a'] } }))
    .mockResolvedValueOnce(Response.json({ code: 0, data: { list: [{ name: 'Test advertiser', currency: 'BRL', timezone: 'America/Sao_Paulo' }] } })))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function connectRequest() {
  return new NextRequest('https://app.example.test/api/integrations/tiktok', {
    method: 'POST',
    body: JSON.stringify({ action: 'connect', organizationId: 'attacker-org', userId: 'attacker-user' }),
  })
}

it('connect emits a signed state accepted by the real callback for the authenticated tenant', async () => {
  const { POST } = await import('./route')
  const { GET } = await import('./callback/route')
  const response = await POST(connectRequest())
  expect(response.status).toBe(200)
  const authUrl = new URL((await response.json()).authUrl)
  const callback = new URL('https://app.example.test/api/integrations/tiktok/callback')
  callback.searchParams.set('auth_code', 'test-code')
  callback.searchParams.set('state', authUrl.searchParams.get('state')!)

  const result = await GET(new NextRequest(callback))

  expect(result.headers.get('location')).toBe('https://app.example.test/settings?tab=integrations&success=tiktok_connected')
  expect(mocks.insert).toHaveBeenCalledWith({
    provider: 'tiktok', organization_id: 'org-a',
    state: expect.stringMatching(/^nonce:[a-f0-9]{32}$/), expires_at: expect.any(String),
  })
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
    organization_id: 'org-a', connected_by: 'user-a', advertiser_id: 'advertiser-a',
  }), { onConflict: 'organization_id,advertiser_id' })
})

it('connect returns no authorization URL when signing secrets are absent', async () => {
  vi.stubEnv('OAUTH_STATE_SECRET', '')
  const { POST } = await import('./route')
  const response = await POST(connectRequest())
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ error: 'OAuth state secret is not configured' })
  expect(fetch).not.toHaveBeenCalled()
  expect(mocks.from).not.toHaveBeenCalled()
})
