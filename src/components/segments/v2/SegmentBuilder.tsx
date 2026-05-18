'use client'

// SegmentBuilder — top-level layout for the v2 segment builder.
// Composes the AI input, the rule tree, the metadata (name +
// description), and the live preview panel. Owns the rule state.
//
// Used by /audience/segments/new and /audience/segments/[id]/edit.

import { useEffect, useState } from 'react'
import { Sparkle, Loader2 } from 'lucide-react'
import type { SegmentRule, RuleGroup as RuleGroupShape } from '@/lib/segments/dsl'
import { RuleGroup } from './RuleGroup'
import { LivePreviewPanel } from './LivePreviewPanel'
import { AISegmentInput } from './AISegmentInput'

export interface SegmentMetadata {
  name: string
  description: string
  color: string
  storeId: string | null
  organizationId: string
}

interface Props {
  initialRule?: SegmentRule
  initialMetadata?: Partial<SegmentMetadata>
  organizationId: string
  storeId: string | null
  totalContacts?: number
  lists?: Array<{ id: string; name: string }>
  onSave: (rule: SegmentRule, metadata: SegmentMetadata) => Promise<void>
  onCancel: () => void
  submitting?: boolean
}

const EMPTY_RULE: SegmentRule = {
  version: 2,
  root: { type: 'group', logic: 'AND', children: [] },
}

const COLOR_PRESETS = ['#F97316', '#3B82F6', '#10B981', '#A855F7', '#EC4899', '#F59E0B', '#06B6D4', '#EF4444']

export function SegmentBuilder({
  initialRule,
  initialMetadata,
  organizationId,
  storeId,
  totalContacts,
  lists,
  onSave,
  onCancel,
  submitting,
}: Props) {
  const [rule, setRule] = useState<SegmentRule>(initialRule || EMPTY_RULE)
  const [name, setName] = useState(initialMetadata?.name || '')
  const [description, setDescription] = useState(initialMetadata?.description || '')
  const [color, setColor] = useState(initialMetadata?.color || COLOR_PRESETS[0])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialRule) setRule(initialRule)
  }, [initialRule])

  function updateRoot(g: RuleGroupShape) {
    setRule({ ...rule, root: g })
  }

  async function save(activate?: boolean) {
    if (!name.trim()) {
      setError('Dá um nome pro segmento antes de salvar')
      return
    }
    if (rule.root.children.length === 0) {
      setError('Adicione pelo menos um filtro')
      return
    }
    setError(null)
    try {
      await onSave(rule, {
        name: name.trim(),
        description: description.trim(),
        color,
        storeId,
        organizationId,
      })
    } catch (err: any) {
      setError(err.message || 'erro ao salvar')
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-5">
        <AISegmentInput onGenerate={(generatedRule) => setRule(generatedRule)} />

        <section className="bg-gray-50/50 border border-gray-200 rounded-2xl p-5 space-y-4">
          <header>
            <h2 className="text-base font-semibold text-gray-900">Quem entra no segmento?</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Combine filtros para descrever quem deve fazer parte. O segmento se atualiza automaticamente.
            </p>
          </header>
          <RuleGroup group={rule.root} onChange={updateRoot} lists={lists} />
        </section>

        <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Detalhes</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Nome do segmento</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: VIPs com CLV > R$500"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Cor</label>
              <div className="flex gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-gray-900' : ''}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Descrição (opcional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Pra que esse segmento serve?"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500 resize-none"
            />
          </div>
        </section>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <footer className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => save()}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Salvar segmento
          </button>
        </footer>
      </div>

      <div>
        <LivePreviewPanel
          rule={rule}
          organizationId={organizationId}
          storeId={storeId}
          totalContacts={totalContacts}
        />
      </div>
    </div>
  )
}
