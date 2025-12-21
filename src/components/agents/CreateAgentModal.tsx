'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Bot,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  AlertCircle,
  Brain,
  MessageSquare,
  Settings,
  User,
  Database,
  Zap,
  Link2,
  Plus,
  Trash2,
  Upload,
  FileText,
  Globe,
  Type,
  Info,
  ShoppingCart,
  HelpCircle,
  RotateCcw,
  DollarSign,
  Truck,
  Package,
  AlertTriangle,
  Smile,
  Frown,
  Meh,
  Heart,
  ArrowRight,
  Send,
  BookOpen,
  Ban,
  Clock,
} from 'lucide-react'

interface CreateAgentModalProps {
  organizationId: string
  onClose: () => void
  onCreate: (agentId: string) => void
}

interface LLMModel {
  id: string
  name: string
  display_name?: string
  provider: string
  description?: string
  context_window?: number
  input_price?: number
  output_price?: number
}

// Templates pré-definidos
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

// Condições pré-definidas para Actions
const conditionPresets = [
  { id: 'want_buy', label: 'Cliente quer comprar', icon: ShoppingCart, category: 'intent' },
  { id: 'want_support', label: 'Cliente quer suporte', icon: HelpCircle, category: 'intent' },
  { id: 'want_refund', label: 'Cliente quer reembolso', icon: RotateCcw, category: 'intent' },
  { id: 'want_human', label: 'Cliente quer falar com humano', icon: User, category: 'intent' },
  { id: 'ask_price', label: 'Pergunta sobre preço', icon: DollarSign, category: 'question' },
  { id: 'ask_delivery', label: 'Pergunta sobre entrega', icon: Truck, category: 'question' },
  { id: 'ask_stock', label: 'Pergunta sobre estoque', icon: Package, category: 'question' },
  { id: 'sentiment_frustrated', label: 'Cliente frustrado', icon: AlertTriangle, category: 'sentiment' },
  { id: 'sentiment_happy', label: 'Cliente feliz', icon: Smile, category: 'sentiment' },
  { id: 'sentiment_confused', label: 'Cliente confuso', icon: Meh, category: 'sentiment' },
]

// Ações pré-definidas
const actionPresets = [
  { id: 'transfer_human', label: 'Transferir para humano', icon: User },
  { id: 'exact_message', label: 'Responder com mensagem exata', icon: MessageSquare },
  { id: 'use_source', label: 'Usar fonte específica', icon: Database },
  { id: 'ask_email', label: 'Pedir email do cliente', icon: Send },
  { id: 'ask_phone', label: 'Pedir telefone do cliente', icon: Send },
  { id: 'dont_mention', label: 'Nunca mencionar', icon: Ban },
  { id: 'always_mention', label: 'Sempre mencionar', icon: BookOpen },
]

const providerColors: Record<string, string> = {
  openai: 'bg-green-500/20 text-green-400 border-green-500/30',
  anthropic: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  google: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  groq: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  deepseek: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  mistral: 'bg-red-500/20 text-red-400 border-red-500/30',
}

// Tabs do wizard
type TabId = 'template' | 'persona' | 'model' | 'sources' | 'actions' | 'review'

const tabs: { id: TabId; label: string; icon: any }[] = [
  { id: 'template', label: 'Template', icon: Sparkles },
  { id: 'persona', label: 'Persona', icon: User },
  { id: 'model', label: 'Modelo', icon: Brain },
  { id: 'sources', label: 'Conhecimento', icon: Database },
  { id: 'actions', label: 'Ações', icon: Zap },
  { id: 'review', label: 'Revisar', icon: Check },
]

// Interface para Source
interface SourceItem {
  id: string
  type: 'url' | 'file' | 'text'
  name: string
  content: string
  file?: File
}

// Interface para Action
interface ActionItem {
  id: string
  name: string
  conditions: { type: string; value: string }[]
  actions: { type: string; value: string }[]
  match_type: 'all' | 'any'
  is_active: boolean
}

