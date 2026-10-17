import { NextRequest } from 'next/server'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { decryptSecret } from '@/lib/crypto/secret-box'
import { createHmac } from 'crypto'

const state = vi.hoisted(() => ({ writes: [] as any[], from: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: state.from }), supabaseAdmin: { from: state.from } }))
vi.mock('@/lib/api-utils', () => ({ getAuthClient: async () => ({ user: { id: 'user-a', organization_id: 'org-a' } }), authError: vi.fn() }))
vi.mock('@/lib/oauth-security', () => ({ consumeOAuthState: async () => ({ organizationId: 'org-a', userId: 'user-a' }), logOAuthAttempt: vi.fn() }))

beforeEach(() => {
  vi.resetModules(); state.writes = []
  vi.stubEnv('ENCRYPTION_KEY', 'synthetic-credential-test-key-at-least-32-characters')
  vi.stubEnv('SHOPIFY_CLIENT_SECRET', 'synthetic-shopify-secret')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  state.from.mockImplementation((table: string) => {
    let wrote = false
    const query: any = {
      select: () => query, eq: () => query, gte: () => query, limit: () => query, delete: () => query,
      update: (value: any) => { wrote = true; state.writes.push({ table, value }); return query },
      insert: (value: any) => { wrote = true; state.writes.push({ table, value }); return query },
      upsert: (value: any) => { wrote = true; state.writes.push({ table, value }); return query },
      maybeSingle: async () => ({ data: table === 'oauth_states' ? { organization_id: 'org-a', metadata: { organization_id: 'org-a', shop: 'example.myshopify.com', provider: 'shopify' } } : { id: 'store-a', organization_id: 'org-a' }, error: null }),
      single: async () => ({ data: table === 'integrations' ? null : { id: wrote ? 'account-a' : 'store-a' }, error: null }),
      then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve),
    }
    return query
  })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('real Shopify OAuth callback persists encrypted token and secret while provider requests use plaintext', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url) => String(url).endsWith('/admin/oauth/access_token')
    ? Response.json({ access_token: 'shopify-provider-token', scope: 'read_orders' })
    : Response.json({ data: { shop: { name: 'Example' }, webhookSubscriptionCreate: { userErrors: [] }, webPixelCreate: { userErrors: [] } } })))
  const { GET } = await import('@/app/api/integrations/shopify/callback/route')
  const query = `code=synthetic-code&shop=example.myshopify.com&state=${'a'.repeat(64)}`
  const hmac = createHmac('sha256', 'synthetic-shopify-secret').update(query).digest('hex')
  const result = await GET(new NextRequest(`https://app.example.test/api/integrations/shopify/callback?${query}&hmac=${hmac}`))
  expect(result.headers.get('location')).toContain('success=true')
  const saved = state.writes.find(({ value }) => value.access_token)?.value
  expect(saved.access_token).toMatch(/^v2:/)
  expect(decryptSecret(saved.access_token)).toBe('shopify-provider-token')
  expect(decryptSecret(saved.api_secret)).toBe('synthetic-shopify-secret')
  const providerCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('graphql.json'))!
  expect((providerCall[1]?.headers as any)['X-Shopify-Access-Token']).toBe('shopify-provider-token')
})

it('real Instagram connect persists encrypted page token and subscribes with plaintext', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true })))
  const { POST } = await import('@/app/api/instagram/auth/connect/route')
  const response = await POST(new NextRequest('https://app.example.test/api/instagram/auth/connect', { method: 'POST', body: JSON.stringify({ page_id: 'page-a', page_access_token: 'instagram-provider-token', instagram_business_id: 'ig-a' }) }))
  expect(response.status).toBe(200)
  const saved = state.writes.find(({ table }) => table === 'instagram_accounts')!.value
  expect(saved.access_token).toMatch(/^v2:/)
  expect(decryptSecret(saved.access_token)).toBe('instagram-provider-token')
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string).access_token).toBe('instagram-provider-token')
})

it('real TikTok callback persists encrypted token and requests advertiser with plaintext', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json({ code: 0, data: { access_token: 'tiktok-provider-token', advertiser_ids: ['advertiser-a'] } }))
    .mockResolvedValueOnce(Response.json({ code: 0, data: { list: [{ name: 'Example' }] } })))
  const { GET } = await import('@/app/api/integrations/tiktok/callback/route')
  const response = await GET(new NextRequest('https://app.example.test/api/integrations/tiktok/callback?auth_code=synthetic&state=synthetic'))
  expect(response.headers.get('location')).toContain('success=tiktok_connected')
  const saved = state.writes.find(({ table }) => table === 'tiktok_accounts')!.value
  expect(saved.access_token).toMatch(/^v2:/)
  expect(decryptSecret(saved.access_token)).toBe('tiktok-provider-token')
  expect((vi.mocked(fetch).mock.calls[1][1]?.headers as any)['Access-Token']).toBe('tiktok-provider-token')
})

it('manual OAuth initiation encrypts the pending client secret', async () => {
  state.from.mockImplementation((table: string) => {
    const q: any = { select: () => q, eq: () => q, or: () => q, neq: () => q, limit: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      insert: (value: any) => { state.writes.push({ table, value }); return Promise.resolve({ error: null }) },
    }; return q
  })
  const { POST } = await import('@/app/api/integrations/shopify/oauth-manual/start/route')
  const response = await POST(new NextRequest('https://app.example.test/oauth/start', { method: 'POST', body: JSON.stringify({ domain: 'example.myshopify.com', clientId: 'synthetic-client', clientSecret: 'pending-provider-secret', allowCreate: true }) }))
  expect(response.status).toBe(200)
  const saved = state.writes.find(({ table }) => table === 'oauth_states')!.value
  expect(saved.metadata.client_secret).toMatch(/^v2:/)
  expect(decryptSecret(saved.metadata.client_secret)).toBe('pending-provider-secret')
})
