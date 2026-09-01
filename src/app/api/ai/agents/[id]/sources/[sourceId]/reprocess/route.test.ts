/**
 * Achado 6 (follow-up fase 3 da auditoria de segurança) — segunda rodada:
 * mesmo tratamento dado a sources/route.ts, aplicado agora ao irmão de
 * reprocess. O `fetch` de reprocessamento (disparado pelo POST,
 * fire-and-forget) mandava `Bearer ${INTERNAL_API_SECRET || CRON_SECRET
 * || ''}` — em qualquer ambiente sem a env (CI, preview, `next dev` novo),
 * a chamada saía com credencial vazia, levava 401 da rota vizinha
 * (/api/ai/process/document, fechada pelo item 25), e a fonte ficava presa
 * em 'pending' pra sempre (o handler só logava com console.error, nunca
 * marcava status:'error' — pior que os outros dois: nem sinal na UI).
 *
 * Fix: extraído pra `triggerReprocess`, que nunca manda a credencial
 * vazia — falha ANTES do fetch, com uma mensagem que nomeia a env que
 * falta (mesmo texto de sources/route.ts e sources/upload/route.ts), e
 * marca a fonte como status:'error' com essa mensagem — mesmo
 * comportamento dos outros dois, agora que os três concordam.
 *
 * `triggerReprocess` não é exportável (route.ts do App Router só pode
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

const mockUpdateCalls: any[] = []
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'ai_agent_chunks') {
        return { delete: () => ({ eq: async () => ({ error: null }) }) }
      }
      // ai_agent_sources
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: { id: 'source-1', agent_id: 'agent-1', organization_id: 'org-1' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
        update: (values: any) => {
          mockUpdateCalls.push(values)
          return { eq: () => Promise.resolve({ error: null }) }
        },
      }
    },
  }),
}))

import { POST } from './route'

const ORIGINAL_ENV = { ...process.env }

function req(): any {
  return {}
}

// Deixa o processamento fire-and-forget rodar até o fim antes de checar o
// mock — algumas voltas da microtask queue bastam porque fetch é mockado.
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

beforeEach(() => {
  mockUpdateCalls.length = 0
  mockGetAuthClient.mockResolvedValue({ user: { id: 'u1', organization_id: 'org-1' } })
  process.env = { ...ORIGINAL_ENV }
  delete process.env.INTERNAL_API_SECRET
  delete process.env.CRON_SECRET
  global.fetch = vi.fn()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('POST .../sources/[sourceId]/reprocess — a credencial vazia vira falha legível (achado 6)', () => {
  it('sem INTERNAL_API_SECRET nem CRON_SECRET: nunca chama fetch, e o erro nomeia a env que falta', async () => {
    await POST(req(), { params: { id: 'agent-1', sourceId: 'source-1' } })
    await flush()

    expect(global.fetch).not.toHaveBeenCalled()
    const errorUpdate = mockUpdateCalls.find((v) => v.status === 'error')
    expect(errorUpdate).toBeTruthy()
    expect(errorUpdate.error_message).toContain('INTERNAL_API_SECRET')
  })

  it('com o segredo configurado, chama process/document com o Bearer preenchido', async () => {
    process.env.INTERNAL_API_SECRET = 'segredo-de-teste'
    ;(global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({}) })

    await POST(req(), { params: { id: 'agent-1', sourceId: 'source-1' } })
    await flush()

    expect(global.fetch).toHaveBeenCalled()
    const [, init] = (global.fetch as any).mock.calls[0]
    expect(init.headers.authorization).toBe('Bearer segredo-de-teste')
  })
})
