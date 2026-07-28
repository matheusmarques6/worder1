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

import { POST } from '../assign/route'

function req(body: any): any {
  return { json: async () => body, headers: new Headers() }
}
const ctx = { params: { id: 'conv-1' } }

describe('POST /api/whatsapp/inbox/conversations/[id]/assign', () => {
  beforeEach(() => {
    resetChain()
    mockAuth.mockReset()
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'user-1' })
    mockResolve.mockReset()
  })

  it('retorna 404 quando a conversa nao existe', async () => {
    mockResolve.mockResolvedValue(null)
    const res = await POST(req({ userId: 'agent-1' }), ctx)
    expect(res.status).toBe(404)
    expect(calls['update']).toBeUndefined()
  })

  it('atribui conversa cloud na tabela cloud (assigned_to) escopado por org', async () => {
    mockResolve.mockResolvedValue({
      table: 'whatsapp_cloud_conversations',
      provider: 'cloud',
      row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1' },
    })
    chainResult = { data: { id: 'conv-1', assigned_to: 'agent-1', status: 'open' }, error: null }
    const res = await POST(req({ userId: 'agent-1' }), ctx)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(calls['from']).toContainEqual(['whatsapp_cloud_conversations'])
    expect(calls['update']?.[0]?.[0].assigned_to).toBe('agent-1')
    expect(calls['eq']).toContainEqual(['organization_id', 'org-1'])
    expect(data.conversation.assigned_agent_id).toBe('agent-1')
    // atividade usa contact_id do resolver + org do auth
    const insertArg = calls['insert']?.[0]?.[0]
    expect(insertArg.activity_type).toBe('conversation_assigned')
    expect(insertArg.contact_id).toBe('ct-1')
    expect(insertArg.organization_id).toBe('org-1')
  })

  it('legacy: prefere unified_contact_id na atividade e atualiza a tabela legacy', async () => {
    mockResolve.mockResolvedValue({
      table: 'whatsapp_conversations',
      provider: 'evolution',
      row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1', unified_contact_id: 'uc-1' },
    })
    chainResult = { data: { id: 'conv-1', assigned_to: 'agent-1', status: 'open' }, error: null }
    await POST(req({ userId: 'agent-1' }), ctx)
    expect(calls['from']).toContainEqual(['whatsapp_conversations'])
    expect(calls['insert']?.[0]?.[0].contact_id).toBe('uc-1')
  })

  it('remove atribuicao (userId null) sem registrar atividade', async () => {
    mockResolve.mockResolvedValue({
      table: 'whatsapp_cloud_conversations',
      provider: 'cloud',
      row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1' },
    })
    chainResult = { data: { id: 'conv-1', assigned_to: null, status: 'open' }, error: null }
    const res = await POST(req({ userId: null }), ctx)
    expect(res.status).toBe(200)
    expect(calls['update']?.[0]?.[0].assigned_to).toBeNull()
    expect(calls['insert']).toBeUndefined()
  })
})
