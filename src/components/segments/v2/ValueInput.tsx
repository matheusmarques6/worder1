'use client'

// ValueInput — context-aware value entry for a rule. The shape is
// determined by the field type and operator combination:
//
//   string/number   → 1 input
//   between         → 2 inputs (numbers or dates)
//   enum            → select / multi-select depending on operator
//   boolean         → no input needed (operator carries the meaning)
//   date relative   → number + unit picker (day/week/month)
//   array operators → tag input (comma-separated chips)
//
// The operator and field together fully determine the rendering,
// so this component is the "view" — state lives upstream in the rule.

import { useMemo } from 'react'
import type { FieldDef } from '@/lib/segments/catalog'
import type { FieldType } from '@/lib/segments/dsl'

interface Props {
  field: FieldDef | null
  operator: string | null
  value: unknown
  value2?: unknown
  unit?: 'day' | 'week' | 'month'
  onChange: (next: { value?: unknown; value2?: unknown; unit?: 'day' | 'week' | 'month' }) => void
  compact?: boolean
}

const TWO_INPUT_OPS = new Set(['between', 'between_dates', 'between_relative'])
const NO_INPUT_OPS = new Set(['is_set', 'is_not_set', 'is_null', 'is_not_null', 'is_true', 'is_false', 'is_today', 'is_this_month', 'is_empty', 'is_not_empty']);
const DATE_RELATIVE_OPS = new Set(['in_last', 'not_in_last', 'in_next']);
const ARRAY_VALUE_OPS = new Set(['in', 'not_in', 'contains_any', 'contains_all', 'not_contains_any']);
// month_in / day_of_month_in expose a chip multi-select bounded to 1-12 or 1-31.
// They live in their own shape so we can render localized labels instead of
// raw numbers.
const MONTH_PICKER_OPS = new Set(['month_in']);
const DAY_OF_MONTH_OPS = new Set(['day_of_month_in']);
const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export function ValueInput({ field, operator, value, value2, unit, onChange, compact }: Props) {
  const fieldType: FieldType | null = field?.type ?? null
  const cls = `px-3 rounded-lg border border-gray-200 bg-white text-sm placeholder:text-gray-400 focus:outline-none focus:border-brand-500 ${compact ? 'py-1.5' : 'py-2'}`

  // Computed: which UI shape to render
  const shape = useMemo(() => {
    if (!operator || !fieldType) return 'none'
    if (NO_INPUT_OPS.has(operator)) return 'none'
    if (MONTH_PICKER_OPS.has(operator)) return 'months'
    if (DAY_OF_MONTH_OPS.has(operator)) return 'days_of_month'
    if (TWO_INPUT_OPS.has(operator)) return 'two'
    if (DATE_RELATIVE_OPS.has(operator)) return 'relative'
    if (ARRAY_VALUE_OPS.has(operator)) return 'array'
    return 'one'
  }, [operator, fieldType])

  if (shape === 'none' || !field) return <div />

  if (shape === 'months') {
    const arr = (Array.isArray(value) ? value : []).map(Number).filter((n) => Number.isFinite(n))
    return (
      <div className="flex flex-wrap gap-1.5 w-full">
        {MONTH_NAMES.map((label, i) => {
          const month = i + 1
          const selected = arr.includes(month)
          return (
            <button
              key={month}
              type="button"
              onClick={() => {
                const next = selected ? arr.filter((m) => m !== month) : [...arr, month]
                onChange({ value: next.sort((a, b) => a - b) })
              }}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                selected ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
    )
  }

  if (shape === 'days_of_month') {
    const arr = (Array.isArray(value) ? value : []).map(Number).filter((n) => Number.isFinite(n))
    return (
      <div className="grid grid-cols-7 gap-1 w-full max-w-[280px]">
        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
          const selected = arr.includes(day)
          return (
            <button
              key={day}
              type="button"
              onClick={() => {
                const next = selected ? arr.filter((d) => d !== day) : [...arr, day]
                onChange({ value: next.sort((a, b) => a - b) })
              }}
              className={`px-1 py-1 text-xs rounded border transition-colors ${
                selected ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {day}
            </button>
          )
        })}
      </div>
    )
  }

  // Enum: dropdown
  if (field.enumValues && (operator === 'equals' || operator === 'not_equals')) {
    return (
      <select
        value={(value as string) ?? ''}
        onChange={(e) => onChange({ value: e.target.value })}
        className={`${cls} w-full`}
      >
        <option value="">—</option>
        {field.enumValues.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    )
  }

  if (field.enumValues && (operator === 'in' || operator === 'not_in')) {
    const arr = Array.isArray(value) ? value as string[] : []
    return (
      <div className="flex flex-wrap gap-1.5">
        {field.enumValues.map((opt) => {
          const selected = arr.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                const next = selected ? arr.filter((v) => v !== opt.value) : [...arr, opt.value]
                onChange({ value: next })
              }}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                selected
                  ? 'bg-brand-50 border-brand-500 text-brand-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    )
  }

  if (shape === 'one' && fieldType) {
    const input = renderInput(fieldType, value, (v) => onChange({ value: v }), cls)
    return <div className="w-full">{input}</div>
  }

  if (shape === 'two' && fieldType) {
    return (
      <div className="flex items-center gap-2 w-full">
        {renderInput(fieldType, value, (v) => onChange({ value: v, value2 }), cls + ' w-full')}
        <span className="text-xs text-gray-400">e</span>
        {renderInput(fieldType, value2, (v) => onChange({ value, value2: v }), cls + ' w-full')}
      </div>
    )
  }

  if (shape === 'relative') {
    return (
      <div className="flex items-center gap-2 w-full">
        <input
          type="number"
          value={(value as number) ?? ''}
          onChange={(e) => onChange({ value: e.target.value === '' ? '' : Number(e.target.value), unit })}
          min={0}
          placeholder="30"
          className={`${cls} w-24`}
        />
        <select
          value={unit || 'day'}
          onChange={(e) => onChange({ value, unit: e.target.value as 'day' | 'week' | 'month' })}
          className={`${cls} w-32`}
        >
          <option value="day">dias</option>
          <option value="week">semanas</option>
          <option value="month">meses</option>
        </select>
      </div>
    )
  }

  if (shape === 'array') {
    // Comma-separated chip input for arbitrary value lists.
    const arr = Array.isArray(value) ? value as string[] : []
    return (
      <ChipInput
        chips={arr}
        onChange={(next) => onChange({ value: next })}
        placeholder="Digite e enter para adicionar"
        cls={cls}
      />
    )
  }

  return <div />
}

function renderInput(
  type: FieldType,
  value: unknown,
  onChange: (v: unknown) => void,
  cls: string,
) {
  switch (type) {
    case 'number':
      return (
        <input
          type="number"
          value={(value as number) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className={cls}
        />
      )
    case 'date':
      return (
        <input
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      )
    case 'boolean':
      return (
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value === 'true')}
          className={cls}
        >
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </select>
      )
    case 'string':
    case 'enum':
    case 'string_array':
    default:
      return (
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      )
  }
}

function ChipInput({ chips, onChange, placeholder, cls }: {
  chips: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  cls: string
}) {
  return (
    <div className={`${cls} w-full flex flex-wrap gap-1 items-center min-h-[36px]`}>
      {chips.map((chip, i) => (
        <span key={i} className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 text-xs px-2 py-0.5 rounded-full">
          {chip}
          <button
            type="button"
            onClick={() => onChange(chips.filter((_, idx) => idx !== i))}
            className="text-brand-500 hover:text-brand-700"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            const v = (e.target as HTMLInputElement).value.trim()
            if (v) {
              onChange([...chips, v])
              ;(e.target as HTMLInputElement).value = ''
              e.preventDefault()
            }
          } else if (e.key === 'Backspace' && (e.target as HTMLInputElement).value === '' && chips.length > 0) {
            onChange(chips.slice(0, -1))
          }
        }}
        className="flex-1 outline-none text-sm bg-transparent min-w-[100px]"
      />
    </div>
  )
}
