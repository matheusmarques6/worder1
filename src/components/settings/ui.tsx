'use client'

// Componentes base das Configurações — a "anatomia" do desenho
// (Card / Row / Tog / Badge / SaveBar / Modal…). Tudo estilizado por
// settings.css dentro de `.wset`.

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { I } from './icons'

export function Title({ h, p, right }: { h: ReactNode; p?: ReactNode; right?: ReactNode }) {
  return (
    <div className="st-title">
      <div><h2>{h}</h2>{p && <p>{p}</p>}</div>
      {right && <div className="acts">{right}</div>}
    </div>
  )
}

export function Card({
  title, desc, right, children, foot, flush, className, id,
}: {
  title?: ReactNode; desc?: ReactNode; right?: ReactNode; children?: ReactNode; foot?: ReactNode; flush?: boolean; className?: string; id?: string
}) {
  return (
    <section className={'sc' + (className ? ' ' + className : '')} id={id}>
      {(title || right) && (
        <div className="sc-h">
          <div>{title && <h3>{title}</h3>}{desc && <p>{desc}</p>}</div>
          {right}
        </div>
      )}
      {flush ? children : <div className="sc-b">{children}</div>}
      {foot && <div className="sc-f">{foot}</div>}
    </section>
  )
}

export function Row({ label, help, children, tg, htmlFor }: { label: ReactNode; help?: ReactNode; children?: ReactNode; tg?: boolean; htmlFor?: string }) {
  return (
    <div className={'row' + (tg ? ' tg' : '')}>
      <div className="lb">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
        {help && <div className="hp">{help}</div>}
      </div>
      <div className="ct">{children}</div>
    </div>
  )
}

export function Tog({ on, set, disabled, label }: { on: boolean; set?: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      className={'tog' + (on ? ' on' : '')}
      onClick={() => set && set(!on)}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      role="switch"
      aria-checked={on}
    />
  )
}

export type BadgeKind = 'ok' | 'warn' | 'err' | 'off' | 'acc'
export function Badge({ k = 'off', children, dot = true, style }: { k?: BadgeKind; children: ReactNode; dot?: boolean; style?: React.CSSProperties }) {
  return <span className={'badge ' + k} style={style}>{dot && <i />}{children}</span>
}

/**
 * Rodapé de salvar de um card. `dirty` controla o botão; `saving` mostra
 * o spinner; `onCancel` descarta as alterações locais.
 */
export function SaveBar({
  dirty, saving, onSave, onCancel, hint, error, label = 'Salvar', cancelLabel = 'Cancelar', disabled,
}: {
  dirty: boolean; saving?: boolean; onSave: () => void; onCancel?: () => void; hint?: ReactNode; error?: string | null; label?: string; cancelLabel?: string; disabled?: boolean
}) {
  return (
    <>
      <span className={'hint' + (error ? ' err' : '')}>{error || hint || (dirty ? 'Alterações não salvas' : '')}</span>
      {onCancel && <button type="button" className="btn" onClick={onCancel} disabled={!dirty || saving}>{cancelLabel}</button>}
      <button type="button" className="btn btn-primary" onClick={onSave} disabled={!dirty || saving || disabled}>
        {saving && <I n="refresh" s={14} className="spin" />}{label}
      </button>
    </>
  )
}

export function IconBtn({ n, title, onClick, danger, disabled, s = 16, className }: { n: string; title: string; onClick?: () => void; danger?: boolean; disabled?: boolean; s?: number; className?: string }) {
  return (
    <button type="button" className={'ib' + (danger ? ' danger' : '') + (className ? ' ' + className : '')} title={title} aria-label={title} onClick={onClick} disabled={disabled}>
      <I n={n} s={s} />
    </button>
  )
}

export function Empty({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty2"><b>{title}</b>{children}{action}</div>
}

export function LoadingCard({ rows = 3 }: { rows?: number }) {
  return (
    <section className="sc loading-card" aria-busy="true" aria-label="Carregando">
      <div className="sk w40" />
      {Array.from({ length: rows }).map((_, i) => <div key={i} className={'sk ' + (i % 2 ? 'w80' : 'w60')} />)}
    </section>
  )
}

export function Spinner({ s = 16 }: { s?: number }) {
  return <I n="refresh" s={s} className="spin" />
}

export function useCopy(ms = 1600): [string | null, (key: string, text: string) => void] {
  const [c, setC] = useState<string | null>(null)
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cp = useCallback((key: string, text: string) => {
    try { navigator.clipboard?.writeText(text) } catch { /* sem clipboard */ }
    setC(key)
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => setC(null), ms)
  }, [ms])
  return [c, cp]
}

