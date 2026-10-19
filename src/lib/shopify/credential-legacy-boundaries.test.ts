import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptSecret, encryptSecret } from '@/lib/crypto/secret-box'

const state = vi.hoisted(() => ({
  authenticated: true,
  rows: {} as Record<string, any[]>,
  memberError: false,
  mappingError: false,
  insertConflict: false,
  writes: [] as any[],
  queries: [] as any[],
  from: vi.fn(),
  sender: vi.fn(),
}))
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: async () => state.authenticated ? { user: { id: 'user-a', organization_id: 'org-a' } } : null,
  authError: () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  getSupabaseClient: () => ({ from: state.from }),
}))
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: state.from }, getSupabaseAdmin: () => ({ from: state.from }),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  from: state.from, auth: { getUser: async () => ({ data: { user: { id: 'user-a' } }, error: null }) },
}) }))
vi.mock('@/lib/email/shared-sender', () => ({ ensureStoreSharedSender: state.sender }))

function store(id: string, organization_id: string) {
  return { id, organization_id, shop_domain: `${id}.myshopify.com`, shop_name: id,
    access_token: `token-${id}`, api_secret: 'private-secret', is_active: true, settings: {}, status: 'active' }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('ENCRYPTION_KEY', 'synthetic-credential-test-key-at-least-32-characters')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.test')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://synthetic.supabase.test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-key')
  state.authenticated = true; state.memberError = false; state.mappingError = false
  state.insertConflict = false; state.writes = []; state.queries = []; state.sender.mockReset()
  state.rows = {
    shopify_stores: [store('store-b', 'org-b'), store('store-a', 'org-a'), store('store-c', 'org-c')],
    organization_members: [
      { user_id: 'user-a', organization_id: 'org-a', status: 'active' },
      { user_id: 'user-a', organization_id: 'org-b', status: 'suspended' },
      { user_id: 'user-a', organization_id: 'org-c', status: 'active' },
    ],
    profiles: [{ id: 'user-a', organization_id: 'org-a' }],
    organizations: [{ id: 'org-a', name: 'A' }, { id: 'org-b', name: 'B' }, { id: 'org-c', name: 'C' }],
  }
  state.from.mockImplementation((table: string) => {
    const filters: any[] = []; let operation = 'select'; let value: any
    state.queries.push({ table, filters })
    const result = (single = false) => {
      const matches = (row: any) => filters.every(([key, expected, mode]) => mode === 'in' ? expected.includes(row[key]) : row[key] === expected)
      if ((table === 'organization_members' && state.memberError) || (table === 'shopify_stores' && state.mappingError)) {
        return { data: null, error: { message: 'lookup failed' } }
      }
      if (operation === 'insert') {
        if (state.insertConflict) return { data: null, error: { code: '23505', message: 'duplicate shop domain' } }
        const row = { id: 'new-store', ...value }; state.rows[table].push(row)
        state.writes.push({ operation, value, filters }); return { data: single ? row : [row], error: null }
      }
      const rows = state.rows[table].filter(matches)
      if (operation === 'update') {
        rows.forEach(row => Object.assign(row, value)); state.writes.push({ operation, value, filters })
      }
      return { data: single ? rows[0] || null : rows, error: null }
    }
    const q: any = {
      select: () => q, eq: (key: string, expected: any) => { filters.push([key, expected]); return q },
      in: (key: string, expected: any[]) => { filters.push([key, expected, 'in']); return q },
      order: () => q, limit: () => q,
      update: (data: any) => { operation = 'update'; value = data; return q },
      insert: (data: any) => { operation = 'insert'; value = data; return q },
      single: async () => result(true), maybeSingle: async () => result(true),
      then: (resolve: any) => Promise.resolve(result()).then(resolve),
    }; return q
  })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    shop: { name: 'Authorized shop', email: 'a@example.test', domain: 'store-a.example.test', currency: 'BRL', timezone: 'UTC' },
    count: 1, orders: [], access_scopes: [],
  })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

function connectRequest(domain: any = 'store-a.myshopify.com', accessToken = 'fresh-token') {
  return new NextRequest('https://app.example.test/api/shopify/connect', {
    method: 'POST', body: JSON.stringify({ name: 'Reconnect', domain, accessToken, apiSecret: 'fresh-secret' }),
  })
}

