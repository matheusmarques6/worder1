'use client'

import { useState } from 'react'
import { Plus, ChevronDown, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Image as ImageIcon } from 'lucide-react'
import type { EmailSection } from '../config/types'
import { SECTION_LAYOUTS } from '../config/types'

interface SectionPropertiesProps {
  section: EmailSection
  onStyleChange: (key: string, value: any) => void
  onColumnLayoutChange: (columns: number[]) => void
}

/* ── Inline field helpers ── */
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value || '#ffffff'} onChange={e => onChange(e.target.value)}
          className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0.5 flex-shrink-0" />
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder="Transparente"
          className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-md text-xs font-mono text-gray-900 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-500/20 focus:outline-none" />
      </div>
    </div>
  )
}

function Expandable({ title, hasValue, children }: { title: string; hasValue?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen(!open)} type="button"
        className="w-full flex items-center justify-between py-2 text-[12px] font-medium text-gray-700 hover:text-gray-900 transition-colors">
        <span>{title}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <Plus className="w-3.5 h-3.5 text-gray-400" />}
      </button>
      {open && <div className="pb-3 space-y-3">{children}</div>}
    </div>
  )
}

export function SectionProperties({ section, onStyleChange, onColumnLayoutChange }: SectionPropertiesProps) {
  const [tab, setTab] = useState<'styles' | 'display'>('styles')
  const s = section.styles

  return (
    <div>
      {/* Tabs — Styles | Display */}
      <div className="flex border-b border-gray-200 mb-4">
        <button onClick={() => setTab('styles')}
          className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${tab === 'styles' ? 'text-gray-900 border-b-2 border-gray-900 -mb-px' : 'text-gray-400 hover:text-gray-600'}`}>
          Styles
        </button>
        <button onClick={() => setTab('display')}
          className={`flex-1 py-2.5 text-[12px] font-semibold transition-colors ${tab === 'display' ? 'text-gray-900 border-b-2 border-gray-900 -mb-px' : 'text-gray-400 hover:text-gray-600'}`}>
          Display
        </button>
      </div>

      {tab === 'styles' && (
        <div className="space-y-1">
          {/* Imagem de fundo (+) */}
          <Expandable title="Imagem de fundo">
            <div className="space-y-2">
              <input type="text" value={s.backgroundImage || ''} onChange={e => onStyleChange('backgroundImage', e.target.value)}
                placeholder="URL da imagem de fundo"
                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs text-gray-900 placeholder-gray-400 focus:border-zinc-900 focus:outline-none" />
              {s.backgroundImage && (
                <div className="grid grid-cols-2 gap-2">
                  <select value={s.backgroundRepeat || 'no-repeat'} onChange={e => onStyleChange('backgroundRepeat', e.target.value)}
                    className="px-2 py-1.5 border border-gray-200 rounded-md text-xs text-gray-900 bg-white">
                    <option value="no-repeat">Não repetir</option>
                    <option value="repeat">Repetir</option>
                  </select>
                  <select value={s.backgroundSize || 'cover'} onChange={e => onStyleChange('backgroundSize', e.target.value)}
                    className="px-2 py-1.5 border border-gray-200 rounded-md text-xs text-gray-900 bg-white">
                    <option value="cover">Cover</option>
                    <option value="contain">Contain</option>
                    <option value="auto">Auto</option>
                  </select>
                </div>
              )}
            </div>
          </Expandable>

          <div className="border-t border-gray-100" />

          {/* Cor do conteúdo — Auto / Custom / None */}
          <div className="py-2">
            <label className="block text-[12px] font-medium text-gray-700 mb-2">Cor do conteúdo</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {(['auto', 'custom', 'none'] as const).map(mode => (
                <button key={mode} onClick={() => {
                  onStyleChange('contentColorMode', mode)
                  if (mode === 'none') onStyleChange('contentBackgroundColor', '')
                }}
                  className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
                    (s.contentColorMode || 'auto') === mode
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}>
                  {mode === 'auto' ? 'Auto' : mode === 'custom' ? 'Custom' : 'None'}
                </button>
              ))}
            </div>
            {s.contentColorMode === 'custom' && (
              <div className="mt-2">
                <ColorRow label="" value={s.contentBackgroundColor || '#ffffff'} onChange={v => onStyleChange('contentBackgroundColor', v)} />
              </div>
            )}
          </div>

          <div className="border-t border-gray-100" />

          {/* Cor da seção (+) */}
          <Expandable title="Cor da seção">
            <ColorRow label="" value={s.backgroundColor || ''} onChange={v => onStyleChange('backgroundColor', v)} />
          </Expandable>

          <div className="border-t border-gray-100" />

          {/* Border (+) */}
          <Expandable title="Border">
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500">Largura</label>
                  <input type="number" value={s.border?.width || 0} onChange={e => onStyleChange('border', { ...(s.border || {}), width: Number(e.target.value) })}
                    min={0} max={10} className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-xs text-gray-900 focus:border-zinc-900 focus:outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500">Raio</label>
                  <input type="number" value={s.border?.radius || 0} onChange={e => onStyleChange('border', { ...(s.border || {}), radius: Number(e.target.value) })}
                    min={0} max={50} className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-xs text-gray-900 focus:border-zinc-900 focus:outline-none" />
                </div>
              </div>
              <ColorRow label="Cor" value={s.border?.color || '#E5E7EB'} onChange={v => onStyleChange('border', { ...(s.border || {}), color: v })} />
              <select value={s.border?.style || 'solid'} onChange={e => onStyleChange('border', { ...(s.border || {}), style: e.target.value })}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-xs text-gray-900 bg-white focus:border-zinc-900 focus:outline-none">
                <option value="none">Nenhuma</option>
                <option value="solid">Sólida</option>
                <option value="dashed">Tracejada</option>
                <option value="dotted">Pontilhada</option>
              </select>
            </div>
          </Expandable>

          <div className="border-t border-gray-100" />

          {/* Padding */}
          <div className="py-2">
            <label className="block text-[12px] font-medium text-gray-700 mb-2">Padding</label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1">
                <span className="text-[10px] text-gray-400 w-4">↕</span>
                <input type="number" value={s.padding.top} onChange={e => onStyleChange('padding', { ...s.padding, top: Number(e.target.value), bottom: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-xs text-center text-gray-900 focus:border-zinc-900 focus:outline-none" min={0} />
                <span className="text-[10px] text-gray-400">px</span>
              </div>
              <div className="flex items-center gap-1.5 flex-1">
                <span className="text-[10px] text-gray-400 w-4">↔</span>
                <input type="number" value={s.padding.left} onChange={e => onStyleChange('padding', { ...s.padding, left: Number(e.target.value), right: Number(e.target.value) })}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-xs text-center text-gray-900 focus:border-zinc-900 focus:outline-none" min={0} />
                <span className="text-[10px] text-gray-400">px</span>
              </div>
              <button className="p-1.5 border border-gray-200 rounded-md text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors" title="Editar 4 lados">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="1" width="12" height="12" rx="2" />
                </svg>
              </button>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Alinhamento do conteúdo */}
          <div className="py-2">
            <label className="block text-[12px] font-medium text-gray-700 mb-2">Alinhamento do conteúdo</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {([
                { value: 'top', Icon: AlignVerticalJustifyStart },
                { value: 'middle', Icon: AlignVerticalJustifyCenter },
                { value: 'bottom', Icon: AlignVerticalJustifyEnd },
              ] as const).map(opt => (
                <button key={opt.value} onClick={() => onStyleChange('columnAlignment', opt.value)}
                  className={`flex-1 flex items-center justify-center py-2 transition-colors ${
                    (s.columnAlignment || 'top') === opt.value ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}>
                  <opt.Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Empilhamento mobile */}
          <div className="py-2">
            <label className="block text-[12px] font-medium text-gray-700 mb-2">Empilhamento mobile</label>
            <div className="space-y-1">
              {([
                { value: 'rtl', label: 'Direita para esquerda', icon: '⇄' },
                { value: 'ltr', label: 'Esquerda para direita', icon: '⇆' },
                { value: 'none', label: 'Sem empilhamento', icon: '•••' },
              ] as const).map(opt => (
                <label key={opt.value} className="flex items-center gap-3 p-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                  <input type="radio" name="mobileStacking" checked={(s.mobileStackOrder || 'rtl') === opt.value}
                    onChange={() => {
                      onStyleChange('mobileStackOrder', opt.value)
                      onStyleChange('stackOnMobile', opt.value !== 'none')
                    }}
                    className="w-4 h-4 text-zinc-700 border-gray-300 focus:ring-zinc-500" />
                  <span className="text-lg leading-none">{opt.icon}</span>
                  <span className="text-xs text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Column Layout */}
          <div className="py-2">
            <label className="block text-[12px] font-medium text-gray-700 mb-2">Layout das colunas</label>
            <div className="grid grid-cols-3 gap-1.5">
              {SECTION_LAYOUTS.map((layout, i) => {
                const isActive = section.columns.length === layout.columns.length &&
                  section.columns.every((c, j) => Math.abs(c.width - layout.columns[j]) < 5)
                return (
                  <button key={i} onClick={() => onColumnLayoutChange(layout.columns)}
                    className={`p-2.5 border rounded-lg text-center transition-all ${
                      isActive ? 'border-zinc-900 bg-zinc-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                    <div className="flex gap-0.5 justify-center mb-1">
                      {layout.columns.map((w, j) => (
                        <div key={j} className={`h-4 rounded-sm ${isActive ? 'bg-zinc-900' : 'bg-gray-300'}`}
                          style={{ width: `${Math.max(w * 0.28, 6)}px` }} />
                      ))}
                    </div>
                    <span className="text-[9px] text-gray-500">{layout.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'display' && (
        <div className="space-y-4">
          {/* Visibilidade por dispositivo */}
          <div>
            <p className="text-[12px] font-medium text-gray-700 mb-2">Visibilidade por dispositivo</p>
            <div className="space-y-2">
              <label className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                <span className="text-xs text-gray-700">Mostrar no Desktop</span>
                <div className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${(s as any).showOnDesktop !== false ? 'bg-zinc-900' : 'bg-gray-200'}`}
                  onClick={() => onStyleChange('showOnDesktop', (s as any).showOnDesktop === false)}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${(s as any).showOnDesktop !== false ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </label>
              <label className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                <span className="text-xs text-gray-700">Mostrar no Mobile</span>
                <div className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${(s as any).showOnMobile !== false ? 'bg-zinc-900' : 'bg-gray-200'}`}
                  onClick={() => onStyleChange('showOnMobile', (s as any).showOnMobile === false)}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${(s as any).showOnMobile !== false ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </label>
            </div>
          </div>

          {/* Ocultar seção do email */}
          <div>
            <label className="flex items-center justify-between p-2.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
              <span className="text-xs text-gray-700">Ocultar seção do email</span>
              <div className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${(s as any).hidden ? 'bg-zinc-900' : 'bg-gray-200'}`}
                onClick={() => onStyleChange('hidden', !(s as any).hidden)}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${(s as any).hidden ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
            </label>
            {(s as any).hidden && (
              <p className="text-[10px] text-zinc-400 mt-1 px-1">Esta seção nao aparecera no email enviado.</p>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
