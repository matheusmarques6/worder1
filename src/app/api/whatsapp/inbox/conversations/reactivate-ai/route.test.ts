import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---- Mocks (hoisted) ----
const mockAuth = vi.fn()
vi.mock('@/lib/auth/require-org', () => ({
  requireOrgFromAuth: (...args: any[]) => mockAuth(...args),
}))

vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// A rota tem que ENXERGAR essa lista, nao ter a sua propria copia — getter
// sobre variavel mutavel pra poder trocar o "vocabulario canonico" por
// teste (mesmo truque do chain thenable abaixo) e provar que a rota reage
// a uma mudanca no modulo canonico, nao a um array hard-coded local.
let mockAutoReasons = ['no_valid_api_key', 'budget_exceeded', 'ai_permanent_error']
vi.mock('@/lib/ai/disabled-reasons', () => ({
  get AUTO_DISABLED_REASONS() {
    return mockAutoReasons
  },
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

  afterEach(() => {
    mockAutoReasons = ['no_valid_api_key', 'budget_exceeded', 'ai_permanent_error']
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

  describe('whitelist vem do modulo canonico (disabled-reasons.ts), nao de copia local', () => {
    it('GET conta pela lista canonica — motivo novo la aparece aqui sem editar a rota', async () => {
      // synthetic: nao existe hoje, so prova que a rota LE de disabled-reasons.ts
      mockAutoReasons = ['no_valid_api_key', 'budget_exceeded', 'ai_permanent_error', 'synthetic_new_reason']
      chainResult = { count: 5, error: null }

      const res = await GET(req())
      const data = await res.json()

      expect(data.reasons).toEqual(mockAutoReasons)
      expect(calls['in']?.[0]?.[1]).toEqual(mockAutoReasons)
    })

    it('POST religa pela lista canonica — a mesma que o GET contou', async () => {
      mockAutoReasons = ['no_valid_api_key', 'budget_exceeded', 'ai_permanent_error', 'synthetic_new_reason']
      chainResult = { data: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }], error: null }

      const res = await POST(req({ reasons: ['synthetic_new_reason'] }))
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.reactivated).toBe(3)
      expect(calls['in']?.[0]?.[1]).toEqual(['synthetic_new_reason'])
    })

    it('manual continua fora mesmo que a lista canonica mude', async () => {
      mockAutoReasons = ['no_valid_api_key', 'budget_exceeded', 'ai_permanent_error', 'synthetic_new_reason']
      const res = await POST(req({ reasons: ['manual'] }))
      expect(res.status).toBe(400)
      expect(calls['update']).toBeUndefined()
    })
  })
})
