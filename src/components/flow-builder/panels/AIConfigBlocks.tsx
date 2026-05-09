'use client'

// =============================================
// Forms de configuração dos 7 nodes IA do flow builder.
// Mantém o estilo dos blocos do PropertiesPanel.tsx (mesmas classes
// Tailwind: text-xs labels, gray-700/300 borders, bg-white inputs)
// pra integrar visualmente com os outros nodes.
// =============================================

import { useEffect, useState, useCallback } from 'react'
import { Plus, X, Loader2 } from 'lucide-react'

interface ConfigProps {
  config: Record<string, any>
  onUpdate: (key: string, value: any) => void
}

interface ConfigPropsWithOrg extends ConfigProps {
  organizationId?: string
}

const labelCls = 'text-xs font-medium text-gray-700'
const inputCls =
  'w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md ' +
  'text-gray-900 placeholder:text-gray-400 ' +
  'focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 ' +
  'transition-colors'
const textareaCls = `${inputCls} resize-none`
const hintCls = 'text-[11px] text-gray-500'

// =============================================
// Helper: editor de string array (chips)
// =============================================

function StringArrayEditor({
  value,
  onChange,
  placeholder = 'Adicionar...',
}: {
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const [input, setInput] = useState('')
  function add() {
    const v = input.trim()
    if (!v || value.includes(v)) {
      setInput('')
      return
    }
    onChange([...value, v])
    setInput('')
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx))
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {value.length === 0 ? (
          <span className="text-[11px] text-gray-400 italic">Nenhum item</span>
        ) : (
          value.map((v, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-gray-700
                         bg-gray-100 border border-gray-200 rounded-md"
            >
              {v}
              <button
                onClick={() => remove(i)}
                className="text-gray-400 hover:text-red-600"
                type="button"
              >
                <X className="w-3 h-3" strokeWidth={2} />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
          className={inputCls}
        />
        <button
          type="button"
          onClick={add}
          className="px-2.5 py-2 text-xs font-semibold text-white bg-zinc-900 rounded-md hover:bg-zinc-800
                     transition-colors flex items-center gap-1"
        >
          <Plus className="w-3 h-3" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

// =============================================
// AI Classify
// =============================================

export function AIClassifyConfig({ config, onUpdate }: ConfigProps) {
  const intents: string[] = Array.isArray(config.intents) ? config.intents : []
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={labelCls}>Categorias de intenção</label>
        <p className={hintCls}>
          Cada categoria vira uma saída separada do node. Use minúsculas.
        </p>
        <StringArrayEditor
          value={intents}
          onChange={(next) => onUpdate('intents', next)}
          placeholder='Ex.: "compra"'
        />
      </div>
      <div className="space-y-1.5">
        <label className={labelCls}>Modelo (opcional)</label>
        <input
          type="text"
          value={config.model ?? ''}
          onChange={(e) => onUpdate('model', e.target.value)}
          placeholder="anthropic/claude-haiku-4-5"
          className={inputCls}
        />
        <p className={hintCls}>Padrão: Haiku 4.5 (rápido e barato).</p>
      </div>
    </div>
  )
}

// =============================================
// AI Extract
// =============================================

const FIELD_PRESETS = [
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Telefone' },
  { key: 'full_name', label: 'Nome completo' },
  { key: 'first_name', label: 'Primeiro nome' },
  { key: 'cep', label: 'CEP' },
  { key: 'address', label: 'Endereço' },
  { key: 'cpf', label: 'CPF' },
  { key: 'birthday', label: 'Aniversário' },
]

export function AIExtractConfig({ config, onUpdate }: ConfigProps) {
  const fields: string[] = Array.isArray(config.fields) ? config.fields : []
  const saveToContact = config.saveToContact !== false

  function toggleField(key: string) {
    const next = fields.includes(key) ? fields.filter((f) => f !== key) : [...fields, key]
    onUpdate('fields', next)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={labelCls}>Campos a extrair</label>
        <p className={hintCls}>
          A IA tenta capturar esses dados da última mensagem do cliente.
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {FIELD_PRESETS.map((f) => {
            const active = fields.includes(f.key)
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => toggleField(f.key)}
                className={`text-left px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="space-y-1.5">
        <label className={labelCls}>Campo customizado</label>
        <p className={hintCls}>
          Adicione um campo extra (vai pra contacts.custom_fields se não for coluna direta).
        </p>
        <StringArrayEditor
          value={fields.filter((f) => !FIELD_PRESETS.some((p) => p.key === f))}
          onChange={(custom) =>
            onUpdate('fields', [
              ...fields.filter((f) => FIELD_PRESETS.some((p) => p.key === f)),
              ...custom,
            ])
          }
          placeholder='Ex.: "instagram"'
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={saveToContact}
          onChange={(e) => onUpdate('saveToContact', e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-zinc-900 focus:ring-zinc-900/10"
        />
        <span className="text-xs text-gray-700">Salvar automaticamente no contato</span>
      </label>
    </div>
  )
}

// =============================================
// AI Generate
// =============================================

export function AIGenerateConfig({ config, onUpdate }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={labelCls}>Prompt</label>
        <p className={hintCls}>
          Use {'{{contact.first_name}}'} ou {'{{lastMessage}}'} pra inserir variáveis do contexto.
          O resultado fica em <code className="bg-gray-100 px-1 rounded">{'{{generated}}'}</code> pro próximo node.
        </p>
        <textarea
          value={config.prompt ?? ''}
          onChange={(e) => onUpdate('prompt', e.target.value)}
          rows={6}
          placeholder={'Escreva uma mensagem de boas-vindas pro {{contact.first_name}} considerando o último pedido dele.'}
          className={textareaCls}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className={labelCls}>Max tokens</label>
          <input
            type="number"
            value={config.maxTokens ?? 300}
            onChange={(e) => onUpdate('maxTokens', parseInt(e.target.value, 10) || 300)}
            min={50}
            max={2000}
            className={inputCls}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>Temperatura</label>
          <input
            type="number"
            value={config.temperature ?? 0.7}
            onChange={(e) =>
              onUpdate('temperature', parseFloat(e.target.value) || 0.7)
            }
            min={0}
            max={1}
            step={0.1}
            className={inputCls}
          />
        </div>
      </div>
    </div>
  )
}

// =============================================
// AI Summarize
// =============================================

export function AISummarizeConfig({ config, onUpdate }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={labelCls}>Janela de mensagens</label>
        <p className={hintCls}>Quantas mensagens recentes resumir.</p>
        <input
          type="number"
          value={config.windowSize ?? 20}
          onChange={(e) => onUpdate('windowSize', parseInt(e.target.value, 10) || 20)}
          min={5}
          max={100}
          className={inputCls}
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={config.saveToMemory !== false}
          onChange={(e) => onUpdate('saveToMemory', e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-zinc-900 focus:ring-zinc-900/10"
        />
        <span className="text-xs text-gray-700">
          Salvar em ai_conversation_memory.summary (acessível pelo runner)
        </span>
      </label>
    </div>
  )
}

// =============================================
// AI Handoff (transfer to another agent)
// =============================================

interface AgentLite {
  id: string
  name: string
  status: string
  role: string
}

export function AIHandoffConfig({ config, onUpdate, organizationId }: ConfigPropsWithOrg) {
  const [agents, setAgents] = useState<AgentLite[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/ai/agents?organization_id=${organizationId}&limit=50`)
      const j = await res.json()
      setAgents(j.agents ?? [])
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={labelCls}>Agente de destino</label>
        <p className={hintCls}>Conversa passa pra esse agente continuar respondendo.</p>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2} />
            Carregando agentes...
          </div>
        ) : (
          <select
            value={config.targetAgentId ?? ''}
            onChange={(e) => onUpdate('targetAgentId', e.target.value)}
            className={inputCls}
          >
            <option value="">Selecione um agente...</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} {a.status !== 'published' ? `(${a.status})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}

// =============================================
// AI Sentiment (no config — branches são fixas)
// =============================================

export function AISentimentConfig() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-600">
        Esse node não precisa de configuração. A IA classifica automaticamente em três saídas:
      </p>
      <div className="space-y-1.5">
        <Branch tone="success" label="positive" desc="Cliente satisfeito ou animado" />
        <Branch tone="neutral" label="neutral" desc="Tom neutro ou informativo" />
        <Branch tone="danger" label="negative" desc="Frustração, raiva ou desistência" />
      </div>
    </div>
  )
}

// =============================================
// AI Match (yes/no question)
// =============================================

export function AIMatchConfig({ config, onUpdate }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={labelCls}>Pergunta de avaliação</label>
        <p className={hintCls}>
          A IA responde "sim" ou "não" pra essa pergunta sobre a última mensagem do cliente.
        </p>
        <textarea
          value={config.question ?? ''}
          onChange={(e) => onUpdate('question', e.target.value)}
          rows={3}
          placeholder='Ex.: "O cliente demonstrou interesse em comprar?"'
          className={textareaCls}
        />
      </div>
      <div className="space-y-1.5">
        <Branch tone="success" label="true" desc="A IA respondeu sim" />
        <Branch tone="danger" label="false" desc="A IA respondeu não" />
      </div>
    </div>
  )
}

// =============================================
// Branch indicator helper
// =============================================

function Branch({
  tone,
  label,
  desc,
}: {
  tone: 'success' | 'danger' | 'neutral'
  label: string
  desc: string
}) {
  const cls =
    tone === 'success'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : tone === 'danger'
      ? 'bg-red-50 border-red-200 text-red-700'
      : 'bg-gray-50 border-gray-200 text-gray-700'
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border ${cls}`}>
      <span className="text-[11px] font-mono font-bold">→ {label}</span>
      <span className="text-[11px] opacity-80">{desc}</span>
    </div>
  )
}
