'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  Beaker,
  Loader2,
  Plus,
  Play,
  Trash2,
  X,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react'
import { AgentSubPageShell } from '@/components/ai/AgentSubPageShell'

interface SimulationRow {
  id: string
  scenario_name: string
  persona_description: string
  vertical: string | null
  status: 'pending' | 'running' | 'success' | 'failure' | 'error'
  ran_at: string | null
  duration_ms: number | null
  eval_score: number | null
  created_at: string
}

interface SimulationDetail extends SimulationRow {
  script_messages: { role: 'user' | 'assistant'; content: string }[]
  eval_criteria: { id: string; description: string }[]
  transcript: {
    role: 'user' | 'assistant'
    content: string
    duration_ms?: number
    cost_usd?: number
  }[] | null
  eval_feedback: {
    per_criterion?: { id: string; passed: boolean; reason: string }[]
  } | null
}

const STATUS_PILL: Record<SimulationRow['status'], string> = {
  pending: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  running: 'bg-orange-50 text-orange-700 border-orange-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failure: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  error: 'bg-red-50 text-red-700 border-red-200',
}

const STATUS_LABEL: Record<SimulationRow['status'], string> = {
  pending: 'Pendente',
  running: 'Rodando',
  success: 'Sucesso',
  failure: 'Falha',
  error: 'Erro',
}

interface NewSimForm {
  scenarioName: string
  personaDescription: string
  scriptMessages: string
  evalCriteria: string
}

const EMPTY_FORM: NewSimForm = {
  scenarioName: '',
  personaDescription: '',
  scriptMessages: '',
  evalCriteria: '',
}

