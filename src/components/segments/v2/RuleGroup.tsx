'use client'

// RuleGroup — recursive container with an AND/OR toggle and a list
// of child rules (leaves or nested groups). Klaviyo and Omnisend both
// surface this as a labeled box with the boolean toggle at the top
// and the rules indented below.

import { Plus, ChevronDown, User, Zap, GitBranch, Cake, Mail, FolderClosed, Target } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import type { RuleGroup as RuleGroupShape, RuleLeaf, ProfileRule } from '@/lib/segments/dsl'
import { RuleRow } from './RuleRow'

interface Props {
  group: RuleGroupShape
  onChange: (next: RuleGroupShape) => void
  // Pass-through so RuleRow can show list / segment options
  lists?: Array<{ id: string; name: string }>
  segments?: Array<{ id: string; name: string }>
  currentSegmentId?: string
  depth?: number
}

function emptyProfile(): ProfileRule {
  return { type: 'profile', field: '', operator: 'equals' as any, value: undefined }
}

type LeafKind = 'profile' | 'event' | 'list_membership' | 'consent' | 'segment_membership' | 'anniversary' | 'event_funnel'

const LEAF_OPTIONS: Array<{ kind: LeafKind; icon: React.ComponentType<any>; label: string; hint: string }> = [
  { kind: 'profile',            icon: User,         label: 'Atributo do contato',     hint: 'Nome, total de pedidos, CLV, RFM…' },
  { kind: 'event',              icon: Zap,          label: 'Evento',                  hint: 'Fez pedido, abriu email, viu produto…' },
  { kind: 'event_funnel',       icon: GitBranch,    label: 'Funil de eventos',        hint: 'Sequência ordenada A → B → não C' },
  { kind: 'anniversary',        icon: Cake,         label: 'Data recorrente',         hint: 'Aniversário, mês de primeiro pedido…' },
  { kind: 'consent',            icon: Mail,         label: 'Consentimento',           hint: 'Pode receber email, SMS, WhatsApp' },
  { kind: 'list_membership',    icon: FolderClosed, label: 'Está em uma lista',       hint: 'Membro (ou não) de uma lista estática' },
  { kind: 'segment_membership', icon: Target,       label: 'Está em outro segmento',  hint: 'Composição entre segmentos' },
]

