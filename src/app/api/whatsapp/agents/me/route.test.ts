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
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: () => ({
    auth: { getUser: (...args: any[]) => mockGetUser(...args) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
        }),
      }),
    }),
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
  })
})
