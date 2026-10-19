import { beforeEach, describe, expect, it, vi } from 'vitest'

// Plano IA M3 passo 21: resolver uma lacuna. Ignorar some por 30 dias;
// adicionar aos limites grava o assunto nos agentes da lacuna; criar fonte
// nasce lida pelos mesmos agentes e fecha a lacuna apontando para a nota.

const { getSupabaseAdmin, trigger } = vi.hoisted(() => ({ getSupabaseAdmin: vi.fn(), trigger: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin }))
vi.mock('@/lib/api-utils', () => ({
  getAuthClient: vi.fn(async () => ({ user: { id: 'user-1', organization_id: 'org-1' } })),
}))
vi.mock('@/lib/ai/knowledge/process-trigger', () => ({ triggerSourceProcessing: trigger }))

import { POST } from './route'

function fakeDb(tables: Record<string, Array<Record<string, any>>>) {
  return {
    tables,
    from(table: string) {
      const rows = tables[table] ?? (tables[table] = [])
      const filters: Array<(r: any) => boolean> = []
      let mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
      let payload: any = null
      let single = false
      const matched = () => rows.filter((r) => filters.every((f) => f(r)))
      const resolve = () => {
        if (mode === 'insert') {
          const list = (Array.isArray(payload) ? payload : [payload]).map((p: any, i: number) => ({ id: `${table}-${rows.length + i + 1}`, ...p }))
          rows.push(...list)
          return { data: single ? list[0] : list, error: null }
        }
        const found = matched()
        if (mode === 'update') found.forEach((r) => Object.assign(r, payload))
        if (mode === 'delete') found.forEach((r) => rows.splice(rows.indexOf(r), 1))
        return { data: single ? found[0] ?? null : found, error: null }
      }
      const api: any = {
        select() { return api },
        eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return api },
        in(c: string, v: unknown[]) { filters.push((r) => v.includes(r[c])); return api },
        insert(d: any) { mode = 'insert'; payload = d; return api },
        update(d: any) { mode = 'update'; payload = d; return api },
        delete() { mode = 'delete'; return api },
        maybeSingle() { single = true; return api },
        single() { single = true; return api },
        then(ok: (v: unknown) => unknown) { return Promise.resolve(resolve()).then(ok) },
      }
      return api
    },
  }
}

const resolveGap = (body: unknown) =>
  POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) }) as any, { params: Promise.resolve({ id: 'gap-1' }) })

let db: ReturnType<typeof fakeDb>
beforeEach(() => {
  trigger.mockClear()
  db = fakeDb({
    ai_knowledge_gaps: [{ id: 'gap-1', organization_id: 'org-1', question: 'Tem loja em Curitiba?', agent_ids: ['agent-1'], status: 'open', suggested_answer: null }],
    ai_agents: [{ id: 'agent-1', organization_id: 'org-1', settings: { safety: { blocked_topics: ['política'] } } }],
    ai_sources: [],
    ai_source_agents: [],
  })
  getSupabaseAdmin.mockReturnValue(db)
})

describe('POST /api/ai/knowledge/gaps/[id]/resolve', () => {
  it('ação desconhecida é 400', async () => {
    expect((await resolveGap({ action: 'shrug' })).status).toBe(400)
  })

  it('ignorar some por 30 dias', async () => {
    const res = await resolveGap({ action: 'ignore' })
    expect(res.status).toBe(200)
    const gap = db.tables.ai_knowledge_gaps[0]
    expect(gap.status).toBe('ignored_until')
    expect(new Date(gap.ignored_until).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000)
  })

  it('adicionar aos limites grava o assunto nos agentes da lacuna', async () => {
    const res = await resolveGap({ action: 'add_limit' })
    expect(res.status).toBe(200)
    expect(db.tables.ai_agents[0].settings.safety.blocked_topics).toEqual(['política', 'Tem loja em Curitiba?'])
    expect(db.tables.ai_knowledge_gaps[0].status).toBe('resolved')
  })

  it('criar fonte gera nota com resposta pronta, lida pelos agentes da lacuna', async () => {
    const res = await resolveGap({ action: 'create_source', answer: 'Não, vendemos só online.' })
    expect(res.status).toBe(201)
    const note = db.tables.ai_sources[0]
    expect(note).toMatchObject({ organization_id: 'org-1', kind: 'note', folder: 'lacunas', name: 'Tem loja em Curitiba?' })
    expect(note.body_markdown).toContain('[!resposta]')
    expect(db.tables.ai_source_agents).toEqual([{ source_id: note.id, agent_id: 'agent-1', organization_id: 'org-1', id: expect.any(String) }])
    expect(db.tables.ai_knowledge_gaps[0]).toMatchObject({ status: 'resolved', linked_source_id: note.id })
    expect(trigger).toHaveBeenCalledWith(note.id, 'org-1')
  })

  it('criar fonte sem resposta é 400', async () => {
    expect((await resolveGap({ action: 'create_source' })).status).toBe(400)
  })
})
