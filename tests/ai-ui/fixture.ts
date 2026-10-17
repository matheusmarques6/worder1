import { test as base, expect, type Page } from '@playwright/test'
import { isDeepStrictEqual } from 'node:util'
import { seed } from './seed'

type Row = Record<string, any>
export type Call = { method: string; path: string; query: URLSearchParams; body: Row | null; raw: string | null }

/** One independent store per browser context. This proves simulated persistence only;
 * database persistence and tenant isolation are exercised by the API/DB suites. */
export class AiStore {
  calls: Call[] = []
  unexpected: string[] = []
  agents: Row[] = seed('/api/ai/agents').agents.map((a: Row) => structuredClone(a))
  entries: Record<string, Row[]> = Object.fromEntries(this.agents.map(a => [a.id, a.entries.map((e: Row) => e.kind === 'flow_touch' ? { ...e, families: ['flow.cart_abandoned'] } : e)]))
  notes: Row[] = seed('/api/ai/knowledge').folders.flatMap((f: Row) => f.notes).map((n: Row) => ({ ...n, body_markdown: seed(`/api/ai/knowledge/${n.id}`).note.body_markdown.replace(/\\n/g, '\n') }))
  gaps: Row[] = seed('/api/ai/knowledge/gaps').gaps
  alerts: Row[] = []
  summary: Row = seed('/api/ai/activity/summary')
  blockMetrics: Row = seed('/api/ai/agents/a-duda/block-metrics')
  simulation: Row = seed('/api/ai/agents/a-duda/simulate')
  inbox = [
    { id: 'conv-other', contact_id: 'c2', contact_name: 'Paulo Henrique' },
    { id: 'conv-target', contact_id: 'c1', contact_name: 'Lívia Rocha' },
  ].map(c => ({ ...c, organization_id: 'org1', store_id: 'st1', phone_number: '5511999999999', provider: 'cloud', status: 'open', priority: 'normal', is_bot_active: false, unread_count: 0, total_messages: 1, can_send_template_only: false, created_at: new Date().toISOString(), contact_tags: [] }))
  versions: Record<string, Row[]> = Object.fromEntries(this.agents.map(a => [a.id, seed(`/api/ai/agents/${a.id}/versions`).versions]))
  failures = new Map<string, { status: number; error: string }>()
  gates = new Map<string, Promise<void>>()
  ask: Row = { answered: true, best: { source_id: 's3', source_name: 'Política de troca', content: 'Troca em 30 dias', chunk_kind: 'texto' } }
  readonly originalAgents = structuredClone(this.agents)
  private serial = 0

  matching(method: string, path: string) { return this.calls.filter(c => c.method === method && c.path === path) }
  private folders() { return [...new Set(this.notes.map(n => n.folder))].map(folder => ({ folder, notes: this.notes.filter(n => n.folder === folder) })) }
  private newNote(body: Row) {
    const note = { id: `new-note-${++this.serial}`, name: body.name || 'Importada', folder: body.folder || 'geral', kind: 'note', status: 'ready', read_only: false, source_type: body.source_type || 'note', tags: [], links: [], updated_at: new Date().toISOString(), readers: body.agent_ids || [], body_markdown: body.body_markdown || '', ...body }
    this.notes.push(note); return note
  }

