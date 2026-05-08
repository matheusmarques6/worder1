'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  Save,
  Plus,
  Trash2,
  Check,
  AlertCircle,
} from 'lucide-react'
import { useAuthStore } from '@/stores'
import type {
  Agent,
  AgentBehavior,
  AgentIdentity,
  AgentLLMConfig,
  AgentPersonaV1,
  AgentRole,
  AgentSettingsV1,
  AgentStatus,
} from '@/lib/ai/types'
import { statusPillClass, statusLabel } from '@/lib/ai/ui/status'

// =============================================
// Editor de agente — 5 blocos verticais (F1.8 versão simplificada).
// Auto-save com debounce 800ms. Header com nome editável + status pill.
// Layout 3-col com sidebar de seções + playground virá em iteração
// futura; aqui priorizamos plumbing correto pro schema canônico.
// =============================================

const ROLE_OPTIONS: { value: AgentRole; label: string }[] = [
  { value: 'support', label: 'Atendimento' },
  { value: 'recovery', label: 'Recuperação' },
  { value: 'sales', label: 'Vendas' },
  { value: 'pre_sales', label: 'Pré-venda' },
  { value: 'post_sales', label: 'Pós-venda' },
  { value: 'custom', label: 'Customizado' },
]

const TONE_OPTIONS = [
  'acolhedor',
  'profissional',
  'casual',
  'consultivo',
  'direto',
  'empático',
] as const

const DEFAULT_VARIABLE_KEYS = [
  'Gateway de Pagamento',
  'Prazo de Entrega',
  'Política de Troca/Devolução',
  'Horário de Atendimento Humano',
  'Email de Contato',
  'Telefone/WhatsApp Oficial',
]

interface AgentForm {
  name: string
  description: string
  role: AgentRole
  identity: AgentIdentity
  behavior: AgentBehavior
  persona: AgentPersonaV1
  store_variables: Record<string, string>
  settings: AgentSettingsV1
  llm_config: AgentLLMConfig
}

const DEBOUNCE_MS = 800

