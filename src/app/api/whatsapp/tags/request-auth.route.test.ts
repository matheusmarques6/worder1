import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

const state = vi.hoisted(() => ({
  token: 'session-a' as string | undefined,
  getUser: vi.fn(), from: vi.fn(), createClient: vi.fn(), orgFilters: [] as string[],
}))
vi.mock('next/headers', () => ({ cookies: async () => ({
  get: (name: string) => name === 'sb-access-token' && state.token ? { value: state.token } : undefined,
}) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: (...args: unknown[]) => state.createClient(...args) }))

beforeEach(() => {
  vi.clearAllMocks()
  state.token = 'session-a'
  state.orgFilters.length = 0
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-test-key')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'admin-must-not-be-used')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network in auth fixture') }))
  state.getUser.mockImplementation(async (token?: string) => ({
    data: { user: token?.startsWith('session-') ? { id: token.slice(8) } : null },
    error: token?.startsWith('session-') ? null : { message: 'Invalid session' },
  }))
  state.from.mockImplementation((table: string) => {
    let id = ''
    const query: any = {
      select: () => query,
      eq: (key: string, value: string) => {
        if (key === 'id') id = value
        if (key === 'organization_id') state.orgFilters.push(value)
        return query
      },
      single: async () => ({ data: { organization_id: `org-${id}` }, error: null }),
      order: async () => ({ data: table === 'whatsapp_chat_tags' ? [{ id: 'tag-fixture' }] : [], error: null }),
    }
    return query
  })
  state.createClient.mockReturnValue({ auth: { getUser: state.getUser }, from: state.from })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('awaits Next cookies and validates the app session while retaining a user RLS client', async () => {
  const result = await GET(new NextRequest('https://app.example.test/api/whatsapp/tags'))
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({ tags: [{ id: 'tag-fixture' }] })
  expect(state.getUser).toHaveBeenCalledWith('session-a')
  expect(state.createClient).toHaveBeenCalledWith('https://example.supabase.co', 'public-test-key', expect.objectContaining({
    global: { headers: { Authorization: 'Bearer session-a' } },
    auth: expect.objectContaining({ persistSession: false, autoRefreshToken: false }),
  }))
  expect(state.orgFilters).toEqual(['org-a'])
})

it.each([undefined, 'invalid'])('denies missing or invalid sessions without reading business data (%s)', async token => {
  state.token = token
  const result = await GET(new NextRequest('https://app.example.test/api/whatsapp/tags'))
  expect(result.status).toBe(401)
  expect(state.from).not.toHaveBeenCalled()
})

it('creates a separate user client for the next request instead of retaining the previous tenant token', async () => {
  expect((await GET(new NextRequest('https://app.example.test/api/whatsapp/tags'))).status).toBe(200)
  state.token = 'session-b'
  expect((await GET(new NextRequest('https://app.example.test/api/whatsapp/tags'))).status).toBe(200)
  expect(state.orgFilters).toEqual(['org-a', 'org-b'])
  expect(state.createClient).toHaveBeenCalledTimes(2)
  expect(state.getUser).toHaveBeenLastCalledWith('session-b')
})
