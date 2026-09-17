import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: (...args: any[]) => mockAuth(...args),
}))

const queryCalls: Array<{ method: string; args: any[] }> = []
let queryResult: any
const query: any = new Proxy(
  {},
  {
    get(_target, method: string) {
      if (method === 'then') {
        return (resolve: any, reject: any) => Promise.resolve(queryResult).then(resolve, reject)
      }
      return (...args: any[]) => {
        queryCalls.push({ method, args })
        return query
      }
    },
  },
)

const createSignedUrl = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => query,
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

    const response = await GET(request, { params: { id: 'conv-1' } })

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