export default function AgentEditorPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()
  const organizationId = user?.organization_id || user?.user_metadata?.organization_id
  const agentId = params?.id

  const [agent, setAgent] = useState<Agent | null>(null)
  const [form, setForm] = useState<AgentForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipFirstSave = useRef(true)

  // Carregar agente
  useEffect(() => {
    if (!agentId || !organizationId) return
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/ai/agents/${agentId}`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok || !data.agent) {
          setError(data.error || 'Agente não encontrado')
          return
        }
        const a = data.agent as Agent
        setAgent(a)
        setForm({
          name: a.name,
          description: a.description ?? '',
          role: a.role,
          identity: a.identity,
          behavior: a.behavior,
          persona: a.persona,
          store_variables: a.store_variables ?? {},
          settings: a.settings,
          llm_config: a.llm_config,
        })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'erro ao carregar')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [agentId, organizationId])

  // Auto-save (debounced)
  const saveNow = useCallback(
    async (next: AgentForm) => {
      if (!agentId) return
      setSaving(true)
      setError(null)
      try {
        const res = await fetch(`/api/ai/agents/${agentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: next.name,
            description: next.description || null,
            role: next.role,
            identity: next.identity,
            behavior: next.behavior,
            persona: next.persona,
            store_variables: next.store_variables,
            settings: next.settings,
            llm_config: next.llm_config,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Falha ao salvar')
          return
        }
        if (data.agent) {
          setAgent(data.agent as Agent)
          setSavedAt(new Date())
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'erro ao salvar')
      } finally {
        setSaving(false)
      }
    },
    [agentId],
  )

  useEffect(() => {
    if (!form || skipFirstSave.current) {
      skipFirstSave.current = false
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => saveNow(form), DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [form, saveNow])

  const updateForm = (patch: Partial<AgentForm>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev))

  const togglePublish = async () => {
    if (!agentId || !agent) return
    setPublishing(true)
    try {
      const nextStatus = agent.status === 'published' ? 'paused' : 'published'
      const res = await fetch(`/api/ai/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()
      if (res.ok && data.agent) setAgent(data.agent as Agent)
      else setError(data.error || 'Falha ao publicar')
    } finally {
      setPublishing(false)
    }
  }

  if (loading || !form) {
    return (
      <div className="p-6 max-w-4xl mx-auto flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" strokeWidth={1.75} />
      </div>
    )
  }

  if (error && !agent) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Link
            href="/ai/agents"
            className="mt-1 p-1.5 rounded-md hover:bg-zinc-100 text-zinc-600 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={1.75} />
          </Link>
          <div>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
              placeholder="Nome do agente"
              className="text-2xl font-semibold text-zinc-900 bg-transparent border-0 outline-none
                         focus:bg-orange-50 px-1 -ml-1 rounded transition-colors"
            />
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {agent && (
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusPillClass(
                    agent.status as AgentStatus,
                  )}`}
                >
                  {statusLabel(agent.status as AgentStatus)}
                </span>
              )}
              <span className="text-xs text-zinc-500 inline-flex items-center gap-1">
                {saving ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" strokeWidth={1.75} /> Salvando…
                  </>
                ) : savedAt ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-500" strokeWidth={1.75} /> Salvo às{' '}
                    {savedAt.toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </>
                ) : null}
              </span>
              {error && (
                <span className="text-xs text-red-600 inline-flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" strokeWidth={1.75} /> {error}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePublish}
            disabled={publishing || !agent}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              agent?.status === 'published'
                ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                : 'bg-orange-500 text-white hover:bg-orange-600'
            } disabled:opacity-50`}
          >
            {publishing ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
            ) : agent?.status === 'published' ? (
              'Pausar'
            ) : (
              'Publicar'
            )}
          </button>
        </div>
      </div>

      <IdentityBlock form={form} onChange={updateForm} />
      <StoreVariablesBlock form={form} onChange={updateForm} />
      <PersonaBlock form={form} onChange={updateForm} />
      <BehaviorBlock form={form} onChange={updateForm} />
      <ChannelsBlock form={form} onChange={updateForm} />
    </div>
  )
}

// =============================================
// 1. Identity
// =============================================
function IdentityBlock({
  form,
  onChange,
}: {
  form: AgentForm
  onChange: (patch: Partial<AgentForm>) => void
}) {
  return (
    <Block title="Identidade" subtitle="Quem é o agente, papel e idioma.">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Nome">
          <input
            type="text"
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Papel">
          <select
            value={form.role}
            onChange={(e) => onChange({ role: e.target.value as AgentRole })}
            className={inputClass}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Descrição interna" full>
          <input
            type="text"
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Para você lembrar do que esse agente serve"
            maxLength={255}
            className={inputClass}
          />
        </Field>
        <Field label="Idioma">
          <select
            value={form.persona.language}
            onChange={(e) =>
              onChange({ persona: { ...form.persona, language: e.target.value } })
            }
            className={inputClass}
          >
            <option value="pt-BR">Português (BR)</option>
            <option value="en">Inglês</option>
            <option value="es">Espanhol</option>
          </select>
        </Field>
      </div>

      <div className="space-y-3 mt-4">
        <Field label="Contexto (sobre a marca, produto, função)">
          <textarea
            value={form.identity.context}
            onChange={(e) =>
              onChange({ identity: { ...form.identity, context: e.target.value } })
            }
            rows={4}
            maxLength={20000}
            className={textareaClass}
            placeholder="Você é o atendente virtual da [Loja]. Sua função é..."
          />
        </Field>
        <Field label="Personalidade">
          <input
            type="text"
            value={form.identity.personality}
            onChange={(e) =>
              onChange({
                identity: { ...form.identity, personality: e.target.value },
              })
            }
            placeholder="Acolhedor / Prestativo / Honesto"
            className={inputClass}
          />
        </Field>
        <Field label="Estilo">
          <input
            type="text"
            value={form.identity.style}
            onChange={(e) =>
              onChange({ identity: { ...form.identity, style: e.target.value } })
            }
            placeholder="Frases curtas e claras. Sempre confirma antes de afirmar prazos."
            className={inputClass}
          />
        </Field>
      </div>
    </Block>
  )
}

// =============================================
// 2. Store Variables
// =============================================
function StoreVariablesBlock({
  form,
  onChange,
}: {
  form: AgentForm
  onChange: (patch: Partial<AgentForm>) => void
}) {
  const entries = Object.entries(form.store_variables)
  const ensuredKeys = Array.from(
    new Set([...DEFAULT_VARIABLE_KEYS, ...entries.map(([k]) => k)]),
  )
  const [newKey, setNewKey] = useState('')

  const update = (key: string, value: string) =>
    onChange({ store_variables: { ...form.store_variables, [key]: value } })

  const remove = (key: string) => {
    const next = { ...form.store_variables }
    delete next[key]
    onChange({ store_variables: next })
  }

  const addCustom = () => {
    const k = newKey.trim()
    if (!k) return
    if (form.store_variables[k] !== undefined) return
    onChange({ store_variables: { ...form.store_variables, [k]: '' } })
    setNewKey('')
  }

  return (
    <Block
      title="Variáveis da loja"
      subtitle="Dados injetados automaticamente no prompt do agente."
    >
      <div className="space-y-3">
        {ensuredKeys.map((key) => {
          const isDefault = DEFAULT_VARIABLE_KEYS.includes(key)
          return (
            <div key={key} className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-12 sm:col-span-4 text-sm text-zinc-700 font-medium pt-2.5">
                {key}
              </div>
              <div className="col-span-11 sm:col-span-7">
                <textarea
                  value={form.store_variables[key] ?? ''}
                  onChange={(e) => update(key, e.target.value)}
                  rows={2}
                  className={textareaClass}
                />
              </div>
              <div className="col-span-1 pt-2">
                {!isDefault && (
                  <button
                    type="button"
                    onClick={() => remove(key)}
                    className="p-1.5 text-zinc-400 hover:text-red-600 transition-colors"
                    aria-label={`Remover ${key}`}
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-zinc-100">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="Nome da nova variável (ex: Política de Frete)"
          className={`${inputClass} flex-1`}
        />
        <button
          type="button"
          onClick={addCustom}
          className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm rounded-md transition-colors
                     inline-flex items-center gap-1"
        >
          <Plus className="w-4 h-4" strokeWidth={1.75} /> Adicionar
        </button>
      </div>
    </Block>
  )
}

// =============================================
// 3. Persona
// =============================================
function PersonaBlock({
  form,
  onChange,
}: {
  form: AgentForm
  onChange: (patch: Partial<AgentForm>) => void
}) {
  const persona = form.persona
  return (
    <Block title="Persona" subtitle="Como o agente fala e quanto tempo demora a responder.">
      <Field label="Tom">
        <div className="flex flex-wrap gap-2">
          {TONE_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ persona: { ...persona, tone: t } })}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                persona.tone === t
                  ? 'bg-orange-50 text-orange-700 border-orange-200'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Field label="Comprimento das respostas">
          <select
            value={persona.response_length}
            onChange={(e) =>
              onChange({
                persona: {
                  ...persona,
                  response_length: e.target.value as AgentPersonaV1['response_length'],
                },
              })
            }
            className={inputClass}
          >
            <option value="short">Curto (1-2 frases)</option>
            <option value="medium">Médio</option>
            <option value="long">Longo (explicações)</option>
          </select>
        </Field>
        <Field label={`Delay (typing realista) — ${persona.reply_delay_seconds}s`}>
          <input
            type="range"
            min={1}
            max={5}
            value={persona.reply_delay_seconds}
            onChange={(e) =>
              onChange({
                persona: { ...persona, reply_delay_seconds: parseInt(e.target.value, 10) },
              })
            }
            className="w-full accent-orange-500"
          />
        </Field>
        <Field label="Quebrar em várias mensagens" full>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={persona.split_messages}
              onChange={(e) =>
                onChange({
                  persona: { ...persona, split_messages: e.target.checked },
                })
              }
              className="accent-orange-500 w-4 h-4"
            />
            <span className="text-sm text-zinc-700">
              Divide respostas longas em 2-3 mensagens curtas (mais natural no WhatsApp).
            </span>
          </label>
        </Field>
      </div>
    </Block>
  )
}

// =============================================
// 4. Behavior
// =============================================
function BehaviorBlock({
  form,
  onChange,
}: {
  form: AgentForm
  onChange: (patch: Partial<AgentForm>) => void
}) {
  const b = form.behavior
  return (
    <Block
      title="Comportamento"
      subtitle="Objetivos, persistência e limitações do agente."
    >
      <div className="space-y-4">
        <Field label="Objetivo principal">
          <input
            type="text"
            value={b.primary_goal}
            onChange={(e) => onChange({ behavior: { ...b, primary_goal: e.target.value } })}
            placeholder="Conduzir o cliente até a finalização da compra"
            maxLength={200}
            className={inputClass}
          />
        </Field>

        <Field
          label={`Persistência ${b.persistence.length}/2000`}
          help="Como reagir quando o cliente está hesitante."
        >
          <textarea
            value={b.persistence}
            onChange={(e) => onChange({ behavior: { ...b, persistence: e.target.value } })}
            rows={4}
            maxLength={2000}
            className={textareaClass}
            placeholder='Você é delicadamente persistente. Se o cliente disser "vou pensar"...'
          />
        </Field>

        <Field
          label={`Limitações ${b.limitations.length}/2000`}
          help="O que o agente NÃO pode fazer."
        >
          <textarea
            value={b.limitations}
            onChange={(e) => onChange({ behavior: { ...b, limitations: e.target.value } })}
            rows={4}
            maxLength={2000}
            className={textareaClass}
            placeholder="Nunca prometa data exata de entrega. Use médias. Nunca confirme valores promocionais sem antes verificar."
          />
        </Field>

        <Field
          label={`Regras de comunicação ${b.communication_rules.length}/4000`}
          help="Etiqueta e formato das respostas."
        >
          <textarea
            value={b.communication_rules}
            onChange={(e) =>
              onChange({ behavior: { ...b, communication_rules: e.target.value } })
            }
            rows={4}
            maxLength={4000}
            className={textareaClass}
            placeholder="Use o primeiro nome do cliente. Não se reapresente após o primeiro contato. Termine com pergunta quando apropriado."
          />
        </Field>
      </div>
    </Block>
  )
}

// =============================================
// 5. Channels
// =============================================
function ChannelsBlock({
  form,
  onChange,
}: {
  form: AgentForm
  onChange: (patch: Partial<AgentForm>) => void
}) {
  const settings = form.settings
  const allChannels = settings.channels.all_channels
  const schedule = settings.schedule
  const behavior = settings.behavior

  return (
    <Block
      title="Canais e agendamento"
      subtitle="Onde o agente responde e em que horário."
    >
      <Field label="Canais">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allChannels}
            onChange={(e) =>
              onChange({
                settings: {
                  ...settings,
                  channels: { ...settings.channels, all_channels: e.target.checked },
                },
              })
            }
            className="accent-orange-500 w-4 h-4"
          />
          <span className="text-sm text-zinc-700">
            Responder em todos os canais WhatsApp da organização
          </span>
        </label>
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Field label="Sempre ativo" full>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={schedule.always_active}
              onChange={(e) =>
                onChange({
                  settings: {
                    ...settings,
                    schedule: { ...schedule, always_active: e.target.checked },
                  },
                })
              }
              className="accent-orange-500 w-4 h-4"
            />
            <span className="text-sm text-zinc-700">
              Ignorar horário comercial (responde 24/7)
            </span>
          </label>
        </Field>

        {!schedule.always_active && (
          <>
            <Field label="Início">
              <input
                type="time"
                value={schedule.hours.start}
                onChange={(e) =>
                  onChange({
                    settings: {
                      ...settings,
                      schedule: {
                        ...schedule,
                        hours: { ...schedule.hours, start: e.target.value },
                      },
                    },
                  })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Fim">
              <input
                type="time"
                value={schedule.hours.end}
                onChange={(e) =>
                  onChange({
                    settings: {
                      ...settings,
                      schedule: {
                        ...schedule,
                        hours: { ...schedule.hours, end: e.target.value },
                      },
                    },
                  })
                }
                className={inputClass}
              />
            </Field>
          </>
        )}

        <Field
          label="Máx. mensagens da IA por conversa (0 = ilimitado)"
          full
        >
          <input
            type="number"
            min={0}
            value={behavior.max_messages_per_conversation}
            onChange={(e) =>
              onChange({
                settings: {
                  ...settings,
                  behavior: {
                    ...behavior,
                    max_messages_per_conversation: parseInt(e.target.value || '0', 10),
                  },
                },
              })
            }
            className={inputClass}
          />
        </Field>

        <Field label="Cooldown após transferir (segundos)" full>
          <input
            type="number"
            min={0}
            value={behavior.cooldown_after_transfer}
            onChange={(e) =>
              onChange({
                settings: {
                  ...settings,
                  behavior: {
                    ...behavior,
                    cooldown_after_transfer: parseInt(e.target.value || '0', 10),
                  },
                },
              })
            }
            className={inputClass}
          />
        </Field>
      </div>
    </Block>
  )
}

// =============================================
// Pequenos primitivos visuais
// =============================================
const inputClass =
  'w-full px-3 py-2 bg-white border border-zinc-200 rounded-md text-sm text-zinc-900 ' +
  'focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 ' +
  'placeholder-zinc-400'

const textareaClass = `${inputClass} resize-y leading-relaxed`

function Block({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="bg-white border border-zinc-200 rounded-xl p-6">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        {subtitle && <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>}
      </header>
      {children}
    </section>
  )
}

function Field({
  label,
  help,
  children,
  full = false,
}: {
  label: string
  help?: string
  children: React.ReactNode
  full?: boolean
}) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <label className="block text-xs font-medium text-zinc-600 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {children}
      {help && <p className="text-xs text-zinc-500 mt-1">{help}</p>}
    </div>
  )
}
