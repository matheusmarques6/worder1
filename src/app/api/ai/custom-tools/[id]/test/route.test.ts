// src/app/api/ai/custom-tools/[id]/test/route.test.ts
// =============================================
// A rota de teste da custom tool (10.7) faz a chamada HTTP de verdade e
// devolve o corpo pro lojista ver — é a função dela. O item 19 do audit
// achou que "endpoint https://" (o CHECK do schema) era o único filtro:
// nada impedia o lojista de apontar pra 169.254.169.254 (metadata da nuvem)
// ou pra um host que resolve pra dentro da VPC e LER a resposta de volta na
// tela — SSRF que vira leitura direta, sem depender do agente repetir o
// conteúdo. Estes testes travam que o portão (ssrf-guard.ts, já usado pelo
// crawler no item 18) também guarda esta rota — e que o corpo NUNCA volta
// quando o destino é recusado.
//
// Nada aqui toca rede real: `fetch` global é mockado, e `node:dns/promises`
// também (mesmo padrão de crawler.test.ts).
// =============================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: (...args: any[]) => mockAuth(...args),
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
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (...args: any[]) => (track('from', args), chain),
  }),
}))

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))
import { lookup } from 'node:dns/promises'
const mockLookup = lookup as unknown as ReturnType<typeof vi.fn>

import { POST, GENERIC_REFUSAL_MESSAGE } from './route'

const AUTH = { user: { id: 'u1', email: 'a@b.com', organization_id: 'org-1' } }

function tool(overrides: Record<string, any> = {}) {
  return {
    id: 'tool-1',
    organization_id: 'org-1',
    endpoint: 'https://api.loja-publica.com/dados',
    method: 'GET',
    auth_header_name: 'Authorization',
    auth_header_value: null,
    ...overrides,
  }
}

function postReq(body: any = {}): any {
  return { json: async () => body }
}

describe('POST /api/ai/custom-tools/[id]/test — portão SSRF', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    resetChain()
    mockAuth.mockReset()
    mockAuth.mockResolvedValue(AUTH)
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    mockLookup.mockReset()
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('endpoint IP literal privado (metadata da nuvem) é recusado sem chamar fetch, e o corpo não volta', async () => {
    chainResult = { data: tool({ endpoint: 'http://169.254.169.254/latest/meta-data/' }) }
    fetchMock.mockResolvedValue(new Response('segredo-da-vpc', { status: 200 }))

    const res = await POST(postReq(), { params: { id: 'tool-1' } })
    const json = await res.json()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(json.status).toBe('failed')
    expect(JSON.stringify(json.detail)).not.toContain('segredo-da-vpc')
    expect(json.detail.error).toBe(GENERIC_REFUSAL_MESSAGE)
  })

  it('hostname que resolve para IP privado (127.0.0.1) é recusado sem chamar fetch', async () => {
    chainResult = { data: tool({ endpoint: 'https://interno.exemplo.com/api' }) }
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    fetchMock.mockResolvedValue(new Response('ok-interno', { status: 200 }))

    const res = await POST(postReq(), { params: { id: 'tool-1' } })
    const json = await res.json()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(json.status).toBe('failed')
    expect(JSON.stringify(json.detail)).not.toContain('ok-interno')
  })

  it('redirect (302) do host público pro metadata endpoint é recusado NO SALTO, corpo não volta', async () => {
    chainResult = { data: tool({ endpoint: 'https://api.loja-publica.com/dados' }) }
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      }),
    )

    const res = await POST(postReq(), { params: { id: 'tool-1' } })
    const json = await res.json()

    expect(fetchMock).toHaveBeenCalledTimes(1) // só o primeiro salto — o segundo nunca aconteceu
    expect(json.status).toBe('failed')
    expect(json.detail.error).toBe(GENERIC_REFUSAL_MESSAGE)
  })

  it('a mensagem de recusa é a MESMA pra "não resolve" e pra "resolve pra rede interna" — não é oráculo de DNS interno', async () => {
    // fix round 1 (review): as mensagens do guard distinguem "não foi
    // possível resolver o host" de "o host resolve para uma rede interna" —
    // um lojista autenticado testando endpoints podia usar essa diferença
    // pra enumerar hostnames internos. O caller vê UMA mensagem só; a
    // distinção fica só no log do servidor.
    chainResult = { data: tool({ endpoint: 'https://interno.exemplo.com/api' }) }
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    const resInterno = await POST(postReq(), { params: { id: 'tool-1' } })
    const jsonInterno = await resInterno.json()

    chainResult = { data: tool({ endpoint: 'https://naoexiste.exemplo.com/api' }) }
    mockLookup.mockReset()
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'))
    const resNaoResolve = await POST(postReq(), { params: { id: 'tool-1' } })
    const jsonNaoResolve = await resNaoResolve.json()

    expect(jsonInterno.detail.error).toBe(GENERIC_REFUSAL_MESSAGE)
    expect(jsonNaoResolve.detail.error).toBe(GENERIC_REFUSAL_MESSAGE)
    expect(jsonInterno.detail.error).not.toContain('rede interna')
    expect(jsonInterno.detail.error).not.toContain('resolver')
  })

  it('endpoint público de verdade continua funcionando e o corpo volta', async () => {
    chainResult = { data: tool({ endpoint: 'https://api.loja-publica.com/dados' }) }
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const res = await POST(postReq(), { params: { id: 'tool-1' } })
    const json = await res.json()

    expect(json.status).toBe('ok')
    expect(json.detail.body).toContain('ok')
  })
})
