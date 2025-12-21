'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bot,
  Plus,
  Search,
  Power,
  PowerOff,
  Trash2,
  Settings,
  MessageSquare,
  Zap,
  Database,
  MoreVertical,
  Loader2,
  AlertCircle,
  Sparkles,
  TrendingUp,
  Clock,
  Filter,
  ChevronDown,
} from 'lucide-react'
import AIAgentEditor from './AIAgentEditor'
import CreateAgentModal from './CreateAgentModal'

interface AIAgent {
  id: string
  organization_id: string
  name: string
  description?: string
  provider: string
  model: string
  is_active: boolean
  total_messages: number
  total_conversations: number
  total_tokens_used: number
  created_at: string
  updated_at: string
  persona?: {
    tone?: string
    language?: string
  }
}

interface AIAgentListProps {
  organizationId: string
}

export default function AIAgentList({ organizationId }: AIAgentListProps) {
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  // Fetch agents
  useEffect(() => {
    fetchAgents()
  }, [organizationId])

  const fetchAgents = async () => {
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/ai/agents?organization_id=${organizationId}`)
      if (!res.ok) throw new Error('Erro ao carregar agentes')
      
      const data = await res.json()
      setAgents(data.agents || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Toggle agent active status
  const handleToggleActive = async (agent: AIAgent, e: React.MouseEvent) => {
    e.stopPropagation()
    
    try {
      const res = await fetch(`/api/ai/agents/${agent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          is_active: !agent.is_active,
        }),
      })

      if (res.ok) {
        setAgents(agents.map(a => 
          a.id === agent.id ? { ...a, is_active: !a.is_active } : a
        ))
      }
    } catch (err) {
      console.error('Error toggling agent:', err)
    }
  }

  // Delete agent
  const handleDelete = async (agentId: string) => {
    if (!confirm('Tem certeza que deseja excluir este agente? Esta ação não pode ser desfeita.')) return

    try {
      const res = await fetch(`/api/ai/agents/${agentId}?organization_id=${organizationId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setAgents(agents.filter(a => a.id !== agentId))
        setMenuOpenId(null)
      }
    } catch (err) {
      console.error('Error deleting agent:', err)
    }
  }

  // Filter agents
  const filteredAgents = agents.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         agent.description?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterStatus === 'all' || 
                         (filterStatus === 'active' && agent.is_active) ||
                         (filterStatus === 'inactive' && !agent.is_active)
    return matchesSearch && matchesFilter
  })

  // Stats
  const activeAgents = agents.filter(a => a.is_active).length
  const totalMessages = agents.reduce((sum, a) => sum + (a.total_messages || 0), 0)
  const totalConversations = agents.reduce((sum, a) => sum + (a.total_conversations || 0), 0)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-dark-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Agentes de IA</h2>
            <p className="text-sm text-dark-400">Gerencie seus assistentes inteligentes</p>
          </div>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 text-white rounded-xl font-medium transition-all"
        >
          <Plus className="w-4 h-4" />
          Novo Agente
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 p-4 border-b border-dark-700">
        <div className="bg-dark-800/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-dark-400 mb-1">
            <Bot className="w-4 h-4" />
            <span className="text-xs">Total de Agentes</span>
          </div>
          <p className="text-2xl font-bold text-white">{agents.length}</p>
        </div>
        <div className="bg-dark-800/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-400 mb-1">
            <Power className="w-4 h-4" />
            <span className="text-xs">Ativos</span>
          </div>
          <p className="text-2xl font-bold text-white">{activeAgents}</p>
        </div>
        <div className="bg-dark-800/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-400 mb-1">
            <MessageSquare className="w-4 h-4" />
            <span className="text-xs">Mensagens</span>
          </div>
          <p className="text-2xl font-bold text-white">{totalMessages.toLocaleString()}</p>
        </div>
        <div className="bg-dark-800/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-purple-400 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs">Conversas</span>
          </div>
          <p className="text-2xl font-bold text-white">{totalConversations.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 p-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar agentes..."
            className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white placeholder:text-dark-500 focus:outline-none focus:border-primary-500/50"
          />
        </div>

        {/* Status Filter */}
        <div className="relative">
          <button
            onClick={() => {
              const next = filterStatus === 'all' ? 'active' : filterStatus === 'active' ? 'inactive' : 'all'
              setFilterStatus(next)
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-dark-300 hover:text-white transition-colors"
          >
            <Filter className="w-4 h-4" />
            <span className="text-sm">
              {filterStatus === 'all' ? 'Todos' : filterStatus === 'active' ? 'Ativos' : 'Inativos'}
            </span>
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
            <p className="text-white mb-2">Erro ao carregar agentes</p>
            <p className="text-sm text-dark-400 mb-4">{error}</p>
            <button
              onClick={fetchAgents}
              className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-xl"
            >
              Tentar novamente
            </button>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500/10 to-accent-500/10 flex items-center justify-center mb-4">
              <Sparkles className="w-10 h-10 text-primary-400" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              {searchQuery || filterStatus !== 'all' ? 'Nenhum agente encontrado' : 'Crie seu primeiro agente'}
            </h3>
            <p className="text-sm text-dark-400 text-center max-w-md mb-6">
              {searchQuery || filterStatus !== 'all'
                ? 'Tente ajustar os filtros de busca.'
                : 'Agentes de IA podem responder automaticamente às mensagens dos seus clientes, 24 horas por dia.'}
            </p>
            {!searchQuery && filterStatus === 'all' && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 text-white rounded-xl font-medium transition-all"
              >
                <Plus className="w-5 h-5" />
                Criar Agente
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredAgents.map((agent) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.01 }}
                onClick={() => setSelectedAgentId(agent.id)}
                className={`bg-dark-800/50 border rounded-xl p-4 cursor-pointer transition-all ${
                  agent.is_active 
                    ? 'border-dark-700/50 hover:border-primary-500/30' 
                    : 'border-dark-800 opacity-70 hover:opacity-100'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    agent.is_active 
                      ? 'bg-gradient-to-br from-primary-500/20 to-accent-500/20' 
                      : 'bg-dark-700'
                  }`}>
                    <Bot className={`w-6 h-6 ${agent.is_active ? 'text-primary-400' : 'text-dark-500'}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-white font-medium truncate">{agent.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        agent.is_active 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-dark-700 text-dark-500'
                      }`}>
                        {agent.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    
                    {agent.description && (
                      <p className="text-sm text-dark-400 truncate mb-2">{agent.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-dark-500">
                      <span className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        {agent.provider} • {agent.model}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {agent.total_messages || 0} msgs
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(agent.updated_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleToggleActive(agent, e)}
                      className={`p-2 rounded-lg transition-colors ${
                        agent.is_active
                          ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                          : 'bg-dark-700 text-dark-500 hover:text-white'
                      }`}
                      title={agent.is_active ? 'Desativar' : 'Ativar'}
                    >
                      {agent.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                    </button>

                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpenId(menuOpenId === agent.id ? null : agent.id)
                        }}
                        className="p-2 rounded-lg bg-dark-700/50 text-dark-400 hover:text-white transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      <AnimatePresence>
                        {menuOpenId === agent.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute right-0 top-full mt-1 bg-dark-800 border border-dark-700 rounded-xl shadow-xl overflow-hidden z-10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                setSelectedAgentId(agent.id)
                                setMenuOpenId(null)
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-dark-300 hover:text-white hover:bg-dark-700 transition-colors"
                            >
                              <Settings className="w-4 h-4" />
                              Configurar
                            </button>
                            <button
                              onClick={() => handleDelete(agent.id)}
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              Excluir
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Agent Editor Drawer */}
      <AnimatePresence>
        {selectedAgentId && (
          <AIAgentEditor
            agentId={selectedAgentId}
            organizationId={organizationId}
            onClose={() => setSelectedAgentId(null)}
            onUpdate={fetchAgents}
            onDelete={fetchAgents}
          />
        )}
      </AnimatePresence>

      {/* Create Agent Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateAgentModal
            organizationId={organizationId}
            onClose={() => setShowCreateModal(false)}
            onCreate={(newAgentId) => {
              setShowCreateModal(false)
              setSelectedAgentId(newAgentId)
              fetchAgents()
            }}
          />
        )}
      </AnimatePresence>

      {/* Click outside to close menu */}
      {menuOpenId && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setMenuOpenId(null)}
        />
      )}
    </div>
  )
}