export function RuleGroup({ group, onChange, lists, segments, currentSegmentId, depth = 0 }: Props) {
  const [adding, setAdding] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close add-menu on outside click so it doesn't linger when the
  // merchant clicks elsewhere on the page.
  useEffect(() => {
    if (!adding) return
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setAdding(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [adding])

  function updateChild(idx: number, next: RuleLeaf | RuleGroupShape) {
    const children = [...group.children]
    children[idx] = next
    onChange({ ...group, children })
  }

  function removeChild(idx: number) {
    const children = group.children.filter((_, i) => i !== idx)
    onChange({ ...group, children })
  }

  function addLeaf(kind: LeafKind) {
    let leaf: RuleLeaf
    switch (kind) {
      case 'event':
        leaf = { type: 'event', event: '', frequency: { op: 'at_least', value: 1 }, window: { kind: 'all_time' } }
        break
      case 'event_funnel':
        leaf = {
          type: 'event_funnel',
          steps: [
            { event: '', negate: false },
            { event: '', negate: false },
          ],
          window: { kind: 'last', value: 30, unit: 'day' },
        }
        break
      case 'anniversary':
        leaf = { type: 'anniversary', field: 'birthday', within_next_days: 7 }
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

  const isEmpty = group.children.length === 0
  const isRoot = depth === 0
  const wrapperCls = isRoot
    ? 'space-y-3'
    : 'bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-3'

  return (
    <div className={wrapperCls}>
      {/* Klaviyo-style natural-language header: replaces the cramped
          'COMBINE [TODOS][QUALQUER] os filtros...' line that read as
          a form prompt. Reads as a sentence the merchant can scan. */}
      <div className="flex items-center gap-2 flex-wrap text-sm text-gray-700">
        <span>{isRoot ? 'Inclui contatos que correspondem a' : 'Subgrupo:'}</span>
        <LogicSelect value={group.logic} onChange={(logic) => onChange({ ...group, logic })} />
        <span>{isRoot ? 'dos filtros abaixo' : 'das condições'}</span>
      </div>

      {/* Children */}
      {!isEmpty && (
        <div className="space-y-2">
          {group.children.map((child, i) => (
            child.type === 'group' ? (
              <RuleGroup
                key={i}
                group={child}
                onChange={(g) => updateChild(i, g)}
                lists={lists}
                segments={segments}
                currentSegmentId={currentSegmentId}
                depth={depth + 1}
              />
            ) : (
              <RuleRow
                key={i}
                rule={child}
                onChange={(r) => updateChild(i, r)}
                onRemove={() => removeChild(i)}
                lists={lists}
                segments={segments}
                currentSegmentId={currentSegmentId}
              />
            )
          ))}
        </div>
      )}

      {/* Empty state on root: 3 prominent cards instead of a tiny
          'Adicionar filtro' link under a dashed box. Nested empty
          groups stay compact — they're transient during editing. */}
      {isEmpty && isRoot ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-5">
          <p className="text-center text-sm text-gray-500 mb-4">Comece adicionando seu primeiro filtro</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {LEAF_OPTIONS.slice(0, 3).map((opt) => {
              const Icon = opt.icon
              return (
                <button
                  key={opt.kind}
                  type="button"
                  onClick={() => addLeaf(opt.kind)}
                  className="flex items-start gap-2 p-3 border border-gray-200 rounded-lg hover:border-brand-500 hover:bg-brand-50/40 transition-colors text-left"
                >
                  <Icon size={16} className="text-brand-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                    <p className="text-[11px] text-gray-500 line-clamp-1">{opt.hint}</p>
                  </div>
                </button>
              )
            })}
          </div>
          <div ref={menuRef} className="relative mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="text-xs text-gray-500 hover:text-brand-600 inline-flex items-center gap-1"
            >
              Mais opções <ChevronDown size={12} />
            </button>
            {adding && <AddLeafMenu onPick={addLeaf} alignCenter />}
          </div>
        </div>
      ) : (
        <div ref={menuRef} className="relative inline-flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
          >
            <Plus size={14} />
            Adicionar filtro
          </button>
          {depth < 3 && !isEmpty && (
            <button
              type="button"
              onClick={addGroup}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Plus size={14} />
              Adicionar subgrupo
            </button>
          )}
          {adding && <AddLeafMenu onPick={addLeaf} />}
        </div>
      )}
    </div>
  )
}

// Inline AND/OR dropdown that reads as part of the sentence.
function LogicSelect({ value, onChange }: { value: 'AND' | 'OR'; onChange: (v: 'AND' | 'OR') => void }) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as 'AND' | 'OR')}
        className="appearance-none pr-7 pl-2.5 py-1 text-sm font-medium bg-brand-50 text-brand-700 border border-brand-200 rounded-lg cursor-pointer hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
      >
        <option value="AND">todos</option>
        <option value="OR">qualquer um</option>
      </select>
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-brand-600" />
    </div>
  )
}

function AddLeafMenu({ onPick, alignCenter }: { onPick: (k: LeafKind) => void; alignCenter?: boolean }) {
  return (
    <div className={`absolute z-20 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg py-1 ${alignCenter ? 'left-1/2 -translate-x-1/2' : 'left-0'}`}>
      {LEAF_OPTIONS.map((opt) => {
        const Icon = opt.icon
        return (
          <button
            key={opt.kind}
            type="button"
            onClick={() => onPick(opt.kind)}
            className="w-full flex items-start gap-2 px-3 py-2 hover:bg-gray-50 text-left"
          >
            <Icon size={14} className="text-brand-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm text-gray-900">{opt.label}</p>
              <p className="text-[11px] text-gray-500">{opt.hint}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
