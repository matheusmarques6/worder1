'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import type { EmailBlock } from '../config/types'
import { ViewFeedsModal, CreateFeedModal } from '../modals/ProductFeedModal'
import { BrowseProductsModal, StaticProductsEditor } from '../modals/BrowseProductsModal'
import { MediaLibraryModal } from '@/components/shared/MediaLibraryModal'
import { ColorPicker } from '../ui/ColorPicker'

const RichTextEditor = dynamic(() => import('../blocks/RichTextEditor').then(m => ({ default: m.RichTextEditor })), { ssr: false, loading: () => <div className="h-20 bg-gray-50 rounded-lg animate-pulse" /> })

interface BlockPropertiesProps {
  block: EmailBlock
  onChange: (key: string, value: any) => void
  onSaveAsReusable?: () => void
  selectedSubElement?: string | null
  onSelectSubElement?: (subEl: string | null) => void
}

/* ─── Reusable Field Components ─── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:border-zinc-900 focus:outline-none" />
  )
}

function NumberInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input type="number" value={value ?? 0} onChange={e => onChange(Number(e.target.value))} min={min} max={max}
      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:border-zinc-900 focus:outline-none" />
  )
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <ColorPicker value={value || '#000000'} onChange={onChange} />
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-300 text-zinc-700 focus:ring-zinc-500" />
      <span className="text-xs text-gray-700">{label}</span>
    </label>
  )
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 bg-white focus:border-zinc-900 focus:outline-none">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function PaddingInput({ value, onChange }: { value: { top: number; right: number; bottom: number; left: number }; onChange: (v: { top: number; right: number; bottom: number; left: number }) => void }) {
  const pad = value || { top: 0, right: 0, bottom: 0, left: 0 }
  const set = (side: string, v: number) => onChange({ ...pad, [side]: v })
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {(['top', 'right', 'bottom', 'left'] as const).map(side => (
        <div key={side}>
          <span className="block text-[9px] text-gray-400 text-center mb-0.5">
            {side === 'top' ? 'Cima' : side === 'right' ? 'Dir' : side === 'bottom' ? 'Baixo' : 'Esq'}
          </span>
          <input type="number" value={pad[side] ?? 0} onChange={e => set(side, Number(e.target.value))} min={0} max={100}
            className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs text-center text-gray-900 focus:border-zinc-900 focus:outline-none" />
        </div>
      ))}
    </div>
  )
}

function TextStyleSection({ fontSize, color, fontWeight, align, onChange }: {
  fontSize: number; color: string; fontWeight?: string; align?: string;
  onChange: (key: string, value: any) => void
}) {
  return (
    <div className="space-y-2 p-2 bg-gray-50 rounded-md">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tamanho">
          <NumberInput value={fontSize} onChange={v => onChange('fontSize', v)} min={8} max={72} />
        </Field>
        <Field label="Cor do Texto">
          <ColorInput value={color} onChange={v => onChange('color', v)} />
        </Field>
      </div>
      {fontWeight !== undefined && (
        <Field label="Peso da Fonte">
          <SelectInput value={fontWeight} onChange={v => onChange('fontWeight', v)} options={[
            { value: 'normal', label: 'Normal' }, { value: 'bold', label: 'Negrito' },
            { value: '300', label: 'Leve' }, { value: '500', label: 'Médio' }, { value: '600', label: 'Semibold' }, { value: '700', label: 'Bold' },
          ]} />
        </Field>
      )}
      {align !== undefined && (
        <Field label="Alinhamento">
          <div className="flex gap-1">
            {[
              { v: 'left', label: '◀' },
              { v: 'center', label: '◆' },
              { v: 'right', label: '▶' },
            ].map(a => (
              <button key={a.v} onClick={() => onChange('align', a.v)}
                className={`flex-1 py-1 text-xs rounded border ${align === a.v ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                {a.v === 'left' ? 'Esquerda' : a.v === 'center' ? 'Centro' : 'Direita'}
              </button>
            ))}
          </div>
        </Field>
      )}
    </div>
  )
}

/* ─── Align Options ─── */

const ALIGN_OPTIONS = [
  { value: 'left', label: 'Esquerda' },
  { value: 'center', label: 'Centro' },
  { value: 'right', label: 'Direita' },
]

/* ─── Main Component ─── */

