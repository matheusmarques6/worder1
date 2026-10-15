import { describe, expect, it } from 'vitest'
import { blockMetrics, diagnose } from '../block-metrics'
import type { OutcomeRow } from '../activity-summary'

const row = (over: Partial<OutcomeRow>): OutcomeRow => ({
  conversation_id: 'c', agent_id: 'a1', started_at: '2026-10-14T15:00:00Z', first_response_ms: 3000, messages_sent: 3,
  resolved_without_human: true, transferred: false, handoff_reason: null, order_id: null, revenue: null, topic: null,
  incentives_offered: 0, incentives_used: 0, discount_total: 0, blocked_count: 0, gap: false, cost_usd: 0.02, tokens: 10, ...over,
})

describe('blockMetrics', () => {
  it('números por bloco a partir dos desfechos e das chamadas de ferramenta', () => {
    const m = blockMetrics({
      outcomes: [row({ conversation_id: 'c1', order_id: 'o', revenue: 100 }), row({ conversation_id: 'c2', transferred: true, resolved_without_human: false, handoff_reason: 'complaint', blocked_count: 1 })],
      toolCalls: [
        { tool_name: 'search_knowledge', success: true, output: { chunks: [{ source_id: 's1' }, { source_id: 's1' }] }, conversation_id: 'c1' },
        { tool_name: 'create_coupon', success: true, output: { decision: 'issued' }, conversation_id: 'c1' },
        { tool_name: 'create_coupon', success: true, output: { decision: 'denied' }, conversation_id: 'c2' },
        { tool_name: 'order_status', success: false, output: null, conversation_id: 'c2' },
      ],
      sources: [{ id: 's1', name: 'Trocas' }, { id: 's2', name: 'Frete' }],
      entries: [{ id: 'e1', kind: 'whatsapp_account', label: 'Loja' }],
    })
    expect(m.knowledge).toEqual([{ id: 's1', name: 'Trocas', uses: 1 }, { id: 's2', name: 'Frete', uses: 0 }])
    expect(m.tools).toEqual([
      { name: 'create_coupon', calls: 2, success_rate: 1, issued: 1, denied: 1 },
      { name: 'order_status', calls: 1, success_rate: 0 },
    ])
    expect(m.entries[0]).toMatchObject({ conversations: 2, purchase_rate: 0.5 })
    expect(m.review).toEqual({ approved_rate: 6 / 7, rejected: 1 })
    expect(m.needs_person).toEqual({ transferred: 1, rate: 0.5 })
    expect(m.transfer.reasons).toEqual({ complaint: 1 })
    expect(m.send).toEqual({ replies: 6, resolved_rate: 0.5 })
  })

  it('com várias entradas não atribui números do agente a uma só', () => {
    const m = blockMetrics({ outcomes: [row({})], toolCalls: [], sources: [], entries: [{ id: 'a', kind: 'whatsapp_account', label: 'A' }, { id: 'b', kind: 'flow_touch', label: 'B' }] })
    expect(m.entries.every((e) => e.conversations === null)).toBe(true)
  })
})

describe('diagnose', () => {
  const base = {
    hasProviderKey: true, provider: 'openai', activeMissions: [{ id: 'm1', event_type: 'whatsapp.received', concession: { kind: 'none' } }],
    enabledTools: ['transfer_to_human'], handoffKeywords: [], sources: [], blocked7d: 0, monthlyCapUsd: null, monthSpendUsd: 0,
  }
  it('agente saudável não tem aviso', () => {
    expect(diagnose(base)).toEqual([])
  })
  it('cada regra aponta o nó certo', () => {
    const d = diagnose({
      ...base, hasProviderKey: false, activeMissions: [{ id: 'm2', event_type: 'cart.abandoned', concession: { kind: 'percent', max: 10 } }],
      enabledTools: [], sources: [{ id: 's', name: 'FAQ', status: 'error' }, { id: 't', name: 'Site', status: 'processing' }],
      blocked7d: 6, monthlyCapUsd: 10, monthSpendUsd: 8.5,
    })
    expect(d.map((x) => [x.id.split(':')[0], x.node, x.severity])).toEqual([
      ['no_key', 'agent', 'error'],
      ['coupon_off', 'tools', 'warning'],
      ['no_handoff', 'transfer', 'error'],
      ['source_error', 'knowledge', 'warning'],
      ['source_sync', 'knowledge', 'warning'],
      ['many_blocks', 'review', 'warning'],
      ['cap_80', 'agent', 'warning'],
    ])
  })
  it('sem missão ativa é erro na entrada', () => {
    expect(diagnose({ ...base, activeMissions: [] })[0]).toMatchObject({ id: 'no_mission', node: 'entries', severity: 'error' })
  })
})
