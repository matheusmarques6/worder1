'use client'

// RuleGroup — recursive container with an AND/OR toggle and a list
// of child rules (leaves or nested groups). Klaviyo and Omnisend both
// surface this as a labeled box with the boolean toggle at the top
// and the rules indented below.

import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { RuleGroup as RuleGroupShape, RuleLeaf, ProfileRule } from '@/lib/segments/dsl'
import { RuleRow } from './RuleRow'

interface Props {
  group: RuleGroupShape
  onChange: (next: RuleGroupShape) => void
  // Pass-through so RuleRow can show list options in a dropdown
  lists?: Array<{ id: string; name: string }>
  depth?: number
}

function emptyProfile(): ProfileRule {
  return { type: 'profile', field: '', operator: 'equals' as any, value: undefined }
}

export function RuleGroup({ group, onChange, lists, depth = 0 }: Props) {
  const [adding, setAdding] = useState(false)

  function updateChild(idx: number, next: RuleLeaf | RuleGroupShape) {
    const children = [...group.children]
    children[idx] = next
    onChange({ ...group, children })
  }

  function removeChild(idx: number) {
    const children = group.children.filter((_, i) => i !== idx)
    onChange({ ...group, children })
  }

  function addLeaf(type: 'profile' | 'event' | 'list_membership' | 'consent' | 'segment_membership') {
    let leaf: RuleLeaf
    switch (type) {
      case 'event':
        leaf = { type: 'event', event: '', frequency: { op: 'at_least', value: 1 }, window: { kind: 'all_time' } }
        break
      case 'list_membership':
        leaf = { type: 'list_membership', list_id: '', is_member: true }
        break
      case 'segment_membership':
        leaf = { type: 'segment_membership', segment_id: '', is_member: true }
        break
      case 'consent':
        leaf = { type: 'consent', channel: 'email', status: 'can_receive' }
        break
      case 'profile':
      default:
        leaf = emptyProfile()
    }
    onChange({ ...group, children: [...group.children, leaf] })
    setAdding(false)
  }

  function addGroup() {
    onChange({
      ...group,
      children: [...group.children, { type: 'group', logic: 'AND', children: [emptyProfile()] }],
    })
  }

  const wrapperCls = depth === 0
    ? 'space-y-2'
    : 'bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2'

  return (
    <div className={wrapperCls}>
      {/* Logic toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
          {depth === 0 ? 'Combine' : 'Subgrupo:'}
        </span>
        <div className="inline-flex items-center border border-gray-200 rounded-lg overflow-hidden">
          {(['AND', 'OR'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange({ ...group, logic: opt })}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                group.logic === opt
                  ? 'bg-brand-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt === 'AND' ? 'TODOS' : 'QUALQUER'}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">
          {group.logic === 'AND' ? 'os filtros precisam ser verdadeiros' : 'pelo menos um filtro precisa ser verdadeiro'}
        </span>
      </div>

      {/* Children */}
      <div className="space-y-2">
        {group.children.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-xl p-6 text-center">
            <p className="text-sm text-gray-400">Nenhum filtro ainda. Adicione um abaixo.</p>
          </div>
        ) : (
          group.children.map((child, i) => (
            child.type === 'group' ? (
              <RuleGroup
                key={i}
                group={child}
                onChange={(g) => updateChild(i, g)}
                lists={lists}
                depth={depth + 1}
              />
            ) : (
              <RuleRow
                key={i}
                rule={child}
                onChange={(r) => updateChild(i, r)}
                onRemove={() => removeChild(i)}
                lists={lists}
              />
            )
          ))
        )}
      </div>

      {/* Add row */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
        >
          <Plus size={14} />
          Adicionar filtro
        </button>
        {depth < 3 && (
          <button
            type="button"
            onClick={addGroup}
            className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Plus size={14} />
            Adicionar subgrupo
          </button>
        )}

        {adding && (
          <div className="absolute z-20 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
            <button onClick={() => addLeaf('profile')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
              📋 Atributo do contato <span className="text-gray-400 text-xs">— nome, total_orders, CLV…</span>
            </button>
            <button onClick={() => addLeaf('event')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
              ⚡ Evento <span className="text-gray-400 text-xs">— fez pedido, abriu email…</span>
            </button>
            <button onClick={() => addLeaf('consent')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
              ✉️ Consentimento <span className="text-gray-400 text-xs">— pode receber email/SMS</span>
            </button>
            <button onClick={() => addLeaf('list_membership')} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
              📁 Lista <span className="text-gray-400 text-xs">— está numa lista X</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
