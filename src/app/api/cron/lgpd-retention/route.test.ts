import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { from: state.from } }))
import { GET } from './route'

const run = () => GET(new NextRequest('https://local.test/api/cron/lgpd-retention', { headers: { authorization: 'Bearer test-cron-secret' } }))
beforeEach(() => { vi.stubEnv('CRON_SECRET', 'test-cron-secret'); state.from.mockReset() })

function setup(resource: string, failure: 'lookup' | 'mutation' | 'checkpoint' | null) {
  const writes: { table: string; data?: any }[] = []
  state.from.mockImplementation((table: string) => {
    let mutation = false
    const q: any = {
      select: () => q, eq: () => q, lt: () => q, or: () => q, neq: () => q, limit: () => q,
      update: (data: any) => { mutation = true; writes.push({ table, data }); return q },
      delete: () => { mutation = true; writes.push({ table }); return q },
      then(resolve: any) {
        const failed = table === 'lgpd_retention_policies' ? failure === (mutation ? 'checkpoint' : 'lookup') : failure === 'mutation'
        return Promise.resolve({ error: failed ? { message: 'personal-canary-database-error' } : null, count: failed ? null : 1, data: table === 'lgpd_retention_policies' && !mutation ? [{ id: 'policy-a', organization_id: 'org-a', resource, retention_days: 30, anonymize_only: true }] : [{ id: 'row-a' }] }).then(resolve)
      },
    }
    return q
  })
  return writes
}

it('does not advance last_run_at or report applied when retention mutation fails', async () => {
  const writes = setup('contact_events', 'mutation')
  const res = await run()
  expect(res.status).toBeGreaterThanOrEqual(400)
  expect(writes.filter(w => w.table === 'lgpd_retention_policies')).toEqual([])
  expect(JSON.stringify(await res.json())).not.toContain('personal-canary')
})
it('reports a failed policy lookup rather than applied zero', async () => {
  setup('contact_events', 'lookup')
  expect((await run()).status).toBeGreaterThanOrEqual(400)
})
it('rejects unsupported retention resources without marking them applied', async () => {
  const writes = setup('unsupported', null)
  expect((await run()).status).toBeGreaterThanOrEqual(400)
  expect(writes).toEqual([])
})
it('reports checkpoint failure and preserves successful limited event retention', async () => {
  setup('contact_events', 'checkpoint')
  expect((await run()).status).toBeGreaterThanOrEqual(400)
  setup('contact_events', null)
  expect((await run()).status).toBe(200)
})

it('keeps inactive contacts for review instead of destroying subject links with an incomplete graph', async () => {
  const writes = setup('contacts_inactive', null)
  expect((await run()).status).toBeGreaterThanOrEqual(400)
  expect(writes).toEqual([])
})
