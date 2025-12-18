'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  RefreshCw,
  Bot,
  MoreHorizontal,
  Power,
  PowerOff,
  Settings,
  Trash2,
  Copy,
  MessageSquare,
  Users,
  Clock,
  TrendingUp,
  Loader2,
  Zap,
  Brain,
  Sparkles,
  Edit,
  X,
  Check,
} from 'lucide-react'
import { useAuthStore } from '@/stores'

interface Agent {
  id: string
  name: string
  description?: string
  type: 'sales' | 'support' | 'custom'
  status: 'active' | 'inactive' | 'paused'
  model: string
  temperature: number
  system_prompt?: string
  conversations_count: number
  messages_count: number
  avg_response_time?: number
  satisfaction_score?: number
  created_at: string
  updated_at: string
}

const typeConfig: Record<string, { label: string; color: string; icon: any }> = {
  sales: { label: 'Vendas', color: 'text-green-400', icon: TrendingUp },
  support: { label: 'Suporte', color: 'text-blue-400', icon: MessageSquare },
  custom: { label: 'Personalizado', color: 'text-purple-400', icon: Sparkles },
}

export default function AgentsTab() {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id

  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [search, setSearch] = useState('')

  const fetchAgents = async () => {
    if (!organizationId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/whatsapp/agents?organization_id=${organizationId}`)
      const data = await res.json()
      setAgents(data.agents || [])
    } catch (error) {
      console.error('Error fetching agents:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAgents()
  }, [organizationId])

  const handleToggleStatus = async (agent: Agent) => {
    try {
      const newStatus = agent.status === 'active' ? 'inactive' : 'active'
      await fetch(`/api/whatsapp/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      fetchAgents()
    } catch (error) {
      console.error('Error toggling agent status:', error)
    }
  }

  const handleDelete = async (agentId: string) => {
    if (!confirm('Tem certeza que deseja excluir este agente?')) return
    try {
      await fetch(`/api/whatsapp/agents/${agentId}`, { method: 'DELETE' })
      fetchAgents()
    } catch (error) {
      console.error('Error deleting agent:', error)
    }
  }

  const filteredAgents = agents.filter(
    (agent) =>
      agent.name.toLowerCase().includes(search.toLowerCase()) ||
      agent.description?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6">
      {/* Header Actions */}
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

      {/* Agents Grid */}
      {loading && agents.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-dark-400">
          <div className="w-16 h-16 rounded-2xl bg-dark-800/50 flex items-center justify-center mb-4">
            <Bot className="w-8 h-8 opacity-50" />
          </div>
          <p className="text-lg font-medium text-white mb-1">Nenhum agente</p>
          <p className="text-sm text-dark-500 mb-4">Crie seu primeiro agente de IA</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Agente
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAgents.map((agent) => {
            const typeInfo = typeConfig[agent.type] || typeConfig.custom
            const TypeIcon = typeInfo.icon

            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-5 hover:border-dark-600 transition-all group"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      agent.status === 'active' 
                        ? 'bg-gradient-to-br from-primary-500/20 to-accent-500/20' 
                        : 'bg-dark-700/50'
                    }`}>
                      <Bot className={`w-6 h-6 ${agent.status === 'active' ? 'text-primary-400' : 'text-dark-500'}`} />
                    </div>
                    <div>
                      <h3 className="text-white font-medium">{agent.name}</h3>
                      <div className="flex items-center gap-2">
                        <TypeIcon className={`w-3.5 h-3.5 ${typeInfo.color}`} />
                        <span className={`text-xs ${typeInfo.color}`}>{typeInfo.label}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Status Toggle */}
                  <button
                    onClick={() => handleToggleStatus(agent)}
                    className={`p-2 rounded-lg transition-colors ${
                      agent.status === 'active'
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        : 'bg-dark-700/50 text-dark-400 hover:bg-dark-700'
                    }`}
                    title={agent.status === 'active' ? 'Desativar' : 'Ativar'}
                  >
                    {agent.status === 'active' ? (
                      <Power className="w-4 h-4" />
                    ) : (
                      <PowerOff className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Description */}
                {agent.description && (
                  <p className="text-sm text-dark-400 mb-4 line-clamp-2">{agent.description}</p>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center p-2 bg-dark-900/50 rounded-lg">
                    <p className="text-lg font-semibold text-white">{agent.conversations_count}</p>
                    <p className="text-xs text-dark-500">Conversas</p>
                  </div>
                  <div className="text-center p-2 bg-dark-900/50 rounded-lg">
                    <p className="text-lg font-semibold text-white">{agent.messages_count}</p>
                    <p className="text-xs text-dark-500">Mensagens</p>
                  </div>
                  <div className="text-center p-2 bg-dark-900/50 rounded-lg">
                    <p className="text-lg font-semibold text-white">
                      {agent.satisfaction_score ? `${agent.satisfaction_score}%` : '-'}
                    </p>
                    <p className="text-xs text-dark-500">Satisfação</p>
                  </div>
                </div>

                {/* Model Info */}
                <div className="flex items-center justify-between text-xs text-dark-500 mb-4">
                  <span className="flex items-center gap-1">
                    <Brain className="w-3.5 h-3.5" />
                    {agent.model}
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" />
                    Temp: {agent.temperature}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-dark-700/50">
                  <button
                    onClick={() => setSelectedAgent(agent)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-dark-700/50 text-dark-300 hover:text-white hover:bg-dark-700 transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    Configurar
                  </button>
                  <button
                    onClick={() => handleDelete(agent.id)}
                    className="p-2 rounded-lg bg-dark-700/50 text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Create Modal - Placeholder */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-dark-800 border border-dark-700 rounded-2xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">Novo Agente</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-2xl bg-dark-700/50 flex items-center justify-center mx-auto mb-4">
                  <Bot className="w-8 h-8 text-primary-400" />
                </div>
                <p className="text-dark-400 mb-2">Em breve</p>
                <p className="text-sm text-dark-500">
                  A criação de agentes personalizados estará disponível em breve.
                </p>
              </div>

              <button
                onClick={() => setShowCreateModal(false)}
                className="w-full py-3 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
              >
                Fechar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
