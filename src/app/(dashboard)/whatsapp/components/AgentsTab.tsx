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
import { CreateAgentWizard } from '@/components/agents/CreateAgentWizard'
import { EditAgentModal } from '@/components/agents/EditAgentModal'

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

  // ✅ PROTEÇÃO: Garantir que agents é array
  const safeAgents = Array.isArray(agents) ? agents : []

  // Filter agents
  const filteredAgents = safeAgents.filter((agent) => {
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
    total: safeAgents.length,
    humans: safeAgents.filter(a => a.type === 'human').length,
    ais: safeAgents.filter(a => a.type === 'ai').length,
    online: safeAgents.filter(a => a.status === 'online' && a.is_active).length,
    activeChats: safeAgents.reduce((sum, a) => sum + (a.stats?.active_chats || 0), 0),
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
          <CreateAgentWizard
            organizationId={organizationId}
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => {
              setShowCreateModal(false)
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
        {selectedAgent && organizationId && (
          <EditAgentModal
            agent={selectedAgent}
            organizationId={organizationId}
            onClose={() => setSelectedAgent(null)}
            onUpdate={() => {
              fetchAgents()
            }}
            onDelete={() => {
              setSelectedAgent(null)
              fetchAgents()
            }}
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