export function CopyBtn({ text, label = 'Copiar', small, className }: { text: string; label?: string; small?: boolean; className?: string }) {
  const [c, cp] = useCopy()
  const ok = c === 'x'
  return (
    <button type="button" className={'cpb' + (ok ? ' ok' : '') + (className ? ' ' + className : '')} style={small ? { height: 30 } : undefined} onClick={() => cp('x', text)}>
      {ok ? <><I n="check" s={13} />Copiado</> : <><I n="copy" s={13} />{label}</>}
    </button>
  )
}

export function Modal({
  title, desc, onClose, children, footer, size,
}: { title: ReactNode; desc?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' }) {
  const id = useId()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }} role="presentation">
      <div className={'modal' + (size === 'lg' ? ' lg' : '')} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="mh">
          <div><h3 id={id}>{title}</h3>{desc && <p>{desc}</p>}</div>
          <button type="button" className="ib" onClick={onClose} aria-label="Fechar"><I n="x" s={18} /></button>
        </div>
        <div className="mb">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  )
}

/** Medidor do bloco `.use` (consumo / saúde). */
export function Meter({ label, right, value, suffix, pct, tone, valueStyle }: {
  label: ReactNode; right?: ReactNode; value: ReactNode; suffix?: ReactNode; pct: number; tone?: 'acc' | 'good' | 'over'; valueStyle?: React.CSSProperties
}) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div>
      <div className="lb">{label}{right !== undefined && <span>{right}</span>}</div>
      <div className="v" style={valueStyle}>{value}{suffix && <small>{suffix}</small>}</div>
      <div className="bar"><i className={tone === 'over' ? 'over' : tone === 'good' ? 'good' : ''} style={{ width: `${w}%` }} /></div>
    </div>
  )
}

export function Kv({ items }: { items: Array<[ReactNode, ReactNode]> }) {
  return <div className="kv">{items.map(([k, v], i) => <span key={i} style={{ display: 'contents' }}><span>{k}</span><b>{v}</b></span>)}</div>
}

export function Code({ children, wrap }: { children: ReactNode; wrap?: boolean }) {
  return <div className={'code' + (wrap ? ' wrap' : '')}>{children}</div>
}

export function RadioCard({ on, onClick, title, desc, disabled }: { on: boolean; onClick: () => void; title: ReactNode; desc?: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className={'radio' + (on ? ' on' : '')} onClick={onClick} role="radio" aria-checked={on} disabled={disabled}>
      <i /><div><b>{title}</b>{desc && <span>{desc}</span>}</div>
    </button>
  )
}

export function Chk({ ok, warn, title, help, action, style }: { ok: boolean; warn?: boolean; title: ReactNode; help?: ReactNode; action?: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="chk" style={style}>
      <span className={'ic ' + (ok ? 'ok' : warn ? 'warn' : 'no')}><I n={ok ? 'check' : warn ? 'clock' : 'x'} s={13} /></span>
      <div><div>{title}</div>{help && <div className="hp">{help}</div>}</div>
      {action}
    </div>
  )
}

export function Pill({ children, title }: { children: ReactNode; title?: string }) {
  return <span className="pill2" title={title}>{children}</span>
}

export function Avatar({ name, src, sm, square }: { name?: string | null; src?: string | null; sm?: boolean; square?: boolean }) {
  const ini = (name || '').trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  return (
    <div className={'avatar' + (sm ? ' sm' : '')} style={square ? { borderRadius: 8 } : undefined}>
      {src ? <img src={src} alt="" /> : ini}
    </div>
  )
}

/** Estado de formulário com "sujo" + reset — base de todo card com SaveBar. */
export function useForm<T extends Record<string, any>>(initial: T | null) {
  const [orig, setOrig] = useState<T | null>(initial)
  const [val, setVal] = useState<T | null>(initial)
  const reset = useCallback((next: T) => { setOrig(next); setVal(next) }, [])
  const set = useCallback(<K extends keyof T>(k: K, v: T[K]) => setVal((o) => (o ? { ...o, [k]: v } : o)), [])
  const patch = useCallback((p: Partial<T>) => setVal((o) => (o ? { ...o, ...p } : o)), [])
  const cancel = useCallback(() => setVal(orig), [orig])
  const dirty = !!val && !!orig && JSON.stringify(val) !== JSON.stringify(orig)
  return { val, orig, set, patch, reset, cancel, dirty, setVal }
}

export function Field({ label, children, error }: { label?: ReactNode; children: ReactNode; error?: string | null }) {
  return (
    <div>
      {label && <span className="inl">{label}</span>}
      {children}
      {error && <div className="field-err" style={{ marginTop: 4 }}>{error}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: Array<[T, ReactNode]>; className?: string }) {
  return (
    <div className={'seg' + (className ? ' ' + className : '')} role="tablist">
      {options.map(([k, l]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  )
}