describe('legacy Shopify connect tenant and provider boundaries', () => {
  it('rejects another organization mapping before any network or mutation', async () => {
    const { POST } = await import('@/app/api/shopify/connect/route')
    const response = await POST(connectRequest('store-b.myshopify.com', encryptSecret('retained-provider-token')))
    expect(response.status).toBe(403)
    expect(fetch).not.toHaveBeenCalled(); expect(state.writes).toEqual([]); expect(state.sender).not.toHaveBeenCalled()
    expect(state.rows.shopify_stores[0].access_token).toBe('token-store-b')
  })
  it('fails closed before network when the mapping lookup fails', async () => {
    state.mappingError = true
    const { POST } = await import('@/app/api/shopify/connect/route')
    expect((await POST(connectRequest())).status).toBe(500)
    expect(fetch).not.toHaveBeenCalled(); expect(state.writes).toEqual([])
  })
  it('reconnects the same organization with a scoped encrypted update and no token redirect', async () => {
    const { POST } = await import('@/app/api/shopify/connect/route')
    const response = await POST(connectRequest(' Store-A.MyShopify.com ', encryptSecret('fresh-token')))
    expect(response.status).toBe(200)
    expect(state.writes).toHaveLength(1)
    expect(state.writes[0].filters).toContainEqual(['id', 'store-a'])
    expect(state.writes[0].filters).toContainEqual(['organization_id', 'org-a'])
    expect(decryptSecret(state.writes[0].value.access_token)).toBe('fresh-token')
    expect(decryptSecret(state.writes[0].value.api_secret)).toBe('fresh-secret')
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://store-a.myshopify.com/admin/api/2026-04/shop.json')
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ redirect: 'error', headers: { 'X-Shopify-Access-Token': 'fresh-token' } })
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe('https://app.example.test/api/shopify/install-extras')
  })
  it('fails an insert uniqueness conflict without updating or installing another store', async () => {
    state.insertConflict = true
    const { POST } = await import('@/app/api/shopify/connect/route')
    expect((await POST(connectRequest('new-shop'))).status).toBe(500)
    expect(state.writes).toEqual([]); expect(state.sender).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('accepts a plain shop slug for first installation and seals its credentials', async () => {
    const { POST } = await import('@/app/api/shopify/connect/route')
    expect((await POST(connectRequest('new-shop'))).status).toBe(200)
    expect(state.writes[0].operation).toBe('insert')
    expect(state.writes[0].value).toMatchObject({ organization_id: 'org-a', shop_domain: 'new-shop.myshopify.com' })
    expect(decryptSecret(state.writes[0].value.access_token)).toBe('fresh-token')
  })
  it.each([
    'example.myshopify.com.attacker.test', '127.0.0.1:8443/.myshopify.com',
    'user:pass@example.myshopify.com', 'example.myshopify.com/path',
    'example.myshopify.com:443', 'example.myshopify.com?x=1', 'ex ample.myshopify.com', 42,
  ])('rejects invalid destination %s before network or database writes', async domain => {
    const { POST } = await import('@/app/api/shopify/connect/route')
    expect((await POST(connectRequest(domain))).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled(); expect(state.writes).toEqual([])
  })
})

const listingCases = [
  ['connect', '/api/shopify/connect', () => import('@/app/api/shopify/connect/route')],
  ['store', '/api/shopify/store', () => import('@/app/api/shopify/store/route')],
  ['stores', '/api/stores', () => import('@/app/api/stores/route')],
] as const

describe.each(listingCases)('%s active membership listing', (_name, path, load) => {
  it('returns the validated current organization and active secondary organization only', async () => {
    const { GET } = await load()
    const response = await GET(new NextRequest(`https://app.example.test${path}`, { headers: { cookie: 'sb-access-token=synthetic-token' } }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.stores.map((row: any) => row.id).sort()).toEqual(['store-a', 'store-c'])
    expect(JSON.stringify(body)).not.toContain('private-secret')
  })
  it('returns no tenant data and makes no store query after a membership lookup error', async () => {
    state.memberError = true
    const { GET } = await load()
    const response = await GET(new NextRequest(`https://app.example.test${path}`, { headers: { cookie: 'sb-access-token=synthetic-token' } }))
    const body = await response.json()
    expect(body.error).toBeTruthy(); expect(body.stores || []).toEqual([])
    expect(state.queries.filter(query => query.table === 'shopify_stores')).toEqual([])
  })
})

it('denies revoked organization detail while preserving active secondary organization detail', async () => {
  const { GET } = await import('@/app/api/shopify/store/route')
  const denied = await GET(new NextRequest('https://app.example.test/api/shopify/store?storeId=store-b'))
  expect((await denied.json()).store).toBeNull()
  const allowed = await GET(new NextRequest('https://app.example.test/api/shopify/store?storeId=store-c'))
  expect((await allowed.json()).store.id).toBe('store-c')
})

it('general store listing requires a validated current identity instead of a profile fallback', async () => {
  state.authenticated = false
  const { GET } = await import('@/app/api/stores/route')
  const response = await GET(new NextRequest('https://app.example.test/api/stores', { headers: { cookie: 'sb-access-token=synthetic-token' } }))
  expect(response.status).toBe(401)
  expect(state.queries.filter(query => query.table === 'shopify_stores')).toEqual([])
})

describe('Shopify diagnostic tenant boundary', () => {
  it('uses only the authenticated organization store despite a foreign store appearing first', async () => {
    const { GET } = await import('@/app/api/shopify/test/route')
    const response = await GET(new NextRequest('https://app.example.test/api/shopify/test'))
    expect((await response.json()).success).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(4)
    for (const [url, init] of vi.mocked(fetch).mock.calls) {
      expect(String(url)).toMatch(/^https:\/\/store-a\.myshopify\.com\//)
      expect((init?.headers as any)['X-Shopify-Access-Token']).toBe('token-store-a')
    }
  })
  it('rejects missing active identity before any store query or provider call', async () => {
    state.authenticated = false
    const { GET } = await import('@/app/api/shopify/test/route')
    expect((await GET(new NextRequest('https://app.example.test/api/shopify/test'))).status).toBe(401)
    expect(state.queries).toEqual([]); expect(fetch).not.toHaveBeenCalled()
  })
  it('does not use another organization store when the current organization has none', async () => {
    state.rows.shopify_stores = [store('store-b', 'org-b')]
    const { GET } = await import('@/app/api/shopify/test/route')
    const response = await GET(new NextRequest('https://app.example.test/api/shopify/test'))
    expect((await response.json()).error).toBe('No store found')
    expect(fetch).not.toHaveBeenCalled()
  })
})
