import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  conversationOrg: 'org-1',
  sign: vi.fn(),
  signMany: vi.fn(),
  download: vi.fn(),
  calls: [] as Array<[string, string, ...any[]]>,
}))
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: async () => ({ orgId: 'org-1', userId: 'user-1' }),
}))
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {
  from: (table: string) => {
    const filters: Array<[string, any]> = []
    let single = false
    const query: any = new Proxy({}, { get: (_, method: string) => {
      if (method === 'then') return (resolve: any, reject: any) => {
        const rows = table.includes('conversations')
          ? [{ id: 'conv-1', organization_id: state.conversationOrg, provider: 'cloud' }]
          : [{ id: 'msg-1', organization_id: 'org-1', conversation_id: 'conv-1',
            provider: 'cloud', media_storage_path: 'org-1/conv-1/m.jpg', media_url: 'expired' }]
        const matched = rows.filter(row => filters.every(([key, value]) => (row as any)[key] === value))
        return Promise.resolve({ data: single ? matched[0] || null : matched, error: null })
          .then(resolve, reject)
      }
      return (...args: any[]) => {
        state.calls.push([table, method, ...args])
        if (method === 'eq') filters.push([args[0], args[1]])
        if (method === 'single' || method === 'maybeSingle') single = true
        return query
      }
    } })
    return query
  },
  storage: { from: () => ({
    createSignedUrl: state.sign, createSignedUrls: state.signMany, download: state.download,
  }) },
} }))

import { GET as mediaGET } from '../media/route'
import { GET as messagesGET } from '../messages/route'

const handlers = [
  ['media', mediaGET, 'http://localhost/media?messageId=msg-1'],
  ['messages', messagesGET, 'http://localhost/messages?after=2020-01-01'],
] as const

beforeEach(() => {
  state.conversationOrg = 'org-1'
  state.calls = []
  state.sign.mockReset().mockResolvedValue({ data: { signedUrl: 'signed:owned' }, error: null })
  state.signMany.mockReset().mockResolvedValue({
    data: [{ path: 'org-1/conv-1/m.jpg', signedUrl: 'signed:owned' }], error: null,
  })
  state.download.mockReset()
})

it.each(handlers)('%s refuses org-A message referencing org-B conversation before signing', async (_, handler, url) => {
  state.conversationOrg = 'org-2'
  const response = await handler({ url } as any, { params: Promise.resolve({ id: 'conv-1' }) })
  expect(response.status).toBe(404)
  expect(JSON.stringify(await response.json())).not.toContain('signed:owned')
  expect(state.sign).not.toHaveBeenCalled()
  expect(state.signMany).not.toHaveBeenCalled()
  expect(state.download).not.toHaveBeenCalled()
})

it.each(handlers)('%s preserves media for its own conversation', async (name, handler, url) => {
  const response = await handler({ url } as any, { params: Promise.resolve({ id: 'conv-1' }) })
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(name === 'media' ? body.url : body.messages[0].media_url).toBe('signed:owned')
  if (name === 'media') expect(state.sign).toHaveBeenCalledWith('org-1/conv-1/m.jpg', 3600)
  else expect(state.signMany).toHaveBeenCalledWith(['org-1/conv-1/m.jpg'], 3600)
})
