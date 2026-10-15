// A aba Atividade (plano IA M5 passo 29) — a agregação, pura e testada.
// Entrada: linhas de ai_conversation_outcomes (passos 27–28) e
// ai_activity_events; saída: os KPIs do protótipo (atual e anterior), a
// série por dia ou hora, a tabela por agente, funil, motivos de
// transferência, assuntos, incentivos, qualidade, mapa de calor e custo.

export interface OutcomeRow {
  conversation_id: string
  agent_id: string | null
  /** Entrada (WhatsApp) por onde a conversa chegou; null em toque de fluxo
   *  e em desfechos anteriores à alteração 2026-10-15-15 do runtime. */
  entry_id?: string | null
  started_at: string
  first_response_ms: number | null
  messages_sent: number
  resolved_without_human: boolean | null
  transferred: boolean
  handoff_reason: string | null
  order_id: string | null
  revenue: number | string | null
  topic: string | null
  incentives_offered: number
  incentives_used: number
  discount_total: number | string | null
  blocked_count: number
  gap: boolean
  cost_usd: number | string | null
  tokens: number
}

export interface Kpis {
  conversations: number
  resolved_without_human: number
  transfers: number
  transfer_rate: number
  orders: number
  revenue: number
  conversion: number
  avg_ticket: number
  first_response_ms: number | null
  cost_usd: number
  cost_per_conversation: number
}

export type Metric = 'conversations' | 'revenue' | 'orders' | 'transfers' | 'cost_usd'

const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0)

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

