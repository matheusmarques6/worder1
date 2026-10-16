import { describe, expect, it } from 'vitest'
import { flowTouchEntries, flowTouchNodes } from '../flow-touches'

const flow = (id: string, families: string[], extra: Record<string, unknown> = {}) => ({
  id, name: `Fluxo ${id}`, is_active: true,
  nodes: families.map((f, i) => ({ id: `${id}-n${i}`, type: 'action_ai_mission', data: { config: { eventFamily: f } } })),
  ...extra,
})

describe('flowTouchNodes', () => {
  it('lê só nós de toque de IA com família configurada', () => {
    const nodes = flowTouchNodes([
      { ...flow('a', ['cart.abandoned']), nodes: [...flow('a', ['cart.abandoned']).nodes, { id: 'x', type: 'action_send_email', data: {} }, { id: 'y', type: 'action_ai_mission', data: { config: {} } }] },
    ])
    expect(nodes).toEqual([{ automation_id: 'a', automation_name: 'Fluxo a', node_id: 'a-n0', event_family: 'cart.abandoned', active: true }])
  })

  it('fluxo arquivado ou desligado vira inativo', () => {
    expect(flowTouchNodes([flow('a', ['cart.abandoned'], { is_active: false })])[0].active).toBe(false)
    expect(flowTouchNodes([flow('a', ['cart.abandoned'], { status: 'archived' })])[0].active).toBe(false)
  })
})

describe('flowTouchEntries', () => {
  it('um fluxo conta uma vez por agente dono da missão ativa', () => {
    const owner = new Map([['cart.abandoned', 'agent-1'], ['order.fulfilled', 'agent-2'], ['payment.pix.abandoned', null]])
    const touches = flowTouchNodes([
      flow('a', ['cart.abandoned', 'cart.abandoned', 'order.fulfilled']),
      flow('b', ['payment.pix.abandoned']),
      flow('c', ['cart.abandoned'], { is_active: false }),
    ])
    const entries = flowTouchEntries(touches, owner)
    expect(entries.map((e) => [e.agent_id, e.ref_id, e.label])).toEqual([
      ['agent-1', 'a', 'Fluxo a'],
      ['agent-2', 'a', 'Fluxo a'],
    ])
    expect(entries.every((e) => e.kind === 'flow_touch' && e.active)).toBe(true)
    // O Construtor acha a missão pela família e mostra quantos toques são.
    expect(entries.map((e) => [e.families, e.touches])).toEqual([[['cart.abandoned'], 2], [['order.fulfilled'], 1]])
  })
})
