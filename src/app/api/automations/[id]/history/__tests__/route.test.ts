// O histórico de execuções lia a tabela errada.
//
// O motor (fila, workers e crons) grava em `automation_runs`. A rota
// pedia `automation_executions` — que não tem `trigger_type` nem
// `duration_ms` — e o PostgREST recusa a consulta inteira quando não
// conhece uma coluna do select: a tela de histórico de uma automação só
// sabia dar erro, mesmo com execução gravada.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeSupabase, type FakeSupabase } from '@/test/supabase-fake'

let db: FakeSupabase

vi.mock('@/lib/api-utils', () => ({
  getAuthClient: async () => ({ supabase: db, user: { id: 'u-1', organization_id: 'org-1' } }),
  authError: () => new Response('unauthorized', { status: 401 }),
}))

const AUTO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function run(over: Record<string, any> = {}) {
  return {
    id: 'r1',
    status: 'completed',
    trigger_type: 'order_created',
    trigger_data: { order_id: 9 },
    contact_id: 'c1',
    deal_id: null,
    started_at: '2026-09-01T10:00:00Z',
    completed_at: '2026-09-01T10:00:04Z',
    duration_ms: 4000,
    error_message: null,
    error_node_id: null,
    node_results: { n1: { status: 'success' } },
    total_steps: 3,
    completed_steps: 3,
    failed_steps: 0,
    result: {},
    ...over,
  }
}

async function get(query = '') {
  const { GET } = await import('../route')
  const res = await GET(
    new NextRequest(`https://app.test/api/automations/${AUTO}/history${query}`),
    { params: Promise.resolve({ id: AUTO }) },
  )
  return { res, body: await res.json() }
}

beforeEach(() => {
  vi.resetModules()
  db = fakeSupabase({
    rows: {
      automations: [{ id: AUTO, name: 'Carrinho abandonado', organization_id: 'org-1' }],
      automation_runs: [run()],
      contacts: [{ id: 'c1', email: 'ana@loja.com', first_name: 'Ana', last_name: 'Lima' }],
    },
  })
})

describe('histórico de execuções da automação', () => {
  it('lê automation_runs, a tabela que o motor realmente preenche', async () => {
    const { res } = await get()
    expect(res.status).toBe(200)
    expect(db.on('automation_runs').length).toBeGreaterThan(0)
    expect(db.on('automation_executions')).toHaveLength(0)
  })

  it('não pede coluna que a tabela não tem', async () => {
    await get()
    const colunas = db.on('automation_runs')[0].columns || ''
    expect(colunas).not.toMatch(/final_context/)
    expect(colunas).toMatch(/duration_ms/)
    expect(colunas).toMatch(/trigger_type/)
  })

  it('devolve os contadores de passos que a tela mostra', async () => {
    const { body } = await get()
    const e = body.executions[0]
    expect(e).toMatchObject({
      automation_id: AUTO,
      automation_name: 'Carrinho abandonado',
      status: 'completed',
      trigger_type: 'order_created',
      total_steps: 3,
      completed_steps: 3,
      failed_steps: 0,
      duration_ms: 4000,
    })
    expect(e.contact).toEqual({ id: 'c1', email: 'ana@loja.com', name: 'Ana Lima' })
  })

  it('execução antiga sem contadores cai no node_results', async () => {
    db = fakeSupabase({
      rows: {
        automations: [{ id: AUTO, name: 'Boas-vindas' }],
        automation_runs: [run({
          total_steps: null, completed_steps: null, failed_steps: null,
          node_results: { a: { status: 'success' }, b: { status: 'error' } },
        })],
        contacts: [],
      },
    })
    const { body } = await get()
    expect(body.executions[0]).toMatchObject({ total_steps: 2, completed_steps: 1, failed_steps: 1 })
  })

  it('a automação de outra organização não vira histórico', async () => {
    db = fakeSupabase({ rows: { automations: [], automation_runs: [run()] } })
    const { res } = await get()
    expect(res.status).toBe(404)
    expect(db.on('automation_runs')).toHaveLength(0)
  })

  it('a limpeza apaga runs, não a tabela morta', async () => {
    const { DELETE } = await import('../route')
    const res = await DELETE(
      new NextRequest(`https://app.test/api/automations/${AUTO}/history?olderThanDays=15`),
      { params: Promise.resolve({ id: AUTO }) },
    )
    expect(res.status).toBe(200)
    const del = db.on('automation_runs').find((q) => q.operation === 'delete')
    expect(del).toBeTruthy()
    expect(del!.filters.some((f) => f.column === 'automation_id' && f.value === AUTO)).toBe(true)
    expect(db.on('automation_executions')).toHaveLength(0)
  })
})
