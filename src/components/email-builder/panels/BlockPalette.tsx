'use client'

import { useState, useEffect } from 'react'
import { ShoppingBag, Tag, ShoppingCart, Type, ImageIcon, MousePointerClick, Minus, MoveVertical, Share2, Code, Play, PanelTop, PanelBottom, Columns, Package, User, Store, Package2, Link, LucideIcon, Menu, Layers, Table, Quote, Clock } from 'lucide-react'
import { BLOCK_DEFS, type BlockDef, type EmailBlock } from '../config/types'
import { MERGE_TAGS } from '../config/merge-tags'

const ICON_MAP: Record<string, LucideIcon> = {
  ShoppingBag, Tag, ShoppingCart, Type, Image: ImageIcon, MousePointerClick, Minus, MoveVertical, Share2, Code, Play, PanelTop, PanelBottom, Columns, Menu, Layers, Table, Quote, Clock,
}

const MERGE_ICON_MAP: Record<string, LucideIcon> = {
  User, Store, Package, ShoppingCart, Tag, Link,
}

// ── Pre-built section definitions with SVG previews ──
const PREBUILT_SECTIONS = [
  {
    type: 'hero',
    label: 'Hero',
    description: 'Titulo, subtitulo e botao CTA',
    preview: (
      <div className="w-full bg-[#F9FAFB] rounded-md p-3 space-y-1.5">
        <div className="h-2.5 w-16 bg-gray-300 rounded mx-auto" />
        <div className="h-1.5 w-24 bg-gray-200 rounded mx-auto" />
        <div className="h-5 w-16 bg-gray-800 rounded mx-auto mt-1" />
      </div>
    ),
  },
  {
    type: 'cta',
    label: 'CTA',
    description: 'Chamada para acao com botao destaque',
    preview: (
      <div className="w-full bg-[#F9FAFB] rounded-md p-3 space-y-1.5">
        <div className="h-2 w-20 bg-gray-300 rounded mx-auto" />
        <div className="h-1.5 w-28 bg-gray-200 rounded mx-auto" />
        <div className="h-5 w-full bg-gray-800 rounded mx-auto mt-1" />
      </div>
    ),
  },
  {
    type: 'products',
    label: 'Produtos',
    description: 'Grid de produtos recomendados',
    preview: (
      <div className="w-full bg-white rounded-md p-2 border border-gray-100">
        <div className="h-2 w-16 bg-gray-300 rounded mx-auto mb-2" />
        <div className="grid grid-cols-2 gap-1.5">
          <div className="space-y-1">
            <div className="h-8 bg-gray-100 rounded" />
            <div className="h-1.5 w-8 bg-gray-200 rounded" />
            <div className="h-1 w-6 bg-gray-300 rounded" />
          </div>
          <div className="space-y-1">
            <div className="h-8 bg-gray-100 rounded" />
            <div className="h-1.5 w-8 bg-gray-200 rounded" />
            <div className="h-1 w-6 bg-gray-300 rounded" />
          </div>
        </div>
      </div>
    ),
  },
  {
    type: 'footer',
    label: 'Rodape',
    description: 'Redes sociais + links legais',
    preview: (
      <div className="w-full bg-[#F9FAFB] rounded-md p-3 space-y-1.5">
        <div className="flex justify-center gap-1.5">
          <div className="w-3.5 h-3.5 bg-gray-300 rounded-full" />
          <div className="w-3.5 h-3.5 bg-gray-300 rounded-full" />
          <div className="w-3.5 h-3.5 bg-gray-300 rounded-full" />
        </div>
        <div className="h-1 w-20 bg-gray-200 rounded mx-auto" />
        <div className="h-1 w-16 bg-gray-200 rounded mx-auto" />
      </div>
    ),
  },
  {
    type: 'image-hero',
    label: 'Hero + Imagem',
    description: 'Imagem grande com titulo sobreposto',
    preview: (
      <div className="w-full bg-gray-200 rounded-md p-2 relative overflow-hidden">
        <div className="h-14 bg-gradient-to-b from-gray-300 to-gray-200 rounded" />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="h-2 w-14 bg-white/80 rounded mb-1" />
          <div className="h-4 w-12 bg-gray-800 rounded" />
        </div>
      </div>
    ),
  },
  {
    type: 'testimonial',
    label: 'Depoimento',
    description: 'Citacao com avatar do cliente',
    preview: (
      <div className="w-full bg-white rounded-md p-3 border border-gray-100 space-y-1.5">
        <div className="text-gray-300 text-center text-lg leading-none">&ldquo;</div>
        <div className="h-1.5 w-24 bg-gray-200 rounded mx-auto" />
        <div className="h-1.5 w-20 bg-gray-200 rounded mx-auto" />
        <div className="flex items-center justify-center gap-1 mt-1">
          <div className="w-3 h-3 bg-gray-300 rounded-full" />
          <div className="h-1 w-8 bg-gray-300 rounded" />
        </div>
      </div>
    ),
  },
]

interface BlockPaletteProps {
  onAddBlock: (type: string) => void
  onAddSavedBlock?: (block: EmailBlock) => void
  onAddPrebuiltSection?: (type: string) => void
}

