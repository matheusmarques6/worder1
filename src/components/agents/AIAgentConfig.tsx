'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Bot,
  Brain,
  Zap,
  MessageSquare,
  Clock,
  Settings,
  Save,
  Loader2,
  Info,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  Phone,
  Layers,
  Calendar,
  ArrowRight,
  Sparkles,
  BookOpen,
} from 'lucide-react'

interface AIConfig {
  provider: string
  model: string
  temperature: number
  max_tokens: number
  system_prompt: string
  greeting_message: string
  away_message: string
  transfer_keywords: string[]
  transfer_to_queue: boolean
  transfer_after_messages: number
  use_knowledge_base: boolean
  knowledge_base_id?: string
  // Schedule
  always_active: boolean
  only_when_no_human: boolean
  schedule?: {
    timezone: string
    hours: { start: string; end: string }
    days: string[]
  }
  // Assignments
  whatsapp_number_ids: string[]
}

interface AIModel {
  id: string
  provider: string
  display_name: string
  description?: string
  cost_per_1k_input?: number
  cost_per_1k_output?: number
  tier: string
  context_window?: number
  supports_vision?: boolean
}

interface WhatsAppNumber {
  id: string
  phone_number: string
  display_name?: string
  is_connected: boolean
}

interface KnowledgeBase {
  id: string
  name: string
  documents_count: number
}

interface AIAgentConfigProps {
  agentId: string
  agentName: string
  initialConfig?: Partial<AIConfig>
  isOpen: boolean
  onClose: () => void
  onSave: (config: AIConfig) => Promise<void>
}

const defaultConfig: AIConfig = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  temperature: 0.3,
  max_tokens: 500,
  system_prompt: `Você é um assistente virtual prestativo e educado. Seu objetivo é ajudar os clientes de forma eficiente e amigável.

Diretrizes:
- Seja sempre cordial e profissional
- Responda de forma clara e concisa
- Se não souber algo, seja honesto
- Ofereça ajuda adicional quando apropriado`,
  greeting_message: 'Olá! 👋 Sou o assistente virtual. Como posso ajudar você hoje?',
  away_message: 'No momento não estou disponível, mas deixe sua mensagem que retornarei em breve!',
  transfer_keywords: ['atendente', 'humano', 'pessoa', 'falar com alguém'],
  transfer_to_queue: true,
  transfer_after_messages: 0,
  use_knowledge_base: false,
  always_active: false,
  only_when_no_human: true,
  whatsapp_number_ids: [],
}

const providerModels: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
  google: ['gemini-1.5-pro', 'gemini-1.5-flash'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
}

const weekDays = [
  { id: 'mon', label: 'Seg' },
  { id: 'tue', label: 'Ter' },
  { id: 'wed', label: 'Qua' },
  { id: 'thu', label: 'Qui' },
  { id: 'fri', label: 'Sex' },
  { id: 'sat', label: 'Sáb' },
  { id: 'sun', label: 'Dom' },
]

