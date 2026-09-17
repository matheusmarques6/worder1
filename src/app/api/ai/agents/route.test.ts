import { describe, expect, it, vi } from 'vitest'

const { getSupabaseAdmin } = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn() }))

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin }))
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: vi.fn(async () => ({ user: { organization_id: 'org-1' } })),
}))
vi.mock('@/lib/ai/provider-key-check', () => ({
  hasActiveProviderKey: vi.fn(),
  providerKeyMissingResponse: vi.fn(),
}))
vi.mock('@/lib/ai/versions', () => ({ snapshotIfChanged: vi.fn() }))

import { POST } from './route'
import { PATCH, PUT } from './[id]/route'

const request = (body: unknown) => new Request('http://localhost', {
  method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
}) as any

describe('writers de agentes — cooldown_after_transfer', () => {
  it.each([true, false])('recusam booleano sem chegar ao banco: %s', async (value) => {
    getSupabaseAdmin.mockClear()
    const body = { name: 'Agente', settings: { behavior: { cooldown_after_transfer: value } } }

    for (const handler of [
      () => POST(request(body)),
      () => PUT(request(body), { params: { id: 'agent-1' } }),
      () => PATCH(request(body), { params: { id: 'agent-1' } }),
    ]) {
      const response = await handler()
      expect(response.status).toBe(400)
    }
    expect(getSupabaseAdmin).not.toHaveBeenCalled()
  })
})
