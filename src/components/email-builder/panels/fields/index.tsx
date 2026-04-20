'use client'

import { ColorPicker } from '../../ui/ColorPicker'

// ═══════════════════════════════════════════
// Reusable Field Components for Email Builder
// ═══════════════════════════════════════════

import { useState } from 'react'
import { ChevronDown, ChevronRight, AlignLeft, AlignCenter, AlignRight, Link2 } from 'lucide-react'

// ── Toggle Field ──
export function ToggleField({ label, description, value, onChange }: {
  label: string; description?: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <button type="button" onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 mt-0.5 ${value ? 'bg-brand-500' : 'bg-gray-200'}`}>
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${value ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
      </button>
      <div>
        <span className="text-xs font-medium text-gray-700 group-hover:text-gray-900">{label}</span>
        {description && <p className="text-[10px] text-gray-400 mt-0.5">{description}</p>}
      </div>
    </label>
  )
}

// ── Padding Field (4-directional) ──
export function PaddingField({ value, onChange }: {
  value: { top: number; right: number; bottom: number; left: number };
  onChange: (v: { top: number; right: number; bottom: number; left: number }) => void
}) {
  const [linked, setLinked] = useState(value.top === value.right && value.right === value.bottom && value.bottom === value.left)

  const handleChange = (side: string, val: number) => {
    if (linked) {
      onChange({ top: val, right: val, bottom: val, left: val })
    } else {
      onChange({ ...value, [side]: val })
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <div className="grid grid-cols-4 gap-1 flex-1">
          {(['top', 'right', 'bottom', 'left'] as const).map(side => (
            <div key={side}>
              <label className="text-[9px] text-gray-400 block text-center mb-0.5">
                {side === 'top' ? 'Cima' : side === 'right' ? 'Dir' : side === 'bottom' ? 'Baixo' : 'Esq'}
              </label>
              <input type="number" value={value[side] || 0} onChange={e => handleChange(side, Number(e.target.value))}
                className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs text-center text-gray-900 focus:border-brand-500 focus:outline-none" min={0} max={100} />
            </div>
          ))}
        </div>
        <button onClick={() => setLinked(!linked)} title={linked ? 'Desvincular' : 'Vincular'}
          className={`p-1 rounded transition-colors ${linked ? 'text-brand-500 bg-brand-50' : 'text-gray-300 hover:text-gray-500'}`}>
          <Link2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Color Field ──
export function ColorField({ label, value, onChange }: {
  label?: string; value: string; onChange: (v: string) => void
}) {
  return <ColorPicker label={label} value={value || '#000000'} onChange={onChange} />
}

// ── Number Field ──
export function NumberField({ label, value, onChange, min, max, suffix }: {
  label?: string; value: number; onChange: (v: number) => void; min?: number; max?: number; suffix?: string
}) {
  return (
    <div>
      {label && <label className="block text-[11px] font-medium text-gray-500 mb-1">{label}</label>}
      <div className="flex items-center gap-1.5">
        <input type="number" value={value ?? 0} onChange={e => onChange(Number(e.target.value))} min={min} max={max}
          className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:border-brand-500 focus:outline-none" />
        {suffix && <span className="text-[10px] text-gray-400 flex-shrink-0">{suffix}</span>}
      </div>
    </div>
  )
}

// ── Select Field ──
export function SelectField({ label, value, onChange, options }: {
  label?: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <div>
      {label && <label className="block text-[11px] font-medium text-gray-500 mb-1">{label}</label>}
      <select value={value || ''} onChange={e => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 bg-white focus:border-brand-500 focus:outline-none">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ── Input Field ──
export function InputField({ label, value, onChange, placeholder, type = 'text' }: {
  label?: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      {label && <label className="block text-[11px] font-medium text-gray-500 mb-1">{label}</label>}
      <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:border-brand-500 focus:outline-none" />
    </div>
  )
}

// ── Slider Field ──
export function SliderField({ label, value, onChange, min = 0, max = 100, suffix }: {
  label?: string; value: number; onChange: (v: number) => void; min?: number; max?: number; suffix?: string
}) {
  return (
    <div>
      {label && <label className="block text-[11px] font-medium text-gray-500 mb-1">{label}</label>}
      <div className="flex items-center gap-2">
        <input type="range" value={value ?? 0} onChange={e => onChange(Number(e.target.value))} min={min} max={max}
          className="flex-1 h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-brand-500" />
        <span className="text-xs text-gray-600 w-12 text-right">{value}{suffix || ''}</span>
      </div>
    </div>
  )
}

// ── Expandable Section ──
export function ExpandableSection({ title, children, defaultOpen = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors">
        <span>{title}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  )
}

// ── Alignment Buttons ──
export function AlignmentButtons({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = [
    { value: 'left', Icon: AlignLeft },
    { value: 'center', Icon: AlignCenter },
    { value: 'right', Icon: AlignRight },
  ]
  return (
    <div className="flex gap-0.5 bg-gray-100 rounded-md p-0.5">
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`flex-1 flex items-center justify-center py-1.5 rounded transition-colors ${
            value === o.value ? 'bg-brand-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}>
          <o.Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  )
}

// ── Border Field (Expandable) ──
export function BorderField({ value, onChange }: {
  value: { width: number; color: string; style: string; radius: number };
  onChange: (v: any) => void
}) {
  return (
    <ExpandableSection title="Borda">
      <NumberField label="Largura" value={value?.width || 0} onChange={v => onChange({ ...value, width: v })} min={0} max={10} suffix="px" />
      <ColorField label="Cor" value={value?.color || '#E5E7EB'} onChange={v => onChange({ ...value, color: v })} />
      <SelectField label="Estilo" value={value?.style || 'solid'} onChange={v => onChange({ ...value, style: v })}
        options={[{ value: 'none', label: 'Nenhuma' }, { value: 'solid', label: 'Sólida' }, { value: 'dashed', label: 'Tracejada' }, { value: 'dotted', label: 'Pontilhada' }]} />
      <NumberField label="Raio" value={value?.radius || 0} onChange={v => onChange({ ...value, radius: v })} min={0} max={50} suffix="px" />
    </ExpandableSection>
  )
}

// ── Shadow Field (Expandable) ──
export function ShadowField({ value, onChange }: {
  value: { enabled: boolean; x: number; y: number; blur: number; color: string };
  onChange: (v: any) => void
}) {
  return (
    <ExpandableSection title="Sombra">
      <ToggleField label="Ativar sombra" value={value?.enabled || false} onChange={v => onChange({ ...value, enabled: v })} />
      {value?.enabled && (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            <NumberField label="X" value={value.x || 0} onChange={v => onChange({ ...value, x: v })} />
            <NumberField label="Y" value={value.y || 2} onChange={v => onChange({ ...value, y: v })} />
            <NumberField label="Blur" value={value.blur || 4} onChange={v => onChange({ ...value, blur: v })} />
          </div>
          <ColorField label="Cor" value={value.color || 'rgba(0,0,0,0.1)'} onChange={v => onChange({ ...value, color: v })} />
        </>
      )}
    </ExpandableSection>
  )
}

// ── Text Style Fields ──
export function TextStyleFields({ value, onChange }: {
  value: { fontSize?: number; color?: string; fontWeight?: string; align?: string };
  onChange: (key: string, val: any) => void
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField label="Tamanho" value={value.fontSize || 14} onChange={v => onChange('fontSize', v)} min={8} max={72} suffix="px" />
        <SelectField label="Peso" value={value.fontWeight || '400'} onChange={v => onChange('fontWeight', v)}
          options={[{ value: '400', label: 'Normal' }, { value: '500', label: 'Médio' }, { value: '600', label: 'Semi-bold' }, { value: '700', label: 'Bold' }]} />
      </div>
      <ColorField label="Cor" value={value.color || '#111827'} onChange={v => onChange('color', v)} />
      {value.align !== undefined && (
        <div>
          <label className="block text-[11px] font-medium text-gray-500 mb-1">Alinhamento</label>
          <AlignmentButtons value={value.align || 'left'} onChange={v => onChange('align', v)} />
        </div>
      )}
    </div>
  )
}
