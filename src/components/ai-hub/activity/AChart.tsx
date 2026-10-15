'use client'

// Gráfico de área do protótipo (AChart): uma série por agente, empilhada
// quando a métrica soma, com cursor e dica ao passar o mouse.

import { useLayoutEffect, useRef, useState } from 'react'

export interface ASeries { k: string; l: string; c: string; v: number[] }

const fa = (v: number) =>
  v >= 1e6 ? `${(v / 1e6).toFixed(1).replace('.', ',')}M`
    : v >= 1000 ? `${(v / 1000).toFixed(v >= 1e4 ? 0 : 1).replace('.', ',')}k`
      : v < 10 && v % 1 ? v.toFixed(1).replace('.', ',') : String(Math.round(v))

export default function AChart({ series, labels, fmt, stack, h = 240 }: {
  series: ASeries[]; labels: string[]; fmt: (v: number) => string; stack: boolean; h?: number
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(700)
  const [hv, setHv] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const m = () => { if (el.clientWidth) setW(el.clientWidth) }
    m()
    const ro = new ResizeObserver(m)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const n = labels.length
  const tops: number[][] = []
  series.forEach((s, si) => tops.push(s.v.map((v, i) => (stack ? (si ? tops[si - 1][i] : 0) + v : v))))
  const max = Math.max(1e-6, ...tops.flat()) * 1.12
  const pl = 48; const pb = 24; const pt = 10
  const iw = Math.max(10, w - pl - 8); const ih = h - pb - pt
  const x = (i: number) => pl + (n === 1 ? iw / 2 : (i * iw) / (n - 1))
  const y = (v: number) => pt + ih - (v / max) * ih
  const step = Math.max(1, Math.ceil(n / 7))
  const tk = [0, 0.25, 0.5, 0.75, 1].map((t) => (max / 1.12) * t)
  return (
    <div className="ac-chart" ref={wrap} onMouseLeave={() => setHv(null)}
      onMouseMove={(e) => {
        const r = wrap.current!.getBoundingClientRect()
        const i = Math.round(((e.clientX - r.left - pl) / iw) * (n - 1))
        setHv(i >= 0 && i < n ? i : null)
      }}>
      <svg width={w} height={h} role="img" aria-label="Gráfico do período">
        {tk.map((t, i) => (
          <g key={i}>
            <line x1={pl} x2={w - 8} y1={y(t)} y2={y(t)} className="ac-gl" />
            <text x={pl - 8} y={y(t) + 4} className="ac-ax" textAnchor="end">{fa(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % step === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= step * 0.6) && (
          <text key={i} x={x(i)} y={h - 6} className="ac-ax" textAnchor={i === n - 1 && n > 1 ? 'end' : 'middle'}>{l}</text>
        ))}
        {series.map((s, si) => {
          const top = tops[si]
          const base = stack && si ? tops[si - 1] : null
          const line = top.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')
          const area = line + (base
            ? base.map((_, i) => i).reverse().map((i) => `L${x(i).toFixed(1)} ${y(base[i]).toFixed(1)}`).join('')
            : `L${x(n - 1)} ${y(0)}L${x(0)} ${y(0)}`) + 'Z'
          return (
            <g key={s.k}>
              <path d={area} fill={s.c} opacity={stack ? 0.18 : 0.07} />
              <path d={line} fill="none" stroke={s.c} strokeWidth="2" strokeLinejoin="round" />
            </g>
          )
        })}
        {hv != null && <line x1={x(hv)} x2={x(hv)} y1={pt} y2={pt + ih} className="ac-cur" />}
        {hv != null && series.map((s, si) => <circle key={s.k} cx={x(hv)} cy={y(tops[si][hv])} r="3.5" fill="#fff" stroke={s.c} strokeWidth="2" />)}
      </svg>
      {hv != null && (
        <div className="ac-tip" style={{ left: Math.min(w - 190, Math.max(0, x(hv) + 12)) }}>
          <b>{labels[hv]}</b>
          {series.map((s) => <div key={s.k}><i style={{ background: s.c }} />{s.l}<span>{fmt(s.v[hv])}</span></div>)}
          {stack && series.length > 1 && <div className="tot">Total<span>{fmt(series.reduce((a, s) => a + s.v[hv], 0))}</span></div>}
        </div>
      )}
    </div>
  )
}
