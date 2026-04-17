'use client'

import { useState, useMemo } from 'react'
import { X, Search, User, Store, Package, ShoppingCart, Tag, Link, Zap, ShoppingBag, AlertCircle, type LucideIcon } from 'lucide-react'
import { MERGE_TAGS } from '../config/merge-tags'

const MERGE_ICON_MAP: Record<string, LucideIcon> = {
  User, Store, Package, ShoppingCart, Tag, Link, Zap, ShoppingBag,
}

interface MergeTagPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (tagValue: string) => void
  context?: 'campaign' | 'automation'
  triggerType?: string
}

export function MergeTagPicker({ isOpen, onClose, onSelect, context, triggerType }: MergeTagPickerProps) {
  const [search, setSearch] = useState('')
  const [copiedTag, setCopiedTag] = useState('')

  const isAutomation = context === 'automation'

  const availableGroups = useMemo(() => {
    let groups = MERGE_TAGS

    if (!isAutomation) {
      groups = groups.filter(g => !g.name.includes('Evento'))
    }

    if (!search.trim()) return groups
    const q = search.toLowerCase()
    return groups.map(group => ({
      ...group,
      tags: group.tags.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.value.toLowerCase().includes(q) ||
        t.sample.toLowerCase().includes(q)
      ),
    })).filter(g => g.tags.length > 0)
  }, [search, isAutomation])

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

        {/* Context banner */}
        {isAutomation && (
          <div className="mx-4 mt-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg flex items-start gap-2">
            <Zap className="w-3.5 h-3.5 text-violet-500 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-violet-700">
              Tags de <strong>Evento</strong> são preenchidas com dados do gatilho da automação
              {triggerType ? ` (${triggerType})` : ''}.
            </p>
          </div>
        )}

        {/* Tags list */}
        <div className="flex-1 overflow-y-auto p-3">
          {availableGroups.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">Nenhuma tag encontrada</p>
            </div>
          ) : (
            <div className="space-y-4">
              {availableGroups.map(group => (
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
                          <div className="flex items-center gap-2 mt-0.5">
                            {tag.sample && (
                              <p className="text-[10px] text-gray-400">Ex: {tag.sample}</p>
                            )}
                            {tag.hint && (
                              <p className="text-[10px] text-violet-500">{tag.hint}</p>
                            )}
                          </div>
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
