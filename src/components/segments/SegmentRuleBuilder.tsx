'use client'

// =============================================
// WORDER: Visual Segment Rule Builder
// /components/segments/SegmentRuleBuilder.tsx
//
// Klaviyo/Omnisend-style drag-and-rearrange rule builder.
// Produz o mesmo shape que o resolver consome:
//   { logic: 'and'|'or', rules: [Rule, ...] }
//
// Cada Rule:
//   - field (email, total_orders, last_order_date, has_event, etc.)
//   - operator (equals, contains, gte, has_event, no_event_since,...)
//   - value
//   - event_type / within_days quando o operator é comportamental
//
// Permite aninhar grupos (AND/OR misturados) com indentação visual,
// adicionar/remover regras inline e arrastar pra reordenar.
// =============================================

import { useState, useCallback } from 'react'
import { Plus, X, GripVertical, ChevronDown } from 'lucide-react'

export type Rule = {
  field?: string
  operator?: string
  value?: any
  event_type?: string
  within_days?: number
  rules?: Rule[]
  logic?: 'and' | 'or'
}

interface FieldDef {
  key: string
  label: string
  type: 'string' | 'number' | 'date' | 'enum' | 'boolean' | 'event'
  operators: string[]
  enumValues?: { value: string; label: string }[]
}

// Catálogo de campos disponíveis (limitado a colunas reais em
// contacts + RFM + comportamento). Adicionar mais é sem-graça.
const FIELDS: FieldDef[] = [
  { key: 'email', label: 'Email', type: 'string', operators: ['equals', 'contains', 'starts_with', 'ends_with', 'is_not_null'] },
  { key: 'first_name', label: 'Primeiro nome', type: 'string', operators: ['equals', 'contains', 'is_null'] },
  { key: 'phone', label: 'Telefone', type: 'string', operators: ['is_not_null', 'is_null', 'starts_with'] },
  { key: 'total_orders', label: 'Total de pedidos', type: 'number', operators: ['equals', 'gte', 'lte', 'between'] },
  { key: 'total_revenue', label: 'Receita lifetime', type: 'number', operators: ['gte', 'lte', 'between'] },
  { key: 'last_order_date', label: 'Último pedido', type: 'date', operators: ['gte', 'lte', 'between', 'is_null'] },
  { key: 'created_at', label: 'Criado em', type: 'date', operators: ['gte', 'lte', 'between'] },
  { key: 'last_active_at', label: 'Última atividade', type: 'date', operators: ['gte', 'lte'] },
  {
    key: 'lifecycle_stage', label: 'Lifecycle stage', type: 'enum',
    operators: ['equals', 'not_equals', 'in'],
    enumValues: [
      { value: 'subscriber', label: 'Inscrito' },
      { value: 'customer', label: 'Cliente' },
      { value: 'repeat_customer', label: 'Cliente recorrente' },
      { value: 'vip', label: 'VIP' },
    ],
  },
  { key: 'is_subscribed_email', label: 'Inscrito (email)', type: 'boolean', operators: ['equals'] },
  { key: 'tags', label: 'Tags', type: 'string', operators: ['has_tag', 'not_has_tag'] },
  // Behavioral
  { key: 'has_event', label: 'Fez evento', type: 'event', operators: ['has_event', 'no_event_since'] },
]

const EVENT_TYPES = [
  { value: 'placed_order', label: 'Comprou' },
  { value: 'viewed_product', label: 'Viu produto' },
  { value: 'added_to_cart', label: 'Adicionou ao carrinho' },
  { value: 'started_checkout', label: 'Iniciou checkout' },
  { value: 'email_opened', label: 'Abriu email' },
  { value: 'email_clicked', label: 'Clicou em email' },
  { value: 'subscribed', label: 'Se inscreveu' },
]

const OP_LABELS: Record<string, string> = {
  equals: 'é igual a',
  not_equals: 'não é',
  contains: 'contém',
  not_contains: 'não contém',
  starts_with: 'começa com',
  ends_with: 'termina com',
  gte: 'maior ou igual',
  lte: 'menor ou igual',
  greater_than: 'maior que',
  less_than: 'menor que',
  between: 'entre',
  in: 'está em',
  not_in: 'não está em',
  is_null: 'está vazio',
  is_not_null: 'não está vazio',
  has_event: 'fez',
  no_event_since: 'não fez nos últimos',
  has_tag: 'tem tag',
  not_has_tag: 'não tem tag',
}

interface SegmentRuleBuilderProps {
  conditions: { logic: 'and' | 'or'; rules: Rule[] }
  onChange: (conditions: { logic: 'and' | 'or'; rules: Rule[] }) => void
}

export default function SegmentRuleBuilder({ conditions, onChange }: SegmentRuleBuilderProps) {
  const updateRoot = useCallback(
    (next: Partial<{ logic: 'and' | 'or'; rules: Rule[] }>) => {
      onChange({ ...conditions, ...next })
    },
    [conditions, onChange]
  )

  const addRule = () => {
    updateRoot({
      rules: [...conditions.rules, { field: 'email', operator: 'is_not_null', value: '' }],
    })
  }

  const addGroup = () => {
    updateRoot({
      rules: [
        ...conditions.rules,
        { logic: 'and', rules: [{ field: 'email', operator: 'is_not_null', value: '' }] },
      ],
    })
  }

  const updateRule = (idx: number, partial: Partial<Rule>) => {
    const next = [...conditions.rules]
    next[idx] = { ...next[idx], ...partial }
    updateRoot({ rules: next })
  }

  const removeRule = (idx: number) => {
    const next = conditions.rules.filter((_, i) => i !== idx)
    updateRoot({ rules: next })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[13px] font-semibold text-gray-700">Contatos que correspondem a</span>
        <LogicToggle value={conditions.logic} onChange={(v) => updateRoot({ logic: v })} />
        <span className="text-[13px] text-gray-500">das regras abaixo</span>
      </div>

      <div className="space-y-2">
        {conditions.rules.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
            Sem regras ainda. Adicione uma pra começar.
          </div>
        ) : (
          conditions.rules.map((rule, idx) => (
            <RuleRow
              key={idx}
              rule={rule}
              onChange={(partial) => updateRule(idx, partial)}
              onRemove={() => removeRule(idx)}
            />
          ))
        )}
      </div>

      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={addRule}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar regra
        </button>
        <button
          onClick={addGroup}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar grupo
        </button>
      </div>
    </div>
  )
}

