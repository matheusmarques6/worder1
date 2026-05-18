'use client'

// OperatorPicker — Klaviyo-style operator dropdown. The available
// options are derived from the field's type (string/number/date/
// boolean/enum/string_array) so the user never sees an invalid
// combination.

import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FieldType } from '@/lib/segments/dsl'
import { OPERATORS_BY_TYPE, OPERATOR_LABELS } from '@/lib/segments/catalog'

interface Props {
  fieldType: FieldType | null
  value: string | null
  onChange: (op: string) => void
  compact?: boolean
}

export function OperatorPicker({ fieldType, value, onChange, compact }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const ops = fieldType ? OPERATORS_BY_TYPE[fieldType] : []
  const label = value ? OPERATOR_LABELS[value] || value : 'Selecione…'

  return (
    <div ref={root} className="relative inline-block w-full">
      <button
        type="button"
        disabled={!fieldType}
        onClick={() => setOpen((v) => !v)}
        className={`w-full inline-flex items-center justify-between gap-2 px-3 rounded-lg border border-gray-200 bg-white text-left text-sm hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${compact ? 'py-1.5' : 'py-2'}`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{label}</span>
        <ChevronDown size={14} className="text-gray-400 shrink-0" />
      </button>

      {open && fieldType && (
        <div className="absolute z-30 mt-1 min-w-[200px] max-h-[300px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          {ops.map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => {
                onChange(op)
                setOpen(false)
              }}
              className={`w-full px-3 py-1.5 text-left text-sm hover:bg-brand-50 transition-colors ${
                value === op ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700'
              }`}
            >
              {OPERATOR_LABELS[op] || op}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