export function computeKpis(rows: OutcomeRow[]): Kpis {
  const conversations = rows.length
  const orders = rows.filter((r) => r.order_id).length
  const revenue = rows.reduce((s, r) => s + num(r.revenue), 0)
  const transfers = rows.filter((r) => r.transferred).length
  const cost = rows.reduce((s, r) => s + num(r.cost_usd), 0)
  const ratio = (a: number, b: number) => (b > 0 ? a / b : 0)
  return {
    conversations,
    resolved_without_human: rows.filter((r) => r.resolved_without_human === true).length,
    transfers,
    transfer_rate: ratio(transfers, conversations),
    orders,
    revenue: round2(revenue),
    conversion: ratio(orders, conversations),
    avg_ticket: round2(ratio(revenue, orders)),
    first_response_ms: median(rows.map((r) => r.first_response_ms).filter((v): v is number => typeof v === 'number')),
    cost_usd: round4(cost),
    cost_per_conversation: round4(ratio(cost, conversations)),
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100
const round4 = (v: number) => Math.round(v * 10000) / 10000

/** Chave do balde: dia (YYYY-MM-DD) ou hora (HH) no fuso da loja. */
export function bucketKey(iso: string, hourly: boolean, tzOffsetMinutes: number): string {
  const d = new Date(new Date(iso).getTime() + tzOffsetMinutes * 60_000)
  return hourly ? String(d.getUTCHours()).padStart(2, '0') : d.toISOString().slice(0, 10)
}

export function buildSeries(
  rows: OutcomeRow[], metric: Metric, period: { end: Date; days: number }, tzOffsetMinutes: number,
): Array<{ bucket: string; total: number; byAgent: Record<string, number> }> {
  const hourly = period.days <= 1
  const buckets: string[] = []
  if (hourly) for (let h = 0; h < 24; h++) buckets.push(String(h).padStart(2, '0'))
  // Os últimos N dias terminando HOJE (no fuso da loja), o mais antigo primeiro.
  else for (let i = period.days - 1; i >= 0; i--) buckets.push(bucketKey(new Date(period.end.getTime() - i * 86_400_000).toISOString(), false, tzOffsetMinutes))
  const map = new Map(buckets.map((b) => [b, { bucket: b, total: 0, byAgent: {} as Record<string, number> }]))
  for (const r of rows) {
    const point = map.get(bucketKey(r.started_at, hourly, tzOffsetMinutes))
    if (!point) continue
    const value = metric === 'conversations' ? 1
      : metric === 'revenue' ? num(r.revenue)
      : metric === 'orders' ? (r.order_id ? 1 : 0)
      : metric === 'transfers' ? (r.transferred ? 1 : 0)
      : num(r.cost_usd)
    const agent = r.agent_id ?? 'sem-agente'
    point.total += value
    point.byAgent[agent] = (point.byAgent[agent] ?? 0) + value
  }
  return [...map.values()]
}

export function byAgent(rows: OutcomeRow[]) {
  const groups = new Map<string, OutcomeRow[]>()
  for (const r of rows) {
    const key = r.agent_id ?? 'sem-agente'
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  return [...groups.entries()].map(([agent_id, list]) => {
    const k = computeKpis(list)
    const offered = list.reduce((s, r) => s + r.incentives_offered, 0)
    const used = list.reduce((s, r) => s + r.incentives_used, 0)
    return {
      agent_id,
      ...k,
      incentives_offered: offered,
      incentives_used: used,
      tokens: list.reduce((s, r) => s + (r.tokens || 0), 0),
      roi: k.cost_usd > 0 ? round2(k.revenue / k.cost_usd) : null,
    }
  }).sort((a, b) => b.conversations - a.conversations)
}

export function funnel(rows: OutcomeRow[]) {
  return [
    { step: 'Iniciadas', value: rows.length },
    { step: 'Responderam', value: rows.filter((r) => r.messages_sent > 0).length },
    { step: 'Receberam incentivo', value: rows.filter((r) => r.incentives_offered > 0).length },
    { step: 'Pedido pago', value: rows.filter((r) => r.order_id).length },
  ]
}

export function countBy<T>(rows: T[], key: (r: T) => string | null): Array<{ key: string; count: number }> {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = key(r)
    if (!k) continue
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count)
}

export function topics(rows: OutcomeRow[]) {
  return countBy(rows, (r) => r.topic).map(({ key, count }) => {
    const of = rows.filter((r) => r.topic === key)
    return { topic: key, count, resolved_rate: of.length ? of.filter((r) => r.resolved_without_human).length / of.length : 0 }
  })
}

export function incentives(rows: OutcomeRow[]) {
  const offered = rows.reduce((s, r) => s + r.incentives_offered, 0)
  const used = rows.reduce((s, r) => s + r.incentives_used, 0)
  return { offered, used, rate: offered ? used / offered : 0, discount_total: round2(rows.reduce((s, r) => s + num(r.discount_total), 0)) }
}

export function quality(rows: OutcomeRow[]) {
  return {
    messages: rows.reduce((s, r) => s + r.messages_sent, 0),
    blocked: rows.reduce((s, r) => s + r.blocked_count, 0),
    conversations_with_block: rows.filter((r) => r.blocked_count > 0).length,
    gaps: rows.filter((r) => r.gap).length,
  }
}

/** Mapa de calor dia da semana (0 = domingo) × hora, no fuso da loja. */
export function heatmap(rows: OutcomeRow[], tzOffsetMinutes: number): number[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const r of rows) {
    const d = new Date(new Date(r.started_at).getTime() + tzOffsetMinutes * 60_000)
    grid[d.getUTCDay()][d.getUTCHours()] += 1
  }
  return grid
}

export function periodWindow(days: number, now: Date) {
  const span = Math.max(1, days)
  const end = now
  const start = new Date(now.getTime() - span * 86_400_000)
  const previousStart = new Date(start.getTime() - span * 86_400_000)
  return { start, end, previousStart, days: span }
}

export function delta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return (current - previous) / previous
}

/** Linhas do CSV de exportação (mesmas colunas da tabela de conversas). */
export function toCsv(rows: OutcomeRow[], agentNames: Map<string, string>): string {
  const header = ['conversa', 'agente', 'inicio', 'primeira_resposta_ms', 'mensagens', 'resolvida_sem_humano', 'transferida', 'motivo', 'pedido', 'receita', 'assunto', 'incentivos', 'bloqueios', 'lacuna', 'custo_usd']
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = rows.map((r) => [
    r.conversation_id, agentNames.get(r.agent_id ?? '') ?? '', r.started_at, r.first_response_ms, r.messages_sent,
    r.resolved_without_human === null ? '' : r.resolved_without_human ? 'sim' : 'não', r.transferred ? 'sim' : 'não',
    r.handoff_reason, r.order_id, num(r.revenue), r.topic, r.incentives_offered, r.blocked_count, r.gap ? 'sim' : 'não', num(r.cost_usd),
  ].map(esc).join(','))
  return [header.join(','), ...lines].join('\n') + '\n'
}
