import { describe, it, expect, beforeEach } from 'vitest'
import {
  createVariant,
  startExperiment,
  applyWinner,
  resolveRunningExperiments,
  attachExperiments,
  getExperimentBundle,
  removeVariant,
} from '../experiment-service'

const ORG = 'org-1'
const PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

// Banco de mentira com o subconjunto do PostgREST que o serviço usa.
type Row = Record<string, any>
const db: { tables: Record<string, Row[]>; rpc: Record<string, (args: any) => any[]> } = { tables: {}, rpc: {} }
let seq = 0
function fake() {
  const client: any = {
    rpc: async (name: string, args: any) => ({ data: (db.rpc[name] || (() => []))(args), error: null }),
    from(table: string) {
      const rows = () => db.tables[table] || []
      const filters: Array<(r: Row) => boolean> = []
      let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
      let payload: any = null
      let limitN: number | null = null
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return q },
        in: (k: string, v: any[]) => { filters.push((r) => v.includes(r[k])); return q },
        is: (k: string, v: any) => { filters.push((r) => r[k] == v); return q },
        order: () => q,
        limit: (n: number) => { limitN = n; return q },
        insert: (p: any) => { op = 'insert'; payload = p; return q },
        update: (p: any) => { op = 'update'; payload = p; return q },
        delete: () => { op = 'delete'; return q },
        maybeSingle: async () => { const r = await q.then((x: any) => x); return { data: r.data?.[0] || null, error: null } },
        single: async () => { const r = await q.then((x: any) => x); return { data: r.data?.[0] || null, error: r.data?.[0] ? null : { message: 'no rows' } } },
        then: (res: any) => {
          let data: Row[] = []
          if (op === 'select') data = rows().filter((r) => filters.every((f) => f(r)))
          if (op === 'insert') {
            const items = Array.isArray(payload) ? payload : [payload]
            // Os defaults que o banco aplica em popup_experiments.
            const defaults = table === 'popup_experiments'
              ? { status: 'draft', mode: 'split', kpi: 'submit', split: {}, min_sample: 200, max_days: 30, confidence: 0.95, auto_apply_winner: true, bandit_min_views: 10000, stats: {}, started_at: null, ended_at: null, winner_variant_id: null, end_reason: null }
              : {}
            data = items.map((it: any) => ({ id: `${table}-${++seq}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...defaults, ...it }))
            db.tables[table] = [...rows(), ...data]
          }
          if (op === 'update') { data = []; db.tables[table] = rows().map((r) => { if (filters.every((f) => f(r))) { const n = { ...r, ...payload }; data.push(n); return n } return r }) }
          if (op === 'delete') { db.tables[table] = rows().filter((r) => !filters.every((f) => f(r))) }
          if (limitN != null) data = data.slice(0, limitN)
          return Promise.resolve({ data, error: null }).then(res)
        },
      }
      return q
    },
  }
  return client
}

beforeEach(() => {
  seq = 0
  db.tables = {
    crm_forms: [{ id: PARENT, organization_id: ORG, name: 'Boas-vindas', status: 'published', store_id: 'store-1', form_type: 'popup', design_json: { steps: [{ id: 's1', blocks: [] }], styles: { width: 480 } }, behavior: { display: { delay: 3 } }, ab_parent_id: null, updated_at: 't0' }],
    popup_experiments: [],
  }
  db.rpc = {}
})

describe('variantes e ciclo do experimento', () => {
  it('cria a variante B como cópia do pai (rascunho, nunca publicada) e o experimento em rascunho com divisão igual', async () => {
    const { variant, experiment } = await createVariant(fake(), ORG, PARENT)
    expect(variant).toMatchObject({ ab_parent_id: PARENT, ab_variant: 'B', status: 'draft', design_json: { styles: { width: 480 } } })
    expect(experiment.status).toBe('draft')
    expect(experiment.split).toEqual({ [PARENT]: 50, [variant.id]: 50 })
    const row = db.tables.crm_forms.find((r) => r.id === variant.id)!
    expect(row.is_ab_test).toBe(true)
    expect(row.name).toBe('Boas-vindas · Variante B')
  })

  it('não passa de quatro variantes e não cria durante um experimento rodando', async () => {
    const c = fake()
    await createVariant(c, ORG, PARENT)
    await createVariant(c, ORG, PARENT)
    await createVariant(c, ORG, PARENT)
    await expect(createVariant(c, ORG, PARENT)).rejects.toThrow(/máximo/)
  })

  it('iniciar exige variante e pelo menos duas fatias com tráfego; encosta no updated_at do pai (ETag do bundle)', async () => {
    const c = fake()
    await expect(startExperiment(c, ORG, PARENT)).rejects.toThrow(/variante/)
    const { variant } = await createVariant(c, ORG, PARENT)
    const exp = await startExperiment(c, ORG, PARENT)
    expect(exp.status).toBe('running')
    expect(exp.started_at).toBeTruthy()
    expect(db.tables.crm_forms.find((r) => r.id === PARENT)!.updated_at).not.toBe('t0')
    await expect(createVariant(c, ORG, PARENT)).rejects.toThrow(/Encerre/)
    await expect(removeVariant(c, ORG, PARENT, variant.id)).rejects.toThrow(/Encerre/)
  })

  it('aplicar a vencedora copia o design da variante para o pai, guarda o antigo na variante e encerra', async () => {
    const c = fake()
    const { variant } = await createVariant(c, ORG, PARENT)
    db.tables.crm_forms = db.tables.crm_forms.map((r) => (r.id === variant.id ? { ...r, design_json: { steps: [{ id: 's1', blocks: [{ id: 'b', type: 'text' }] }], styles: { width: 600 } } } : r))
    await startExperiment(c, ORG, PARENT)
    const exp = await applyWinner(c, ORG, PARENT, variant.id, 'manual_apply')
    expect(exp).toMatchObject({ status: 'ended', winner_variant_id: variant.id, end_reason: 'manual_apply' })
    expect(db.tables.crm_forms.find((r) => r.id === PARENT)!.design_json).toEqual({ steps: [{ id: 's1', blocks: [{ id: 'b', type: 'text' }] }], styles: { width: 600 } })
    expect(db.tables.crm_forms.find((r) => r.id === variant.id)!.design_json).toEqual({ steps: [{ id: 's1', blocks: [] }], styles: { width: 480 } })
  })
})

describe('resolução pelo cron', () => {
  it('vencedora com significância e auto-aplicar → aplica e encerra', async () => {
    const c = fake()
    const { variant } = await createVariant(c, ORG, PARENT)
    await startExperiment(c, ORG, PARENT)
    db.rpc.popup_variant_stats = () => [
      { variant_id: PARENT, impressions: 5000, visitors: 5000, submissions: 100, optins: 90, orders: 0, revenue: 0 },
      { variant_id: variant.id, impressions: 5000, visitors: 5000, submissions: 160, optins: 150, orders: 0, revenue: 0 },
    ]
    const out = await resolveRunningExperiments(c, {})
    expect(out[0].outcome).toBe(`applied:${variant.id}`)
    const exp = db.tables.popup_experiments[0]
    expect(exp.status).toBe('ended')
    expect(exp.end_reason).toBe('auto_winner')
    expect(exp.stats.evaluation.reason).toBe('winner')
  })

  it('sem significância só registra; passado o prazo, encerra sem vencedora', async () => {
    const c = fake()
    await createVariant(c, ORG, PARENT)
    await startExperiment(c, ORG, PARENT)
    db.rpc.popup_variant_stats = () => [{ variant_id: PARENT, impressions: 50, visitors: 50, submissions: 2, optins: 2, orders: 0, revenue: 0 }]
    let out = await resolveRunningExperiments(c, {})
    expect(out[0].outcome).toBe('sample_too_small')
    expect(db.tables.popup_experiments[0].status).toBe('running')
    out = await resolveRunningExperiments(c, { now: new Date(Date.now() + 31 * 86400000) })
    expect(out[0].outcome).toBe('ended:max_days')
    expect(db.tables.popup_experiments[0]).toMatchObject({ status: 'ended', winner_variant_id: null })
  })

  it('bandit: abaixo das visualizações mínimas mantém o split; acima, calcula pesos por contexto', async () => {
    const c = fake()
    const { variant } = await createVariant(c, ORG, PARENT)
    db.tables.popup_experiments[0].mode = 'bandit'
    db.tables.popup_experiments[0].bandit_min_views = 100
    await startExperiment(c, ORG, PARENT)
    db.rpc.popup_variant_stats = () => [
      { variant_id: PARENT, impressions: 500, visitors: 500, submissions: 10, optins: 0, orders: 0, revenue: 0 },
      { variant_id: variant.id, impressions: 500, visitors: 500, submissions: 40, optins: 0, orders: 0, revenue: 0 },
    ]
    db.rpc.popup_variant_context_stats = () => [
      { variant_id: PARENT, page_kind: 'product', traffic_type: 'paid', device: 'mobile', impressions: 500, submissions: 10 },
      { variant_id: variant.id, page_kind: 'product', traffic_type: 'paid', device: 'mobile', impressions: 500, submissions: 40 },
    ]
    await resolveRunningExperiments(c, {})
    const exp = db.tables.popup_experiments[0]
    expect(exp.status).toBe('running')
    expect(exp.stats.bandit.eligible).toBe(true)
    const w = exp.stats.bandit.weights['product|paid|mobile']
    expect(w[variant.id]).toBeGreaterThan(w[PARENT])
    expect(w[variant.id] + w[PARENT]).toBe(100)
    // O runtime recebe os pesos por contexto.
    const map = await attachExperiments(c, [{ id: PARENT }])
    expect(map.get(PARENT)!.bandit!['product|paid|mobile'][variant.id]).toBe(w[variant.id])
  })
})

describe('o que o runtime e o painel recebem', () => {
  it('attachExperiments só devolve experimentos rodando, com as variantes e o split normalizado', async () => {
    const c = fake()
    expect((await attachExperiments(c, [{ id: PARENT }])).size).toBe(0)
    const { variant } = await createVariant(c, ORG, PARENT)
    expect((await attachExperiments(c, [{ id: PARENT }])).size).toBe(0)
    await startExperiment(c, ORG, PARENT)
    const m = await attachExperiments(c, [{ id: PARENT }])
    expect(m.get(PARENT)).toMatchObject({ mode: 'split', split: { [PARENT]: 50, [variant.id]: 50 }, variants: [{ id: variant.id }] })
  })

  it('o painel lista A (controle) e B com rótulos, e recusa abrir por uma variante', async () => {
    const c = fake()
    const { variant } = await createVariant(c, ORG, PARENT)
    const b = await getExperimentBundle(c, ORG, PARENT)
    expect(b!.variants.map((v) => v.label)).toEqual(['A', 'B'])
    expect(b!.variants[0].is_control).toBe(true)
    await expect(getExperimentBundle(c, ORG, variant.id)).rejects.toThrow(/variante/)
  })
})
