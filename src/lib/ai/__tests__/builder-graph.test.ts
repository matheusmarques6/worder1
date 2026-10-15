import { describe, expect, it } from 'vitest'
import { agentToHub } from '../agent-hub'
import { buildBuilderGraph, historyInit, historyPush, historyRedo, historyUndo, litEdges, litPath } from '../builder-graph'

const hub = agentToHub({
  id: 'a1', name: 'Duda', model: 'gpt-4o-mini',
  settings: { tools: { enabled: ['transfer_to_human', 'product_lookup'] }, safety: { blocked_topics: ['política'], handoff_keywords: ['atendente'] } },
  persona: { guidelines: [] },
})

describe('buildBuilderGraph', () => {
  it('é determinístico e segue a cadeia do protótipo', () => {
    const input = { hub, entries: [{ id: 'w1', kind: 'whatsapp_account', label: 'Loja' }], sources: [{ id: 's1', name: 'Trocas' }] }
    const a = buildBuilderGraph(input)
    expect(buildBuilderGraph(input)).toEqual(a)
    expect(a.nodes.map((n) => n.id)).toEqual([
      'entry:w1', 'agent', 'knowledge:s1', 'tool:transfer_to_human', 'tool:product_lookup',
      'adapt', 'limits', 'review', 'needs_person', 'transfer', 'send',
    ])
    expect(a.edges.find((e) => e.id === 'e:needs_person:send')?.label).toBe('não')
    expect(a.nodes.find((n) => n.id === 'limits')?.sub).toBe('1 regra(s)')
  })
  it('sem entradas, fontes ou ferramentas mostra os encaixes vazios', () => {
    const empty = agentToHub({ id: 'a', name: 'X', settings: { tools: { enabled: [] } } })
    const g = buildBuilderGraph({ hub: empty, entries: [], sources: [] })
    expect(g.nodes.filter((n) => n.kind === 'slot').map((n) => n.id)).toEqual(['slot-entry', 'slot-knowledge', 'slot-tool'])
  })
})

describe('litPath', () => {
  const { nodes, edges } = buildBuilderGraph({ hub, entries: [{ id: 'w1', kind: 'whatsapp_account', label: 'Loja' }], sources: [{ id: 's1', name: 'Trocas' }] })
  it('resposta enviada acende a fonte usada e termina em Enviar', () => {
    const lit = litPath({ reply: 'oi', knowledge: [{ source_id: 's1' }], tools: [] }, nodes)
    expect([...lit]).toEqual(['entry:w1', 'agent', 'knowledge:s1', 'adapt', 'limits', 'review', 'needs_person', 'send'])
    expect(litEdges(edges, lit).has('e:knowledge:s1:agent')).toBe(true)
  })
  it('transferência termina em Transferir; bloqueio para na Revisão', () => {
    expect(litPath({ reply: 'ok', tools: [{ name: 'transfer_to_human' }] }, nodes).has('transfer')).toBe(true)
    const blocked = litPath({ blocked: true, reply: null }, nodes)
    expect(blocked.has('review') && !blocked.has('send') && !blocked.has('needs_person')).toBe(true)
  })
})

describe('history', () => {
  it('desfaz, refaz e não registra estado igual', () => {
    let h = historyInit({ n: 1 })
    h = historyPush(h, { n: 1 })
    expect(h.past).toHaveLength(0)
    h = historyPush(historyPush(h, { n: 2 }), { n: 3 })
    h = historyUndo(h)
    expect(h.present).toEqual({ n: 2 })
    h = historyRedo(h)
    expect(h.present).toEqual({ n: 3 })
    expect(historyUndo(historyInit({ n: 0 })).present).toEqual({ n: 0 })
  })
})
