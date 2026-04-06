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

interface BlockPaletteProps {
  onAddBlock: (type: string) => void
  onAddSavedBlock?: (block: EmailBlock) => void
}

export function BlockPalette({ onAddBlock, onAddSavedBlock }: BlockPaletteProps) {
  const [tab, setTab] = useState<'blocks' | 'saved' | 'tags'>('blocks')
  const [savedBlocks, setSavedBlocks] = useState<any[]>([])
  const [copiedTag, setCopiedTag] = useState('')

  useEffect(() => {
    if (tab === 'saved') {
      fetch('/api/email/saved-blocks').then(r => r.json()).then(d => setSavedBlocks(d.blocks || [])).catch(() => {})
    }
  }, [tab])

  const categories = ['Layout', 'Conteúdo', 'E-commerce', 'Estrutura']

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

        {/* Saved blocks */}
        {tab === 'saved' && (
          <div>
            {savedBlocks.length === 0 ? (
              <div className="text-center py-10">
                <span className="mb-2 block"><Package className="w-8 h-8 text-gray-400 mx-auto" /></span>
                <p className="text-xs text-gray-500 font-medium">Nenhum bloco salvo</p>
                <p className="text-[10px] text-gray-400 mt-1">Selecione um bloco e salve como reutilizável</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {savedBlocks.map((sb: any) => (
                  <button key={sb.id} onClick={() => onAddSavedBlock?.(sb.block_json)}
                    className="w-full flex items-center gap-2.5 p-3 bg-white border border-gray-200 rounded-lg hover:border-brand-400 transition-all text-left">
                    <span className="text-base"><Package className="w-4 h-4 text-gray-500" /></span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{sb.name}</p>
                      <p className="text-[10px] text-gray-400">{sb.category}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Merge tags */}
        {tab === 'tags' && (
          <div className="space-y-4">
            <p className="text-[10px] text-gray-400">Clique para copiar</p>
            {MERGE_TAGS.map(group => (
              <div key={group.name}>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.06em] mb-1.5">
                  {(() => { const MIcon = MERGE_ICON_MAP[group.icon]; return MIcon ? <MIcon className="w-3 h-3 text-gray-400 inline-block align-middle" /> : null })()}{' '}{group.name}
                </p>
                <div className="space-y-1">
                  {group.tags.map(tag => (
                    <button key={tag.value} onClick={() => copyTag(tag.value)}
                      className="w-full flex items-center justify-between p-2 bg-white border border-gray-200 rounded-md hover:border-brand-400 transition-all text-left group">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-gray-700">{tag.name}</p>
                        <p className="text-[10px] font-mono text-gray-400 truncate">{tag.value}</p>
                      </div>
                      <span className="text-[10px] text-gray-300 group-hover:text-brand-500 flex-shrink-0 ml-2 transition-colors">
                        {copiedTag === tag.value ? '✓ copiado' : 'copiar'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