export default function AgentSimulationsPage() {
  const params = useParams<{ id: string }>()
  const agentId = params.id

  const [simulations, setSimulations] = useState<SimulationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewSimForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SimulationDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/simulations`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Falha ao carregar')
      setSimulations(j.simulations ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    load()
  }, [load])

  async function createSimulation() {
    if (!form.scenarioName.trim() || !form.personaDescription.trim()) {
      alert('Cenário e persona são obrigatórios')
      return
    }
    const messages = form.scriptMessages
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((content) => ({ role: 'user' as const, content }))
    if (messages.length === 0) {
      alert('Adicione pelo menos uma mensagem do cliente')
      return
    }
    const criteria = form.evalCriteria
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((description, i) => ({ id: `c${i + 1}`, description }))

    setSaving(true)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/simulations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_name: form.scenarioName.trim(),
          persona_description: form.personaDescription.trim(),
          script_messages: messages,
          eval_criteria: criteria,
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

  async function runSimulation(simId: string) {
    setRunningId(simId)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/simulations/${simId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_rag: false }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Falha ao rodar')
      await load()
      await openDetail(simId)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    } finally {
      setRunningId(null)
    }
  }

  async function openDetail(simId: string) {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/simulations/${simId}`)
      const j = await res.json()
      if (res.ok && j.simulation) setDetail(j.simulation)
    } finally {
      setLoadingDetail(false)
    }
  }

  async function removeSimulation(simId: string) {
    if (!confirm('Remover essa simulação?')) return
    const res = await fetch(`/api/ai/agents/${agentId}/simulations/${simId}`, {
      method: 'DELETE',
    })
    if (res.ok) await load()
  }

  return (
    <AgentSubPageShell
      agentId={agentId}
      pageTitle="Simulações"
      pageDescription="Teste o agente contra um script de mensagens antes de publicar."
      actions={
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm
                     font-medium rounded-md hover:bg-orange-600 transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={1.75} />
          Novo cenário
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
      ) : simulations.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-50 mb-3">
            <Beaker className="w-6 h-6 text-orange-600" strokeWidth={1.75} />
          </div>
          <h3 className="text-base font-semibold text-zinc-900 mb-1">
            Nenhum cenário criado
          </h3>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            Defina uma persona, um script de mensagens e critérios de avaliação. O agente é
            executado em sandbox e pontuado automaticamente.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-xl divide-y divide-zinc-100">
          {simulations.map((s) => (
            <div key={s.id} className="flex items-center gap-4 p-4">
              <div className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-zinc-50 border border-zinc-200 flex-shrink-0">
                <Beaker className="w-4 h-4 text-zinc-500" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold text-zinc-900 truncate">
                    {s.scenario_name}
                  </h4>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                      STATUS_PILL[s.status]
                    }`}
                  >
                    {STATUS_LABEL[s.status]}
                  </span>
                  {s.eval_score !== null && (
                    <span className="text-xs font-medium text-zinc-700">
                      Score {s.eval_score}/5
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5 truncate">
                  {s.persona_description}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {s.ran_at
                    ? `Rodado em ${new Date(s.ran_at).toLocaleString('pt-BR')}`
                    : `Criado em ${new Date(s.created_at).toLocaleString('pt-BR')}`}
                  {s.duration_ms ? ` · ${(s.duration_ms / 1000).toFixed(1)}s` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {(s.status === 'pending' || s.status === 'failure' || s.status === 'error') && (
                  <button
                    onClick={() => runSimulation(s.id)}
                    disabled={runningId === s.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                               text-white bg-orange-500 rounded-md hover:bg-orange-600
                               disabled:opacity-50"
                  >
                    {runningId === s.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
                    ) : (
                      <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
                    )}
                    Rodar
                  </button>
                )}
                {s.status === 'success' && (
                  <button
                    onClick={() => openDetail(s.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                               text-zinc-700 bg-white border border-zinc-200 rounded-md
                               hover:bg-zinc-50"
                  >
                    Ver transcrição
                  </button>
                )}
                <button
                  onClick={() => removeSimulation(s.id)}
                  className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-md
                             transition-colors"
                  title="Remover"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal criar */}
      {showForm && (
        <Modal title="Novo cenário" onClose={() => setShowForm(false)}>
          <Field label="Cenário">
            <input
              type="text"
              value={form.scenarioName}
              onChange={(e) => setForm({ ...form, scenarioName: e.target.value })}
              placeholder='Ex.: "Cliente quer trocar tamanho"'
              className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md text-sm
                         focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </Field>
          <Field label="Persona simulada">
            <textarea
              value={form.personaDescription}
              onChange={(e) => setForm({ ...form, personaDescription: e.target.value })}
              rows={2}
              placeholder="Cliente que comprou camisa P na semana passada e quer trocar por M."
              className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md text-sm
                         focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </Field>
          <Field
            label="Mensagens do cliente"
            hint="Uma por linha. O agente responde a cada uma e o histórico é mantido."
          >
            <textarea
              value={form.scriptMessages}
              onChange={(e) => setForm({ ...form, scriptMessages: e.target.value })}
              rows={4}
              placeholder={'oi, comprei uma camisa P\nqueria trocar pra M\nvocês têm em estoque?'}
              className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md text-sm
                         focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </Field>
          <Field
            label="Critérios de avaliação (opcional)"
            hint="Uma por linha. O avaliador automático pontua passou/falhou em cada uma."
          >
            <textarea
              value={form.evalCriteria}
              onChange={(e) => setForm({ ...form, evalCriteria: e.target.value })}
              rows={3}
              placeholder={'Pediu para verificar estoque\nMencionou prazo de entrega\nNão pediu dados de cartão'}
              className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-md text-sm
                         focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </Field>
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
              onClick={createSimulation}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white
                         bg-orange-500 rounded-md hover:bg-orange-600 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />}
              Criar
            </button>
          </div>
        </Modal>
      )}

      {/* Modal detalhe */}
      {detail && (
        <Modal
          title={detail.scenario_name}
          onClose={() => setDetail(null)}
          wide
        >
          <div className="text-xs text-zinc-500 mb-3">
            Persona: <span className="text-zinc-700">{detail.persona_description}</span>
          </div>
          {loadingDetail ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-400" strokeWidth={1.75} />
            </div>
          ) : (
            <>
              {detail.eval_feedback?.per_criterion && (
                <div className="bg-zinc-50 border border-zinc-200 rounded-md p-3 mb-4 space-y-1.5">
                  {detail.eval_feedback.per_criterion.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 text-xs">
                      {c.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" strokeWidth={1.75} />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" strokeWidth={1.75} />
                      )}
                      <div>
                        <p className="text-zinc-700">
                          {detail.eval_criteria.find((ec) => ec.id === c.id)?.description ?? c.id}
                        </p>
                        <p className="text-zinc-500">{c.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-3">
                {(detail.transcript ?? []).map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                        m.role === 'user'
                          ? 'bg-zinc-100 text-zinc-900'
                          : 'bg-orange-50 text-zinc-900 border border-orange-100'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      {m.duration_ms && (
                        <p className="text-[10px] text-zinc-500 mt-1 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" strokeWidth={1.75} />
                          {(m.duration_ms / 1000).toFixed(1)}s
                          {m.cost_usd ? ` · $${m.cost_usd.toFixed(4)}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Modal>
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
    <div className="mb-3">
      <label className="text-xs font-medium text-zinc-700 mb-1 block">{label}</label>
      {children}
      {hint && <p className="text-xs text-zinc-400 mt-1">{hint}</p>}
    </div>
  )
}

function Modal({
  title,
  onClose,
  wide,
  children,
}: {
  title: string
  onClose: () => void
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4">
      <div
        className={`bg-white rounded-xl border border-zinc-200 w-full ${
          wide ? 'max-w-2xl' : 'max-w-lg'
        } max-h-[90vh] overflow-auto`}
      >
        <div className="flex items-center justify-between p-5 border-b border-zinc-100 sticky top-0 bg-white">
          <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-600 rounded-md"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
