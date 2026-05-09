'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Sparkles, Plus, Trash2, TrendingUp } from 'lucide-react'
import { AgentSubPageShell } from '@/components/ai/AgentSubPageShell'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  Badge,
  Spinner,
  Toggle,
  Input,
  Textarea,
  Num,
} from '@/components/ai/ui/primitives'

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
  const [modalOpen, setModalOpen] = useState(false)
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
      alert('Adicione pelo menos uma frase-gatilho')
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
      setModalOpen(false)
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
      pageDescription="Comportamentos disparados quando o cliente menciona uma frase-gatilho."
      actions={
        <Button
          variant="cta"
          onClick={() => setModalOpen(true)}
          leadingIcon={<Plus className="w-3.5 h-3.5" strokeWidth={1.75} />}
        >
          Nova skill
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
      ) : skills.length === 0 ? (
        <EmptyState
          title="Crie sua primeira skill"
          description='Defina frases-gatilho (ex.: "quanto custa", "preço") e instruções extras que o agente seguirá quando o cliente mencionar uma delas.'
        />
      ) : (
        <div className="space-y-3">
          {skills.map((s) => {
            const successRate =
              s.total_invocations > 0
                ? Math.round((s.total_successes / s.total_invocations) * 100)
                : null
            return (
              <Card key={s.id} size="sm">
                <div className="flex items-start gap-4">
                  <div className="inline-flex items-center justify-center w-9 h-9 rounded-[10px] bg-[#FAFAFA] border border-[#E4E4E7] flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-[#71717A]" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-[14px] font-semibold text-[#18181B]">{s.name}</h4>
                      {!s.enabled && <Badge tone="neutral">Desativada</Badge>}
                      {s.total_invocations > 0 && (
                        <span className="inline-flex items-center gap-1 text-[12px] text-[#71717A]">
                          <TrendingUp className="w-3 h-3" strokeWidth={1.75} />
                          <Num>{s.total_invocations}</Num> usos · <Num>{successRate}%</Num> sucesso
                        </span>
                      )}
                    </div>
                    {s.description && (
                      <p className="text-[12px] text-[#71717A] mt-0.5">{s.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {s.trigger_phrases.map((p, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium text-[#52525B]
                                     bg-[#F4F4F5] border border-[#E4E4E7] rounded-[6px]"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                    <p className="text-[12px] text-[#52525B] mt-3 line-clamp-2 whitespace-pre-wrap">
                      {s.instructions}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Toggle
                      enabled={s.enabled}
                      onClick={() => toggleEnabled(s)}
                      ariaLabel="Ativar/desativar skill"
                    />
                    <button
                      onClick={() => removeSkill(s)}
                      className="p-1.5 text-[#A1A1AA] hover:text-red-600 hover:bg-red-50 rounded-[6px] transition-colors"
                      title="Remover"
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nova skill"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={createSkill} loading={saving}>
              Criar skill
            </Button>
          </>
        }
      >
        <Field label="Nome" required>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder='Ex.: "Modo orçamento"'
          />
        </Field>
        <Field label="Descrição">
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Resumo curto do que essa skill faz"
          />
        </Field>
        <Field
          label="Frases-gatilho"
          hint="Uma por linha ou separadas por vírgula. Match por substring (case-insensitive)."
          required
        >
          <Textarea
            value={form.triggerPhrases}
            onChange={(e) => setForm({ ...form, triggerPhrases: e.target.value })}
            rows={3}
            placeholder={'quanto custa\npreço\nvalor'}
          />
        </Field>
        <Field
          label="Instruções"
          hint="Texto que o agente recebe como contexto extra quando a skill é ativada."
          required
        >
          <Textarea
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            rows={5}
            placeholder="Quando perguntar preço, ofereça opções e pergunte forma de pagamento..."
          />
        </Field>
      </Modal>
    </AgentSubPageShell>
  )
}