export default function AIAgentConfig({
  agentId,
  agentName,
  initialConfig,
  isOpen,
  onClose,
  onSave,
}: AIAgentConfigProps) {
  const [config, setConfig] = useState<AIConfig>({ ...defaultConfig, ...initialConfig })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  
  // Data
  const [models, setModels] = useState<AIModel[]>([])
  const [whatsappNumbers, setWhatsappNumbers] = useState<WhatsAppNumber[]>([])
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [apiKeys, setApiKeys] = useState<{ provider: string; is_valid: boolean }[]>([])
  const [loading, setLoading] = useState(true)

  // Expanded sections
  const [expandedSections, setExpandedSections] = useState({
    model: true,
    prompts: true,
    transfer: false,
    schedule: false,
    numbers: false,
    knowledge: false,
  })

  // Fetch data
  useEffect(() => {
    if (!isOpen) return

    const fetchData = async () => {
      setLoading(true)
      try {
        // Fetch models
        const modelsRes = await fetch('/api/ai/models')
        const modelsData = await modelsRes.json()
        setModels(modelsData.models || [])

        // Fetch numbers
        const numbersRes = await fetch('/api/whatsapp/numbers')
        const numbersData = await numbersRes.json()
        setWhatsappNumbers(numbersData.numbers || [])

        // Fetch knowledge bases
        const kbRes = await fetch('/api/ai/knowledge')
        const kbData = await kbRes.json()
        setKnowledgeBases(kbData.knowledge_bases || [])

        // Fetch API keys
        const keysRes = await fetch('/api/api-keys')
        const keysData = await keysRes.json()
        setApiKeys(keysData.keys || [])
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [isOpen])

  // Toggle section
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  // Handle save
  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave(config)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar configuração')
    } finally {
      setSaving(false)
    }
  }

  // Get models for selected provider
  const availableModels = models.filter(m => m.provider === config.provider)
  
  // Check if provider has valid API key
  const hasValidKey = apiKeys.some(k => k.provider === config.provider && k.is_valid)

  if (!isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-dark-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Configurar Agente IA</h2>
              <p className="text-sm text-dark-400">{agentName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
            </div>
          ) : (
            <>
              {/* Model Section */}
              <ConfigSection
                title="Modelo de IA"
                icon={Brain}
                iconColor="text-purple-400"
                iconBg="bg-purple-500/20"
                expanded={expandedSections.model}
                onToggle={() => toggleSection('model')}
              >
                {/* Provider */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-dark-300 mb-2">Provider</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['openai', 'anthropic', 'google', 'groq'].map((provider) => {
                      const hasKey = apiKeys.some(k => k.provider === provider && k.is_valid)
                      return (
                        <button
                          key={provider}
                          onClick={() => setConfig(prev => ({ 
                            ...prev, 
                            provider, 
                            model: providerModels[provider]?.[0] || '' 
                          }))}
                          className={`p-3 rounded-xl border transition-all relative ${
                            config.provider === provider
                              ? 'border-primary-500 bg-primary-500/10'
                              : 'border-dark-700/50 hover:border-dark-600'
                          }`}
                        >
                          <span className="text-sm text-white capitalize">{provider}</span>
                          {hasKey ? (
                            <CheckCircle className="absolute top-1 right-1 w-3 h-3 text-green-400" />
                          ) : (
                            <AlertCircle className="absolute top-1 right-1 w-3 h-3 text-yellow-400" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {!hasValidKey && (
                    <p className="text-xs text-yellow-400 mt-2">
                      ⚠️ Configure sua API key em Configurações → API Keys
                    </p>
                  )}
                </div>

                {/* Model */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-dark-300 mb-2">Modelo</label>
                  <select
                    value={config.model}
                    onChange={(e) => setConfig(prev => ({ ...prev, model: e.target.value }))}
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white focus:outline-none focus:border-primary-500/50"
                  >
                    {availableModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.display_name} 
                        {model.cost_per_1k_input && ` - $${((model.cost_per_1k_input + (model.cost_per_1k_output || 0)) * 500).toFixed(2)}/1M tokens`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Temperature */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-dark-300">Temperatura</label>
                    <span className="text-sm text-primary-400">{config.temperature}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={config.temperature}
                    onChange={(e) => setConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-dark-500 mt-1">
                    <span>Preciso / Consistente</span>
                    <span>Criativo / Variado</span>
                  </div>
                </div>
              </ConfigSection>

              {/* Prompts Section */}
              <ConfigSection
                title="Mensagens e Instruções"
                icon={MessageSquare}
                iconColor="text-blue-400"
                iconBg="bg-blue-500/20"
                expanded={expandedSections.prompts}
                onToggle={() => toggleSection('prompts')}
              >
                {/* System Prompt */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Instruções do Sistema
                  </label>
                  <textarea
                    value={config.system_prompt}
                    onChange={(e) => setConfig(prev => ({ ...prev, system_prompt: e.target.value }))}
                    rows={6}
                    placeholder="Descreva como o agente deve se comportar..."
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 resize-none"
                  />
                  <p className="text-xs text-dark-500 mt-1">
                    Defina a personalidade, tom e comportamento do agente
                  </p>
                </div>

                {/* Greeting */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Mensagem de Boas-vindas
                  </label>
                  <textarea
                    value={config.greeting_message}
                    onChange={(e) => setConfig(prev => ({ ...prev, greeting_message: e.target.value }))}
                    rows={2}
                    placeholder="Olá! Como posso ajudar?"
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 resize-none"
                  />
                </div>

                {/* Away Message */}
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Mensagem Fora do Horário
                  </label>
                  <textarea
                    value={config.away_message}
                    onChange={(e) => setConfig(prev => ({ ...prev, away_message: e.target.value }))}
                    rows={2}
                    placeholder="No momento não estou disponível..."
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 resize-none"
                  />
                </div>
              </ConfigSection>

              {/* Transfer Section */}
              <ConfigSection
                title="Transferência para Humano"
                icon={ArrowRight}
                iconColor="text-green-400"
                iconBg="bg-green-500/20"
                expanded={expandedSections.transfer}
                onToggle={() => toggleSection('transfer')}
              >
                {/* Transfer Keywords */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Palavras-chave para Transferir
                  </label>
                  <input
                    type="text"
                    value={config.transfer_keywords.join(', ')}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      transfer_keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean)
                    }))}
                    placeholder="atendente, humano, pessoa"
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50"
                  />
                  <p className="text-xs text-dark-500 mt-1">
                    Separe por vírgula. Cliente será transferido ao usar essas palavras.
                  </p>
                </div>

                {/* Transfer to Queue */}
                <label className="flex items-center justify-between p-3 bg-dark-900/50 rounded-lg cursor-pointer mb-4">
                  <div>
                    <span className="text-sm text-white">Transferir para fila de espera</span>
                    <p className="text-xs text-dark-500">Adiciona o chat à fila quando transferido</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.transfer_to_queue}
                    onChange={(e) => setConfig(prev => ({ ...prev, transfer_to_queue: e.target.checked }))}
                    className="w-5 h-5 rounded bg-dark-700 border-dark-600 text-primary-500"
                  />
                </label>

                {/* Transfer After X Messages */}
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    Transferir após X mensagens sem resolução
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={config.transfer_after_messages}
                    onChange={(e) => setConfig(prev => ({ ...prev, transfer_after_messages: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white focus:outline-none focus:border-primary-500/50"
                  />
                  <p className="text-xs text-dark-500 mt-1">
                    0 = nunca transferir automaticamente
                  </p>
                </div>
              </ConfigSection>

              {/* Schedule Section */}
              <ConfigSection
                title="Horário de Funcionamento"
                icon={Clock}
                iconColor="text-yellow-400"
                iconBg="bg-yellow-500/20"
                expanded={expandedSections.schedule}
                onToggle={() => toggleSection('schedule')}
              >
                {/* Always Active */}
                <label className="flex items-center justify-between p-3 bg-dark-900/50 rounded-lg cursor-pointer mb-4">
                  <div>
                    <span className="text-sm text-white">Sempre ativo (24/7)</span>
                    <p className="text-xs text-dark-500">Responde a qualquer hora</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.always_active}
                    onChange={(e) => setConfig(prev => ({ ...prev, always_active: e.target.checked }))}
                    className="w-5 h-5 rounded bg-dark-700 border-dark-600 text-primary-500"
                  />
                </label>

                {/* Only When No Human */}
                <label className="flex items-center justify-between p-3 bg-dark-900/50 rounded-lg cursor-pointer mb-4">
                  <div>
                    <span className="text-sm text-white">Apenas quando não há humanos online</span>
                    <p className="text-xs text-dark-500">IA para quando agentes humanos estiverem offline</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.only_when_no_human}
                    onChange={(e) => setConfig(prev => ({ ...prev, only_when_no_human: e.target.checked }))}
                    className="w-5 h-5 rounded bg-dark-700 border-dark-600 text-primary-500"
                  />
                </label>

                {/* Schedule (when not always active) */}
                {!config.always_active && (
                  <div className="p-4 bg-dark-900/50 rounded-lg space-y-4">
                    {/* Days */}
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">Dias</label>
                      <div className="flex gap-2">
                        {weekDays.map((day) => {
                          const isSelected = config.schedule?.days?.includes(day.id)
                          return (
                            <button
                              key={day.id}
                              onClick={() => {
                                const currentDays = config.schedule?.days || []
                                const newDays = isSelected
                                  ? currentDays.filter(d => d !== day.id)
                                  : [...currentDays, day.id]
                                setConfig(prev => ({
                                  ...prev,
                                  schedule: { ...prev.schedule, days: newDays, timezone: 'America/Sao_Paulo', hours: prev.schedule?.hours || { start: '08:00', end: '18:00' } }
                                }))
                              }}
                              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                                isSelected
                                  ? 'bg-primary-500 text-white'
                                  : 'bg-dark-700/50 text-dark-400 hover:text-white'
                              }`}
                            >
                              {day.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Hours */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">Início</label>
                        <input
                          type="time"
                          value={config.schedule?.hours?.start || '08:00'}
                          onChange={(e) => setConfig(prev => ({
                            ...prev,
                            schedule: { 
                              ...prev.schedule, 
                              hours: { ...(prev.schedule?.hours || { start: '08:00', end: '18:00' }), start: e.target.value },
                              timezone: 'America/Sao_Paulo',
                              days: prev.schedule?.days || []
                            }
                          }))}
                          className="w-full px-4 py-3 bg-dark-800 border border-dark-700/50 rounded-xl text-white focus:outline-none focus:border-primary-500/50"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">Fim</label>
                        <input
                          type="time"
                          value={config.schedule?.hours?.end || '18:00'}
                          onChange={(e) => setConfig(prev => ({
                            ...prev,
                            schedule: { 
                              ...prev.schedule, 
                              hours: { ...(prev.schedule?.hours || { start: '08:00', end: '18:00' }), end: e.target.value },
                              timezone: 'America/Sao_Paulo',
                              days: prev.schedule?.days || []
                            }
                          }))}
                          className="w-full px-4 py-3 bg-dark-800 border border-dark-700/50 rounded-xl text-white focus:outline-none focus:border-primary-500/50"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </ConfigSection>

              {/* WhatsApp Numbers Section */}
              <ConfigSection
                title="Números de WhatsApp"
                icon={Phone}
                iconColor="text-green-400"
                iconBg="bg-green-500/20"
                expanded={expandedSections.numbers}
                onToggle={() => toggleSection('numbers')}
                badge={`${config.whatsapp_number_ids.length} selecionado${config.whatsapp_number_ids.length !== 1 ? 's' : ''}`}
              >
                <p className="text-sm text-dark-400 mb-4">
                  Selecione em quais números este agente deve atuar:
                </p>
                
                {whatsappNumbers.length === 0 ? (
                  <p className="text-sm text-dark-500 text-center py-4">
                    Nenhum número conectado
                  </p>
                ) : (
                  <div className="space-y-2">
                    {whatsappNumbers.map((number) => {
                      const isSelected = config.whatsapp_number_ids.includes(number.id)
                      return (
                        <label
                          key={number.id}
                          className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-green-500/10 border border-green-500/30'
                              : 'bg-dark-900/50 border border-transparent hover:bg-dark-900'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setConfig(prev => ({
                                ...prev,
                                whatsapp_number_ids: isSelected
                                  ? prev.whatsapp_number_ids.filter(id => id !== number.id)
                                  : [...prev.whatsapp_number_ids, number.id]
                              }))
                            }}
                            className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-green-500"
                          />
                          <div className="flex-1">
                            <p className="text-sm text-white">
                              {number.display_name || number.phone_number}
                            </p>
                            <p className="text-xs text-dark-500">{number.phone_number}</p>
                          </div>
                          <div className={`w-2 h-2 rounded-full ${
                            number.is_connected ? 'bg-green-400' : 'bg-red-400'
                          }`} />
                        </label>
                      )
                    })}
                  </div>
                )}
              </ConfigSection>

              {/* Knowledge Base Section */}
              <ConfigSection
                title="Base de Conhecimento"
                icon={BookOpen}
                iconColor="text-indigo-400"
                iconBg="bg-indigo-500/20"
                expanded={expandedSections.knowledge}
                onToggle={() => toggleSection('knowledge')}
              >
                <label className="flex items-center justify-between p-3 bg-dark-900/50 rounded-lg cursor-pointer mb-4">
                  <div>
                    <span className="text-sm text-white">Usar base de conhecimento</span>
                    <p className="text-xs text-dark-500">O agente consultará documentos para responder</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.use_knowledge_base}
                    onChange={(e) => setConfig(prev => ({ ...prev, use_knowledge_base: e.target.checked }))}
                    className="w-5 h-5 rounded bg-dark-700 border-dark-600 text-primary-500"
                  />
                </label>

                {config.use_knowledge_base && (
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      Selecionar Base
                    </label>
                    {knowledgeBases.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-dark-500 mb-2">Nenhuma base de conhecimento</p>
                        <button className="text-sm text-primary-400 hover:text-primary-300">
                          + Criar base
                        </button>
                      </div>
                    ) : (
                      <select
                        value={config.knowledge_base_id || ''}
                        onChange={(e) => setConfig(prev => ({ ...prev, knowledge_base_id: e.target.value }))}
                        className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white focus:outline-none focus:border-primary-500/50"
                      >
                        <option value="">Selecione uma base</option>
                        {knowledgeBases.map((kb) => (
                          <option key={kb.id} value={kb.id}>
                            {kb.name} ({kb.documents_count} documentos)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </ConfigSection>

              {/* Error */}
              {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-dark-700">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 py-3 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 disabled:from-dark-600 disabled:to-dark-600 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Salvar Configuração
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Config Section Component
function ConfigSection({
  title,
  icon: Icon,
  iconColor,
  iconBg,
  expanded,
  onToggle,
  badge,
  children,
}: {
  title: string
  icon: any
  iconColor: string
  iconBg: string
  expanded: boolean
  onToggle: () => void
  badge?: string
  children: React.ReactNode
}) {
  return (
    <div className="border border-dark-700/50 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-dark-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
            <Icon className={`w-4 h-4 ${iconColor}`} />
          </div>
          <span className="text-white font-medium">{title}</span>
          {badge && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-dark-700 text-dark-300">
              {badge}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="w-5 h-5 text-dark-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-dark-400" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-dark-700/50"
          >
            <div className="p-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
