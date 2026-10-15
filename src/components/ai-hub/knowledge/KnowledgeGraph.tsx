'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { GraphEdge, GraphNode } from '@/lib/ai/knowledge/notes'
import { forceLayout } from './graph-layout'

const COLOR = { note: '#3B6EF6', agent: '#F97316', gap: '#E5484D' } as const
const EDGE = { link: '#94A3B8', reads: '#FDBA74', gap: '#FCA5A5' } as const

export default function KnowledgeGraph({ onOpenNote }: { onOpenNote: (id: string) => void }) {
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/ai/knowledge/graph')
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setGraph(d) })
      .catch((e) => setError(e.message))
  }, [])

  const layout = useMemo(() => (graph ? forceLayout(graph.nodes, graph.edges, { width: 900, height: 600 }) : null), [graph])

  if (error) return <p style={{ padding: 24, color: 'var(--red)', fontSize: 13 }}>{error}</p>
  if (!graph || !layout) return <div style={{ padding: 24 }}><Loader2 size={16} className="animate-spin" /></div>
  if (graph.nodes.length === 0) return <p style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>Sem notas ainda.</p>

  const near = new Set<string>()
  if (hover) for (const e of graph.edges) { if (e.from === hover) near.add(e.to); if (e.to === hover) near.add(e.from) }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
        <span><Dot c={COLOR.note} /> nota</span><span><Dot c={COLOR.agent} /> agente</span><span><Dot c={COLOR.gap} /> lacuna</span>
      </div>
      <svg viewBox="0 0 900 600" style={{ width: '100%', height: 'auto', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
        {graph.edges.map((e, i) => {
          const a = layout.get(e.from); const b = layout.get(e.to)
          if (!a || !b) return null
          const dim = hover && e.from !== hover && e.to !== hover
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={EDGE[e.type]} strokeWidth={e.type === 'link' ? 1.4 : 1} strokeDasharray={e.type === 'gap' ? '4 3' : undefined} opacity={dim ? 0.15 : 0.9} />
        })}
        {graph.nodes.map((node) => {
          const p = layout.get(node.id)!
          const dim = hover && hover !== node.id && !near.has(node.id)
          const r = node.type === 'agent' ? 10 : node.type === 'gap' ? 6 : 7
          return (
            <g key={node.id} transform={`translate(${p.x},${p.y})`} opacity={dim ? 0.25 : 1}
              style={{ cursor: node.type === 'note' ? 'pointer' : 'default' }}
              onMouseEnter={() => setHover(node.id)} onMouseLeave={() => setHover(null)}
              onClick={() => node.type === 'note' && onOpenNote(node.id)}>
              <circle r={r} fill={COLOR[node.type]} />
              <text y={r + 13} textAnchor="middle" fontSize={11} fill="var(--text-2, #475569)">
                {node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Dot({ c }: { c: string }) {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: c, marginRight: 4 }} />
}
