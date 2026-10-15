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

  it('com outcome.entry_id, cada número de WhatsApp conta as suas conversas', () => {
    const m = blockMetrics({
      outcomes: [
        row({ conversation_id: 'c1', entry_id: 'a', order_id: 'o', first_response_ms: 1000 }),
        row({ conversation_id: 'c2', entry_id: 'a', first_response_ms: 3000 }),
        row({ conversation_id: 'c3', entry_id: 'b' }),
        row({ conversation_id: 'c4', entry_id: null }),
      ],
      toolCalls: [], sources: [],
      entries: [
        { id: 'a', kind: 'whatsapp_account', label: 'A' },
        { id: 'b', kind: 'whatsapp_account', label: 'B' },
        { id: 'z', kind: 'whatsapp_account', label: 'Z' },
        { id: 'f', kind: 'flow_touch', label: 'Fluxo' },
      ],
    })
    expect(m.entries[0]).toMatchObject({ conversations: 2, first_response_ms: 2000, purchase_rate: 0.5 })
    expect(m.entries[1]).toMatchObject({ conversations: 1, purchase_rate: 0 })
    expect(m.entries[2]).toMatchObject({ conversations: 0, first_response_ms: null, purchase_rate: null })
    expect(m.entries[3]).toMatchObject({ conversations: null })
  })
})

describe('diagnose (formato do protótipo)', () => {
  const base = {
    agentName: 'Duda', usdBrl: 5, hasProviderKey: true, provider: 'openai',
    activeMissions: [{ id: 'm1', event_type: 'whatsapp.received', display_name: 'Atendimento direto', concession: { kind: 'none' } }],
    enabledTools: ['transfer_to_human'], handoffKeywords: [], sources: [], blocked7d: 0, monthlyCapUsd: null, monthSpendUsd: 0,
  }
  it('agente saudável: só itens ok', () => {
    const d = diagnose(base)
    expect(d.every((x) => x.lv === 'ok')).toBe(true)
    expect(d.map((x) => x.id)).toEqual(['key_ok', 'mission_ok', 'handoff_ok', 'review_ok'])
  })
  it('cada problema aponta o bloco certo e traz título e explicação', () => {
    const d = diagnose({
      ...base, hasProviderKey: false,
      activeMissions: [{ id: 'm2', event_type: 'cart.abandoned', display_name: 'Carrinho · toque 2', concession: { kind: 'percent', max: 10 } }],
      enabledTools: [], sources: [{ id: 's', name: 'FAQ', status: 'error' }, { id: 't', name: 'Catálogo Shopify', status: 'processing' }],
      blocked7d: 6, monthlyCapUsd: 10, monthSpendUsd: 8.5,
    })
    const by = Object.fromEntries(d.map((x) => [x.id, x]))
    expect(by.no_key).toMatchObject({ lv: 'error', node: 'agent' })
    expect(by['coupon_off:m2']).toMatchObject({ lv: 'warn', node: 'tools' })
    expect(by.no_handoff).toMatchObject({ lv: 'error', node: 'transfer' })
    expect(by['source_error:s']).toMatchObject({ node: 'knowledge:s' })
    expect(by['source_sync:t'].t).toBe('Catálogo Shopify ainda sincronizando')
    expect(by.many_blocks).toMatchObject({ lv: 'warn', node: 'review' })
    expect(by.cap_80.d).toContain('R$ 42,50 de R$ 50,00')
    for (const x of d) { expect(x.t.length).toBeGreaterThan(0); expect(x.d.length).toBeGreaterThan(0) }
  })
  it('trava dupla completa vira item ok no bloco da ferramenta', () => {
    const d = diagnose({ ...base, enabledTools: ['transfer_to_human', 'create_coupon'], activeMissions: [{ id: 'm3', event_type: 'x', display_name: 'Toque 2', concession: { kind: 'percent' } }] })
    expect(d.find((x) => x.id === 'coupon_ok:m3')).toMatchObject({ lv: 'ok', node: 'tool:create_coupon' })
  })
})