  async install(page: Page) {
    await page.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url()), p = url.pathname, method = req.method()
      const raw = req.postData(); let body: Row | null = null
      if (raw && req.headers()['content-type']?.includes('application/json')) body = JSON.parse(raw)
      this.calls.push({ method, path: p, query: url.searchParams, body, raw })
      await this.gates.get(`${method} ${p}`)
      const reply = (data: unknown, status = 200) => route.fulfill({ status, json: data })
      const fail = this.failures.get(`${method} ${p}`)
      if (fail) return reply({ error: fail.error }, fail.status)
      let m: RegExpMatchArray | null
      if (p === '/api/auth' && method === 'POST' && body?.action === 'get-or-create-org') return reply(seed(p))
      if (p === '/api/integrations/shopify/status' && method === 'GET') return reply({ store: { connectionType: 'oauth', pixelInstalled: true } })
      if (p === '/api/auth/realtime-token' && method === 'GET') return reply({ error: 'Realtime is disabled in this isolated UI fixture' }, 401)
      if (p === '/api/whatsapp/numbers' && method === 'GET') return reply({ numbers: [] })
      if (p === '/api/whatsapp/inbox/conversations/reactivate-ai' && method === 'GET') return reply({ count: 0 })
      if (p === '/api/whatsapp/inbox/conversations' && method === 'GET') return reply({ conversations: this.inbox })
      if ((m = p.match(/^\/api\/whatsapp\/inbox\/conversations\/(conv-target|conv-other)(?:\/(messages|ai-steps|ai-status))?$/)) && method === 'GET') {
        const conversation = this.inbox.find(c => c.id === m![1])!
        if (m[2] === 'messages') return reply({ messages: [{ id: `message-${conversation.id}`, conversation_id: conversation.id, direction: 'inbound', message_type: 'text', content: conversation.id === 'conv-target' ? 'Mensagem exclusiva de Lívia' : 'Mensagem de outra conversa', status: 'read', created_at: new Date().toISOString() }], pagination: { hasMore: false } })
        if (m[2] === 'ai-steps') return reply({ steps: [] })
        if (m[2] === 'ai-status') return reply({ ai_enabled: false, conversation_id: conversation.id })
        return reply({ conversation })
      }
      if ((m = p.match(/^\/api\/whatsapp\/inbox\/contacts\/(c1|c2)$/)) && method === 'GET') return reply({ contact: { id: m[1], name: this.inbox.find(c => c.contact_id === m![1])!.contact_name, phone_number: '', tags: [], total_orders: 0, total_spent: 0, is_blocked: false, total_conversations: 1, total_messages_received: 1, total_messages_sent: 0, created_at: new Date().toISOString() }, notes: [], activities: [], deals: [], tasks: [], invoices: [], comments: [] })
      if (/^\/api\/ai\/agents\/[^/]+\/block-metrics$/.test(p) && method === 'GET') return reply(this.blockMetrics)
      if (p === '/api/ai/agents' && method === 'GET') return reply({ agents: this.agents.map(a => ({ ...a, entries: this.entries[a.id] || [] })) })
      if (p === '/api/ai/agents' && method === 'POST') {
        const source = this.agents.find(a => a.id === body?.copy_from) || this.originalAgents[0]
        const agent = { ...structuredClone(source), id: `new-agent-${++this.serial}`, name: body?.name, role: body?.role, status: 'draft', is_active: false, missions_count: 0, entries: [] }
        this.agents.push(agent); this.entries[agent.id] = []; this.versions[agent.id] = []
        this.notes.forEach(n => { if (body?.source_ids?.includes(n.id)) n.readers.push(agent.id) })
        return reply({ agent }, 201)
      }
      if ((m = p.match(/^\/api\/ai\/agents\/([^/]+)$/))) {
        const agent = this.agents.find(a => a.id === m![1]); if (!agent) return reply({ error: 'Agente não encontrado' }, 404)
        if (method === 'GET') return reply({ agent })
        if (method === 'PATCH') {
          const versionable = ['system_prompt', 'persona', 'settings', 'name', 'model', 'provider', 'monthly_cap_usd', 'presentation_mode', 'client_adaptation']
          const changed = Object.entries(body || {}).some(([key, value]) => versionable.includes(key) && !isDeepStrictEqual(agent[key], value))
          Object.assign(agent, body)
          if (changed) {
            const versions = this.versions[agent.id]; versions.forEach(v => { v.current = false })
            versions.unshift({ ...seed('/api/ai/agents/a-duda/versions').versions[0], id: `v${versions.length + 1}`, tag: `v${versions.length + 1}`, current: true, summary: ['Alteração salva'] })
          }
          return reply({ agent })
        }
      }
      if ((m = p.match(/^\/api\/ai\/agents\/([^/]+)\/entries$/))) {
        const id = m[1], list = this.entries[id] || []
        if (method === 'GET') return reply({ entries: list })
        if (method === 'DELETE') { this.entries[id] = list.filter(e => e.id !== url.searchParams.get('entry_id')); return reply({ ok: true }) }
        if (method === 'POST') {
          if (Object.entries(this.entries).some(([other, es]) => other !== id && es.some(e => e.ref_id === body?.ref_id))) return reply({ error: 'Número ocupado' }, 409)
          const entry = { id: `entry-${++this.serial}`, agent_id: id, active: true, label: 'WhatsApp teste', ...body }; list.push(entry); this.entries[id] = list; return reply({ entry }, 201)
        }
      }
      if ((m = p.match(/^\/api\/ai\/agents\/([^/]+)\/(activate|pause)$/)) && method === 'POST') {
        const agent = this.agents.find(a => a.id === m![1])!; agent.status = m[2] === 'activate' ? 'active' : 'paused'; agent.is_active = agent.status === 'active'; return reply({ agent })
      }
      if ((m = p.match(/^\/api\/ai\/agents\/([^/]+)\/versions$/)) && method === 'GET') return reply({ versions: this.versions[m[1]] || [] })
      if ((m = p.match(/^\/api\/ai\/agents\/([^/]+)\/versions\/([^/]+)\/restore$/))) {
        if (method === 'GET') return reply({ summary: ['Restaura a voz original'] })
        if (method === 'POST') {
          const a = this.agents.find(a => a.id === m![1])!; a.persona = structuredClone(this.originalAgents.find(original => original.id === a.id)?.persona || a.persona)
          const versions = this.versions[a.id], restored = versions.find(v => v.id === m![2])!
          versions.forEach(v => { v.current = false })
          versions.unshift({ ...restored, id: `v${versions.length + 1}`, tag: `v${versions.length + 1}`, current: true, restored_from: restored.id })
          return reply({ agent: a })
        }
      }
      if (p === '/api/ai/knowledge' && method === 'GET') return reply({ folders: this.folders(), total: this.notes.length })
      if (p === '/api/ai/knowledge' && method === 'POST') return reply({ note: this.newNote(body!) }, 201)
      if (p === '/api/ai/knowledge/search' && method === 'GET') { const q = url.searchParams.get('q')!.toLowerCase(); return reply({ results: this.notes.filter(n => (n.name + n.body_markdown).toLowerCase().includes(q)).map(n => ({ id: n.id, name: n.name, snippet: n.body_markdown })) }) }
      if (p === '/api/ai/knowledge/ask' && method === 'POST') return reply(this.ask)
      if (p === '/api/ai/knowledge/gaps') {
        if (method === 'GET') return reply({ gaps: this.gaps })
        if (method === 'POST') { const gap = { id: `gap-${++this.serial}`, question: body!.question, agent_ids: [body!.agent_id], count: 1, safe: true, suggested_source: null }; this.gaps.push(gap); return reply({ gap }, 201) }
      }
      if ((m = p.match(/^\/api\/ai\/knowledge\/gaps\/([^/]+)\/resolve$/)) && method === 'POST') {
        const gap = this.gaps.find(g => g.id === m![1])!; this.gaps = this.gaps.filter(g => g !== gap)
        if (body!.action === 'append_to') { const note = this.notes.find(n => n.id === body!.source_id)!; note.body_markdown += `\n## ${gap.question}\n${body!.answer}`; return reply({ source: note }) }
        if (body!.action === 'create_source') return reply({ source: this.newNote({ ...body, body_markdown: body!.answer, agent_ids: gap.agent_ids }) })
        if (body!.action === 'add_limit') { this.agents.filter(a => gap.agent_ids.includes(a.id)).forEach(a => a.settings.safety.blocked_topics.push(gap.question)); return reply({ ok: true }) }
      }
      if ((m = p.match(/^\/api\/ai\/knowledge\/([^/]+)\/agents$/)) && method === 'PUT') { const note = this.notes.find(n => n.id === m![1])!; note.readers = body!.agent_ids; return reply({ ok: true }) }
      if ((m = p.match(/^\/api\/ai\/knowledge\/([^/]+)$/))) {
        const note = this.notes.find(n => n.id === m![1]); if (!note) return reply({ error: 'Nota não encontrada' }, 404)
        if (method === 'GET') return reply({ note, backlinks: this.notes.filter(n => n.id !== note.id && n.body_markdown.includes(`[[${note.name}]]`)).map(n => ({ id: n.id, name: n.name, before: 'Veja ', after: ' para detalhes' })) })
        if (method === 'PATCH') { const old = note.name; Object.assign(note, body); if (body!.name) this.notes.forEach(n => { n.body_markdown = n.body_markdown.replaceAll(`[[${old}]]`, `[[${body!.name}]]`) }); return reply({ note, relinked: body!.name ? 1 : 0 }) }
        if (method === 'DELETE') { this.notes = this.notes.filter(n => n !== note); return reply({ ok: true }) }
      }
      if (p === '/api/ai/knowledge/import/csv' && method === 'POST') return reply({ note: this.newNote({ name: 'CSV importado', body_markdown: body!.csv, agent_ids: body!.agent_ids }) })
      if ((m = p.match(/^\/api\/ai\/agents\/([^/]+)\/sources(\/upload)?$/)) && method === 'POST') return reply({ source: this.newNote({ ...body, agent_ids: [m[1]], source_type: m[2] ? 'document' : 'url' }) }, 201)
      if (p === '/api/ai/alerts' && method === 'GET') return reply({ alerts: this.alerts.filter(a => a.status === 'open') })
      if ((m = p.match(/^\/api\/ai\/alerts\/([^/]+)$/)) && method === 'PATCH') { Object.assign(this.alerts.find(a => a.id === m![1])!, body); return reply({ ok: true }) }
      if (p === '/api/ai/activity/events' && method === 'GET') {
        const period = Number(url.searchParams.get('period') || 7), agent = url.searchParams.get('agent'), kind = url.searchParams.get('kind')
        return reply({ events: seed(p).events.filter((e: Row) => (!agent || e.agent_id === agent) && (!kind || e.kind === kind) && Date.now() - Date.parse(e.created_at) < period * 86400000) })
      }
      if (p === '/api/ai/activity/summary' && method === 'GET') {
        const d = structuredClone(this.summary), agent = url.searchParams.get('agent'), metric = url.searchParams.get('metric') || 'conversations'
        d.period.days = Number(url.searchParams.get('period')); d.period.hourly = d.period.days === 1
        const factor = d.period.days / 7
        const countFields = ['conversations', 'resolved_without_human', 'transfers', 'orders', 'revenue', 'cost_usd', 'incentives_offered', 'incentives_used']
        for (const row of [d.kpis, ...d.by_agent]) for (const key of countFields) if (row[key] != null) row[key] *= factor
        if (agent) { d.by_agent = d.by_agent.filter((a: Row) => a.agent_id === agent); if (d.by_agent[0]) d.kpis = d.by_agent[0] }
        d.series.metric = metric
        const metricFactors: Record<string, number> = { conversations: 1, revenue: 25, resolved: 0.8, transfers: 0.15, orders: 0.1, cost_usd: 0.009, first_response: 0.05 }
        d.series.points.forEach((point: Row) => { point.byAgent = Object.fromEntries(Object.entries(point.byAgent).filter(([id]) => !agent || id === agent).map(([id, value]) => [id, Number(value) * factor * metricFactors[metric]])) })
        return reply(d)
      }
      if (p === '/api/ai/activity/export.csv' && method === 'GET') return route.fulfill({ status: 200, contentType: 'text/csv', headers: { 'Content-Disposition': 'attachment; filename="activity.csv"' }, body: `period,agent\n${url.searchParams.get('period')},${url.searchParams.get('agent') || 'all'}\n` })
      // Explicit GET allowlist for immutable comparator seed data. Unknown routes
      // and every unimplemented mutation fail instead of silently returning 200.
      const staticGet = ['/api/auth', '/api/api-keys', '/api/whatsapp/business-accounts', '/api/ai/openrouter-models', '/api/ai/missions', '/api/ai/runtime-mode', '/api/notifications', '/api/stores', '/api/shopify/stores'].includes(p)
        || /^\/api\/ai\/agents\/[^/]+\/(readiness|spend|block-metrics|diagnostics|scenarios)$/.test(p)
        || /^\/api\/ai\/knowledge\/[^/]+\/usage$/.test(p)
      if (method === 'GET' && staticGet) { const data = seed(p); if (data) return reply(data) }
      if (/^\/api\/ai\/agents\/[^/]+\/simulate$/.test(p) && method === 'POST') return reply(this.simulation)
      if (/^\/api\/ai\/agents\/[^/]+\/scenarios$/.test(p) && method === 'POST') return reply({ scenario: { id: `scenario-${++this.serial}`, ...body } }, 201)
      this.unexpected.push(`${method} ${p}${url.search}`)
      return reply({ error: `Unexpected fixture request: ${method} ${p}` }, 501)
    })
  }
}

export const test = base.extend<{ store: AiStore }>({
  store: async ({ page }, use) => {
    const store = new AiStore(), errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await store.install(page)
    await use(store)
    expect(store.unexpected, 'All API requests must have explicit fixture handlers').toEqual([])
    expect(errors, 'Uncaught page JavaScript errors').toEqual([])
  },
})
export { expect }
export async function openBuilder(page: Page) { await page.goto('/ai/construtor/a-duda'); await expect(page.getByRole('button', { name: 'Renomear', exact: true })).toBeVisible(); await expect(page.getByRole('combobox', { name: 'Agente', exact: true })).toHaveValue('a-duda') }
export async function renameAgent(page: Page, name: string) { await page.getByRole('button', { name: 'Renomear', exact: true }).click(); const input = page.locator('header input'); await expect(input).toBeFocused(); await input.fill(name); await expect(input).toHaveValue(name); await input.press('Enter') }
export async function pickNode(page: Page, name: string) { await page.locator('.w-n').filter({ has: page.getByText(name, { exact: true }) }).first().press('Enter'); await expect(page.locator('.w-left.insp')).toBeVisible() }
