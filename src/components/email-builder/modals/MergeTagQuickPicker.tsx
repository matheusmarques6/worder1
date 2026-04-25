'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
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
  const [activeIdx, setActiveIdx] = useState(-1)
  const popoverRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return QUICK_TAGS
    const q = search.toLowerCase()
    return QUICK_TAGS.filter(
      t => t.label.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q)
    )
  }, [search])

  useEffect(() => { setActiveIdx(-1) }, [search])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIdx >= 0 && activeIdx < filtered.length) {
      e.preventDefault()
      onSelect(filtered[activeIdx].tag)
    }
  }, [onClose, filtered, activeIdx, onSelect])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Viewport-aware positioning
  useEffect(() => {
    if (!popoverRef.current || !anchorRect) return
    const el = popoverRef.current
    const rect = el.getBoundingClientRect()
    if (rect.bottom > window.innerHeight - 8) {
      el.style.top = `${anchorRect.top - rect.height - 4}px`
    }
    if (rect.right > window.innerWidth - 8) {
      el.style.left = `${Math.max(8, window.innerWidth - rect.width - 8 - (popoverRef.current.offsetParent as HTMLElement)?.getBoundingClientRect().left)}px`
    }
  }, [anchorRect])

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
      <div className="px-2.5 pt-2.5 pb-2">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar tag..."
            className="w-full pl-7 pr-7 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#18181B]"
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

      <div className="flex-1 overflow-y-auto px-2.5 pb-2">
        {filtered.length === 0 ? (
          <p className="text-[11px] text-gray-400 text-center py-4">Nenhuma tag encontrada</p>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((item, idx) => (
              <button
                key={item.tag}
                onClick={() => onSelect(item.tag)}
                onMouseEnter={() => setActiveIdx(idx)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md transition-colors text-left group ${
                  idx === activeIdx ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
              >
                <span className="text-xs text-gray-800">{item.label}</span>
                <code className={`text-[11px] font-mono transition-colors ${
                  idx === activeIdx ? 'text-[#18181B]' : 'text-gray-400 group-hover:text-[#18181B]'
                }`}>
                  {item.tag}
                </code>
              </button>
            ))}
          </div>
        )}
      </div>

      {onOpenFull && (
        <div className="px-2.5 py-2 border-t border-gray-200">
          <button
            onClick={onOpenFull}
            className="w-full text-center text-xs font-medium text-[#18181B] hover:text-[#27272A] transition-colors py-1"
          >
            Ver todas
          </button>
        </div>
      )}
    </div>
  )
}
