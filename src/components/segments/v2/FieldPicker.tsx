'use client'

// FieldPicker — Klaviyo-style typeahead for picking a field from the
// catalog. Groups by category, supports keyboard navigation, filters
// as the user types. Used for both ProfileRule fields and EventRule
// property sub-filters.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ChevronDown } from 'lucide-react'
import { FIELD_CATALOG, CATEGORY_LABELS, FIELD_INDEX } from '@/lib/segments/catalog'
import type { FieldDef, FieldCategory } from '@/lib/segments/catalog'

interface Props {
  value: string | null
  onChange: (key: string) => void
  // When set, restricts the picker to fields whose `category` is in
  // this list. Useful for event sub-filter pickers (which only show
  // properties of a specific event, not the full catalog).
  filterCategories?: FieldCategory[]
  customFields?: FieldDef[]  // event property sub-filters get injected here
  placeholder?: string
  compact?: boolean
}

export function FieldPicker({ value, onChange, filterCategories, customFields, placeholder = 'Selecione um campo', compact }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const universe = customFields ?? FIELD_CATALOG
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let pool = universe
    if (filterCategories?.length) {
      pool = pool.filter((f) => filterCategories.includes(f.category))
    }
    if (q) {
      pool = pool.filter((f) =>
        f.label.toLowerCase().includes(q) ||
        f.key.toLowerCase().includes(q) ||
        CATEGORY_LABELS[f.category].toLowerCase().includes(q)
      )
    }
    return pool
  }, [query, filterCategories, universe])

  // Group results by category for display
  const grouped = useMemo(() => {
    const out = new Map<FieldCategory, FieldDef[]>()
    for (const f of filtered) {
      const arr = out.get(f.category) || []
      arr.push(f)
      out.set(f.category, arr)
    }
    return [...out.entries()]
  }, [filtered])

  const selected = value ? (FIELD_INDEX[value] || customFields?.find((f) => f.key === value)) : null

  return (
    <div ref={rootRef} className="relative inline-block w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full inline-flex items-center justify-between gap-2 px-3 rounded-lg border border-gray-200 bg-white text-left text-sm hover:border-gray-300 transition-colors ${compact ? 'py-1.5' : 'py-2'}`}
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} className="text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[280px] max-h-[360px] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg flex flex-col">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-2">
            <Search size={14} className="text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar campo..."
              className="flex-1 text-sm outline-none placeholder:text-gray-400"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {grouped.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">Nenhum campo encontrado</p>
            ) : (
              grouped.map(([category, items]) => (
                <div key={category}>
                  <p className="sticky top-0 px-3 py-1.5 bg-gray-50 text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    {CATEGORY_LABELS[category]}
                  </p>
                  {items.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => {
                        onChange(f.key)
                        setOpen(false)
                        setQuery('')
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-brand-50 flex items-center justify-between gap-2 transition-colors ${
                        value === f.key ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700'
                      }`}
                    >
                      <span>{f.label}</span>
                      <span className="text-[10px] uppercase tracking-wider text-gray-400">{f.type}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
