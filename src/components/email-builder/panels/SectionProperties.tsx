'use client'

import { useState } from 'react'
import { Monitor, Smartphone, Eye, ChevronDown, Plus } from 'lucide-react'
import type { EmailSection } from '../config/types'
import { SECTION_LAYOUTS } from '../config/types'
import {
  ColorField, PaddingField, ToggleField,
} from './fields'

interface SectionPropertiesProps {
  section: EmailSection
  onStyleChange: (key: string, value: any) => void
  onColumnLayoutChange: (columns: number[]) => void
}

export function SectionProperties({ section, onStyleChange, onColumnLayoutChange }: SectionPropertiesProps) {
  const [tab, setTab] = useState<'styles' | 'display'>('styles')
  const s = section.styles

  return (
    <div className="space-y-0">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-3">
        <button onClick={() => setTab('styles')}
          className={`flex-1 py-2 text-[11px] font-semibold transition-colors ${tab === 'styles' ? 'text-brand-600 border-b-2 border-brand-500 -mb-px' : 'text-gray-400'}`}>
          Estilos
        </button>
        <button onClick={() => setTab('display')}
          className={`flex-1 py-2 text-[11px] font-semibold transition-colors ${tab === 'display' ? 'text-brand-600 border-b-2 border-brand-500 -mb-px' : 'text-gray-400'}`}>
          Exibição
        </button>
      </div>

      {tab === 'styles' && (
        <div className="space-y-4">
          {/* Background */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Background</p>
            <ColorField label="Cor de fundo" value={s.backgroundColor || ''} onChange={v => onStyleChange('backgroundColor', v)} />
          </div>

          {/* Padding */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Padding</p>
            <PaddingField value={s.padding} onChange={v => onStyleChange('padding', v)} />
          </div>

          {/* Column Layout */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Colunas</p>
            <div className="grid grid-cols-3 gap-1.5">
              {SECTION_LAYOUTS.slice(0, 5).map((layout, i) => {
                const isActive = section.columns.length === layout.columns.length &&
                  section.columns.every((c, j) => Math.abs(c.width - layout.columns[j]) < 5)
                return (
                  <button key={i} onClick={() => onColumnLayoutChange(layout.columns)}
                    className={`p-2 border rounded-md text-center transition-colors ${
                      isActive ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    <div className="flex gap-0.5 justify-center mb-1">
                      {layout.columns.map((w, j) => (
                        <div key={j} className={`h-3 rounded-sm ${isActive ? 'bg-brand-400' : 'bg-gray-300'}`}
                          style={{ width: `${w * 0.3}px` }} />
                      ))}
                    </div>
                    <span className="text-[9px]">{layout.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Mobile */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Mobile</p>
            <ToggleField label="Empilhar no mobile" description="Colunas empilham verticalmente no celular"
              value={s.stackOnMobile} onChange={v => onStyleChange('stackOnMobile', v)} />
          </div>

          {/* Label */}
          {section.label !== undefined && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Identificação</p>
              <p className="text-xs text-gray-500">{section.label || 'Seção sem nome'}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'display' && (
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Visibilidade</p>
            <div className="space-y-2">
              <ToggleField label="Desktop" value={true} onChange={() => {}} />
              <ToggleField label="Mobile" value={true} onChange={() => {}} />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Lógica Condicional</p>
            <p className="text-xs text-gray-500 mb-2">Personalize exibição baseado em dados do contato.</p>
            <button className="w-full py-2 text-xs font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 transition-colors">
              <Plus className="w-3.5 h-3.5 inline mr-1" /> Adicionar condição
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
