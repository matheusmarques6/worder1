import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Plano IA M4 passo 24: o proxy do painel Testar manda a org DA SESSÃO
// (nunca a do body), recusa agente de outra org e explica a falta do runtime.

const { getSupabaseAdmin } = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin }))
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: vi.fn(async () => ({ user: { id: 'u1', organization_id: 'org-1' } })),
}))

import { POST } from './route'

function db(agentFound: boolean) {
  const api: any = {
    select: () => api, eq: () => api,
    maybeSingle: async () => ({ data: agentFound ? { id: 'agent-1' } : null, error: null }),
  }
  return { from: () => api }
}

const call = (body: unknown) =>
  POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }) as any, { params: Promise.resolve({ id: 'agent-1' }) })

beforeEach(() => {
  process.env.AGENTS_RUNTIME_URL = 'http://runtime.local'
  process.env.AGENTS_PREVIEW_TOKEN = 'tok'
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.AGENTS_RUNTIME_URL
  delete process.env.AGENTS_PREVIEW_TOKEN
})

describe('POST /api/ai/agents/[id]/simulate', () => {
  it('encaminha com a org da sessão e devolve o trace', async () => {
    getSupabaseAdmin.mockReturnValue(db(true))
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ reply: 'Oi!' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await call({ message: 'oi', organization_id: 'org-alheia' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ reply: 'Oi!' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://runtime.local/internal/simulate-turn')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(JSON.parse(String(init.body))).toMatchObject({ organization_id: 'org-1', agent_id: 'agent-1', message: 'oi' })
  })

  it('agente de outra org é 404 e não chama o runtime', async () => {
    getSupabaseAdmin.mockReturnValue(db(false))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await call({ message: 'oi' })).status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sem runtime configurado é 503 com o motivo', async () => {
    getSupabaseAdmin.mockReturnValue(db(true))
    delete process.env.AGENTS_RUNTIME_URL
    const res = await call({ message: 'oi' })
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/AGENTS_RUNTIME_URL/)
  })

  it('422 do runtime (sem chave, agente inexistente) passa adiante', async () => {
    getSupabaseAdmin.mockReturnValue(db(true))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'sem chave' }), { status: 422 })))
    const res = await call({ message: 'oi' })
    expect(res.status).toBe(422)
  })
})
