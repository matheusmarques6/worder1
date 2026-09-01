/**
 * `/api/ai/respond` é rota órfã (nenhum chamador em `src/`) — a remoção é
 * escopo do item 61 desta auditoria, não deste teste. Enquanto ela existir,
 * não pode servir config de outra loja.
 *
 * O fallback lia `ai_agent_configs` só por `agent_id`, sem organização: se o
 * `agent_id` da requisição não pertencesse à org da sessão (ou nem
 * existisse), a busca por `agents` escopada voltava vazia e o código caía
 * direto numa segunda busca, em `ai_agent_configs`, sem `.eq(organization_id)`
 * — e essa tabela nem tem essa coluna (mesma lacuna do item 04: a posse mora
 * no pai, aqui `agents`, não na própria linha).
 *
 * A correção só consulta `ai_agent_configs` depois que `agents` já confirmou
 * que o agente é da própria org. Sem essa confirmação, config alheia é
 * tratada como inexistente — cai no mesmo fallback de parâmetros default de
 * sempre, sem erro distinto (precedente dos itens 03 e 04).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()

vi.mock('@/lib/ai/provider-key-codec', () => ({
  decodeProviderKey: (k: string) => k,
}))

vi.mock('@/lib/ai/cost-tracker', () => ({
  trackAiUsage: vi.fn().mockResolvedValue(undefined),
}))

// Cada tabela/operação tem resultado configurável — mesmo molde do teste de
// /api/ai/knowledge, porque `organization_api_keys` aqui também é lida (select)
// e escrita (update) em pontos diferentes do handler.
const results: Record<string, any> = {}
const tablesQueried: string[] = []
let currentTable = ''
let currentOp = ''

function key() {
  return `${currentTable}:${currentOp}`
}

const chain: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'select') {
        currentOp = 'select'
        return () => chain
      }
      if (prop === 'update') {
        currentOp = 'update'
        return () => chain
      }
      if (prop === 'single') {
        return async () => results[key()] ?? { data: null, error: null }
      }
      if (prop === 'then') {
        const r = results[key()] ?? { data: null, error: null }
        return (resolve: any) => resolve(r)
      }
      return () => chain
    },
  },
)

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: () => ({
    auth: { getUser: (...args: any[]) => mockGetUser(...args) },
    from: (table: string) => {
      currentTable = table
      currentOp = ''
      tablesQueried.push(table)
      return chain
    },
    rpc: () => null,
  }),
}))

vi.mock('next/headers', () => ({ cookies: () => ({}) }))

import { POST } from './route'

const ORG_ID = 'org-da-sessao'
const SEGREDO = 'prompt secreto da outra loja'

function req(body: any): any {
  return { json: async () => body }
}

beforeEach(() => {
  for (const k of Object.keys(results)) delete results[k]
  tablesQueried.length = 0
  mockGetUser.mockReset()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

  results['profiles:select'] = { data: { organization_id: ORG_ID }, error: null }
  results['organization_api_keys:select'] = {
    data: { api_key: 'chave-de-teste', base_url: null },
    error: null,
  }

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: 'resposta-ia' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  }) as any
})

describe('POST /api/ai/respond — fallback de config não vaza outra loja', () => {
  it('agent_id de outra loja: não consulta ai_agent_configs e não usa a config alheia', async () => {
    // `agents` escopado por organization_id não acha o agente (é de outra loja).
    results['agents:select'] = { data: null, error: null }
    // A linha em ai_agent_configs existe (é de outra loja), mas não deveria
    // nem ser consultada sem a posse confirmada via `agents`.
    results['ai_agent_configs:select'] = {
      data: {
        agent_id: 'agent-alheio',
        model: 'modelo-secreto-outra-loja',
        provider: 'openai',
        system_prompt: SEGREDO,
        temperature: 0.5,
        max_tokens: 100,
      },
      error: null,
    }

    const res: any = await POST(req({ agent_id: 'agent-alheio', message: 'oi' }))
    const body = await res.json()

    expect(tablesQueried).not.toContain('ai_agent_configs')
    expect(body.model).not.toBe('modelo-secreto-outra-loja')
    expect(body.model).toBe('gpt-4o-mini')
  })

  it('agente da própria loja: ai_agent_configs continua funcionando', async () => {
    results['agents:select'] = { data: { ai_config: null }, error: null }
    results['ai_agent_configs:select'] = {
      data: {
        agent_id: 'agent-meu',
        model: 'modelo-proprio',
        provider: 'openai',
        system_prompt: 'prompt da minha loja',
        temperature: 0.5,
        max_tokens: 100,
      },
      error: null,
    }

    const res: any = await POST(req({ agent_id: 'agent-meu', message: 'oi' }))
    const body = await res.json()

    expect(tablesQueried).toContain('ai_agent_configs')
    expect(body.model).toBe('modelo-proprio')
  })

  it('sem config em lugar nenhum: cai no mesmo fallback de sempre', async () => {
    results['agents:select'] = { data: { ai_config: null }, error: null }
    results['ai_agent_configs:select'] = { data: null, error: null }

    const res: any = await POST(req({ agent_id: 'agent-sem-config', message: 'oi' }))
    const body = await res.json()

    expect(body.model).toBe('gpt-4o-mini')
    expect(body.provider).toBe('openai')
  })
})
