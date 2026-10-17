import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const state = vi.hoisted(() => ({ authenticated: true, authError: false, errors: {} as Record<string, string> }))
vi.mock('@/lib/supabase-admin', async () => {
  const { createFakeSupabase } = await import('@/tests/fake-supabase')
  const db: any = createFakeSupabase()
  const from = db.from.bind(db)
  db.from = (table: string) => {
    const query = from(table)
    if (state.errors[table]) {
      query.single = query.maybeSingle = async () => ({ data: null, error: { code: state.errors[table] } })
    }
    return query
  }
  db.auth = { getUser: async () => ({ data: { user: state.authenticated ? { id: 'u1', email: 'user@example.test', user_metadata: {} } : null }, error: state.authError ? {} : null }) }
  return { supabaseAdmin: db, __db: db }
})
import * as mod from '@/lib/supabase-admin'
import { GET } from './route'
const db: any = (mod as any).__db
function req() {
  const token = `header.${Buffer.from(JSON.stringify({ sub: 'u1', session_id: 'session-u1', aal: 'aal1' })).toString('base64url')}.signature`
  return new NextRequest('http://localhost/api/whatsapp/agents/me', { headers: { cookie: `sb-access-token=${token}` } })
}
function agent() {
  db.tables.organization_members[0].role = 'agent'
  db.seed('agents', [{ id: 'a1', user_id: 'u1', name: 'Agente', organization_id: 'org-1', is_active: true }])
}
beforeEach(() => {
  db.reset(); state.authenticated = true; state.authError = false; state.errors = {}
  db.seed('profiles', [{ id: 'u1', organization_id: 'org-1', email: 'user@example.test' }])
  db.seed('organization_members', [{ user_id: 'u1', organization_id: 'org-1', role: 'owner', status: 'active' }])
  db.seed('organizations', [{ id: 'org-1', settings: {} }])
  db.defineRpc('list_auth_sessions', () => [{ id: 'session-u1' }])
  db.defineRpc('list_mfa_factors', () => [])
})

describe('/api/whatsapp/agents/me — fail-closed', () => {
  it('sem sessão: 401, e o corpo não traz isAdmin: true', async () => {
    state.authenticated = false
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect((await res.json()).isAdmin).not.toBe(true)
  })
  it('erro do provedor de auth: 401 também, sem isAdmin: true', async () => {
    state.authError = true
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect((await res.json()).isAdmin).not.toBe(true)
  })
  it('owner autenticado: continua admin, acesso total', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ isAdmin: true, isAgent: false, permissions: null })
  })
  it('usuário agente: mantém as permissões dele, igual a hoje', async () => {
    agent()
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ isAgent: true, isAdmin: false, permissions: { agentId: 'a1' } })
    expect(db.calls).toContainEqual(['agents', 'eq', ['organization_id', 'org-1']])
  })
  it('erro real de permissões é não-2xx e nunca devolve defaults permissivos', async () => {
    agent(); state.errors.agent_permissions = '42501'
    const res = await GET(req())
    expect(res.ok).toBe(false)
    expect(await res.json()).toMatchObject({ isAdmin: false, permissions: null })
  })
  it('erro ao buscar agente é não-2xx e nunca devolve permissões', async () => {
    agent(); state.errors.agents = '42501'
    const res = await GET(req())
    expect(res.ok).toBe(false)
    expect(await res.json()).toMatchObject({ isAdmin: false, permissions: null })
  })
  it('usuário autenticado sem organização de perfil nunca é admin', async () => {
    db.tables.profiles[0].organization_id = null
    const res = await GET(req())
    expect(res.ok).toBe(false)
    expect(await res.json()).toMatchObject({ isAdmin: false, permissions: null })
  })
})
