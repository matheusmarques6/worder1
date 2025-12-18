'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  RefreshCw,
  Bot,
  User,
  Users,
  Power,
  PowerOff,
  Settings,
  Trash2,
  MessageSquare,
  Clock,
  TrendingUp,
  Loader2,
  Zap,
  Brain,
  Sparkles,
  X,
  ChevronRight,
  Mail,
  Eye,
  EyeOff,
  UserPlus,
  Shield,
  CheckCircle,
  AlertCircle,
  Key,
  Copy,
  Check,
} from 'lucide-react'
import { useAuthStore } from '@/stores'
import { validatePassword, passwordsMatch, generateStrongPassword } from '@/lib/password-validation'
import { PasswordStrengthIndicator, PasswordMatchIndicator } from '@/components/ui/PasswordStrength'

// Types
interface Agent {
  id: string
  organization_id: string
  type: 'human' | 'ai'
  name: string
  email?: string
  avatar_url?: string
  is_active: boolean
  status: 'online' | 'offline' | 'away' | 'busy'
  last_seen_at?: string
  total_conversations: number
  total_messages: number
  avg_response_time_seconds?: number
  ai_config?: {
    model: string
    provider: string
    temperature: number
  }
  stats?: {
    active_chats: number
    resolved_chats: number
  }
  created_at: string
  updated_at: string
}

interface AIModel {
  id: string
  provider: string
  display_name: string
  cost_per_1k_input?: number
  cost_per_1k_output?: number
}

// Status config
const statusConfig = {
  online: { label: 'Online', color: 'bg-green-500', textColor: 'text-green-400' },
  offline: { label: 'Offline', color: 'bg-dark-500', textColor: 'text-dark-400' },
  away: { label: 'Ausente', color: 'bg-yellow-500', textColor: 'text-yellow-400' },
  busy: { label: 'Ocupado', color: 'bg-red-500', textColor: 'text-red-400' },
}

const typeConfig = {
  human: { 
    label: 'Humano', 
    color: 'text-blue-400', 
    bgColor: 'bg-blue-500/20',
    icon: User,
  },
  ai: { 
    label: 'IA', 
    color: 'text-purple-400', 
    bgColor: 'bg-purple-500/20',
    icon: Bot,
  },
}

