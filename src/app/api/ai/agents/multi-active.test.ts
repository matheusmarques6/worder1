import { beforeEach, describe, expect, it, vi } from 'vitest'

// Plano IA M2 (20261016000008): o índice ai_agents_single_active_per_org
// caiu — vários agentes ativos por organização. As três rotas de escrita
// deixam de arquivar os demais ao ativar um agente; quem atende cada número
// é decidido por ai_agent_entries (runtime, alteração 2026-10-15-09).

const { getSupabaseAdmin } = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn() }))

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin }))
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: vi.fn(async () => ({ user: { organization_id: 'org-1' } })),
}))
vi.mock('@/lib/ai/provider-key-check', () => ({
  hasActiveProviderKey: vi.fn(async () => true),
  providerKeyMissingResponse: vi.fn(() => ({ error: 'sem chave' })),
}))
vi.mock('@/lib/ai/versions', () => ({ snapshotIfChanged: vi.fn() }))

import { PATCH, PUT } from './[id]/route'
import { POST } from './route'

/** Tabela `ai_agents` falsa, em memória, só com o que as três rotas usam:
 * select/update/insert encadeados com eq/neq, resolvido via thenable —
 * suficiente para provar a invariante sem simular o cliente Supabase todo. */
function fakeAgentsTable(rows: Array<Record<string, any>>) {
  return {
    rows,
    from(table: string) {
      if (table !== 'ai_agents') throw new Error(`tabela inesperada: ${table}`)
      let filters: Array<(row: any) => boolean> = []
      let mode: 'select' | 'update' | 'insert' = 'select'
      let payload: any = null
      let wantSingle = false

      const matched = () => rows.filter((r) => filters.every((f) => f(r)))
      const resolve = () => {
        if (mode === 'insert') {
          const created = { id: `agent-${rows.length + 1}`, ...payload }
          rows.push(created)
          return { data: created, error: null }
        }
        const rowsMatched = matched()
        if (mode === 'update') rowsMatched.forEach((r) => Object.assign(r, payload))
        if (wantSingle) {
          if (rowsMatched.length !== 1) return { data: null, error: { code: 'PGRST116' } }
          return { data: rowsMatched[0], error: null }
        }
        return { data: rowsMatched, error: null }
      }

      const api: any = {
        select() { return api },
        eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return api },
        neq(col: string, val: unknown) { filters.push((r) => r[col] !== val); return api },
        update(data: Record<string, unknown>) { mode = 'update'; payload = data; return api },
        insert(data: Record<string, unknown>) { mode = 'insert'; payload = data; return api },
        single() { wantSingle = true; return api },
        then(onResolve: (v: unknown) => unknown) { return Promise.resolve(resolve()).then(onResolve) },
      }
      return api
    },
  }
}

const jsonRequest = (method: string, body: unknown) =>
  new Request('http://localhost', {
    method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }) as any

function activeCount(table: ReturnType<typeof fakeAgentsTable>) {
  return table.rows.filter((r) => r.is_active).length
}

beforeEach(() => {
  getSupabaseAdmin.mockReset()
})

describe('vários agentes ativos por organização — rotas de escrita', () => {
  it('PUT ativando o segundo agente mantém o primeiro ativo', async () => {
    const table = fakeAgentsTable([
      { id: 'agent-a', organization_id: 'org-1', is_active: true, provider: 'openai' },
      { id: 'agent-b', organization_id: 'org-1', is_active: false, provider: 'openai' },
    ])
    getSupabaseAdmin.mockReturnValue(table)

    const response = await PUT(jsonRequest('PUT', { is_active: true }), { params: Promise.resolve({ id: 'agent-b' }) })

    expect(response.status).toBe(200)
    expect(activeCount(table)).toBe(2)
  })

  it('PATCH ativando o segundo agente mantém o primeiro ativo', async () => {
    const table = fakeAgentsTable([
      { id: 'agent-a', organization_id: 'org-1', is_active: true, provider: 'openai' },
      { id: 'agent-b', organization_id: 'org-1', is_active: false, provider: 'openai' },
    ])
    getSupabaseAdmin.mockReturnValue(table)

    const response = await PATCH(jsonRequest('PATCH', { is_active: true }), { params: Promise.resolve({ id: 'agent-b' }) })

    expect(response.status).toBe(200)
    expect(activeCount(table)).toBe(2)
  })

  it('POST criando já-ativo não mexe no agente ativo existente e grava status', async () => {
    const table = fakeAgentsTable([
      { id: 'agent-a', organization_id: 'org-1', is_active: true, provider: 'openai' },
    ])
    getSupabaseAdmin.mockReturnValue(table)

    const response = await POST(jsonRequest('POST', { name: 'Novo agente', is_active: true }))

    expect(response.status).toBe(201)
    expect(activeCount(table)).toBe(2)
    expect(table.rows[1].status).toBe('active')
  })

  it('POST sem is_active nasce rascunho', async () => {
    const table = fakeAgentsTable([])
    getSupabaseAdmin.mockReturnValue(table)

    const response = await POST(jsonRequest('POST', { name: 'Rascunho', role: 'Vendas' }))

    expect(response.status).toBe(201)
    expect(table.rows[0].status).toBe('draft')
    expect(table.rows[0].role).toBe('Vendas')
    expect(table.rows[0].is_active).toBe(false)
  })
})
