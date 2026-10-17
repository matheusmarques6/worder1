import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const caller = vi.hoisted(() => ({ role: 'agent', agentId: 'agent-a', aal: 'aal2' }))
vi.mock('@/lib/auth/require-org', () => ({ requireOrgFromAuth: async () => ({ orgId: 'org-a', userId: 'user-a', ...caller }) }))
vi.mock('@/lib/supabase-admin', async () => {
  const { createFakeSupabase } = await import('@/tests/fake-supabase')
  const db: any = createFakeSupabase()
  db.auth = { getUser: vi.fn(async () => ({ data: { user: { id: 'user-a' } }, error: null })), admin: { updateUserById: vi.fn(async () => ({ error: null })) } }
  return { supabaseAdmin: db, getSupabaseAdmin: () => db, __db: db }
})
vi.mock('@/lib/api-utils', async () => {
  const mod: any = await import('@/lib/supabase-admin')
  return { getSupabaseClient: () => mod.__db }
})
vi.mock('@supabase/auth-helpers-nextjs', async () => {
  const mod: any = await import('@/lib/supabase-admin')
  return { createRouteHandlerClient: () => mod.__db }
})
vi.mock('@/lib/auth/request-rls-client', async () => {
  const mod: any = await import('@/lib/supabase-admin')
  return { createRequestRlsClient: async () => ({ supabase: mod.__db, accessToken: 'test-token' }) }
})
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }))
import * as mod from '@/lib/supabase-admin'
import { POST as permissionsPost } from './permissions/route'
import { POST as resetPost } from './reset-password/route'
import { POST as agentsPost, PATCH as agentsPatch, DELETE as agentsDelete } from './route'
import { GET as conversationsGet } from '../conversations/route'
import { PUT as nestedPermissionsPut } from './[id]/permissions/route'
const db: any = (mod as any).__db
function req(body: any) { return new NextRequest('http://localhost/api/whatsapp/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) }
beforeEach(() => {
  db.reset(); vi.clearAllMocks(); caller.role = 'agent'; caller.agentId = 'agent-a'; caller.aal = 'aal2'
  db.seed('profiles', [{ id: 'user-a', organization_id: 'org-a' }])
  db.seed('agents', [
    { id: 'agent-a', user_id: 'user-a', organization_id: 'org-a', type: 'human', is_active: true },
    { id: 'agent-peer', user_id: 'peer', organization_id: 'org-a', type: 'human', is_active: true },
  ])
  db.seed('agent_permissions', [{ agent_id: 'agent-a', whatsapp_access_all: false, whatsapp_number_ids: ['number-a'] }])
  db.seed('whatsapp_conversations', [
    { id: 'allowed', organization_id: 'org-a', whatsapp_number_id: 'number-a', assigned_agent_id: 'agent-a' },
    { id: 'forbidden-number', organization_id: 'org-a', whatsapp_number_id: 'number-b', assigned_agent_id: 'agent-peer' },
    { id: 'other-tenant', organization_id: 'org-b', assigned_agent_id: 'agent-other' },
  ])
  db.seed('whatsapp_agent_assignments', [{ conversation_id: 'other-tenant', organization_id: 'org-b', agent_id: 'agent-other' }])
})
describe('agent permission boundaries', () => {
  it('deleting an agent revokes only their tenant and preserves another active membership', async () => {
    caller.role = 'admin'
    db.tables.profiles.push({ id: 'peer', organization_id: 'org-a', role: 'agent' })
    db.seed('organization_members', [
      { user_id: 'peer', organization_id: 'org-a', role: 'agent', status: 'active' },
      { user_id: 'peer', organization_id: 'org-b', role: 'member', status: 'active' },
    ])
    db.defineRpc('revoke_other_auth_sessions', () => 1)
    const response = await agentsDelete(new NextRequest('http://localhost/api/whatsapp/agents?id=agent-peer'))
    expect(response.status, JSON.stringify(await response.json())).toBe(200)
    expect(db.tables.organization_members[0].status).toBe('removed')
    expect(db.tables.organization_members[1].status).toBe('active')
    expect(db.tables.profiles.find((p: any) => p.id === 'peer')).toMatchObject({ organization_id: 'org-b', role: 'member' })
  })
  it('legacy agent permission management remains available to an authorized admin', async () => {
    caller.role = 'admin'
    db.seed('agents', [])
    db.seed('whatsapp_agents', [{ id: 'old-agent', user_id: 'peer', organization_id: 'org-a', is_active: true }])
    expect((await permissionsPost(req({ agent_id: 'old-agent', whatsapp_access_all: true }))).status).toBe(200)
  })
  it('nested permission endpoint also denies an agent without mutation', async () => {
    const response = await nestedPermissionsPut(req({ whatsapp_access_all: true }), { params: Promise.resolve({ id: 'agent-a' }) } as any)
    expect(response.status).toBe(403)
    expect(db.tables.agent_permissions[0].whatsapp_access_all).toBe(false)
  })
  it('nested admin update uses path identity rather than injected body identity', async () => {
    caller.role = 'admin'
    const response = await nestedPermissionsPut(req({ agent_id: 'agent-peer', whatsapp_access_all: true }), { params: Promise.resolve({ id: 'agent-a' }) } as any)
    expect(response.status).toBe(200)
    expect(db.tables.agent_permissions.at(-1)).toMatchObject({ agent_id: 'agent-a', whatsapp_access_all: true })
  })
  it.each(['agent', 'member', 'analyst'])('%s cannot write agent permissions', async (role) => {
    caller.role = role
    const response = await permissionsPost(req({ agent_id: 'agent-a', whatsapp_access_all: true }))
    expect(response.status).toBe(403)
    expect(db.tables.agent_permissions).toHaveLength(1)
    expect(db.tables.agent_permissions[0].whatsapp_access_all).toBe(false)
  })
  it('allows admin permission updates but strips arbitrary columns', async () => {
    caller.role = 'admin'
    expect((await permissionsPost(req({ agent_id: 'agent-a', whatsapp_access_all: true, organization_id: 'org-b', user_id: 'victim' }))).status).toBe(200)
    const written = db.tables.agent_permissions.at(-1)
    expect(written.whatsapp_access_all).toBe(true)
    expect(written).not.toHaveProperty('organization_id')
    expect(written).not.toHaveProperty('user_id')
  })
  it('agent cannot reset a peer password', async () => {
    expect((await resetPost(req({ agent_id: 'agent-peer' }))).status).toBe(403)
    expect(db.auth.admin.updateUserById).not.toHaveBeenCalled()
  })
  it('admin reset requires step-up', async () => {
    caller.role = 'admin'; caller.aal = 'aal1'
    expect((await resetPost(req({ agent_id: 'agent-peer' }))).status).toBe(403)
    expect(db.auth.admin.updateUserById).not.toHaveBeenCalled()
  })
  it('admin with aal2 can reset a peer in the same org', async () => {
    caller.role = 'admin'
    expect((await resetPost(req({ agent_id: 'agent-peer' }))).status).toBe(200)
    expect(db.auth.admin.updateUserById).toHaveBeenCalledOnce()
  })
  it('agent cannot patch role or permission through the general route', async () => {
    expect((await agentsPatch(req({ id: 'agent-a', role: 'admin', permissions: { whatsapp_access_all: true } }))).status).toBe(403)
    expect(db.tables.agents[0]).not.toHaveProperty('role', 'admin')
  })
  it.each([null, 'agent-a'])('cross-tenant assignment rejects target before mutations (agent %s)', async (agent_id) => {
    caller.role = 'admin'
    expect((await agentsPost(req({ action: 'assign', conversation_id: 'other-tenant', agent_id }))).status).toBe(404)
    expect(db.tables.whatsapp_agent_assignments[0].agent_id).toBe('agent-other')
    expect(db.tables.whatsapp_conversations[2].assigned_agent_id).toBe('agent-other')
  })
  it('same-tenant admin unassign remains available', async () => {
    caller.role = 'admin'
    expect((await agentsPost(req({ action: 'assign', conversation_id: 'allowed', agent_id: null }))).status).toBe(200)
    expect(db.tables.whatsapp_conversations[0].assigned_agent_id).toBeNull()
  })
  // O esquema não tem como ligar a conversa ao número da empresa: a lista
  // por número (`whatsapp_allowed_numbers`) não é conferível contra
  // `whatsapp_conversations`. Enquanto isso, o acesso restrito a números
  // nega — negar é o lado seguro de um controle que não dá para provar.
  it('agent restricted to specific numbers cannot transfer', async () => {
    db.seed('agent_permissions', [
      { agent_id: 'agent-a', whatsapp_access_all: false, can_transfer_conversations: true },
    ])
    expect((await agentsPost(req({ action: 'assign', conversation_id: 'allowed', agent_id: 'agent-a' }))).status).toBe(403)
    expect(db.tables.whatsapp_conversations[0].assigned_agent_id).toBe('agent-a')
  })
  it('agent with access to every number transfers their own conversation', async () => {
    db.seed('agent_permissions', [
      { agent_id: 'agent-a', whatsapp_access_all: true, can_transfer_conversations: true },
    ])
    expect((await agentsPost(req({ action: 'assign', conversation_id: 'allowed', agent_id: null }))).status).toBe(200)
    expect(db.tables.whatsapp_conversations[0].assigned_agent_id).toBeNull()
  })
  it.each(['', '?agent_id=agent-peer'])('applies caller permissions when query is omitted or forged: %s', async (query) => {
    const response = await conversationsGet(new NextRequest('http://localhost/api/whatsapp/conversations' + query))
    expect(response.status).toBe(200)
    expect((await response.json()).conversations.map((c: any) => c.id)).toEqual(['allowed'])
  })
  it('missing agent permissions exposes no conversations', async () => {
    db.seed('agent_permissions', [])
    const response = await conversationsGet(new NextRequest('http://localhost/api/whatsapp/conversations'))
    expect((await response.json()).conversations).toEqual([])
  })
  it('admin can list all conversations in their org', async () => {
    caller.role = 'admin'
    const response = await conversationsGet(new NextRequest('http://localhost/api/whatsapp/conversations'))
    expect((await response.json()).conversations.map((c: any) => c.id)).toEqual(['allowed', 'forbidden-number'])
  })
})
