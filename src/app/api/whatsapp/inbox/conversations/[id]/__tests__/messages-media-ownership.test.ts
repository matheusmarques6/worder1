import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ messages: [] as any[], sign: vi.fn(), calls: [] as any[] }))
vi.mock('@/lib/auth/require-org', () => ({ requireOrgFromAuth: async () => ({ orgId: 'org-1', userId: 'u-1' }) }))
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {
  from: () => {
    const query: any = new Proxy({}, { get: (_, key) => key === 'then'
      ? (resolve: any) => Promise.resolve({ data: state.messages, error: null }).then(resolve)
      : (...args: any[]) => { state.calls.push([key, ...args]); return query } })
    return query
  },
  storage: { from: () => ({ createSignedUrls: state.sign }) },
} }))

import { GET } from '../messages/route'
const read = () => GET({ url: 'http://localhost/messages?after=2020-01-01' } as any, { params: Promise.resolve({ id: 'conv-1' }) })
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
  state.calls = []
  state.sign.mockReset().mockImplementation(async (paths: string[]) => ({ data: paths.map(path => ({ path, signedUrl: `signed:${path}` })) }))
})
it('only signs owned keys and legacy project URLs, preserving explicit Evolution URLs', async () => {
  state.messages = [
    { id: 'a', media_storage_path: 'org-1/conv-1/a.jpg', media_url: 'expired' },
    { id: 'b', media_storage_path: 'org-2/conv-1/b.jpg', media_url: 'foreign' },
    { id: 'c', media_storage_path: 'org-1/conv-2/c.jpg', media_url: 'foreign' },
    { id: 'd', provider: 'cloud', media_url: 'https://project.supabase.co/storage/v1/object/public/whatsapp-media/org-1/conv-1/d.jpg' },
    { id: 'e', provider: 'cloud', media_url: 'https://external.example/image.jpg' },
    { id: 'f', provider: 'evolution', media_url: 'https://provider.example/image.jpg' },
  ]
  const response = await read()
  expect(response.status).toBe(200)
  expect((await response.json()).messages.map((m: any) => m.media_url)).toEqual([
    'signed:org-1/conv-1/a.jpg', null, null, 'signed:org-1/conv-1/d.jpg', null, 'https://provider.example/image.jpg',
  ])
  expect(state.sign).toHaveBeenCalledWith(['org-1/conv-1/a.jpg', 'org-1/conv-1/d.jpg'], 3600)
  expect(state.calls).toContainEqual(['eq', 'organization_id', 'org-1'])
  expect(state.calls).toContainEqual(['eq', 'conversation_id', 'conv-1'])
})
it('does not fall back to public or expired media URL when batch signing fails', async () => {
  state.messages = [{ media_storage_path: 'org-1/conv-1/a.jpg', media_url: 'https://public.example/a.jpg' }]
  state.sign.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
  expect((await (await read()).json()).messages[0].media_url).toBeNull()
})
