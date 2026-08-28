/**
 * A rota de presença do atendente parou de acreditar no cliente.
 *
 * Ela usa `supabaseAdmin` (service_role, que passa por cima da RLS) e tirava
 * `organization_id` e `user_id` da query string no GET e do corpo no PUT, sem
 * NENHUMA chamada de auth. O comentário no topo do arquivo dizia
 * "⚠️ CRÍTICO: organization_id é OBRIGATÓRIO para isolamento de dados" e o
 * código só conferia se o parâmetro estava PRESENTE — nunca se pertencia a quem
 * chamou. Qualquer um que soubesse dois UUIDs lia e ESCREVIA a presença de
 * qualquer atendente de qualquer loja, e o PUT ainda dispara
 * `assign_next_conversation` na fila daquela org.
 *
 * O que estes testes travam é a inversão: os dois identificadores passam a vir
 * da sessão, e o que o cliente mandar é ignorado — não rejeitado com 400, que
 * viraria um oráculo de "esse par existe", apenas ignorado.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const mockAuth = vi.fn()
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: (...args: any[]) => mockAuth(...args),
}))

// Chain thenable: cada método devolve o próprio chain; await resolve no result.
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
const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null })
vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => (track('from', args), chain),
    rpc: (...args: any[]) => mockRpc(...args),
  },
}))

import { GET, PUT } from './route'

const SESSION = { orgId: 'org-da-sessao', userId: 'user-da-sessao' }
const ALHEIA = 'org-de-outra-loja'

function getReq(query = ''): any {
  return { url: `http://localhost/api/agents/status${query}`, headers: new Headers() }
}
function putReq(body: any): any {
  return { json: async () => body, headers: new Headers() }
}

describe('/api/agents/status — a org vem da sessão, nunca do cliente', () => {
  beforeEach(() => {
    resetChain()
    mockAuth.mockReset()
    mockRpc.mockClear()
    mockAuth.mockResolvedValue(SESSION)
  })

  it('GET sem sessão devolve 401 e não toca o banco', async () => {
    mockAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    const res = await GET(getReq(`?organization_id=${ALHEIA}&user_id=alguem`))

    expect(res.status).toBe(401)
    expect(calls['from']).toBeUndefined()
  })

  it('GET ignora o organization_id da query e lê o da sessão', async () => {
    chainResult = { data: { status: 'online' }, error: null }

    await GET(getReq(`?organization_id=${ALHEIA}&user_id=alguem-de-outra-loja`))

    expect(calls['eq']).toContainEqual(['organization_id', SESSION.orgId])
    expect(calls['eq']).toContainEqual(['user_id', SESSION.userId])
    expect(JSON.stringify(calls['eq'])).not.toContain(ALHEIA)
  })

  it('PUT sem sessão devolve 401 e não escreve', async () => {
    mockAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    const res = await PUT(putReq({ organization_id: ALHEIA, user_id: 'alguem', status: 'online' }))

    expect(res.status).toBe(401)
    expect(calls['upsert']).toBeUndefined()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('PUT ignora organization_id e user_id do corpo — o IDOR de escrita fecha aqui', async () => {
    chainResult = { data: { status: 'online' }, error: null }

    await PUT(putReq({ organization_id: ALHEIA, user_id: 'alguem-de-outra-loja', status: 'online' }))

    const gravado = calls['upsert']?.[0]?.[0]
    expect(gravado.organization_id).toBe(SESSION.orgId)
    expect(gravado.user_id).toBe(SESSION.userId)
  })

  it('PUT online enfileira na org da sessão, não na que o corpo pediu', async () => {
    chainResult = { data: { status: 'online' }, error: null }

    await PUT(putReq({ organization_id: ALHEIA, status: 'online' }))

    expect(mockRpc).toHaveBeenCalledWith('assign_next_conversation', {
      p_organization_id: SESSION.orgId,
    })
  })
})
