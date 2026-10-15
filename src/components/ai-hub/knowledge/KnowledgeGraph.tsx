'use client'

// Grafo do Conhecimento (protótipo, Graph): notas como bolinhas na cor da
// pasta e do tamanho do uso, ligadas pelos [[links]]; agentes como avatares
// ligados às notas que leem; lacunas tracejadas em vermelho ligadas à nota
// sugerida. Simulação de forças no navegador, arrastar, zoom e filtro.

import { useEffect, useMemo, useRef, useState } from 'react'
import { KT, type KbFolder, type KbNote, type Tone } from './kb-model'
import type { KbAgent, KbGap } from './KbPanels'

type GNode =
  | { id: string; kind: 'note'; label: string; tone: Tone; r: number; note: KbNote }
  | { id: string; kind: 'agent'; label: string; r: number; ag: string }
  | { id: string; kind: 'gap'; label: string; r: number; gap: KbGap }
interface GEdge { a: string; b: string; k: 'link' | 'agent' | 'gap' }
interface Pos { x: number; y: number; vx: number; vy: number }

function useGraph(notes: KbNote[], folders: KbFolder[], agents: KbAgent[], gaps: KbGap[], opt: { agents: boolean; gaps: boolean }) {
  return useMemo(() => {
    const tone = new Map(folders.map((f) => [f.id, f.tone]))
    const byTitle = new Map(notes.map((n) => [n.name.trim().toLowerCase(), n.id]))
    const N: GNode[] = []
    const E: GEdge[] = []
    notes.forEach((n) => N.push({ id: n.id, kind: 'note', label: n.name, tone: tone.get(n.folder) ?? 'slate', r: 5 + Math.sqrt(n.uses_7d ?? 0) * 1.15, note: n }))
    notes.forEach((n) => (n.links ?? []).forEach((t) => {
      const to = byTitle.get(t.trim().toLowerCase())
      if (to && to !== n.id) E.push({ a: n.id, b: to, k: 'link' })
    }))
    if (opt.agents) agents.forEach((a) => {
      N.push({ id: `a:${a.id}`, kind: 'agent', label: a.name, r: 17, ag: a.id })
      notes.forEach((n) => n.readers.includes(a.id) && E.push({ a: `a:${a.id}`, b: n.id, k: 'agent' }))
    })
    if (opt.gaps) gaps.forEach((g) => {
      N.push({ id: `g:${g.id}`, kind: 'gap', label: g.question, r: 7, gap: g })
      if (g.suggested_source && notes.some((n) => n.id === g.suggested_source!.id)) E.push({ a: `g:${g.id}`, b: g.suggested_source.id, k: 'gap' })
    })
    return { N, E }
  }, [notes, folders, agents, gaps, opt.agents, opt.gaps])
}

