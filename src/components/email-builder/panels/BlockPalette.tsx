'use client'

import { useState, useEffect } from 'react'
import { BLOCK_DEFS, type BlockDef } from '../config/types'
import { MERGE_TAGS } from '../config/merge-tags'

interface BlockPaletteProps {
  onAddBlock: (type: string) => void
  onAddSavedBlock?: (block: any) => void
}

export function BlockPalette({ onAddBlock, onAddSavedBlock }: BlockPaletteProps) {
  const [tab, setTab] = useState<'blocks' | 'saved' | 'tags'>('blocks')
  const [savedBlocks, setSavedBlocks] = useState<any[]>([])
  const [copiedTag, setCopiedTag] = useState('')

  useEffect(() => {
    if (tab === 'saved') {
      fetch('/api/email/saved-blocks')
        .then(r => r.json())
        .then(d => setSavedBlocks(d.blocks || []))
        .catch(() => {})
    }
  }, [tab])

  const categories = Array.from(new Set(BLOCK_DEFS.map(b => b.category)))

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
    <div>
      {/* Tab switcher */}
      <div className="flex border-b border-gray-100 mb-3 -mx-3 -mt-1 px-1">
        {[
          { id: 'blocks' as const, label: 'Blocos' },
          { id: 'saved' as const, label: 'Salvos' },
          { id: 'tags' as const, label: 'Tags' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-[10px] font-semibold transition-colors ${tab === t.id ? 'text-brand-600 border-b-2 border-brand-500' : 'text-gray-400'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Blocks tab */}
      {tab === 'blocks' && (
        <div className="space-y-4">
          {categories.map(cat => (
            <div key={cat}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">{cat}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {BLOCK_DEFS.filter(b => b.category === cat).map(def => (
                  <button key={def.type} onClick={() => onAddBlock(def.type)} draggable onDragStart={(e) => handleDragStart(e, def)}
                    className="flex flex-col items-center justify-center gap-1 p-3 bg-white border border-gray-200 rounded-lg hover:border-brand-400 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing text-center">
                    <span className="text-lg leading-none">{def.icon}</span>
                    <span className="text-[10px] font-medium text-gray-600 leading-tight">{def.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Saved blocks tab */}
      {tab === 'saved' && (
        <div>
          {savedBlocks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-gray-400">Nenhum bloco salvo</p>
              <p className="text-[10px] text-gray-300 mt-1">Selecione um bloco e clique em &quot;Salvar como reutilizável&quot;</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {savedBlocks.map((sb: any) => (
                <button key={sb.id} onClick={() => onAddSavedBlock?.(sb.block_json)}
                  className="w-full flex items-center gap-2.5 p-2.5 bg-white border border-gray-200 rounded-lg hover:border-brand-400 transition-all text-left">
                  <span className="text-base">📦</span>
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

      {/* Merge tags tab */}
      {tab === 'tags' && (
        <div className="space-y-3">
          <p className="text-[10px] text-gray-400">Clique para copiar a tag</p>
          {MERGE_TAGS.map(group => (
            <div key={group.name}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{group.icon} {group.name}</p>
              <div className="space-y-1">
                {group.tags.map(tag => (
                  <button key={tag.value} onClick={() => copyTag(tag.value)}
                    className="w-full flex items-center justify-between p-2 bg-white border border-gray-200 rounded-md hover:border-brand-400 transition-all text-left">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-gray-700">{tag.name}</p>
                      <p className="text-[10px] font-mono text-gray-400">{tag.value}</p>
                    </div>
                    <span className="text-[10px] text-gray-300 flex-shrink-0 ml-2">
                      {copiedTag === tag.value ? '✓' : 'copiar'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
