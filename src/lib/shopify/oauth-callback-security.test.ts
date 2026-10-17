import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ rows: [] as any[], store: null as any, writes: [] as any[], from: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: fixture.from }) }))
vi.mock('@/lib/api-utils', () => ({ getAuthClient: async () => ({ user: { id: 'user-a', organization_id: 'org-a' } }), authError: vi.fn(), getSupabaseClient: () => ({ from: fixture.from }) }))

const nonce = 'a'.repeat(64)
const secret = 'synthetic-shopify-secret'
function callback(options: Record<string, string | null | undefined> = {}) {
  const params = new URLSearchParams({ code: 'synthetic-code', shop: 'example.myshopify.com', state: nonce, timestamp: '1760000000' })
  for (const [key, value] of Object.entries(options)) value == null ? params.delete(key) : params.set(key, value)
  if (!Object.hasOwn(options, 'hmac')) {
    const message = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('&')
    params.set('hmac', createHmac('sha256', secret).update(message).digest('hex'))
  }
  return new NextRequest(`https://app.example.test/api/integrations/shopify/callback?${params}`)
}

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); fixture.writes = []; fixture.store = { id: 'store-a', organization_id: 'org-a' }
  fixture.rows = [{ state: nonce, provider: 'shopify', organization_id: 'org-a', expires_at: new Date(Date.now() + 600000).toISOString(), metadata: { organization_id: 'org-a', shop: 'example.myshopify.com', provider: 'shopify' } }]
  vi.stubEnv('ENCRYPTION_KEY', 'synthetic-credential-test-key-at-least-32-characters')
  vi.stubEnv('SHOPIFY_CLIENT_SECRET', secret); vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test')
  vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async url => String(url).endsWith('/admin/oauth/access_token') ? Response.json({ access_token: 'provider-token' }) : Response.json({ data: { shop: { name: 'Example' }, webhookSubscriptionCreate: { userErrors: [] }, webPixelCreate: { userErrors: [] } } })))
  fixture.from.mockImplementation((table: string) => {
    let deleting = false; const filters: ((r: any) => boolean)[] = []
    const q: any = { select: () => q, limit: () => q,
      eq: (key: string, value: any) => { filters.push(r => (key === 'metadata->>shop' ? r.metadata?.shop : r[key]) === value); return q },
      gte: (key: string, value: any) => { filters.push(r => r[key] >= value); return q },
      delete: () => { deleting = true; return q },
      update: (value: any) => { fixture.writes.push(value); return q },
      insert: (value: any) => { fixture.writes.push(value); return Promise.resolve({ error: null }) },
      maybeSingle: async () => {
        if (table !== 'oauth_states') return { data: fixture.store, error: null }
        const row = fixture.rows.find(r => filters.every(f => f(r))) || null
        if (deleting && row) fixture.rows = fixture.rows.filter(r => r !== row)
        return { data: row, error: null }
      },
      then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve),
    }; return q
  })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it.each([{ hmac: null }, { hmac: '00' }, { hmac: 'zz'.repeat(32) }, { shop: 'attacker.example' }, { shop: 'example.myshopify.com.attacker.example' }])('rejects invalid OAuth boundary %j without sending credentials', async options => {
  const { GET } = await import('@/app/api/integrations/shopify/callback/route')
  const response = await GET(callback(options))
  expect(response.headers.get('location')).toContain('error=')
  expect(fetch).not.toHaveBeenCalled(); expect(fixture.writes).toEqual([])
})

it.each(['expired', 'wrong-provider', 'wrong-shop', 'wrong-tenant', 'unknown-state'])('rejects %s state even when a shop mapping exists', async kind => {
  if (kind === 'expired') fixture.rows[0].expires_at = new Date(0).toISOString()
  if (kind === 'wrong-provider') fixture.rows[0].provider = 'tiktok'
  if (kind === 'wrong-shop') fixture.rows[0].metadata.shop = 'other.myshopify.com'
  if (kind === 'wrong-tenant') fixture.rows[0].metadata.organization_id = 'org-b'
  if (kind === 'unknown-state') fixture.rows = []
  const { GET } = await import('@/app/api/integrations/shopify/callback/route')
  const response = await GET(callback())
  expect(response.headers.get('location')).toContain('error=')
  expect(fetch).not.toHaveBeenCalled()
})

it('consumes a valid opaque state once and rejects replay', async () => {
  const { GET } = await import('@/app/api/integrations/shopify/callback/route')
  expect((await GET(callback())).headers.get('location')).toContain('success=true')
  expect(fixture.writes.some(w => w.organization_id === 'org-a')).toBe(true)
  vi.mocked(fetch).mockClear()
  expect((await GET(callback())).headers.get('location')).toContain('error=')
  expect(fetch).not.toHaveBeenCalled()
})

it('cannot overwrite a shop mapped to another organization with a valid state', async () => {
  fixture.store = { id: 'store-b', organization_id: 'org-b' }
  const { GET } = await import('@/app/api/integrations/shopify/callback/route')
  expect((await GET(callback())).headers.get('location')).toContain('error=')
  expect(fetch).not.toHaveBeenCalled(); expect(fixture.writes).toEqual([])
})

it('permits signed reinstall only for an existing mapping; never assigns a first organization', async () => {
  const { GET } = await import('@/app/api/integrations/shopify/callback/route')
  expect((await GET(callback({ state: null }))).headers.get('location')).toContain('success=true')
  fixture.store = null; vi.mocked(fetch).mockClear()
  expect((await GET(callback({ state: null }))).headers.get('location')).toContain('error=')
  expect(fetch).not.toHaveBeenCalled()
})

it('legacy callback refuses raw organization ID state', async () => {
  const { GET } = await import('@/app/api/shopify/route')
  const request = callback({ state: 'org-b' })
  await GET(request).catch(() => undefined) // Legacy Next response may reject its relative redirect after the exchange.
  expect(fetch).not.toHaveBeenCalled(); expect(fixture.writes).toEqual([])
})

it('OAuth initiation rejects non-Shopify hosts before saving state', async () => {
  const { GET } = await import('@/app/api/integrations/shopify/auth/route')
  const response = await GET(new NextRequest('https://app.example.test/api/integrations/shopify/auth?shop=example.myshopify.com.attacker.example'))
  expect(response.status).toBe(400)
  expect(fixture.from).not.toHaveBeenCalled()
})
