'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Layers, Plus, Play, Square, Trash2, Trophy } from 'lucide-react'
import { AgentSubPageShell } from '@/components/ai/AgentSubPageShell'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  Badge,
  Spinner,
  Input,
  Textarea,
  Select,
  Num,
} from '@/components/ai/ui/primitives'

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

const STATUS_TONE: Record<ExperimentRow['status'], 'neutral' | 'orange' | 'subtle'> = {
  draft: 'neutral',
  running: 'orange',
  ended: 'subtle',
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
  const [versions, setVersions] = useState<
    { id: string; version_number: number; deploy_notes: string | null }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
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
      setCreateOpen(false)
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
      pageDescription="Compare variantes do agente em produção via A/B test determinístico."
      actions={
        <Button
          variant="cta"
          onClick={() => setCreateOpen(true)}
          leadingIcon={<Plus className="w-3.5 h-3.5" strokeWidth={1.75} />}
        >
          Novo experimento
        </Button>
      }
    >
      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <p className="text-[13px] text-red-700">{error}</p>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : experiments.length === 0 ? (
        <EmptyState
          title="Nenhum experimento ainda"
          description="Crie variantes apontando pra versões diferentes do agente. O hash da conversa determina qual variante cada cliente recebe."
        />
      ) : (
        <div className="space-y-4">
          {experiments.map((exp) => (
            <Card key={exp.id}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-[15px] font-semibold text-[#18181B]">{exp.name}</h4>
                    <Badge tone={STATUS_TONE[exp.status]}>{STATUS_LABEL[exp.status]}</Badge>
                  </div>
                  {exp.description && (
                    <p className="text-[13px] text-[#71717A] mt-1">{exp.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {exp.status === 'draft' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => setStatus(exp, 'running')}
                        leadingIcon={<Play className="w-3 h-3" strokeWidth={1.75} />}
                      >
                        Iniciar
                      </Button>
                      <button
                        onClick={() => removeExperiment(exp)}
                        className="p-1.5 text-[#A1A1AA] hover:text-red-600 hover:bg-red-50 rounded-[6px] transition-colors"
                        title="Remover"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    </>
                  )}
                  {exp.status === 'running' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setStatus(exp, 'ended')}
                      leadingIcon={<Square className="w-3 h-3" strokeWidth={1.75} />}
                    >
                      Finalizar
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {exp.variants.map((v) => {
                  const m = exp.metrics_by_variant[v.id] ?? {}
                  const isWinner = exp.winning_variant === v.id
                  return (
                    <div
                      key={v.id}
                      className={`rounded-[12px] p-4 border ${
                        isWinner
                          ? 'bg-[#FFF7ED] border-[#FED7AA]'
                          : 'bg-[#FAFAFA] border-[#E4E4E7]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-[6px] bg-white border border-[#E4E4E7] text-[11px] font-mono font-bold text-[#52525B]">
                            {v.id}
                          </span>
                          <span className="text-[13px] font-semibold text-[#18181B]">
                            {v.name}
                          </span>
                          {isWinner && (
                            <Trophy
                              className="w-3.5 h-3.5 text-[#C2410C]"
                              strokeWidth={1.75}
                            />
                          )}
                        </div>
                        <span className="text-[12px] font-semibold text-[#71717A]">
                          <Num>{v.traffic_pct}%</Num>
                        </span>
                      </div>
                      {m.executions !== undefined && m.executions > 0 ? (
                        <dl className="grid grid-cols-3 gap-2 text-[11px]">
                          <Stat label="Execuções" value={<Num>{m.executions}</Num>} />
                          <Stat
                            label="Conversão"
                            value={<Num>{((m.conversion_rate ?? 0) * 100).toFixed(1)}%</Num>}
                          />
                          {m.total_revenue_brl ? (
                            <Stat
                              label="Receita"
                              value={
                                <Num>
                                  {m.total_revenue_brl.toLocaleString('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL',
                                  })}
                                </Num>
                              }
                            />
                          ) : null}
                        </dl>
                      ) : (
                        <p className="text-[12px] text-[#A1A1AA]">Sem dados ainda</p>
                      )}
                    </div>
                  )
                })}
              </div>

              <p className="text-[11px] text-[#A1A1AA] mt-4">
                {exp.started_at
                  ? `Iniciado ${new Date(exp.started_at).toLocaleString('pt-BR')}`
                  : `Criado ${new Date(exp.created_at).toLocaleString('pt-BR')}`}
                {exp.ended_at
                  ? ` · Finalizado ${new Date(exp.ended_at).toLocaleString('pt-BR')}`
                  : ''}
              </p>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Novo experimento"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={createExperiment} loading={saving}>
              Criar
            </Button>
          </>
        }
      >
        <Field label="Nome" required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder='Ex.: "Tom mais formal"'
          />
        </Field>
        <Field label="Descrição">
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
          />
        </Field>
        <div>
          <label className="text-[12px] font-semibold text-[#52525B] mb-2 inline-block">
            Variantes
          </label>
          <div className="space-y-2 mb-2">
            {form.variants.map((v, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <Input
                  className="col-span-1 text-center font-mono"
                  value={v.id}
                  onChange={(e) => updateVariant(idx, { id: e.target.value })}
                  placeholder="A"
                />
                <Input
                  className="col-span-5"
                  value={v.name}
                  onChange={(e) => updateVariant(idx, { name: e.target.value })}
                  placeholder="Nome"
                />
                <Select
                  className="col-span-4"
                  value={v.agent_version_id ?? ''}
                  onChange={(e) =>
                    updateVariant(idx, { agent_version_id: e.target.value || null })
                  }
                >
                  <option value="">Estado atual</option>
                  {versions.map((ver) => (
                    <option key={ver.id} value={ver.id}>
                      v{ver.version_number}
                    </option>
                  ))}
                </Select>
                <div className="col-span-2 relative">
                  <Input
                    className="text-right pr-7"
                    type="number"
                    value={v.traffic_pct}
                    onChange={(e) =>
                      updateVariant(idx, { traffic_pct: parseInt(e.target.value, 10) || 0 })
                    }
                    min={0}
                    max={100}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[#A1A1AA]">
                    %
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-[#A1A1AA]">
            Total: <Num>{form.variants.reduce((acc, v) => acc + v.traffic_pct, 0)}%</Num> (precisa
            somar 100)
          </p>
        </div>
      </Modal>
    </AgentSubPageShell>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide font-semibold text-[#A1A1AA]">{label}</dt>
      <dd className="text-[13px] font-semibold text-[#18181B] mt-0.5">{value}</dd>
    </div>
  )
}
