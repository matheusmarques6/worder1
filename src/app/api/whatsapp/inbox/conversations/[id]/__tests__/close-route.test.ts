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

import { POST } from '../close/route'

function req(body: any): any {
  return { json: async () => body, headers: new Headers() }
}
const ctx = { params: { id: 'conv-1' } }

describe('POST /api/whatsapp/inbox/conversations/[id]/close', () => {
  beforeEach(() => {
    resetChain()
    mockAuth.mockReset()
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'user-1' })
    mockResolve.mockReset()
  })

  it('retorna 404 quando a conversa nao existe', async () => {
    mockResolve.mockResolvedValue(null)
    const res = await POST(req({ resolution: 'ok' }), ctx)
    expect(res.status).toBe(404)
    expect(calls['update']).toBeUndefined()
  })

  it('fecha conversa cloud na tabela cloud sem colunas resolved_* (nao existem la)', async () => {
    mockResolve.mockResolvedValue({
      table: 'whatsapp_cloud_conversations',
      provider: 'cloud',
      row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1' },
    })
    chainResult = { data: { id: 'conv-1', status: 'closed' }, error: null }
    const res = await POST(req({ resolution: 'resolvido' }), ctx)
    expect(res.status).toBe(200)
    expect(calls['from']).toContainEqual(['whatsapp_cloud_conversations'])
    const updateArg = calls['update']?.[0]?.[0]
    expect(updateArg.status).toBe('closed')
    expect(updateArg.resolved_at).toBeUndefined()
    expect(updateArg.resolved_by).toBeUndefined()
    // atividade registrada com contact_id do resolver e org do auth
    const insertArg = calls['insert']?.[0]?.[0]
    expect(insertArg.activity_type).toBe('conversation_closed')
    expect(insertArg.contact_id).toBe('ct-1')
    expect(insertArg.organization_id).toBe('org-1')
  })

  it('fecha conversa legacy com resolved_at/resolved_by', async () => {
    mockResolve.mockResolvedValue({
      table: 'whatsapp_conversations',
      provider: 'evolution',
      row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1', unified_contact_id: null },
    })
    chainResult = { data: { id: 'conv-1', status: 'closed' }, error: null }
    await POST(req({ resolution: 'resolvido' }), ctx)
    expect(calls['from']).toContainEqual(['whatsapp_conversations'])
    const updateArg = calls['update']?.[0]?.[0]
    expect(updateArg.status).toBe('closed')
    expect(updateArg.resolved_by).toBe('user-1')
    expect(updateArg.resolved_at).toBeTruthy()
  })

  it('nao registra atividade quando a conversa nao tem contato', async () => {
    mockResolve.mockResolvedValue({
      table: 'whatsapp_cloud_conversations',
      provider: 'cloud',
      row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: null },
    })
    chainResult = { data: { id: 'conv-1', status: 'closed' }, error: null }
    const res = await POST(req({}), ctx)
    expect(res.status).toBe(200)
    expect(calls['insert']).toBeUndefined()
  })
})
