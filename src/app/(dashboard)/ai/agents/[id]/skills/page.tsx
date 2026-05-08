'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  X,
  TrendingUp,
} from 'lucide-react'
import { AgentSubPageShell } from '@/components/ai/AgentSubPageShell'

interface SkillRow {
  id: string
  name: string
  description: string | null
  trigger_phrases: string[]
  instructions: string
  enabled: boolean
  total_invocations: number
  total_successes: number
  created_at: string
}

interface SkillForm {
  name: string
  description: string
  triggerPhrases: string
  instructions: string
}

const EMPTY_FORM: SkillForm = {
  name: '',
  description: '',
  triggerPhrases: '',
  instructions: '',
}

export default function AgentSkillsPage() {
  const params = useParams<{ id: string }>()
  const agentId = params.id

  const [skills, setSkills] = useState<SkillRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<SkillForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/skills`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Falha ao carregar')
      setSkills(j.skills ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    load()
  }, [load])

  async function createSkill() {
    if (!form.name.trim() || !form.instructions.trim()) {
      alert('Nome e instruções são obrigatórios')
      return
    }
    const phrases = form.triggerPhrases
      .split(/\n|,/)
      .map((p) => p.trim())
      .filter(Boolean)
    if (phrases.length === 0) {
      alert('Adicione pelo menos uma frase de gatilho')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          trigger_phrases: phrases,
          instructions: form.instructions.trim(),
          enabled: true,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Falha ao criar')
      setShowForm(false)
      setForm(EMPTY_FORM)
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    } finally {
      setSaving(false)
    }
  }

  async function toggleEnabled(skill: SkillRow) {
    const res = await fetch(`/api/ai/agents/${agentId}/skills/${skill.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !skill.enabled }),
    })
    if (res.ok) await load()
  }

  async function removeSkill(skill: SkillRow) {
    if (!confirm(`Remover skill "${skill.name}"?`)) return
    const res = await fetch(`/api/ai/agents/${agentId}/skills/${skill.id}`, {
      method: 'DELETE',
    })
    if (res.ok) await load()
  }

  return (
    <AgentSubPageShell
      agentId={agentId}
      pageTitle="Skills"
      pageDescription="Comportamentos extras disparados por frases-gatilho do cliente."
      actions={
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm
                     font-medium rounded-md hover:bg-orange-600 transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={1.75} />
          Nova skill
        </button>
      }
    >
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" strokeWidth={1.75} />
        </div>
      ) : skills.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-50 mb-3">
            <Sparkles className="w-6 h-6 text-orange-600" strokeWidth={1.75} />
          </div>
          <h3 className="text-base font-semibold text-zinc-900 mb-1">
            Crie sua primeira skill
          </h3>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            Defina frases-gatilho (ex.: "quanto custa", "preço") e instruções extras que o agente
            seguirá quando o cliente mencionar uma delas.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {skills.map((s) => {
            const successRate =
              s.total_invocations > 0
                ? Math.round((s.total_successes / s.total_invocations) * 100)
                : null
            return (
              <div
                key={s.id}
                className="bg-white border border-zinc-200 rounded-xl p-4"
              >
                <div className="flex items-start gap-4">
                  <div className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-orange-50 border border-orange-100 flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-orange-600" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-zinc-900">{s.name}</h4>
                      {!s.enabled && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 border border-zinc-200">
                          Desativada
                        </span>
                      )}
                      {s.total_invocations > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                          <TrendingUp className="w-3 h-3" strokeWidth={1.75} />
                          {s.total_invocations} usos · {successRate}% sucesso
                        </span>
                      )}
                    </div>
                    {s.description && (
                      <p className="text-xs text-zinc-500 mt-0.5">{s.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {s.trigger_phrases.map((p, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-2 py-0.5 text-xs text-zinc-700
                                     bg-zinc-50 border border-zinc-200 rounded-md"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-zinc-600 mt-3 line-clamp-2 whitespace-pre-wrap">
                      {s.instructions}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Toggle enabled={s.enabled} onClick={() => toggleEnabled(s)} />
                    <button
                      onClick={() => removeSkill(s)}
                      className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-md
                                 transition-colors"
                      title="Remover"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4">
          <div className="bg-white rounded-xl border border-zinc-200 w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-900">Nova skill</h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded-md"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="Nome">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder='Ex.: "Modo orçamento"'
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md text-sm
                             focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </Field>
              <Field label="Descrição (opcional)">
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md text-sm
                             focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </Field>
              <Field
                label="Frases-gatilho"
                hint="Uma por linha ou separadas por vírgula. Match por substring (case-insensitive)."
              >
                <textarea
                  value={form.triggerPhrases}
                  onChange={(e) => setForm({ ...form, triggerPhrases: e.target.value })}
                  rows={3}
                  placeholder={'quanto custa\npreço\nvalor'}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md text-sm
                             focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </Field>
              <Field
                label="Instruções"
                hint="Texto que o agente recebe como contexto extra quando a skill é ativada."
              >
                <textarea
                  value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                  rows={5}
                  placeholder="Quando perguntar preço, ofereça opções e pergunte forma de pagamento..."
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md text-sm
                             focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="px-3 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-200
                           rounded-md hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={createSkill}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white
                           bg-orange-500 rounded-md hover:bg-orange-600 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
                Criar skill
              </button>
            </div>
          </div>
        </div>
      )}
    </AgentSubPageShell>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-xs font-medium text-zinc-700 mb-1 block">{label}</label>
      {children}
      {hint && <p className="text-xs text-zinc-400 mt-1">{hint}</p>}
    </div>
  )
}

function Toggle({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={enabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        enabled ? 'bg-orange-500' : 'bg-zinc-200'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
