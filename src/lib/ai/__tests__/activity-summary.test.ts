import { describe, expect, it } from 'vitest'
import {
  buildSeries, byAgent, computeKpis, delta, funnel, heatmap, incentives, periodWindow, quality, toCsv, topics,
  type OutcomeRow,
} from '../activity-summary'

const row = (over: Partial<OutcomeRow>): OutcomeRow => ({
  conversation_id: 'c', agent_id: 'a1', started_at: '2026-10-14T15:00:00Z', first_response_ms: 4000,
  messages_sent: 2, resolved_without_human: true, transferred: false, handoff_reason: null, order_id: null,
  revenue: null, topic: null, incentives_offered: 0, incentives_used: 0, discount_total: 0, blocked_count: 0,
  gap: false, cost_usd: '0.01', tokens: 100, ...over,
})

const rows = [
  row({ conversation_id: 'c1', order_id: 'o1', revenue: '200', topic: 'pagamento', incentives_offered: 1, incentives_used: 1 }),
  row({ conversation_id: 'c2', transferred: true, resolved_without_human: false, handoff_reason: 'complaint', topic: 'reclamação', first_response_ms: 8000, blocked_count: 1 }),
  row({ conversation_id: 'c3', agent_id: 'a2', topic: 'pagamento', gap: true, first_response_ms: 2000, started_at: '2026-10-13T03:00:00Z' }),
]

describe('computeKpis', () => {
  it('os dez KPIs a partir dos desfechos', () => {
    expect(computeKpis(rows)).toEqual({
      conversations: 3, resolved_without_human: 2, transfers: 1, transfer_rate: 1 / 3, orders: 1, revenue: 200,
      conversion: 1 / 3, avg_ticket: 200, first_response_ms: 4000, cost_usd: 0.03, cost_per_conversation: 0.01,
    })
  })
  it('sem conversas tudo zera sem dividir por zero', () => {
    expect(computeKpis([])).toMatchObject({ conversations: 0, conversion: 0, avg_ticket: 0, first_response_ms: null })
  })
})

describe('buildSeries', () => {
  it('por dia no fuso da loja, empilhado por agente', () => {
    const p = periodWindow(3, new Date('2026-10-15T12:00:00Z'))
    const series = buildSeries(rows, 'conversations', p, -180)
    expect(series.map((s) => s.bucket)).toEqual(['2026-10-13', '2026-10-14', '2026-10-15'])
    // 13/10 03:00Z é 00:00 do dia 13 em São Paulo; 14/10 15:00Z é 12:00 do dia 14.
    expect(series[0]).toMatchObject({ total: 1, byAgent: { a2: 1 } })
    expect(series[1]).toMatchObject({ total: 2, byAgent: { a1: 2 } })
    expect(series[2].total).toBe(0)
  })
  it('por hora no período de um dia', () => {
    const p = periodWindow(1, new Date('2026-10-15T12:00:00Z'))
    const series = buildSeries(rows, 'revenue', p, 0)
    expect(series).toHaveLength(24)
    expect(series[15].total).toBe(200)
  })
})

describe('agregados', () => {
  it('tabela por agente, funil, assuntos, incentivos, qualidade', () => {
    const table = byAgent(rows)
    expect(table[0]).toMatchObject({ agent_id: 'a1', conversations: 2, revenue: 200, incentives_offered: 1, roi: 10000 })
    expect(funnel(rows).map((f) => f.value)).toEqual([3, 3, 1, 1])
    expect(topics(rows)[0]).toMatchObject({ topic: 'pagamento', count: 2, resolved_rate: 1 })
    expect(incentives(rows)).toEqual({ offered: 1, used: 1, rate: 1, discount_total: 0 })
    expect(quality(rows)).toEqual({ messages: 6, blocked: 1, conversations_with_block: 1, gaps: 1 })
  })
  it('mapa de calor 7×24 no fuso', () => {
    const grid = heatmap([row({ started_at: '2026-10-14T15:00:00Z' })], -180)
    expect(grid[3][12]).toBe(1) // quarta, 12h em São Paulo
  })
  it('delta contra o período anterior', () => {
    expect(delta(12, 10)).toBeCloseTo(0.2)
    expect(delta(0, 0)).toBe(0)
    expect(delta(5, 0)).toBeNull()
  })
  it('CSV escapa vírgulas e aspas', () => {
    const csv = toCsv([row({ conversation_id: 'c1', topic: 'troca, "devolução"' })], new Map([['a1', 'Duda']]))
    expect(csv.split('\n')[1]).toContain('"troca, ""devolução"""')
    expect(csv.split('\n')[1]).toContain(',Duda,')
  })
})
