import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { encryptSecret, decryptSecret } from '@/lib/crypto/secret-box'

beforeEach(() => vi.stubEnv('ENCRYPTION_KEY', 'synthetic-credential-test-key-at-least-32-characters'))
afterEach(() => vi.unstubAllEnvs())

function fixture() {
  const rows = [
    { id: 'a', organization_id: 'org-a', access_token: 'legacy-a', api_secret: 'secret-a', webhook_secret: null },
    { id: 'b', organization_id: 'org-b', access_token: 'legacy-b', api_secret: null, webhook_secret: null },
    { id: 'c', organization_id: 'org-a', access_token: encryptSecret('already-sealed'), api_secret: null, webhook_secret: null },
  ]
  const client = { from: () => {
    let filters: [string, any][] = []; let patch: any; let after = ''; let max = 100
    const q: any = { select: () => q, order: () => q, limit: (n: number) => { max = n; return q },
      eq: (k: string, v: any) => { filters.push([k, v]); return q },
      gt: (_: string, v: string) => { after = v; return q },
      update: (p: any) => { patch = p; return q },
      then: (resolve: any) => {
        const selected = rows.filter(r => r.id > after && filters.every(([k,v]) => (r as any)[k] === v)).slice(0, max)
        if (patch) selected.forEach(r => Object.assign(r, patch))
        return Promise.resolve({ data: selected.map(r => ({ ...r })), error: null }).then(resolve)
      },
    }; return q
  } }
  return { rows, client }
}

it('backfill defaults to counts-only dry run and never changes another organization', async () => {
  const { backfillIntegrationCredentials } = await import('../../../scripts/security/encrypt-integration-credentials')
  const { rows, client } = fixture()
  const result = await backfillIntegrationCredentials(client, { target: 'shopify_stores', organizationId: 'org-a' })
  expect(result).toMatchObject({ scanned: 2, candidates: 2, changed: 0, encrypted: 1, checkpoint: 'c' })
  expect(rows[0].access_token).toBe('legacy-a')
  expect(JSON.stringify(result)).not.toContain('legacy-a')
})

it('explicit backfill is idempotent twice, decryptable, scoped and checkpointed', async () => {
  const { backfillIntegrationCredentials } = await import('../../../scripts/security/encrypt-integration-credentials')
  const { rows, client } = fixture()
  const options = { target: 'shopify_stores' as const, organizationId: 'org-a', apply: true, confirmation: 'shopify_stores:org-a' }
  const first = await backfillIntegrationCredentials(client, options)
  expect(first).toMatchObject({ changed: 2, checkpoint: 'c' })
  expect(decryptSecret(rows[0].access_token)).toBe('legacy-a')
  expect(rows[1].access_token).toBe('legacy-b')
  const second = await backfillIntegrationCredentials(client, options)
  expect(second).toMatchObject({ candidates: 0, changed: 0, encrypted: 3 })
  expect(await backfillIntegrationCredentials(client, { ...options, checkpoint: 'c' })).toMatchObject({ scanned: 0, changed: 0, checkpoint: 'c' })
})

it('backfill rejects apply without exact scope confirmation and reports corrupt records without secret output', async () => {
  const { backfillIntegrationCredentials } = await import('../../../scripts/security/encrypt-integration-credentials')
  const { rows, client } = fixture()
  await expect(backfillIntegrationCredentials(client, { target: 'shopify_stores', organizationId: 'org-a', apply: true })).rejects.toThrow()
  rows[0].access_token = 'v2:broken'
  const result = await backfillIntegrationCredentials(client, { target: 'shopify_stores', organizationId: 'org-a' })
  expect(result.invalid).toBe(1)
  expect(JSON.stringify(result)).not.toContain('v2:broken')
})
