/**
 * Achado 6 (follow-up fase 3 da auditoria de segurança) — segunda rodada:
 * mesmo tratamento dado a sources/route.ts, aplicado agora ao irmão de
 * upload. `processFileAsync` (disparado pelo POST, fire-and-forget)
 * mandava `Bearer ${INTERNAL_API_SECRET || CRON_SECRET || ''}` — em
 * qualquer ambiente sem a env (CI, preview, `next dev` novo), a chamada
 * saía com credencial vazia, levava 401 da rota vizinha
 * (/api/ai/process/document, fechada pelo item 25), e todo upload virava
 * status:'error' com uma mensagem genérica que não distinguia "falta env"
 * de "arquivo ruim".
 *
 * Fix: nunca manda a credencial vazia — falha ANTES do fetch, com uma
 * mensagem que nomeia a env que falta (mesmo texto de sources/route.ts).
 *
 * `processFileAsync` não é exportável (route.ts do App Router só pode
 * exportar os nomes que o Next reconhece), então o teste passa pelo POST e
 * espera o processamento fire-and-forget drenar a fila de microtasks antes
 * de checar o resultado.
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
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: 'org-1/agent-1/x.pdf' }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://exemplo.com/x.pdf' } }),
      }),
    },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: { id: 'source-1', organization_id: 'org-1' },
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

function req(): any {
  const fd = new FormData()
  fd.append('file', new File([Buffer.from('conteudo')], 'doc.pdf', { type: 'application/pdf' }))
  return { formData: async () => fd }
}

// Deixa o processamento fire-and-forget rodar até o fim antes de checar o
// mock — algumas voltas da microtask queue bastam porque fetch é mockado.
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

describe('POST /api/ai/agents/[id]/sources/upload — a credencial vazia vira falha legível (achado 6)', () => {
  it('sem INTERNAL_API_SECRET nem CRON_SECRET: nunca chama fetch, e o erro nomeia a env que falta', async () => {
    await POST(req(), { params: { id: 'agent-1' } })
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

    await POST(req(), { params: { id: 'agent-1' } })
    await flush()

    expect(global.fetch).toHaveBeenCalled()
    const [, init] = (global.fetch as any).mock.calls[0]
    expect(init.headers.authorization).toBe('Bearer segredo-de-teste')
  })
})
