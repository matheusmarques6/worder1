import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: (...args: any[]) => mockAuth(...args),
}))

const mockResolve = vi.fn()
vi.mock('@/lib/whatsapp/inbox-conversation-resolver', () => ({
  resolveInboxConversation: (...args: any[]) => mockResolve(...args),
}))

let chainResult: any = {}
const calls: Record<string, any[][]> = {}
function resetChain() {
  chainResult = {}
  for (const k of Object.keys(calls)) delete calls[k]
}
function track(name: string, args: any[]) {
  calls[name] = calls[name] || []
  calls[name].push(args)
}
const chain: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: any) => resolve(chainResult)
      }
      return (...args: any[]) => {
        track(prop, args)
        return chain
      }
    },
  },
)

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: any[]) => (track('from', args), chain) },
}))

import { POST } from '../read/route'

function req(): any {
  return { json: async () => ({}), headers: new Headers() }
}
const ctx = { params: { id: 'conv-1' } }

describe('POST /api/whatsapp/inbox/conversations/[id]/read', () => {
  beforeEach(() => {
    resetChain()
    mockAuth.mockReset()
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'user-1' })
    mockResolve.mockReset()
  })

  it('retorna 404 quando a conversa nao existe (antes era no-op silencioso)', async () => {
    mockResolve.mockResolvedValue(null)
    const res = await POST(req(), ctx)
    expect(res.status).toBe(404)
    expect(calls['update']).toBeUndefined()
  })

  it('zera unread_count na tabela cloud para conversa cloud', async () => {
    mockResolve.mockResolvedValue({
      table: 'whatsapp_cloud_conversations',
      provider: 'cloud',
      row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1' },
    })
    chainResult = { error: null }
    const res = await POST(req(), ctx)
    expect(res.status).toBe(200)
    expect(calls['from']).toContainEqual(['whatsapp_cloud_conversations'])
    expect(calls['update']?.[0]?.[0]).toEqual({ unread_count: 0 })
    expect(calls['eq']).toContainEqual(['organization_id', 'org-1'])
  })

  it('zera unread_count na tabela legacy para conversa evolution', async () => {
    mockResolve.mockResolvedValue({
      table: 'whatsapp_conversations',
      provider: 'evolution',
      row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1', unified_contact_id: null },
    })
    chainResult = { error: null }
    const res = await POST(req(), ctx)
    expect(res.status).toBe(200)
    expect(calls['from']).toContainEqual(['whatsapp_conversations'])
  })
})
