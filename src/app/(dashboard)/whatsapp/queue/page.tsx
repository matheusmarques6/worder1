// =============================================
// Page: Queue Management
// /whatsapp/queue
// Gerencia fila de atendimento
// =============================================

'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  Clock,
  RefreshCw,
  Settings,
  Phone,
  MessageSquare,
  User,
  Play,
  Pause,
  UserPlus,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Coffee,
  Zap,
} from 'lucide-react'
import { useQueue, QueueItem, QueueAgent } from '@/hooks/useQueue'
import { useAgentStatus } from '@/hooks/useAgentStatus'
import { useAuthStore } from '@/stores'

// =============================================
// HELPERS
// =============================================

const formatWaitTime = (seconds?: number) => {
  if (!seconds) return '-'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`
}

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    online: 'bg-success-500',
    busy: 'bg-amber-500',
    away: 'bg-purple-500',
    offline: 'bg-dark-500',
  }
  return colors[status] || colors.offline
}

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    online: 'Online',
    busy: 'Ocupado',
    away: 'Ausente',
    offline: 'Offline',
  }
  return labels[status] || status
}

// =============================================
// QUEUE ITEM CARD
// =============================================

interface QueueItemCardProps {
  item: QueueItem
  agents: QueueAgent[]
  onAssign: (itemId: string, agentId: string, agentName?: string) => Promise<boolean>
}

function QueueItemCard({ item, agents, onAssign }: QueueItemCardProps) {
  const [assigning, setAssigning] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState('')

  const handleAssign = async () => {
    if (!selectedAgent) return
    setAssigning(true)
    const agent = agents.find(a => a.user_id === selectedAgent)
    await onAssign(item.id, selectedAgent, agent?.profile?.full_name)
    setAssigning(false)
    setSelectedAgent('')
  }

  const waitSeconds = Math.floor((Date.now() - new Date(item.entered_at).getTime()) / 1000)
  const availableAgents = agents.filter(
    a => a.status === 'online' && !a.on_break && a.current_conversations < a.max_conversations
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-500/10 rounded-full flex items-center justify-center">
            <User className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h4 className="font-medium text-white">
              {item.contact_name || item.contact_phone || 'Contato'}
            </h4>
            {item.last_message_preview && (
              <p className="text-sm text-dark-400 line-clamp-1">
                {item.last_message_preview}
              </p>
            )}
            <div className="flex items-center gap-3 mt-1 text-xs text-dark-500">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Esperando há {formatWaitTime(waitSeconds)}
              </span>
              {item.priority > 0 && (
                <span className="text-amber-400">Prioridade: {item.priority}</span>
              )}
            </div>
          </div>
        </div>

        {/* Assign */}
        <div className="flex items-center gap-2">
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm text-white"
          >
            <option value="">Selecionar agente</option>
            {availableAgents.map((agent) => (
              <option key={agent.user_id} value={agent.user_id}>
                {agent.profile?.full_name || 'Agente'} ({agent.current_conversations}/{agent.max_conversations})
              </option>
            ))}
          </select>
          <button
            onClick={handleAssign}
            disabled={!selectedAgent || assigning}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 
                       disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {assigning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <UserPlus className="w-4 h-4" />
            )}
            Atribuir
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// =============================================
// AGENT CARD
// =============================================

interface AgentCardProps {
  agent: QueueAgent
}

function AgentCard({ agent }: AgentCardProps) {
  const utilizationPercent = Math.round((agent.current_conversations / agent.max_conversations) * 100)

  return (
    <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="relative">
          <div className="w-10 h-10 bg-dark-700 rounded-full flex items-center justify-center">
            {agent.profile?.avatar_url ? (
              <img
                src={agent.profile.avatar_url}
                alt=""
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <User className="w-5 h-5 text-dark-400" />
            )}
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-dark-800 ${getStatusColor(agent.status)}`} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-white truncate">
              {agent.profile?.full_name || 'Agente'}
            </h4>
            {agent.on_break && (
              <span className="flex items-center gap-1 text-xs text-amber-400">
                <Coffee className="w-3 h-3" />
                Pausa
              </span>
            )}
          </div>
          <p className="text-xs text-dark-500">{getStatusLabel(agent.status)}</p>
        </div>

        {/* Stats */}
        <div className="text-right">
          <p className="text-lg font-bold text-white">
            {agent.current_conversations}/{agent.max_conversations}
          </p>
          <p className="text-xs text-dark-500">conversas</p>
        </div>
      </div>

      {/* Utilization Bar */}
      <div className="mt-3">
        <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              utilizationPercent >= 90 ? 'bg-error-500' :
              utilizationPercent >= 70 ? 'bg-amber-500' :
              'bg-success-500'
            }`}
            style={{ width: `${utilizationPercent}%` }}
          />
        </div>
      </div>

      {/* Today's Stats */}
      <div className="flex items-center justify-between mt-3 text-xs text-dark-500">
        <span>{agent.assignments_today || 0} atribuídas hoje</span>
        <span>{agent.completed_today || 0} finalizadas</span>
      </div>
    </div>
  )
}

// =============================================
// MAIN PAGE
// =============================================

export default function QueuePage() {
  const { user } = useAuthStore()
  
  // Obter organization_id do usuário
  const organizationId = user?.organization_id || user?.user_metadata?.organization_id || ''

  const {
    items,
    agents,
    settings,
    stats,
    agentMetrics,
    isLoading,
    loadQueue,
    loadAgents,
    assignConversation,
    triggerAutoAssign,
  } = useQueue({
    organizationId,
    autoLoad: true,
    refreshInterval: 10000, // 10 segundos
  })

  const {
    status: myStatus,
    goOnline,
    goOffline,
    toggleBreak,
  } = useAgentStatus({
    organizationId,
    userId: user?.id || '',
    autoLoad: true,
  })

  const [autoAssigning, setAutoAssigning] = useState(false)

  // =============================================
  // HANDLERS
  // =============================================

  const handleAutoAssign = async () => {
    setAutoAssigning(true)
    await triggerAutoAssign()
    setAutoAssigning(false)
  }

  const handleRefresh = () => {
    loadQueue()
    loadAgents()
  }

  const handleToggleStatus = async () => {
    if (myStatus?.status === 'online') {
      await goOffline()
    } else {
      await goOnline()
    }
  }

  // =============================================
  // RENDER
  // =============================================

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Fila de Atendimento</h1>
          <p className="text-dark-400 mt-1">
            Gerencie a distribuição de conversas entre atendentes
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Meu Status */}
          <button
            onClick={handleToggleStatus}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors ${
              myStatus?.status === 'online'
                ? 'bg-success-500/20 text-success-400 hover:bg-success-500/30'
                : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
            }`}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${
              myStatus?.status === 'online' ? 'bg-success-500' : 'bg-dark-500'
            }`} />
            {myStatus?.status === 'online' ? 'Online' : 'Offline'}
          </button>

          {myStatus?.status === 'online' && (
            <button
              onClick={() => toggleBreak()}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors ${
                myStatus?.on_break
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
              }`}
            >
              <Coffee className="w-4 h-4" />
              {myStatus?.on_break ? 'Voltar' : 'Pausa'}
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-dark-700 text-white rounded-xl hover:bg-dark-600"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-400">{stats?.waiting_count || 0}</p>
              <p className="text-xs text-dark-400">Na fila</p>
            </div>
          </div>
        </div>

        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-success-500/10 rounded-lg">
              <Users className="w-5 h-5 text-success-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-success-400">{agentMetrics?.online || 0}</p>
              <p className="text-xs text-dark-400">Agentes online</p>
            </div>
          </div>
        </div>

        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-500/10 rounded-lg">
              <MessageSquare className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{agentMetrics?.total_conversations || 0}</p>
              <p className="text-xs text-dark-400">Conversas ativas</p>
            </div>
          </div>
        </div>

        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{agentMetrics?.available_capacity || 0}</p>
              <p className="text-xs text-dark-400">Capacidade livre</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Queue Items */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Aguardando Atendimento ({items.length})
            </h2>
            <button
              onClick={handleAutoAssign}
              disabled={autoAssigning || items.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl 
                         hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {autoAssigning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Distribuir
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 bg-dark-800/30 rounded-xl border border-dark-700/50">
              <CheckCircle className="w-12 h-12 text-success-400 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-white mb-1">Fila vazia!</h3>
              <p className="text-dark-400">Todas as conversas foram atendidas</p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <QueueItemCard
                    key={item.id}
                    item={item}
                    agents={agents}
                    onAssign={assignConversation}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Agents */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">
            Atendentes ({agentMetrics?.total || 0})
          </h2>

          <div className="space-y-3">
            {agents.length === 0 ? (
              <div className="text-center py-8 bg-dark-800/30 rounded-xl border border-dark-700/50">
                <Users className="w-10 h-10 text-dark-600 mx-auto mb-2" />
                <p className="text-dark-400 text-sm">Nenhum atendente</p>
              </div>
            ) : (
              agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