export default function CreateAgentModal({
  organizationId,
  onClose,
  onCreate,
}: CreateAgentModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('template')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // === TEMPLATE STATE ===
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)

  // === PERSONA STATE ===
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [roleDescription, setRoleDescription] = useState('')
  const [tone, setTone] = useState<'casual' | 'friendly' | 'professional'>('friendly')
  const [responseLength, setResponseLength] = useState<'short' | 'medium' | 'long'>('medium')
  const [language, setLanguage] = useState('pt-BR')
  const [guidelines, setGuidelines] = useState<string[]>([''])
  const [replyDelay, setReplyDelay] = useState(3)

  // === MODEL STATE ===
  const [provider, setProvider] = useState('openai')
  const [model, setModel] = useState('gpt-4o-mini')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(500)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [models, setModels] = useState<LLMModel[]>([])
  const [loadingModels, setLoadingModels] = useState(true)

  // === SOURCES STATE ===
  const [sources, setSources] = useState<SourceItem[]>([])
  const [newSourceType, setNewSourceType] = useState<'url' | 'file' | 'text'>('text')
  const [newSourceName, setNewSourceName] = useState('')
  const [newSourceContent, setNewSourceContent] = useState('')
  const [newSourceFile, setNewSourceFile] = useState<File | null>(null)

  // === ACTIONS STATE ===
  const [actions, setActions] = useState<ActionItem[]>([])
  const [showActionModal, setShowActionModal] = useState(false)
  const [editingAction, setEditingAction] = useState<ActionItem | null>(null)

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
      setModels([
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', display_name: 'GPT-4o Mini', provider: 'openai' },
        { id: 'gpt-4o', name: 'GPT-4o', display_name: 'GPT-4o', provider: 'openai' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', display_name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', display_name: 'Gemini 1.5 Flash', provider: 'google' },
        { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', display_name: 'Llama 3.3 70B', provider: 'groq' },
      ])
    } finally {
      setLoadingModels(false)
    }
  }

  // Get unique providers
  const providers = [...new Set(models.map(m => m.provider))]
  const providerModels = models.filter(m => m.provider === provider)

  // Handle template selection
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplate(templateId)
    const template = templates.find(t => t.id === templateId)
    if (template && templateId !== 'custom') {
      setName(template.name)
      setDescription(template.description)
      setRoleDescription(template.persona.role_description)
      setTone(template.persona.tone as any)
      setResponseLength(template.persona.response_length as any)
      setGuidelines(template.persona.guidelines.length > 0 ? template.persona.guidelines : [''])
    }
  }

  // Add guideline
  const addGuideline = () => {
    if (guidelines.length < 50) {
      setGuidelines([...guidelines, ''])
    }
  }

  // Remove guideline
  const removeGuideline = (index: number) => {
    setGuidelines(guidelines.filter((_, i) => i !== index))
  }

  // Update guideline
  const updateGuideline = (index: number, value: string) => {
    const updated = [...guidelines]
    updated[index] = value.slice(0, 300)
    setGuidelines(updated)
  }

  // Add source
  const addSource = () => {
    if (!newSourceName.trim()) return

    const newSource: SourceItem = {
      id: `temp-${Date.now()}`,
      type: newSourceType,
      name: newSourceName,
      content: newSourceType === 'file' ? newSourceFile?.name || '' : newSourceContent,
      file: newSourceFile || undefined,
    }

    setSources([...sources, newSource])
    setNewSourceName('')
    setNewSourceContent('')
    setNewSourceFile(null)
  }

  // Remove source
  const removeSource = (id: string) => {
    setSources(sources.filter(s => s.id !== id))
  }

  // Add action
  const addAction = () => {
    const newAction: ActionItem = {
      id: `temp-${Date.now()}`,
      name: 'Nova Ação',
      conditions: [],
      actions: [],
      match_type: 'all',
      is_active: true,
    }
    setEditingAction(newAction)
    setShowActionModal(true)
  }

  // Save action
  const saveAction = (action: ActionItem) => {
    const existing = actions.find(a => a.id === action.id)
    if (existing) {
      setActions(actions.map(a => a.id === action.id ? action : a))
    } else {
      setActions([...actions, action])
    }
    setShowActionModal(false)
    setEditingAction(null)
  }

  // Remove action
  const removeAction = (id: string) => {
    setActions(actions.filter(a => a.id !== id))
  }

  // Navigate tabs
  const currentTabIndex = tabs.findIndex(t => t.id === activeTab)
  const canGoNext = () => {
    if (activeTab === 'template') return selectedTemplate !== null
    if (activeTab === 'persona') return name.trim().length > 0
    if (activeTab === 'model') return model.length > 0
    return true
  }

  const goNext = () => {
    if (currentTabIndex < tabs.length - 1) {
      setActiveTab(tabs[currentTabIndex + 1].id)
    }
  }

  const goBack = () => {
    if (currentTabIndex > 0) {
      setActiveTab(tabs[currentTabIndex - 1].id)
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
          max_tokens: maxTokens,
          system_prompt: systemPrompt || undefined,
          is_active: false,
          persona: {
            role_description: roleDescription,
            tone,
            response_length: responseLength,
            language,
            reply_delay: replyDelay,
            guidelines: guidelines.filter(g => g.trim()),
          },
          settings: {
            channels: { all_channels: true, channel_ids: [] },
            pipelines: { all_pipelines: true, pipeline_ids: [], stage_ids: [] },
            schedule: {
              always_active: true,
              timezone: 'America/Sao_Paulo',
              hours: { start: '08:00', end: '18:00' },
              days: ['mon', 'tue', 'wed', 'thu', 'fri'],
            },
            behavior: {
              activate_on: 'new_message',
              stop_on_human_reply: true,
              cooldown_after_transfer: 300,
              max_messages_per_conversation: 50,
            },
          },
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao criar agente')
      }

      const data = await res.json()
      const agentId = data.agent.id

      // Criar sources
      for (const source of sources) {
        if (source.type === 'text' && source.content) {
          await fetch(`/api/ai/agents/${agentId}/sources`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              organization_id: organizationId,
              source_type: 'text',
              name: source.name,
              text_content: source.content,
            }),
          })
        } else if (source.type === 'url' && source.content) {
          await fetch(`/api/ai/agents/${agentId}/sources`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              organization_id: organizationId,
              source_type: 'url',
              name: source.name,
              url: source.content,
            }),
          })
        }
      }

      // Criar actions
      for (const action of actions) {
        // Só criar se tiver condições e ações
        if (action.conditions.length > 0 && action.actions.length > 0) {
          await fetch(`/api/ai/agents/${agentId}/actions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              organization_id: organizationId,
              name: action.name,
              is_active: action.is_active,
              priority: 1,
              conditions: {
                match_type: action.match_type,
                items: action.conditions.map(c => ({
                  type: c.type.startsWith('want_') ? 'intent' :
                        c.type.startsWith('ask_') ? 'intent' :
                        c.type.startsWith('sentiment_') ? 'sentiment' :
                        c.type === 'custom' ? 'keyword' : 'intent',
                  intent: c.type.startsWith('want_') || c.type.startsWith('ask_') ? c.type : undefined,
                  sentiment: c.type.startsWith('sentiment_') ? c.type.replace('sentiment_', '') : undefined,
                  keywords: c.type === 'custom' && c.value ? [c.value] : undefined,
                })),
              },
              actions: action.actions.map(a => ({
                type: a.type === 'transfer_human' ? 'transfer' :
                      a.type === 'exact_message' ? 'reply_fixed' :
                      a.type === 'use_source' ? 'use_source' :
                      a.type === 'ask_email' ? 'ask_field' :
                      a.type === 'ask_phone' ? 'ask_field' :
                      a.type === 'dont_mention' ? 'never_mention' :
                      a.type === 'always_mention' ? 'always_mention' : a.type,
                message: a.type === 'exact_message' ? a.value : undefined,
                ask_field: a.type === 'ask_email' ? 'email' :
                          a.type === 'ask_phone' ? 'phone' : undefined,
                topic: (a.type === 'dont_mention' || a.type === 'always_mention') ? a.value : undefined,
              })),
            }),
          })
        }
      }

      onCreate(agentId)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'template':
        return (
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
        )

      case 'persona':
        return (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Nome do Agente *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Assistente de Vendas"
                  className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder:text-dark-500 focus:outline-none focus:border-primary-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Idioma</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white focus:outline-none focus:border-primary-500/50"
                >
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Papel e Personalidade
                <span className="text-dark-500 font-normal ml-2">({roleDescription.length}/1500)</span>
              </label>
              <textarea
                value={roleDescription}
                onChange={(e) => setRoleDescription(e.target.value.slice(0, 1500))}
                placeholder="Descreva quem é o agente, sua função e personalidade..."
                rows={4}
                className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder:text-dark-500 resize-none focus:outline-none focus:border-primary-500/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Tom de Voz</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'casual', label: 'Casual', desc: 'Relaxado' },
                    { value: 'friendly', label: 'Amigável', desc: 'Animado' },
                    { value: 'professional', label: 'Profissional', desc: 'Formal' },
                  ].map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setTone(t.value as any)}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        tone === t.value
                          ? 'bg-primary-500/10 border-primary-500/50 text-primary-400'
                          : 'bg-dark-900/50 border-dark-700/50 text-dark-400 hover:text-white'
                      }`}
                    >
                      <div className="text-sm font-medium">{t.label}</div>
                      <div className="text-xs opacity-60">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Tamanho das Respostas</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'short', label: 'Curto', desc: '100-200' },
                    { value: 'medium', label: 'Médio', desc: '150-250' },
                    { value: 'long', label: 'Longo', desc: '200-300' },
                  ].map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setResponseLength(r.value as any)}
                      className={`p-3 rounded-xl border text-center transition-all ${
                        responseLength === r.value
                          ? 'bg-primary-500/10 border-primary-500/50 text-primary-400'
                          : 'bg-dark-900/50 border-dark-700/50 text-dark-400 hover:text-white'
                      }`}
                    >
                      <div className="text-sm font-medium">{r.label}</div>
                      <div className="text-xs opacity-60">{r.desc} chars</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-dark-300 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Pausa antes de responder
                </label>
                <span className="text-sm text-primary-400">{replyDelay}s</span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                value={replyDelay}
                onChange={(e) => setReplyDelay(parseInt(e.target.value))}
                className="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
              />
              <p className="text-xs text-dark-500 mt-1">Aguarda novas mensagens antes de responder</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-dark-300">
                  Diretrizes ({guidelines.filter(g => g.trim()).length}/50)
                </label>
                <button
                  onClick={addGuideline}
                  disabled={guidelines.length >= 50}
                  className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Adicionar
                </button>
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {guidelines.map((g, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={g}
                      onChange={(e) => updateGuideline(i, e.target.value)}
                      placeholder={`Diretriz ${i + 1}...`}
                      className="flex-1 px-3 py-2 bg-dark-900/50 border border-dark-700/50 rounded-lg text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-primary-500/50"
                    />
                    <button
                      onClick={() => removeGuideline(i)}
                      className="p-2 text-dark-500 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )

      case 'model':
        return (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Provedor de IA</label>
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
              <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Configure a API key em Configurações → API Keys
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Modelo</label>
              {loadingModels ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
                </div>
              ) : (
                <div className="grid gap-2 max-h-40 overflow-y-auto">
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
                        <p className="text-sm text-white">{m.display_name || m.name}</p>
                        {m.description && <p className="text-xs text-dark-500">{m.description}</p>}
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

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Prompt do Sistema (opcional)
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Instruções adicionais para o modelo..."
                rows={3}
                className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder:text-dark-500 resize-none focus:outline-none focus:border-primary-500/50"
              />
            </div>
          </div>
        )

      case 'sources':
        return (
          <div className="space-y-4">
            <div>
              <h4 className="text-white font-medium mb-1">Base de Conhecimento</h4>
              <p className="text-sm text-dark-400">Adicione informações que o agente usará para responder</p>
            </div>

            <div className="p-4 bg-dark-900/50 border border-dark-700/50 rounded-xl space-y-3">
              <div className="flex gap-2">
                {[
                  { type: 'text', label: 'Texto', icon: Type },
                  { type: 'url', label: 'URL', icon: Globe },
                  { type: 'file', label: 'Arquivo', icon: FileText },
                ].map((t) => (
                  <button
                    key={t.type}
                    onClick={() => setNewSourceType(t.type as any)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      newSourceType === t.type
                        ? 'bg-primary-500/20 text-primary-400'
                        : 'text-dark-400 hover:text-white'
                    }`}
                  >
                    <t.icon className="w-4 h-4" />
                    {t.label}
                  </button>
                ))}
              </div>

              <input
                type="text"
                value={newSourceName}
                onChange={(e) => setNewSourceName(e.target.value)}
                placeholder="Nome da fonte (ex: FAQ, Produtos, Políticas)"
                className="w-full px-3 py-2 bg-dark-800 border border-dark-700/50 rounded-lg text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-primary-500/50"
              />

              {newSourceType === 'text' && (
                <textarea
                  value={newSourceContent}
                  onChange={(e) => setNewSourceContent(e.target.value)}
                  placeholder="Cole o texto aqui (até 5.000 caracteres)"
                  rows={3}
                  maxLength={5000}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700/50 rounded-lg text-sm text-white placeholder:text-dark-500 resize-none focus:outline-none focus:border-primary-500/50"
                />
              )}

              {newSourceType === 'url' && (
                <input
                  type="url"
                  value={newSourceContent}
                  onChange={(e) => setNewSourceContent(e.target.value)}
                  placeholder="https://exemplo.com/pagina"
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-700/50 rounded-lg text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-primary-500/50"
                />
              )}

              {newSourceType === 'file' && (
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={(e) => setNewSourceFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="source-file"
                  />
                  <label
                    htmlFor="source-file"
                    className="flex items-center gap-2 px-4 py-2 bg-dark-800 border border-dashed border-dark-600 rounded-lg cursor-pointer hover:border-primary-500/50 text-sm text-dark-400"
                  >
                    <Upload className="w-4 h-4" />
                    {newSourceFile ? newSourceFile.name : 'Selecionar arquivo (PDF, DOC, DOCX)'}
                  </label>
                </div>
              )}

              <button
                onClick={addSource}
                disabled={!newSourceName.trim() || (newSourceType !== 'file' && !newSourceContent.trim())}
                className="w-full py-2 bg-primary-500/20 hover:bg-primary-500/30 disabled:bg-dark-700 text-primary-400 disabled:text-dark-500 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Adicionar Fonte
              </button>
            </div>

            {sources.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-dark-400">{sources.length} fonte(s) adicionada(s)</p>
                {sources.map((source) => (
                  <div
                    key={source.id}
                    className="flex items-center justify-between p-3 bg-dark-900/50 border border-dark-700/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {source.type === 'text' && <Type className="w-4 h-4 text-blue-400" />}
                      {source.type === 'url' && <Globe className="w-4 h-4 text-green-400" />}
                      {source.type === 'file' && <FileText className="w-4 h-4 text-orange-400" />}
                      <div>
                        <p className="text-sm text-white">{source.name}</p>
                        <p className="text-xs text-dark-500">
                          {source.type === 'text' && `${source.content.length} caracteres`}
                          {source.type === 'url' && source.content}
                          {source.type === 'file' && source.content}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeSource(source.id)}
                      className="p-2 text-dark-500 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {sources.length === 0 && (
              <div className="text-center py-8 text-dark-500">
                <Database className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma fonte adicionada ainda</p>
                <p className="text-xs">Adicione textos, URLs ou arquivos</p>
              </div>
            )}
          </div>
        )

      case 'actions':
        return (
          <div className="space-y-4">
            <div>
              <h4 className="text-white font-medium mb-1">Ações Condicionais</h4>
              <p className="text-sm text-dark-400">Configure comportamentos automáticos (When → Do)</p>
            </div>

            <button
              onClick={addAction}
              disabled={actions.length >= 20}
              className="w-full py-3 border-2 border-dashed border-dark-600 hover:border-primary-500/50 rounded-xl text-dark-400 hover:text-primary-400 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Adicionar Ação ({actions.length}/20)
            </button>

            {actions.length > 0 && (
              <div className="space-y-2">
                {actions.map((action) => (
                  <div
                    key={action.id}
                    className="p-4 bg-dark-900/50 border border-dark-700/50 rounded-xl"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Zap className={`w-4 h-4 ${action.is_active ? 'text-green-400' : 'text-dark-500'}`} />
                        <span className="text-white font-medium">{action.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingAction(action)
                            setShowActionModal(true)
                          }}
                          className="text-xs text-primary-400 hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => removeAction(action.id)}
                          className="text-dark-500 hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-dark-400">
                      <span>{action.conditions.length} condição(ões)</span>
                      <span className="mx-2">→</span>
                      <span>{action.actions.length} ação(ões)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {actions.length === 0 && (
              <div className="text-center py-8 text-dark-500">
                <Zap className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma ação configurada</p>
                <p className="text-xs">Adicione regras de comportamento</p>
              </div>
            )}
          </div>
        )

      case 'review':
        return (
          <div className="space-y-4">
            <div>
              <h4 className="text-white font-medium mb-1">Revisar Configurações</h4>
              <p className="text-sm text-dark-400">Confira os detalhes antes de criar o agente</p>
            </div>

            <div className="space-y-3">
              <div className="p-4 bg-dark-900/50 border border-dark-700/50 rounded-xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-primary-400" />
                  </div>
                  <div>
                    <h3 className="font-medium text-white">{name || 'Sem nome'}</h3>
                    <p className="text-xs text-dark-400">{provider} / {model}</p>
                  </div>
                </div>
                {roleDescription && (
                  <p className="text-sm text-dark-400 line-clamp-2">{roleDescription}</p>
                )}
              </div>

              <div className="p-4 bg-dark-900/50 border border-dark-700/50 rounded-xl">
                <h4 className="text-sm font-medium text-dark-300 mb-2 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Persona
                </h4>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs bg-dark-700 text-dark-300 px-2 py-1 rounded-full capitalize">
                    Tom: {tone}
                  </span>
                  <span className="text-xs bg-dark-700 text-dark-300 px-2 py-1 rounded-full capitalize">
                    Respostas: {responseLength}
                  </span>
                  <span className="text-xs bg-dark-700 text-dark-300 px-2 py-1 rounded-full">
                    {guidelines.filter(g => g.trim()).length} diretrizes
                  </span>
                </div>
              </div>

              <div className="p-4 bg-dark-900/50 border border-dark-700/50 rounded-xl">
                <h4 className="text-sm font-medium text-dark-300 mb-2 flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Conhecimento
                </h4>
                <p className="text-sm text-white">
                  {sources.length > 0 ? `${sources.length} fonte(s) configurada(s)` : 'Nenhuma fonte adicionada'}
                </p>
              </div>

              <div className="p-4 bg-dark-900/50 border border-dark-700/50 rounded-xl">
                <h4 className="text-sm font-medium text-dark-300 mb-2 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Ações
                </h4>
                <p className="text-sm text-white">
                  {actions.length > 0 ? `${actions.length} ação(ões) configurada(s)` : 'Nenhuma ação configurada'}
                </p>
              </div>
            </div>

            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
              <p className="text-xs text-yellow-400 flex items-center gap-2">
                <Info className="w-4 h-4" />
                O agente será criado como <strong>inativo</strong>. Ative-o quando estiver pronto.
              </p>
            </div>
          </div>
        )
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-dark-800 rounded-2xl w-full max-w-2xl border border-dark-700/50 overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-dark-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Criar Novo Agente de IA</h2>
                <p className="text-xs text-dark-400">Passo {currentTabIndex + 1} de {tabs.length}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress/Tabs */}
          <div className="flex items-center gap-1 px-4 py-3 bg-dark-900/50 overflow-x-auto">
            {tabs.map((tab, index) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              const isPast = index < currentTabIndex
              const isClickable = index <= currentTabIndex

              return (
                <button
                  key={tab.id}
                  onClick={() => isClickable && setActiveTab(tab.id)}
                  disabled={!isClickable}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-primary-500/20 text-primary-400'
                      : isPast
                      ? 'text-green-400 hover:bg-dark-700'
                      : 'text-dark-500'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                    isActive ? 'bg-primary-500 text-white' : isPast ? 'bg-green-500 text-white' : 'bg-dark-700'
                  }`}>
                    {isPast ? <Check className="w-3 h-3" /> : index + 1}
                  </div>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              )
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
            {renderTabContent()}
          </div>

          {/* Footer */}
          <div className="flex gap-3 p-4 border-t border-dark-700/50">
            {currentTabIndex > 0 && (
              <button
                onClick={goBack}
                className="flex items-center gap-2 px-4 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar
              </button>
            )}
            <div className="flex-1" />
            {activeTab !== 'review' ? (
              <button
                onClick={goNext}
                disabled={!canGoNext()}
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

      {/* Action Modal */}
      <AnimatePresence>
        {showActionModal && editingAction && (
          <ActionModal
            action={editingAction}
            onSave={saveAction}
            onClose={() => {
              setShowActionModal(false)
              setEditingAction(null)
            }}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// =====================================================
// ACTION MODAL COMPONENT
// =====================================================

interface ActionModalProps {
  action: ActionItem
  onSave: (action: ActionItem) => void
  onClose: () => void
}

function ActionModal({ action, onSave, onClose }: ActionModalProps) {
  const [name, setName] = useState(action.name)
  const [matchType, setMatchType] = useState<'all' | 'any'>(action.match_type)
  const [conditions, setConditions] = useState(action.conditions)
  const [actionsDo, setActionsDo] = useState(action.actions)

  const addCondition = (type: string) => {
    setConditions([...conditions, { type, value: '' }])
  }

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index))
  }

  const addActionDo = (type: string) => {
    setActionsDo([...actionsDo, { type, value: '' }])
  }

  const removeActionDo = (index: number) => {
    setActionsDo(actionsDo.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    onSave({
      ...action,
      name,
      match_type: matchType,
      conditions,
      actions: actionsDo,
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-dark-800 rounded-2xl w-full max-w-lg border border-dark-700/50 overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between p-4 border-b border-dark-700/50">
          <h3 className="text-lg font-semibold text-white">Configurar Ação</h3>
          <button onClick={onClose} className="p-2 hover:bg-dark-700 rounded-lg text-dark-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Nome da Ação</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Transferir se frustrado"
              className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder:text-dark-500 focus:outline-none focus:border-primary-500/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Quando executar</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMatchType('all')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  matchType === 'all'
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                    : 'bg-dark-900/50 text-dark-400 border border-dark-700/50'
                }`}
              >
                TODAS as condições
              </button>
              <button
                onClick={() => setMatchType('any')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  matchType === 'any'
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                    : 'bg-dark-900/50 text-dark-400 border border-dark-700/50'
                }`}
              >
                QUALQUER condição
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Quando (Condições)</label>
            <div className="space-y-2 mb-2">
              {conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-dark-500 w-6">{i + 1}.</span>
                  <select
                    value={c.type}
                    onChange={(e) => {
                      const updated = [...conditions]
                      updated[i].type = e.target.value
                      setConditions(updated)
                    }}
                    className="flex-1 px-3 py-2 bg-dark-900/50 border border-dark-700/50 rounded-lg text-sm text-white"
                  >
                    <option value="">Selecione...</option>
                    {conditionPresets.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                    <option value="custom">Personalizado</option>
                  </select>
                  {c.type === 'custom' && (
                    <input
                      type="text"
                      value={c.value}
                      onChange={(e) => {
                        const updated = [...conditions]
                        updated[i].value = e.target.value
                        setConditions(updated)
                      }}
                      placeholder="Valor..."
                      className="flex-1 px-3 py-2 bg-dark-900/50 border border-dark-700/50 rounded-lg text-sm text-white"
                    />
                  )}
                  <button onClick={() => removeCondition(i)} className="p-2 text-dark-500 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => addCondition('')}
              disabled={conditions.length >= 5}
              className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Adicionar Condição ({conditions.length}/5)
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Então (Ações)</label>
            <div className="space-y-2 mb-2">
              {actionsDo.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-dark-500 w-6">{i + 1}.</span>
                  <select
                    value={a.type}
                    onChange={(e) => {
                      const updated = [...actionsDo]
                      updated[i].type = e.target.value
                      setActionsDo(updated)
                    }}
                    className="flex-1 px-3 py-2 bg-dark-900/50 border border-dark-700/50 rounded-lg text-sm text-white"
                  >
                    <option value="">Selecione...</option>
                    {actionPresets.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                  {(a.type === 'exact_message' || a.type === 'dont_mention' || a.type === 'always_mention') && (
                    <input
                      type="text"
                      value={a.value}
                      onChange={(e) => {
                        const updated = [...actionsDo]
                        updated[i].value = e.target.value
                        setActionsDo(updated)
                      }}
                      placeholder="Conteúdo..."
                      className="flex-1 px-3 py-2 bg-dark-900/50 border border-dark-700/50 rounded-lg text-sm text-white"
                    />
                  )}
                  <button onClick={() => removeActionDo(i)} className="p-2 text-dark-500 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => addActionDo('')}
              disabled={actionsDo.length >= 5}
              className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Adicionar Ação ({actionsDo.length}/5)
            </button>
          </div>
        </div>

        <div className="flex gap-3 p-4 border-t border-dark-700/50">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-dark-600 text-white rounded-xl font-medium transition-colors"
          >
            Salvar Ação
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
