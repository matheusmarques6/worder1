'use client'

// Canvas do Construtor: porte de Node2/Canvas2 do protótipo (IA Construtor
// do Agente v2). Pan com arrastar, zoom com Ctrl+roda, linhas em SVG,
// espaços "Arraste uma…", alvos de soltura da paleta, caminho de um teste
// acendendo bloco a bloco, aviso do diagnóstico e mini-mapa.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { brl } from '@/lib/ai/brl'
import { ACC2, W2, layout2, type BuilderModel, type LNode, type PaletteItem } from '@/lib/ai/builder-model'
import type { Diagnostic } from '@/lib/ai/block-metrics'
import { Icon, Mets, Pill, TONE, Tile, type Tone } from '../proto/ui'

export interface RunState { path: string[]; i: number; fail: string | null }
export interface AgentHead { id?: string; name: string; role: string; active: boolean; draft: boolean }

const REM2 = new Set(['entry', 'kb', 'tool'])

function NodeBody({ n, f, agent, mets }: { n: LNode; f: BuilderModel; agent: AgentHead; mets: boolean }) {
  const d = n.d || {}
  const T = (ic: string, tone: Tone, t: string, s: string, pill: React.ReactNode, m: Array<[string, string]> | null) => (
    <>
      <div className="w-nh"><Tile ic={ic} tone={tone} /><div className="w-nt"><div className="w-nt1"><b>{t}</b>{pill}</div><span>{s}</span></div></div>
      <Mets m={m} on={mets} />
    </>
  )
  switch (n.type) {
    case 'entry':
      return T(d.ic, d.tone, d.t, d.s, <Pill k={agent.active ? 'live' : 'off'} />, d.m)
    case 'kb':
      return (
        <div className="w-nh sm"><Tile ic="bookOpen" tone="purple" s={34} />
          <div className="w-nt"><div className="w-nt1"><b>{d.t}</b></div><span>{mets && d.m ? d.m[0][0] + ' usos em 7 dias' : d.s}</span></div>
          {d.st !== 'ok' && <span className="w-dot sync" title={d.st === 'error' ? 'Erro ao processar' : 'Sincronizando'}></span>}
        </div>
      )
    case 'tool':
      return (
        <div className="w-nh sm"><Tile ic="wand" tone="sky" s={34} />
          <div className="w-nt"><div className="w-nt1"><b>{d.t}</b></div><span>{mets && d.m ? d.m.map((x: string[]) => x.join(' ')).join(' · ') : d.s}</span></div>
          {d.lock && <Icon n="lock" s={13} c="#C46A06" />}
        </div>
      )
    case 'agent': {
      const pctUsed = f.agent.cap && f.agent.used != null ? Math.min(1, f.agent.used / f.agent.cap) : 0
      const nums = agent.draft ? [['0', 'conversas'], ['R$ 0', 'receita'], ['—', 'por conversa'], ['—', 'avaliação']] : f.fixed.agent
      return (
        <>
          <div className="w-nh"><Tile ic="sparkle" tone="teal" s={48} />
            <div className="w-nt"><div className="w-nt1"><b style={{ fontSize: 17 }}>{agent.name}</b><Pill k={agent.active ? 'live' : 'off'} /></div>
              <span>{agent.role} · voz {f.agent.voice.toLowerCase()} · {f.agent.model}</span></div>
          </div>
          <div className="w-ag">{nums.map(([v, l]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}</div>
          <div className="w-agf"><span>Gasto do mês</span><span className="w-bar"><i style={{ width: pctUsed * 100 + '%' }}></i></span>
            <span className="mono">{f.agent.used == null ? '—' : brl(f.agent.used, 0)} / {f.agent.cap == null ? 'sem limite' : brl(f.agent.cap, 0)}</span></div>
        </>
      )
    }
    case 'adapt':
      return T('sliders', 'violet', 'Adaptação ao cliente', f.adapt.length ? `${f.adapt.length} ajustes: ${f.adapt.slice(0, 2).join(', ').toLowerCase()}` : 'Nenhum ajuste ligado', null, f.fixed.adapt)
    case 'limits': {
      const t = f.limits.filter((l) => l[0] === 'topic').length
      return (
        <>
          {T('shield', 'red', 'Limites', `${t} assuntos que não aborda · ${f.limits.length - t} regras`, null, f.fixed.limits)}
          {!mets && <div className="w-tags">{f.limits.slice(-2).map((l, i) => <span key={i}>{l[1]}</span>)}</div>}
        </>
      )
    }
    case 'review':
      return T('star', 'blue', 'Revisão antes de enviar', `Sempre ligada · ${f.review.length} critérios da loja`, null, f.fixed.review)
    case 'split':
      return T('users2', 'amber', 'Precisa de uma pessoa?', `${f.handoff.phrases.length} frases`, null, f.fixed.split)
    case 'transfer': {
      const other = f.handoff.dest !== 'team'
      return T(other ? 'bot' : 'users', 'violet', 'Transferir p/ ' + (other ? f.handoff.destName ?? 'Agente' : 'Equipe'), other ? 'Outro agente, com o histórico' : 'Inbox da equipe', null, f.fixed.transfer)
    }
    case 'send':
      return T('send2', 'green', 'Enviar resposta', 'Agrupa em ' + f.send.debounce + 's' + (f.send.split ? ' · divide em balões' : '') + (f.send.typing ? ' · ritmo de digitação' : ''), null, f.fixed.send)
  }
  return null
}

export default function Canvas({ f, agent, sel, setSel, drag, onDrop, run, onRemove, mets, issues, fitKey, nodeIdOf }: {
  f: BuilderModel
  agent: AgentHead
  sel: string | null
  setSel: (id: string | null) => void
  drag: PaletteItem | null
  onDrop: (item: PaletteItem) => void
  run: RunState | null
  onRemove: (id: string) => void
  mets: boolean
  issues: Diagnostic[]
  fitKey: string
  /** Nó do canvas de cada item do diagnóstico. */
  nodeIdOf: (node: string) => string
}) {
  const L = useMemo(() => layout2(f, mets), [f, mets])
  const wrap = useRef<HTMLDivElement>(null)
  const [v, setV] = useState({ s: 0.8, tx: 0, ty: 20 })
  const pan = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [lock, setLock] = useState(false)
  const [vp, setVp] = useState({ w: 1, h: 1 })

  const fit = () => {
    const el = wrap.current
    if (!el) return
    const w = el.clientWidth, h = el.clientHeight
    if (!w || !h) return
    setVp({ w, h })
    const s = Math.max(0.55, Math.min(1, (w - 60) / W2))
    setV({ s, tx: (w - W2 * s) / 2, ty: 24 })
  }
  useEffect(() => {
    fit()
    const raf = requestAnimationFrame(fit)
    document.fonts?.ready.then(fit)
    const ro = new ResizeObserver(fit)
    if (wrap.current) ro.observe(wrap.current)
    return () => { ro.disconnect(); cancelAnimationFrame(raf) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const h = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top
        setV((o) => { const s = Math.max(0.4, Math.min(1.4, o.s * (1 - e.deltaY * 0.002))); return { s, tx: mx - ((mx - o.tx) * s) / o.s, ty: my - ((my - o.ty) * s) / o.s } })
      } else setV((o) => ({ ...o, tx: o.tx - e.deltaX, ty: o.ty - e.deltaY }))
    }
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [])
  const zoom = (k: number) => setV((o) => {
    const el = wrap.current!
    const cx = el.clientWidth / 2, cy = el.clientHeight / 2, s = Math.max(0.4, Math.min(1.4, o.s * k))
    return { s, tx: cx - ((cx - o.tx) * s) / o.s, ty: cy - ((cy - o.ty) * s) / o.s }
  })
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.w-n,.w-slot,.w-zoom,.w-mini,.w-plus')) return
    pan.current = { x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    const p = pan.current
    if (!p || lock) return
    const dx = e.clientX - p.x, dy = e.clientY - p.y
    if (Math.abs(dx) + Math.abs(dy) > 3) p.moved = true
    setV((o) => ({ ...o, tx: p.tx + dx, ty: p.ty + dy }))
  }
  const up = () => { const p = pan.current; pan.current = null; if (p && !p.moved) setSel(null) }

  const target = drag ? ACC2[drag.k] : null
  const dz = (id: string) => ({
    onDragOver: (e: React.DragEvent) => { if (target === id) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (over !== id) setOver(id) } },
    onDragLeave: () => setOver((o) => (o === id ? null : o)),
    onDrop: (e: React.DragEvent) => { if (target === id && drag) { e.preventDefault(); setOver(null); onDrop(drag) } },
  })
  const ran = run ? new Set(run.path.slice(0, run.i + 1)) : new Set<string>()
  const cur = run && run.i < run.path.length ? run.path[run.i] : null
  const ePath = (e: { p: number[]; k: string }) => {
    const [x1, y1, x2, y2] = e.p
    if (e.k === 'attach') { const mx = (x1 + x2) / 2; return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` }
    if (e.k === 'branch') { const my = y1 + 46, r = 14, dir = x2 > x1 ? 1 : -1; return `M${x1},${y1 + 6} V${my - r} Q${x1},${my} ${x1 + dir * r},${my} H${x2 - dir * r} Q${x2},${my} ${x2},${my + r} V${y2 - 6}` }
    if (x1 === x2) return `M${x1},${y1 + 6} V${y2 - 6}`
    const my = (y1 + y2) / 2
    return `M${x1},${y1 + 6} C${x1},${my} ${x2},${my} ${x2},${y2 - 6}`
  }
  // Um nó pode ter mais de um aviso: mostra o pior.
  const iss = new Map<string, Diagnostic>()
  for (const i of issues) {
    if (i.lv === 'ok') continue
    const id = nodeIdOf(i.node)
    const prev = iss.get(id)
    if (!prev || (prev.lv === 'warn' && i.lv === 'error')) iss.set(id, i)
  }
  const mini = 0.14
  const agentNode = L.N.find((n) => n.id === 'agent')!

  return (
    <div className={'w-cv' + (drag ? ' dragging' : '')} ref={wrap} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
      <div className="w-grid" style={{ backgroundSize: `${20 * v.s}px ${20 * v.s}px`, backgroundPosition: `${v.tx}px ${v.ty}px` }}></div>
      <div className="w-in" style={{ width: W2, height: L.H, transform: `translate(${v.tx}px,${v.ty}px) scale(${v.s})` }}>
        <svg className="w-e" width={W2} height={L.H}>
          {L.E.map((e, i) => {
            const hot = ran.has(e.a) && ran.has(e.b)
            return (
              <g key={i}>
                <path d={ePath(e)} className={'we ' + e.k + (hot ? ' hot' : '')} />
                {e.k !== 'attach' && <><circle cx={e.p[0]} cy={e.p[1] + 5} r="4.5" className={'wp' + (hot ? ' hot' : '')} /><circle cx={e.p[2]} cy={e.p[3] - 5} r="4.5" className={'wp' + (hot ? ' hot' : '')} /></>}
                {e.k === 'attach' && <circle cx={e.p[2]} cy={e.p[3]} r="4" className={'wp' + (hot ? ' hot' : '')} />}
              </g>
            )
          })}
        </svg>
        {L.E.filter((e) => e.label).map((e, i) => <span key={i} className={'w-lb' + (ran.has(e.b) ? ' hot' : '')} style={{ left: (e.p[0] + e.p[2]) / 2, top: e.p[1] + 46 }}>{e.label}</span>)}
        <span className="w-col" style={{ left: 20, top: agentNode.y - 56 }}>Conhecimento · {f.kb.length}</span>
        <span className="w-col" style={{ left: W2 - 280, top: agentNode.y - 56 }}>Ferramentas · {f.tools.length}</span>
        {L.N.map((n) => {
          const acc = target === n.id
          const is = iss.get(n.id)
          const cls = 'w-n t-' + n.type + (sel === n.id ? ' sel' : '') + (ran.has(n.id) ? ' ran' : '') + (cur === n.id ? ' cur' : '')
            + (run && run.fail === n.id && run.i >= run.path.indexOf(n.id) ? ' fail' : '') + (acc ? ' drop-ok' : '') + (over === n.id ? ' drop-hover' : '') + (drag && !acc ? ' dim' : '')
          return (
            <div key={n.id} className={cls} style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
              onClick={(e) => { e.stopPropagation(); setSel(n.id) }} tabIndex={0} role="button"
              onKeyDown={(e) => { if (e.key === 'Enter') setSel(n.id); if ((e.key === 'Delete' || e.key === 'Backspace') && REM2.has(n.type)) onRemove(n.id) }}
              {...(acc ? dz(n.id) : {})}>
              <NodeBody n={n} f={f} agent={agent} mets={mets} />
              {is && <span className="w-warn" title={is.t}><Icon n="alert" s={11} sw={2.2} /></span>}
              {REM2.has(n.type) && <button type="button" className="w-x" aria-label="Remover" onClick={(e) => { e.stopPropagation(); onRemove(n.id) }}><Icon n="x" s={11} sw={2.2} /></button>}
              {ran.has(n.id) && cur !== n.id && run?.fail !== n.id && <span className="w-ok"><Icon n="check" s={10} sw={3} /></span>}
              {acc && <span className="w-drop">Soltar aqui</span>}
            </div>
          )
        })}
        {L.S.map((s) => {
          const acc = target === s.id
          return (
            <div key={s.id} className={'w-slot' + (acc ? ' drop-ok' : '') + (over === s.id ? ' drop-hover' : '') + (drag && !acc ? ' dim' : '')}
              style={{ left: s.x, top: s.y, width: s.w, height: s.h }} {...dz(s.id)}>
              <Icon n="plus" s={14} />{acc ? 'Soltar aqui' : s.label}
            </div>
          )
        })}
      </div>
      <div className="w-zoom">
        <button type="button" onClick={() => zoom(1.15)} aria-label="Aproximar"><Icon n="plus" s={15} /></button>
        <button type="button" onClick={() => zoom(1 / 1.15)} aria-label="Afastar"><span style={{ fontSize: 18, lineHeight: 1, marginTop: -2 }}>−</span></button>
        <button type="button" onClick={fit} aria-label="Ajustar"><Icon n="expand" s={13} /></button>
        <button type="button" onClick={() => setLock((l) => !l)} aria-label="Travar" className={lock ? 'on' : ''}><Icon n={lock ? 'lock' : 'unlock'} s={13} /></button>
      </div>
      <div className="w-mini" onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const mx = (e.clientX - r.left - 10) / mini, my = (e.clientY - r.top - 8) / mini
        setV((o) => ({ ...o, tx: vp.w / 2 - mx * o.s, ty: vp.h / 2 - my * o.s }))
      }}>
        <div style={{ position: 'relative', width: W2 * mini, height: L.H * mini }}>
          {L.N.map((n) => {
            const t: Tone = n.type === 'agent' ? 'teal' : n.type === 'entry' ? n.d.tone : n.type === 'kb' ? 'purple' : n.type === 'tool' ? 'sky'
              : ({ adapt: 'violet', limits: 'red', review: 'blue', split: 'amber', transfer: 'violet', send: 'green' } as Record<string, Tone>)[n.type]
            return <i key={n.id} style={{ left: n.x * mini, top: n.y * mini, width: n.w * mini, height: Math.max(3, n.h * mini * 0.5), background: TONE[t][1] }}></i>
          })}
          <b style={{ left: (-v.tx / v.s) * mini, top: (-v.ty / v.s) * mini, width: (vp.w / v.s) * mini, height: (vp.h / v.s) * mini }}></b>
        </div>
      </div>
    </div>
  )
}
