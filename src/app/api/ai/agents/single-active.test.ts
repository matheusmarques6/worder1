import { beforeEach, describe, expect, it, vi } from 'vitest'

// W3-GD-07 aplicação: ai_agents_single_active_per_org (unique index parcial,
// 20260917050000_single_active_agent.sql) recusa a SEGUNDA linha ativa na
// mesma organização com um 23505 cru. As três rotas abaixo ativam sem
// arquivar os demais primeiro — o merchant que liga um segundo agente na AI
// Hub via PUT, PATCH ou "criar já ativo" ganha um 500, não uma troca limpa.
// Mesma semântica que o canônico (api/ai/agents/canonical/route.ts) já tem.

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

describe('um agente ativo por organização — aplicação nas rotas de escrita', () => {
  it('PUT ativando o segundo agente arquiva o primeiro (não 500)', async () => {
    const table = fakeAgentsTable([
      { id: 'agent-a', organization_id: 'org-1', is_active: true, provider: 'openai' },
      { id: 'agent-b', organization_id: 'org-1', is_active: false, provider: 'openai' },
    ])
    getSupabaseAdmin.mockReturnValue(table)

    const response = await PUT(jsonRequest('PUT', { is_active: true }), { params: { id: 'agent-b' } })

    expect(response.status).toBe(200)
    expect(activeCount(table)).toBe(1)
    expect(table.rows.find((r) => r.id === 'agent-b')!.is_active).toBe(true)
    expect(table.rows.find((r) => r.id === 'agent-a')!.is_active).toBe(false)
  })

  it('PATCH ativando o segundo agente arquiva o primeiro (não 500)', async () => {
    const table = fakeAgentsTable([
      { id: 'agent-a', organization_id: 'org-1', is_active: true, provider: 'openai' },
      { id: 'agent-b', organization_id: 'org-1', is_active: false, provider: 'openai' },
    ])
    getSupabaseAdmin.mockReturnValue(table)

    const response = await PATCH(jsonRequest('PATCH', { is_active: true }), { params: { id: 'agent-b' } })

    expect(response.status).toBe(200)
    expect(activeCount(table)).toBe(1)
    expect(table.rows.find((r) => r.id === 'agent-b')!.is_active).toBe(true)
    expect(table.rows.find((r) => r.id === 'agent-a')!.is_active).toBe(false)
  })

  it('POST criando já-ativo arquiva o agente ativo existente (não 500)', async () => {
    const table = fakeAgentsTable([
      { id: 'agent-a', organization_id: 'org-1', is_active: true, provider: 'openai' },
    ])
    getSupabaseAdmin.mockReturnValue(table)

    const response = await POST(jsonRequest('POST', { name: 'Novo agente', is_active: true }))

    expect(response.status).toBe(201)
    expect(activeCount(table)).toBe(1)
    expect(table.rows.find((r) => r.id === 'agent-a')!.is_active).toBe(false)
  })
})