export default function KnowledgeGraph({ notes, folders, agents, gaps, onOpen, onGap }: {
  notes: KbNote[]; folders: KbFolder[]; agents: KbAgent[]; gaps: KbGap[]
  onOpen: (id: string) => void; onGap: (g: KbGap) => void
}) {
  const [opt, setOpt] = useState({ agents: true, gaps: true, ag: 'all' })
  const { N, E } = useGraph(notes, folders, agents, gaps, opt)
  const pos = useRef<Record<string, Pos>>({})
  const fitted = useRef(false)
  const [, tick] = useState(0)
  const alpha = useRef(1)
  const wrap = useRef<HTMLDivElement>(null)
  const [v, setV] = useState({ s: 1, tx: 0, ty: 0 })
  const [hov, setHov] = useState<string | null>(null)
  const drag = useRef<{ id: string | null; moved?: boolean; sx: number; sy: number; v0: typeof v } | null>(null)

  useEffect(() => {
    const P = pos.current
    N.forEach((n, i) => {
      if (!P[n.id]) {
        const a = (i / Math.max(1, N.length)) * Math.PI * 2
        const r = n.kind === 'agent' ? 60 : 220
        P[n.id] = { x: Math.cos(a) * r + (Math.random() - 0.5) * 40, y: Math.sin(a) * r + (Math.random() - 0.5) * 40, vx: 0, vy: 0 }
      }
    })
    alpha.current = 1
    let raf = 0
    const step = () => {
      const al = alpha.current
      if (al < 0.008) { tick((t) => t + 1); return }
      const ns = N.map((n) => [n, P[n.id]] as const)
      for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
        const a = ns[i][1]; const b = ns[j][1]
        let dx = b.x - a.x; let dy = b.y - a.y
        const d2 = dx * dx + dy * dy || 1
        const f = ((ns[i][0].kind === 'agent' || ns[j][0].kind === 'agent' ? 5200 : 2600) / d2) * al
        const d = Math.sqrt(d2); dx /= d; dy /= d
        a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f
      }
      E.forEach((e) => {
        const a = P[e.a]; const b = P[e.b]
        if (!a || !b) return
        const dx = b.x - a.x; const dy = b.y - a.y; const d = Math.sqrt(dx * dx + dy * dy) || 1
        const L = e.k === 'agent' ? 150 : e.k === 'gap' ? 70 : 95
        const k = (e.k === 'agent' ? 0.012 : 0.04) * al
        const f = (d - L) * k
        a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
      })
      ns.forEach(([n, p]) => {
        if (drag.current && drag.current.id === n.id) return
        p.vx -= p.x * 0.012 * al; p.vy -= p.y * 0.012 * al; p.vx *= 0.82; p.vy *= 0.82; p.x += p.vx; p.y += p.vy
      })
      alpha.current *= 0.985
      if (!fitted.current && alpha.current < 0.12 && wrap.current) {
        fitted.current = true
        const ps = Object.values(P)
        if (ps.length) {
          const xs = ps.map((p) => p.x); const ys = ps.map((p) => p.y)
          const x0 = Math.min(...xs) - 60; const x1 = Math.max(...xs) + 60; const y0 = Math.min(...ys) - 50; const y1 = Math.max(...ys) + 70
          const w = wrap.current.clientWidth; const h = wrap.current.clientHeight - 90
          if (w && h) {
            const s = Math.max(0.5, Math.min(1.3, Math.min(w / (x1 - x0), h / (y1 - y0))))
            setV({ s, tx: w / 2 - ((x0 + x1) / 2) * s, ty: 30 + h / 2 - ((y0 + y1) / 2) * s })
          }
        }
      }
      tick((t) => t + 1)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [N, E])

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const fit = () => { const w = el.clientWidth; const h = el.clientHeight; if (w && h) setV((o) => (o.tx ? o : { s: 1, tx: w / 2, ty: h / 2 })) }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    const wh = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect(); const mx = e.clientX - r.left; const my = e.clientY - r.top
      setV((o) => { const s = Math.max(0.35, Math.min(2.4, o.s * (1 - e.deltaY * 0.0015))); return { s, tx: mx - ((mx - o.tx) * s) / o.s, ty: my - ((my - o.ty) * s) / o.s } })
    }
    el.addEventListener('wheel', wh, { passive: false })
    return () => { ro.disconnect(); el.removeEventListener('wheel', wh) }
  }, [])

  const nb = useMemo(() => {
    const m = new Map<string, Set<string>>()
    E.forEach((e) => {
      if (!m.has(e.a)) m.set(e.a, new Set()); if (!m.has(e.b)) m.set(e.b, new Set())
      m.get(e.a)!.add(e.b); m.get(e.b)!.add(e.a)
    })
    return m
  }, [E])
  const focus = hov || (opt.ag !== 'all' ? `a:${opt.ag}` : null)
  const lit = focus ? new Set([focus, ...(nb.get(focus) ?? [])]) : null
  const toW = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left - v.tx) / v.s, y: (e.clientY - r.top - v.ty) / v.s }
  }
  const down = (e: React.PointerEvent, id: string) => {
    e.stopPropagation()
    wrap.current?.setPointerCapture?.(e.pointerId)
    drag.current = { id, moved: false, sx: e.clientX, sy: e.clientY, v0: v }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true
    if (d.id) {
      const w = toW(e); const p = pos.current[d.id]
      if (p) { p.x = w.x; p.y = w.y; p.vx = 0; p.vy = 0 }
      alpha.current = Math.max(alpha.current, 0.3); tick((t) => t + 1)
    } else setV({ ...d.v0, tx: d.v0.tx + e.clientX - d.sx, ty: d.v0.ty + e.clientY - d.sy })
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    if (d && d.id && !d.moved) {
      const n = N.find((x) => x.id === d.id)
      if (!n) return
      if (n.kind === 'note') onOpen(n.id)
      if (n.kind === 'gap') onGap(n.gap)
      if (n.kind === 'agent') setOpt((o) => ({ ...o, ag: o.ag === n.ag ? 'all' : n.ag }))
    }
  }
  const P = pos.current
  const hovNode = hov ? N.find((x) => x.id === hov) : null
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name || 'Agente'

  return (
    <div className="kg" ref={wrap}
      onPointerDown={(e) => { if ((e.target as HTMLElement).closest('.kg-ctl,.kg-leg')) return; drag.current = { id: null, sx: e.clientX, sy: e.clientY, v0: v } }}
      onPointerMove={move} onPointerUp={up}>
      <svg className="kg-svg">
        <g transform={`translate(${v.tx},${v.ty}) scale(${v.s})`}>
          {E.map((e, i) => {
            const a = P[e.a]; const b = P[e.b]
            if (!a || !b) return null
            const on = !lit || (lit.has(e.a) && lit.has(e.b) && (e.a === focus || e.b === focus))
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`kg-e ${e.k}${on ? '' : ' dim'}${lit && on ? ' lit' : ''}`} />
          })}
          {N.map((n) => {
            const p = P[n.id]
            if (!p) return null
            const on = !lit || lit.has(n.id)
            return (
              <g key={n.id} transform={`translate(${p.x},${p.y})`} className={`kg-n ${n.kind}${on ? '' : ' dim'}`}
                onPointerDown={(e) => down(e, n.id)} onPointerEnter={() => setHov(n.id)} onPointerLeave={() => setHov(null)}>
                {n.kind === 'agent'
                  ? <><circle r={n.r + 5} className="kg-ag-ring" /><circle r={n.r} className="kg-ag" /><text className="kg-ag-t" dy="4.5">{n.label[0]}</text></>
                  : n.kind === 'gap' ? <circle r={n.r} className="kg-gap" />
                    : <circle r={n.r} fill={KT[n.tone][1]} className="kg-dot" />}
                {(n.kind !== 'gap' || hov === n.id) && (
                  <text className={`kg-l${n.kind === 'agent' ? ' ag' : ''}${v.s < 0.7 && n.kind === 'note' && hov !== n.id ? ' hide' : ''}`} y={n.r + (n.kind === 'agent' ? 20 : 14)}>
                    {n.kind === 'gap' ? n.label.slice(0, 42) + (n.label.length > 42 ? '…' : '') : n.label}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
      <div className="kg-ctl">
        <div className="kg-seg">
          {[['all', 'Todos'] as [string, string], ...agents.map((a) => [a.id, a.name] as [string, string])].map(([k, l]) => (
            <button key={k} type="button" className={opt.ag === k ? 'on' : ''} onClick={() => setOpt((o) => ({ ...o, ag: k, agents: true }))}>{l}</button>
          ))}
        </div>
        <label><button type="button" className={'w-sw' + (opt.agents ? ' on' : '')} role="switch" aria-checked={opt.agents} onClick={() => setOpt((o) => ({ ...o, agents: !o.agents, ag: 'all' }))} />Agentes</label>
        <label><button type="button" className={'w-sw' + (opt.gaps ? ' on' : '')} role="switch" aria-checked={opt.gaps} onClick={() => setOpt((o) => ({ ...o, gaps: !o.gaps }))} />Lacunas</label>
      </div>
      <div className="kg-leg">
        {folders.map((f) => <span key={f.id}><i style={{ background: KT[f.tone][1] }} />{f.label}</span>)}
        <span><i className="gap" />Lacuna</span>
      </div>
      <div className={'kg-tip' + (hov ? '' : ' idle')}>
        {hovNode
          ? hovNode.kind === 'note'
            ? <><b>{hovNode.label}</b>{hovNode.note.uses_7d ?? 0} usos em 7 dias · {hovNode.note.readers.length ? `lida por ${hovNode.note.readers.map(agentName).join(', ')}` : 'nenhum agente lê'}</>
            : hovNode.kind === 'agent'
              ? <><b>{hovNode.label}</b>lê {notes.filter((x) => x.readers.includes(hovNode.ag)).length} notas · clique para filtrar</>
              : <><b>Lacuna</b>{hovNode.gap.count} conversas sem resposta · clique para criar a nota</>
          : <>Arraste as bolinhas · rolagem para zoom · clique para abrir</>}
      </div>
    </div>
  )
}
