'use client'

import { useState, useMemo } from 'react'
import { X, Search, User, Store, Package, ShoppingCart, Tag, Link, type LucideIcon } from 'lucide-react'
import { MERGE_TAGS } from '../config/merge-tags'

const MERGE_ICON_MAP: Record<string, LucideIcon> = {
  User, Store, Package, ShoppingCart, Tag, Link,
}

interface MergeTagPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (tagValue: string) => void
}

export function MergeTagPicker({ isOpen, onClose, onSelect }: MergeTagPickerProps) {
  const [search, setSearch] = useState('')
  const [copiedTag, setCopiedTag] = useState('')

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return MERGE_TAGS
    const q = search.toLowerCase()
    return MERGE_TAGS.map(group => ({
      ...group,
      tags: group.tags.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.value.toLowerCase().includes(q) ||
        t.sample.toLowerCase().includes(q)
      ),
    })).filter(g => g.tags.length > 0)
  }, [search])

  const handleSelect = (value: string) => {
    onSelect(value)
    navigator.clipboard.writeText(value).catch(() => {})
    setCopiedTag(value)
    setTimeout(() => setCopiedTag(''), 1500)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[420px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Merge Tags</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar tag..."
              className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500"
              autoFocus
            />
          </div>
        </div>

        {/* Tags list */}
        <div className="flex-1 overflow-y-auto p-3">
          {filteredGroups.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">Nenhuma tag encontrada</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map(group => (
                <div key={group.name}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.06em] mb-2 flex items-center gap-1">
                    {(() => { const MIcon = MERGE_ICON_MAP[group.icon]; return MIcon ? <MIcon className="w-3 h-3 text-gray-400" /> : null })()}{group.name}
                  </p>
                  <div className="space-y-1">
                    {group.tags.map(tag => (
                      <button
                        key={tag.value}
                        onClick={() => handleSelect(tag.value)}
                        className="w-full flex items-center justify-between p-2.5 bg-white border border-gray-200 rounded-lg hover:border-brand-400 hover:bg-brand-50/30 transition-all text-left group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium text-gray-800">{tag.name}</p>
                            <code className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{tag.value}</code>
                          </div>
                          {tag.sample && (
                            <p className="text-[10px] text-gray-400 mt-0.5">Ex: {tag.sample}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-300 group-hover:text-brand-500 flex-shrink-0 ml-2 transition-colors font-medium">
                          {copiedTag === tag.value ? '✓ copiado' : 'inserir'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <p className="text-[10px] text-gray-400 text-center">Clique em uma tag para inserir no campo ativo</p>
        </div>
      </div>
    </div>
  )
}
