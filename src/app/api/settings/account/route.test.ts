import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeSupabase } from '@/tests/fake-supabase'

const mockAuth = vi.fn()
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: (...args: any[]) => mockAuth(...args),
  authError: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}))

vi.mock('@/lib/supabase-admin', async () => {
  const { createFakeSupabase } = await import('@/tests/fake-supabase')
  const fake: any = createFakeSupabase()
  const updateUserById = vi.fn()
  fake.auth = { admin: { updateUserById } }
  return {
    supabaseAdmin: fake,
    isSupabaseConfigured: () => true,
    __db: fake,
    __updateUserById: updateUserById,
  }
})

import * as adminMod from '@/lib/supabase-admin'
import { PATCH } from './route'

const db = (adminMod as any).__db as FakeSupabase
const updateUserById = (adminMod as any).__updateUserById as ReturnType<typeof vi.fn>

beforeEach(() => {
  db.reset()
  mockAuth.mockReset()
  mockAuth.mockResolvedValue({
    supabase: db,
    user: { id: 'user-1', email: 'admin@example.test', organization_id: 'org-1', role: 'admin' },
  })
  updateUserById.mockReset()
  updateUserById.mockResolvedValue({ data: {}, error: null })
  db.seed('profiles', [{ id: 'user-1' }])
})

describe('PATCH /api/settings/account', () => {
  it('updates name parts without writing the generated full_name column', async () => {
    const request = new Request('http://localhost/api/settings/account', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'profile', full_name: 'Ada Lovelace', phone: '+55 11 99999-0000' }),
    })

    const response = await PATCH(request as any)

    expect(response.status).toBe(200)
    const updateCall = db.calls.find(([table, method]) => table === 'profiles' && method === 'update')
    expect(updateCall?.[2][0]).toMatchObject({
      first_name: 'Ada',
      last_name: 'Lovelace',
      phone: '+55 11 99999-0000',
      updated_at: expect.any(String),
    })
    expect(updateCall?.[2][0]).not.toHaveProperty('full_name')
  })
})
