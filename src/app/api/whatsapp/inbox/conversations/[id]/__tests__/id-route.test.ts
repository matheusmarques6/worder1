import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Mocks (hoisted) ----
const mockAuth = vi.fn()
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: (...args: any[]) => mockAuth(...args),
}))

const mockResolve = vi.fn()
vi.mock('@/lib/whatsapp/inbox-conversation-resolver', () => ({
  resolveInboxConversation: (...args: any[]) => mockResolve(...args),
}))

// Chain thenable (convencao de reactivate-ai/route.test.ts)
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

import { PUT } from '../route'

function req(body: any): any {
  return { json: async () => body, headers: new Headers() }
}
const ctx = { params: { id: 'conv-1' } }

const cloudResolved = {
  table: 'whatsapp_cloud_conversations',
  provider: 'cloud',
  row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1' },
}
const legacyResolved = {
  table: 'whatsapp_conversations',
  provider: 'evolution',
  row: { id: 'conv-1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1', unified_contact_id: null },
}

describe('PUT /api/whatsapp/inbox/conversations/[id]', () => {
  beforeEach(() => {
    resetChain()
    mockAuth.mockReset()
    mockAuth.mockResolvedValue({ orgId: 'org-1', userId: 'user-1' })
    mockResolve.mockReset()
  })

  it('retorna 404 (nao 500) quando a conversa nao existe em nenhuma tabela', async () => {
    mockResolve.mockResolvedValue(null)
    const res = await PUT(req({ status: 'archived' }), ctx)
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('Conversation not found')
    expect(calls['update']).toBeUndefined()
  })

  it('atualiza whatsapp_cloud_conversations quando a conversa e cloud', async () => {
    mockResolve.mockResolvedValue(cloudResolved)
    chainResult = { data: { id: 'conv-1', status: 'archived' }, error: null }
    const res = await PUT(req({ status: 'archived' }), ctx)
    expect(res.status).toBe(200)
    expect(calls['from']).toContainEqual(['whatsapp_cloud_conversations'])
    expect(calls['update']?.[0]?.[0].status).toBe('archived')
    expect(calls['eq']).toContainEqual(['organization_id', 'org-1'])
  })

  it('nao envia colunas legadas para a tabela cloud e mapeia bot -> ai_enabled', async () => {
    mockResolve.mockResolvedValue(cloudResolved)
    chainResult = { data: { id: 'conv-1' }, error: null }
    await PUT(
      req({ status: 'pending', priority: 'high', internalNote: 'x', assignedAgentId: 'agent-1', isBotActive: false, botDisabledReason: 'transferred_to_human' }),
      ctx,
    )
    const updateArg = calls['update']?.[0]?.[0]
    expect(updateArg.priority).toBeUndefined()
    expect(updateArg.internal_note).toBeUndefined()
    expect(updateArg.is_bot_active).toBeUndefined()
    expect(updateArg.assigned_to).toBe('agent-1')
    expect(updateArg.ai_enabled).toBe(false)
    expect(updateArg.ai_disabled_reason).toBe('transferred_to_human')
    expect(updateArg.ai_disabled_at).toBeTruthy()
  })

  it('mantem o comportamento legado para conversas evolution', async () => {
    mockResolve.mockResolvedValue(legacyResolved)
    chainResult = { data: { id: 'conv-1' }, error: null }
    await PUT(req({ priority: 'high', assignedAgentId: 'agent-1', isBotActive: true, internalNote: 'nota' }), ctx)
    expect(calls['from']).toContainEqual(['whatsapp_conversations'])
    const updateArg = calls['update']?.[0]?.[0]
    expect(updateArg.priority).toBe('high')
    expect(updateArg.assigned_agent_id).toBe('agent-1')
    expect(updateArg.is_bot_active).toBe(true)
    expect(updateArg.ai_enabled).toBe(true)
    expect(updateArg.internal_note).toBe('nota')
    expect(updateArg.bot_disabled_reason).toBeNull()
  })
})
