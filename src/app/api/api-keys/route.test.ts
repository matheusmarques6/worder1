// Achado 3 (follow-up fase 3 da auditoria de segurança): item 27 moveu duas
// chamadas Gemini de `?key=` na URL pra `x-goog-api-key` (ai-providers.ts),
// mas não nomeou esta — validateApiKey aqui faz a MESMA coisa contra a MESMA
// API pra validar a chave que o lojista acabou de colar. `?key=` na query
// string vai pro log de proxy e de access log; o header não. Verificado
// contra a API real: header com chave inválida -> 400 API_KEY_INVALID (a
// Google lê o header); nenhuma chave -> 403.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: (...args: any[]) => mockAuth(...args),
  authError: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}))

vi.mock('@/lib/ai/provider-key-codec', () => ({
  encodeProviderKey: (k: string) => `enc:${k}`,
}))

// upsert().select().single() thenable — mesmo molde do teste de custom-tools/test.
const chain: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (resolve: any) =>
          resolve({ data: { id: 'key-1', provider: 'google', api_key_hint: 'chav...este', is_valid: true }, error: null })
      }
      return () => chain
    },
  },
)

import { POST } from './route'

const AUTH = { supabase: { from: () => chain }, user: { id: 'u1', role: 'admin', organization_id: 'org-1' } }

function req(body: any): any {
  return { json: async () => body }
}

beforeEach(() => {
  mockAuth.mockReset()
  mockAuth.mockResolvedValue(AUTH)
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any
})

describe('POST /api/api-keys — a chave do Google não vai na URL (achado 3)', () => {
  it('valida a chave Gemini com x-goog-api-key, nunca com ?key= na query string', async () => {
    await POST(req({ provider: 'google', api_key: 'chave-de-teste' }))

    const [url, init] = (global.fetch as any).mock.calls[0]
    expect(url).not.toMatch(/[?&]key=/)
    expect((init?.headers ?? {})['x-goog-api-key']).toBe('chave-de-teste')
  })
})
