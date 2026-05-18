'use client'

// Modal for creating a new static contact list. Lets the merchant
// pick a creation flow:
//   - Empty manual list
//   - Import from CSV (creates list then redirects to import UI)
//   - From form opt-ins (deferred — points at /forms)

import { useState } from 'react'
import { X, Plus, Upload, FileText, Loader2 } from 'lucide-react'
import { useStoreStore } from '@/stores'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}

type Flow = 'manual' | 'csv' | null

const COLOR_PRESETS = ['#F97316', '#3B82F6', '#10B981', '#A855F7', '#EC4899', '#F59E0B', '#06B6D4', '#EF4444']

export function NewListModal({ open, onClose, onCreated }: Props) {
  const { currentStore } = useStoreStore()
  const [flow, setFlow] = useState<Flow>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(COLOR_PRESETS[0])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  function reset() {
    setFlow(null)
    setName('')
    setDescription('')
    setColor(COLOR_PRESETS[0])
    setError(null)
  }

  async function submit() {
    if (!name.trim()) {
      setError('Dá um nome pra lista pra continuar')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
          source: flow === 'csv' ? 'csv_import' : 'manual',
          store_id: currentStore?.id || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'falha ao criar lista')
      }
      const { list } = await res.json()
      onCreated(list.id)
      reset()
    } catch (err: any) {
      setError(err.message || 'erro inesperado')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {flow === null ? 'Nova lista' : flow === 'manual' ? 'Lista manual' : 'Importar CSV'}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {flow === null ? (
          <div className="p-6">
            <p className="text-sm text-gray-600 mb-4">Como vamos popular essa lista?</p>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => setFlow('manual')}
                className="border border-gray-200 rounded-xl p-4 hover:border-brand-500 hover:bg-brand-50 transition-colors text-left flex items-start gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <Plus size={18} className="text-brand-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Manual</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Adicione contatos manualmente da sua base ou em lote depois.
                  </p>
                </div>
              </button>

              <button
                onClick={() => setFlow('csv')}
                className="border border-gray-200 rounded-xl p-4 hover:border-brand-500 hover:bg-brand-50 transition-colors text-left flex items-start gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Upload size={18} className="text-blue-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Importar CSV</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Crie a lista e suba uma planilha em seguida. Suporta até 50 mil linhas por upload.
                  </p>
                </div>
              </button>

              <a
                href="/forms"
                className="border border-gray-200 rounded-xl p-4 hover:border-brand-500 hover:bg-brand-50 transition-colors text-left flex items-start gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <FileText size={18} className="text-emerald-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Via formulário</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Capture leads pelo seu site — configura na seção Formulários.
                  </p>
                </div>
              </a>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Nome da lista</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: VIPs Black Friday 2026"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Descrição (opcional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Pra que serve essa lista?"
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-brand-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Cor</label>
              <div className="flex gap-2">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full transition-all ${color === c ? 'ring-2 ring-offset-2 ring-gray-900' : ''}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button
            onClick={() => (flow ? setFlow(null) : onClose())}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            {flow ? 'Voltar' : 'Cancelar'}
          </button>
          {flow && (
            <button
              onClick={submit}
              disabled={submitting || !name.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Criar lista
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
