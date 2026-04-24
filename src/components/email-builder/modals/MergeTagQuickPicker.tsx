'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

interface QuickTag {
  label: string
  tag: string
}

const QUICK_TAGS: QuickTag[] = [
  { label: 'Primeiro Nome', tag: '{{first_name}}' },
  { label: 'Sobrenome', tag: '{{last_name}}' },
  { label: 'Email', tag: '{{email}}' },
  { label: 'Nome da Loja', tag: '{{store_name}}' },
  { label: 'URL da Loja', tag: '{{store_url}}' },
  { label: 'Link de Descadastro', tag: '{{unsubscribe_url}}' },
  { label: 'Ver no Navegador', tag: '{{view_in_browser_url}}' },
  { label: 'Codigo do Cupom', tag: '{{coupon_code}}' },
]

interface MergeTagQuickPickerProps {
  onSelect: (tag: string) => void
  onOpenFull?: () => void
  onClose: () => void
  anchorRect?: { top: number; left: number; bottom: number }
}

export function MergeTagQuickPicker({ onSelect, onOpenFull, onClose, anchorRect }: MergeTagQuickPickerProps) {
  const [search, setSearch] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return QUICK_TAGS
    const q = search.toLowerCase()
    return QUICK_TAGS.filter(
      t => t.label.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q)
    )
  }, [search])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const style: React.CSSProperties = {
    position: 'absolute',
    zIndex: 50,
    ...(anchorRect
      ? { top: anchorRect.bottom + 4, left: anchorRect.left }
      : { top: '100%', left: 0 }),
  }

  return (
    <div
      ref={popoverRef}
      style={style}
      className="w-[280px] max-h-[400px] bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col"
    >
      {/* Search */}
      <div className="px-2.5 pt-2.5 pb-2">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar tag..."
            className="w-full pl-7 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#F97316]"
            autoFocus
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Tag list */}
      <div className="flex-1 overflow-y-auto px-2.5 pb-2">
        {filtered.length === 0 ? (
          <p className="text-[11px] text-gray-400 text-center py-4">Nenhuma tag encontrada</p>
        ) : (
          <div className="space-y-0.5">
            {filtered.map(item => (
              <button
                key={item.tag}
                onClick={() => onSelect(item.tag)}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-gray-50 transition-colors text-left group"
              >
                <span className="text-xs text-gray-800">{item.label}</span>
                <code className="text-[11px] font-mono text-gray-400 group-hover:text-[#F97316] transition-colors">
                  {item.tag}
                </code>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {onOpenFull && (
        <div className="px-2.5 py-2 border-t border-gray-200">
          <button
            onClick={onOpenFull}
            className="w-full text-center text-xs font-medium text-[#F97316] hover:text-[#ea6c10] transition-colors py-1"
          >
            Ver todas
          </button>
        </div>
      )}
    </div>
  )
}
