'use client'

// Peças do protótipo da aba IA (Worder_Completo_offline_1.html), portadas sem
// mudar o desenho: Icon, Av, Toast, Tile, Pill, Mets, Sec, KV e os
// interruptores. O CSS vem de src/styles/ia-proto (gerado por
// scripts/ia-proto/scope_css.py) e só vale dentro do invólucro <IaProto>.

import React, { useEffect, type CSSProperties, type ReactNode } from 'react'
import '@/styles/ia-proto/base.css'
import '@/styles/ia-proto/p1.css'
import '@/styles/ia-proto/p1-extra.css'
import '@/styles/ia-proto/builder.css'
import '@/styles/ia-proto/kb.css'
import { ICONS, type IconName } from './icons'

/** Invólucro da área IA. `full` liga o tema do Construtor e do Conhecimento
 *  (DM Sans, ação preta, barra escura). */
export function IaProto({ full = false, className = '', style, children }: {
  full?: boolean; className?: string; style?: CSSProperties; children: ReactNode
}) {
  return <div className={`wp${full ? ' wp-b' : ''} ${className}`.trim()} style={style}>{children}</div>
}

export function Icon({ n, s = 18, c, sw = 1.7, style, className }: {
  n: IconName | string; s?: number; c?: string; sw?: number; style?: CSSProperties; className?: string
}) {
  const d = (ICONS as Record<string, string>)[n]
  if (!d) return null
  return (
    <svg className={className} width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c || 'currentColor'}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  )
}

export const TONE = {
  green: ['#EAF7EF', '#15803D'], blue: ['#EEF3FE', '#2F62D8'], teal: ['#E7F6F5', '#0F8A84'],
  purple: ['#F2EEFD', '#7446D6'], sky: ['#E9F4FC', '#1A7FC4'], amber: ['#FEF4E6', '#C46A06'],
  red: ['#FDEEEE', '#D23B3B'], violet: ['#F5EEFE', '#9447DC'], pink: ['#FCEEF5', '#C0367A'],
  slate: ['#F1F3F5', '#4B5563'],
} as const
export type Tone = keyof typeof TONE

export function Av({ name, s = 34 }: { name: string | null | undefined; s?: number }) {
  return <span className="av" style={{ width: s, height: s, fontSize: s * 0.4 }}>{(name || '?').trim()[0]?.toUpperCase() ?? '?'}</span>
}

export function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2600); return () => clearTimeout(t) }, [msg, onDone])
  return <div className="toast" role="status"><Icon n="check" s={16} />{msg}</div>
}

export function Tile({ ic, tone = 'slate', s = 44 }: { ic: string; tone?: Tone; s?: number }) {
  const t = TONE[tone] ?? TONE.slate
  return <span className="w-tile" style={{ width: s, height: s, background: t[0], color: t[1] }}><Icon n={ic} s={s > 40 ? 20 : 16} /></span>
}

export type PillKind = 'live' | 'sync' | 'proc' | 'off' | 'lock'
export function Pill({ k }: { k: PillKind | null | undefined }) {
  if (k === 'live') return <span className="w-pill live"><i></i>Live</span>
  if (k === 'sync') return <span className="w-pill sync"><i></i>Sincronizando</span>
  if (k === 'proc') return <span className="w-pill sync"><i></i>Processando</span>
  if (k === 'off') return <span className="w-pill off"><i></i>Pausado</span>
  if (k === 'lock') return <span className="w-pill lock"><Icon n="lock" s={10} />Autorização</span>
  return null
}

/** Linha de números de um bloco: [[valor, rótulo], …]. */
export function Mets({ m, on }: { m: Array<[string, string]> | null | undefined; on: boolean }) {
  if (!on || !m || m.length === 0) return null
  return <div className="w-mets">{m.map(([v, l]) => <span key={l}><b>{v}</b>{l}</span>)}</div>
}

export function KV({ k, children }: { k: string; children: ReactNode }) {
  return <div className="w-kv"><span>{k}</span><div>{children}</div></div>
}

export function Sec({ t, act, children }: { t: string; act?: ReactNode; children?: ReactNode }) {
  return <div className="w-sec"><div className="w-sech"><b>{t}</b>{act}</div>{children}</div>
}

/** Interruptor do Construtor e do Conhecimento (verde). */
export function SwW({ on, set, dis, label }: { on: boolean; set: (v: boolean) => void; dis?: boolean; label: string }) {
  return <button type="button" className={'w-sw' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={label} disabled={dis} onClick={() => set(!on)}></button>
}

/** Interruptor das telas P1 (laranja). */
export function Sw({ on, set, dis, label }: { on: boolean; set: (v: boolean) => void; dis?: boolean; label: string }) {
  return <button type="button" className={'sw' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={label} disabled={dis} onClick={() => set(!on)}></button>
}

export function Modal({ title, sub, onClose, children, footer, width = 560 }: {
  title: string; sub?: ReactNode; onClose: () => void; children?: ReactNode; footer?: ReactNode; width?: number
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ width: `min(${width}px,100%)` }}>
        <div className="modal-h"><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div></div>
        {children && <div className="modal-b">{children}</div>}
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  )
}
