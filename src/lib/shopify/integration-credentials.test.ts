import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encryptSecret, decryptSecret } from '@/lib/crypto/secret-box'
import { shopifyGraphQL } from './graphql-client'
import { decryptToken } from '@/lib/tiktok/token-manager'
import { createCipheriv, scryptSync } from 'crypto'

const db = vi.hoisted(() => ({ org: 'org-a', writes: [] as any[], filters: [] as any[], from: vi.fn() }))
vi.mock('@/lib/api-utils', () => ({ getAuthClient: async () => ({ user: { id: 'user-a', organization_id: db.org } }), authError: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({ from: db.from }) }))

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('ENCRYPTION_KEY', 'synthetic-credential-test-key-at-least-32-characters')
  db.writes = []; db.filters = []
  db.from.mockImplementation(() => {
    const query: any = {
      select: () => query,
      eq: (key: string, value: string) => { db.filters.push([key, value]); return query },
      update: (value: any) => { db.writes.push(value); return query },
      single: async () => ({ data: { id: 'store-a', shop_domain: 'example.myshopify.com', connection_type: 'manual', organization_id: db.org }, error: null }),
      then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
    }
    return query
  })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ access_token: 'fresh-provider-token', expires_in: 3600, scope: 'read_orders', data: { shop: { name: 'Example' } } })))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('integration credentials at actual provider and persistence boundaries', () => {
  it.each(['org-a', 'org-b'])('manual update encrypts persisted secrets for %s and sends provider plaintext', async (org) => {
    db.org = org
    const { PATCH } = await import('@/app/api/integrations/shopify/manual/update-credentials/route')
    const response = await PATCH(new NextRequest('https://app.example.test/api/integrations/shopify/manual/update-credentials', { method: 'PATCH', body: JSON.stringify({ storeId: 'store-a', clientId: 'client-id', clientSecret: 'provider-secret' }) }))
    expect(response.status).toBe(200)
    expect(db.filters).toContainEqual(['organization_id', org])
    expect(db.writes[0].access_token).toMatch(/^v2:/)
    expect(decryptSecret(db.writes[0].access_token)).toBe('fresh-provider-token')
    expect(decryptSecret(db.writes[0].api_secret)).toBe('provider-secret')
    expect(decryptSecret(db.writes[0].webhook_secret)).toBe('provider-secret')
    expect(new URLSearchParams(vi.mocked(fetch).mock.calls[0][1]?.body as string).get('client_secret')).toBe('provider-secret')
    expect(JSON.stringify(await response.json())).not.toContain('provider-secret')
  })
  it('refresh sends decrypted client secret and saves encrypted token', async () => {
    const { ensureFreshToken } = await import('./ensure-fresh-token')
    const result = await ensureFreshToken({ id: 'store-a', organization_id: 'org-a', shop_domain: 'example.myshopify.com', connection_type: 'manual', client_id: 'client-id', api_secret: encryptSecret('provider-secret') })
    expect(result.ok).toBe(true)
    expect(new URLSearchParams(vi.mocked(fetch).mock.calls[0][1]?.body as string).get('client_secret')).toBe('provider-secret')
    expect(db.writes[0].access_token).toMatch(/^v2:/)
    expect(decryptSecret(db.writes[0].access_token)).toBe('fresh-provider-token')
  })
  it('GraphQL opens stored ciphertext at the outbound boundary', async () => {
    await shopifyGraphQL({ id: 'store-a', organization_id: 'org-a', shop_domain: 'example.myshopify.com', access_token: encryptSecret('provider-token') }, '{ shop { name } }', undefined, { retries: 0 })
    expect((vi.mocked(fetch).mock.calls[0][1]?.headers as any)['X-Shopify-Access-Token']).toBe('provider-token')
  })
  it.each(['plaintext', 'legacy'])('GraphQL retains %s read compatibility', async (format) => {
    const plain = 'compatible-provider-token'
    let stored = plain
    if (format === 'legacy') {
      const iv = Buffer.alloc(16, 7)
      const cipher = createCipheriv('aes-256-gcm', scryptSync(process.env.ENCRYPTION_KEY!, 'salt', 32), iv)
      const data = Buffer.concat([cipher.update(plain), cipher.final()])
      stored = `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${data.toString('hex')}`
    }
    await shopifyGraphQL({ id: 'store-a', organization_id: 'org-a', shop_domain: 'example.myshopify.com', access_token: stored }, '{}', undefined, { retries: 0 })
    expect((vi.mocked(fetch).mock.calls[0][1]?.headers as any)['X-Shopify-Access-Token']).toBe(plain)
  })
  it.each(['v2:broken', 'aa:bb:zz'])('rejects declared corrupt ciphertext %s before network', async (token) => {
    await expect(shopifyGraphQL({ id: 'store-a', organization_id: 'org-a', shop_domain: 'example.myshopify.com', access_token: token }, '{}', undefined, { retries: 0 })).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('TikTok rejects authenticated ciphertext tampering instead of returning ciphertext', () => {
    const parts = encryptSecret('provider-token').split(':'); parts[3] = '00'.repeat(16)
    expect(() => decryptToken(parts.join(':'))).toThrow()
  })
  it('manual persistence fails closed without the runtime key, including development', async () => {
    vi.stubEnv('ENCRYPTION_KEY', ''); vi.stubEnv('NODE_ENV', 'development')
    const { PATCH } = await import('@/app/api/integrations/shopify/manual/update-credentials/route')
    const response = await PATCH(new NextRequest('https://app.example.test/manual', { method: 'PATCH', body: JSON.stringify({ storeId: 'store-a', clientId: 'client-id', clientSecret: 'provider-secret' }) }))
    expect(response.status).toBe(500)
    expect(db.writes).toEqual([])
  })
})
