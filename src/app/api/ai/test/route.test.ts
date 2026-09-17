// src/app/api/ai/test/route.test.ts
//
// W4-TC-02 (decisão 2026-09-08): `total_messages` e `total_tokens_used` de
// `ai_agents` não são alimentados por evento atribuído — o produto não pode
// apresentá-los como atividade atual. Este endpoint de debug (action
// `list_agents`) selecionava as duas colunas e as devolvia cruas no corpo da
// resposta. O mock de Supabase abaixo faz projeção de colunas de verdade
// (só devolve o que o `.select()` pediu), então este teste quebra se alguém
// reintroduzir os campos no `select`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mocks.from(...args) },
}))

const FIXTURE_AGENT = {
  id: 'agent-1',
  name: 'Agente 1',
  is_active: true,
  provider: 'openai',
  model: 'gpt-4o-mini',
  total_messages: 42,
  total_tokens_used: 9001,
  created_at: '2026-01-01T00:00:00Z',
}

// Projeta colunas como o Postgres faria: só devolve o que o `.select()` pediu.
function chain(fixtureRows: Record<string, unknown>[]) {
  let columns: string[] = []
  const value: any = {
    select: vi.fn((cols: string) => {
      columns = cols.split(',').map((c) => c.trim())
      return value
    }),
    eq: vi.fn(() => value),
    order: vi.fn(() =>
      Promise.resolve({
        data: fixtureRows.map((row) => {
          const projected: Record<string, unknown> = {}
          for (const col of columns) projected[col] = row[col]
          return projected
        }),
        error: null,
      })
    ),
  }
  return value
}

function request(body: unknown) {
  return new NextRequest('http://localhost/api/ai/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-debug-key': 's3cret' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/ai/test action=list_agents', () => {
  beforeEach(() => {
    vi.stubEnv('DEBUG_ENDPOINT_SECRET', 's3cret')
    mocks.from.mockReset()
    mocks.from.mockReturnValue(chain([FIXTURE_AGENT]))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('não devolve os totais congelados de ai_agents (W4-TC-02)', async () => {
    const { POST } = await import('./route')
    const response = await POST(request({ action: 'list_agents', organizationId: 'org-1' }))
    const body = await response.json()

    expect(body.success).toBe(true)
    expect(body.agents).toHaveLength(1)
    expect(body.agents[0]).not.toHaveProperty('total_messages')
    expect(body.agents[0]).not.toHaveProperty('total_tokens_used')
    // Cinto e suspensório: nenhum lugar do corpo carrega o rótulo.
    expect(JSON.stringify(body)).not.toContain('total_messages')
    expect(JSON.stringify(body)).not.toContain('total_tokens_used')
    // Os demais campos continuam presentes — a retirada é só dos dois totais.
    expect(body.agents[0]).toMatchObject({
      id: 'agent-1',
      name: 'Agente 1',
      is_active: true,
      provider: 'openai',
      model: 'gpt-4o-mini',
      created_at: '2026-01-01T00:00:00Z',
    })
  })
})
