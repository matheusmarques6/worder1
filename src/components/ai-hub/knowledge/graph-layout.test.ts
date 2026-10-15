import { describe, expect, it } from 'vitest'
import { forceLayout } from './graph-layout'

describe('forceLayout', () => {
  it('é determinístico, fica dentro da área e aproxima nós ligados', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }))
    const edges = [{ from: 'a', to: 'b' }]
    const one = forceLayout(nodes, edges, { width: 400, height: 300 })
    const two = forceLayout(nodes, edges, { width: 400, height: 300 })
    expect([...one.entries()]).toEqual([...two.entries()])
    for (const p of one.values()) {
      expect(p.x).toBeGreaterThanOrEqual(30); expect(p.x).toBeLessThanOrEqual(370)
      expect(p.y).toBeGreaterThanOrEqual(30); expect(p.y).toBeLessThanOrEqual(270)
    }
    const d = (x: string, y: string) => Math.hypot(one.get(x)!.x - one.get(y)!.x, one.get(x)!.y - one.get(y)!.y)
    expect(d('a', 'b')).toBeLessThan(d('a', 'd'))
  })

  it('ignora arestas para nós inexistentes', () => {
    expect(() => forceLayout([{ id: 'a' }], [{ from: 'a', to: 'z' }])).not.toThrow()
  })
})