export function BlockProperties({ block, onChange, onSaveAsReusable, selectedSubElement, onSelectSubElement }: BlockPropertiesProps) {
  const p = block.props
  const [showConditions, setShowConditions] = useState(!!p._condition_enabled)
  const [showMediaLib, setShowMediaLib] = useState(false)
  // IMPORTANT: hooks must always be called unconditionally at the top of the
  // component — moving this into a switch case caused React error #300
  // (rendered fewer/more hooks than expected) every time the user switched
  // between block types, which crashed the editor.
  const [imgTab, setImgTab] = useState<'styles' | 'display'>('styles')

  /* ── Common Tail Sections ── */

  const paddingEditor = p.padding !== undefined && (
    <Field label="Padding (px)">
      <PaddingInput value={p.padding} onChange={v => onChange('padding', v)} />
    </Field>
  )

  const bgColorEditor = (key = 'backgroundColor') =>
    p[key] !== undefined ? (
      <Field label="Cor de Fundo">
        <ColorInput value={p[key] || ''} onChange={v => onChange(key, v)} />
      </Field>
    ) : null

  const conditionalSection = (
    <div className="border-t border-gray-100 pt-3 mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-400 uppercase">Visibilidade Condicional</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={showConditions} onChange={e => {
            setShowConditions(e.target.checked)
            onChange('_condition_enabled', e.target.checked)
            if (!e.target.checked) { onChange('_condition_field', ''); onChange('_condition_op', ''); onChange('_condition_value', '') }
          }} className="sr-only peer" />
          <div className="w-8 h-4 bg-gray-200 peer-checked:bg-zinc-900 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4" />
        </label>
      </div>
      {showConditions && (
        <div className="space-y-2 p-2 bg-gray-50 rounded-md">
          <SelectInput value={p._condition_field || ''} onChange={v => onChange('_condition_field', v)} options={[
            { value: '', label: 'Selecionar campo...' },
            { value: 'first_name', label: 'Nome' }, { value: 'last_name', label: 'Sobrenome' },
            { value: 'email', label: 'Email' }, { value: 'phone', label: 'Telefone' },
            { value: 'tags', label: 'Tags' }, { value: 'city', label: 'Cidade' },
            { value: 'state', label: 'Estado' }, { value: 'country', label: 'Pais' },
            { value: 'company', label: 'Empresa' }, { value: 'gender', label: 'Genero' },
            { value: 'total_orders', label: 'Total Pedidos' },
            { value: 'total_spent', label: 'Total Gasto' },
            { value: 'source', label: 'Origem' },
          ]} />
          <SelectInput value={p._condition_op || ''} onChange={v => onChange('_condition_op', v)} options={[
            { value: '', label: 'Operador...' },
            { value: 'equals', label: 'E igual a' }, { value: 'not_equals', label: 'Nao e igual a' },
            { value: 'contains', label: 'Contem' }, { value: 'not_contains', label: 'Nao contem' },
            { value: 'greater_than', label: 'Maior que' }, { value: 'less_than', label: 'Menor que' },
            { value: 'is_set', label: 'Esta preenchido' }, { value: 'is_not_set', label: 'Esta vazio' },
            { value: 'starts_with', label: 'Comeca com' }, { value: 'ends_with', label: 'Termina com' },
          ]} />
          {!['is_set', 'is_not_set'].includes(p._condition_op || '') && (
            <TextInput value={p._condition_value || ''} onChange={v => onChange('_condition_value', v)} placeholder="Valor" />
          )}
        </div>
      )}
    </div>
  )

  const saveButton = onSaveAsReusable ? (
    <div className="border-t border-gray-100 pt-3 mt-3">
      <button onClick={onSaveAsReusable}
        className="w-full py-2 text-xs font-medium text-zinc-900 bg-zinc-50 rounded-lg hover:bg-zinc-100 transition-colors">
        Salvar como reutilizável
      </button>
    </div>
  ) : null

  const commonTail = (hasBg = true) => (
    <>
      {paddingEditor}
      {hasBg && bgColorEditor()}
      {conditionalSection}
      {saveButton}
    </>
  )

  /* ── Block-specific editors ── */

  switch (block.type) {
    case 'text':
      return (
        <div className="space-y-3">
          <Field label="Conteúdo">
            <RichTextEditor
              content={p.contentHtml || p.content || '<p>Escreva seu texto aqui.</p>'}
              onChange={(html) => { onChange('contentHtml', html); onChange('content', html) }}
            />
          </Field>
          <TextStyleSection fontSize={p.fontSize} color={p.color} fontWeight={undefined} align={p.align} onChange={onChange} />
          <Field label="Altura da Linha">
            <NumberInput value={p.lineHeight} onChange={v => onChange('lineHeight', v)} min={1} max={3} />
          </Field>
          {commonTail()}
        </div>
      )

    case 'image': {
      return (
        <div className="space-y-0">
          {/* Tabs: Styles | Display */}
          <div className="flex border-b border-gray-200 mb-4">
            <button onClick={() => setImgTab('styles')} className={`flex-1 py-2.5 text-xs font-semibold ${imgTab === 'styles' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400'}`}>Estilos</button>
            <button onClick={() => setImgTab('display')} className={`flex-1 py-2.5 text-xs font-semibold ${imgTab === 'display' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400'}`}>Exibição</button>
          </div>

          {imgTab === 'styles' ? (
            <div className="space-y-4">
              {/* Image upload */}
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1">Imagem</p>
                <p className="text-[10px] text-gray-400 mb-2">Enviar uma imagem</p>
                {showMediaLib && <MediaLibraryModal onSelect={(url) => { onChange('src', url); setShowMediaLib(false) }} onClose={() => setShowMediaLib(false)} />}
                {p.src ? (
                  <div className="space-y-2">
                    <img src={p.src} alt={p.alt || ''} className="w-full h-32 object-contain bg-gray-50 rounded-lg border border-gray-200" />
                    <div className="flex gap-2">
                      <button onClick={() => setShowMediaLib(true)} className="flex-1 py-2 text-xs font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800">Biblioteca</button>
                      <button onClick={() => onChange('src', '')} className="flex-1 py-2 text-xs font-medium text-red-600 bg-white border border-gray-200 rounded-lg hover:bg-red-50">Remover</button>
                    </div>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center bg-gray-50 hover:border-gray-400 transition-colors"
                    onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-zinc-400', 'bg-zinc-50') }}
                    onDragLeave={e => { e.currentTarget.classList.remove('border-zinc-400', 'bg-zinc-50') }}
                    onDrop={async e => { e.preventDefault(); e.currentTarget.classList.remove('border-zinc-400', 'bg-zinc-50'); const f = e.dataTransfer.files[0]; if (!f) return; const form = new FormData(); form.append('file', f); try { const res = await fetch('/api/content/media', { method: 'POST', body: form }); const data = await res.json(); if (data.url) onChange('src', data.url) } catch { alert('Erro') } }}
                  >
                    <p className="text-sm font-medium text-gray-600 mb-1">Arraste e solte ou selecione</p>
                    <p className="text-[10px] text-gray-400 mb-3">Aceita .png, .jpg, .jpeg, .gif, .webp<br/>Tamanho maximo: 10 MB</p>
                    <div className="flex justify-center gap-2">
                      <button onClick={() => setShowMediaLib(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800">
                        Biblioteca
                      </button>
                      <label className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                        Upload
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return
                          const form = new FormData(); form.append('file', file)
                          try { const res = await fetch('/api/content/media', { method: 'POST', body: form }); const data = await res.json(); if (data.url) onChange('src', data.url) } catch { alert('Erro') }
                        }} />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-4">
                <Field label="URL da Imagem"><TextInput value={p.src} onChange={v => onChange('src', v)} placeholder="https://..." /></Field>
              </div>
              <Field label="Texto Alt"><TextInput value={p.alt} onChange={v => onChange('alt', v)} placeholder="Descrição da imagem" /></Field>
              <Field label="Link"><TextInput value={p.href} onChange={v => onChange('href', v)} placeholder="https:// ou {{merge_tag}}" /></Field>

              {/* Image layout */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-700 mb-3">Layout da imagem</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <span className="text-[10px] text-gray-400">L</span>
                    <div className="flex items-center gap-1">
                      {/* type="number" rejects non-numeric values like "auto" and logs
                          "The specified value 'auto' cannot be parsed…". Keep the value
                          numeric (empty when undefined) and let placeholder hint "auto". */}
                      <input type="number" value={p.width ?? ''} onChange={e => onChange('width', e.target.value === '' ? undefined : Number(e.target.value))} placeholder="auto" min={50} max={600}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-xs text-gray-900 focus:border-zinc-900 focus:outline-none" />
                      <span className="text-[10px] text-gray-400">px</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400">A</span>
                    <div className="flex items-center gap-1">
                      <input type="number" value={p.height ?? ''} onChange={e => onChange('height', e.target.value === '' ? undefined : Number(e.target.value))} placeholder="auto" min={20} max={800}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-xs text-gray-900 focus:border-zinc-900 focus:outline-none" />
                      <span className="text-[10px] text-gray-400">px</span>
                    </div>
                  </div>
                </div>
                {/* Alignment */}
                <div className="flex border border-gray-200 rounded-lg overflow-hidden mb-3">
                  {[{ v: 'left', label: '◀' }, { v: 'center', label: '◆' }, { v: 'right', label: '▶' }].map(a => (
                    <button key={a.v} onClick={() => onChange('align', a.v)}
                      className={`flex-1 py-2 text-xs ${p.align === a.v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                      {a.v === 'left' ? 'Esquerda' : a.v === 'center' ? 'Centro' : 'Direita'}
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-700">Preencher coluna</span>
                    <div className={`relative w-9 h-5 rounded-full cursor-pointer transition-colors ${p.fillColumn ? 'bg-zinc-900' : 'bg-gray-200'}`} onClick={() => onChange('fillColumn', !p.fillColumn)}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${p.fillColumn ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-700">Largura total no mobile</span>
                    <div className={`relative w-9 h-5 rounded-full cursor-pointer transition-colors ${p.fullWidthMobile !== false ? 'bg-zinc-900' : 'bg-gray-200'}`} onClick={() => onChange('fullWidthMobile', p.fullWidthMobile === false)}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${p.fullWidthMobile !== false ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Image area padding */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-700 mb-2">Padding da área da imagem</p>
                <PaddingInput value={p.padding} onChange={v => onChange('padding', v)} />
              </div>

              {/* Image area background color */}
              <div className="border-t border-gray-100 pt-3">
                <details className="group">
                  <summary className="flex items-center justify-between cursor-pointer text-xs font-semibold text-gray-700 hover:text-gray-900">
                    Cor de fundo da área <span className="text-gray-300 text-lg">+</span>
                  </summary>
                  <div className="mt-2">
                    <ColorInput value={p.backgroundColor || ''} onChange={v => onChange('backgroundColor', v)} />
                  </div>
                </details>
              </div>

              {/* Image area border */}
              <div className="border-t border-gray-100 pt-3">
                <details className="group">
                  <summary className="flex items-center justify-between cursor-pointer text-xs font-semibold text-gray-700 hover:text-gray-900">
                    Borda da imagem <span className="text-gray-300 text-lg">+</span>
                  </summary>
                  <div className="mt-2 space-y-2">
                    <Field label="Largura"><NumberInput value={p.border?.width || 0} onChange={v => onChange('border', { ...(p.border || {}), width: v })} min={0} max={10} /></Field>
                    <Field label="Cor"><ColorInput value={p.border?.color || '#E5E7EB'} onChange={v => onChange('border', { ...(p.border || {}), color: v })} /></Field>
                    <Field label="Raio"><NumberInput value={p.borderRadius} onChange={v => onChange('borderRadius', v)} min={0} max={100} /></Field>
                  </div>
                </details>
              </div>

              {/* Block background color */}
              <div className="border-t border-gray-100 pt-3">
                <details className="group">
                  <summary className="flex items-center justify-between cursor-pointer text-xs font-semibold text-gray-700 hover:text-gray-900">
                    Cor de fundo do bloco <span className="text-gray-300 text-lg">+</span>
                  </summary>
                  <div className="mt-2">
                    <ColorInput value={p.blockBgColor || ''} onChange={v => onChange('blockBgColor', v)} />
                  </div>
                </details>
              </div>

              {/* Block padding */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-700 mb-2">Padding do bloco</p>
                <PaddingInput value={p.blockPadding || { top: 0, right: 0, bottom: 0, left: 0 }} onChange={v => onChange('blockPadding', v)} />
              </div>

              {conditionalSection}
              {saveButton}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Visibility */}
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Visibilidade</p>
                <div className="space-y-1">
                  {[
                    { v: 'all', label: 'Todos dispositivos', icon: '🖥📱' },
                    { v: 'desktop', label: 'Apenas desktop', icon: '🖥' },
                    { v: 'mobile', label: 'Apenas mobile', icon: '📱' },
                  ].map(opt => (
                    <label key={opt.v} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${(p.visibility || 'all') === opt.v ? 'border-zinc-900 bg-zinc-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input type="radio" name={`vis-${block.id}`} checked={(p.visibility || 'all') === opt.v}
                        onChange={() => onChange('visibility', opt.v)} className="w-4 h-4 text-zinc-700" />
                      <span className="text-xs text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Show/hide logic */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-700 mb-1">Lógica mostrar/ocultar</p>
                <p className="text-[10px] text-gray-400 mb-3">Personalize o email mostrando ou ocultando conteúdo baseado nas propriedades ou eventos do contato.</p>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 text-[11px] font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                    Usar construtor
                  </button>
                  <button className="px-3 py-1.5 text-[11px] font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                    Usar código
                  </button>
                </div>
              </div>

              {/* Content repeat */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-700 mb-1">Repetição de conteúdo</p>
                <p className="text-[10px] text-gray-400 mb-3">Para repetir este conteúdo, especifique uma variável para iterar e um alias para usar no template.</p>
                <button className="px-3 py-1.5 text-[11px] font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                  Adicionar repetição
                </button>
              </div>
            </div>
          )}
        </div>
      )
    }

    case 'button':
      return (
        <div className="space-y-3">
          <Field label="Texto"><TextInput value={p.text} onChange={v => onChange('text', v)} /></Field>
          <Field label="Link"><TextInput value={p.href} onChange={v => onChange('href', v)} placeholder="https://..." /></Field>
          <Field label="Cor de Fundo do Botão"><ColorInput value={p.bgColor} onChange={v => onChange('bgColor', v)} /></Field>
          <Field label="Cor do Texto"><ColorInput value={p.textColor} onChange={v => onChange('textColor', v)} /></Field>
          <Field label="Tamanho da Fonte"><NumberInput value={p.fontSize} onChange={v => onChange('fontSize', v)} min={10} max={30} /></Field>
          <Field label="Peso da Fonte">
            <SelectInput value={p.fontWeight} onChange={v => onChange('fontWeight', v)} options={[
              { value: 'normal', label: 'Normal' }, { value: 'bold', label: 'Negrito' },
              { value: '300', label: 'Leve' }, { value: '500', label: 'Médio' }, { value: '600', label: 'Semibold' }, { value: '700', label: 'Bold' },
            ]} />
          </Field>
          <Field label="Border Radius"><NumberInput value={p.borderRadius} onChange={v => onChange('borderRadius', v)} min={0} max={50} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Padding H"><NumberInput value={p.paddingH} onChange={v => onChange('paddingH', v)} min={0} max={60} /></Field>
            <Field label="Padding V"><NumberInput value={p.paddingV} onChange={v => onChange('paddingV', v)} min={0} max={40} /></Field>
          </div>
          <Toggle value={p.fullWidth} onChange={v => onChange('fullWidth', v)} label="Largura total" />
          <Field label="Alinhamento"><SelectInput value={p.align} onChange={v => onChange('align', v)} options={ALIGN_OPTIONS} /></Field>
          {/* Border */}
          <div className="border border-gray-100 rounded-lg">
            <details className="group">
              <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
                Borda <span className="text-gray-300 group-open:rotate-90 transition-transform">▸</span>
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <Field label="Largura"><NumberInput value={p.borderWidth || 0} onChange={v => onChange('borderWidth', v)} min={0} max={10} /></Field>
                <Field label="Cor"><ColorInput value={p.borderColor || '#E5E7EB'} onChange={v => onChange('borderColor', v)} /></Field>
              </div>
            </details>
          </div>
          {/* Shadow */}
          <div className="border border-gray-100 rounded-lg">
            <details className="group">
              <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
                Sombra <span className="text-gray-300 group-open:rotate-90 transition-transform">▸</span>
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <Toggle value={p.shadow?.enabled || false} onChange={v => onChange('shadow', { ...(p.shadow || {}), enabled: v })} label="Ativar sombra" />
              </div>
            </details>
          </div>
          {commonTail()}
        </div>
      )

    case 'divider':
      return (
        <div className="space-y-3">
          <Field label="Cor"><ColorInput value={p.color} onChange={v => onChange('color', v)} /></Field>
          <Field label="Espessura (px)"><NumberInput value={p.thickness} onChange={v => onChange('thickness', v)} min={1} max={10} /></Field>
          <Field label="Estilo">
            <SelectInput value={p.style} onChange={v => onChange('style', v)} options={[
              { value: 'solid', label: 'Sólido' }, { value: 'dashed', label: 'Tracejado' }, { value: 'dotted', label: 'Pontilhado' },
            ]} />
          </Field>
          <Field label="Largura (%)"><NumberInput value={p.width ?? 100} onChange={v => onChange('width', v)} min={10} max={100} /></Field>
          <Field label="Alinhamento"><SelectInput value={p.align || 'center'} onChange={v => onChange('align', v)} options={ALIGN_OPTIONS} /></Field>
          {commonTail(false)}
        </div>
      )

    case 'spacer':
      return (
        <div className="space-y-3">
          <Field label="Altura (px)">
            <div className="space-y-1">
              <NumberInput value={p.height} onChange={v => onChange('height', v)} min={8} max={200} />
              <input type="range" min={8} max={200} value={p.height || 32} onChange={e => onChange('height', Number(e.target.value))}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-zinc-900" />
            </div>
          </Field>
          {bgColorEditor()}
          {conditionalSection}
          {saveButton}
        </div>
      )

    case 'columns':
      return (
        <div className="space-y-3">
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500 mb-1">As colunas são containers. Arraste blocos da paleta para dentro de cada coluna no canvas.</p>
            <p className="text-[10px] text-gray-400">Dica: Use layouts de seção para criar estruturas multi-coluna.</p>
          </div>
          <Field label="Colunas">
            <SelectInput value={String(p.columns)} onChange={v => onChange('columns', Number(v))} options={[
              { value: '2', label: '2 Colunas' }, { value: '3', label: '3 Colunas' },
            ]} />
          </Field>
          <Field label="Gap (px)"><NumberInput value={p.gap} onChange={v => onChange('gap', v)} min={0} max={40} /></Field>
          {commonTail(false)}
        </div>
      )

    case 'html':
      return (
        <div className="space-y-3">
          <Field label="Código HTML">
            <textarea value={p.code || ''} onChange={e => onChange('code', e.target.value)} rows={8}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs font-mono text-gray-900 focus:border-zinc-900 focus:outline-none resize-y" />
          </Field>
          {commonTail(false)}
        </div>
      )

    case 'video':
      return (
        <div className="space-y-3">
          <Field label="URL do Vídeo"><TextInput value={p.videoUrl} onChange={v => onChange('videoUrl', v)} placeholder="https://youtube.com/..." /></Field>
          <Field label="URL da Thumbnail">
            <TextInput value={p.thumbnailUrl} onChange={v => onChange('thumbnailUrl', v)} placeholder="https://..." />
          </Field>
          {!p.thumbnailUrl && (
            <label className="block border-2 border-dashed border-gray-200 rounded-lg p-4 text-center bg-gray-50 hover:border-zinc-400 cursor-pointer">
              <span className="text-xs text-gray-500">Upload thumbnail</span>
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return
                const form = new FormData(); form.append('file', file)
                try {
                  const res = await fetch('/api/images/upload', { method: 'POST', body: form })
                  const data = await res.json()
                  if (data.url) onChange('thumbnailUrl', data.url)
                } catch { alert('Erro no upload') }
              }} />
            </label>
          )}
          <Field label="Texto do Botão Play"><TextInput value={p.playText || ''} onChange={v => onChange('playText', v)} placeholder="Assistir agora" /></Field>
          <Field label="Raio da Borda"><NumberInput value={p.borderRadius ?? 4} onChange={v => onChange('borderRadius', v)} min={0} max={32} /></Field>
          {commonTail(false)}
        </div>
      )

    case 'social':
      return (
        <div className="space-y-3">
          <span className="text-[10px] font-semibold text-gray-400 uppercase">Redes Sociais</span>
          {(p.networks || []).map((net: { type: string; url: string; enabled?: boolean }, i: number) => (
            <div key={i} className="flex gap-2 items-center">
              <button type="button" onClick={() => {
                const updated = [...p.networks]
                updated[i] = { ...updated[i], enabled: !net.enabled }
                onChange('networks', updated)
              }} className={`relative w-8 h-[18px] rounded-full flex-shrink-0 transition-colors ${net.enabled !== false ? 'bg-zinc-900' : 'bg-gray-200'}`}>
                <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${net.enabled !== false ? 'left-[16px]' : 'left-[2px]'}`} />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-gray-700 w-20 capitalize">{net.type}</span>
                  {net.enabled !== false && (
                    <input type="text" value={net.url || ''} onChange={e => {
                      const updated = [...p.networks]
                      updated[i] = { ...updated[i], url: e.target.value }
                      onChange('networks', updated)
                    }} placeholder="URL"
                      className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 focus:border-zinc-900 focus:outline-none" />
                  )}
                </div>
              </div>
            </div>
          ))}
          <Field label="Tamanho dos Ícones"><NumberInput value={p.iconSize} onChange={v => onChange('iconSize', v)} min={16} max={64} /></Field>
          <Field label="Espaçamento"><NumberInput value={p.spacing} onChange={v => onChange('spacing', v)} min={0} max={40} /></Field>
          <Field label="Alinhamento"><SelectInput value={p.align} onChange={v => onChange('align', v)} options={ALIGN_OPTIONS} /></Field>
          <Field label="Estilo dos Ícones">
            <SelectInput value={p.iconStyle} onChange={v => onChange('iconStyle', v)} options={[
              { value: 'color', label: 'Colorido' }, { value: 'black', label: 'Preto' },
            ]} />
          </Field>
          {commonTail(false)}
        </div>
      )

    case 'header':
      return (
        <div className="space-y-3">
          {/* Logo */}
          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Logo</span>
          {p.logoSrc && !p.logoSrc.includes('placehold.co') ? (
            <div className="space-y-2">
              <div className="relative bg-zinc-50 border border-zinc-200 rounded-lg p-3 flex items-center justify-center min-h-[60px]">
                <img src={p.logoSrc} alt="Logo" style={{ maxWidth: p.logoWidth || 160, maxHeight: p.logoMaxHeight || 80, objectFit: 'contain' }} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowMediaLib(true)} className="flex-1 py-1.5 text-[12px] font-medium text-zinc-700 bg-white border border-zinc-200 rounded-md hover:bg-zinc-50 transition-colors">Trocar</button>
                <button onClick={() => onChange('logoSrc', '')} className="flex-1 py-1.5 text-[12px] font-medium text-red-600 bg-white border border-zinc-200 rounded-md hover:bg-red-50 transition-colors">Remover</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <button onClick={() => setShowMediaLib(true)}
                className="w-full border-2 border-dashed border-zinc-200 rounded-lg p-5 text-center bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-50/30 transition-all cursor-pointer">
                <svg className="w-6 h-6 text-zinc-300 mx-auto mb-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                <p className="text-[12px] font-medium text-zinc-600">Clique para fazer upload</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">ou arraste a imagem aqui</p>
                <p className="text-[10px] text-zinc-400 mt-1">PNG, JPG, SVG — Max 2MB</p>
              </button>
              <Field label="Ou inserir URL"><TextInput value={p.logoSrc || ''} onChange={v => onChange('logoSrc', v)} placeholder="https://..." /></Field>
            </div>
          )}
          {showMediaLib && <MediaLibraryModal onSelect={(url) => { onChange('logoSrc', url); setShowMediaLib(false) }} onClose={() => setShowMediaLib(false)} />}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Largura (px)"><NumberInput value={p.logoWidth || 160} onChange={v => onChange('logoWidth', v)} min={40} max={400} /></Field>
            <Field label="Altura max (px)"><NumberInput value={p.logoMaxHeight || 80} onChange={v => onChange('logoMaxHeight', v)} min={20} max={200} /></Field>
          </div>
          <Field label="Link do Logo"><TextInput value={p.logoHref || ''} onChange={v => onChange('logoHref', v)} placeholder="{{store_url}}" /></Field>
          {/* Links */}
          <Toggle value={p.showLinks} onChange={v => onChange('showLinks', v)} label="Mostrar links de navegação" />
          {p.showLinks && (
            <div className="space-y-2 p-2 bg-gray-50 rounded-md">
              <span className="text-[10px] font-semibold text-gray-400 uppercase">Links</span>
              {(p.links || []).map((link: { text: string; url: string }, i: number) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <div className="flex-1 grid grid-cols-2 gap-1.5">
                    <TextInput value={link.text} onChange={v => {
                      const updated = [...p.links]; updated[i] = { ...updated[i], text: v }; onChange('links', updated)
                    }} placeholder="Texto" />
                    <TextInput value={link.url} onChange={v => {
                      const updated = [...p.links]; updated[i] = { ...updated[i], url: v }; onChange('links', updated)
                    }} placeholder="URL" />
                  </div>
                  <button onClick={() => onChange('links', (p.links || []).filter((_: any, idx: number) => idx !== i))}
                    className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                </div>
              ))}
              <button onClick={() => onChange('links', [...(p.links || []), { text: '', url: '' }])}
                className="text-[10px] text-zinc-700 hover:text-zinc-900 font-medium">+ Adicionar link</button>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Field label="Cor dos Links"><ColorInput value={p.linkColor || '#6B7280'} onChange={v => onChange('linkColor', v)} /></Field>
                <Field label="Tamanho"><NumberInput value={p.linkFontSize || 13} onChange={v => onChange('linkFontSize', v)} min={10} max={18} /></Field>
              </div>
            </div>
          )}
          {commonTail()}
        </div>
      )

    case 'footer':
      return (
        <div className="space-y-3">
          <Field label="Nome da Empresa"><TextInput value={p.companyName} onChange={v => onChange('companyName', v)} /></Field>
          <Field label="Endereço"><TextInput value={p.address} onChange={v => onChange('address', v)} /></Field>
          <Toggle value={p.showUnsubscribe} onChange={v => onChange('showUnsubscribe', v)} label="Mostrar link de descadastro" />
          <Toggle value={p.showPreferences} onChange={v => onChange('showPreferences', v)} label="Mostrar preferências" />
          <Toggle value={p.showViewInBrowser} onChange={v => onChange('showViewInBrowser', v)} label="Mostrar 'ver no navegador'" />
          <details className="group border border-gray-100 rounded-lg" open>
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
              Tipografia <span className="text-gray-300 group-open:rotate-90 transition-transform">▸</span>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tamanho"><NumberInput value={p.fontSize} onChange={v => onChange('fontSize', v)} min={8} max={18} /></Field>
                <Field label="Cor do Texto"><ColorInput value={p.textColor} onChange={v => onChange('textColor', v)} /></Field>
              </div>
              <Field label="Cor dos Links"><ColorInput value={p.linkColor || p.textColor || '#9CA3AF'} onChange={v => onChange('linkColor', v)} /></Field>
              <Field label="Alinhamento"><SelectInput value={p.align || 'center'} onChange={v => onChange('align', v)} options={ALIGN_OPTIONS} /></Field>
            </div>
          </details>
          {commonTail()}
        </div>
      )

    case 'product-grid':
      return <ProductBlockProperties p={p} onChange={onChange} commonTail={commonTail} selectedSubElement={selectedSubElement} onSelectSubElement={onSelectSubElement} />

    case 'abandoned-cart':
      return (
        <div className="space-y-4">
          {/* Info banner */}
          <div className="flex gap-3 p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
            <div className="w-7 h-7 rounded-md bg-zinc-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3h-8l-2 4h12z"/></svg>
            </div>
            <div>
              <p className="text-[11px] text-zinc-600 leading-snug">Os produtos serao preenchidos automaticamente do carrinho. A quantidade de itens se adapta ao carrinho real do cliente.</p>
              <p className="text-[10px] text-zinc-400 mt-1">Clique nos elementos no canvas para editar individualmente.</p>
            </div>
          </div>

          {/* Layout Type */}
          <div>
            <p className="text-[12px] font-medium text-zinc-700 mb-2">Layout</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'image-left', icon: <><rect x="2" y="4" width="8" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/><line x1="13" y1="7" x2="22" y2="7" stroke="currentColor" strokeWidth="1.5"/><line x1="13" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.5"/><line x1="13" y1="17" x2="18" y2="17" stroke="currentColor" strokeWidth="1.5"/></> },
                { value: 'image-right', icon: <><rect x="14" y="4" width="8" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/><line x1="2" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.5"/><line x1="2" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.5"/><line x1="2" y1="17" x2="7" y2="17" stroke="currentColor" strokeWidth="1.5"/></> },
                { value: 'vertical', icon: <><rect x="5" y="2" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/><line x1="5" y1="15" x2="19" y2="15" stroke="currentColor" strokeWidth="1.5"/><line x1="5" y1="19" x2="15" y2="19" stroke="currentColor" strokeWidth="1.5"/></> },
              ].map(opt => (
                <button key={opt.value} onClick={() => onChange('layoutType', opt.value)}
                  className={`flex items-center justify-center p-3 border-2 rounded-lg transition-all ${(p.layoutType || 'image-left') === opt.value ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-300'}`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" className={`${(p.layoutType || 'image-left') === opt.value ? 'text-zinc-900' : 'text-zinc-400'}`}>{opt.icon}</svg>
                </button>
              ))}
            </div>
          </div>

          {/* Product details checkboxes */}
          <div>
            <p className="text-[12px] font-medium text-zinc-700 mb-2">Detalhes do produto</p>
            <div className="space-y-1.5">
              {[
                { key: 'showImage', label: 'Imagem' },
                { key: 'showName', label: 'Nome' },
                { key: 'showDescription', label: 'Descricao' },
                { key: 'showPrice', label: 'Preco' },
                { key: 'showOldPrice', label: 'Preco antigo' },
                { key: 'showButton', label: 'Botao' },
              ].map(item => (
                <label key={item.key} className="flex items-center gap-2.5 cursor-pointer py-0.5">
                  <input type="checkbox" checked={p[item.key] !== false} onChange={e => onChange(item.key, e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500" />
                  <span className="text-[13px] text-zinc-700">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Display options */}
          <details className="group border border-zinc-100 rounded-lg">
            <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer text-[12px] font-semibold text-zinc-800 hover:bg-zinc-50 rounded-lg transition-colors">
              Exibicao <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 group-open:rotate-180 transition-transform"><path d="M6 9l6 6 6-6"/></svg>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <Toggle value={p.showOutOfStock || false} onChange={v => onChange('showOutOfStock', v)} label="Mostrar itens fora de estoque" />
              <Toggle value={p.separator !== false} onChange={v => onChange('separator', v)} label="Separador entre produtos" />
              {p.separator !== false && (
                <Field label="Cor do separador"><ColorInput value={p.separatorColor || '#E5E7EB'} onChange={v => onChange('separatorColor', v)} /></Field>
              )}
            </div>
          </details>

          {/* Mobile stacking */}
          <details className="group border border-zinc-100 rounded-lg">
            <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer text-[12px] font-semibold text-zinc-800 hover:bg-zinc-50 rounded-lg transition-colors">
              Mobile <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 group-open:rotate-180 transition-transform"><path d="M6 9l6 6 6-6"/></svg>
            </summary>
            <div className="px-3 pb-3">
              <Toggle value={p.stackOnMobile !== false} onChange={v => onChange('stackOnMobile', v)} label="Empilhar no mobile" />
            </div>
          </details>

          {/* Visibility on devices */}
          <details className="group border border-zinc-100 rounded-lg">
            <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer text-[12px] font-semibold text-zinc-800 hover:bg-zinc-50 rounded-lg transition-colors">
              Visibilidade <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 group-open:rotate-180 transition-transform"><path d="M6 9l6 6 6-6"/></svg>
            </summary>
            <div className="px-3 pb-3">
              <p className="text-[11px] text-zinc-400 mb-2">Selecione em quais dispositivos exibir.</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'all', label: 'Todos' },
                  { value: 'mobile', label: 'Mobile' },
                  { value: 'desktop', label: 'Desktop' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => onChange('visibility', opt.value)}
                    className={`flex flex-col items-center gap-1 p-2.5 border-2 rounded-lg transition-all ${(p.visibility || 'all') === opt.value ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-300'}`}>
                    <span className={`text-[11px] font-medium ${(p.visibility || 'all') === opt.value ? 'text-zinc-900' : 'text-zinc-500'}`}>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </details>

          {commonTail()}
        </div>
      )

    case 'order-products':
      return (
        <div className="space-y-4">
          <div className="flex gap-3 p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
            <div className="w-7 h-7 rounded-md bg-zinc-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <div>
              <p className="text-[11px] text-zinc-600 leading-snug">Os dados serão preenchidos automaticamente a partir do pedido do cliente.</p>
            </div>
          </div>

          {/* Title */}
          <div>
            <Field label="Título">
              <TextInput value={p.titleText ?? 'Resumo do Pedido'} onChange={v => onChange('titleText', v)} placeholder="Resumo do Pedido" />
            </Field>
            <label className="flex items-center gap-2.5 cursor-pointer py-1 mt-1.5">
              <input type="checkbox" checked={p.showTitle !== false} onChange={e => onChange('showTitle', e.target.checked)}
                className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500" />
              <span className="text-[13px] text-zinc-700">Mostrar título</span>
            </label>
          </div>

          {/* Order details (number + date) */}
          <details className="group border border-zinc-100 rounded-lg" open>
            <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer text-[12px] font-semibold text-zinc-800 hover:bg-zinc-50 rounded-lg transition-colors">
              Detalhes do pedido <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 group-open:rotate-180 transition-transform"><path d="M6 9l6 6 6-6"/></svg>
            </summary>
            <div className="px-3 pb-3 space-y-1.5">
              {[
                { key: 'showOrderNumber', label: 'Número do pedido' },
                { key: 'showOrderDate', label: 'Data' },
              ].map(item => (
                <label key={item.key} className="flex items-center gap-2.5 cursor-pointer py-0.5">
                  <input type="checkbox" checked={p[item.key] !== false} onChange={e => onChange(item.key, e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500" />
                  <span className="text-[13px] text-zinc-700">{item.label}</span>
                </label>
              ))}
            </div>
          </details>

          <div>
            <p className="text-[12px] font-medium text-zinc-700 mb-2">Produto</p>
            <div className="space-y-1.5">
              {[
                { key: 'showImage', label: 'Imagem' },
                { key: 'showName', label: 'Nome' },
                { key: 'showQuantity', label: 'Quantidade' },
                { key: 'showVariant', label: 'Variante' },
                { key: 'showSku', label: 'SKU' },
                { key: 'showPrice', label: 'Preço' },
                { key: 'showDiscount', label: 'Desconto' },
              ].map(item => (
                <label key={item.key} className="flex items-center gap-2.5 cursor-pointer py-0.5">
                  <input type="checkbox" checked={p[item.key] !== false} onChange={e => onChange(item.key, e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500" />
                  <span className="text-[13px] text-zinc-700">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <details className="group border border-zinc-100 rounded-lg" open>
            <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer text-[12px] font-semibold text-zinc-800 hover:bg-zinc-50 rounded-lg transition-colors">
              Cores <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 group-open:rotate-180 transition-transform"><path d="M6 9l6 6 6-6"/></svg>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <Field label="Cor do título"><ColorInput value={p.titleColor || '#000000'} onChange={v => onChange('titleColor', v)} /></Field>
              <Field label="Cor dos detalhes do pedido"><ColorInput value={p.metaColor || '#AFAFAF'} onChange={v => onChange('metaColor', v)} /></Field>
              <Field label="Cor primária do texto"><ColorInput value={p.primaryTextColor || '#000000'} onChange={v => onChange('primaryTextColor', v)} /></Field>
              <Field label="Cor secundária do texto"><ColorInput value={p.secondaryTextColor || '#AFAFAF'} onChange={v => onChange('secondaryTextColor', v)} /></Field>
              <Field label="Cor do preço"><ColorInput value={p.priceTextColor || '#000000'} onChange={v => onChange('priceTextColor', v)} /></Field>
              <Field label="Cor do divisor"><ColorInput value={p.dividerColor || '#EDEDED'} onChange={v => onChange('dividerColor', v)} /></Field>
            </div>
          </details>

          <details className="group border border-zinc-100 rounded-lg">
            <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer text-[12px] font-semibold text-zinc-800 hover:bg-zinc-50 rounded-lg transition-colors">
              Totais <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 group-open:rotate-180 transition-transform"><path d="M6 9l6 6 6-6"/></svg>
            </summary>
            <div className="px-3 pb-3 space-y-1.5">
              {[
                { key: 'showTotals', label: 'Mostrar seção de totais' },
                { key: 'showTotalDiscount', label: 'Desconto' },
                { key: 'showSubtotal', label: 'Subtotal' },
                { key: 'showShipping', label: 'Frete' },
                { key: 'showTax', label: 'Taxa/Imposto' },
              ].map(item => (
                <label key={item.key} className="flex items-center gap-2.5 cursor-pointer py-0.5">
                  <input type="checkbox" checked={p[item.key] !== false} onChange={e => onChange(item.key, e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500" />
                  <span className="text-[13px] text-zinc-700">{item.label}</span>
                </label>
              ))}
              <Field label="Cor do total"><ColorInput value={p.totalTextColor || '#000000'} onChange={v => onChange('totalTextColor', v)} /></Field>
            </div>
          </details>

          <details className="group border border-zinc-100 rounded-lg">
            <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer text-[12px] font-semibold text-zinc-800 hover:bg-zinc-50 rounded-lg transition-colors">
              Imagem <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 group-open:rotate-180 transition-transform"><path d="M6 9l6 6 6-6"/></svg>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <Field label="Tamanho (px)"><NumberInput value={p.imageWidth || 80} onChange={v => onChange('imageWidth', v)} min={40} max={200} /></Field>
              <Field label="Arredondamento"><NumberInput value={p.imageBorderRadius ?? 4} onChange={v => onChange('imageBorderRadius', v)} min={0} max={40} /></Field>
            </div>
          </details>

          <details className="group border border-zinc-100 rounded-lg">
            <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer text-[12px] font-semibold text-zinc-800 hover:bg-zinc-50 rounded-lg transition-colors">
              Exibição <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 group-open:rotate-180 transition-transform"><path d="M6 9l6 6 6-6"/></svg>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <Toggle value={p.separator !== false} onChange={v => onChange('separator', v)} label="Separador entre produtos" />
              {p.separator !== false && (
                <Field label="Cor do separador"><ColorInput value={p.separatorColor || '#EDEDED'} onChange={v => onChange('separatorColor', v)} /></Field>
              )}
            </div>
          </details>

          {commonTail()}
        </div>
      )

    case 'coupon':
      return (
        <div className="space-y-4">
          {/* ── Textos principais ── */}
          <Field label="Texto acima do código">
            <TextInput value={p.headerText} onChange={v => onChange('headerText', v)} placeholder="Ex: Seu desconto especial:" />
          </Field>
          <Field label="Código do cupom">
            <TextInput value={p.code} onChange={v => onChange('code', v)} placeholder="DESCONTO20 ou {{coupon_code}}" />
          </Field>
          <Field label="Texto abaixo do código">
            <TextInput value={p.footerText} onChange={v => onChange('footerText', v)} placeholder="Ex: Válido até 30/04" />
          </Field>

          {/* ── Estilo do Código ── */}
          <div className="border border-gray-100 rounded-lg p-3 space-y-2.5 bg-gray-50/50">
            <span className="text-[10px] font-semibold text-gray-500 uppercase">Estilo do Código</span>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tamanho"><NumberInput value={p.codeFontSize || 32} onChange={v => onChange('codeFontSize', v)} min={16} max={64} /></Field>
              <Field label="Cor"><ColorInput value={p.codeColor || '#EA580C'} onChange={v => onChange('codeColor', v)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Borda">
                <SelectInput value={p.borderStyle || 'dashed'} onChange={v => onChange('borderStyle', v)} options={[
                  { value: 'dashed', label: 'Tracejado' }, { value: 'solid', label: 'Sólido' }, { value: 'dotted', label: 'Pontilhado' }, { value: 'none', label: 'Nenhuma' },
                ]} />
              </Field>
              <Field label="Cor Borda"><ColorInput value={p.borderColor || '#EA580C'} onChange={v => onChange('borderColor', v)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Arredondamento"><NumberInput value={p.borderRadius ?? 12} onChange={v => onChange('borderRadius', v)} min={0} max={32} /></Field>
              <Field label="Fundo"><ColorInput value={p.codeBgColor || ''} onChange={v => onChange('codeBgColor', v)} /></Field>
            </div>
          </div>

          {/* ── Texto Cabeçalho ── */}
          <details className="group border border-gray-100 rounded-lg">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
              Estilo do Cabeçalho <span className="text-gray-300 group-open:rotate-90 transition-transform">▸</span>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tamanho"><NumberInput value={p.headerFontSize || 14} onChange={v => onChange('headerFontSize', v)} min={10} max={28} /></Field>
                <Field label="Cor"><ColorInput value={p.headerColor || '#9A3412'} onChange={v => onChange('headerColor', v)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Peso">
                  <SelectInput value={p.headerFontWeight || '500'} onChange={v => onChange('headerFontWeight', v)} options={[
                    { value: 'normal', label: 'Normal' }, { value: '500', label: 'Médio' }, { value: 'bold', label: 'Negrito' },
                  ]} />
                </Field>
                <Field label="Alinhar">
                  <SelectInput value={p.headerAlign || 'center'} onChange={v => onChange('headerAlign', v)} options={ALIGN_OPTIONS} />
                </Field>
              </div>
            </div>
          </details>

          {/* ── Texto Rodapé ── */}
          <details className="group border border-gray-100 rounded-lg">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
              Estilo do Rodapé <span className="text-gray-300 group-open:rotate-90 transition-transform">▸</span>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tamanho"><NumberInput value={p.footerFontSize || 12} onChange={v => onChange('footerFontSize', v)} min={8} max={20} /></Field>
                <Field label="Cor"><ColorInput value={p.footerColor || '#9CA3AF'} onChange={v => onChange('footerColor', v)} /></Field>
              </div>
              <Field label="Peso">
                <SelectInput value={p.footerFontWeight || 'normal'} onChange={v => onChange('footerFontWeight', v)} options={[
                  { value: 'normal', label: 'Normal' }, { value: '500', label: 'Médio' }, { value: 'bold', label: 'Negrito' },
                ]} />
              </Field>
            </div>
          </details>

          {/* ── Avançado ── */}
          <details className="group border border-gray-100 rounded-lg">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
              Avançado <span className="text-gray-300 group-open:rotate-90 transition-transform">▸</span>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Peso Código">
                  <SelectInput value={p.codeFontWeight || 'bold'} onChange={v => onChange('codeFontWeight', v)} options={[
                    { value: 'normal', label: 'Normal' }, { value: 'bold', label: 'Negrito' }, { value: '900', label: 'Extra Bold' },
                  ]} />
                </Field>
                <Field label="Espaçamento"><NumberInput value={p.codeLetterSpacing ?? 4} onChange={v => onChange('codeLetterSpacing', v)} min={0} max={16} /></Field>
              </div>
              <Field label="Espessura Borda"><NumberInput value={p.borderWidth ?? 2} onChange={v => onChange('borderWidth', v)} min={0} max={6} /></Field>
              <Field label="Padding Código">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[9px] text-gray-400">Vertical</span>
                    <NumberInput value={p.codePaddingV ?? 10} onChange={v => onChange('codePaddingV', v)} min={0} max={40} />
                  </div>
                  <div>
                    <span className="text-[9px] text-gray-400">Horizontal</span>
                    <NumberInput value={p.codePaddingH ?? 28} onChange={v => onChange('codePaddingH', v)} min={0} max={60} />
                  </div>
                </div>
              </Field>
            </div>
          </details>
          {commonTail()}
        </div>
      )

    case 'split':
      return (
        <div className="space-y-3">
          <Field label="Layout">
            <div className="flex gap-1">
              {[
                { v: 'image-left', label: 'Imagem à Esquerda' },
                { v: 'image-right', label: 'Imagem à Direita' },
              ].map(opt => (
                <button key={opt.v} onClick={() => onChange('layout', opt.v)}
                  className={`flex-1 py-1.5 text-[11px] rounded border ${p.layout === opt.v ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Proporção">
            <SelectInput value={p.splitRatio || '50-50'} onChange={v => onChange('splitRatio', v)} options={[
              { value: '50-50', label: '50% / 50%' }, { value: '40-60', label: '40% / 60%' }, { value: '60-40', label: '60% / 40%' },
            ]} />
          </Field>
          {/* Image */}
          <span className="text-[10px] font-semibold text-gray-400 uppercase">Imagem</span>
          {p.imageSrc ? (
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
              <img src={p.imageSrc} alt={p.imageAlt || ''} className="w-full h-24 object-contain" />
              <div className="flex gap-1 p-2 border-t border-gray-100">
                <label className="flex-1 py-1 text-[10px] font-medium text-gray-600 bg-white border border-gray-200 rounded text-center cursor-pointer hover:bg-gray-50">
                  Trocar
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0]; if (!file) return
                    const form = new FormData(); form.append('file', file)
                    try {
                      const res = await fetch('/api/images/upload', { method: 'POST', body: form })
                      const data = await res.json()
                      if (data.url) onChange('imageSrc', data.url)
                    } catch { alert('Erro no upload') }
                  }} />
                </label>
                <button onClick={() => onChange('imageSrc', '')} className="flex-1 py-1 text-[10px] font-medium text-red-600 bg-red-50 rounded hover:bg-red-100">Remover</button>
              </div>
            </div>
          ) : (
            <label className="block border-2 border-dashed border-gray-200 rounded-lg p-4 text-center bg-gray-50 hover:border-zinc-400 cursor-pointer">
              <span className="text-xs text-gray-500">Upload imagem</span>
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return
                const form = new FormData(); form.append('file', file)
                try {
                  const res = await fetch('/api/images/upload', { method: 'POST', body: form })
                  const data = await res.json()
                  if (data.url) onChange('imageSrc', data.url)
                } catch { alert('Erro no upload') }
              }} />
            </label>
          )}
          <Field label="URL da Imagem"><TextInput value={p.imageSrc} onChange={v => onChange('imageSrc', v)} placeholder="https://..." /></Field>
          <Field label="Texto Alt"><TextInput value={p.imageAlt} onChange={v => onChange('imageAlt', v)} /></Field>
          <Field label="Link da Imagem"><TextInput value={p.imageHref} onChange={v => onChange('imageHref', v)} placeholder="https://..." /></Field>
          {/* Text */}
          <span className="text-[10px] font-semibold text-gray-400 uppercase">Texto</span>
          <Field label="Conteúdo">
            <RichTextEditor
              content={p.textHtml || '<p>Escreva seu texto aqui.</p>'}
              onChange={(html) => onChange('textHtml', html)}
            />
          </Field>
          {/* Button */}
          <Toggle value={p.showButton} onChange={v => onChange('showButton', v)} label="Mostrar botão" />
          {p.showButton && (
            <div className="space-y-2 p-2 bg-gray-50 rounded-md">
              <Field label="Texto do Botão"><TextInput value={p.buttonText} onChange={v => onChange('buttonText', v)} /></Field>
              <Field label="Link"><TextInput value={p.buttonHref} onChange={v => onChange('buttonHref', v)} placeholder="https://..." /></Field>
              <Field label="Cor do Botão"><ColorInput value={p.buttonColor} onChange={v => onChange('buttonColor', v)} /></Field>
              <Field label="Cor do Texto"><ColorInput value={p.buttonTextColor} onChange={v => onChange('buttonTextColor', v)} /></Field>
            </div>
          )}
          {commonTail()}
        </div>
      )

    case 'header-bar':
      return (
        <div className="space-y-3">
          <span className="text-[10px] font-semibold text-gray-400 uppercase">Links</span>
          {(p.links || []).map((link: { text: string; url: string }, i: number) => (
            <div key={i} className="flex gap-1.5 items-center">
              <div className="flex-1 grid grid-cols-2 gap-1.5">
                <TextInput value={link.text} onChange={v => {
                  const updated = [...p.links]; updated[i] = { ...updated[i], text: v }; onChange('links', updated)
                }} placeholder="Texto" />
                <TextInput value={link.url} onChange={v => {
                  const updated = [...p.links]; updated[i] = { ...updated[i], url: v }; onChange('links', updated)
                }} placeholder="URL" />
              </div>
              <button onClick={() => { const updated = (p.links || []).filter((_: any, idx: number) => idx !== i); onChange('links', updated) }}
                className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
            </div>
          ))}
          <button onClick={() => onChange('links', [...(p.links || []), { text: '', url: '' }])}
            className="text-[10px] text-zinc-700 hover:text-zinc-900 font-medium">+ Adicionar link</button>
          <Field label="Alinhamento"><SelectInput value={p.align} onChange={v => onChange('align', v)} options={ALIGN_OPTIONS} /></Field>
          <Field label="Tamanho da Fonte"><NumberInput value={p.fontSize} onChange={v => onChange('fontSize', v)} min={10} max={20} /></Field>
          <Field label="Cor do Texto"><ColorInput value={p.textColor} onChange={v => onChange('textColor', v)} /></Field>
          <Field label="Separador"><TextInput value={p.separator} onChange={v => onChange('separator', v)} placeholder="|" /></Field>
          <Field label="Cor do Separador"><ColorInput value={p.separatorColor} onChange={v => onChange('separatorColor', v)} /></Field>
          {commonTail()}
        </div>
      )

    case 'drop-shadow':
      return (
        <div className="space-y-3">
          <Field label="Tipo de Sombra">
            <SelectInput value={p.shadowType || 'light'} onChange={v => onChange('shadowType', v)} options={[
              { value: 'light', label: 'Leve' }, { value: 'dark', label: 'Escura' }, { value: 'darker', label: 'Mais Escura' },
            ]} />
          </Field>
          <Field label="Altura (px)"><NumberInput value={p.height} onChange={v => onChange('height', v)} min={2} max={30} /></Field>
          {commonTail()}
        </div>
      )

    case 'table': {
      const data: string[][] = p.data || [['', ''], ['', '']]
      const updateCell = (r: number, c: number, val: string) => {
        const newData = data.map(row => [...row])
        newData[r][c] = val
        onChange('data', newData)
      }
      const addRow = () => {
        const newRow = Array(data[0]?.length || 2).fill('')
        onChange('data', [...data, newRow])
        onChange('rows', (p.rows || data.length) + 1)
      }
      const removeRow = () => {
        if (data.length <= 1) return
        onChange('data', data.slice(0, -1))
        onChange('rows', Math.max(1, (p.rows || data.length) - 1))
      }
      const addCol = () => {
        onChange('data', data.map(row => [...row, '']))
        onChange('cols', (p.cols || data[0]?.length || 2) + 1)
      }
      const removeCol = () => {
        if ((data[0]?.length || 0) <= 1) return
        onChange('data', data.map(row => row.slice(0, -1)))
        onChange('cols', Math.max(1, (p.cols || data[0]?.length || 2) - 1))
      }
      return (
        <div className="space-y-3">
          {/* Data editor */}
          <span className="text-[10px] font-semibold text-gray-400 uppercase">Dados da Tabela</span>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={addRow} className="text-[10px] font-medium text-zinc-900 bg-zinc-50 rounded-md px-2.5 py-1.5 hover:bg-zinc-100 transition-colors">+ Linha</button>
            <button onClick={removeRow} className="text-[10px] font-medium text-red-600 bg-red-50 rounded-md px-2.5 py-1.5 hover:bg-red-100 transition-colors">- Linha</button>
            <button onClick={addCol} className="text-[10px] font-medium text-zinc-900 bg-zinc-50 rounded-md px-2.5 py-1.5 hover:bg-zinc-100 transition-colors">+ Coluna</button>
            <button onClick={removeCol} className="text-[10px] font-medium text-red-600 bg-red-50 rounded-md px-2.5 py-1.5 hover:bg-red-100 transition-colors">- Coluna</button>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-auto max-h-60">
            <table className="w-full text-xs">
              <tbody>
                {data.map((row, ri) => (
                  <tr key={ri} className={ri === 0 && p.headerRow ? 'bg-gray-100 font-semibold' : ''}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="border border-gray-200 p-0">
                        <input type="text" value={cell} onChange={e => updateCell(ri, ci, e.target.value)}
                          className="w-full px-2 py-1.5 text-xs text-gray-900 bg-transparent focus:outline-none focus:bg-zinc-50/30"
                          placeholder={ri === 0 && p.headerRow ? 'Cabeçalho' : 'Dado'} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Structure */}
          <span className="text-[10px] font-semibold text-gray-400 uppercase">Estrutura</span>
          <Toggle value={p.headerRow} onChange={v => onChange('headerRow', v)} label="Linha de cabeçalho" />
          <Toggle value={p.stripedRows} onChange={v => onChange('stripedRows', v)} label="Linhas alternadas" />
          {p.stripedRows && <Field label="Cor Alternada"><ColorInput value={p.stripedColor || '#F9FAFB'} onChange={v => onChange('stripedColor', v)} /></Field>}
          <Field label="Alinhamento do Texto">
            <SelectInput value={p.textAlign || 'left'} onChange={v => onChange('textAlign', v)} options={[
              { value: 'left', label: 'Esquerda' }, { value: 'center', label: 'Centro' }, { value: 'right', label: 'Direita' },
            ]} />
          </Field>

          {/* Typography */}
          <details className="group border border-gray-100 rounded-lg">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
              Tipografia <span className="text-gray-300 group-open:rotate-90 transition-transform">▸</span>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <Field label="Tamanho - Células"><NumberInput value={p.cellFontSize || 14} onChange={v => onChange('cellFontSize', v)} min={10} max={22} /></Field>
              <Field label="Tamanho - Cabeçalho"><NumberInput value={p.headerFontSize || 14} onChange={v => onChange('headerFontSize', v)} min={10} max={22} /></Field>
              <Field label="Peso - Cabeçalho">
                <SelectInput value={String(p.headerFontWeight || '600')} onChange={v => onChange('headerFontWeight', v)} options={[
                  { value: '400', label: 'Normal' }, { value: '500', label: 'Médio' }, { value: '600', label: 'Semibold' }, { value: '700', label: 'Bold' },
                ]} />
              </Field>
            </div>
          </details>

          {/* Colors */}
          <details className="group border border-gray-100 rounded-lg">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
              Cores <span className="text-gray-300 group-open:rotate-90 transition-transform">▸</span>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <Field label="Cabeçalho - Fundo"><ColorInput value={p.headerBgColor || '#111827'} onChange={v => onChange('headerBgColor', v)} /></Field>
              <Field label="Cabeçalho - Texto"><ColorInput value={p.headerTextColor || '#FFFFFF'} onChange={v => onChange('headerTextColor', v)} /></Field>
              <Field label="Células - Texto"><ColorInput value={p.cellTextColor || '#374151'} onChange={v => onChange('cellTextColor', v)} /></Field>
              <Field label="Células - Fundo"><ColorInput value={p.cellBgColor || ''} onChange={v => onChange('cellBgColor', v)} /></Field>
            </div>
          </details>

          {/* Borders */}
          <details className="group border border-gray-100 rounded-lg">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
              Bordas <span className="text-gray-300 group-open:rotate-90 transition-transform">▸</span>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <Field label="Cor da Borda"><ColorInput value={p.borderColor || '#E5E7EB'} onChange={v => onChange('borderColor', v)} /></Field>
              <Field label="Largura da Borda"><NumberInput value={p.borderWidth ?? 1} onChange={v => onChange('borderWidth', v)} min={0} max={5} /></Field>
              <Field label="Raio da Borda"><NumberInput value={p.tableBorderRadius ?? 0} onChange={v => onChange('tableBorderRadius', v)} min={0} max={20} /></Field>
            </div>
          </details>

          {/* Spacing */}
          <Field label="Padding das Células (px)"><NumberInput value={p.cellPadding ?? 10} onChange={v => onChange('cellPadding', v)} min={4} max={24} /></Field>
          {commonTail()}
        </div>
      )
    }

    case 'review-quote':
      return (
        <div className="space-y-3">
          <Field label="Depoimento">
            <textarea value={p.quote || ''} onChange={e => onChange('quote', e.target.value)} rows={3}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:border-zinc-900 focus:outline-none resize-y" />
          </Field>
          <Field label="Autor"><TextInput value={p.author} onChange={v => onChange('author', v)} /></Field>
          <Field label="Avaliação (1-5)">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => onChange('rating', n)}
                  className={`w-8 h-8 text-lg rounded ${n <= (p.rating || 5) ? 'text-yellow-400' : 'text-gray-300'} hover:scale-110 transition-transform`}>
                  ★
                </button>
              ))}
            </div>
          </Field>
          <Toggle value={p.showStars !== false} onChange={v => onChange('showStars', v)} label="Mostrar estrelas" />
          <Field label="Cor das Estrelas"><ColorInput value={p.starColor || '#FBBF24'} onChange={v => onChange('starColor', v)} /></Field>
          <Field label="Alinhamento"><SelectInput value={p.quoteAlign || 'center'} onChange={v => onChange('quoteAlign', v)} options={ALIGN_OPTIONS} /></Field>
          <details className="group border border-gray-100 rounded-lg">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
              Tipografia <span className="text-gray-300 group-open:rotate-90 transition-transform">▸</span>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <Field label="Tamanho do Texto"><NumberInput value={p.quoteFontSize || 16} onChange={v => onChange('quoteFontSize', v)} min={12} max={28} /></Field>
              <Field label="Cor do Texto"><ColorInput value={p.quoteColor || '#374151'} onChange={v => onChange('quoteColor', v)} /></Field>
              <Field label="Estilo do Texto">
                <SelectInput value={p.quoteStyle || 'italic'} onChange={v => onChange('quoteStyle', v)} options={[
                  { value: 'italic', label: 'Itálico' }, { value: 'normal', label: 'Normal' },
                ]} />
              </Field>
              <Field label="Tamanho do Autor"><NumberInput value={p.authorFontSize || 14} onChange={v => onChange('authorFontSize', v)} min={10} max={22} /></Field>
              <Field label="Cor do Autor"><ColorInput value={p.authorColor || '#6B7280'} onChange={v => onChange('authorColor', v)} /></Field>
            </div>
          </details>
          {commonTail()}
        </div>
      )

    case 'countdown':
      return (
        <div className="space-y-3">
          <Field label="Data de Término">
            <input type="datetime-local" value={p.endDate || ''} onChange={e => onChange('endDate', e.target.value)}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:border-zinc-900 focus:outline-none" />
          </Field>
          <Field label="Estilo">
            <div className="grid grid-cols-5 gap-1">
              {[
                { v: 'dark', label: 'Escuro', bg: '#111827', fg: '#fff' },
                { v: 'light', label: 'Claro', bg: '#F3F4F6', fg: '#111827' },
                { v: 'brand', label: 'Marca', bg: '#F97316', fg: '#fff' },
                { v: 'minimal', label: 'Mín.', bg: '#fff', fg: '#111827' },
                { v: 'urgent', label: 'Urg.', bg: '#DC2626', fg: '#fff' },
              ].map(opt => (
                <button key={opt.v} onClick={() => onChange('style', opt.v)}
                  className={`py-2 text-[9px] font-semibold rounded-md border transition-all ${p.style === opt.v ? 'ring-2 ring-zinc-900 ring-offset-1' : 'hover:opacity-80'}`}
                  style={{ backgroundColor: opt.bg, color: opt.fg, borderColor: opt.bg === '#fff' ? '#E5E7EB' : opt.bg }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Título (opcional)"><TextInput value={p.title || ''} onChange={v => onChange('title', v)} placeholder="Ex: OFERTA TERMINA EM" /></Field>
          <Field label="Texto ao Expirar"><TextInput value={p.expiredText} onChange={v => onChange('expiredText', v)} /></Field>

          {/* Labels */}
          <span className="text-[10px] font-semibold text-gray-400 uppercase">Rótulos</span>
          <div className="grid grid-cols-4 gap-1.5">
            <div><span className="block text-[9px] text-gray-400 text-center mb-0.5">Dias</span>
              <TextInput value={p.labels?.days || 'DIAS'} onChange={v => onChange('labels', { ...(p.labels || {}), days: v })} /></div>
            <div><span className="block text-[9px] text-gray-400 text-center mb-0.5">Horas</span>
              <TextInput value={p.labels?.hours || 'HORAS'} onChange={v => onChange('labels', { ...(p.labels || {}), hours: v })} /></div>
            <div><span className="block text-[9px] text-gray-400 text-center mb-0.5">Min</span>
              <TextInput value={p.labels?.minutes || 'MIN'} onChange={v => onChange('labels', { ...(p.labels || {}), minutes: v })} /></div>
            <div><span className="block text-[9px] text-gray-400 text-center mb-0.5">Seg</span>
              <TextInput value={p.labels?.seconds || 'SEG'} onChange={v => onChange('labels', { ...(p.labels || {}), seconds: v })} /></div>
          </div>

          {/* Typography */}
          <details className="group border border-gray-100 rounded-lg" open>
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
              Números e Rótulos <span className="text-gray-300 group-open:rotate-90 transition-transform">▸</span>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tamanho Números"><NumberInput value={p.fontSize || 36} onChange={v => onChange('fontSize', v)} min={16} max={56} /></Field>
                <Field label="Tamanho Rótulos"><NumberInput value={p.labelFontSize || 11} onChange={v => onChange('labelFontSize', v)} min={8} max={18} /></Field>
              </div>
            </div>
          </details>

          {/* Colors — always visible for full control */}
          <details className="group border border-gray-100 rounded-lg" open>
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
              Cores Personalizadas <span className="text-gray-300 group-open:rotate-90 transition-transform">▸</span>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <p className="text-[10px] text-gray-400">Deixe em branco para usar as cores do estilo selecionado.</p>
              <Field label="Cor dos Números"><ColorInput value={p.numberColor || ''} onChange={v => onChange('numberColor', v)} /></Field>
              <Field label="Cor dos Rótulos"><ColorInput value={p.labelColor || ''} onChange={v => onChange('labelColor', v)} /></Field>
              <Field label="Cor do Título"><ColorInput value={p.titleColor || ''} onChange={v => onChange('titleColor', v)} /></Field>
              <Field label="Cor do Separador"><ColorInput value={p.separatorColor || ''} onChange={v => onChange('separatorColor', v)} /></Field>
            </div>
          </details>

          {/* Box styling */}
          <details className="group border border-gray-100 rounded-lg">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
              Estilo das Caixas <span className="text-gray-300 group-open:rotate-90 transition-transform">▸</span>
            </summary>
            <div className="px-3 pb-3 space-y-2">
              <Field label="Cor de Fundo"><ColorInput value={p.boxColor || ''} onChange={v => onChange('boxColor', v)} /></Field>
              <Field label="Raio da Borda"><NumberInput value={p.boxBorderRadius ?? 12} onChange={v => onChange('boxBorderRadius', v)} min={0} max={32} /></Field>
              <Field label="Cor da Borda"><ColorInput value={p.boxBorder || ''} onChange={v => onChange('boxBorder', v)} /></Field>
            </div>
          </details>
          {commonTail()}
        </div>
      )

    default:
      return <p className="text-xs text-gray-400 p-3">Selecione um bloco para editar</p>
  }
}

// ══════════════════════════════════════════
// Product Block Properties (Klaviyo-style)
// ══════════════════════════════════════════

function ProductBlockProperties({ p, onChange, commonTail, selectedSubElement, onSelectSubElement }: {
  p: any; onChange: (k: string, v: any) => void; commonTail: () => JSX.Element;
  selectedSubElement?: string | null; onSelectSubElement?: (subEl: string | null) => void
}) {
  const [showViewFeeds, setShowViewFeeds] = useState(false)
  const [showCreateFeed, setShowCreateFeed] = useState(false)
  const [showBrowseProducts, setShowBrowseProducts] = useState(false)

  const subElementLabels: Record<string, string> = {
    title: 'Titulo',
    name: 'Nome do Produto',
    price: 'Preco',
    button: 'Botao',
    image: 'Imagem',
  }

  // ── Sub-element focused panels ──
  if (selectedSubElement && subElementLabels[selectedSubElement]) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => onSelectSubElement?.(null)}
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          Voltar para Produtos
        </button>

        <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
          <div className="w-7 h-7 rounded-md bg-zinc-100 flex items-center justify-center">
            {selectedSubElement === 'name' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>}
            {selectedSubElement === 'title' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="2"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>}
            {selectedSubElement === 'price' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
            {selectedSubElement === 'button' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="2"><rect x="3" y="8" width="18" height="8" rx="2"/><path d="M8 12h8"/></svg>}
            {selectedSubElement === 'image' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>}
          </div>
          <p className="text-[13px] font-semibold text-zinc-800">{subElementLabels[selectedSubElement]}</p>
        </div>

        <p className="text-[10px] text-zinc-400">Clique nos elementos no canvas para editar individualmente.</p>

        {/* ── Title sub-panel ── */}
        {selectedSubElement === 'title' && (
          <div className="space-y-3">
            <Field label="Texto do titulo">
              <TextInput value={p.title || ''} onChange={v => onChange('title', v)} placeholder="Titulo da secao" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tamanho">
                <NumberInput value={p.titleFontSize || 18} onChange={v => onChange('titleFontSize', v)} min={12} max={36} />
              </Field>
              <Field label="Peso">
                <SelectInput value={p.titleWeight || 'bold'} onChange={v => onChange('titleWeight', v)} options={[
                  { value: 'normal', label: 'Normal' }, { value: '500', label: 'Medium' }, { value: '600', label: 'Semibold' }, { value: 'bold', label: 'Bold' },
                ]} />
              </Field>
            </div>
            <Field label="Cor">
              <ColorInput value={p.titleColor || '#111827'} onChange={v => onChange('titleColor', v)} />
            </Field>
            <Field label="Alinhamento">
              <div className="flex gap-1">
                {['left', 'center', 'right'].map(a => (
                  <button key={a} onClick={() => onChange('titleAlign', a)}
                    className={`flex-1 py-1.5 text-xs rounded border transition-colors ${(p.titleAlign || 'center') === a ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}>
                    {a === 'left' ? 'Esquerda' : a === 'center' ? 'Centro' : 'Direita'}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        )}

        {/* ── Name sub-panel ── */}
        {selectedSubElement === 'name' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tamanho">
                <NumberInput value={p.nameFontSize || 14} onChange={v => onChange('nameFontSize', v)} min={8} max={32} />
              </Field>
              <Field label="Peso">
                <SelectInput value={p.nameWeight || '600'} onChange={v => onChange('nameWeight', v)} options={[
                  { value: '400', label: 'Normal 400' }, { value: '500', label: 'Medium 500' }, { value: '600', label: 'Semibold 600' }, { value: '700', label: 'Bold 700' },
                ]} />
              </Field>
            </div>
            <Field label="Cor">
              <ColorInput value={p.nameColor || '#111827'} onChange={v => onChange('nameColor', v)} />
            </Field>
            <Toggle value={p.showName !== false} onChange={v => onChange('showName', v)} label="Exibir nome" />
            {p.showName !== false && (
              <div className="space-y-1.5 pl-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={!p.nameLinkEnabled} onChange={() => onChange('nameLinkEnabled', false)}
                    className="w-3.5 h-3.5 text-zinc-700 border-gray-300" />
                  <span className="text-xs text-zinc-600">Sem link</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={p.nameLinkEnabled === true} onChange={() => onChange('nameLinkEnabled', true)}
                    className="w-3.5 h-3.5 text-zinc-700 border-gray-300" />
                  <span className="text-xs text-zinc-600">Link para o produto</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* ── Price sub-panel ── */}
        {selectedSubElement === 'price' && (
          <div className="space-y-3">
            <Toggle value={p.showPrice !== false} onChange={v => onChange('showPrice', v)} label="Exibir preco" />
            {p.showPrice !== false && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Tamanho">
                    <NumberInput value={p.priceFontSize || 16} onChange={v => onChange('priceFontSize', v)} min={8} max={48} />
                  </Field>
                  <Field label="Peso">
                    <SelectInput value={p.priceWeight || '700'} onChange={v => onChange('priceWeight', v)} options={[
                      { value: '400', label: 'Normal 400' }, { value: '500', label: 'Medium 500' }, { value: '600', label: 'Semibold 600' }, { value: '700', label: 'Bold 700' },
                    ]} />
                  </Field>
                </div>
                <Field label="Cor do preco">
                  <ColorInput value={p.priceColor || '#F97316'} onChange={v => onChange('priceColor', v)} />
                </Field>
              </>
            )}
            <Toggle value={p.showComparePrice === true} onChange={v => onChange('showComparePrice', v)} label="Preco original (riscado)" />
            {p.showComparePrice && (
              <Field label="Cor do preco original">
                <ColorInput value={p.comparePriceColor || '#9CA3AF'} onChange={v => onChange('comparePriceColor', v)} />
              </Field>
            )}
          </div>
        )}

        {/* ── Button sub-panel ── */}
        {selectedSubElement === 'button' && (
          <div className="space-y-3">
            <Toggle value={p.showButton !== false} onChange={v => onChange('showButton', v)} label="Exibir botao" />
            {p.showButton !== false && (
              <>
                <Field label="Texto">
                  <TextInput value={p.buttonText || 'Comprar'} onChange={v => onChange('buttonText', v)} placeholder="Texto do botao" />
                </Field>
                <Field label="Cor de fundo">
                  <ColorInput value={p.buttonColor || '#F97316'} onChange={v => onChange('buttonColor', v)} />
                </Field>
                <Field label="Cor do texto">
                  <ColorInput value={p.buttonTextColor || '#FFFFFF'} onChange={v => onChange('buttonTextColor', v)} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Tamanho">
                    <NumberInput value={p.buttonFontSize || 12} onChange={v => onChange('buttonFontSize', v)} min={10} max={20} />
                  </Field>
                  <Field label="Raio">
                    <NumberInput value={p.buttonRadius || 6} onChange={v => onChange('buttonRadius', v)} min={0} max={50} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Padding H">
                    <NumberInput value={p.buttonPaddingH ?? 16} onChange={v => onChange('buttonPaddingH', v)} min={4} max={40} />
                  </Field>
                  <Field label="Padding V">
                    <NumberInput value={p.buttonPaddingV ?? 6} onChange={v => onChange('buttonPaddingV', v)} min={2} max={20} />
                  </Field>
                </div>
                <Field label="Alinhamento">
                  <div className="flex gap-1">
                    {[
                      { v: 'left', label: 'Esquerda' },
                      { v: 'center', label: 'Centro' },
                      { v: 'right', label: 'Direita' },
                      { v: 'full', label: 'Total' },
                    ].map(a => (
                      <button key={a.v} onClick={() => onChange('buttonAlign', a.v)}
                        className={`flex-1 py-1.5 text-[10px] rounded border transition-colors ${(p.buttonAlign || 'left') === a.v ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Toggle value={p.buttonFullWidth} onChange={v => onChange('buttonFullWidth', v)} label="Largura total" />
              </>
            )}
          </div>
        )}

        {/* ── Image sub-panel ── */}
        {selectedSubElement === 'image' && (
          <div className="space-y-3">
            <Field label="Proporcao">
              <div className="flex border border-zinc-200 rounded-md overflow-hidden">
                {([
                  { value: 'square' as const, label: 'Quadrado' },
                  { value: 'portrait' as const, label: 'Retrato' },
                  { value: 'landscape' as const, label: 'Paisagem' },
                ]).map(opt => (
                  <button key={opt.value} onClick={() => onChange('imageRatio', opt.value)}
                    className={`flex-1 h-[28px] text-[11px] font-medium transition-all ${(p.imageRatio || 'square') === opt.value ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Raio da borda">
              <NumberInput value={p.productBorderRadius || 8} onChange={v => onChange('productBorderRadius', v)} min={0} max={24} />
            </Field>
            <Field label="Altura maxima (px)">
              <NumberInput value={p.maxImageHeight || 300} onChange={v => onChange('maxImageHeight', v)} min={80} max={600} />
            </Field>
          </div>
        )}
      </div>
    )
  }

  // ── Main product block panel (no sub-element selected) ──
  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="flex gap-3 p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
        <div className="w-7 h-7 rounded-md bg-zinc-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3h-8l-2 4h12z"/></svg>
        </div>
        <div>
          <p className="text-[11px] text-zinc-600 leading-snug">Os detalhes dos produtos serao preenchidos automaticamente.</p>
          <p className="text-[10px] text-zinc-400 mt-1">Clique nos elementos no canvas para editar individualmente.</p>
        </div>
      </div>

      {/* ── Dynamic / Static radio cards ── */}
      <div className="space-y-2">
        {[
          { value: 'dynamic', label: 'Dinamico', desc: 'Exibir produtos usando um feed de produtos.' },
          { value: 'static', label: 'Estatico', desc: 'Escolher produtos fixos para todos os destinatarios.' },
        ].map(opt => (
          <label key={opt.value}
            className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${p.mode === opt.value ? 'border-zinc-900 bg-zinc-50/30' : 'border-gray-200 hover:border-gray-300'}`}>
            <input type="radio" checked={p.mode === opt.value} onChange={() => onChange('mode', opt.value)}
              className="mt-0.5 w-4 h-4 text-zinc-700 border-gray-300" />
            <div>
              <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
              <p className="text-xs text-gray-500">{opt.desc}</p>
            </div>
          </label>
        ))}
      </div>

      {/* ── Seleção de produtos ── */}
      {p.mode === 'dynamic' && (
        <div>
          <p className="text-[12px] font-medium text-gray-700 mb-2">Feed de produtos</p>

          {p.feedId ? (
            <>
              {/* Feed selecionado */}
              <div className="border border-zinc-900 rounded-lg p-3 mb-2 bg-zinc-50/20">
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-zinc-900 flex items-center justify-center mt-0.5 flex-shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.feedName || 'Feed selecionado'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {p.feedType === 'recently_viewed' && 'Exibir produtos visualizados recentemente pelo contato.'}
                      {p.feedType === 'bestsellers' && 'Exibir produtos mais vendidos de todas as categorias.'}
                      {p.feedType === 'newest' && 'Exibir produtos mais recentes de todas as categorias.'}
                      {p.feedType === 'cart_items' && 'Exibir produtos do carrinho do cliente.'}
                      {p.feedType === 'recommendations' && 'Exibir produtos recomendados baseado no historico.'}
                      {p.feedType === 'most_viewed' && 'Exibir produtos mais vistos.'}
                      {!p.feedType && 'Feed configurado.'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowViewFeeds(true)}
                  className="text-xs font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
                  Alterar selecao
                </button>
                <button onClick={() => setShowCreateFeed(true)}
                  className="text-xs font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
                  Criar novo feed
                </button>
              </div>
            </>
          ) : (
            /* Nenhum feed selecionado */
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center bg-gray-50">
              <p className="text-xs font-medium text-gray-600 mb-1">Nenhum feed de produtos configurado</p>
              <p className="text-[10px] text-gray-400 mb-3">Crie um feed para definir quais produtos serao exibidos para cada contato.</p>
              <div className="flex gap-2 justify-center">
                <button onClick={() => setShowCreateFeed(true)}
                  className="text-xs font-semibold text-white bg-zinc-900 rounded-lg px-4 py-2 hover:bg-zinc-800 transition-colors">
                  Criar feed de produtos
                </button>
                <button onClick={() => setShowViewFeeds(true)}
                  className="text-xs font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors">
                  Selecionar existente
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modo Estático: Adicionar produtos do catálogo ── */}
      {p.mode === 'static' && (
        <div>
          <button onClick={() => setShowBrowseProducts(true)}
            className="w-full py-2.5 text-sm font-semibold text-gray-900 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Adicionar produtos
          </button>
          {p.staticProducts && p.staticProducts.length > 0 && (
            <div className="mt-3">
              <StaticProductsEditor
                products={p.staticProducts}
                onChange={prods => onChange('staticProducts', prods)}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Detalhes do produto (clickable rows that open sub-panels) ── */}
      <div>
        <p className="text-[12px] font-medium text-gray-700 mb-2">Elementos do produto</p>
        <p className="text-[10px] text-zinc-400 mb-2">Clique para editar o estilo de cada elemento.</p>
        <div className="space-y-1">
          {[
            { key: 'name', label: 'Nome', propKey: 'showName', preview: `${p.nameFontSize || 14}px, ${p.nameWeight || '600'}` },
            { key: 'price', label: 'Preco', propKey: 'showPrice', preview: `${p.priceFontSize || 16}px, ${p.priceWeight || '700'}` },
            { key: 'button', label: 'Botao', propKey: 'showButton', preview: p.buttonText || 'Comprar' },
            { key: 'image', label: 'Imagem', propKey: null, preview: p.imageRatio || 'square' },
          ].map(item => (
            <button key={item.key}
              onClick={() => onSelectSubElement?.(item.key)}
              className="w-full flex items-center justify-between px-3 py-2.5 border border-zinc-100 rounded-lg hover:border-zinc-300 hover:bg-zinc-50/50 transition-all group"
            >
              <div className="flex items-center gap-2.5">
                {item.propKey && (
                  <input type="checkbox" checked={p[item.propKey] !== false}
                    onClick={e => e.stopPropagation()}
                    onChange={e => onChange(item.propKey!, e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500" />
                )}
                <span className="text-[13px] font-medium text-zinc-700">{item.label}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-400">{item.preview}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-300 group-hover:text-zinc-500"><path d="M9 18l6-6-6-6"/></svg>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Layout ── */}
      <details className="group border border-zinc-100 rounded-lg" open>
        <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer text-[12px] font-semibold text-zinc-800 hover:bg-zinc-50 rounded-lg transition-colors">
          Layout <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 group-open:rotate-180 transition-transform"><path d="M6 9l6 6 6-6"/></svg>
        </summary>
        <div className="px-3 pb-3 space-y-3">
          <div className="flex border border-zinc-200 rounded-md overflow-hidden">
            {([
              { value: 'list' as const, label: 'Lista' },
              { value: 'grid' as const, label: 'Grade' },
            ]).map(opt => (
              <button key={opt.value} onClick={() => onChange('layout', opt.value)}
                className={`flex-1 h-[28px] text-[12px] font-medium transition-all ${(p.layout || 'grid') === opt.value ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>
                {opt.label}
              </button>
            ))}
          </div>
          {(p.layout || 'grid') === 'grid' && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Colunas">
                <SelectInput value={String(p.columns || 2)} onChange={v => onChange('columns', Number(v))} options={[
                  { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' },
                ]} />
              </Field>
              <Field label="Linhas">
                <SelectInput value={String(p.rows || 2)} onChange={v => onChange('rows', Number(v))} options={[
                  { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' },
                ]} />
              </Field>
            </div>
          )}
          {(p.layout || 'grid') === 'list' && (
            <Field label="Numero de produtos">
              <NumberInput value={(p.columns || 2) * (p.rows || 2)} onChange={v => { onChange('columns', 1); onChange('rows', v) }} min={1} max={12} />
            </Field>
          )}
          <Toggle value={p.stackOnMobile !== false} onChange={v => onChange('stackOnMobile', v)} label="Empilhar no mobile" />
          <Toggle value={p.showSeparator || false} onChange={v => onChange('showSeparator', v)} label="Separador entre produtos" />
          {p.showSeparator && (
            <Field label="Cor do separador"><ColorInput value={p.separatorColor || '#E5E7EB'} onChange={v => onChange('separatorColor', v)} /></Field>
          )}
          <Field label="Espaco entre produtos (px)">
            <NumberInput value={p.productPadding || 12} onChange={v => onChange('productPadding', v)} min={0} max={32} />
          </Field>
        </div>
      </details>

      {/* ── Borda do produto ── */}
      <details className="group border border-zinc-100 rounded-lg">
        <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer text-[12px] font-semibold text-zinc-800 hover:bg-zinc-50 rounded-lg transition-colors">
          Borda do produto <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 group-open:rotate-180 transition-transform"><path d="M6 9l6 6 6-6"/></svg>
        </summary>
        <div className="px-3 pb-3 space-y-2">
          <Field label="Cor"><ColorInput value={p.productBorderColor || '#E5E7EB'} onChange={v => onChange('productBorderColor', v)} /></Field>
          <Field label="Raio"><NumberInput value={p.productBorderRadius || 8} onChange={v => onChange('productBorderRadius', v)} min={0} max={32} /></Field>
        </div>
      </details>

      {commonTail()}

      {/* ── Modals ── */}
      <ViewFeedsModal
        isOpen={showViewFeeds}
        onClose={() => setShowViewFeeds(false)}
        currentFeedId={p.feedId}
        onSelect={(feed) => { onChange('feedId', feed.id); onChange('feedName', feed.name); onChange('feedType', feed.feed_type) }}
      />
      <CreateFeedModal
        isOpen={showCreateFeed}
        onClose={() => setShowCreateFeed(false)}
        onCreate={(feed) => { onChange('feedId', feed.id); onChange('feedName', feed.name); onChange('feedType', feed.feed_type) }}
      />
      <BrowseProductsModal
        isOpen={showBrowseProducts}
        onClose={() => setShowBrowseProducts(false)}
        maxProducts={(p.columns || 2) * (p.rows || 2)}
        onSelect={(products) => {
          onChange('staticProducts', products.map(prod => ({
            id: prod.id,
            title: prod.title,
            price: prod.price,
            compare_at_price: prod.compare_at_price,
            image_url: prod.image_url,
            url: prod.url || '',
            description: prod.description || '',
            buttonText: p.buttonText || 'Comprar',
          })))
        }}
      />
    </div>
  )
}
