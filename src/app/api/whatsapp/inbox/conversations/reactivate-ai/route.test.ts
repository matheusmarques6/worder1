import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Mocks (hoisted) ----
const mockAuth = vi.fn()
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: (...args: any[]) => mockAuth(...args),
}))

vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Chain thenable: cada metodo devolve o proprio chain; await resolve no result.
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

import { GET, POST } from './route'

const WHITELIST = ['no_valid_api_key', 'budget_exceeded', 'ai_permanent_error']

function req(body?: any): any {
  return {
    json: async () => {
      if (body === undefined) throw new Error('no body')
      return body
    },
    headers: new Headers(),
  }
}

describe('reactivate-ai endpoint (Onda 13 / P0-2)', () => {
  beforeEach(() => {
    resetChain()
    mockAuth.mockReset()
    mockAuth.mockResolvedValue({ orgId: 'org-1' })
  })

  it('GET retorna count das elegiveis (whitelist + org)', async () => {
    chainResult = { count: 3, error: null }
    const res = await GET(req())
    const data = await res.json()

    expect(data.count).toBe(3)
    expect(calls['eq']).toContainEqual(['organization_id', 'org-1'])
    expect(calls['eq']).toContainEqual(['ai_enabled', false])
    expect(calls['in']?.[0]?.[1]).toEqual(WHITELIST)
  })

  it('POST sem body religa a whitelist completa, escopado por org', async () => {
    chainResult = { data: [{ id: 'c1' }, { id: 'c2' }], error: null }
    const res = await POST(req())
    const data = await res.json()

    expect(data.reactivated).toBe(2)
    expect(calls['eq']).toContainEqual(['organization_id', 'org-1'])
    expect(calls['in']?.[0]?.[1]).toEqual(WHITELIST)
    // update religa e limpa os campos de disable
    const updateArg = calls['update']?.[0]?.[0]
    expect(updateArg.ai_enabled).toBe(true)
    expect(updateArg.ai_disabled_reason).toBeNull()
  })

  it('POST com reason manual e rejeitado (400) — NUNCA religa manual', async () => {
    const res = await POST(req({ reasons: ['manual', 'Desativado manualmente'] }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.code).toBe('INVALID_REASONS')
    expect(calls['update']).toBeUndefined()
  })

  it('POST com mix filtra pra somente o que esta na whitelist', async () => {
    chainResult = { data: [{ id: 'c1' }], error: null }
    await POST(req({ reasons: ['no_valid_api_key', 'manual', 'transferred_to_human'] }))

    expect(calls['in']?.[0]?.[1]).toEqual(['no_valid_api_key'])
  })

  it('transferred_to_human sozinho e rejeitado', async () => {
    const res = await POST(req({ reasons: ['transferred_to_human'] }))
    expect(res.status).toBe(400)
  })
})
