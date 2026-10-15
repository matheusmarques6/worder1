// Layout de força simples para o grafo do conhecimento (plano IA M3 passo
// 22) — porte do Graph do protótipo: repulsão entre todos, mola nas arestas,
// gravidade ao centro. Determinístico (posições iniciais em círculo), puro
// e testável; o componente só desenha.

export interface LayoutNode { id: string }
export interface LayoutEdge { from: string; to: string }
export interface Point { x: number; y: number }

export function forceLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: { width?: number; height?: number; iterations?: number } = {},
): Map<string, Point> {
  const width = options.width ?? 800
  const height = options.height ?? 560
  const iterations = options.iterations ?? 220
  const cx = width / 2
  const cy = height / 2
  const pos = new Map<string, Point>()
  const n = Math.max(nodes.length, 1)
  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / n
    const r = Math.min(width, height) * 0.35
    pos.set(node.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
  })
  const k = Math.sqrt((width * height) / n) * 0.6
  const valid = edges.filter((e) => pos.has(e.from) && pos.has(e.to))
  for (let step = 0; step < iterations; step++) {
    const temp = (1 - step / iterations) * 18 + 1
    const disp = new Map<string, Point>(nodes.map((nd) => [nd.id, { x: 0, y: 0 }]))
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i].id)!
        const b = pos.get(nodes[j].id)!
        let dx = a.x - b.x
        let dy = a.y - b.y
        let dist = Math.hypot(dx, dy)
        if (dist < 0.01) { dx = 0.01 * (i - j); dy = 0.01; dist = Math.hypot(dx, dy) }
        const force = (k * k) / dist
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        disp.get(nodes[i].id)!.x += fx; disp.get(nodes[i].id)!.y += fy
        disp.get(nodes[j].id)!.x -= fx; disp.get(nodes[j].id)!.y -= fy
      }
    }
    for (const e of valid) {
      const a = pos.get(e.from)!
      const b = pos.get(e.to)!
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dist = Math.max(Math.hypot(dx, dy), 0.01)
      const force = (dist * dist) / k
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      disp.get(e.from)!.x -= fx; disp.get(e.from)!.y -= fy
      disp.get(e.to)!.x += fx; disp.get(e.to)!.y += fy
    }
    for (const node of nodes) {
      const p = pos.get(node.id)!
      const d = disp.get(node.id)!
      d.x += (cx - p.x) * 0.02 * k / 10
      d.y += (cy - p.y) * 0.02 * k / 10
      const len = Math.max(Math.hypot(d.x, d.y), 0.01)
      p.x = Math.min(width - 30, Math.max(30, p.x + (d.x / len) * Math.min(len, temp)))
      p.y = Math.min(height - 30, Math.max(30, p.y + (d.y / len) * Math.min(len, temp)))
    }
  }
  return pos
}