export default function AgentsTab() {
  // Auth
  const { user } = useAuthStore()
  const organizationId = user?.organization_id

  // State
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createType, setCreateType] = useState<'human' | 'ai' | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'human' | 'ai'>('all')
  const [aiModels, setAiModels] = useState<AIModel[]>([])
  const [apiKeys, setApiKeys] = useState<{ provider: string; is_valid: boolean }[]>([])

  // Fetch agents
  const fetchAgents = async () => {
    if (!organizationId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/agents?organization_id=${organizationId}&include_stats=true`)
      const data = await res.json()
      setAgents(data.agents || [])
    } catch (error) {
      console.error('Error fetching agents:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch AI models
  const fetchModels = async () => {
    if (!organizationId) return
    try {
      const res = await fetch(`/api/ai/models?organization_id=${organizationId}`)
      const data = await res.json()
      setAiModels(data.models || [])
    } catch (error) {
      console.error('Error fetching models:', error)
    }
  }

  // Fetch API keys
  const fetchApiKeys = async () => {
    if (!organizationId) return
    try {
      const res = await fetch(`/api/api-keys?organization_id=${organizationId}`)
      const data = await res.json()
      setApiKeys(data.keys || [])
    } catch (error) {
      console.error('Error fetching API keys:', error)
    }
  }

  useEffect(() => {
    if (organizationId) {
      fetchAgents()
      fetchModels()
      fetchApiKeys()
    }
  }, [organizationId])

  // Toggle agent status
  const handleToggleStatus = async (agent: Agent) => {
    if (!organizationId) return
    try {
      const res = await fetch('/api/whatsapp/agents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: agent.id,
          organization_id: organizationId,
          is_active: !agent.is_active,
        }),
      })
      if (res.ok) {
        fetchAgents()
      }
    } catch (error) {
      console.error('Error toggling agent:', error)
    }
  }

  // Delete agent
  const handleDelete = async (agentId: string) => {
    if (!organizationId) return
    if (!confirm('Tem certeza que deseja excluir este agente? Esta ação não pode ser desfeita.')) return
    
    try {
      const res = await fetch(`/api/whatsapp/agents?id=${agentId}&organization_id=${organizationId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        fetchAgents()
      } else {
        const data = await res.json()
        alert(data.error || 'Erro ao excluir agente')
      }
    } catch (error) {
      console.error('Error deleting agent:', error)
    }
  }

  // Filter agents
  const filteredAgents = agents.filter((agent) => {
    const matchesSearch = 
      agent.name.toLowerCase().includes(search.toLowerCase()) ||
      agent.email?.toLowerCase().includes(search.toLowerCase())
    const matchesType = filterType === 'all' || agent.type === filterType
    return matchesSearch && matchesType
  })

  // Group by type
  const humanAgents = filteredAgents.filter(a => a.type === 'human')
  const aiAgents = filteredAgents.filter(a => a.type === 'ai')

  // Stats
  const stats = {
    total: agents.length,
    humans: agents.filter(a => a.type === 'human').length,
    ais: agents.filter(a => a.type === 'ai').length,
    online: agents.filter(a => a.status === 'online' && a.is_active).length,
    activeChats: agents.reduce((sum, a) => sum + (a.stats?.active_chats || 0), 0),
  }

  return (
    <div className="p-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-500/20 flex items-center justify-center">
              <Users className="w-4 h-4 text-primary-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{stats.total}</p>
              <p className="text-xs text-dark-400">Total</p>
            </div>
          </div>
        </div>

        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <User className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{stats.humans}</p>
              <p className="text-xs text-dark-400">Humanos</p>
            </div>
          </div>
        </div>

        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{stats.ais}</p>
              <p className="text-xs text-dark-400">IAs</p>
            </div>
          </div>
        </div>

        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{stats.online}</p>
              <p className="text-xs text-dark-400">Online</p>
            </div>
          </div>
        </div>

        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/20 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-yellow-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{stats.activeChats}</p>
              <p className="text-xs text-dark-400">Chats Ativos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
          <input
            type="text"
            placeholder="Buscar agentes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-400 focus:outline-none focus:border-primary-500/50"
          />
        </div>

        {/* Type Filter */}
        <div className="flex gap-2">
          {(['all', 'human', 'ai'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                filterType === type
                  ? 'bg-primary-500 text-white'
                  : 'bg-dark-800/50 border border-dark-700/50 text-dark-400 hover:text-white'
              }`}
            >
              {type === 'all' ? 'Todos' : type === 'human' ? 'Humanos' : 'IAs'}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={fetchAgents}
            disabled={loading}
            className="p-2.5 rounded-xl bg-dark-800/50 border border-dark-700/50 text-dark-400 hover:text-white hover:bg-dark-700/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Novo Agente</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {loading && agents.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
        </div>
      ) : filteredAgents.length === 0 ? (
        <EmptyState onCreateClick={() => setShowCreateModal(true)} />
      ) : (
        <div className="space-y-6">
          {/* Human Agents Section */}
          {humanAgents.length > 0 && (filterType === 'all' || filterType === 'human') && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-medium text-white">Agentes Humanos</h3>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs">
                  {humanAgents.length}/3
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {humanAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onToggle={() => handleToggleStatus(agent)}
                    onEdit={() => setSelectedAgent(agent)}
                    onDelete={() => handleDelete(agent.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* AI Agents Section */}
          {aiAgents.length > 0 && (filterType === 'all' || filterType === 'ai') && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Bot className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-medium text-white">Agentes de IA</h3>
                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 text-xs">
                  {aiAgents.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {aiAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onToggle={() => handleToggleStatus(agent)}
                    onEdit={() => setSelectedAgent(agent)}
                    onDelete={() => handleDelete(agent.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && organizationId && (
          <CreateAgentModal
            organizationId={organizationId}
            createType={createType}
            setCreateType={setCreateType}
            onClose={() => {
              setShowCreateModal(false)
              setCreateType(null)
            }}
            onSuccess={() => {
              setShowCreateModal(false)
              setCreateType(null)
              fetchAgents()
            }}
            aiModels={aiModels}
            apiKeys={apiKeys}
            humanAgentsCount={stats.humans}
          />
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {selectedAgent && (
          <EditAgentModal
            agent={selectedAgent}
            onClose={() => setSelectedAgent(null)}
            onSuccess={() => {
              setSelectedAgent(null)
              fetchAgents()
            }}
            aiModels={aiModels}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// Agent Card Component
function AgentCard({
  agent,
  onToggle,
  onEdit,
  onDelete,
}: {
  agent: Agent
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const typeInfo = typeConfig[agent.type]
  const TypeIcon = typeInfo.icon
  const statusInfo = statusConfig[agent.status]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-dark-800/50 border rounded-xl p-4 transition-all group ${
        agent.is_active ? 'border-dark-700/50 hover:border-dark-600' : 'border-dark-800 opacity-60'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`relative w-10 h-10 rounded-xl flex items-center justify-center ${
            agent.is_active ? typeInfo.bgColor : 'bg-dark-700/50'
          }`}>
            <TypeIcon className={`w-5 h-5 ${agent.is_active ? typeInfo.color : 'text-dark-500'}`} />
            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-dark-800 ${statusInfo.color}`} />
          </div>
          <div>
            <h3 className="text-white font-medium text-sm">{agent.name}</h3>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs ${typeInfo.color}`}>{typeInfo.label}</span>
              {agent.type === 'ai' && agent.ai_config && (
                <>
                  <span className="text-dark-600">•</span>
                  <span className="text-xs text-dark-400">{agent.ai_config.model}</span>
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Toggle */}
        <button
          onClick={onToggle}
          className={`p-1.5 rounded-lg transition-colors ${
            agent.is_active
              ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
              : 'bg-dark-700/50 text-dark-400 hover:bg-dark-700'
          }`}
        >
          {agent.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
        </button>
      </div>

      {/* Email for human agents */}
      {agent.type === 'human' && agent.email && (
        <p className="text-xs text-dark-500 mb-3 truncate">{agent.email}</p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center p-1.5 bg-dark-900/50 rounded-lg">
          <p className="text-sm font-semibold text-white">{agent.stats?.active_chats || 0}</p>
          <p className="text-[10px] text-dark-500">Ativos</p>
        </div>
        <div className="text-center p-1.5 bg-dark-900/50 rounded-lg">
          <p className="text-sm font-semibold text-white">{agent.total_conversations || 0}</p>
          <p className="text-[10px] text-dark-500">Total</p>
        </div>
        <div className="text-center p-1.5 bg-dark-900/50 rounded-lg">
          <p className="text-sm font-semibold text-white">
            {agent.avg_response_time_seconds ? `${Math.round(agent.avg_response_time_seconds / 60)}m` : '-'}
          </p>
          <p className="text-[10px] text-dark-500">Resp.</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-dark-700/50">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-dark-700/50 text-dark-300 hover:text-white hover:bg-dark-700 transition-colors text-sm"
        >
          <Settings className="w-3.5 h-3.5" />
          Configurar
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg bg-dark-700/50 text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  )
}

// Empty State Component
function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-dark-400">
      <div className="w-16 h-16 rounded-2xl bg-dark-800/50 flex items-center justify-center mb-4">
        <Bot className="w-8 h-8 opacity-50" />
      </div>
      <p className="text-lg font-medium text-white mb-1">Nenhum agente</p>
      <p className="text-sm text-dark-500 mb-4">Crie seu primeiro agente de IA</p>
      <button
        onClick={onCreateClick}
        className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        Novo Agente
      </button>
    </div>
  )
}

// Create Agent Modal
function CreateAgentModal({
  organizationId,
  createType,
  setCreateType,
  onClose,
  onSuccess,
  aiModels,
  apiKeys,
  humanAgentsCount,
}: {
  organizationId: string
  createType: 'human' | 'ai' | null
  setCreateType: (type: 'human' | 'ai' | null) => void
  onClose: () => void
  onSuccess: () => void
  aiModels: AIModel[]
  apiKeys: { provider: string; is_valid: boolean }[]
  humanAgentsCount: number
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successData, setSuccessData] = useState<{ password?: string; message?: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // Human form
  const [humanForm, setHumanForm] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirmation: '',
    showPassword: false,
    generatePassword: true, // Default to auto-generate
  })

  // Password validation
  const passwordValidation = useMemo(() => validatePassword(humanForm.password), [humanForm.password])
  const passwordsDoMatch = useMemo(
    () => passwordsMatch(humanForm.password, humanForm.passwordConfirmation),
    [humanForm.password, humanForm.passwordConfirmation]
  )

  // AI form
  const [aiForm, setAiForm] = useState({
    name: '',
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.3,
    system_prompt: '',
    greeting_message: '',
    transfer_keywords: 'atendente, humano, pessoa',
  })

  const handleCopyPassword = () => {
    if (successData?.password) {
      navigator.clipboard.writeText(successData.password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleCreateHuman = async () => {
    if (!humanForm.name || !humanForm.email) {
      setError('Preencha todos os campos obrigatórios')
      return
    }

    if (humanAgentsCount >= 3) {
      setError('Limite de 3 agentes humanos atingido')
      return
    }

    // Se não está gerando automaticamente, validar a senha
    if (!humanForm.generatePassword) {
      if (!humanForm.password) {
        setError('Senha é obrigatória')
        return
      }
      
      if (!passwordValidation.isValid) {
        setError('Senha não atende aos requisitos mínimos')
        return
      }

      if (!passwordsDoMatch) {
        setError('As senhas não coincidem')
        return
      }
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/whatsapp/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          type: 'human',
          name: humanForm.name,
          email: humanForm.email,
          password: humanForm.generatePassword ? undefined : humanForm.password,
          force_password_change: true,
        }),
      })

      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar agente')
      }

      // Se a senha foi gerada, mostrar modal de sucesso com a senha
      if (data.password_generated && data.temporary_password) {
        setSuccessData({
          password: data.temporary_password,
          message: 'Agente criado com sucesso! Copie a senha temporária abaixo:',
        })
      } else {
        onSuccess()
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateAI = async () => {
    if (!aiForm.name || !aiForm.model) {
      setError('Preencha todos os campos obrigatórios')
      return
    }

    const hasApiKey = apiKeys.some(k => k.provider === aiForm.provider && k.is_valid)
    if (!hasApiKey) {
      setError(`Configure sua API key do ${aiForm.provider} em Configurações → API Keys`)
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/whatsapp/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          type: 'ai',
          name: aiForm.name,
          ai_config: {
            provider: aiForm.provider,
            model: aiForm.model,
            temperature: aiForm.temperature,
            max_tokens: 500,
            system_prompt: aiForm.system_prompt,
            greeting_message: aiForm.greeting_message,
            transfer_keywords: aiForm.transfer_keywords.split(',').map(k => k.trim()),
            transfer_to_queue: true,
          },
        }),
      })

      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao criar agente')
      }

      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Group models by provider
  const modelsByProvider = aiModels.reduce((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = []
    acc[model.provider].push(model)
    return acc
  }, {} as Record<string, AIModel[]>)

  // Se temos dados de sucesso com senha temporária, mostrar tela de sucesso
  if (successData) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onSuccess}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-dark-800 rounded-2xl w-full max-w-md border border-dark-700/50 overflow-hidden"
        >
          <div className="p-6">
            {/* Success Icon */}
            <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>

            <h2 className="text-xl font-semibold text-white text-center mb-2">
              Agente Criado!
            </h2>
            <p className="text-dark-400 text-center text-sm mb-6">
              {successData.message}
            </p>

            {/* Password Display */}
            <div className="bg-dark-900/50 border border-dark-700/50 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-dark-400">Senha Temporária</span>
                <button
                  onClick={handleCopyPassword}
                  className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copiar
                    </>
                  )}
                </button>
              </div>
              <code className="block text-lg font-mono text-white bg-dark-800 rounded-lg p-3 text-center select-all">
                {successData.password}
              </code>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 mb-6">
              <div className="flex gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-yellow-200">
                  <strong>Importante:</strong> Anote esta senha agora. Ela não será mostrada novamente.
                  O agente será solicitado a trocar a senha no primeiro acesso.
                </div>
              </div>
            </div>

            <button
              onClick={onSuccess}
              className="w-full py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
            >
              Entendi, fechar
            </button>
          </div>
        </motion.div>
      </motion.div>
    )
  }

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
        className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <div className="flex items-center gap-3">
            {createType && (
              <button
                onClick={() => setCreateType(null)}
                className="p-1 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-white">
              {!createType ? 'Novo Agente' : createType === 'human' ? 'Agente Humano' : 'Agente de IA'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto max-h-[calc(90vh-130px)]">
          {!createType ? (
            // Type Selection
            <div className="space-y-3">
              <p className="text-dark-400 text-sm mb-4">
                Escolha o tipo de agente:
              </p>

              {/* Human */}
              <button
                onClick={() => setCreateType('human')}
                disabled={humanAgentsCount >= 3}
                className={`w-full p-4 rounded-xl border transition-all text-left ${
                  humanAgentsCount >= 3
                    ? 'border-dark-700/50 bg-dark-800/50 opacity-50 cursor-not-allowed'
                    : 'border-dark-700/50 hover:border-blue-500/50 hover:bg-blue-500/5'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <User className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-white">Agente Humano</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        humanAgentsCount >= 3 ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {humanAgentsCount}/3
                      </span>
                    </div>
                    <p className="text-sm text-dark-400 mt-1">Atendente com login próprio</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-dark-500" />
                </div>
              </button>

              {/* AI */}
              <button
                onClick={() => setCreateType('ai')}
                className="w-full p-4 rounded-xl border border-dark-700/50 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-white">Agente de IA</h3>
                    <p className="text-sm text-dark-400 mt-1">Respostas automáticas 24/7</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-dark-500" />
                </div>
              </button>
            </div>
          ) : createType === 'human' ? (
            // Human Form
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Nome *</label>
                <input
                  type="text"
                  value={humanForm.name}
                  onChange={(e) => setHumanForm({ ...humanForm, name: e.target.value })}
                  placeholder="Ex: João Silva"
                  className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Email (login) *</label>
                <input
                  type="email"
                  value={humanForm.email}
                  onChange={(e) => setHumanForm({ ...humanForm, email: e.target.value })}
                  placeholder="joao@empresa.com"
                  className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50"
                />
              </div>

              {/* Password Options */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-dark-300">Senha</label>
                
                {/* Toggle: Generate or Custom */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setHumanForm({ ...humanForm, generatePassword: true, password: '', passwordConfirmation: '' })}
                    className={`flex-1 py-2 px-3 rounded-xl text-sm transition-all ${
                      humanForm.generatePassword
                        ? 'bg-primary-500/20 border-primary-500 text-primary-400 border'
                        : 'bg-dark-900/50 border-dark-700/50 text-dark-400 border hover:border-dark-600'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 inline mr-1.5" />
                    Gerar Automaticamente
                  </button>
                  <button
                    type="button"
                    onClick={() => setHumanForm({ ...humanForm, generatePassword: false })}
                    className={`flex-1 py-2 px-3 rounded-xl text-sm transition-all ${
                      !humanForm.generatePassword
                        ? 'bg-primary-500/20 border-primary-500 text-primary-400 border'
                        : 'bg-dark-900/50 border-dark-700/50 text-dark-400 border hover:border-dark-600'
                    }`}
                  >
                    <Key className="w-3.5 h-3.5 inline mr-1.5" />
                    Definir Manualmente
                  </button>
                </div>

                {humanForm.generatePassword ? (
                  <div className="bg-dark-900/30 border border-dark-700/30 rounded-xl p-3">
                    <div className="flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-primary-400 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-dark-400">
                        Uma senha forte será gerada automaticamente e exibida após a criação.
                        O agente será solicitado a trocar a senha no primeiro acesso.
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Password Input */}
                    <div>
                      <div className="relative">
                        <input
                          type={humanForm.showPassword ? 'text' : 'password'}
                          value={humanForm.password}
                          onChange={(e) => setHumanForm({ ...humanForm, password: e.target.value })}
                          placeholder="Digite a senha"
                          className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setHumanForm({ ...humanForm, showPassword: !humanForm.showPassword })}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"
                        >
                          {humanForm.showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      
                      {/* Password Strength Indicator */}
                      <PasswordStrengthIndicator password={humanForm.password} showRules={true} />
                    </div>

                    {/* Confirm Password */}
                    {humanForm.password && passwordValidation.isValid && (
                      <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">Confirmar Senha *</label>
                        <div className="relative">
                          <input
                            type={humanForm.showPassword ? 'text' : 'password'}
                            value={humanForm.passwordConfirmation}
                            onChange={(e) => setHumanForm({ ...humanForm, passwordConfirmation: e.target.value })}
                            placeholder="Repita a senha"
                            className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50"
                          />
                        </div>
                        <PasswordMatchIndicator 
                          password={humanForm.password} 
                          confirmation={humanForm.passwordConfirmation} 
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleCreateHuman}
                disabled={loading || !humanForm.name || !humanForm.email || (!humanForm.generatePassword && (!passwordValidation.isValid || !passwordsDoMatch))}
                className="w-full py-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-dark-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Criar Agente Humano
              </button>
            </div>
          ) : (
            // AI Form
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Nome *</label>
                <input
                  type="text"
                  value={aiForm.name}
                  onChange={(e) => setAiForm({ ...aiForm, name: e.target.value })}
                  placeholder="Ex: Bia - Assistente"
                  className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Provider</label>
                <div className="grid grid-cols-4 gap-2">
                  {['openai', 'anthropic', 'google', 'groq'].map((provider) => {
                    const hasKey = apiKeys.some(k => k.provider === provider && k.is_valid)
                    return (
                      <button
                        key={provider}
                        onClick={() => setAiForm({ ...aiForm, provider, model: '' })}
                        className={`p-2 rounded-xl border transition-all relative text-xs ${
                          aiForm.provider === provider
                            ? 'border-primary-500 bg-primary-500/10'
                            : 'border-dark-700/50 hover:border-dark-600'
                        }`}
                      >
                        <span className="text-white capitalize">{provider}</span>
                        {hasKey ? (
                          <CheckCircle className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-green-400" />
                        ) : (
                          <AlertCircle className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-yellow-400" />
                        )}
                      </button>
                    )
                  })}
                </div>
                {!apiKeys.some(k => k.provider === aiForm.provider && k.is_valid) && (
                  <p className="text-xs text-yellow-400 mt-1.5">
                    ⚠️ Configure API key em Configurações → API Keys
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Modelo</label>
                <select
                  value={aiForm.model}
                  onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
                  className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white focus:outline-none focus:border-primary-500/50"
                >
                  <option value="">Selecione</option>
                  {(modelsByProvider[aiForm.provider] || []).map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Temperatura: {aiForm.temperature}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={aiForm.temperature}
                  onChange={(e) => setAiForm({ ...aiForm, temperature: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Instruções</label>
                <textarea
                  value={aiForm.system_prompt}
                  onChange={(e) => setAiForm({ ...aiForm, system_prompt: e.target.value })}
                  placeholder="Você é um assistente prestativo..."
                  rows={3}
                  className="w-full px-4 py-2.5 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500/50 resize-none"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={handleCreateAI}
                disabled={loading || !aiForm.name || !aiForm.model}
                className="w-full py-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-dark-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                Criar Agente de IA
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// Edit Agent Modal
function EditAgentModal({
  agent,
  onClose,
  onSuccess,
  aiModels,
}: {
  agent: Agent
  onClose: () => void
  onSuccess: () => void
  aiModels: AIModel[]
}) {
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
        className="bg-dark-800 border border-dark-700 rounded-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-dark-700">
          <h2 className="text-lg font-semibold text-white">Configurar {agent.name}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          <div className="text-center py-6">
            <p className="text-dark-400">Configuração avançada em breve...</p>
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-dark-700">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