export function BlockPalette({ onAddBlock, onAddSavedBlock, onAddPrebuiltSection }: BlockPaletteProps) {
  const [tab, setTab] = useState<'blocks' | 'prebuilt' | 'saved'>('blocks')
  const [savedBlocks, setSavedBlocks] = useState<any[]>([])
  const [copiedTag, setCopiedTag] = useState('')

  useEffect(() => {
    if (tab === 'saved') {
      fetch('/api/email/saved-blocks').then(r => r.json()).then(d => setSavedBlocks(d.blocks || [])).catch(() => {})
    }
  }, [tab])

  const categories = ['Conteúdo', 'E-commerce', 'Estrutura']

  const handleDragStart = (e: React.DragEvent, def: BlockDef) => {
    e.dataTransfer.setData('blockType', def.type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const copyTag = (value: string) => {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopiedTag(value)
    setTimeout(() => setCopiedTag(''), 1500)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tab switcher */}
      <div className="flex border-b border-gray-200 flex-shrink-0">
        {([
          { id: 'blocks' as const, label: 'Blocos' },
          { id: 'prebuilt' as const, label: 'Pre-built' },
          { id: 'saved' as const, label: 'Salvos' },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors ${tab === t.id ? 'text-gray-900 border-b-2 border-gray-900 -mb-px' : 'text-gray-400 hover:text-gray-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* Blocks tab */}
        {tab === 'blocks' && (
          <div className="space-y-5">
            {categories.map(cat => {
              const blocks = BLOCK_DEFS.filter(b => b.category === cat)
              if (blocks.length === 0) return null
              return (
                <div key={cat}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.06em] mb-2">{cat}</p>
                  <div className="grid grid-cols-3 gap-1">
                    {blocks.map(def => (
                      <button key={def.type} onClick={() => onAddBlock(def.type)} draggable onDragStart={(e) => handleDragStart(e, def)}
                        className="flex flex-col items-center justify-center gap-1 py-2.5 px-1 bg-white border border-gray-100 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all cursor-grab active:cursor-grabbing active:scale-95">
                        <span className="select-none">{(() => { const Icon = ICON_MAP[def.icon]; return Icon ? <Icon className="w-5 h-5 text-gray-500" /> : <span>{def.icon}</span> })()}</span>
                        <span className="text-[10px] font-medium text-gray-600 leading-tight select-none">{def.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pre-built sections tab */}
        {tab === 'prebuilt' && (
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.06em]">Secoes prontas</p>
            <div className="grid grid-cols-2 gap-2">
              {PREBUILT_SECTIONS.map(section => (
                <button
                  key={section.type}
                  onClick={() => onAddPrebuiltSection?.(section.type)}
                  className="flex flex-col bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-brand-400 hover:shadow-md transition-all group text-left"
                >
                  <div className="p-2 bg-gray-50 border-b border-gray-100 flex items-center justify-center min-h-[72px]">
                    {section.preview}
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] font-semibold text-gray-800 group-hover:text-brand-600 transition-colors">{section.label}</p>
                    <p className="text-[9px] text-gray-400 mt-0.5 leading-tight">{section.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Saved / Universal blocks */}
        {tab === 'saved' && (
          <div>
            <p className="text-[10px] text-zinc-400 mb-3 leading-snug">Blocos universais sao reutilizaveis em qualquer email. Arraste para adicionar, ou clique para inserir.</p>
            {savedBlocks.length === 0 ? (
              <div className="text-center py-10">
                <Package className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                <p className="text-[12px] text-zinc-500 font-medium">Nenhum bloco salvo</p>
                <p className="text-[10px] text-zinc-400 mt-1">Selecione um bloco no canvas e clique em<br/>"Salvar como reutilizavel" no menu do bloco</p>
              </div>
            ) : (
              <div className="space-y-2">
                {savedBlocks.map((sb: any) => (
                  <div key={sb.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('savedBlockJson', JSON.stringify(sb.block_json)); e.dataTransfer.effectAllowed = 'copy' }}
                    className="flex items-center gap-2.5 p-3 bg-white border border-zinc-200 rounded-lg hover:border-zinc-400 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing group"
                  >
                    <div className="w-8 h-8 rounded-md bg-zinc-100 flex items-center justify-center flex-shrink-0">
                      <Package className="w-4 h-4 text-zinc-500" />
                    </div>
                    <div className="flex-1 min-w-0" onClick={() => onAddSavedBlock?.(sb.block_json)}>
                      <p className="text-[12px] font-medium text-zinc-900 truncate cursor-pointer hover:text-zinc-700">{sb.name}</p>
                      <p className="text-[10px] text-zinc-400">{sb.category || 'Personalizado'}</p>
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (!confirm(`Excluir bloco "${sb.name}"? Esta acao nao pode ser desfeita.`)) return
                        try {
                          await fetch(`/api/email/saved-blocks/${sb.id}`, { method: 'DELETE' })
                          setSavedBlocks(prev => prev.filter(b => b.id !== sb.id))
                        } catch {}
                      }}
                      className="p-1 text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                      title="Excluir bloco"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
