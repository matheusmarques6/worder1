'use client'

import { useState } from 'react'
import type { EmailBlock } from '../config/types'

interface BlockPropertiesProps {
  block: EmailBlock
  onChange: (key: string, value: any) => void
  onSaveAsReusable?: (block: EmailBlock) => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:border-brand-500 focus:outline-none" />
}

function NumberInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return <input type="number" value={value ?? 0} onChange={e => onChange(Number(e.target.value))} min={min} max={max}
    className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:border-brand-500 focus:outline-none" />
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
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)}
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

export function BlockProperties({ block, onChange, onSaveAsReusable }: BlockPropertiesProps) {
  const p = block.props
  const [savingBlock, setSavingBlock] = useState(false)
  const [showConditions, setShowConditions] = useState(!!p._condition_enabled)

  const handleSaveAsReusable = async () => {
    const name = prompt('Nome do bloco reutilizável:')
    if (!name) return
    setSavingBlock(true)
    try {
      await fetch('/api/email/saved-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, block_json: block }),
      })
      alert('✅ Bloco salvo!')
    } catch { alert('Erro ao salvar') }
    setSavingBlock(false)
  }

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

  const saveSection = onSaveAsReusable ? (
    <div className="border-t border-gray-100 pt-3 mt-3">
      <button onClick={handleSaveAsReusable} disabled={savingBlock}
        className="w-full py-2 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors disabled:opacity-50">
        {savingBlock ? 'Salvando...' : '💾 Salvar como bloco reutilizável'}
      </button>
    </div>
  ) : null

  const common = (
    <>
      <Field label="Padding (px)">
        <NumberInput value={p.padding} onChange={v => onChange('padding', v)} min={0} max={100} />
      </Field>
      {conditionalSection}
      {saveSection}
    </>
  )

  switch (block.type) {
    case 'text':
      return (
        <div className="space-y-3">
          <Field label="Conteúdo">
            <textarea value={p.content || ''} onChange={e => onChange('content', e.target.value)} rows={5}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-900 focus:border-brand-500 focus:outline-none resize-y font-mono" />
          </Field>
          <Field label="Cor do Texto"><ColorInput value={p.color} onChange={v => onChange('color', v)} /></Field>
          <Field label="Tamanho da Fonte"><NumberInput value={p.fontSize} onChange={v => onChange('fontSize', v)} min={10} max={48} /></Field>
          <Field label="Alinhamento">
            <SelectInput value={p.align} onChange={v => onChange('align', v)} options={[
              { value: 'left', label: 'Esquerda' }, { value: 'center', label: 'Centro' }, { value: 'right', label: 'Direita' },
            ]} />
          </Field>
          {common}
        </div>
      )

    case 'image':
      return (
        <div className="space-y-3">
          <Field label="URL da Imagem"><TextInput value={p.src} onChange={v => onChange('src', v)} placeholder="https://..." /></Field>
          <Field label="Texto Alt"><TextInput value={p.alt} onChange={v => onChange('alt', v)} /></Field>
          <Field label="Largura (px)"><NumberInput value={p.width} onChange={v => onChange('width', v)} min={50} max={600} /></Field>
          <Field label="Link (opcional)"><TextInput value={p.href} onChange={v => onChange('href', v)} placeholder="https://..." /></Field>
          {common}
        </div>
      )

    case 'button':
      return (
        <div className="space-y-3">
          <Field label="Texto"><TextInput value={p.text} onChange={v => onChange('text', v)} /></Field>
          <Field label="Link"><TextInput value={p.href} onChange={v => onChange('href', v)} placeholder="https://..." /></Field>
          <Field label="Cor de Fundo"><ColorInput value={p.bgColor} onChange={v => onChange('bgColor', v)} /></Field>
          <Field label="Cor do Texto"><ColorInput value={p.textColor} onChange={v => onChange('textColor', v)} /></Field>
          <Field label="Borda (radius)"><NumberInput value={p.borderRadius} onChange={v => onChange('borderRadius', v)} min={0} max={50} /></Field>
          <Field label="Tamanho da Fonte"><NumberInput value={p.fontSize} onChange={v => onChange('fontSize', v)} min={10} max={30} /></Field>
          <Toggle value={p.fullWidth} onChange={v => onChange('fullWidth', v)} label="Largura total" />
          {common}
        </div>
      )

    case 'divider':
      return (
        <div className="space-y-3">
          <Field label="Cor"><ColorInput value={p.color} onChange={v => onChange('color', v)} /></Field>
          <Field label="Espessura (px)"><NumberInput value={p.thickness} onChange={v => onChange('thickness', v)} min={1} max={10} /></Field>
          {common}
        </div>
      )

    case 'spacer':
      return (
        <div className="space-y-3">
          <Field label="Altura (px)"><NumberInput value={p.height} onChange={v => onChange('height', v)} min={8} max={200} /></Field>
        </div>
      )

    case 'columns':
      return (
        <div className="space-y-3">
          <Field label="Conteúdo Esquerda">
            <textarea value={p.leftContent || ''} onChange={e => onChange('leftContent', e.target.value)} rows={3}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono text-gray-900 focus:border-brand-500 focus:outline-none resize-y" />
          </Field>
          <Field label="Conteúdo Direita">
            <textarea value={p.rightContent || ''} onChange={e => onChange('rightContent', e.target.value)} rows={3}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono text-gray-900 focus:border-brand-500 focus:outline-none resize-y" />
          </Field>
          <Field label="Gap (px)"><NumberInput value={p.gap} onChange={v => onChange('gap', v)} min={0} max={40} /></Field>
          {common}
        </div>
      )

    case 'html':
      return (
        <div className="space-y-3">
          <Field label="Código HTML">
            <textarea value={p.code || ''} onChange={e => onChange('code', e.target.value)} rows={8}
              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-xs font-mono text-gray-900 focus:border-brand-500 focus:outline-none resize-y" />
          </Field>
          {common}
        </div>
      )

    case 'social':
      return (
        <div className="space-y-3">
          <Field label="Instagram"><TextInput value={p.instagram} onChange={v => onChange('instagram', v)} placeholder="URL ou vazio" /></Field>
          <Field label="Facebook"><TextInput value={p.facebook} onChange={v => onChange('facebook', v)} /></Field>
          <Field label="TikTok"><TextInput value={p.tiktok} onChange={v => onChange('tiktok', v)} /></Field>
          <Field label="YouTube"><TextInput value={p.youtube} onChange={v => onChange('youtube', v)} /></Field>
          <Field label="Tamanho dos Ícones"><NumberInput value={p.iconSize} onChange={v => onChange('iconSize', v)} min={16} max={48} /></Field>
          {common}
        </div>
      )

    case 'header':
      return (
        <div className="space-y-3">
          <Field label="URL do Logo"><TextInput value={p.logoSrc} onChange={v => onChange('logoSrc', v)} /></Field>
          <Field label="Largura do Logo"><NumberInput value={p.logoWidth} onChange={v => onChange('logoWidth', v)} min={40} max={400} /></Field>
          <Field label="Cor de Fundo"><ColorInput value={p.bgColor} onChange={v => onChange('bgColor', v)} /></Field>
          {common}
        </div>
      )

    case 'footer':
      return (
        <div className="space-y-3">
          <Field label="Texto"><TextInput value={p.text} onChange={v => onChange('text', v)} /></Field>
          <Toggle value={p.showUnsubscribe} onChange={v => onChange('showUnsubscribe', v)} label="Mostrar link de descadastro" />
          <Field label="Cor de Fundo"><ColorInput value={p.bgColor} onChange={v => onChange('bgColor', v)} /></Field>
          {common}
        </div>
      )

    case 'product-grid':
      return (
        <div className="space-y-3">
          <Field label="Título"><TextInput value={p.title} onChange={v => onChange('title', v)} /></Field>
          <Field label="Colunas">
            <SelectInput value={String(p.columns)} onChange={v => onChange('columns', Number(v))} options={[
              { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' },
            ]} />
          </Field>
          <Field label="Máx. Produtos"><NumberInput value={p.maxProducts} onChange={v => onChange('maxProducts', v)} min={1} max={12} /></Field>
          <Toggle value={p.showPrice} onChange={v => onChange('showPrice', v)} label="Mostrar preço" />
          <Toggle value={p.showButton} onChange={v => onChange('showButton', v)} label="Mostrar botão" />
          <Field label="Texto do Botão"><TextInput value={p.buttonText} onChange={v => onChange('buttonText', v)} /></Field>
          <Field label="Cor do Botão"><ColorInput value={p.buttonColor} onChange={v => onChange('buttonColor', v)} /></Field>
          {common}
        </div>
      )

    case 'coupon':
      return (
        <div className="space-y-3">
          <Field label="Cabeçalho"><TextInput value={p.header} onChange={v => onChange('header', v)} /></Field>
          <Field label="Código do Cupom"><TextInput value={p.code} onChange={v => onChange('code', v)} /></Field>
          <Field label="Texto Inferior"><TextInput value={p.footer} onChange={v => onChange('footer', v)} /></Field>
          <Field label="Cor de Fundo"><ColorInput value={p.bgColor} onChange={v => onChange('bgColor', v)} /></Field>
          <Field label="Cor da Borda"><ColorInput value={p.borderColor} onChange={v => onChange('borderColor', v)} /></Field>
          {common}
        </div>
      )

    default:
      return <p className="text-xs text-gray-400 p-3">Selecione um bloco para editar</p>
  }
}
