/**
 * O roster da fila para de aceitar a org como parâmetro.
 *
 * Mesmo defeito do `/api/agents/status` (item 2): `supabaseAdmin` — service_role,
 * que passa por cima da RLS — com `organization_id` vindo da query string e
 * nenhuma chamada de auth. Um UUID bastava para listar os atendentes de qualquer
 * loja, com nome, e-mail e avatar do perfil de cada um, mais as métricas de
 * capacidade da operação.
 *
 * Aqui a diferença entre os dois tipos de parâmetro fica explícita: `status` é
 * filtro legítimo e continua vindo do cliente; `organization_id` é fronteira de
 * tenancy e passa a vir só da sessão.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const mockAuth = vi.fn()
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: (...args: any[]) => mockAuth(...args),
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
      if (prop === 'then') return (resolve: any) => resolve(chainResult)
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

import { GET } from './route'

const SESSION = { orgId: 'org-da-sessao', userId: 'user-da-sessao' }
const ALHEIA = 'org-de-outra-loja'

function req(query = ''): any {
  return { url: `http://localhost/api/queue/agents${query}`, headers: new Headers() }
}

describe('/api/queue/agents — o roster é o da sessão', () => {
  beforeEach(() => {
    resetChain()
    mockAuth.mockReset()
    mockAuth.mockResolvedValue(SESSION)
  })

  it('sem sessão devolve 401 e não toca o banco', async () => {
    mockAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    const res = await GET(req(`?organization_id=${ALHEIA}`))

    expect(res.status).toBe(401)
    expect(calls['from']).toBeUndefined()
  })

  it('ignora o organization_id da query e lista o da sessão', async () => {
    chainResult = { data: [], error: null }

    await GET(req(`?organization_id=${ALHEIA}`))

    expect(calls['eq']).toContainEqual(['organization_id', SESSION.orgId])
    expect(JSON.stringify(calls['eq'])).not.toContain(ALHEIA)
  })

  it('o filtro de status continua sendo do cliente — não é fronteira de tenancy', async () => {
    chainResult = { data: [], error: null }

    await GET(req('?status=online'))

    expect(calls['eq']).toContainEqual(['status', 'online'])
    expect(calls['eq']).toContainEqual(['organization_id', SESSION.orgId])
  })

  it('status=all não vira filtro', async () => {
    chainResult = { data: [], error: null }

    await GET(req('?status=all'))

    expect(calls['eq']).not.toContainEqual(['status', 'all'])
  })
})
