'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import type { EmailBlock } from '../config/types'

const RichTextEditor = dynamic(() => import('../blocks/RichTextEditor').then(m => ({ default: m.RichTextEditor })), { ssr: false, loading: () => <div className="h-20 bg-gray-50 rounded-lg animate-pulse" /> })

interface BlockPropertiesProps {
  block: EmailBlock
  onChange: (key: string, value: any) => void
  onSaveAsReusable?: () => void
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
      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:border-brand-500 focus:outline-none" />
  )
}

function NumberInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input type="number" value={value ?? 0} onChange={e => onChange(Number(e.target.value))} min={min} max={max}
      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:border-brand-500 focus:outline-none" />
  )
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value || '#000000'} onChange={e => onChange(e.target.value)}
        className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5" />
      <input type="text" value={value || ''} onChange={e => onChange(e.target.value)}
        className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-md text-xs font-mono text-gray-900 focus:border-brand-500 focus:outline-none" />
    </div>
  )
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
      <span className="text-xs text-gray-700">{label}</span>
    </label>
  )
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)}
      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 bg-white focus:border-brand-500 focus:outline-none">
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
            className="w-full px-1.5 py-1 border border-gray-200 rounded text-xs text-center text-gray-900 focus:border-brand-500 focus:outline-none" />
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
                className={`flex-1 py-1 text-xs rounded border ${align === a.v ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
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

export function BlockProperties({ block, onChange, onSaveAsReusable }: BlockPropertiesProps) {
  const p = block.props
  const [showConditions, setShowConditions] = useState(!!p._condition_enabled)

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
          <div className="w-8 h-4 bg-gray-200 peer-checked:bg-brand-500 rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4" />
        </label>
      </div>
      {showConditions && (
        <div className="space-y-2 p-2 bg-gray-50 rounded-md">
          <SelectInput value={p._condition_field || ''} onChange={v => onChange('_condition_field', v)} options={[
            { value: '', label: 'Selecionar campo...' },
            { value: 'first_name', label: 'Nome' }, { value: 'email', label: 'Email' },
            { value: 'tags', label: 'Tags' }, { value: 'city', label: 'Cidade' },
            { value: 'total_orders', label: 'Total Pedidos' }, { value: 'source', label: 'Origem' },
          ]} />
          <SelectInput value={p._condition_op || ''} onChange={v => onChange('_condition_op', v)} options={[
            { value: '', label: 'Operador...' },
            { value: 'equals', label: 'É igual a' }, { value: 'not_equals', label: 'Não é igual a' },
            { value: 'contains', label: 'Contém' }, { value: 'is_set', label: 'Está preenchido' },
            { value: 'is_not_set', label: 'Está vazio' },
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
        className="w-full py-2 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors">
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

    case 'image':
      return (
        <div className="space-y-3">
          {/* Image preview */}
          {p.src && (
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
              <img src={p.src} alt={p.alt || ''} className="w-full h-32 object-contain" />
              <div className="flex gap-1 p-2 border-t border-gray-100">
                <button onClick={() => onChange('src', '')} className="flex-1 py-1.5 text-[10px] font-medium text-red-600 bg-red-50 rounded hover:bg-red-100 transition-colors">Remover</button>
              </div>
            </div>
          )}
          <Field label="URL da Imagem"><TextInput value={p.src} onChange={v => onChange('src', v)} placeholder="https://..." /></Field>
          <Field label="Texto Alt"><TextInput value={p.alt} onChange={v => onChange('alt', v)} placeholder="Descrição da imagem" /></Field>
          <Field label="Link"><TextInput value={p.href} onChange={v => onChange('href', v)} placeholder="https:// ou {{merge_tag}}" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Largura"><NumberInput value={p.width} onChange={v => onChange('width', v)} min={50} max={600} /></Field>
            <Field label="Raio da Borda"><NumberInput value={p.borderRadius} onChange={v => onChange('borderRadius', v)} min={0} max={100} /></Field>
          </div>
          <Field label="Alinhamento"><SelectInput value={p.align} onChange={v => onChange('align', v)} options={ALIGN_OPTIONS} /></Field>
          <Toggle value={p.fillColumn} onChange={v => onChange('fillColumn', v)} label="Preencher coluna" />
          <Toggle value={p.fullWidthMobile !== false} onChange={v => onChange('fullWidthMobile', v)} label="Largura total no mobile" />
          {/* Advanced */}
          <div className="border border-gray-100 rounded-lg">
            <details className="group">
              <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
                Borda da Imagem <span className="text-gray-300 group-open:rotate-90 transition-transform">▸</span>
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <Field label="Largura"><NumberInput value={p.border?.width || 0} onChange={v => onChange('border', { ...(p.border || {}), width: v })} min={0} max={10} /></Field>
                <Field label="Cor"><ColorInput value={p.border?.color || '#E5E7EB'} onChange={v => onChange('border', { ...(p.border || {}), color: v })} /></Field>
              </div>
            </details>
          </div>
          <div className="border border-gray-100 rounded-lg">
            <details className="group">
              <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-medium text-gray-600 hover:bg-gray-50 rounded-lg">
                Background <span className="text-gray-300 group-open:rotate-90 transition-transform">▸</span>
              </summary>
              <div className="px-3 pb-3">
                <Field label="Cor de Fundo"><ColorInput value={p.backgroundColor || ''} onChange={v => onChange('backgroundColor', v)} /></Field>
              </div>
            </details>
          </div>
          {commonTail()}
        </div>
      )

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
          {commonTail(false)}
        </div>
      )

    case 'spacer':
      return (
        <div className="space-y-3">
          <Field label="Altura (px)"><NumberInput value={p.height} onChange={v => onChange('height', v)} min={8} max={200} /></Field>
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
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs font-mono text-gray-900 focus:border-brand-500 focus:outline-none resize-y" />
          </Field>
          {commonTail(false)}
        </div>
      )

    case 'video':
      return (
        <div className="space-y-3">
          <Field label="URL do Vídeo"><TextInput value={p.videoUrl} onChange={v => onChange('videoUrl', v)} placeholder="https://youtube.com/..." /></Field>
          <Field label="URL da Thumbnail"><TextInput value={p.thumbnailUrl} onChange={v => onChange('thumbnailUrl', v)} placeholder="https://..." /></Field>
          {commonTail(false)}
        </div>
      )

    case 'social':
      return (
        <div className="space-y-3">
          <span className="text-[10px] font-semibold text-gray-400 uppercase">Redes</span>
          {(p.networks || []).map((net: { type: string; url: string }, i: number) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1">
                <Field label={net.type.charAt(0).toUpperCase() + net.type.slice(1)}>
                  <TextInput value={net.url} onChange={v => {
                    const updated = [...p.networks]
                    updated[i] = { ...updated[i], url: v }
                    onChange('networks', updated)
                  }} placeholder="URL" />
                </Field>
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
          <Field label="URL do Logo"><TextInput value={p.logoSrc} onChange={v => onChange('logoSrc', v)} placeholder="https://..." /></Field>
          <Field label="Largura do Logo (px)"><NumberInput value={p.logoWidth} onChange={v => onChange('logoWidth', v)} min={40} max={400} /></Field>
          <Field label="Link do Logo"><TextInput value={p.logoHref} onChange={v => onChange('logoHref', v)} placeholder="https://..." /></Field>
          <Toggle value={p.showLinks} onChange={v => onChange('showLinks', v)} label="Mostrar links de navegação" />
          {p.showLinks && (
            <div className="space-y-2 p-2 bg-gray-50 rounded-md">
              <span className="text-[10px] font-semibold text-gray-400 uppercase">Links</span>
              {(p.links || []).map((link: { text: string; url: string }, i: number) => (
                <div key={i} className="grid grid-cols-2 gap-1.5">
                  <TextInput value={link.text} onChange={v => {
                    const updated = [...p.links]
                    updated[i] = { ...updated[i], text: v }
                    onChange('links', updated)
                  }} placeholder="Texto" />
                  <TextInput value={link.url} onChange={v => {
                    const updated = [...p.links]
                    updated[i] = { ...updated[i], url: v }
                    onChange('links', updated)
                  }} placeholder="URL" />
                </div>
              ))}
              <button onClick={() => onChange('links', [...(p.links || []), { text: '', url: '' }])}
                className="text-[10px] text-brand-500 hover:text-brand-600 font-medium">+ Adicionar link</button>
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
          <Field label="Cor do Texto"><ColorInput value={p.textColor} onChange={v => onChange('textColor', v)} /></Field>
          <Field label="Tamanho da Fonte"><NumberInput value={p.fontSize} onChange={v => onChange('fontSize', v)} min={8} max={18} /></Field>
          {commonTail()}
        </div>
      )

    case 'product-grid':
      return (
        <div className="space-y-3">
          <Field label="Modo">
            <SelectInput value={p.mode} onChange={v => onChange('mode', v)} options={[
              { value: 'dynamic', label: 'Dinâmico' }, { value: 'static', label: 'Estático' },
            ]} />
          </Field>
          {p.mode === 'dynamic' && (
            <Field label="Tipo de Feed">
              <SelectInput value={p.feedType} onChange={v => onChange('feedType', v)} options={[
                { value: 'bestsellers', label: 'Mais vendidos' }, { value: 'newest', label: 'Mais recentes' },
                { value: 'recently_viewed', label: 'Vistos recentemente' }, { value: 'cart_items', label: 'Itens do carrinho' },
                { value: 'recommendations', label: 'Recomendações' },
              ]} />
            </Field>
          )}
          <Field label="Título"><TextInput value={p.title} onChange={v => onChange('title', v)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Colunas">
              <SelectInput value={String(p.columns)} onChange={v => onChange('columns', Number(v))} options={[
                { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' },
              ]} />
            </Field>
            <Field label="Linhas">
              <SelectInput value={String(p.rows)} onChange={v => onChange('rows', Number(v))} options={[
                { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' },
              ]} />
            </Field>
          </div>
          <Field label="Altura Máx. Imagem (px)"><NumberInput value={p.maxImageHeight} onChange={v => onChange('maxImageHeight', v)} min={50} max={500} /></Field>

          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-gray-400 uppercase">Visibilidade</span>
            <Toggle value={p.showName} onChange={v => onChange('showName', v)} label="Nome do produto" />
            <Toggle value={p.showPrice} onChange={v => onChange('showPrice', v)} label="Preço" />
            <Toggle value={p.showComparePrice} onChange={v => onChange('showComparePrice', v)} label="Preço comparativo" />
            <Toggle value={p.showButton} onChange={v => onChange('showButton', v)} label="Botão" />
            <Toggle value={p.stackOnMobile} onChange={v => onChange('stackOnMobile', v)} label="Empilhar no mobile" />
          </div>

          {p.showButton && (
            <div className="space-y-2 p-2 bg-gray-50 rounded-md">
              <span className="text-[10px] font-semibold text-gray-400 uppercase">Botão</span>
              <Field label="Texto do Botão"><TextInput value={p.buttonText} onChange={v => onChange('buttonText', v)} /></Field>
              <Field label="Cor do Botão"><ColorInput value={p.buttonColor} onChange={v => onChange('buttonColor', v)} /></Field>
              <Field label="Cor do Texto do Botão"><ColorInput value={p.buttonTextColor} onChange={v => onChange('buttonTextColor', v)} /></Field>
              <Field label="Border Radius do Botão"><NumberInput value={p.buttonRadius} onChange={v => onChange('buttonRadius', v)} min={0} max={50} /></Field>
            </div>
          )}

          <div className="space-y-2 p-2 bg-gray-50 rounded-md">
            <span className="text-[10px] font-semibold text-gray-400 uppercase">Estilo do Nome</span>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tamanho"><NumberInput value={p.nameFontSize} onChange={v => onChange('nameFontSize', v)} min={8} max={32} /></Field>
              <Field label="Peso">
                <SelectInput value={p.nameWeight} onChange={v => onChange('nameWeight', v)} options={[
                  { value: 'normal', label: 'Normal' }, { value: '500', label: 'Médio' }, { value: '600', label: 'Semibold' }, { value: '700', label: 'Bold' },
                ]} />
              </Field>
            </div>
            <Field label="Cor do Nome"><ColorInput value={p.nameColor} onChange={v => onChange('nameColor', v)} /></Field>
          </div>

          <div className="space-y-2 p-2 bg-gray-50 rounded-md">
            <span className="text-[10px] font-semibold text-gray-400 uppercase">Estilo do Preço</span>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tamanho"><NumberInput value={p.priceFontSize} onChange={v => onChange('priceFontSize', v)} min={8} max={48} /></Field>
              <Field label="Peso">
                <SelectInput value={p.priceWeight} onChange={v => onChange('priceWeight', v)} options={[
                  { value: 'normal', label: 'Normal' }, { value: '500', label: 'Médio' }, { value: '600', label: 'Semibold' }, { value: '700', label: 'Bold' },
                ]} />
              </Field>
            </div>
            <Field label="Cor do Preço"><ColorInput value={p.priceColor} onChange={v => onChange('priceColor', v)} /></Field>
            <Field label="Cor do Preço Comparativo"><ColorInput value={p.comparePriceColor} onChange={v => onChange('comparePriceColor', v)} /></Field>
          </div>

          <div className="space-y-2 p-2 bg-gray-50 rounded-md">
            <span className="text-[10px] font-semibold text-gray-400 uppercase">Card do Produto</span>
            <Field label="Padding Interno"><NumberInput value={p.productPadding} onChange={v => onChange('productPadding', v)} min={0} max={32} /></Field>
            <Field label="Cor da Borda"><ColorInput value={p.productBorderColor} onChange={v => onChange('productBorderColor', v)} /></Field>
            <Field label="Border Radius"><NumberInput value={p.productBorderRadius} onChange={v => onChange('productBorderRadius', v)} min={0} max={32} /></Field>
          </div>

          {commonTail()}
        </div>
      )

    case 'abandoned-cart':
      return (
        <div className="space-y-3">
          <Field label="Título"><TextInput value={p.title} onChange={v => onChange('title', v)} /></Field>
          <Field label="Subtítulo"><TextInput value={p.subtitle} onChange={v => onChange('subtitle', v)} /></Field>
          <Field label="Texto do Botão"><TextInput value={p.buttonText} onChange={v => onChange('buttonText', v)} /></Field>
          <Field label="Cor do Botão"><ColorInput value={p.buttonColor} onChange={v => onChange('buttonColor', v)} /></Field>
          <Field label="Cor do Texto do Botão"><ColorInput value={p.buttonTextColor} onChange={v => onChange('buttonTextColor', v)} /></Field>
          <Field label="Máx. de Itens"><NumberInput value={p.maxItems} onChange={v => onChange('maxItems', v)} min={1} max={10} /></Field>
          <div className="space-y-1">
            <Toggle value={p.showImage} onChange={v => onChange('showImage', v)} label="Mostrar imagem" />
            <Toggle value={p.showPrice} onChange={v => onChange('showPrice', v)} label="Mostrar preço" />
            <Toggle value={p.showQuantity} onChange={v => onChange('showQuantity', v)} label="Mostrar quantidade" />
          </div>
          {commonTail()}
        </div>
      )

    case 'coupon':
      return (
        <div className="space-y-3">
          <Field label="Texto do Cabeçalho"><TextInput value={p.headerText} onChange={v => onChange('headerText', v)} /></Field>
          <Field label="Código do Cupom"><TextInput value={p.code} onChange={v => onChange('code', v)} /></Field>
          <Field label="Texto do Rodapé"><TextInput value={p.footerText} onChange={v => onChange('footerText', v)} /></Field>
          <Field label="Tamanho da Fonte do Código"><NumberInput value={p.codeFontSize} onChange={v => onChange('codeFontSize', v)} min={12} max={64} /></Field>
          <Field label="Cor do Código"><ColorInput value={p.codeColor} onChange={v => onChange('codeColor', v)} /></Field>
          <Field label="Estilo da Borda">
            <SelectInput value={p.borderStyle} onChange={v => onChange('borderStyle', v)} options={[
              { value: 'solid', label: 'Sólido' }, { value: 'dashed', label: 'Tracejado' }, { value: 'dotted', label: 'Pontilhado' },
            ]} />
          </Field>
          <Field label="Cor da Borda"><ColorInput value={p.borderColor} onChange={v => onChange('borderColor', v)} /></Field>
          <Field label="Border Radius"><NumberInput value={p.borderRadius} onChange={v => onChange('borderRadius', v)} min={0} max={32} /></Field>
          {commonTail()}
        </div>
      )

    default:
      return <p className="text-xs text-gray-400 p-3">Selecione um bloco para editar</p>
  }
}
