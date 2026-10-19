import { NextRequest } from 'next/server'
import { beforeEach, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/api-utils', () => ({ getAuthClient: async () => ({ user: { id: 'user-a', organization_id: 'org-a' } }), getSupabaseClient: () => ({ from: db.from }), authError: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: db.from }) }))

beforeEach(() => {
  db.from.mockImplementation((table: string) => {
    const row = { id: 'account-a', organization_id: 'org-a', shop_name: 'Example', access_token: 'synthetic-sensitive-token', api_secret: 'synthetic-api-secret', webhook_secret: 'synthetic-webhook-secret' }
    const q: any = { select: () => q, eq: () => q, in: () => q, order: () => q,
      single: async () => ({ data: row, error: null }),
      then: (resolve: any) => Promise.resolve({ data: table === 'organization_members' ? [] : [row], error: null }).then(resolve),
    }; return q
  })
})

it('Shopify store detail and listing omit secrets regardless of stored format', async () => {
  const { GET } = await import('@/app/api/shopify/store/route')
  for (const suffix of ['', '?storeId=account-a']) {
    const response = await GET(new NextRequest(`https://app.example.test/api/shopify/store${suffix}`))
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('Example')
    expect(body).not.toContain('synthetic-sensitive-token')
    expect(body).not.toContain('synthetic-api-secret')
    expect(body).not.toContain('synthetic-webhook-secret')
  }
})

it('TikTok account listing omits persisted tokens', async () => {
  const { GET } = await import('@/app/api/integrations/tiktok/route')
  const response = await GET(new NextRequest('https://app.example.test/api/integrations/tiktok'))
  expect(response.status).toBe(200)
  const body = await response.text()
  expect(body).toContain('account-a')
  expect(body).not.toContain('synthetic-sensitive-token')
})
