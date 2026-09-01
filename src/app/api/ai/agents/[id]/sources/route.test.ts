/**
 * Achado 6 (follow-up fase 3 da auditoria de segurança): item 25 fechou
 * /api/ai/process/document pra negar sempre sem INTERNAL_API_SECRET/
 * CRON_SECRET configurado (ambiente não é credencial). processSourceAsync
 * (disparado pelo POST, fire-and-forget) continuava mandando
 * `Bearer ${... || ''}` — em qualquer ambiente sem a env (CI, preview,
 * `next dev` novo), a chamada saía com credencial vazia, levava 401 da rota
 * vizinha, e a fonte virava status:'error' com uma mensagem genérica
 * ("Clique em Reprocessar") que não distinguia "falta env" de "URL ruim" —
 * reprocessar não resolve o primeiro caso.
 *
 * Fix: nunca manda a credencial vazia — falha ANTES do fetch, com uma
 * mensagem que nomeia a env que falta.
 *
 * `processSourceAsync` não é exportado (route.ts do App Router só pode
 * exportar os nomes que o Next reconhece — ver comentário nos quatro
 * verify.ts de Shopify), então o teste passa pelo POST e espera o
 * processamento em background (fire-and-forget) drenar a fila de
 * microtasks antes de checar o resultado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockGetAuthClient = vi.fn()
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: (...args: any[]) => mockGetAuthClient(...args),
}))

vi.mock('@/lib/ai/agent-access', () => ({
  assertAgentInOrg: vi.fn().mockResolvedValue({ ok: true }),
}))

const mockUpdate = vi.fn()
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: { id: 'source-1', organization_id: 'org-1', status: 'pending' },
            error: null,
          }),
        }),
      }),
      update: (values: any) => {
        mockUpdate(values)
        return {
          eq: () => ({
            then: (resolve?: any) => {
              if (typeof resolve === 'function') resolve({ error: null })
            },
          }),
        }
      },
    }),
  }),
}))

import { POST } from './route'

const ORIGINAL_ENV = { ...process.env }

function req(body: any): any {
  return { json: async () => body }
}

// Deixa o processamento fire-and-forget (disparado sem await dentro do
// POST) rodar até o fim antes de checar o mock — algumas voltas da
// microtask queue bastam porque fetch é mockado (resolve síncrono).
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

beforeEach(() => {
  mockUpdate.mockReset()
  mockGetAuthClient.mockResolvedValue({ user: { id: 'u1', organization_id: 'org-1' } })
  process.env = { ...ORIGINAL_ENV }
  delete process.env.INTERNAL_API_SECRET
  delete process.env.CRON_SECRET
  global.fetch = vi.fn()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('POST /api/ai/agents/[id]/sources — a credencial vazia vira falha legível (achado 6)', () => {
  it('sem INTERNAL_API_SECRET nem CRON_SECRET: nunca chama fetch, e o erro nomeia a env que falta', async () => {
    await POST(req({ source_type: 'url', name: 'Fonte', url: 'https://exemplo.com' }), {
      params: { id: 'agent-1' },
    })
    await flush()

    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        error_message: expect.stringContaining('INTERNAL_API_SECRET'),
      })
    )
  })

  it('com o segredo configurado, chama process/document com o Bearer preenchido', async () => {
    process.env.INTERNAL_API_SECRET = 'segredo-de-teste'
    ;(global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) })

    await POST(req({ source_type: 'url', name: 'Fonte', url: 'https://exemplo.com' }), {
      params: { id: 'agent-1' },
    })
    await flush()

    expect(global.fetch).toHaveBeenCalled()
    const [, init] = (global.fetch as any).mock.calls[0]
    expect(init.headers.authorization).toBe('Bearer segredo-de-teste')
  })
})
