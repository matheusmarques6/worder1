'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  X,
  Bot,
  Sparkles,
  ChevronRight,
  Check,
  Loader2,
  AlertCircle,
  Zap,
  Brain,
  MessageSquare,
  Settings,
} from 'lucide-react'

interface CreateAgentModalProps {
  organizationId: string
  onClose: () => void
  onCreate: (agentId: string) => void
}

interface LLMModel {
  id: string
  name: string
  provider: string
  description?: string
  context_window?: number
  input_price?: number
  output_price?: number
}

const templates = [
  {
    id: 'sales',
    name: 'Assistente de Vendas',
    description: 'Ajuda clientes com informações sobre produtos e fecha vendas',
    icon: '💰',
    persona: {
      role_description: 'Você é um assistente de vendas especializado. Sua função é ajudar clientes a encontrar os produtos ideais, responder dúvidas sobre preços, disponibilidade e formas de pagamento. Seja persuasivo mas nunca agressivo.',
      tone: 'friendly',
      response_length: 'medium',
      guidelines: [
        'Sempre pergunte sobre as necessidades do cliente antes de recomendar',
        'Destaque os benefícios dos produtos, não apenas características',
        'Ofereça alternativas quando um produto não estiver disponível',
      ],
    },
  },
  {
    id: 'support',
    name: 'Suporte ao Cliente',
    description: 'Resolve problemas e dúvidas técnicas dos clientes',
    icon: '🎧',
    persona: {
      role_description: 'Você é um especialista em suporte ao cliente. Sua missão é resolver problemas de forma rápida e eficiente, sempre mantendo a calma mesmo em situações difíceis. Demonstre empatia e busque soluções práticas.',
      tone: 'professional',
      response_length: 'medium',
      guidelines: [
        'Sempre peça desculpas pelo inconveniente antes de propor soluções',
        'Forneça instruções passo a passo quando necessário',
        'Se não souber a resposta, encaminhe para um humano',
      ],
    },
  },
  {
    id: 'receptionist',
    name: 'Recepcionista Virtual',
    description: 'Faz a triagem inicial e encaminha para o setor correto',
    icon: '👋',
    persona: {
      role_description: 'Você é a primeira linha de contato da empresa. Cumprimente os clientes, entenda suas necessidades e direcione para o departamento adequado ou colete informações básicas.',
      tone: 'friendly',
      response_length: 'short',
      guidelines: [
        'Sempre cumprimente o cliente de forma calorosa',
        'Faça no máximo 3 perguntas para entender a necessidade',
        'Colete nome e email antes de transferir',
      ],
    },
  },
  {
    id: 'custom',
    name: 'Personalizado',
    description: 'Comece do zero e configure tudo manualmente',
    icon: '⚙️',
    persona: {
      role_description: '',
      tone: 'friendly',
      response_length: 'medium',
      guidelines: [],
    },
  },
]

const providerColors: Record<string, string> = {
  openai: 'bg-green-500/20 text-green-400 border-green-500/30',
  anthropic: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  google: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  groq: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
}

