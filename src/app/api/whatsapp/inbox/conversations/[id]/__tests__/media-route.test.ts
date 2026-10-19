import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: (...args: any[]) => mockAuth(...args),
}))

const queryCalls: Array<{ method: string; args: any[] }> = []
let queryResult: any
const makeQuery = (table: string): any => {
  const query: any = new Proxy(
    {},
    {
      get(_target, method: string) {
        if (method === 'then') {
          const result = table === 'whatsapp_cloud_conversations'
            ? { data: { id: 'conv-1', organization_id: 'org-1' }, error: null }
            : queryResult
          return (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject)
        }
        return (...args: any[]) => {
          queryCalls.push({ method, args })
          return query
        }
      },
    },
  )
  return query
}

const createSignedUrl = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (table: string) => makeQuery(table),
    storage: {
      from: () => ({ createSignedUrl: (...args: any[]) => createSignedUrl(...args) }),
    },
  },
}))

import { GET } from '../media/route'

describe('GET /api/whatsapp/inbox/conversations/[id]/media', () => {
  beforeEach(() => {
    mockAuth.mockReset()
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'agent-1' })
    queryCalls.length = 0
    queryResult = {
      data: {
        media_storage_path: 'org-1/conv-1/msg-1.jpg',
        media_url: 'https://signed.example/old',
      },
      error: null,
    }
    createSignedUrl.mockReset()
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example/fresh' },
      error: null,
    })
  })

  it('renova a URL assinada do storage para atendente autenticado da organização', async () => {
    const request = {
      url: 'http://localhost/api/whatsapp/inbox/conversations/conv-1/media?messageId=msg-1',
    } as any

    const response = await GET(request, { params: Promise.resolve({ id: 'conv-1' }) })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      url: 'https://signed.example/fresh',
      expiresIn: 3600,
    })
    expect(queryCalls).toContainEqual({ method: 'eq', args: ['conversation_id', 'conv-1'] })
    expect(queryCalls).toContainEqual({ method: 'eq', args: ['organization_id', 'org-1'] })
    expect(createSignedUrl).toHaveBeenCalledWith('org-1/conv-1/msg-1.jpg', 3600)
  })
})

describe('private media ownership', () => {
  const read = () => GET({ url: 'http://localhost/media?messageId=msg-1' } as any,
    { params: Promise.resolve({ id: 'conv-1' }) })
  beforeEach(() => {
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'agent-1' })
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
    createSignedUrl.mockClear()
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'fresh' }, error: null })
  })
  it.each(['org-2/conv-1/m.jpg', 'org-1/conv-2/m.jpg', 'org-1/conv-1/../m.jpg', 'org-1/conv-1/m%2f.jpg'])('rejects foreign or ambiguous key %s', async path => {
    queryResult = { data: { media_storage_path: path, media_url: 'https://old.example/m.jpg' } }
    expect((await read()).status).toBe(404)
    expect(createSignedUrl).not.toHaveBeenCalled()
  })
  it('resigns an owned legacy public URL', async () => {
    queryResult = { data: { media_url: 'https://project.supabase.co/storage/v1/object/public/whatsapp-media/org-1/conv-1/m.jpg' } }
    expect(await (await read()).json()).toEqual({ url: 'fresh', expiresIn: 3600 })
    expect(createSignedUrl).toHaveBeenCalledWith('org-1/conv-1/m.jpg', 3600)
  })
  it.each(['https://foreign.example/storage/v1/object/public/whatsapp-media/org-1/conv-1/m.jpg', 'https://project.supabase.co/storage/v1/object/public/whatsapp-media/org-2/conv-1/m.jpg'])('does not expose foreign legacy URL %s', async media_url => {
    queryResult = { data: { media_url } }
    expect((await read()).status).toBe(404)
    expect(createSignedUrl).not.toHaveBeenCalled()
  })
  it('does not expose persisted expired/public URL when signing fails', async () => {
    queryResult = { data: { media_storage_path: 'org-1/conv-1/m.jpg', media_url: 'https://old.example/m.jpg' } }
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'secret database details' } })
    const response = await read()
    expect(response.status).toBe(503)
    expect(JSON.stringify(await response.json())).not.toContain('old.example')
  })
})
