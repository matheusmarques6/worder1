'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, Check, ChevronDown, Users, Loader2, Plus } from 'lucide-react'
import Link from 'next/link'

export interface SegmentOption {
  id: string
  name: string
  count: number
  description?: string
}

interface SegmentSelectorProps {
  segments: SegmentOption[]
  value: string[]
  onChange: (ids: string[]) => void
  mode?: 'single' | 'multi'
  placeholder?: string
  loading?: boolean
  maxSelections?: number
  emptyMessage?: string
  allowCreate?: boolean
}

const formatNumber = (n: number) =>
  !n || isNaN(n) ? '0' : new Intl.NumberFormat('pt-BR').format(n)

export default function SegmentSelector({
  segments,
  value,
  onChange,
  mode = 'single',
  placeholder = 'Selecione um segmento…',
  loading = false,
  maxSelections = 15,
  emptyMessage = 'Nenhum segmento criado ainda',
  allowCreate = true,
}: SegmentSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const filtered = useMemo(() => {
    if (!search.trim()) return segments
    const q = search.toLowerCase()
    return segments.filter((s) => s.name.toLowerCase().includes(q))
  }, [segments, search])

  const selectedSegments = segments.filter((s) => value.includes(s.id))
  const atLimit = mode === 'multi' && value.length >= maxSelections

  const toggleSegment = (id: string) => {
    if (mode === 'single') {
      onChange([id])
      setOpen(false)
      setSearch('')
      return
    }
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else if (!atLimit) {
      onChange([...value, id])
    }
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between border rounded-lg px-4 py-2.5 text-sm bg-white transition-all ${
          open
            ? 'border-brand-500 ring-2 ring-brand-500/20'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <div className="flex-1 min-w-0 text-left">
          {selectedSegments.length === 0 ? (
            <span className="text-gray-400">{placeholder}</span>
          ) : mode === 'single' ? (
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-500 flex-shrink-0" />
              <span className="font-medium text-gray-900 truncate">{selectedSegments[0].name}</span>
              <span className="text-gray-400 text-xs">
                · {formatNumber(selectedSegments[0].count)} contatos
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              {selectedSegments.slice(0, 3).map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-50 text-brand-700 rounded text-xs font-medium"
                >
                  <Users className="w-3 h-3" />
                  {s.name}
                </span>
              ))}
              {selectedSegments.length > 3 && (
                <span className="text-xs text-gray-500">
                  + {selectedSegments.length - 3} mais
                </span>
              )}
            </div>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-2 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {/* Search */}
          <div className="relative border-b border-gray-100">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              autoFocus
              type="text"
              placeholder="Buscar segmentos…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm text-gray-900 bg-transparent placeholder:text-gray-400 focus:outline-none"
            />
          </div>

          {/* List */}
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center">
                <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-1">
                  {search ? 'Nenhum segmento encontrado' : emptyMessage}
                </p>
                {!search && allowCreate && (
                  <Link
                    href="/segments/new"
                    className="inline-flex items-center gap-1.5 mt-2 text-brand-600 text-sm font-medium hover:text-brand-700"
                  >
                    <Plus className="w-4 h-4" />
                    Criar segmento
                  </Link>
                )}
              </div>
            ) : (
              <ul className="py-1">
                {filtered.map((seg) => {
                  const selected = value.includes(seg.id)
                  const disabled = !selected && atLimit
                  return (
                    <li key={seg.id}>
                      <button
                        type="button"
                        onClick={() => !disabled && toggleSegment(seg.id)}
                        disabled={disabled}
                        className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${
                          selected
                            ? 'bg-brand-50/60 hover:bg-brand-50'
                            : disabled
                            ? 'opacity-40 cursor-not-allowed'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                              selected
                                ? 'bg-brand-500 border-brand-500'
                                : 'border-gray-300'
                            } ${mode === 'single' ? 'rounded-full' : ''}`}
                          >
                            {selected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {seg.name}
                            </p>
                            {seg.description && (
                              <p className="text-xs text-gray-500 truncate mt-0.5">
                                {seg.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 ml-3 flex-shrink-0">
                          {formatNumber(seg.count)} contatos
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {mode === 'multi' && (
            <div className="border-t border-gray-100 px-4 py-2 bg-gray-50/50 text-xs text-gray-500 flex items-center justify-between">
              <span>
                {value.length} de {maxSelections} selecionados
              </span>
              {allowCreate && (
                <Link
                  href="/segments/new"
                  className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 font-medium"
                >
                  <Plus className="w-3 h-3" />
                  Novo
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