function LogicToggle({ value, onChange }: { value: 'and' | 'or'; onChange: (v: 'and' | 'or') => void }) {
  return (
    <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
      <button
        onClick={() => onChange('and')}
        className={`px-2.5 py-1 text-[12px] font-semibold rounded-md transition-colors ${
          value === 'and' ? 'bg-white text-zinc-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        TODAS (E)
      </button>
      <button
        onClick={() => onChange('or')}
        className={`px-2.5 py-1 text-[12px] font-semibold rounded-md transition-colors ${
          value === 'or' ? 'bg-white text-zinc-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        QUALQUER (OU)
      </button>
    </div>
  )
}

function RuleRow({
  rule,
  onChange,
  onRemove,
}: {
  rule: Rule
  onChange: (partial: Partial<Rule>) => void
  onRemove: () => void
}) {
  // Nested group: render recursively with indentation.
  if (rule.rules) {
    return (
      <div className="ml-6 border-l-2 border-gray-200 pl-4 py-2 relative">
        <button onClick={onRemove} className="absolute -left-3 top-3 bg-white border border-gray-200 rounded-full p-0.5 text-gray-400 hover:text-red-500">
          <X className="w-3 h-3" />
        </button>
        <SegmentRuleBuilder
          conditions={{ logic: rule.logic || 'and', rules: rule.rules || [] }}
          onChange={(c) => onChange({ logic: c.logic, rules: c.rules })}
        />
      </div>
    )
  }

  const field = FIELDS.find((f) => f.key === rule.field) || FIELDS[0]
  const isEvent = field.type === 'event'

  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5 border border-transparent hover:border-gray-200 transition-colors group">
      <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-400 cursor-grab" />

      {/* Field selector */}
      <Select
        value={rule.field || field.key}
        onChange={(v) => {
          const newField = FIELDS.find((f) => f.key === v) || FIELDS[0]
          onChange({
            field: v,
            operator: newField.operators[0],
            value: newField.type === 'event' ? '' : (newField.type === 'boolean' ? true : ''),
            event_type: newField.type === 'event' ? 'placed_order' : undefined,
            within_days: newField.type === 'event' ? 30 : undefined,
          })
        }}
        options={FIELDS.map((f) => ({ value: f.key, label: f.label }))}
        className="min-w-[150px]"
      />

      {/* Event sub-field */}
      {isEvent && (
        <Select
          value={rule.event_type || 'placed_order'}
          onChange={(v) => onChange({ event_type: v })}
          options={EVENT_TYPES}
          className="min-w-[160px]"
        />
      )}

      {/* Operator */}
      <Select
        value={rule.operator || field.operators[0]}
        onChange={(v) => onChange({ operator: v })}
        options={field.operators.map((op) => ({ value: op, label: OP_LABELS[op] || op }))}
        className="min-w-[130px]"
      />

      {/* Value input */}
      {!['is_null', 'is_not_null'].includes(rule.operator || '') && (
        isEvent ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              value={rule.within_days ?? 30}
              onChange={(e) => onChange({ within_days: Number(e.target.value) || 30 })}
              className="w-16 bg-white border border-gray-200 rounded-md px-2 py-1.5 text-[13px] focus:outline-none focus:border-zinc-400"
            />
            <span className="text-[12px] text-gray-500">dias</span>
          </div>
        ) : field.type === 'enum' ? (
          <Select
            value={rule.value || ''}
            onChange={(v) => onChange({ value: v })}
            options={field.enumValues || []}
            className="min-w-[140px]"
          />
        ) : field.type === 'boolean' ? (
          <Select
            value={String(rule.value ?? true)}
            onChange={(v) => onChange({ value: v === 'true' })}
            options={[{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]}
            className="min-w-[80px]"
          />
        ) : field.type === 'number' ? (
          <input
            type="number"
            value={rule.value ?? ''}
            onChange={(e) => onChange({ value: e.target.value === '' ? '' : Number(e.target.value) })}
            className="w-24 bg-white border border-gray-200 rounded-md px-2 py-1.5 text-[13px] focus:outline-none focus:border-zinc-400"
          />
        ) : field.type === 'date' ? (
          <input
            type="date"
            value={rule.value || ''}
            onChange={(e) => onChange({ value: e.target.value })}
            className="bg-white border border-gray-200 rounded-md px-2 py-1.5 text-[13px] focus:outline-none focus:border-zinc-400"
          />
        ) : (
          <input
            type="text"
            value={rule.value ?? ''}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="Valor"
            className="min-w-[150px] bg-white border border-gray-200 rounded-md px-2 py-1.5 text-[13px] focus:outline-none focus:border-zinc-400"
          />
        )
      )}

      <button
        onClick={onRemove}
        className="ml-auto p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
        title="Remover regra"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function Select({
  value,
  onChange,
  options,
  className,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <div className={`relative ${className || ''}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-white border border-gray-200 rounded-md pl-2.5 pr-7 py-1.5 text-[13px] text-gray-800 cursor-pointer hover:border-gray-300 focus:outline-none focus:border-zinc-400 transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
    </div>
  )
}
