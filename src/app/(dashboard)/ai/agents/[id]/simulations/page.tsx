'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  Beaker,
  Plus,
  Play,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react'
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
  Num,
} from '@/components/ai/ui/primitives'

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
  transcript:
    | {
        role: 'user' | 'assistant'
        content: string
        duration_ms?: number
        cost_usd?: number
      }[]
    | null
  eval_feedback: {
    per_criterion?: { id: string; passed: boolean; reason: string }[]
  } | null
}

const STATUS_TONE: Record<SimulationRow['status'], 'neutral' | 'orange' | 'success' | 'danger'> = {
  pending: 'neutral',
  running: 'orange',
  success: 'success',
  failure: 'neutral',
  error: 'danger',
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
  const [createOpen, setCreateOpen] = useState(false)
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
      setCreateOpen(false)
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
        <Button
          variant="cta"
          onClick={() => setCreateOpen(true)}
          leadingIcon={<Plus className="w-3.5 h-3.5" strokeWidth={1.75} />}
        >
          Novo cenário
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
      ) : simulations.length === 0 ? (
        <EmptyState
          title="Nenhum cenário criado"
          description="Defina uma persona, um script de mensagens e critérios de avaliação. O agente é executado em sandbox e pontuado automaticamente."
        />
      ) : (
        <Card className="!p-0">
          <ul className="divide-y divide-[#F4F4F5]">
            {simulations.map((s) => (
              <li key={s.id} className="flex items-center gap-4 px-7 py-4">
                <div className="inline-flex items-center justify-center w-9 h-9 rounded-[10px] bg-[#FAFAFA] border border-[#E4E4E7] flex-shrink-0">
                  <Beaker className="w-4 h-4 text-[#71717A]" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-[14px] font-semibold text-[#18181B] truncate">
                      {s.scenario_name}
                    </h4>
                    <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                    {s.eval_score !== null && (
                      <span className="text-[12px] font-semibold text-[#52525B]">
                        Score <Num>{s.eval_score}</Num>/5
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-[#71717A] mt-0.5 truncate">
                    {s.persona_description}
                  </p>
                  <p className="text-[11px] text-[#A1A1AA] mt-0.5">
                    {s.ran_at
                      ? `Rodado em ${new Date(s.ran_at).toLocaleString('pt-BR')}`
                      : `Criado em ${new Date(s.created_at).toLocaleString('pt-BR')}`}
                    {s.duration_ms ? ` · ${(s.duration_ms / 1000).toFixed(1)}s` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {(s.status === 'pending' || s.status === 'failure' || s.status === 'error') && (
                    <Button
                      size="sm"
                      onClick={() => runSimulation(s.id)}
                      loading={runningId === s.id}
                      leadingIcon={<Play className="w-3 h-3" strokeWidth={1.75} />}
                    >
                      Rodar
                    </Button>
                  )}
                  {s.status === 'success' && (
                    <Button variant="secondary" size="sm" onClick={() => openDetail(s.id)}>
                      Ver transcrição
                    </Button>
                  )}
                  <button
                    onClick={() => removeSimulation(s.id)}
                    className="p-1.5 text-[#A1A1AA] hover:text-red-600 hover:bg-red-50 rounded-[6px] transition-colors"
                    title="Remover"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Novo cenário"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={createSimulation} loading={saving}>
              Criar
            </Button>
          </>
        }
      >
        <Field label="Cenário" required>
          <Input
            value={form.scenarioName}
            onChange={(e) => setForm({ ...form, scenarioName: e.target.value })}
            placeholder='Ex.: "Cliente quer trocar tamanho"'
          />
        </Field>
        <Field label="Persona simulada" required>
          <Textarea
            value={form.personaDescription}
            onChange={(e) => setForm({ ...form, personaDescription: e.target.value })}
            rows={2}
            placeholder="Cliente que comprou camisa P na semana passada e quer trocar por M."
          />
        </Field>
        <Field
          label="Mensagens do cliente"
          hint="Uma por linha. O agente responde a cada uma e o histórico é mantido."
          required
        >
          <Textarea
            value={form.scriptMessages}
            onChange={(e) => setForm({ ...form, scriptMessages: e.target.value })}
            rows={4}
            placeholder={'oi, comprei uma camisa P\nqueria trocar pra M\nvocês têm em estoque?'}
          />
        </Field>
        <Field
          label="Critérios de avaliação"
          hint="Uma por linha. O avaliador automático pontua passou/falhou em cada uma."
        >
          <Textarea
            value={form.evalCriteria}
            onChange={(e) => setForm({ ...form, evalCriteria: e.target.value })}
            rows={3}
            placeholder={'Pediu para verificar estoque\nMencionou prazo de entrega\nNão pediu dados de cartão'}
          />
        </Field>
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.scenario_name ?? ''}
        description={detail ? `Persona: ${detail.persona_description}` : undefined}
        size="lg"
      >
        {loadingDetail || !detail ? (
          <div className="py-10 flex justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            {detail.eval_feedback?.per_criterion && (
              <div className="bg-[#FAFAFA] border border-[#E4E4E7] rounded-[10px] p-4 mb-5 space-y-2">
                {detail.eval_feedback.per_criterion.map((c) => (
                  <div key={c.id} className="flex items-start gap-2 text-[12px]">
                    {c.passed ? (
                      <CheckCircle2
                        className="w-4 h-4 text-[#16A34A] flex-shrink-0 mt-0.5"
                        strokeWidth={1.75}
                      />
                    ) : (
                      <XCircle
                        className="w-4 h-4 text-[#DC2626] flex-shrink-0 mt-0.5"
                        strokeWidth={1.75}
                      />
                    )}
                    <div>
                      <p className="text-[#18181B] font-semibold">
                        {detail.eval_criteria.find((ec) => ec.id === c.id)?.description ?? c.id}
                      </p>
                      <p className="text-[#71717A]">{c.reason}</p>
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
                    className={`max-w-[80%] px-3.5 py-2.5 text-[13px] ${
                      m.role === 'user'
                        ? 'bg-[#F4F4F5] text-[#18181B] rounded-[14px] rounded-bl-[4px]'
                        : 'bg-[#18181B] text-white rounded-[14px] rounded-br-[4px]'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.duration_ms && (
                      <p
                        className={`text-[10px] mt-1 inline-flex items-center gap-1 ${
                          m.role === 'user' ? 'text-[#A1A1AA]' : 'text-white/60'
                        }`}
                      >
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
    </AgentSubPageShell>
  )
}
