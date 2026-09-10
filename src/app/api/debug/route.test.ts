import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  getAuthClient: vi.fn(),
}))

vi.mock('@/lib/api-utils', () => ({
  getSupabaseClient: (...args: unknown[]) => mocks.getSupabaseClient(...args),
  getAuthClient: (...args: unknown[]) => mocks.getAuthClient(...args),
  authError: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}))

function fakeSupabase() {
  let table = ''
  const query: any = new Proxy({}, {
    get(_target, property: string) {
      if (property === 'then') {
        const data = table === 'shopify_stores'
          ? [{
              id: 'store-a',
              organization_id: 'org-a',
              shop_domain: 'store-a.myshopify.com',
              shop_name: 'Store A',
              access_token: 'sensitive-shopify-token',
              is_active: true,
            }]
          : []
        return (resolve: (value: unknown) => void) => resolve({ data, error: null, count: 0 })
      }
      return (...args: unknown[]) => {
        if (property === 'from') table = String(args[0])
        return query
      }
    },
  })
  return query
}

const routes = [
  {
    name: '/api/debug',
    url: 'http://localhost/api/debug',
    load: () => import('./route'),
  },
  {
    name: '/api/shopify/debug',
    url: 'http://localhost/api/shopify/debug',
    load: () => import('../shopify/debug/route'),
  },
]

beforeEach(() => {
  delete process.env.DEBUG_ENDPOINT_SECRET
  delete process.env.DEBUG_ROUTE_SECRET
  mocks.getSupabaseClient.mockReset()
  mocks.getSupabaseClient.mockReturnValue(fakeSupabase())
  mocks.getAuthClient.mockReset()
  mocks.getAuthClient.mockResolvedValue({
    user: { id: 'user-a', organization_id: 'org-a' },
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ shop: { name: 'Store A' } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )))
})

afterEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe.each(routes)('$name', ({ url, load }) => {
  it.each(['development', 'test', 'production'])(
    'returns 404 without a configured key in %s before any I/O',
    async (environment) => {
      vi.stubEnv('NODE_ENV', environment)
      const { GET } = await load()

      const response = await GET(new NextRequest(url))

      expect(response.status).toBe(404)
      expect(mocks.getSupabaseClient).not.toHaveBeenCalled()
      expect(mocks.getAuthClient).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it.each(['development', 'test', 'production'])(
    'returns 404 for a wrong key in %s before any I/O',
    async (environment) => {
      vi.stubEnv('NODE_ENV', environment)
      vi.stubEnv('DEBUG_ENDPOINT_SECRET', 'right-key')
      const { GET } = await load()

      const response = await GET(new NextRequest(url, {
        headers: { 'x-debug-key': 'wrong-key' },
      }))

      expect(response.status).toBe(404)
      expect(mocks.getSupabaseClient).not.toHaveBeenCalled()
      expect(mocks.getAuthClient).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('allows the configured key in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('DEBUG_ENDPOINT_SECRET', 'right-key')
    const { GET } = await load()

    const response = await GET(new NextRequest(url, {
      headers: { 'x-debug-key': 'right-key' },
    }))

    expect(response.status).toBe(200)
  })
})

it('/api/debug never returns an access-token preview', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('DEBUG_ENDPOINT_SECRET', 'right-key')
  vi.stubEnv('DEBUG_ROUTE_SECRET', 'legacy-key')
  const { GET } = await import('./route')

  const response = await GET(new NextRequest('http://localhost/api/debug', {
    headers: { 'x-debug-key': 'right-key', 'x-debug-secret': 'legacy-key' },
  }))
  const body = await response.json()

  expect(body.rawStoreData[0]).not.toHaveProperty('tokenPreview')
  expect(JSON.stringify(body)).not.toContain('sensitive-shopify-token')
})
