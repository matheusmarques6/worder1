/**
 * Sem sessão válida, a rota não pode responder "você é admin, sem restrição
 * de permissão" — era o que `isAdmin: true, permissions: null` significava
 * pra quem consome. O comentário original dizia que isso evitava travar a
 * UI; quem realmente travava era o catch-all do hook (`useAgentPermissions`),
 * que também assumia admin em qualquer erro de fetch — a mesma falha, um
 * andar acima. As duas saem juntas.
 *
 * Falha de autenticação (sem usuário) e erro do provedor de auth são a
 * mesma coisa pra quem chama: 401. Não há motivo pro consumidor tratar
 * "não sei quem você é" diferente de "não consegui descobrir quem você é".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const queryResults: Record<string, Array<{ data: any; error: any }>> = {}
const queryCalls: Array<{ table: string; args: any[] }> = []

function queueResult(table: string, result: { data: any; error: any }) {
  queryResults[table] = queryResults[table] || []
  queryResults[table].push(result)
}

function query(table: string) {
  const chain: any = {
    select: () => chain,
    eq: (...args: any[]) => {
      queryCalls.push({ table, args })
      return chain
    },
    single: async () => queryResults[table]?.shift() || { data: null, error: null },
  }
  return chain
}

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: () => ({
    auth: { getUser: (...args: any[]) => mockGetUser(...args) },
    from: (table: string) => query(table),
  }),
}))

vi.mock('next/headers', () => ({ cookies: () => ({}) }))

import { GET } from './route'

function req(): any {
  return {} as any
}

describe('/api/whatsapp/agents/me — fail-closed', () => {
  beforeEach(() => {
    mockGetUser.mockReset()
    for (const table of Object.keys(queryResults)) delete queryResults[table]
    queryCalls.length = 0
  })

  it('sem sessão: 401, e o corpo não traz isAdmin: true', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res: any = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.isAdmin).not.toBe(true)
  })

  it('erro do provedor de auth: 401 também, sem isAdmin: true', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('provedor fora do ar') })

    const res: any = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.isAdmin).not.toBe(true)
  })

  it('usuário autenticado não-agente: continua admin, acesso total', async () => {
    queueResult('profiles', { data: { organization_id: 'org-1' }, error: null })
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'dona@loja.com', user_metadata: {} } },
      error: null,
    })

    const res: any = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.isAdmin).toBe(true)
    expect(body.isAgent).toBe(false)
    expect(body.permissions).toBe(null)
  })

  it('usuário agente: mantém as permissões dele, igual a hoje', async () => {
    queueResult('profiles', { data: { organization_id: 'org-1' }, error: null })
    queueResult('agents', {
      data: { id: 'a1', name: 'Agente', email: 'agente@loja.com', role: 'agent', status: 'online', organization_id: 'org-1' },
      error: null,
    })
    queueResult('agent_permissions', { data: null, error: { code: 'PGRST116' } })
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'u2',
          email: 'agente@loja.com',
          user_metadata: { is_agent: true, agent_id: 'a1' },
        },
      },
      error: null,
    })

    const res: any = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.isAgent).toBe(true)
    expect(body.isAdmin).toBe(false)
    expect(body.permissions).not.toBe(null)
    expect(body.permissions.agentId).toBe('a1')
    expect(queryCalls).toContainEqual({ table: 'agents', args: ['organization_id', 'org-1'] })
  })

  it('erro real de permissões é não-2xx e nunca devolve defaults permissivos', async () => {
    queueResult('profiles', { data: { organization_id: 'org-1' }, error: null })
    queueResult('agents', { data: { id: 'a1', organization_id: 'org-1' }, error: null })
    queueResult('agent_permissions', { data: null, error: { code: '42501', message: 'RLS falhou' } })
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u2', email: 'agente@loja.com', user_metadata: { is_agent: true, agent_id: 'a1' } } },
      error: null,
    })

    const res: any = await GET(req())
    const body = await res.json()

    expect(res.ok).toBe(false)
    expect(body.isAdmin).not.toBe(true)
    expect(body.permissions).toBe(null)
  })

  it('erro ao buscar agente é não-2xx e nunca devolve permissões', async () => {
    queueResult('profiles', { data: { organization_id: 'org-1' }, error: null })
    queueResult('agents', { data: null, error: { code: '42501', message: 'agents indisponível' } })
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u2', email: 'agente@loja.com', user_metadata: { is_agent: true, agent_id: 'a1' } } },
      error: null,
    })

    const res: any = await GET(req())
    const body = await res.json()

    expect(res.ok).toBe(false)
    expect(body.isAdmin).not.toBe(true)
    expect(body.permissions).toBe(null)
  })

  it('usuário autenticado sem organização de perfil nunca é admin', async () => {
    queueResult('profiles', { data: { organization_id: null }, error: null })
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'dona@loja.com', user_metadata: {} } },
      error: null,
    })

    const res: any = await GET(req())
    const body = await res.json()

    expect(res.ok).toBe(false)
    expect(body.isAdmin).not.toBe(true)
    expect(body.permissions).toBe(null)
  })
})
