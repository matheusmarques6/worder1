import { beforeEach, describe, expect, it, vi } from 'vitest'

// Plano IA M2 passo 15: uma entrada ativa por (org, kind, ref). O número que
// já tem agente devolve 409 com o nome do dono; o mesmo agente repetindo o
// POST é idempotente; conta de outra org é 404.

const { getSupabaseAdmin } = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin }))
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: vi.fn(async () => ({ user: { organization_id: 'org-1' } })),
}))

import { POST } from './route'

/** Tabelas em memória com o subconjunto do cliente Supabase que a rota usa. */
function fakeDb(tables: Record<string, Array<Record<string, any>>>) {
  return {
    tables,
    from(table: string) {
      const rows = tables[table] ?? (tables[table] = [])
      let filters: Array<(row: any) => boolean> = []
      let mode: 'select' | 'insert' | 'update' = 'select'
      let payload: any = null
      let single: 'maybe' | 'single' | null = null
      const matched = () => rows.filter((r) => filters.every((f) => f(r)))
      const resolve = () => {
        if (mode === 'insert') {
          const dup = rows.find(
            (r) => r.kind === payload.kind && r.ref_id === payload.ref_id && r.active !== false,
          )
          if (dup) return { data: null, error: { code: '23505', message: 'dup' } }
          const created = { id: `entry-${rows.length + 1}`, active: true, created_at: 'now', ...payload }
          rows.push(created)
          return { data: created, error: null }
        }
        const found = matched()
        if (mode === 'update') found.forEach((r) => Object.assign(r, payload))
        if (single) return { data: found[0] ?? null, error: null }
        return { data: found, error: null }
      }
      const api: any = {
        select() { return api },
        eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return api },
        in(col: string, vals: unknown[]) { filters.push((r) => vals.includes(r[col])); return api },
        order() { return api },
        insert(data: Record<string, unknown>) { mode = 'insert'; payload = data; return api },
        update(data: Record<string, unknown>) { mode = 'update'; payload = data; return api },
        maybeSingle() { single = 'maybe'; return api },
        single() { single = 'single'; return api },
        then(onResolve: (v: unknown) => unknown) { return Promise.resolve(resolve()).then(onResolve) },
      }
      return api
    },
  }
}

const post = (agentId: string, body: unknown) =>
  POST(
    new Request('http://localhost', {
      method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
    }) as any,
    { params: Promise.resolve({ id: agentId }) },
  )

let db: ReturnType<typeof fakeDb>
beforeEach(() => {
  db = fakeDb({
    ai_agents: [
      { id: 'agent-sales', organization_id: 'org-1', name: 'Vendas' },
      { id: 'agent-support', organization_id: 'org-1', name: 'Suporte' },
    ],
    whatsapp_business_accounts: [{ id: 'wa-1', organization_id: 'org-1' }],
    ai_agent_entries: [],
  })
  getSupabaseAdmin.mockReturnValue(db)
})

describe('POST /api/ai/agents/[id]/entries', () => {
  it('liga o número ao agente', async () => {
    const response = await post('agent-sales', { kind: 'whatsapp_account', ref_id: 'wa-1' })
    expect(response.status).toBe(201)
    expect(db.tables.ai_agent_entries).toHaveLength(1)
    expect(db.tables.ai_agent_entries[0]).toMatchObject({
      organization_id: 'org-1', agent_id: 'agent-sales', kind: 'whatsapp_account', ref_id: 'wa-1',
    })
  })

  it('o número que já tem agente devolve 409 com o nome do dono', async () => {
    await post('agent-sales', { kind: 'whatsapp_account', ref_id: 'wa-1' })
    const response = await post('agent-support', { kind: 'whatsapp_account', ref_id: 'wa-1' })
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.owner_agent_name).toBe('Vendas')
    expect(body.owner_agent_id).toBe('agent-sales')
    expect(db.tables.ai_agent_entries).toHaveLength(1)
  })

  it('repetir para o mesmo agente é idempotente', async () => {
    await post('agent-sales', { kind: 'whatsapp_account', ref_id: 'wa-1' })
    const response = await post('agent-sales', { kind: 'whatsapp_account', ref_id: 'wa-1' })
    expect(response.status).toBe(200)
    expect((await response.json()).already).toBe(true)
  })

  it('conta de outra org é 404', async () => {
    const response = await post('agent-sales', { kind: 'whatsapp_account', ref_id: 'wa-alheia' })
    expect(response.status).toBe(404)
  })

  it('kind fora do vocabulário é 400', async () => {
    const response = await post('agent-sales', { kind: 'email', ref_id: 'x' })
    expect(response.status).toBe(400)
  })
})
