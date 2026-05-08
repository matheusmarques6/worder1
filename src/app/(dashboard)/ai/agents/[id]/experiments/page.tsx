'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  Layers,
  Loader2,
  Plus,
  Play,
  Square,
  Trash2,
  X,
  Trophy,
} from 'lucide-react'
import { AgentSubPageShell } from '@/components/ai/AgentSubPageShell'

interface Variant {
  id: string
  name: string
  agent_version_id?: string | null
  traffic_pct: number
}

interface ExperimentRow {
  id: string
  name: string
  description: string | null
  variants: Variant[]
  status: 'draft' | 'running' | 'ended'
  started_at: string | null
  ended_at: string | null
  winning_variant: string | null
  metrics_by_variant: Record<
    string,
    {
      executions?: number
      converted?: number
      conversion_rate?: number
      total_revenue_brl?: number
      total_cost_usd?: number
    }
  >
  created_at: string
}

const STATUS_PILL: Record<ExperimentRow['status'], string> = {
  draft: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  running: 'bg-orange-50 text-orange-700 border-orange-200',
  ended: 'bg-zinc-50 text-zinc-700 border-zinc-200',
}

const STATUS_LABEL: Record<ExperimentRow['status'], string> = {
  draft: 'Rascunho',
  running: 'Rodando',
  ended: 'Finalizado',
}

interface NewExpForm {
  name: string
  description: string
  variants: Variant[]
}

const EMPTY_FORM: NewExpForm = {
  name: '',
  description: '',
  variants: [
    { id: 'A', name: 'Controle', traffic_pct: 50 },
    { id: 'B', name: 'Tratamento', traffic_pct: 50 },
  ],
}