export default function CreateAgentModal({
  organizationId,
  onClose,
  onCreate,
}: CreateAgentModalProps) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [provider, setProvider] = useState('openai')
  const [model, setModel] = useState('gpt-4o-mini')
  const [temperature, setTemperature] = useState(0.7)

  // Models state
  const [models, setModels] = useState<LLMModel[]>([])
  const [loadingModels, setLoadingModels] = useState(true)

  // Fetch models
  useEffect(() => {
    fetchModels()
  }, [])

  const fetchModels = async () => {
    setLoadingModels(true)
    try {
      const res = await fetch('/api/ai/models')
      if (res.ok) {
        const data = await res.json()
        setModels(data.models || [])
      }
    } catch (err) {
      console.error('Error fetching models:', err)
      // Fallback models
      setModels([
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google' },
        { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B', provider: 'groq' },
      ])
    } finally {
      setLoadingModels(false)
    }
  }

  // Get unique providers
  const providers = [...new Set(models.map(m => m.provider))]

  // Get models for selected provider
  const providerModels = models.filter(m => m.provider === provider)

  // Handle template selection
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplate(templateId)
    const template = templates.find(t => t.id === templateId)
    if (template && templateId !== 'custom') {
      setName(template.name)
      setDescription(template.description)
    }
  }

  // Create agent
  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Nome é obrigatório')
      return
    }

    setLoading(true)
    setError('')

    try {
      const template = templates.find(t => t.id === selectedTemplate)
      
      const res = await fetch('/api/ai/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          name: name.trim(),
          description: description.trim() || undefined,
          provider,
          model,
          temperature,
          max_tokens: 500,
          is_active: false,
          persona: template?.persona || {
            role_description: '',
            tone: 'friendly',
            response_length: 'medium',
            language: 'pt-BR',
            reply_delay: 3,
            guidelines: [],
          },
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao criar agente')
      }

      const data = await res.json()
      onCreate(data.agent.id)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-dark-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-dark-700 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Criar Novo Agente</h3>
              <p className="text-sm text-dark-400">Passo {step} de 3</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 px-4 py-3 bg-dark-900/50">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex-1 flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                step === s
                  ? 'bg-primary-500 text-white'
                  : step > s
                  ? 'bg-green-500 text-white'
                  : 'bg-dark-700 text-dark-400'
              }`}>
                {step > s ? <Check className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div className={`flex-1 h-0.5 mx-2 ${
                  step > s ? 'bg-green-500' : 'bg-dark-700'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Step 1: Template */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-white font-medium mb-1">Escolha um template</h4>
                <p className="text-sm text-dark-400">Comece com uma configuração pré-definida ou personalize do zero</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template.id)}
                    className={`flex flex-col items-start p-4 rounded-xl border transition-all text-left ${
                      selectedTemplate === template.id
                        ? 'bg-primary-500/10 border-primary-500/50'
                        : 'bg-dark-900/50 border-dark-700/50 hover:bg-dark-900 hover:border-dark-600'
                    }`}
                  >
                    <span className="text-2xl mb-2">{template.icon}</span>
                    <span className="text-white font-medium">{template.name}</span>
                    <span className="text-xs text-dark-400 mt-1">{template.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Basic Info */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Nome do Agente *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Assistente de Vendas"
                  className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder:text-dark-500 focus:outline-none focus:border-primary-500/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Descrição (opcional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Uma breve descrição do que este agente faz..."
                  className="w-full h-24 px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder:text-dark-500 resize-none focus:outline-none focus:border-primary-500/50"
                />
              </div>
            </div>
          )}

          {/* Step 3: Model */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Provedor</label>
                <div className="flex gap-2 flex-wrap">
                  {providers.map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setProvider(p)
                        const firstModel = models.find(m => m.provider === p)
                        if (firstModel) setModel(firstModel.id)
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium capitalize border transition-colors ${
                        provider === p
                          ? providerColors[p] || 'bg-primary-500/20 text-primary-400 border-primary-500/30'
                          : 'bg-dark-900/50 text-dark-400 border-dark-700/50 hover:text-white'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Modelo</label>
                {loadingModels ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
                  </div>
                ) : (
                  <div className="grid gap-2 max-h-48 overflow-y-auto">
                    {providerModels.map((m) => (
                      <label
                        key={m.id}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                          model === m.id
                            ? 'bg-primary-500/10 border border-primary-500/30'
                            : 'bg-dark-900/50 border border-transparent hover:bg-dark-900'
                        }`}
                      >
                        <input
                          type="radio"
                          name="model"
                          value={m.id}
                          checked={model === m.id}
                          onChange={() => setModel(m.id)}
                          className="sr-only"
                        />
                        <Brain className={`w-4 h-4 ${model === m.id ? 'text-primary-400' : 'text-dark-500'}`} />
                        <div className="flex-1">
                          <p className="text-sm text-white">{m.name}</p>
                          {m.description && (
                            <p className="text-xs text-dark-500">{m.description}</p>
                          )}
                        </div>
                        {model === m.id && <Check className="w-4 h-4 text-primary-400" />}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-dark-300">Temperatura</label>
                  <span className="text-sm text-primary-400">{temperature}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
                />
                <div className="flex justify-between text-xs text-dark-500 mt-1">
                  <span>Preciso</span>
                  <span>Criativo</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-dark-700">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
            >
              Voltar
            </button>
          )}
          
          <div className="flex-1" />

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !selectedTemplate}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-dark-600 text-white rounded-xl font-medium transition-colors"
            >
              Próximo
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={loading || !name.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 disabled:from-dark-600 disabled:to-dark-600 text-white rounded-xl font-medium transition-colors"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <Sparkles className="w-4 h-4" />
              Criar Agente
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