export default function AgentExperimentsPage() {
  const params = useParams<{ id: string }>()
  const agentId = params.id

  const [experiments, setExperiments] = useState<ExperimentRow[]>([])
  const [versions, setVersions] = useState<{ id: string; version_number: number; deploy_notes: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewExpForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [expRes, verRes] = await Promise.all([
        fetch(`/api/ai/agents/${agentId}/experiments`),
        fetch(`/api/ai/agents/${agentId}/versions`),
      ])
      const ej = await expRes.json()
      const vj = await verRes.json()
      if (!expRes.ok) throw new Error(ej.error || 'Falha ao carregar')
      setExperiments(ej.experiments ?? [])
      setVersions(vj.versions ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    load()
  }, [load])

  async function createExperiment() {
    if (!form.name.trim()) {
      alert('Nome obrigatório')
      return
    }
    const total = form.variants.reduce((acc, v) => acc + v.traffic_pct, 0)
    if (Math.abs(total - 100) > 0.01) {
      alert(`Soma de traffic_pct deve ser 100 (atual: ${total})`)
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/experiments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
          variants: form.variants,
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

  async function setStatus(exp: ExperimentRow, status: 'running' | 'ended') {
    const action = status === 'running' ? 'iniciar' : 'finalizar'
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} esse experimento?`)) return
    const res = await fetch(`/api/ai/agents/${agentId}/experiments/${exp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) await load()
    else alert((await res.json()).error || 'Erro')
  }

  async function removeExperiment(exp: ExperimentRow) {
    if (!confirm('Remover esse experimento (apenas drafts)?')) return
    const res = await fetch(`/api/ai/agents/${agentId}/experiments/${exp.id}`, {
      method: 'DELETE',
    })
    if (res.ok) await load()
    else alert((await res.json()).error || 'Erro')
  }

  function updateVariant(idx: number, patch: Partial<Variant>) {
    const next = [...form.variants]
    next[idx] = { ...next[idx], ...patch }
    setForm({ ...form, variants: next })
  }

  return (
    <AgentSubPageShell
      agentId={agentId}
      pageTitle="Experimentos"
      pageDescription="Compare variantes do agente em produção via A/B test determinístico por conversa."
      actions={
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm
                     font-medium rounded-md hover:bg-orange-600 transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={1.75} />
          Novo experimento
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
      ) : experiments.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-50 mb-3">
            <Layers className="w-6 h-6 text-orange-600" strokeWidth={1.75} />
          </div>
          <h3 className="text-base font-semibold text-zinc-900 mb-1">
            Nenhum experimento ainda
          </h3>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            Crie variantes apontando pra versões diferentes do agente. O hash da conversa determina
            qual variante cada cliente recebe.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <div key={exp.id} className="bg-white border border-zinc-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold text-zinc-900">{exp.name}</h4>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                        STATUS_PILL[exp.status]
                      }`}
                    >
                      {STATUS_LABEL[exp.status]}
                    </span>
                  </div>
                  {exp.description && (
                    <p className="text-xs text-zinc-500 mt-0.5">{exp.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {exp.status === 'draft' && (
                    <>
                      <button
                        onClick={() => setStatus(exp, 'running')}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium
                                   text-white bg-orange-500 rounded-md hover:bg-orange-600"
                      >
                        <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
                        Iniciar
                      </button>
                      <button
                        onClick={() => removeExperiment(exp)}
                        className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    </>
                  )}
                  {exp.status === 'running' && (
                    <button
                      onClick={() => setStatus(exp, 'ended')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium
                                 text-zinc-700 bg-white border border-zinc-200 rounded-md
                                 hover:bg-zinc-50"
                    >
                      <Square className="w-3.5 h-3.5" strokeWidth={1.75} />
                      Finalizar
                    </button>
                  )}
                </div>
              </div>

              {/* Variant cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {exp.variants.map((v) => {
                  const m = exp.metrics_by_variant[v.id] ?? {}
                  const isWinner = exp.winning_variant === v.id
                  return (
                    <div
                      key={v.id}
                      className={`border rounded-md p-3 ${
                        isWinner
                          ? 'bg-orange-50 border-orange-200'
                          : 'bg-zinc-50 border-zinc-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-mono font-semibold text-zinc-700">
                            {v.id}
                          </span>
                          <span className="text-xs text-zinc-700">{v.name}</span>
                          {isWinner && (
                            <Trophy className="w-3.5 h-3.5 text-orange-600" strokeWidth={1.75} />
                          )}
                        </div>
                        <span className="text-xs font-medium text-zinc-500">
                          {v.traffic_pct}%
                        </span>
                      </div>
                      {m.executions !== undefined && m.executions > 0 ? (
                        <div className="text-xs text-zinc-600 space-y-0.5">
                          <div>{m.executions} execuções</div>
                          <div>
                            Conversão: {((m.conversion_rate ?? 0) * 100).toFixed(1)}%
                          </div>
                          {m.total_revenue_brl ? (
                            <div>
                              Receita: R$ {(m.total_revenue_brl ?? 0).toLocaleString('pt-BR')}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-400">Sem dados ainda</p>
                      )}
                    </div>
                  )
                })}
              </div>

              <p className="text-xs text-zinc-400 mt-3">
                {exp.started_at
                  ? `Iniciado ${new Date(exp.started_at).toLocaleString('pt-BR')}`
                  : `Criado ${new Date(exp.created_at).toLocaleString('pt-BR')}`}
                {exp.ended_at ? ` · Finalizado ${new Date(exp.ended_at).toLocaleString('pt-BR')}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4">
          <div className="bg-white rounded-xl border border-zinc-200 w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-5 border-b border-zinc-100 sticky top-0 bg-white">
              <h3 className="text-lg font-semibold text-zinc-900">Novo experimento</h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded-md"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
            <div className="p-5">
              <Field label="Nome">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder='Ex.: "Tom mais formal"'
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md text-sm
                             focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </Field>
              <Field label="Descrição (opcional)">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md text-sm
                             focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
              </Field>
              <div className="text-xs font-medium text-zinc-700 mb-2">Variantes</div>
              <div className="space-y-2 mb-3">
                {form.variants.map((v, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      value={v.id}
                      onChange={(e) => updateVariant(idx, { id: e.target.value })}
                      placeholder="A"
                      className="col-span-1 px-2 py-2 text-center font-mono text-sm border border-zinc-200 rounded-md
                                 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    />
                    <input
                      type="text"
                      value={v.name}
                      onChange={(e) => updateVariant(idx, { name: e.target.value })}
                      placeholder="Nome"
                      className="col-span-5 px-3 py-2 text-sm border border-zinc-200 rounded-md
                                 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    />
                    <select
                      value={v.agent_version_id ?? ''}
                      onChange={(e) =>
                        updateVariant(idx, { agent_version_id: e.target.value || null })
                      }
                      className="col-span-4 px-2 py-2 text-sm border border-zinc-200 rounded-md
                                 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    >
                      <option value="">Estado atual</option>
                      {versions.map((ver) => (
                        <option key={ver.id} value={ver.id}>
                          v{ver.version_number}
                        </option>
                      ))}
                    </select>
                    <div className="col-span-2 relative">
                      <input
                        type="number"
                        value={v.traffic_pct}
                        onChange={(e) =>
                          updateVariant(idx, { traffic_pct: parseInt(e.target.value, 10) || 0 })
                        }
                        min={0}
                        max={100}
                        className="w-full px-2 py-2 pr-6 text-sm text-right border border-zinc-200 rounded-md
                                   focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                        %
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-400 mb-4">
                Total: {form.variants.reduce((acc, v) => acc + v.traffic_pct, 0)}% (precisa somar 100)
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowForm(false)}
                  disabled={saving}
                  className="px-3 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-200
                             rounded-md hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={createExperiment}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white
                             bg-orange-500 rounded-md hover:bg-orange-600 disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
                  Criar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AgentSubPageShell>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="text-xs font-medium text-zinc-700 mb-1 block">{label}</label>
      {children}
    </div>
  )
}
